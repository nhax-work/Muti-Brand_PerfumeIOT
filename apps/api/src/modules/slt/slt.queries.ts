/**
 * Truy vấn hóa đơn thuê slot (FR-SLT-15, FR-SLT-41; ADR-0006, ADR-0008).
 * Chỉ module slt được import file này (QT3, ADR-0003).
 *
 * Chỉ ĐỌC. Hóa đơn sinh ra qua phiên thanh toán (`POST /rental-checkouts`, FR-SLT-35) và đổi trạng
 * thái qua các luồng nghiệp vụ riêng (thanh toán, lắp chai đầu tiên, job hết hạn) — không có đường
 * tạo tay hay kích hoạt tay (FR-SLT-01 đã bãi bỏ).
 */

import { Inject, Injectable } from '@nestjs/common';
import { sql, type Expression, type SqlBool } from 'kysely';
import { DATABASE, type Database } from '../../shared/db/index.js';
import type { SlotRentalStatus } from '../../shared/db/types.generated.js';
import { brandScopedByColumn, type BrandScope } from '../../shared/scoping/index.js';

export type { SlotRentalStatus };

/**
 * Nhãn hiển thị cho Brand Admin (FR-SLT-41, openapi `RentalInvoiceStage`) — SUY RA từ `status` và
 * `paid_at`, không phải cột trong CSDL.
 */
export type RentalInvoiceStage =
  | 'AWAITING_PAYMENT'
  | 'AWAITING_STOCK'
  | 'ACTIVE'
  | 'EXPIRING'
  | 'GRACE'
  | 'LIQUIDATED'
  | 'ENDED'
  | 'CANCELLED';

export interface SlotRentalRecord {
  readonly id: string;
  readonly slotId: string;
  readonly machineId: string;
  readonly brandId: string;
  readonly fragranceProductId: string | null;
  readonly productAssignedAt: Date | null;
  readonly requestId: string | null;
  readonly previousRentalId: string | null;
  readonly status: SlotRentalStatus;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly graceEndsAt: Date | null;
  readonly pricePerSpray: string | null;
  readonly currency: string;
  readonly fixedFee: string;
  readonly revenueSharePercent: string;
  readonly terminatedReason: string | null;
  readonly checkoutId: string | null;
  readonly invoiceNumber: string | null;
  readonly rentalPackageId: string | null;
  readonly storagePlanId: string | null;
  readonly durationMonths: number | null;
  readonly monthlyRentPrice: string | null;
  readonly discountPercent: string | null;
  readonly storageMonthlyPrice: string | null;
  readonly storageCoveragePercent: string | null;
  readonly storageCoverageCap: string | null;
  readonly rentAmount: string | null;
  readonly storageAmount: string | null;
  readonly graceFeeAmount: string;
  readonly totalAmount: string | null;
  /** Hạn giữ chỗ của phiên thanh toán chứa hóa đơn (ADR-0008); null với hóa đơn mô hình cũ. */
  readonly holdExpiresAt: Date | null;
  readonly paidAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly createdAt: Date;
}

export interface SlotRentalFilter {
  readonly page: number;
  readonly pageSize: number;
  readonly status?: SlotRentalStatus | undefined;
  readonly stage?: RentalInvoiceStage | undefined;
  /** Lọc máy chỉ để thu hẹp; phạm vi thương hiệu vẫn qua `slot_rentals.brand_id`. */
  readonly machineId?: string | undefined;
}

/** Điều kiện SQL cho một nhãn — cùng quy tắc với `stageOf` bên dưới. */
function stageCondition(stage: RentalInvoiceStage): Expression<SqlBool> {
  switch (stage) {
    case 'AWAITING_PAYMENT':
      return sql<SqlBool>`sr.status = 'DRAFT' and sr.paid_at is null`;
    case 'AWAITING_STOCK':
      return sql<SqlBool>`sr.status = 'DRAFT' and sr.paid_at is not null`;
    case 'ENDED':
      return sql<SqlBool>`sr.status in ('RENEWED', 'CLOSED', 'TERMINATED')`;
    default:
      // ACTIVE, EXPIRING, GRACE, LIQUIDATED, CANCELLED: nhãn trùng tên trạng thái.
      return sql<SqlBool>`sr.status::text = ${stage}`;
  }
}

/** FR-SLT-41 AC1: mỗi hóa đơn đúng một nhãn. */
export function stageOf(status: SlotRentalStatus, paidAt: Date | null): RentalInvoiceStage {
  switch (status) {
    case 'DRAFT':
      return paidAt ? 'AWAITING_STOCK' : 'AWAITING_PAYMENT';
    case 'RENEWED':
    case 'CLOSED':
    case 'TERMINATED':
      return 'ENDED';
    default:
      return status;
  }
}

@Injectable()
export class SltQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(
    scope: BrandScope,
    filter: SlotRentalFilter,
  ): Promise<{ items: SlotRentalRecord[]; total: number }> {
    let base = this.base(scope);
    if (filter.machineId) base = base.where('ms.machine_id', '=', filter.machineId);
    if (filter.status) base = base.where('sr.status', '=', filter.status);
    if (filter.stage) base = base.where(stageCondition(filter.stage));

    const [rows, count] = await Promise.all([
      this.selectColumns(base)
        .orderBy('sr.created_at', 'desc')
        .orderBy('sr.id')
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize)
        .execute(),
      base.select((eb) => eb.fn.countAll<string>().as('total')).executeTakeFirstOrThrow(),
    ]);
    return { items: rows.map(toRecord), total: Number(count.total) };
  }

  async findById(scope: BrandScope, id: string): Promise<SlotRentalRecord | null> {
    const row = await this.selectColumns(
      this.base(scope).where('sr.id', '=', id),
    ).executeTakeFirst();
    return row ? toRecord(row) : null;
  }

  private base(scope: BrandScope) {
    return this.db
      .selectFrom('slot_rentals as sr')
      .innerJoin('machine_slots as ms', 'ms.id', 'sr.slot_id')
      .leftJoin('rental_checkouts as rc', 'rc.id', 'sr.checkout_id')
      .where(brandScopedByColumn(scope, 'sr.brand_id'));
  }

  private selectColumns(query: ReturnType<SltQueries['base']>) {
    return query.selectAll('sr').select(['ms.machine_id', 'rc.hold_expires_at']);
  }
}

function toRecord(
  row: Awaited<ReturnType<ReturnType<SltQueries['selectColumns']>['executeTakeFirstOrThrow']>>,
): SlotRentalRecord {
  return {
    id: row.id,
    slotId: row.slot_id,
    machineId: row.machine_id,
    brandId: row.brand_id,
    fragranceProductId: row.fragrance_product_id,
    productAssignedAt: row.product_assigned_at,
    requestId: row.request_id,
    previousRentalId: row.previous_rental_id,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    graceEndsAt: row.grace_ends_at,
    pricePerSpray: row.price_per_spray,
    currency: row.currency,
    fixedFee: row.fixed_fee,
    revenueSharePercent: row.revenue_share_percent,
    terminatedReason: row.terminated_reason,
    checkoutId: row.checkout_id,
    invoiceNumber: row.invoice_number,
    rentalPackageId: row.rental_package_id,
    storagePlanId: row.storage_plan_id,
    durationMonths: row.duration_months,
    monthlyRentPrice: row.monthly_rent_price,
    discountPercent: row.discount_percent,
    storageMonthlyPrice: row.storage_monthly_price,
    storageCoveragePercent: row.storage_coverage_percent,
    storageCoverageCap: row.storage_coverage_cap,
    rentAmount: row.rent_amount,
    storageAmount: row.storage_amount,
    graceFeeAmount: row.grace_fee_amount,
    totalAmount: row.total_amount,
    holdExpiresAt: row.hold_expires_at,
    paidAt: row.paid_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
  };
}
