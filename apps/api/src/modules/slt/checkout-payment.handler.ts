/**
 * Nhận kết quả webhook thanh toán cho phiên thuê slot (FR-SLT-38, FR-SLT-43, ADR-0008).
 *
 * Handler chạy TRONG transaction của webhook (`tx`).
 * Không mở transaction mới, không commit/rollback, không đụng `payments`/`payment_events`.
 */

import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { DEFAULT_LOCALE, translate } from '@scentstation/i18n';
import type { Transaction } from 'kysely';
import type { DB } from '../../shared/db/index.js';
import { AlrService } from '../alr/index.js';
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
  constructor(
    @Inject(SltQueries) private readonly queries: SltQueries,
    @Inject(AlrService) private readonly alr: AlrService,
  ) {}

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

    const rentals = await this.queries.findRentalsByCheckoutId(event.checkoutId, tx);
    if (rentals.length === 0) {
      throw new Error(`Phiên thanh toán ${event.checkoutId} không có hóa đơn nào`);
    }

    const invoiceNumbers: string[] = [];
    for (const r of rentals) {
      const invoiceNumber = newInvoiceNumber(event.paidAt, 'Asia/Ho_Chi_Minh');
      invoiceNumbers.push(invoiceNumber);
      await this.queries.markRentalPaid(r.id, event.paidAt, invoiceNumber, tx);
    }

    // 5. FR-SLT-43 AC1, FR-ALR-16: mỗi Brand Admin ACTIVE một thông báo trong ứng dụng và một email.
    //    Email chỉ XẾP HÀNG ở đây; job ALR gửi sau khi webhook commit — không gọi mạng trong tx này.
    const params = {
      invoices: invoiceNumbers.join(', '),
      checkout: event.checkoutId,
      paidAt: event.paidAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    };
    await this.alr.notifyBrandAdmins(tx, {
      brandId: event.brandId,
      type: 'RENTAL_CHECKOUT_PAID',
      subject: translate(DEFAULT_LOCALE, 'slt.checkoutPaidSubject', params),
      content: translate(DEFAULT_LOCALE, 'slt.checkoutPaidContent', params),
      referenceId: event.checkoutId,
      at: event.receivedAt,
    });

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
