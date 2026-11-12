/**
 * Cửa vào scheduler của SLT (ADR-0003, FR-SLT-39).
 *
 * Quét và hủy các phiên thanh toán thuê slot quá hạn giữ chỗ.
 * Thứ tự khóa trong transaction: payment trước, phiên sau để tránh deadlock với webhook.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { DEFAULT_LOCALE, translate } from '@scentstation/i18n';
import { AuditService } from '../../shared/audit/index.js';
import { CLOCK, type Clock } from '../../shared/clock.js';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import { DATABASE, type Database } from '../../shared/db/index.js';
import { AlrService } from '../alr/index.js';
import { PaymentService } from '../ord/index.js';
import { activatedEndsAt } from './rental-period.js';
import { SltQueries } from './slt.queries.js';

@Injectable()
export class SltJobs {
  private readonly logger = new Logger('SLT/jobs');

  constructor(
    @Inject(SltQueries) private readonly queries: SltQueries,
    @Inject(PaymentService) private readonly payments: PaymentService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AlrService) private readonly alr: AlrService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
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

  /**
   * FR-SLT-42: Tự động kích hoạt khi chờ nạp hàng quá RENTAL_MAX_STOCKING_DAYS ngày kể từ paid_at.
   *
   * Idempotent, FOR UPDATE SKIP LOCKED, mỗi hóa đơn một transaction riêng,
   * catch-up sau downtime, lỗi một hóa đơn không làm hỏng cả lô.
   *
   * @returns Số hóa đơn đã kích hoạt thành công.
   */
  async autoActivateStockingOverdue(batchSize = 100): Promise<number> {
    const now = this.clock.now();
    const stockingDays = this.config.constraint('RENTAL_MAX_STOCKING_DAYS');
    const cutoff = new Date(now.getTime() - stockingDays * 24 * 60 * 60 * 1000);

    const overdueIds = await this.queries.findOverdueStockingRentalIds(cutoff, batchSize);
    if (overdueIds.length === 0) return 0;

    let activatedCount = 0;
    for (const rentalId of overdueIds) {
      try {
        const activated = await this.db.transaction().execute(async (tx) => {
          const rental = await this.queries.lockRentalForActivation(rentalId, tx);
          if (!rental) {
            return false;
          }

          // Kiểm tra lại điều kiện trong transaction
          if (
            rental.status !== 'DRAFT' ||
            !rental.paid_at ||
            rental.previous_rental_id !== null ||
            rental.paid_at >= cutoff
          ) {
            return false;
          }

          const startsAt = now;
          const endsAt = activatedEndsAt(rental, startsAt);

          await this.queries.activateRental(rentalId, startsAt, endsAt, now, tx);

          await this.audit.log(
            {
              actorType: 'SYSTEM',
              brandId: rental.brand_id,
              action: 'slt.rental.auto_activated_after_stocking_window',
              targetType: 'SlotRental',
              targetId: rental.id,
              before: {
                status: 'DRAFT',
                startsAt: rental.starts_at.toISOString(),
                endsAt: rental.ends_at.toISOString(),
              },
              after: {
                status: 'ACTIVE',
                startsAt: startsAt.toISOString(),
                endsAt: endsAt.toISOString(),
              },
            },
            tx,
          );

          const alreadyNotified = await this.queries.hasActivationNotification(rental.id, tx);
          if (!alreadyNotified) {
            const invoiceNumber = rental.invoice_number ?? rental.id;
            await this.alr.notifyBrandAdmins(tx, {
              brandId: rental.brand_id,
              type: 'RENTAL_ACTIVE',
              subject: translate(DEFAULT_LOCALE, 'slt.rentalActivatedSubject', { invoiceNumber }),
              content: translate(DEFAULT_LOCALE, 'slt.rentalActivatedContent', {
                invoiceNumber,
                startsAt: startsAt.toISOString(),
                endsAt: endsAt.toISOString(),
              }),
              referenceId: rental.id,
              at: now,
            });
          }

          return true;
        });

        if (activated) {
          activatedCount++;
        }
      } catch (err) {
        this.logger.error(`Lỗi khi tự kích hoạt hóa đơn ${rentalId}: ${String(err)}`);
      }
    }

    return activatedCount;
  }

  /**
   * FR-EXP-05: Chuyển các hóa đơn ACTIVE còn <= 7 ngày sang EXPIRING.
   */
  async scanExpiringRentals(batchSize = 100): Promise<number> {
    const now = this.clock.now();
    const expiringDays = this.config.constraint('RENTAL_EXPIRING_DAYS');
    const cutoff = new Date(now.getTime() + expiringDays * 24 * 60 * 60 * 1000);
    const expiringIds = await this.queries.findExpiringRentalIds(cutoff, batchSize);
    if (expiringIds.length === 0) return 0;

    let count = 0;
    for (const id of expiringIds) {
      try {
        await this.db.transaction().execute(async (tx) => {
          const updated = await this.queries.transitionToExpiring(id, now, tx);
          if (updated) {
            await this.audit.log(
              {
                actorType: 'SYSTEM',
                action: 'slt.rental.transitioned_to_expiring',
                targetType: 'SlotRental',
                targetId: id,
                after: { id, status: 'EXPIRING' },
              },
              tx,
            );
            count++;
          }
        });
      } catch (err) {
        this.logger.error(`Lỗi chuyển hóa đơn ${id} sang EXPIRING: ${String(err)}`);
      }
    }
    return count;
  }

  /**
   * FR-EXP-01, FR-EXP-02, FR-EXP-03, FR-EXP-04, FR-ALR-16:
   * Gửi thông báo mốc 7 ngày (T-7) và 3 ngày (T-3), gộp theo thương hiệu và ngày hết hạn.
   */
  async sendExpiringNotices(batchSize = 100): Promise<number> {
    const now = this.clock.now();
    const noticeMilestones = [
      {
        days: 7,
        code: 'T7',
        subjectKey: 'slt.rentalExpiringT7Subject' as const,
        contentKey: 'slt.rentalExpiringT7Content' as const,
      },
      {
        days: 3,
        code: 'T3',
        subjectKey: 'slt.rentalExpiringT3Subject' as const,
        contentKey: 'slt.rentalExpiringT3Content' as const,
      },
    ];

    let noticesSent = 0;
    for (const m of noticeMilestones) {
      const cutoff = new Date(now.getTime() + m.days * 24 * 60 * 60 * 1000);
      const rentals = await this.queries.findDueNoticeRentals(cutoff, batchSize);
      if (rentals.length === 0) continue;

      // Group by brand_id and date(ends_at)
      const groups = new Map<string, typeof rentals>();
      for (const r of rentals) {
        const dateStr = r.ends_at.toISOString().slice(0, 10);
        const key = `${r.brand_id}_${dateStr}`;
        const list = groups.get(key) ?? [];
        list.push(r);
        groups.set(key, list);
      }

      for (const [, groupRentals] of groups) {
        const first = groupRentals[0];
        if (!first) continue;
        const brandId = first.brand_id;
        const expiryDateStr = first.ends_at.toISOString().slice(0, 10);
        const referenceId = `EXPIRING_${m.code}_${brandId}_${expiryDateStr}`;

        const exists = await this.queries.hasNoticeNotification(brandId, referenceId);
        if (exists) continue;

        const invoiceList = groupRentals
          .map((r) => {
            const nonRenewText = r.non_renewal_requested_at ? ' (Đã báo không gia hạn)' : '';
            return `${r.invoice_number || r.id} [Máy: ${r.machine_display_name}, Slot #${r.slot_number}${r.product_name ? `, SP: ${r.product_name}` : ''}]${nonRenewText}`;
          })
          .join('; ');

        const actionLinks = groupRentals
          .map((r) => {
            if (r.non_renewal_requested_at) {
              return `Hóa đơn ${r.invoice_number || r.id}: Rút lại không gia hạn tại /rentals/${r.id}`;
            }
            return `Hóa đơn ${r.invoice_number || r.id}: Gia hạn hoặc báo không gia hạn tại /rentals/${r.id}`;
          })
          .join(' | ');

        const expiryFormatted = first.ends_at.toLocaleDateString('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh',
        });
        const params = {
          expiryDate: expiryFormatted,
          invoices: invoiceList,
          actionLinks,
        };

        try {
          await this.db.transaction().execute(async (tx) => {
            await this.alr.notifyBrandAdmins(tx, {
              brandId,
              type: `RENTAL_EXPIRING_${m.code}`,
              subject: translate(DEFAULT_LOCALE, m.subjectKey, params),
              content: translate(DEFAULT_LOCALE, m.contentKey, params),
              referenceId,
              at: now,
            });

            for (const r of groupRentals) {
              await this.audit.log(
                {
                  actorType: 'SYSTEM',
                  action: 'EXPIRY_NOTICE_SENT',
                  targetType: 'SlotRental',
                  targetId: r.id,
                  metadata: {
                    milestone: m.code,
                    brandId,
                    referenceId,
                    rentalIds: groupRentals.map((gr) => gr.id),
                    invoiceNumbers: groupRentals.map((gr) => gr.invoice_number),
                  },
                },
                tx,
              );
            }
          });
          noticesSent++;
        } catch (err) {
          this.logger.error(`Lỗi gửi thông báo ${referenceId}: ${String(err)}`);
        }
      }
    }
    return noticesSent;
  }

  /**
   * FR-EXP-06, FR-EXP-25, FR-SLT-12, FR-EXP-13:
   * Quét các hóa đơn ACTIVE/EXPIRING đã quá ends_at:
   * - Đã báo không gia hạn: BỎ QUA (FR-EXP-25 AC1, không vào GRACE, không phí ân hạn).
   * - Đã có hóa đơn gia hạn đã thanh toán (H2): chuyển H1 -> RENEWED và H2 -> ACTIVE (FR-SLT-12 AC2, FR-EXP-13 AC1b).
   * - Chưa gia hạn và chưa báo không gia hạn: chuyển sang GRACE với hạn mặc định GRACE_PERIOD_DEFAULT_DAYS (FR-EXP-06, 07).
   */
  async autoTransitionToGrace(batchSize = 100): Promise<number> {
    const now = this.clock.now();
    const dueIds = await this.queries.findRentalsEnteringGrace(now, batchSize);
    if (dueIds.length === 0) return 0;

    let handledCount = 0;
    const defaultGraceDays = this.config.constraint('GRACE_PERIOD_DEFAULT_DAYS');

    for (const id of dueIds) {
      try {
        await this.db.transaction().execute(async (tx) => {
          const rental = await this.queries.lockRentalForActivation(id, tx);
          if (!rental || !['ACTIVE', 'EXPIRING'].includes(rental.status) || rental.ends_at > now) {
            return;
          }

          // FR-EXP-25 AC1: Nếu đã báo không gia hạn, không chuyển GRACE!
          if (rental.non_renewal_requested_at !== null) {
            return;
          }

          // Kiểm tra xem đã có hóa đơn gia hạn đã thanh toán chưa
          const renewalRental = await this.queries.findPaidRenewalRental(rental.id, tx);
          if (renewalRental) {
            // Nối tiếp khi hết hạn: H1 -> RENEWED, H2 -> ACTIVE (FR-SLT-12 AC2, FR-EXP-13 AC1b)
            const duration = renewalRental.duration_months ?? 1;
            const startsAt = rental.ends_at;
            const endsAt = new Date(startsAt);
            endsAt.setMonth(endsAt.getMonth() + duration);

            await this.queries.transitionToRenewed(
              rental.id,
              renewalRental.id,
              startsAt,
              endsAt,
              now,
              tx,
            );

            await this.audit.log(
              {
                actorType: 'SYSTEM',
                action: 'slt.rental.renewed',
                targetType: 'SlotRental',
                targetId: rental.id,
                before: { id: rental.id, status: rental.status },
                after: { id: rental.id, status: 'RENEWED' },
              },
              tx,
            );

            await this.audit.log(
              {
                actorType: 'SYSTEM',
                action: 'slt.rental.activated',
                targetType: 'SlotRental',
                targetId: renewalRental.id,
                before: { id: renewalRental.id, status: renewalRental.status },
                after: { id: renewalRental.id, status: 'ACTIVE', startsAt, endsAt },
              },
              tx,
            );

            // Gửi thông báo H2 hiệu lực
            const params = {
              invoiceNumber: renewalRental.invoice_number || renewalRental.id,
              startsAt: startsAt.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
              endsAt: endsAt.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
            };
            await this.alr.notifyBrandAdmins(tx, {
              brandId: renewalRental.brand_id,
              type: 'RENTAL_ACTIVE',
              subject: translate(DEFAULT_LOCALE, 'slt.rentalActivatedSubject', params),
              content: translate(DEFAULT_LOCALE, 'slt.rentalActivatedContent', params),
              referenceId: renewalRental.id,
              at: now,
            });

            handledCount++;
            return;
          }

          // Chuyển sang GRACE (FR-EXP-06, 07)
          const graceEndsAt = new Date(
            rental.ends_at.getTime() + defaultGraceDays * 24 * 60 * 60 * 1000,
          );
          await this.queries.transitionToGrace(rental.id, graceEndsAt, now, tx);

          await this.audit.log(
            {
              actorType: 'SYSTEM',
              action: 'slt.rental.transitioned_to_grace',
              targetType: 'SlotRental',
              targetId: rental.id,
              before: { id: rental.id, status: rental.status },
              after: { id: rental.id, status: 'GRACE', graceEndsAt },
            },
            tx,
          );

          // Thông báo vào ân hạn (FR-ALR-16 AC1 item 4)
          const params = {
            invoiceNumber: rental.invoice_number || rental.id,
            startsAt: rental.ends_at.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
            graceEndsAt: graceEndsAt.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
          };
          await this.alr.notifyBrandAdmins(tx, {
            brandId: rental.brand_id,
            type: 'RENTAL_GRACE_ENTERED',
            subject: translate(DEFAULT_LOCALE, 'slt.rentalGraceEnteredSubject', params),
            content: translate(DEFAULT_LOCALE, 'slt.rentalGraceEnteredContent', params),
            referenceId: `GRACE_${rental.id}`,
            at: now,
          });

          handledCount++;
        });
      } catch (err) {
        this.logger.error(`Lỗi chuyển hóa đơn ${id} sang GRACE/RENEWED: ${String(err)}`);
      }
    }
    return handledCount;
  }

  /**
   * FR-EXP-10: Tính phí lưu kho trong thời gian ân hạn hằng ngày.
   * Phí = GRACE_FEE_RATE_DEFAULT (0.05) * giá bán lẻ chai * số chai tồn tại slot.
   * Idempotent theo ngày.
   */
  async calculateDailyGraceFees(batchSize = 100): Promise<number> {
    const now = this.clock.now();
    const dateStr = now.toISOString().slice(0, 10);
    const graceRate = this.config.constraint('GRACE_FEE_RATE_DEFAULT');

    const graceRentals = await this.queries.findRentalsInGrace(batchSize);
    if (graceRentals.length === 0) return 0;

    let calculatedCount = 0;
    for (const r of graceRentals) {
      try {
        await this.db.transaction().execute(async (tx) => {
          // Idempotency: Kiểm tra hôm nay đã tính phí cho hóa đơn này chưa
          const alreadyCharged = await this.queries.hasGraceFeeAuditLog(r.id, dateStr, tx);
          if (alreadyCharged) return;

          const bottleCount = await this.queries.countActiveBottlesForSlot(
            r.id,
            r.slot_id,
            r.brand_id,
            tx,
          );
          const bottlePrice = Number(r.full_bottle_retail_price ?? r.default_price ?? 0);
          const fee = (graceRate * bottlePrice * bottleCount).toFixed(4);

          if (Number(fee) > 0) {
            await this.queries.addGraceFee(r.id, fee, now, tx);
          }

          await this.audit.log(
            {
              actorType: 'SYSTEM',
              action: 'slt.rental.grace_fee_charged',
              targetType: 'SlotRental',
              targetId: r.id,
              metadata: {
                date: dateStr,
                rate: graceRate,
                bottlePrice,
                bottleCount,
                feeAmount: fee,
              },
            },
            tx,
          );

          calculatedCount++;
        });
      } catch (err) {
        this.logger.error(`Lỗi tính phí ân hạn cho hóa đơn ${r.id}: ${String(err)}`);
      }
    }
    return calculatedCount;
  }

  /**
   * FR-EXP-14, FR-EXP-15, FR-EXP-16: Chuyển các hóa đơn ở GRACE quá hạn ân hạn sang LIQUIDATED.
   * Toàn bộ chai tồn chuyển sang PLATFORM / LIQUIDATED.
   */
  async autoTransitionToLiquidated(batchSize = 100): Promise<number> {
    const now = this.clock.now();
    const ids = await this.queries.findRentalsEnteringLiquidation(now, batchSize);
    if (ids.length === 0) return 0;

    let liquidatedCount = 0;
    for (const rentalId of ids) {
      try {
        await this.db.transaction().execute(async (tx) => {
          const rental = await this.queries.findById({ kind: 'UNRESTRICTED' }, rentalId);
          if (!rental || rental.status !== 'GRACE') return;

          const { liquidatedBottles } = await this.queries.liquidateRentalTx(rentalId, now, tx);

          await this.audit.log(
            {
              actorType: 'SYSTEM',
              action: 'slt.rental.liquidated',
              targetType: 'SlotRental',
              targetId: rental.id,
              brandId: rental.brandId,
              before: {
                id: rental.id,
                status: 'GRACE',
              },
              after: {
                id: rental.id,
                status: 'LIQUIDATED',
                liquidatedAt: now.toISOString(),
              },
            },
            tx,
          );

          for (const bottle of liquidatedBottles) {
            await this.audit.log(
              {
                actorType: 'SYSTEM',
                action: 'slt.bottle.liquidated',
                targetType: 'Bottle',
                targetId: bottle.id,
                brandId: bottle.brandId,
                before: {
                  id: bottle.id,
                  owner: 'BRAND',
                },
                after: {
                  id: bottle.id,
                  owner: 'PLATFORM',
                  status: 'LIQUIDATED',
                  liquidatedAt: now.toISOString(),
                  sourceRentalId: rental.id,
                },
              },
              tx,
            );
          }

          const invoiceNumber = rental.invoiceNumber ?? rental.id;
          await this.alr.notifyBrandAdmins(
            tx,
            {
              brandId: rental.brandId,
              type: 'RENTAL_LIQUIDATED',
              subject: translate(DEFAULT_LOCALE, 'slt.rentalLiquidatedSubject', { invoiceNumber }),
              content: translate(DEFAULT_LOCALE, 'slt.rentalLiquidatedContent', { invoiceNumber }),
              referenceId: rental.id,
              at: now,
            },
            ['IN_APP', 'EMAIL'],
          );

          liquidatedCount++;
        });
      } catch (err) {
        this.logger.error(`Lỗi chuyển hóa đơn ${rentalId} sang thanh lý: ${String(err)}`);
      }
    }

    return liquidatedCount;
  }
}
