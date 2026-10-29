/**
 * SQL của bảo hiểm hàng hóa (FR-SLT-44 ÷ 46, ADR-0018 mục 1). Chỉ module slt được import file này
 * (QT3, ADR-0003).
 */

import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Transaction } from 'kysely';
import { DATABASE, type Database, type DB } from '../../shared/db/index.js';
import type { StorageCompensationStatus } from '../../shared/db/types.generated.js';
import {
  brandScopedByColumn,
  HOLDING_RENTAL_STATUSES,
  type BrandScope,
} from '../../shared/scoping/index.js';

type Executor = Kysely<DB>;

/** Hóa đơn có thể áp gói bảo quản — ảnh chụp tỷ lệ, hạn mức lấy lúc thanh toán (FR-SLT-33). */
export interface CoverageRental {
  readonly id: string;
  readonly brandId: string;
  readonly coveragePercent: string | null;
  readonly coverageCap: string | null;
}

export interface CompensationRecord {
  readonly id: string;
  readonly brandId: string;
  readonly brandName: string;
  readonly bottleId: string;
  readonly bottleIdentifier: string;
  readonly productName: string;
  readonly slotRentalId: string;
  readonly invoiceNumber: string | null;
  readonly storagePlanName: string | null;
  readonly damagedAt: Date | null;
  readonly bottleRetailPrice: string;
  readonly coveragePercent: string;
  readonly amount: string;
  readonly currency: string;
  readonly status: StorageCompensationStatus;
  readonly payoutReference: string | null;
  readonly paidAt: Date | null;
  readonly createdAt: Date;
}

export interface CompensationFilter {
  readonly page: number;
  readonly pageSize: number;
  readonly status?: StorageCompensationStatus | undefined;
  readonly brandId?: string | undefined;
}

const RENTAL_COLUMNS = [
  'r.id',
  'r.brand_id',
  'r.storage_coverage_percent',
  'r.storage_coverage_cap',
] as const;

function toRental(row: {
  id: string;
  brand_id: string;
  storage_coverage_percent: string | null;
  storage_coverage_cap: string | null;
}): CoverageRental {
  return {
    id: row.id,
    brandId: row.brand_id,
    coveragePercent: row.storage_coverage_percent,
    coverageCap: row.storage_coverage_cap,
  };
}

@Injectable()
export class CompensationQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  transaction<T>(work: (tx: Transaction<DB>) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(work);
  }

  /**
   * Hóa đơn đang giữ slot của chai đang lắp: đang khai thác, hoặc đã thanh toán chờ nạp hàng — cùng
   * tập với lúc mở phiếu nạp (INV `findStockableRental`).
   */
  async rentalHoldingSlot(slotId: string, executor: Executor): Promise<CoverageRental | null> {
    const row = await executor
      .selectFrom('slot_rentals as r')
      .select(RENTAL_COLUMNS)
      .where('r.slot_id', '=', slotId)
      .where((eb) =>
        eb.or([
          eb('r.status', 'in', [...HOLDING_RENTAL_STATUSES]),
          eb.and([
            eb('r.status', '=', 'DRAFT'),
            eb('r.paid_at', 'is not', null),
            eb('r.cancelled_at', 'is', null),
          ]),
        ]),
      )
      .orderBy('r.created_at', 'desc')
      .limit(1)
      .executeTakeFirst();
    return row ? toRental(row) : null;
  }

  /**
   * FR-SLT-44 AC2: chai trong kho áp gói có tỷ lệ cao nhất trong các hóa đơn hiệu lực của thương
   * hiệu. Hóa đơn đã thanh toán chờ nạp hàng cũng tính — hàng nằm kho chính là lúc đó (ADR-0018).
   * Hòa tỷ lệ thì lấy hóa đơn còn hạn mức lớn hơn, rồi hóa đơn mới hơn.
   */
  async bestBrandRental(brandId: string, executor: Executor): Promise<CoverageRental | null> {
    const row = await executor
      .selectFrom('slot_rentals as r')
      .select(RENTAL_COLUMNS)
      .select(
        sql<string>`r.storage_coverage_cap - coalesce((
          select sum(c.amount) from storage_compensations c where c.slot_rental_id = r.id
        ), 0)`.as('remaining'),
      )
      .where('r.brand_id', '=', brandId)
      .where('r.storage_coverage_percent', 'is not', null)
      .where((eb) =>
        eb.or([
          eb('r.status', 'in', [...HOLDING_RENTAL_STATUSES]),
          eb.and([
            eb('r.status', '=', 'DRAFT'),
            eb('r.paid_at', 'is not', null),
            eb('r.cancelled_at', 'is', null),
          ]),
        ]),
      )
      .orderBy('r.storage_coverage_percent', 'desc')
      .orderBy(sql`remaining`, 'desc')
      .orderBy('r.created_at', 'desc')
      .limit(1)
      .executeTakeFirst();
    return row ? toRental(row) : null;
  }

  /** Chai `RETURNED_TO_BRAND` chưa bàn giao: hóa đơn của phiếu trả hàng (FR-SLT-44, ADR-0014). */
  async rentalOfReturn(bottleReturnId: string, executor: Executor): Promise<CoverageRental | null> {
    const row = await executor
      .selectFrom('bottle_returns as br')
      .innerJoin('slot_rentals as r', 'r.id', 'br.slot_rental_id')
      .select(RENTAL_COLUMNS)
      .where('br.id', '=', bottleReturnId)
      .executeTakeFirst();
    return row ? toRental(row) : null;
  }

  /**
   * Khóa hóa đơn rồi cộng phần hạn mức đã dùng. Khóa trước khi đọc tổng: hai chai của cùng hóa đơn hỏng
   * cùng lúc thì người sau thấy khoản của người trước, không vượt hạn mức (FR-SLT-44 AC3).
   */
  async lockRentalAndUsedCoverage(rentalId: string, tx: Executor): Promise<string> {
    await tx
      .selectFrom('slot_rentals')
      .select('id')
      .where('id', '=', rentalId)
      .forUpdate()
      .execute();
    const row = await tx
      .selectFrom('storage_compensations')
      .select(sql<string>`coalesce(sum(amount), 0)::numeric(19, 4)`.as('used'))
      .where('slot_rental_id', '=', rentalId)
      .executeTakeFirstOrThrow();
    return row.used;
  }

  /** Giá bán lẻ chai đầy do thương hiệu khai (FR-PRD-05) — `null` là chưa chứng minh được giá trị. */
  async retailPriceOf(productId: string, executor: Executor): Promise<string | null> {
    const row = await executor
      .selectFrom('fragrance_products')
      .select('full_bottle_retail_price')
      .where('id', '=', productId)
      .executeTakeFirst();
    return row?.full_bottle_retail_price ?? null;
  }

  async insertCompensation(
    data: {
      readonly brandId: string;
      readonly bottleId: string;
      readonly slotRentalId: string;
      readonly bottleRetailPrice: string;
      readonly coveragePercent: string;
      readonly amount: string;
      readonly at: Date;
    },
    tx: Executor,
  ): Promise<string> {
    const row = await tx
      .insertInto('storage_compensations')
      .values({
        brand_id: data.brandId,
        bottle_id: data.bottleId,
        slot_rental_id: data.slotRentalId,
        bottle_retail_price: data.bottleRetailPrice,
        coverage_percent: data.coveragePercent,
        amount: data.amount,
        status: 'PENDING',
        created_at: data.at,
        updated_at: data.at,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async list(
    scope: BrandScope,
    filter: CompensationFilter,
  ): Promise<{ items: CompensationRecord[]; total: number }> {
    let base = this.base(this.db).where(brandScopedByColumn(scope, 'c.brand_id'));
    if (filter.status) base = base.where('c.status', '=', filter.status);
    // Lọc thương hiệu chỉ có nghĩa với tài khoản nền tảng; Brand Admin đã bị khóa theo phạm vi ở trên.
    if (filter.brandId && scope.kind === 'UNRESTRICTED') {
      base = base.where('c.brand_id', '=', filter.brandId);
    }
    const [rows, count] = await Promise.all([
      base
        .selectAll()
        .orderBy('created_at', 'desc')
        .orderBy('id', 'asc')
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize)
        .execute(),
      base.select(sql<string>`count(*)`.as('total')).executeTakeFirstOrThrow(),
    ]);
    return { items: rows.map(toRecord), total: Number(count.total) };
  }

  async find(
    scope: BrandScope,
    id: string,
    executor: Executor = this.db,
  ): Promise<CompensationRecord | null> {
    const row = await this.base(executor)
      .selectAll()
      .where('c.id', '=', id)
      .where(brandScopedByColumn(scope, 'c.brand_id'))
      .executeTakeFirst();
    return row ? toRecord(row) : null;
  }

  async lock(
    id: string,
    tx: Executor,
  ): Promise<{ brandId: string; status: StorageCompensationStatus; amount: string } | null> {
    const row = await tx
      .selectFrom('storage_compensations')
      .select(['brand_id', 'status', 'amount'])
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
    return row ? { brandId: row.brand_id, status: row.status, amount: row.amount } : null;
  }

  async markPaid(
    id: string,
    data: { readonly reference: string; readonly paidBy: string; readonly at: Date },
    tx: Executor,
  ): Promise<void> {
    await tx
      .updateTable('storage_compensations')
      .set({
        status: 'PAID',
        payout_reference: data.reference,
        paid_by: data.paidBy,
        paid_at: data.at,
        updated_at: data.at,
      })
      .where('id', '=', id)
      .execute();
  }

  /**
   * Một khoản kèm tên hiển thị. Bọc trong truy vấn con để `where`/`orderBy` dùng tên cột phẳng giống
   * nhau ở danh sách lẫn chi tiết.
   */
  private base(executor: Executor) {
    return executor.selectFrom((eb) =>
      eb
        .selectFrom('storage_compensations as sc')
        .innerJoin('brands as b', 'b.id', 'sc.brand_id')
        .innerJoin('bottles as bt', 'bt.id', 'sc.bottle_id')
        .innerJoin('fragrance_products as fp', 'fp.id', 'bt.fragrance_product_id')
        .innerJoin('slot_rentals as r', 'r.id', 'sc.slot_rental_id')
        .leftJoin('storage_plans as sp', 'sp.id', 'r.storage_plan_id')
        .select([
          'sc.id',
          'sc.brand_id',
          'b.name as brand_name',
          'sc.bottle_id',
          'bt.identifier as bottle_identifier',
          'fp.name as product_name',
          'sc.slot_rental_id',
          'r.invoice_number',
          'sp.name as storage_plan_name',
          'bt.damaged_at',
          'sc.bottle_retail_price',
          'sc.coverage_percent',
          'sc.amount',
          'sc.currency',
          'sc.status',
          'sc.payout_reference',
          'sc.paid_at',
          'sc.created_at',
        ])
        .as('c'),
    );
  }
}

function toRecord(r: {
  id: string;
  brand_id: string;
  brand_name: string;
  bottle_id: string;
  bottle_identifier: string;
  product_name: string;
  slot_rental_id: string;
  invoice_number: string | null;
  storage_plan_name: string | null;
  damaged_at: Date | null;
  bottle_retail_price: string;
  coverage_percent: string;
  amount: string;
  currency: string;
  status: StorageCompensationStatus;
  payout_reference: string | null;
  paid_at: Date | null;
  created_at: Date;
}): CompensationRecord {
  return {
    id: r.id,
    brandId: r.brand_id,
    brandName: r.brand_name,
    bottleId: r.bottle_id,
    bottleIdentifier: r.bottle_identifier,
    productName: r.product_name,
    slotRentalId: r.slot_rental_id,
    invoiceNumber: r.invoice_number,
    storagePlanName: r.storage_plan_name,
    damagedAt: r.damaged_at,
    bottleRetailPrice: r.bottle_retail_price,
    coveragePercent: r.coverage_percent,
    amount: r.amount,
    currency: r.currency,
    status: r.status,
    payoutReference: r.payout_reference,
    paidAt: r.paid_at,
    createdAt: r.created_at,
  };
}
