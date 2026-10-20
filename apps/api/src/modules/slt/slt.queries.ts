/**
 * Truy vấn hóa đơn thuê slot (FR-SLT-15, FR-SLT-41; ADR-0006, ADR-0008).
 * Chỉ module slt được import file này (QT3, ADR-0003).
 *
 * Chỉ ĐỌC. Hóa đơn sinh ra qua phiên thanh toán (`POST /rental-checkouts`, FR-SLT-35) và đổi trạng
 * thái qua các luồng nghiệp vụ riêng (thanh toán, lắp chai đầu tiên, job hết hạn) — không có đường
 * tạo tay hay kích hoạt tay (FR-SLT-01 đã bãi bỏ).
 */

import { Inject, Injectable } from '@nestjs/common';
import type { MessageKey } from '@scentstation/i18n';
import { sql, type Expression, type Kysely, type SqlBool, type Transaction } from 'kysely';
import { DATABASE, type Database, type DB } from '../../shared/db/index.js';
import type { SlotRentalStatus } from '../../shared/db/types.generated.js';
import { brandScopedByColumn, type BrandScope } from '../../shared/scoping/index.js';

export type { SlotRentalStatus };
export type Executor = Kysely<DB> | Transaction<DB>;

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
  /** Slot cũ khi hóa đơn đã đổi slot (FR-SLT-55). Khác NULL nghĩa là đã dùng lượt đổi duy nhất. */
  readonly swappedFromSlotId: string | null;
  readonly swappedAt: Date | null;
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

export interface RentalCheckoutRecord {
  readonly id: string;
  readonly brandId: string;
  readonly currency: string;
  readonly totalAmount: string;
  readonly holdExpiresAt: Date;
  readonly paidAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly createdBy: string;
  readonly createdAt: Date;
  /** Hợp đồng khung hiện hành lúc tạo phiên (ADR-0013). Null với phiên trước ADR-0013. */
  readonly agreementVersionId: string | null;
}

/** FR-SLT-48 (ADR-0013) */
export interface AgreementVersionRecord {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly content: string;
  readonly contentHash: string;
  readonly isCurrent: boolean;
  readonly publishedAt: Date | null;
  readonly createdAt: Date;
}

/** FR-SLT-49 (ADR-0013). IP lưu trong CSDL nhưng không đọc ra — API không trả. */
export interface AgreementAcceptanceRecord {
  readonly id: string;
  readonly brandId: string;
  readonly acceptedBy: string;
  readonly kind: 'FRAMEWORK' | 'ANNEX';
  readonly agreementVersionId: string;
  readonly rentalCheckoutId: string | null;
  readonly contentHash: string;
  readonly acceptedAt: Date;
}

export interface RentalInvoiceDetailRecord {
  readonly rentalId: string;
  readonly checkoutId: string | null;
  readonly invoiceNumber: string | null;
  readonly status: SlotRentalStatus;
  readonly brandId: string;
  readonly slotId: string;
  readonly slotNumber: number;
  readonly machineId: string;
  readonly machineDisplayName: string;
  readonly locationName: string;
  readonly packageName: string | null;
  readonly durationMonths: number | null;
  readonly discountPercent: string | null;
  readonly planName: string | null;
  readonly storageMonthlyPrice: string | null;
  readonly storageCoveragePercent: string | null;
  readonly storageCoverageCap: string | null;
  readonly monthlyRentPrice: string | null;
  readonly rentAmount: string | null;
  readonly storageAmount: string | null;
  readonly graceFeeAmount: string;
  readonly totalAmount: string | null;
  readonly currency: string;
  readonly holdExpiresAt: Date | null;
  readonly paidAt: Date | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly swappedFromSlotId: string | null;
  readonly swappedAt: Date | null;
}

export interface CheckoutCreateItemInput {
  readonly slotId: string;
  readonly rentalPackageId: string;
  readonly storagePlanId: string;
}

export interface CheckoutCreateItemData {
  readonly slotId: string;
  readonly rentalPackageId: string;
  readonly storagePlanId: string;
  readonly durationMonths: number;
  readonly monthlyRentPrice: string;
  readonly discountPercent: string;
  readonly storageMonthlyPrice: string;
  readonly storageCoveragePercent: string;
  readonly storageCoverageCap: string;
  readonly rentAmount: string;
  readonly storageAmount: string;
  readonly totalAmount: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

const BLOCKING_STATUSES = ['DRAFT', 'ACTIVE', 'EXPIRING', 'GRACE', 'LIQUIDATED'] as const;

/** Lỗi CSDL do slot đã bị giữ: chồng lấn kỳ hạn (23P01) hoặc trùng hóa đơn hiệu lực (23505). */
function isSlotHoldConflict(error: unknown): boolean {
  const e = error as { code?: string; constraint?: string };
  return (
    (e.code === '23P01' && e.constraint === 'excl_slot_rental_overlap') ||
    (e.code === '23505' && e.constraint === 'uq_slot_active_rental')
  );
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

  async findInvoiceDetailById(
    scope: BrandScope,
    id: string,
  ): Promise<RentalInvoiceDetailRecord | null> {
    const row = await this.db
      .selectFrom('slot_rentals as sr')
      .innerJoin('machine_slots as ms', 'ms.id', 'sr.slot_id')
      .innerJoin('machines as m', 'm.id', 'ms.machine_id')
      .innerJoin('locations as l', 'l.id', 'm.location_id')
      .leftJoin('rental_packages as rp', 'rp.id', 'sr.rental_package_id')
      .leftJoin('storage_plans as sp', 'sp.id', 'sr.storage_plan_id')
      .leftJoin('rental_checkouts as rc', 'rc.id', 'sr.checkout_id')
      .select([
        'sr.id as rental_id',
        'sr.checkout_id',
        'sr.invoice_number',
        'sr.status',
        'sr.brand_id',
        'sr.slot_id',
        'ms.slot_number',
        'ms.machine_id',
        'm.display_name as machine_display_name',
        'l.name as location_name',
        'rp.name as package_name',
        'sr.duration_months',
        'sr.discount_percent',
        'sp.name as plan_name',
        'sr.storage_monthly_price',
        'sr.storage_coverage_percent',
        'sr.storage_coverage_cap',
        'sr.monthly_rent_price',
        'sr.rent_amount',
        'sr.storage_amount',
        'sr.grace_fee_amount',
        'sr.total_amount',
        'sr.currency',
        'rc.hold_expires_at',
        'sr.paid_at',
        'sr.starts_at',
        'sr.ends_at',
        'sr.swapped_from_slot_id',
        'sr.swapped_at',
      ])
      .where('sr.id', '=', id)
      .where(brandScopedByColumn(scope, 'sr.brand_id'))
      .executeTakeFirst();

    if (!row) return null;
    return {
      rentalId: row.rental_id,
      checkoutId: row.checkout_id,
      invoiceNumber: row.invoice_number,
      status: row.status,
      brandId: row.brand_id,
      slotId: row.slot_id,
      slotNumber: row.slot_number,
      machineId: row.machine_id,
      machineDisplayName: row.machine_display_name,
      locationName: row.location_name,
      packageName: row.package_name,
      durationMonths: row.duration_months,
      discountPercent: row.discount_percent,
      planName: row.plan_name,
      storageMonthlyPrice: row.storage_monthly_price,
      storageCoveragePercent: row.storage_coverage_percent,
      storageCoverageCap: row.storage_coverage_cap,
      monthlyRentPrice: row.monthly_rent_price,
      rentAmount: row.rent_amount,
      storageAmount: row.storage_amount,
      graceFeeAmount: row.grace_fee_amount,
      totalAmount: row.total_amount,
      currency: row.currency,
      holdExpiresAt: row.hold_expires_at,
      paidAt: row.paid_at,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      swappedFromSlotId: row.swapped_from_slot_id,
      swappedAt: row.swapped_at,
    };
  }

  /**
   * FR-SLT-50 (ADR-0013): Lấy danh sách chi tiết hóa đơn của một phiên để sinh phụ lục.
   */
  async findInvoiceDetailsByCheckoutId(
    checkoutId: string,
    executor: Executor = this.db,
  ): Promise<RentalInvoiceDetailRecord[]> {
    const rows = await executor
      .selectFrom('slot_rentals as sr')
      .innerJoin('machine_slots as ms', 'ms.id', 'sr.slot_id')
      .innerJoin('machines as m', 'm.id', 'ms.machine_id')
      .innerJoin('locations as l', 'l.id', 'm.location_id')
      .leftJoin('rental_packages as rp', 'rp.id', 'sr.rental_package_id')
      .leftJoin('storage_plans as sp', 'sp.id', 'sr.storage_plan_id')
      .leftJoin('rental_checkouts as rc', 'rc.id', 'sr.checkout_id')
      .select([
        'sr.id as rental_id',
        'sr.checkout_id',
        'sr.invoice_number',
        'sr.status',
        'sr.brand_id',
        'sr.slot_id',
        'ms.slot_number',
        'ms.machine_id',
        'm.display_name as machine_display_name',
        'l.name as location_name',
        'rp.name as package_name',
        'sr.duration_months',
        'sr.discount_percent',
        'sp.name as plan_name',
        'sr.storage_monthly_price',
        'sr.storage_coverage_percent',
        'sr.storage_coverage_cap',
        'sr.monthly_rent_price',
        'sr.rent_amount',
        'sr.storage_amount',
        'sr.grace_fee_amount',
        'sr.total_amount',
        'sr.currency',
        'rc.hold_expires_at',
        'sr.paid_at',
        'sr.starts_at',
        'sr.ends_at',
        'sr.swapped_from_slot_id',
        'sr.swapped_at',
      ])
      .where('sr.checkout_id', '=', checkoutId)
      .orderBy('ms.slot_number', 'asc')
      .execute();

    return rows.map((row) => ({
      rentalId: row.rental_id,
      checkoutId: row.checkout_id,
      invoiceNumber: row.invoice_number,
      status: row.status,
      brandId: row.brand_id,
      slotId: row.slot_id,
      slotNumber: row.slot_number,
      machineId: row.machine_id,
      machineDisplayName: row.machine_display_name,
      locationName: row.location_name,
      packageName: row.package_name,
      durationMonths: row.duration_months,
      discountPercent: row.discount_percent,
      planName: row.plan_name,
      storageMonthlyPrice: row.storage_monthly_price,
      storageCoveragePercent: row.storage_coverage_percent,
      storageCoverageCap: row.storage_coverage_cap,
      monthlyRentPrice: row.monthly_rent_price,
      rentAmount: row.rent_amount,
      storageAmount: row.storage_amount,
      graceFeeAmount: row.grace_fee_amount,
      totalAmount: row.total_amount,
      currency: row.currency,
      holdExpiresAt: row.hold_expires_at,
      paidAt: row.paid_at,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      swappedFromSlotId: row.swapped_from_slot_id,
      swappedAt: row.swapped_at,
    }));
  }

  async findCheckoutById(
    scope: BrandScope,
    id: string,
  ): Promise<{ checkout: RentalCheckoutRecord; items: SlotRentalRecord[] } | null> {
    const checkoutRow = await this.db
      .selectFrom('rental_checkouts')
      .selectAll()
      .where('id', '=', id)
      .where(brandScopedByColumn(scope, 'brand_id'))
      .executeTakeFirst();

    if (!checkoutRow) return null;

    const rentalRows = await this.selectColumns(this.base(scope).where('sr.checkout_id', '=', id))
      .orderBy('sr.created_at', 'asc')
      .execute();

    return {
      checkout: {
        id: checkoutRow.id,
        brandId: checkoutRow.brand_id,
        currency: checkoutRow.currency,
        totalAmount: checkoutRow.total_amount,
        holdExpiresAt: checkoutRow.hold_expires_at,
        paidAt: checkoutRow.paid_at,
        cancelledAt: checkoutRow.cancelled_at,
        createdBy: checkoutRow.created_by,
        createdAt: checkoutRow.created_at,
        agreementVersionId: checkoutRow.agreement_version_id ?? null,
      },
      items: rentalRows.map(toRecord),
    };
  }

  /**
   * Tạo phiên thanh toán và hóa đơn DRAFT trong một transaction.
   * Tất cả hoặc không có gì: nếu bất kỳ slot nào đang bị giữ chỗ / đã có hóa đơn -> trả `occupied: true`.
   * Nếu vượt quá BRAND_MAX_HELD_SLOTS (FR-SLT-56) -> trả `holdLimitReached: true`.
   */
  async createCheckoutTx(params: {
    readonly brandId: string;
    readonly createdBy: string;
    readonly holdExpiresAt: Date;
    readonly totalAmount: string;
    /** Hợp đồng khung hiện hành lúc tạo phiên (FR-SLT-49, ADR-0013). */
    readonly agreementVersionId?: string;
    readonly maxHeldSlots?: number;
    readonly items: CheckoutCreateItemData[];
  }): Promise<
    | { checkout: RentalCheckoutRecord; items: SlotRentalRecord[] }
    | { occupied: true }
    | { holdLimitReached: true }
  > {
    try {
      return await this.insertCheckout(params);
    } catch (error) {
      // Hai checkout cùng slot tới đồng thời: SELECT ... FOR UPDATE không khoá được dòng chưa tồn
      // tại, nên cả hai qua bước kiểm tra và ràng buộc CSDL chặn bên tới sau. Đó là kết quả đúng
      // (FR-SLT-35) — trả "đã bị giữ", không để thành lỗi 500.
      if (isSlotHoldConflict(error)) return { occupied: true };
      throw error;
    }
  }

  private async insertCheckout(params: {
    readonly brandId: string;
    readonly createdBy: string;
    readonly holdExpiresAt: Date;
    readonly totalAmount: string;
    /** Hợp đồng khung hiện hành lúc tạo phiên (FR-SLT-49, ADR-0013). */
    readonly agreementVersionId?: string;
    readonly maxHeldSlots?: number;
    readonly items: CheckoutCreateItemData[];
  }): Promise<
    | { checkout: RentalCheckoutRecord; items: SlotRentalRecord[] }
    | { occupied: true }
    | { holdLimitReached: true }
  > {
    return this.db.transaction().execute(async (tx) => {
      // FR-SLT-56 (ADR-0014): Khóa advisory theo thương hiệu để chống race condition giữ chỗ
      await sql`SELECT pg_advisory_xact_lock(hashtext(${'brand_hold_slots:' + params.brandId}))`.execute(
        tx,
      );

      if (params.maxHeldSlots !== undefined) {
        const heldRow = await tx
          .selectFrom('slot_rentals as sr')
          .innerJoin('rental_checkouts as rc', 'rc.id', 'sr.checkout_id')
          .select((eb) => eb.fn.count<string>('sr.id').as('count'))
          .where('rc.brand_id', '=', params.brandId)
          .where('rc.paid_at', 'is', null)
          .where('rc.cancelled_at', 'is', null)
          .where('rc.hold_expires_at', '>', new Date())
          .executeTakeFirstOrThrow();

        const currentHeld = Number(heldRow.count);
        if (currentHeld + params.items.length > params.maxHeldSlots) {
          return { holdLimitReached: true };
        }
      }

      const slotIds = params.items.map((i) => i.slotId);

      // Chống chồng lấn: Kiểm tra bất kỳ slot nào đã có rental blocking status
      const existing = await tx
        .selectFrom('slot_rentals')
        .select('slot_id')
        .where('slot_id', 'in', slotIds)
        .where('status', 'in', BLOCKING_STATUSES)
        .forUpdate()
        .execute();

      if (existing.length > 0) {
        return { occupied: true };
      }

      const checkoutRow = await tx
        .insertInto('rental_checkouts')
        .values({
          brand_id: params.brandId,
          currency: 'VND',
          total_amount: params.totalAmount,
          hold_expires_at: params.holdExpiresAt,
          created_by: params.createdBy,
          agreement_version_id: params.agreementVersionId ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Chèn theo thứ tự slot cố định: hai giỏ chung slot nhưng khác thứ tự ([X, Y] và [Y, X]) không
      // chờ chéo nhau trên ràng buộc chồng lấn (deadlock).
      const ordered = [...params.items].sort((a, b) => a.slotId.localeCompare(b.slotId));
      for (const item of ordered) {
        await tx
          .insertInto('slot_rentals')
          .values({
            slot_id: item.slotId,
            brand_id: params.brandId,
            checkout_id: checkoutRow.id,
            created_by: params.createdBy,
            status: 'DRAFT',
            starts_at: item.startsAt,
            ends_at: item.endsAt,
            currency: 'VND',
            rental_package_id: item.rentalPackageId,
            storage_plan_id: item.storagePlanId,
            duration_months: item.durationMonths,
            monthly_rent_price: item.monthlyRentPrice,
            discount_percent: item.discountPercent,
            storage_monthly_price: item.storageMonthlyPrice,
            storage_coverage_percent: item.storageCoveragePercent,
            storage_coverage_cap: item.storageCoverageCap,
            rent_amount: item.rentAmount,
            storage_amount: item.storageAmount,
            grace_fee_amount: '0.0000',
            total_amount: item.totalAmount,
          })
          .execute();
      }

      // Read back all created rentals with machine_id and hold_expires_at
      const rentalRows = await tx
        .selectFrom('slot_rentals as sr')
        .innerJoin('machine_slots as ms', 'ms.id', 'sr.slot_id')
        .leftJoin('rental_checkouts as rc', 'rc.id', 'sr.checkout_id')
        .selectAll('sr')
        .select(['ms.machine_id', 'rc.hold_expires_at'])
        .where('sr.checkout_id', '=', checkoutRow.id)
        .orderBy('sr.created_at', 'asc')
        .execute();

      return {
        checkout: {
          id: checkoutRow.id,
          brandId: checkoutRow.brand_id,
          currency: checkoutRow.currency,
          totalAmount: checkoutRow.total_amount,
          holdExpiresAt: checkoutRow.hold_expires_at,
          paidAt: checkoutRow.paid_at,
          cancelledAt: checkoutRow.cancelled_at,
          createdBy: checkoutRow.created_by,
          createdAt: checkoutRow.created_at,
          agreementVersionId: checkoutRow.agreement_version_id ?? null,
        },
        items: rentalRows.map(toRecord),
      };
    });
  }

  async findProductById(
    id: string,
  ): Promise<{ id: string; brandId: string; status: string } | null> {
    const row = await this.db
      .selectFrom('fragrance_products')
      .select(['id', 'brand_id', 'status'])
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    if (!row) return null;
    return { id: row.id, brandId: row.brand_id, status: row.status };
  }

  async updateProduct(
    scope: BrandScope,
    id: string,
    fragranceProductId: string,
  ): Promise<SlotRentalRecord | null> {
    const now = new Date();
    await this.db
      .updateTable('slot_rentals')
      .set({
        fragrance_product_id: fragranceProductId,
        product_assigned_at: now,
        updated_at: now,
      })
      .where('id', '=', id)
      .where(brandScopedByColumn(scope, 'brand_id'))
      .execute();

    return this.findById(scope, id);
  }

  async updatePricePerSpray(
    scope: BrandScope,
    id: string,
    pricePerSpray: string,
  ): Promise<SlotRentalRecord | null> {
    const now = new Date();
    await this.db
      .updateTable('slot_rentals')
      .set({
        price_per_spray: pricePerSpray,
        updated_at: now,
      })
      .where('id', '=', id)
      .where(brandScopedByColumn(scope, 'brand_id'))
      .execute();

    return this.findById(scope, id);
  }

  /** Khóa phiên thanh toán FOR UPDATE (dùng trong transaction thanh toán / webhook). */
  async lockCheckoutById(
    id: string,
    executor: Executor = this.db,
  ): Promise<RentalCheckoutRecord | null> {
    const row = await executor
      .selectFrom('rental_checkouts')
      .selectAll()
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();

    if (!row) return null;
    return {
      id: row.id,
      brandId: row.brand_id,
      currency: row.currency,
      totalAmount: row.total_amount,
      holdExpiresAt: row.hold_expires_at,
      paidAt: row.paid_at,
      cancelledAt: row.cancelled_at,
      createdBy: row.created_by,
      createdAt: row.created_at,
      agreementVersionId: row.agreement_version_id ?? null,
    };
  }

  /** Tra cứu phiên thanh toán không khóa (không lọc scope). */
  async findCheckoutRecordById(
    id: string,
    executor: Executor = this.db,
  ): Promise<RentalCheckoutRecord | null> {
    const row = await executor
      .selectFrom('rental_checkouts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!row) return null;
    return {
      id: row.id,
      brandId: row.brand_id,
      currency: row.currency,
      totalAmount: row.total_amount,
      holdExpiresAt: row.hold_expires_at,
      paidAt: row.paid_at,
      cancelledAt: row.cancelled_at,
      createdBy: row.created_by,
      createdAt: row.created_at,
      agreementVersionId: row.agreement_version_id ?? null,
    };
  }

  /** Lấy danh sách mọi hóa đơn của một phiên thanh toán. */
  async findRentalsByCheckoutId(
    checkoutId: string,
    executor: Executor = this.db,
  ): Promise<SlotRentalRecord[]> {
    const rows = await executor
      .selectFrom('slot_rentals as sr')
      .innerJoin('machine_slots as ms', 'ms.id', 'sr.slot_id')
      .leftJoin('rental_checkouts as rc', 'rc.id', 'sr.checkout_id')
      .selectAll('sr')
      .select(['ms.machine_id', 'rc.hold_expires_at'])
      .where('sr.checkout_id', '=', checkoutId)
      .orderBy('sr.created_at', 'asc')
      .execute();

    return rows.map(toRecord);
  }

  /** Cập nhật paid_at cho phiên thanh toán. */
  async markCheckoutPaid(
    checkoutId: string,
    paidAt: Date,
    executor: Executor = this.db,
  ): Promise<void> {
    await executor
      .updateTable('rental_checkouts')
      .set({ paid_at: paidAt, updated_at: new Date() })
      .where('id', '=', checkoutId)
      .execute();
  }

  /** Cập nhật paid_at và invoice_number cho từng hóa đơn của phiên. */
  async markRentalPaid(
    rentalId: string,
    paidAt: Date,
    invoiceNumber: string,
    executor: Executor = this.db,
  ): Promise<void> {
    await executor
      .updateTable('slot_rentals')
      .set({
        paid_at: paidAt,
        invoice_number: invoiceNumber,
        updated_at: new Date(),
      })
      .where('id', '=', rentalId)
      .execute();
  }

  /** Tìm ID các Brand Admin đang hoạt động (ACTIVE) của thương hiệu. */
  async findActiveBrandAdminIds(brandId: string, executor: Executor = this.db): Promise<string[]> {
    const rows = await executor
      .selectFrom('users as u')
      .select('u.id')
      .where('u.brand_id', '=', brandId)
      .where('u.status', '=', 'ACTIVE')
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('user_roles as ur')
            .innerJoin('roles as r', 'r.id', 'ur.role_id')
            .select('ur.id')
            .whereRef('ur.user_id', '=', 'u.id')
            .where('r.code', '=', 'BRAND_ADMIN'),
        ),
      )
      .execute();
    return rows.map((r) => r.id);
  }

  /** Chèn thông báo (FR-SLT-43). */
  async insertNotification(
    notification: {
      readonly brandId: string;
      readonly recipientUserId: string;
      readonly type: string;
      readonly channel: string;
      readonly subject: string;
      readonly content: string;
      readonly status: 'PENDING';
      readonly createdAt: Date;
    },
    executor: Executor = this.db,
  ): Promise<void> {
    await executor
      .insertInto('notifications')
      .values({
        brand_id: notification.brandId,
        recipient_user_id: notification.recipientUserId,
        type: notification.type,
        channel: notification.channel,
        subject: notification.subject,
        content: notification.content,
        status: notification.status,
        created_at: notification.createdAt,
      })
      .execute();
  }

  /**
   * FR-SLT-39: Tìm danh sách ID các phiên quá hạn giữ chỗ chưa thanh toán.
   * Dùng đúng partial index idx_checkouts_unpaid_hold (hold_expires_at).
   */
  async findExpiredCheckoutIds(
    now: Date,
    limit = 100,
    executor: Executor = this.db,
  ): Promise<string[]> {
    const rows = await executor
      .selectFrom('rental_checkouts')
      .select('id')
      .where('paid_at', 'is', null)
      .where('cancelled_at', 'is', null)
      .where('hold_expires_at', '<=', now)
      .orderBy('hold_expires_at', 'asc')
      .limit(limit)
      .execute();
    return rows.map((r) => r.id);
  }

  /**
   * FR-SLT-39: Hủy phiên thanh toán và toàn bộ hóa đơn của phiên trong cùng transaction.
   */
  async cancelCheckoutAndRentals(
    checkoutId: string,
    cancelledAt: Date,
    executor: Executor = this.db,
  ): Promise<void> {
    await executor
      .updateTable('rental_checkouts')
      .set({
        cancelled_at: cancelledAt,
        updated_at: cancelledAt,
      })
      .where('id', '=', checkoutId)
      .execute();

    await executor
      .updateTable('slot_rentals')
      .set({
        status: 'CANCELLED',
        cancelled_at: cancelledAt,
        updated_at: cancelledAt,
      })
      .where('checkout_id', '=', checkoutId)
      .execute();
  }

  /**
   * FR-USR-07 (ADR-0013): kiểm tra tài khoản người gọi có bản ghi email_verifications mà chưa xác minh không.
   * Chỉ chặn khi CÓ bản ghi và verified_at là NULL (tài khoản tự đăng ký).
   * Tài khoản do Super Admin tạo (không có bản ghi email_verifications) không bị chặn.
   */
  async hasUnverifiedEmailRecord(userId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('email_verifications')
      .select('id')
      .where('user_id', '=', userId)
      .where('verified_at', 'is', null)
      .executeTakeFirst();
    return row !== undefined;
  }

  /** FR-SLT-48 (ADR-0013): phiên bản hợp đồng khung hiện hành — tối đa một (uq_agreement_version_current). */
  async findCurrentAgreementVersion(): Promise<AgreementVersionRecord | null> {
    const row = await this.db
      .selectFrom('agreement_versions')
      .select(AGREEMENT_VERSION_COLUMNS)
      .where('is_current', '=', true)
      .executeTakeFirst();
    return row ? toAgreementVersion(row) : null;
  }

  /** FR-SLT-49 (ADR-0013): lần thương hiệu đồng ý một phiên bản hợp đồng khung. */
  async findFrameworkAcceptance(
    brandId: string,
    agreementVersionId: string,
  ): Promise<AgreementAcceptanceRecord | null> {
    const row = await this.db
      .selectFrom('agreement_acceptances')
      .select(AGREEMENT_ACCEPTANCE_COLUMNS)
      .where('brand_id', '=', brandId)
      .where('agreement_version_id', '=', agreementVersionId)
      .where('kind', '=', 'FRAMEWORK')
      .executeTakeFirst();
    return row ? toAgreementAcceptance(row) : null;
  }

  /**
   * FR-SLT-49 (ADR-0013): ghi bằng chứng đồng ý hợp đồng khung. Bảng chỉ cho thêm mới; hai yêu cầu
   * đồng thời thì uq_acceptance_framework giữ một dòng — `created = false` trả lại dòng đã có.
   */
  async insertFrameworkAcceptance(params: {
    brandId: string;
    agreementVersionId: string;
    acceptedBy: string;
    contentHash: string;
    ipAddress: string;
    userAgent: string | null;
  }): Promise<{ acceptance: AgreementAcceptanceRecord; created: boolean }> {
    const row = await this.db
      .insertInto('agreement_acceptances')
      .values({
        brand_id: params.brandId,
        agreement_version_id: params.agreementVersionId,
        accepted_by: params.acceptedBy,
        kind: 'FRAMEWORK',
        content_hash: params.contentHash,
        ip_address: params.ipAddress,
        user_agent: params.userAgent,
      })
      .onConflict((oc) =>
        oc
          .columns(['brand_id', 'agreement_version_id'])
          .where('kind', '=', 'FRAMEWORK')
          .doNothing(),
      )
      .returning(AGREEMENT_ACCEPTANCE_COLUMNS)
      .executeTakeFirst();
    if (row) return { acceptance: toAgreementAcceptance(row), created: true };

    const existing = await this.findFrameworkAcceptance(params.brandId, params.agreementVersionId);
    return { acceptance: existing!, created: false };
  }

  /** FR-SLT-50 (ADR-0013): lần thương hiệu đồng ý phụ lục của một phiên thanh toán. */
  async findAnnexAcceptance(
    rentalCheckoutId: string,
    executor: Executor = this.db,
  ): Promise<AgreementAcceptanceRecord | null> {
    const row = await executor
      .selectFrom('agreement_acceptances')
      .select(AGREEMENT_ACCEPTANCE_COLUMNS)
      .where('rental_checkout_id', '=', rentalCheckoutId)
      .where('kind', '=', 'ANNEX')
      .executeTakeFirst();
    return row ? toAgreementAcceptance(row) : null;
  }

  /**
   * FR-SLT-50 (ADR-0013): ghi bằng chứng đồng ý phụ lục. Bảng chỉ cho thêm mới; hai yêu cầu
   * đồng thời thì uq_acceptance_annex giữ một dòng — `created = false` trả lại dòng đã có.
   */
  async insertAnnexAcceptance(
    params: {
      brandId: string;
      agreementVersionId: string;
      rentalCheckoutId: string;
      acceptedBy: string;
      contentHash: string;
      ipAddress: string;
      userAgent: string | null;
    },
    executor: Executor = this.db,
  ): Promise<{ acceptance: AgreementAcceptanceRecord; created: boolean }> {
    const row = await executor
      .insertInto('agreement_acceptances')
      .values({
        brand_id: params.brandId,
        agreement_version_id: params.agreementVersionId,
        rental_checkout_id: params.rentalCheckoutId,
        accepted_by: params.acceptedBy,
        kind: 'ANNEX',
        content_hash: params.contentHash,
        ip_address: params.ipAddress,
        user_agent: params.userAgent,
      })
      .onConflict((oc) => oc.column('rental_checkout_id').where('kind', '=', 'ANNEX').doNothing())
      .returning(AGREEMENT_ACCEPTANCE_COLUMNS)
      .executeTakeFirst();
    if (row) return { acceptance: toAgreementAcceptance(row), created: true };

    const existing = await this.findAnnexAcceptance(params.rentalCheckoutId, executor);
    return { acceptance: existing!, created: false };
  }

  /**
   * FR-SLT-55 (ADR-0014): Đổi hóa đơn sang slot khác trong cùng máy khi mua nhầm.
   * Chạy trong transaction với SELECT ... FOR UPDATE trên cả hai slot và hóa đơn.
   */
  async swapSlotTx(params: {
    rentalId: string;
    brandId: string;
    targetSlotId: string;
    now: Date;
    swapWindowHours: number;
  }): Promise<
    | { success: true; updated: SlotRentalRecord }
    | { notFound: true }
    | { notAllowed: MessageKey }
    | { occupied: true }
  > {
    return this.db.transaction().execute(async (tx) => {
      const rental = await tx
        .selectFrom('slot_rentals as sr')
        .innerJoin('machine_slots as ms', 'ms.id', 'sr.slot_id')
        .selectAll('sr')
        .select(['ms.machine_id', 'ms.slot_number'])
        .where('sr.id', '=', params.rentalId)
        .forUpdate()
        .executeTakeFirst();

      if (!rental || rental.brand_id !== params.brandId) {
        return { notFound: true };
      }

      if (params.targetSlotId === rental.slot_id) {
        return { notAllowed: 'slt.slotSwapNotAllowed' };
      }

      // Khóa cả hai slot theo thứ tự UUID tăng dần để chống deadlock khi có các giao dịch hoán đổi chéo nhau
      const slotIds = [rental.slot_id, params.targetSlotId].sort();
      const lockedSlots = await tx
        .selectFrom('machine_slots')
        .selectAll()
        .where('id', 'in', slotIds)
        .orderBy('id', 'asc')
        .forUpdate()
        .execute();

      const currentSlot = lockedSlots.find((s) => s.id === rental.slot_id);
      const targetSlot = lockedSlots.find((s) => s.id === params.targetSlotId);

      if (!targetSlot || !currentSlot) {
        return { notFound: true };
      }

      if (targetSlot.machine_id !== rental.machine_id) {
        return { notAllowed: 'slt.slotSwapDifferentMachine' };
      }

      if (
        targetSlot.monthly_rent_price === null ||
        rental.monthly_rent_price === null ||
        Number(targetSlot.monthly_rent_price) !== Number(rental.monthly_rent_price)
      ) {
        return { notAllowed: 'slt.slotSwapDifferentPrice' };
      }

      if (rental.swapped_from_slot_id !== null) {
        return { notAllowed: 'slt.slotSwapAlreadySwapped' };
      }

      if (rental.status !== 'DRAFT') {
        return { notAllowed: 'slt.slotSwapNotDraft' };
      }

      if (!rental.paid_at) {
        return { notAllowed: 'slt.slotSwapUnpaid' };
      }

      const windowMs = params.swapWindowHours * 3600 * 1000;
      if (params.now.getTime() - new Date(rental.paid_at).getTime() > windowMs) {
        return { notAllowed: 'slt.slotSwapTimeExpired' };
      }

      if (currentSlot.active_bottle_id) {
        return { notAllowed: 'slt.slotSwapBottleInstalled' };
      }

      if (targetSlot.status !== 'AVAILABLE' || targetSlot.active_bottle_id !== null) {
        return { occupied: true };
      }

      const blocking = await tx
        .selectFrom('slot_rentals')
        .select('id')
        .where('slot_id', '=', params.targetSlotId)
        .where('status', 'in', BLOCKING_STATUSES)
        .executeTakeFirst();

      if (blocking) {
        return { occupied: true };
      }

      // Cập nhật slot mới cho hóa đơn, lưu dấu slot cũ (FR-SLT-55, ADR-0014)
      await tx
        .updateTable('slot_rentals')
        .set({
          slot_id: params.targetSlotId,
          swapped_from_slot_id: rental.slot_id,
          swapped_at: params.now,
          updated_at: params.now,
        })
        .where('id', '=', params.rentalId)
        .execute();

      // Đảm bảo S1 ở trạng thái AVAILABLE
      await tx
        .updateTable('machine_slots')
        .set({
          status: 'AVAILABLE',
          updated_at: params.now,
        })
        .where('id', '=', rental.slot_id)
        .execute();

      const updatedRow = await tx
        .selectFrom('slot_rentals as sr')
        .innerJoin('machine_slots as ms', 'ms.id', 'sr.slot_id')
        .leftJoin('rental_checkouts as rc', 'rc.id', 'sr.checkout_id')
        .selectAll('sr')
        .select(['ms.machine_id', 'rc.hold_expires_at'])
        .where('sr.id', '=', params.rentalId)
        .executeTakeFirstOrThrow();

      return { success: true, updated: toRecord(updatedRow) };
    });
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
    swappedFromSlotId: row.swapped_from_slot_id ?? null,
    swappedAt: row.swapped_at ?? null,
  };
}

const AGREEMENT_VERSION_COLUMNS = [
  'id',
  'version',
  'title',
  'content',
  'content_hash',
  'is_current',
  'published_at',
  'created_at',
] as const;

const AGREEMENT_ACCEPTANCE_COLUMNS = [
  'id',
  'brand_id',
  'accepted_by',
  'kind',
  'agreement_version_id',
  'rental_checkout_id',
  'content_hash',
  'accepted_at',
] as const;

function toAgreementVersion(row: {
  id: string;
  version: string;
  title: string;
  content: string;
  content_hash: string;
  is_current: boolean;
  published_at: Date | null;
  created_at: Date;
}): AgreementVersionRecord {
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    content: row.content,
    contentHash: row.content_hash,
    isCurrent: row.is_current,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

function toAgreementAcceptance(row: {
  id: string;
  brand_id: string;
  accepted_by: string;
  kind: 'FRAMEWORK' | 'ANNEX';
  agreement_version_id: string;
  rental_checkout_id: string | null;
  content_hash: string;
  accepted_at: Date;
}): AgreementAcceptanceRecord {
  return {
    id: row.id,
    brandId: row.brand_id,
    acceptedBy: row.accepted_by,
    kind: row.kind,
    agreementVersionId: row.agreement_version_id,
    rentalCheckoutId: row.rental_checkout_id,
    contentHash: row.content_hash,
    acceptedAt: row.accepted_at,
  };
}
