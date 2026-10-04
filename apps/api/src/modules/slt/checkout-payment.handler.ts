/**
 * Nhận kết quả webhook thanh toán cho phiên thuê slot (FR-SLT-38, FR-SLT-43, ADR-0008).
 *
 * Handler chạy TRONG transaction của webhook (`tx`).
 * Không mở transaction mới, không commit/rollback, không đụng `payments`/`payment_events`.
 */

import { Global, Inject, Injectable, Module } from '@nestjs/common';
import type { Transaction } from 'kysely';
import type { DB } from '../../shared/db/index.js';
import {
  RENTAL_CHECKOUT_PAYMENT_HANDLER,
  type CheckoutPaymentOutcome,
  type CheckoutPaymentSucceeded,
  type RentalCheckoutPaymentHandler,
} from '../ord/index.js';
import { newInvoiceNumber } from './invoice-number.js';
import { SltQueries } from './slt.queries.js';

@Injectable()
export class SltCheckoutPaymentHandler implements RentalCheckoutPaymentHandler {
  constructor(@Inject(SltQueries) private readonly queries: SltQueries) {}

  async onPaymentSucceeded(
    tx: Transaction<DB>,
    event: CheckoutPaymentSucceeded,
  ): Promise<CheckoutPaymentOutcome> {
    // 1. Khóa rental_checkouts theo event.checkoutId (FOR UPDATE).
    const checkout = await this.queries.lockCheckoutById(event.checkoutId, tx);
    if (!checkout) {
      throw new Error(`Không tìm thấy phiên thanh toán ${event.checkoutId}`);
    }

    // 2. Phiên đã hủy (cancelled_at) → { kind: 'REFUND_PENDING', reason: 'CHECKOUT_CANCELLED' } (AC5).
    if (checkout.cancelledAt !== null) {
      return { kind: 'REFUND_PENDING', reason: 'CHECKOUT_CANCELLED' };
    }

    // 3. Phiên đã trả bằng payment khác (paid_at) → { kind: 'REFUND_PENDING', reason: 'CHECKOUT_ALREADY_PAID' }.
    if (checkout.paidAt !== null) {
      return { kind: 'REFUND_PENDING', reason: 'CHECKOUT_ALREADY_PAID' };
    }

    // 4. Cập nhật paid_at cho phiên và mọi slot_rentals của phiên; mỗi hóa đơn một invoice_number riêng.
    await this.queries.markCheckoutPaid(event.checkoutId, event.paidAt, tx);

    const rentals = await this.queries.findRentalsByCheckoutId(event.checkoutId, tx, true);
    if (rentals.length === 0) {
      throw new Error(`Phiên thanh toán ${event.checkoutId} không có hóa đơn nào`);
    }

    const invoiceNumbers: string[] = [];
    for (const r of rentals) {
      const invoiceNumber = newInvoiceNumber(event.paidAt, 'Asia/Ho_Chi_Minh');
      invoiceNumbers.push(invoiceNumber);
      await this.queries.markRentalPaid(r.id, event.paidAt, invoiceNumber, tx);
    }

    // 6. Thông báo FR-SLT-43 AC1: một bản ghi cho mỗi Brand Admin đang hoạt động của thương hiệu.
    const brandAdminIds = await this.queries.findActiveBrandAdminIds(event.brandId, tx);
    const invoiceListText = invoiceNumbers.join(', ');
    const notificationContent = `Thanh toán thành công cho phiên thuê slot. Mã hóa đơn: ${invoiceListText}. Vui lòng gửi hàng và cấu hình slot cho các chai nước hoa.`;
    const notificationSubject = `Xác nhận thanh toán thuê slot (${invoiceListText})`;

    for (const adminId of brandAdminIds) {
      await this.queries.insertNotification(
        {
          brandId: event.brandId,
          recipientUserId: adminId,
          type: 'RENTAL_CHECKOUT_PAID',
          channel: 'IN_APP',
          subject: notificationSubject,
          content: notificationContent,
          status: 'PENDING',
          createdAt: event.receivedAt,
        },
        tx,
      );
    }

    return { kind: 'PAID' };
  }
}

/**
 * @Global để OrdModule nhận được handler mà không import SltModule (tránh vòng ORD ↔ SLT).
 */
@Global()
@Module({
  providers: [
    SltQueries,
    { provide: RENTAL_CHECKOUT_PAYMENT_HANDLER, useClass: SltCheckoutPaymentHandler },
  ],
  exports: [RENTAL_CHECKOUT_PAYMENT_HANDLER],
})
export class SltCheckoutPaymentModule {}
