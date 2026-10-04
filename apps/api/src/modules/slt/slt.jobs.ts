/**
 * Cửa vào scheduler của SLT (ADR-0003, FR-SLT-39).
 *
 * Quét và hủy các phiên thanh toán thuê slot quá hạn giữ chỗ.
 * Thứ tự khóa trong transaction: payment trước, phiên sau để tránh deadlock với webhook.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../../shared/audit/index.js';
import { CLOCK, type Clock } from '../../shared/clock.js';
import { DATABASE, type Database } from '../../shared/db/index.js';
import { PaymentService } from '../ord/index.js';
import { SltQueries } from './slt.queries.js';

@Injectable()
export class SltJobs {
  private readonly logger = new Logger('SLT/jobs');

  constructor(
    @Inject(SltQueries) private readonly queries: SltQueries,
    @Inject(PaymentService) private readonly payments: PaymentService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  /**
   * FR-SLT-39: Hủy các phiên hết giờ giữ chỗ (hold_expires_at <= now, chưa paid, chưa cancelled).
   * Mỗi phiên chạy trong một transaction riêng.
   *
   * @returns Số phiên đã hủy thành công.
   */
  async cancelExpiredCheckouts(batchSize = 100): Promise<number> {
    const now = this.clock.now();
    const expiredIds = await this.queries.findExpiredCheckoutIds(now, batchSize);
    if (expiredIds.length === 0) return 0;

    let cancelledCount = 0;
    for (const checkoutId of expiredIds) {
      try {
        const cancelled = await this.db.transaction().execute(async (tx) => {
          // 1. Khóa theo đúng thứ tự webhook: payment trước, phiên sau để không deadlock với webhook
          await this.payments.expirePending({ rentalCheckoutId: checkoutId }, tx);

          // 2. Khóa rental_checkouts FOR UPDATE, kiểm tra còn chưa trả và chưa hủy (webhook có thể vừa thắng)
          const checkout = await this.queries.lockCheckoutById(checkoutId, tx);
          if (!checkout || checkout.paidAt !== null || checkout.cancelledAt !== null) {
            return false;
          }

          // 3. cancelled_at = now cho phiên; mọi hóa đơn của phiên -> status = 'CANCELLED', cancelled_at = now
          const cancelTime = this.clock.now();
          await this.queries.cancelCheckoutAndRentals(checkoutId, cancelTime, tx);

          // 4. AuditService.log trong cùng tx
          await this.audit.log(
            {
              actorType: 'SYSTEM',
              action: 'slt.rental_checkout.cancelled_due_to_expiry',
              targetType: 'RentalCheckout',
              targetId: checkoutId,
              after: { id: checkoutId, cancelledAt: cancelTime.toISOString() },
            },
            tx,
          );

          return true;
        });

        if (cancelled) {
          cancelledCount++;
        }
      } catch (err) {
        this.logger.error(`Lỗi khi hủy phiên hết hạn ${checkoutId}: ${String(err)}`);
      }
    }

    return cancelledCount;
  }
}
