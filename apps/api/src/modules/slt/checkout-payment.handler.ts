/**
 * Nhận kết quả webhook thanh toán cho phiên thuê slot (FR-SLT-38, ADR-0008).
 *
 * HIỆN THỰC TẠM — TV3 thay thân hàm ở tuần 5. Hợp đồng đầy đủ (ORD đã làm gì trước khi gọi, handler
 * phải làm gì, không được làm gì) ở `modules/ord/payment/rental-checkout-payment.port.ts` và
 * docs/THANH_TOAN_WEBHOOK.md.
 *
 * Ném lỗi thay vì trả 'PAID': webhook rollback và cổng gửi lại sau, nên không có khoản tiền nào bị
 * "ghi nhận" mà phiên và hóa đơn chưa được cập nhật. Tuần 4 chưa có luồng tạo payment cho phiên nên
 * hàm này không bị gọi trong thực tế.
 */

import { Global, Injectable, Module } from '@nestjs/common';
import type { Transaction } from 'kysely';
import type { DB } from '../../shared/db/index.js';
import {
  RENTAL_CHECKOUT_PAYMENT_HANDLER,
  type CheckoutPaymentOutcome,
  type CheckoutPaymentSucceeded,
  type RentalCheckoutPaymentHandler,
} from '../ord/index.js';

@Injectable()
export class SltCheckoutPaymentHandler implements RentalCheckoutPaymentHandler {
  async onPaymentSucceeded(
    _tx: Transaction<DB>,
    event: CheckoutPaymentSucceeded,
  ): Promise<CheckoutPaymentOutcome> {
    // TV3 (tuần 5):
    //   1. Khóa rental_checkouts theo event.checkoutId (FOR UPDATE).
    //   2. Phiên đã hủy (cancelled_at) → { kind: 'REFUND_PENDING', reason: 'CHECKOUT_CANCELLED' }.
    //   3. Phiên đã trả bằng payment khác (paid_at) → { kind: 'REFUND_PENDING', reason: 'CHECKOUT_ALREADY_PAID' }.
    //   4. Còn lại: rental_checkouts.paid_at = event.paidAt; với MỖI slot_rentals của phiên: paid_at =
    //      event.paidAt và một invoice_number riêng; thông báo FR-SLT-43 → { kind: 'PAID' }.
    throw new Error(
      `Chưa hiện thực xử lý thanh toán phiên thuê slot ${event.checkoutId} (FR-SLT-38, TV3 tuần 5)`,
    );
  }
}

/**
 * @Global để OrdModule nhận được handler mà không import SltModule (tránh vòng ORD ↔ SLT).
 * Khi handler cần SltQueries: thêm vào `providers` ở đây, hoặc import SltModule vào module này.
 */
@Global()
@Module({
  providers: [{ provide: RENTAL_CHECKOUT_PAYMENT_HANDLER, useClass: SltCheckoutPaymentHandler }],
  exports: [RENTAL_CHECKOUT_PAYMENT_HANDLER],
})
export class SltCheckoutPaymentModule {}
