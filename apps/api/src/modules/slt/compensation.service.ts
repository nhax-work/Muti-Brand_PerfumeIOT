/**
 * Bảo hiểm hàng hóa (FR-SLT-44 ÷ 46, ADR-0006, ADR-0018 mục 1).
 *
 *   INV mark-damaged ─tx─▶ compensateDamagedBottle: chọn hóa đơn áp gói → khóa hóa đơn → tính số
 *                          tiền trong hạn mức còn lại → khoản PENDING (một chai một khoản)
 *   Super Admin payout (xác thực lại) ─▶ PAID kèm mã giao dịch
 *   Brand Admin ─▶ chỉ xem khoản của thương hiệu mình
 *
 * Khoản bồi thường sinh CÙNG transaction với việc chuyển chai sang DAMAGED: chai hỏng mà không có
 * khoản (hoặc ngược lại) là hai sổ lệch nhau. `uq_compensation_bottle` chặn khoản thứ hai cho một chai.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { DEFAULT_LOCALE, translate } from '@scentstation/i18n';
import type { Kysely } from 'kysely';
import { AuditService } from '../../shared/audit/index.js';
import { CLOCK, type Clock } from '../../shared/clock.js';
import type { DB } from '../../shared/db/index.js';
import type { BottleStatus, RevenueOwnerType } from '../../shared/db/types.generated.js';
import { AppError, notFoundFor } from '../../shared/errors/index.js';
import type { BrandScope } from '../../shared/scoping/index.js';
import { AlrService } from '../alr/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import { compensationAmount, toUnits } from './compensation-amount.js';
import {
  CompensationQueries,
  type CompensationFilter,
  type CompensationRecord,
  type CoverageRental,
} from './compensation.queries.js';

export type StorageCompensation = Schema<'StorageCompensation'>;

type Executor = Kysely<DB>;

/** Trạng thái chai mà hàng không còn giá trị bảo hiểm (FR-SLT-44 AC4, ADR-0018). */
const UNCOVERED_STATUSES: readonly BottleStatus[] = ['EXPIRED', 'LIQUIDATED', 'EMPTY'];

/** Chai vừa được INV chuyển sang DAMAGED — các trường là giá trị TRƯỚC khi chuyển. */
export interface DamagedBottle {
  readonly id: string;
  readonly brandId: string;
  readonly owner: RevenueOwnerType;
  readonly previousStatus: BottleStatus;
  readonly expiresAt: Date | null;
  readonly fragranceProductId: string;
  /** Slot chai đang lắp lúc hỏng, nếu có. */
  readonly installedSlotId: string | null;
  readonly bottleReturnId: string | null;
}

@Injectable()
export class CompensationService {
  constructor(
    @Inject(CompensationQueries) private readonly queries: CompensationQueries,
    @Inject(AlrService) private readonly alr: AlrService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * FR-SLT-44: gọi trong transaction đổi trạng thái chai của INV.
   *
   * @returns khoản vừa tạo, hoặc `null` khi chai không được bồi thường (AC4)
   */
  async compensateDamagedBottle(
    tx: Executor,
    bottle: DamagedBottle,
    at: Date,
  ): Promise<StorageCompensation | null> {
    if (bottle.owner !== 'BRAND') return null;
    if (UNCOVERED_STATUSES.includes(bottle.previousStatus)) return null;
    if (bottle.expiresAt !== null && bottle.expiresAt <= at) return null;

    const rental = await this.coverageRentalFor(tx, bottle);
    if (!rental || rental.brandId !== bottle.brandId) return null;
    if (rental.coveragePercent === null || rental.coverageCap === null) return null;

    const retailPrice = await this.queries.retailPriceOf(bottle.fragranceProductId, tx);
    if (retailPrice === null) return null;

    const used = await this.queries.lockRentalAndUsedCoverage(rental.id, tx);
    const amount = compensationAmount({
      coveragePercent: rental.coveragePercent,
      retailPrice,
      coverageCap: rental.coverageCap,
      usedCoverage: used,
    });
    if (toUnits(amount) === 0n) return null;

    const id = await this.queries.insertCompensation(
      {
        brandId: bottle.brandId,
        bottleId: bottle.id,
        slotRentalId: rental.id,
        bottleRetailPrice: retailPrice,
        coveragePercent: rental.coveragePercent,
        amount,
        at,
      },
      tx,
    );
    await this.audit.log(
      {
        actorType: 'SYSTEM',
        brandId: bottle.brandId,
        action: 'slt.compensation.created',
        targetType: 'storage_compensation',
        targetId: id,
        severity: 'WARNING',
        after: { status: 'PENDING', amount },
        metadata: {
          bottleId: bottle.id,
          slotRentalId: rental.id,
          coveragePercent: rental.coveragePercent,
          bottleRetailPrice: retailPrice,
          usedCoverageBefore: used,
        },
      },
      tx,
    );
    const record = (await this.queries.find({ kind: 'UNRESTRICTED' }, id, tx))!;
    const params = { bottle: record.bottleIdentifier, amount: formatVnd(amount) };
    await this.alr.notifyBrandAdmins(
      tx,
      {
        brandId: bottle.brandId,
        type: 'STORAGE_COMPENSATION_CREATED',
        subject: translate(DEFAULT_LOCALE, 'slt.compensationCreatedSubject', params),
        content: translate(DEFAULT_LOCALE, 'slt.compensationCreatedContent', params),
        referenceId: id,
        at,
      },
      ['IN_APP'],
    );
    return toCompensationDto(record);
  }

  /** FR-SLT-46: Brand Admin chỉ thấy khoản của thương hiệu mình (BR-012). */
  async list(
    scope: BrandScope,
    filter: CompensationFilter,
  ): Promise<{ items: StorageCompensation[]; total: number }> {
    const { items, total } = await this.queries.list(scope, filter);
    return { items: items.map(toCompensationDto), total };
  }

  /** FR-SLT-45: Super Admin ghi nhận đã chuyển tiền. Quyền và xác thực lại kiểm ở controller. */
  async payout(
    actor: AuthenticatedUser,
    id: string,
    reference: string,
  ): Promise<StorageCompensation> {
    const record = await this.queries.transaction(async (tx) => {
      const current = await this.queries.lock(id, tx);
      if (!current) throw notFoundFor(actor);
      if (current.status === 'PAID') {
        throw new AppError('VALIDATION_ERROR', 'slt.compensationAlreadyPaid');
      }
      const now = this.clock.now();
      await this.queries.markPaid(id, { reference, paidBy: actor.userId, at: now }, tx);
      await this.audit.log(
        {
          actorType: 'USER',
          actorId: actor.userId,
          brandId: current.brandId,
          action: 'slt.compensation.paid',
          targetType: 'storage_compensation',
          targetId: id,
          severity: 'HIGH',
          before: { status: current.status },
          after: { status: 'PAID', payoutReference: reference },
          metadata: { amount: current.amount },
        },
        tx,
      );
      const updated = (await this.queries.find({ kind: 'UNRESTRICTED' }, id, tx))!;
      const params = {
        bottle: updated.bottleIdentifier,
        amount: formatVnd(updated.amount),
        reference,
      };
      await this.alr.notifyBrandAdmins(
        tx,
        {
          brandId: current.brandId,
          type: 'STORAGE_COMPENSATION_PAID',
          subject: translate(DEFAULT_LOCALE, 'slt.compensationPaidSubject', params),
          content: translate(DEFAULT_LOCALE, 'slt.compensationPaidContent', params),
          referenceId: id,
          at: now,
        },
        ['IN_APP'],
      );
      return updated;
    });
    return toCompensationDto(record);
  }

  /**
   * Hóa đơn áp gói (ADR-0018 mục 1): chai đang lắp → hóa đơn giữ slot; chai chờ thương hiệu nhận lại →
   * hóa đơn của phiếu trả hàng; chai trong kho → hóa đơn hiệu lực có tỷ lệ cao nhất (AC2).
   */
  private coverageRentalFor(tx: Executor, bottle: DamagedBottle): Promise<CoverageRental | null> {
    if (bottle.installedSlotId !== null) {
      return this.queries.rentalHoldingSlot(bottle.installedSlotId, tx);
    }
    if (bottle.previousStatus === 'RETURNED_TO_BRAND' && bottle.bottleReturnId !== null) {
      return this.queries.rentalOfReturn(bottle.bottleReturnId, tx);
    }
    return this.queries.bestBrandRental(bottle.brandId, tx);
  }
}

export function toCompensationDto(r: CompensationRecord): StorageCompensation {
  return {
    id: r.id,
    brandId: r.brandId,
    brandName: r.brandName,
    bottleId: r.bottleId,
    bottleIdentifier: r.bottleIdentifier,
    productName: r.productName,
    slotRentalId: r.slotRentalId,
    invoiceNumber: r.invoiceNumber,
    ...(r.storagePlanName !== null ? { storagePlanName: r.storagePlanName } : {}),
    damagedAt: r.damagedAt?.toISOString() ?? null,
    bottleRetailPrice: r.bottleRetailPrice,
    coveragePercent: Number(r.coveragePercent),
    amount: r.amount,
    currency: r.currency as StorageCompensation['currency'],
    status: r.status,
    payoutReference: r.payoutReference,
    paidAt: r.paidAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

/** `"1200000.0000"` → `"1.200.000"` cho câu thông báo — số trong bảng web tự định dạng theo locale. */
function formatVnd(amount: string): string {
  const whole = amount.split('.')[0] ?? '0';
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
