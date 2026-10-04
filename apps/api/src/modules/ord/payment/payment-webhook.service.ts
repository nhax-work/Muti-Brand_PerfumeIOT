/**
 * Webhook kết quả thanh toán (FR-ORD-12..16, FR-SLT-38) — cửa vào DUY NHẤT của tiền.
 *
 * Thứ tự xử lý, mỗi bước chặn một loại lỗi có thật:
 *
 *   1. Kiểm chữ ký trên đúng byte nhận được (FR-ORD-13). Sai → ghi `payment_events` với khóa
 *      `rejected:<uuid>` để rà soát, trả 401. Không dùng eventId trong body chưa được tin.
 *   2. Trong MỘT transaction:
 *      a. Tra payment theo mã tham chiếu và khóa nó (FOR UPDATE).
 *      b. Chiếm `payment_events (provider, provider_event_id)` bằng ON CONFLICT DO NOTHING — webhook
 *         trùng, kể cả tới song song, dừng ở đây và nhận 200 WEBHOOK_ALREADY_PROCESSED (FR-ORD-15).
 *      c. Đối chiếu số tiền, loại tiền với `payments.amount` (FR-ORD-14).
 *      d. Chia nhánh theo đích của payment: đơn kiosk → `OrdService.settleOrderPayment`; phiên thuê
 *         slot → `RentalCheckoutPaymentHandler` của SLT (ADR-0008).
 *      e. Cập nhật payment, đóng sự kiện, ghi AuditLog (FR-AUD-06).
 *   Lỗi giữa chừng → rollback cả bản ghi chống trùng → cổng gửi lại sau và được xử lý lại từ đầu.
 *
 * Idempotency là ràng buộc CSDL (uq_payment_event), không phải một câu SELECT "đã có chưa" — test
 * chứng minh điều đó thuộc nhóm người tự viết (spec/testing.md), không nằm trong mã này.
 */

import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Transaction } from 'kysely';
import type { DB } from '../../../shared/db/index.js';
import { AuditService } from '../../../shared/audit/index.js';
import { CLOCK, type Clock } from '../../../shared/clock.js';
import { AppError } from '../../../shared/errors/index.js';
import { OrdService } from '../ord.service.js';
import { sameAmount } from './money.js';
import {
  PAYMENT_GATEWAYS,
  type PaymentGatewayRegistry,
  type VerifiedPaymentEvent,
  type WebhookHeaders,
} from './payment-gateway.js';
import { PaymentQueries, type PaymentRecord } from './payment.queries.js';
import {
  RENTAL_CHECKOUT_PAYMENT_HANDLER,
  type RentalCheckoutPaymentHandler,
} from './rental-checkout-payment.port.js';

export type WebhookResult = 'PROCESSED' | 'WEBHOOK_ALREADY_PROCESSED';

/** Payment ở các trạng thái này mà nhận tin thành công thì có thể là tiền thật đã về. */
const SETTLEABLE = new Set(['PENDING', 'FAILED', 'EXPIRED'] as const);

type Settled =
  | { readonly kind: 'PROCESSED' }
  | { readonly kind: 'DUPLICATE' }
  | { readonly kind: 'UNKNOWN_REFERENCE' }
  | { readonly kind: 'AMOUNT_MISMATCH' };

@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger('PaymentWebhook');

  constructor(
    @Inject(PaymentQueries) private readonly queries: PaymentQueries,
    @Inject(OrdService) private readonly orders: OrdService,
    @Inject(PAYMENT_GATEWAYS) private readonly gateways: PaymentGatewayRegistry,
    @Inject(RENTAL_CHECKOUT_PAYMENT_HANDLER)
    private readonly checkouts: RentalCheckoutPaymentHandler,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async handle(provider: string, rawBody: Buffer, headers: WebhookHeaders): Promise<WebhookResult> {
    const gateway = this.gateways.get(provider);
    if (!gateway) throw new AppError('NOT_FOUND', 'ord.paymentProviderUnknown');

    const now = this.clock.now();
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    const verification = gateway.verifyWebhook(rawBody, headers);

    if (verification.kind === 'MALFORMED') {
      // FR-ORD-12 AC2: 400 + log cảnh báo.
      this.logger.warn(`Webhook ${provider} không đọc được: ${verification.reason}`);
      await this.reject(provider, payloadHash, verification.payload, false, 'MALFORMED', now);
      throw new AppError('VALIDATION_ERROR', 'ord.webhookMalformed');
    }
    if (verification.kind === 'INVALID_SIGNATURE') {
      // FR-ORD-13 AC2: 401, hủy xử lý, ghi AuditLog cảnh báo bảo mật.
      await this.reject(
        provider,
        payloadHash,
        verification.payload,
        false,
        'INVALID_SIGNATURE',
        now,
      );
      await this.audit.log({
        actorType: 'PAYMENT_PROVIDER',
        action: 'ord.payment_webhook.rejected',
        targetType: 'PaymentWebhook',
        severity: 'HIGH',
        metadata: { provider, reason: 'INVALID_WEBHOOK_SIGNATURE', payloadHash },
      });
      throw new AppError('INVALID_WEBHOOK_SIGNATURE', 'ord.webhookSignatureInvalid');
    }

    const event = verification.event;
    const settled = await this.queries.transaction((tx) =>
      this.settle(tx, provider, event, verification.payload, payloadHash, now),
    );

    switch (settled.kind) {
      case 'PROCESSED':
        return 'PROCESSED';
      case 'DUPLICATE':
        return 'WEBHOOK_ALREADY_PROCESSED';
      case 'UNKNOWN_REFERENCE':
        // FR-ORD-14 AC3: 404, không đổi dữ liệu nghiệp vụ; vẫn lưu lại để đối soát (FR-ORD-23).
        await this.reject(
          provider,
          payloadHash,
          verification.payload,
          true,
          'UNKNOWN_REFERENCE',
          now,
        );
        throw new AppError('NOT_FOUND', 'ord.paymentReferenceUnknown');
      case 'AMOUNT_MISMATCH':
        // Đã commit cờ kiểm tra thủ công và bản ghi sự kiện: cổng gửi lại sẽ nhận 200 "đã xử lý"
        // thay vì 400 mãi — người vận hành xử lý qua danh sách kiểm tra thủ công.
        throw new AppError('AMOUNT_MISMATCH', 'ord.amountMismatch');
    }
  }

  private async settle(
    tx: Transaction<DB>,
    provider: string,
    event: VerifiedPaymentEvent,
    payload: unknown,
    payloadHash: string,
    now: Date,
  ): Promise<Settled> {
    const payment = await this.queries.lockByReference(provider, event.reference, tx);
    if (!payment) return { kind: 'UNKNOWN_REFERENCE' };

    const eventRowId = await this.queries.claimEvent(
      {
        provider,
        eventId: event.eventId,
        paymentId: payment.id,
        brandId: payment.brandId,
        payloadHash,
        payload,
        receivedAt: now,
      },
      tx,
    );
    if (!eventRowId) return { kind: 'DUPLICATE' };

    if (event.status === 'FAILED') {
      // Đơn/phiên giữ nguyên để khách thử lại trong hạn; payment FAILED vẫn nhận được tin thành
      // công về sau (SETTLEABLE) — một số cổng báo thất bại rồi mới báo thành công.
      if (payment.status === 'PENDING') {
        await this.queries.update(payment.id, { status: 'FAILED' }, tx);
      }
      await this.queries.finishEvent(eventRowId, 'PAYMENT_FAILED', now, tx);
      return { kind: 'PROCESSED' };
    }

    if (!sameAmount(event.amount, payment.amount) || event.currency !== payment.currency) {
      if (payment.orderId) await this.orders.flagOrderForReview(tx, payment.orderId);
      await this.audit.log(
        {
          actorType: 'PAYMENT_PROVIDER',
          brandId: payment.brandId,
          action: 'ord.payment.amount_mismatch',
          targetType: 'Payment',
          targetId: payment.id,
          severity: 'HIGH',
          before: { amount: payment.amount, currency: payment.currency },
          after: { amount: event.amount, currency: event.currency },
          metadata: { provider, eventId: event.eventId },
        },
        tx,
      );
      await this.queries.finishEvent(eventRowId, 'AMOUNT_MISMATCH', now, tx);
      return { kind: 'AMOUNT_MISMATCH' };
    }

    if (!isSettleable(payment)) {
      // Cùng giao dịch báo lại bằng eventId khác, sau khi payment đã được ghi nhận.
      await this.queries.finishEvent(eventRowId, `IGNORED_PAYMENT_${payment.status}`, now, tx);
      return { kind: 'DUPLICATE' };
    }

    const outcome = payment.orderId
      ? await this.orders.settleOrderPayment(
          tx,
          { orderId: payment.orderId, paymentId: payment.id, transactionId: event.transactionId },
          event.occurredAt,
        )
      : await this.checkouts.onPaymentSucceeded(tx, {
          paymentId: payment.id,
          checkoutId: payment.rentalCheckoutId as string,
          brandId: payment.brandId,
          provider,
          providerTransactionId: event.transactionId,
          amount: payment.amount,
          currency: payment.currency,
          paidAt: event.occurredAt,
          receivedAt: now,
          paymentStatusBefore: payment.status as 'PENDING' | 'FAILED' | 'EXPIRED',
        });

    const accepted = outcome.kind === 'PAID';
    await this.queries.update(
      payment.id,
      {
        status: accepted ? 'SUCCEEDED' : 'REFUND_PENDING',
        providerTransactionId: event.transactionId,
        paidAt: event.occurredAt,
      },
      tx,
    );
    await this.audit.log(
      {
        actorType: 'PAYMENT_PROVIDER',
        brandId: payment.brandId,
        action: accepted ? 'ord.payment.succeeded' : 'ord.payment.refund_pending',
        targetType: payment.orderId ? 'Order' : 'RentalCheckout',
        targetId: payment.orderId ?? payment.rentalCheckoutId,
        severity: accepted ? 'INFO' : 'WARNING',
        after: { paymentId: payment.id, status: accepted ? 'SUCCEEDED' : 'REFUND_PENDING' },
        metadata: {
          provider,
          eventId: event.eventId,
          transactionId: event.transactionId,
          amount: payment.amount,
          ...(outcome.kind === 'REFUND_PENDING' ? { reason: outcome.reason } : {}),
        },
      },
      tx,
    );
    await this.queries.finishEvent(
      eventRowId,
      accepted
        ? 'PAID'
        : `REFUND_PENDING:${outcome.kind === 'REFUND_PENDING' ? outcome.reason : ''}`,
      now,
      tx,
    );
    return { kind: 'PROCESSED' };
  }

  private async reject(
    provider: string,
    payloadHash: string,
    payload: unknown,
    signatureValid: boolean,
    result: string,
    at: Date,
  ): Promise<void> {
    await this.queries.insertRejectedEvent({
      provider,
      rejectionId: randomUUID(),
      payloadHash,
      payload,
      signatureValid,
      result,
      at,
    });
  }
}

function isSettleable(payment: PaymentRecord): boolean {
  return (SETTLEABLE as ReadonlySet<string>).has(payment.status);
}
