/**
 * Hợp đồng giữa webhook thanh toán (ORD, TV1) và phiên thanh toán thuê slot (SLT, TV3) — ADR-0008.
 *
 * Webhook là cửa vào DUY NHẤT của tiền (FR-ORD-12..15, FR-SLT-38). Nó lo mọi phần chung rồi mới
 * giao cho SLT đúng phần nghiệp vụ của phiên:
 *
 *   ORD (đã làm, không cần SLT lặp lại)          SLT (TV3 hiện thực, tuần 5)
 *   ─────────────────────────────────────────   ──────────────────────────────────────────────
 *   1. Kiểm chữ ký, ghi payment_events          4. Khóa rental_checkouts FOR UPDATE
 *   2. Chống trùng (uq_payment_event) — webhook 5. Phiên chờ thanh toán → ghi paid_at cho phiên
 *      trùng KHÔNG bao giờ tới được handler        và MỌI hóa đơn, cấp invoice_number riêng từng
 *   3. Khóa payments FOR UPDATE; đối chiếu số      hóa đơn, thông báo FR-SLT-43 → 'PAID'
 *      tiền + loại tiền với payments.amount    6. Phiên đã hủy / đã trả bằng payment khác
 *      (AMOUNT_MISMATCH trả về trước khi gọi)      → 'REFUND_PENDING' (FR-SLT-38 AC5)
 *   7. Sau handler: cập nhật payments (status,  8. KHÔNG đụng payments, payment_events; KHÔNG
 *      provider_transaction_id, paid_at), đóng     commit/rollback — dùng đúng `tx` được truyền
 *      payment_events, ghi AuditLog FR-AUD-06
 *
 * Handler chạy TRONG transaction của webhook. Ném lỗi thì toàn bộ webhook rollback — kể cả bản ghi
 * chống trùng — và cổng nhận HTTP 500 rồi gửi lại sau. Đó là hành vi đúng khi lỗi tạm thời; đừng
 * nuốt lỗi để trả 'PAID' cho một phiên chưa ghi xong.
 *
 * `constraint trigger` §10d của schema.sql kiểm lúc COMMIT rằng phiên và mọi hóa đơn cùng đã trả
 * tiền: quên một hóa đơn là CSDL từ chối cả webhook.
 */

import type { Transaction } from 'kysely';
import type { DB } from '../../../shared/db/index.js';

/** Webhook báo một thanh toán của phiên thuê slot đã THÀNH CÔNG, đã qua bước 1–3 ở trên. */
export interface CheckoutPaymentSucceeded {
  readonly paymentId: string;
  /** `payments.rental_checkout_id` — đã khóa payment, chưa khóa phiên. */
  readonly checkoutId: string;
  readonly brandId: string;
  readonly provider: string;
  readonly providerTransactionId: string;
  /** Đã khớp `payments.amount` (bằng `rental_checkouts.total_amount` lúc TV3 tạo payment). */
  readonly amount: string;
  readonly currency: string;
  /** Lúc cổng ghi nhận giao dịch — dùng cho `rental_checkouts.paid_at` và `slot_rentals.paid_at`. */
  readonly paidAt: Date;
  /** `clock.now()` lúc webhook được xử lý. */
  readonly receivedAt: Date;
  /**
   * Trạng thái payment trước webhook. `EXPIRED`: job FR-SLT-39 đã hủy phiên; `FAILED`: cổng từng
   * báo thất bại rồi lại báo thành công — cả hai vẫn có thể là tiền thật đã về.
   */
  readonly paymentStatusBefore: 'PENDING' | 'FAILED' | 'EXPIRED';
}

export type CheckoutPaymentOutcome =
  /** Đã ghi nhận: phiên và mọi hóa đơn đã có paid_at, mỗi hóa đơn có invoice_number. */
  | { readonly kind: 'PAID' }
  /**
   * Tiền về nhưng không ghi nhận được — phiên đã hủy, hoặc đã trả bằng payment khác. Webhook đặt
   * payment sang REFUND_PENDING và ghi AuditLog kèm `reason`. Phiên và hóa đơn KHÔNG được khôi phục.
   */
  | {
      readonly kind: 'REFUND_PENDING';
      readonly reason: 'CHECKOUT_CANCELLED' | 'CHECKOUT_ALREADY_PAID';
    };

export interface RentalCheckoutPaymentHandler {
  onPaymentSucceeded(
    tx: Transaction<DB>,
    event: CheckoutPaymentSucceeded,
  ): Promise<CheckoutPaymentOutcome>;
}

/**
 * Token DI. SltModule cung cấp và export token này; OrdModule import SltModule để nhận nó.
 * Hiện thực tạm (ném lỗi) ở `modules/slt/checkout-payment.handler.ts` — TV3 thay bằng hiện thực thật.
 */
export const RENTAL_CHECKOUT_PAYMENT_HANDLER = Symbol('RENTAL_CHECKOUT_PAYMENT_HANDLER');
