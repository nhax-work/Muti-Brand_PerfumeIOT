/**
 * Nghiệp vụ Trả hàng khi không gia hạn (FR-EXP-26, FR-EXP-27, FR-EXP-28, ADR-0014).
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { AuditService } from '../../shared/audit/index.js';
import { CLOCK, type Clock } from '../../shared/clock.js';
import { SPEC_CONSTRAINTS } from '../../shared/config/constraints.generated.js';
import { DATABASE, type Database } from '../../shared/db/index.js';
import { AppError } from '../../shared/errors/index.js';
import type { BrandScope } from '../../shared/scoping/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import { ExpQueries, type BottleReturnDto, type BottleReturnFilters } from './exp.queries.js';

export type BottleReturn = Schema<'BottleReturn'>;
export type BottleReturnCreate = Schema<'BottleReturnCreate'>;
export type BottleReturnHandover = Schema<'BottleReturnHandover'>;

@Injectable()
export class ExpService {
  constructor(
    @Inject(ExpQueries) private readonly queries: ExpQueries,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  /**
   * Danh sách phiếu trả hàng (hỗ trợ BrandScope & filter open).
   */
  async listBottleReturns(
    scope: BrandScope,
    filters: BottleReturnFilters,
  ): Promise<{ items: BottleReturnDto[]; total: number }> {
    const brandId = scope.kind === 'BRAND' ? scope.brandId : filters.brandId;
    return this.queries.listBottleReturns({
      ...filters,
      brandId,
    });
  }

  /**
   * Chi tiết phiếu trả hàng.
   */
  async getBottleReturn(scope: BrandScope, id: string): Promise<BottleReturnDto> {
    const item = await this.queries.findBottleReturnById(id);
    if (!item) {
      throw new AppError('NOT_FOUND', 'exp.returnNotFound');
    }

    if (scope.kind === 'BRAND' && item.brandId !== scope.brandId) {
      throw new AppError('FORBIDDEN_SCOPE', 'exp.forbiddenBrandScope');
    }

    return item;
  }

  /**
   * Tháo chai & Lập phiếu trả hàng (FR-EXP-26, ADR-0014).
   * Nhân viên kho / Super Admin thực hiện khi phiên thuê kết thúc không gia hạn.
   */
  async createBottleReturn(
    actor: AuthenticatedUser,
    input: BottleReturnCreate,
  ): Promise<BottleReturnDto> {
    const now = this.clock.now();

    // 1. Kiểm tra hóa đơn thuê slot
    const rental = await this.queries.findRentalForReturn(input.slotRentalId);
    if (!rental) {
      throw new AppError('NOT_FOUND', 'exp.rentalNotFound');
    }

    // Phải là slot không gia hạn và trạng thái kết thúc/sắp hết hạn
    // RENTAL_NOT_ACTIVE (409)
    if (!rental.nonRenewalRequestedAt) {
      throw new AppError('RENTAL_NOT_ACTIVE', 'exp.rentalRenewalNotDeclined');
    }

    // 2. Kiểm tra danh sách chai
    if (!input.bottles || input.bottles.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'exp.bottlesRequired');
    }

    const bottleIds = input.bottles.map((b) => b.bottleId);
    const existingBottles = await this.queries.findBottlesByIds(bottleIds);
    if (existingBottles.length !== bottleIds.length) {
      throw new AppError('NOT_FOUND', 'exp.bottleNotFound');
    }

    // Tất cả chai phải thuộc brand của rental
    for (const b of existingBottles) {
      if (b.brand_id !== rental.brandId) {
        throw new AppError('BOTTLE_NOT_OWNED', 'exp.bottleNotOwnedByBrand');
      }
    }

    // 3. Tính toán phương thức trả hàng & deadline
    const returnMethod = rental.returnMethod ?? 'WAREHOUSE_PICKUP';
    const shippingAddress = returnMethod === 'SHIP_TO_BRAND' ? rental.brandAddress : null;
    const readyAt = now;
    const pickupDeadline = new Date(
      now.getTime() + SPEC_CONSTRAINTS.RETURN_PICKUP_MAX_DAYS * 24 * 60 * 60 * 1000,
    );

    // 4. Thực hiện transaction lưu DB
    const created = await this.queries.createBottleReturn({
      slotRentalId: input.slotRentalId,
      brandId: rental.brandId,
      returnMethod,
      shippingAddress,
      readyAt,
      pickupDeadline,
      createdBy: actor.userId,
      bottles: input.bottles.map((b) => ({
        bottleId: b.bottleId,
        measuredWeightG: b.measuredWeightG,
      })),
    });

    // 5. Ghi Audit log (FR-AUD-07)
    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      brandId: rental.brandId,
      action: 'exp.bottle_return.created',
      targetType: 'BottleReturn',
      targetId: created.id,
      after: {
        id: created.id,
        slotRentalId: created.slotRentalId,
        bottlesCount: created.bottles.length,
        returnMethod: created.returnMethod,
        pickupDeadline: created.pickupDeadline,
      },
      metadata: {
        measuredBottles: input.bottles,
      },
    });

    return created;
  }

  /**
   * Bàn giao hàng trả về (FR-EXP-27, ADR-0014).
   */
  async handOverBottleReturn(
    actor: AuthenticatedUser,
    id: string,
    input: BottleReturnHandover,
  ): Promise<BottleReturnDto> {
    const existing = await this.queries.findBottleReturnById(id);
    if (!existing) {
      throw new AppError('NOT_FOUND', 'exp.returnNotFound');
    }

    // Nếu đã bàn giao hoặc đã thanh lý/forfeited -> RENTAL_NOT_ACTIVE
    if (existing.handedOverAt || existing.forfeitedAt) {
      throw new AppError('RENTAL_NOT_ACTIVE', 'exp.returnAlreadyClosed');
    }

    // FR-EXP-27: SHIP_TO_BRAND bắt buộc có mã vận đơn
    if (
      existing.returnMethod === 'SHIP_TO_BRAND' &&
      (!input.trackingNumber || !input.trackingNumber.trim())
    ) {
      throw new AppError('VALIDATION_ERROR', 'exp.trackingNumberRequiredForShipping');
    }

    const handedOverAt = input.handedOverAt ? new Date(input.handedOverAt) : this.clock.now();

    const updated = await this.queries.handOverBottleReturn(id, {
      recipientName: input.recipientName.trim(),
      handedOverAt,
      handedOverBy: actor.userId,
      trackingNumber: input.trackingNumber?.trim() || null,
    });

    if (!updated) {
      throw new AppError('RENTAL_NOT_ACTIVE', 'exp.returnAlreadyClosed');
    }

    // Ghi Audit log (FR-AUD-07)
    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      brandId: existing.brandId,
      action: 'exp.bottle_return.handed_over',
      targetType: 'BottleReturn',
      targetId: id,
      before: {
        handedOverAt: existing.handedOverAt,
      },
      after: {
        handedOverAt: updated.handedOverAt,
        recipientName: updated.recipientName,
        trackingNumber: updated.trackingNumber,
      },
    });

    return updated;
  }

  /**
   * Quét và gửi thông báo nhắc Brand Admin trước 3 ngày khi sắp đến hạn nhận lại chai (FR-EXP-28).
   */
  async sendExpiringReminders(): Promise<number> {
    const now = this.clock.now();
    const expiring = await this.queries.findExpiringReturnsForReminder(now);
    let count = 0;

    for (const item of expiring) {
      // Đánh dấu đã gửi nhắc nhở
      await this.queries.markReminderSent(item.id, now);
      await this.audit.log({
        actorType: 'SYSTEM',
        brandId: item.brand_id,
        action: 'exp.bottle_return.reminder_sent',
        targetType: 'BottleReturn',
        targetId: item.id,
        after: {
          reminderSentAt: now.toISOString(),
          pickupDeadline: new Date(item.pickup_deadline).toISOString(),
        },
      });
      count++;
    }

    return count;
  }

  /**
   * Quét và tịch thu/thanh lý chai quá hạn nhận chuyển quyền sở hữu sang PLATFORM (FR-EXP-28, ADR-0014).
   */
  async sweepOverdueForfeitures(): Promise<number> {
    const now = this.clock.now();
    const overdue = await this.queries.findOverdueReturns(now);
    let count = 0;

    for (const item of overdue) {
      await this.queries.forfeitBottleReturn(item.id, now);
      await this.audit.log({
        actorType: 'SYSTEM',
        brandId: item.brand_id,
        action: 'exp.bottle_return.forfeited',
        targetType: 'BottleReturn',
        targetId: item.id,
        after: {
          forfeitedAt: now.toISOString(),
          owner: 'PLATFORM',
          status: 'LIQUIDATED',
        },
      });
      count++;
    }

    return count;
  }
}
