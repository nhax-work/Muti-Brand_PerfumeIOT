/**
 * Tạo và tra thanh toán — dùng chung cho đơn kiosk (ORD) và phiên thuê slot (SLT, FR-SLT-37).
 *
 * Người gọi không chạm cổng hay bảng `payments` trực tiếp: gọi `createPending` trong transaction
 * của mình, nhận lại QR/đường dẫn để hiển thị. Kết quả thanh toán về qua webhook
 * (`PaymentWebhookService`), không qua service này.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { DB } from '../../../shared/db/index.js';
import type { PaymentStatus } from '../../../shared/db/types.generated.js';
import { PAYMENT_GATEWAYS, type PaymentGatewayRegistry } from './payment-gateway.js';
import { PaymentQueries, type PaymentRecord, type PaymentTarget } from './payment.queries.js';

/** Thứ hiển thị cho người trả tiền: QR trên kiosk, hoặc QR/đường dẫn trên web quản trị. */
export interface PaymentIntent {
  readonly paymentId: string;
  readonly provider: string;
  readonly reference: string;
  readonly amount: string;
  readonly currency: string;
  readonly status: PaymentStatus;
  readonly qrPayload: string | null;
  readonly checkoutUrl: string | null;
}

export interface CreatePendingPaymentInput {
  readonly brandId: string;
  readonly target: PaymentTarget;
  /** Mã duy nhất theo provider — sinh bằng `newPaymentReference('ORD' | 'CHK', ...)`. */
  readonly reference: string;
  readonly amount: string;
  readonly currency: string;
  /** Hạn đơn (ORDER_PAYMENT_TTL_SEC) hoặc hạn giữ chỗ của phiên (RENTAL_CHECKOUT_HOLD_MIN). */
  readonly expiresAt: Date;
  readonly description: string;
}

@Injectable()
export class PaymentService {
  constructor(
    @Inject(PaymentQueries) private readonly queries: PaymentQueries,
    @Inject(PAYMENT_GATEWAYS) private readonly gateways: PaymentGatewayRegistry,
  ) {}

  /**
   * Tạo thanh toán ở cổng hiện tại (PAYMENT_PROVIDER) và ghi `payments` ở PENDING, trong `tx`.
   *
   * Không tự bắt lỗi trùng: vi phạm `uq_checkout_payment_pending` (hai yêu cầu thanh toán cùng phiên
   * đồng thời, FR-SLT-37 AC3) hay `uq_payment_provider_reference` làm hỏng transaction của người gọi
   * — người gọi rollback rồi đọc lại bằng `findPendingIntent`.
   */
  async createPending(input: CreatePendingPaymentInput, tx: Kysely<DB>): Promise<PaymentIntent> {
    const gateway = this.gateways.current();
    const created = await gateway.createPayment({
      reference: input.reference,
      amount: input.amount,
      currency: input.currency,
      expiresAt: input.expiresAt,
      description: input.description,
    });
    const record = await this.queries.insertPending(
      {
        brandId: input.brandId,
        target: input.target,
        provider: gateway.provider,
        providerReference: input.reference,
        amount: input.amount,
        currency: input.currency,
        rawResponse: {
          ...created.raw,
          qrPayload: created.qrPayload,
          checkoutUrl: created.checkoutUrl,
        },
      },
      tx,
    );
    return intentOf(record);
  }

  /** Payment PENDING của đơn hoặc phiên, nếu có — "bấm thanh toán lần nữa" trả lại chính nó (FR-SLT-37 AC2). */
  async findPendingIntent(
    target: PaymentTarget,
    executor?: Kysely<DB>,
  ): Promise<PaymentIntent | null> {
    const record = await this.queries.findPending(target, executor);
    return record ? intentOf(record) : null;
  }

  /** Payment mới nhất của đơn — kiosk gửi lại Idempotency-Key thì trả lại đúng QR cũ. */
  async findLatestIntentForOrder(orderId: string): Promise<PaymentIntent | null> {
    const record = await this.queries.findLatestForOrder(orderId);
    return record ? intentOf(record) : null;
  }
}

function intentOf(record: PaymentRecord): PaymentIntent {
  const raw = (record.rawResponse ?? {}) as { qrPayload?: unknown; checkoutUrl?: unknown };
  return {
    paymentId: record.id,
    provider: record.provider,
    reference: record.providerReference ?? '',
    amount: record.amount,
    currency: record.currency,
    status: record.status,
    qrPayload: typeof raw.qrPayload === 'string' ? raw.qrPayload : null,
    checkoutUrl: typeof raw.checkoutUrl === 'string' ? raw.checkoutUrl : null,
  };
}
