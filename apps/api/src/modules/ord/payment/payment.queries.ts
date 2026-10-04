/**
 * SQL cho `payments` và `payment_events` — dùng chung giữa đơn kiosk (ORD) và phiên thuê slot
 * (SLT, ADR-0008). Hàm nào nhận `executor` chạy được trong transaction của người gọi.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Kysely, Selectable, Transaction } from 'kysely';
import { DATABASE, type Database, type DB } from '../../../shared/db/index.js';
import type { Json, PaymentStatus } from '../../../shared/db/types.generated.js';

type Executor = Kysely<DB>;

export interface PaymentRecord {
  readonly id: string;
  readonly brandId: string;
  readonly orderId: string | null;
  readonly rentalCheckoutId: string | null;
  readonly provider: string;
  readonly providerReference: string | null;
  readonly providerTransactionId: string | null;
  readonly amount: string;
  readonly currency: string;
  readonly status: PaymentStatus;
  readonly rawResponse: Json | null;
  readonly createdAt: Date;
}

/** Thanh toán thuộc về đúng một trong hai (chk_payment_single_target). */
export type PaymentTarget = { readonly orderId: string } | { readonly rentalCheckoutId: string };

@Injectable()
export class PaymentQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  transaction<T>(work: (tx: Transaction<DB>) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(work);
  }

  async insertPending(
    payment: {
      readonly brandId: string;
      readonly target: PaymentTarget;
      readonly provider: string;
      readonly providerReference: string;
      readonly amount: string;
      readonly currency: string;
      readonly rawResponse: Record<string, unknown>;
    },
    executor: Executor,
  ): Promise<PaymentRecord> {
    const row = await executor
      .insertInto('payments')
      .values({
        brand_id: payment.brandId,
        order_id: 'orderId' in payment.target ? payment.target.orderId : null,
        rental_checkout_id:
          'rentalCheckoutId' in payment.target ? payment.target.rentalCheckoutId : null,
        provider: payment.provider,
        provider_reference: payment.providerReference,
        amount: payment.amount,
        currency: payment.currency,
        status: 'PENDING',
        raw_response: JSON.stringify(payment.rawResponse),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toPaymentRecord(row);
  }

  /** Payment PENDING của đơn hoặc phiên — tối đa một (uq_checkout_payment_pending; một đơn một payment). */
  async findPending(target: PaymentTarget, executor: Executor = this.db) {
    let query = executor.selectFrom('payments').selectAll().where('status', '=', 'PENDING');
    query =
      'orderId' in target
        ? query.where('order_id', '=', target.orderId)
        : query.where('rental_checkout_id', '=', target.rentalCheckoutId);
    const row = await query.executeTakeFirst();
    return row ? toPaymentRecord(row) : null;
  }

  /** Payment mới nhất của đơn, bất kể trạng thái — để trả lại QR khi kiosk gửi lại Idempotency-Key. */
  async findLatestForOrder(orderId: string, executor: Executor = this.db) {
    const row = await executor
      .selectFrom('payments')
      .selectAll()
      .where('order_id', '=', orderId)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
    return row ? toPaymentRecord(row) : null;
  }

  /** Tra payment theo mã tham chiếu cổng gửi lại (uq_payment_provider_reference) và KHÓA nó. */
  async lockByReference(
    provider: string,
    reference: string,
    executor: Executor,
  ): Promise<PaymentRecord | null> {
    const row = await executor
      .selectFrom('payments')
      .selectAll()
      .where('provider', '=', provider)
      .where('provider_reference', '=', reference)
      .forUpdate()
      .executeTakeFirst();
    return row ? toPaymentRecord(row) : null;
  }

  async update(
    paymentId: string,
    set: {
      readonly status: PaymentStatus;
      readonly providerTransactionId?: string;
      readonly paidAt?: Date;
    },
    executor: Executor,
  ): Promise<void> {
    await executor
      .updateTable('payments')
      .set({
        status: set.status,
        ...(set.providerTransactionId !== undefined
          ? { provider_transaction_id: set.providerTransactionId }
          : {}),
        ...(set.paidAt !== undefined ? { paid_at: set.paidAt } : {}),
      })
      .where('id', '=', paymentId)
      .execute();
  }

  /** Đặt payment PENDING của đơn/phiên sang trạng thái mới — ví dụ hết hạn → EXPIRED. */
  async closePending(target: PaymentTarget, status: PaymentStatus, executor: Executor) {
    let query = executor.updateTable('payments').set({ status }).where('status', '=', 'PENDING');
    query =
      'orderId' in target
        ? query.where('order_id', '=', target.orderId)
        : query.where('rental_checkout_id', '=', target.rentalCheckoutId);
    await query.execute();
  }

  /**
   * Ghi sự kiện webhook ĐÃ KHỚP một payment, dùng chính `provider_event_id` của cổng.
   *
   * ON CONFLICT DO NOTHING trên `uq_payment_event` là cơ chế chống trùng (FR-ORD-15): trả `null`
   * nghĩa là sự kiện đã được xử lý. Hai webhook trùng tới song song: INSERT thứ hai CHỜ transaction
   * thứ nhất kết thúc — commit thì nó nhận `null`, rollback thì nó chèn được và xử lý thay.
   */
  async claimEvent(
    event: {
      readonly provider: string;
      readonly eventId: string;
      readonly paymentId: string;
      readonly brandId: string;
      readonly payloadHash: string;
      readonly payload: unknown;
      readonly receivedAt: Date;
    },
    executor: Executor,
  ): Promise<string | null> {
    const row = await executor
      .insertInto('payment_events')
      .values({
        provider: event.provider,
        provider_event_id: event.eventId,
        payment_id: event.paymentId,
        brand_id: event.brandId,
        payload_hash: event.payloadHash,
        signature_valid: true,
        payload: JSON.stringify(event.payload),
        received_at: event.receivedAt,
      })
      .onConflict((oc) => oc.columns(['provider', 'provider_event_id']).doNothing())
      .returning('id')
      .executeTakeFirst();
    return row?.id ?? null;
  }

  async finishEvent(eventId: string, result: string, at: Date, executor: Executor): Promise<void> {
    await executor
      .updateTable('payment_events')
      .set({ processing_result: result, processed_at: at })
      .where('id', '=', eventId)
      .execute();
  }

  /**
   * Ghi sự kiện KHÔNG xử lý (chữ ký sai, mã tham chiếu lạ, body hỏng) để rà soát (FR-ORD-13 AC2).
   *
   * `provider_event_id` là khóa sinh riêng (`rejected:<uuid>`), KHÔNG phải eventId trong body: body
   * chưa được tin, và nếu dùng eventId đó thì kẻ gửi webhook giả chiếm trước được eventId của giao
   * dịch thật — webhook thật tới sau bị coi là trùng và tiền không bao giờ được ghi nhận.
   */
  async insertRejectedEvent(event: {
    readonly provider: string;
    readonly rejectionId: string;
    readonly payloadHash: string;
    readonly payload: unknown;
    readonly signatureValid: boolean;
    readonly result: string;
    readonly at: Date;
  }): Promise<void> {
    await this.db
      .insertInto('payment_events')
      .values({
        provider: event.provider,
        provider_event_id: `rejected:${event.rejectionId}`,
        payload_hash: event.payloadHash,
        signature_valid: event.signatureValid,
        payload: JSON.stringify(event.payload ?? null),
        processing_result: event.result,
        received_at: event.at,
        processed_at: event.at,
      })
      .execute();
  }
}

function toPaymentRecord(row: Selectable<DB['payments']>): PaymentRecord {
  return {
    id: row.id,
    brandId: row.brand_id,
    orderId: row.order_id,
    rentalCheckoutId: row.rental_checkout_id,
    provider: row.provider,
    providerReference: row.provider_reference,
    providerTransactionId: row.provider_transaction_id,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    rawResponse: row.raw_response,
    createdAt: row.created_at,
  };
}
