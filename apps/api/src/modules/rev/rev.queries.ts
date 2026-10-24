/**
 * SQL của module REV: `brand_payouts` (kỳ chi trả, FR-SLT-52..54), bảng đối soát (FR-SLT-17, 18) và
 * doanh thu tách hai nguồn (FR-REV-04). Chỉ module rev được import file này (QT3, ADR-0003).
 *
 * Mọi con số tiền đều tính trên CÙNG một tập đơn — `countedOrders` — để kỳ chi trả, bảng đối soát và
 * báo cáo RPT không bao giờ lệch nhau (ADR-0013 mục 3).
 */

import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type RawBuilder, type Transaction } from 'kysely';
import { DATABASE, type Database, type DB } from '../../shared/db/index.js';
import type { BrandPayoutStatus } from '../../shared/db/types.generated.js';
import { brandScopedByColumn, type BrandScope } from '../../shared/scoping/index.js';
import { REVENUE_ORDER_STATUSES } from '../rpt/index.js';

type Executor = Kysely<DB>;

/** Kỳ là tháng dương lịch theo giờ Việt Nam (ADR-0013 mục 3) — không phụ thuộc múi giờ của máy. */
export const PAYOUT_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export interface PayoutRecord {
  readonly id: string;
  readonly brandId: string;
  /** `YYYY-MM-DD` — đọc bằng to_char để không lệch ngày theo múi giờ của tiến trình Node. */
  readonly periodMonth: string;
  readonly status: BrandPayoutStatus;
  readonly currency: string;
  readonly orderCount: number;
  readonly amount: string;
  readonly confirmedAt: Date | null;
  readonly paidAt: Date | null;
  readonly transferReference: string | null;
  readonly disputeNote: string | null;
  readonly disputedAt: Date | null;
  readonly disputeResponse: string | null;
  readonly disputeResolvedAt: Date | null;
  readonly createdAt: Date;
}

export interface PayoutFilter {
  readonly page: number;
  readonly pageSize: number;
  readonly brandId?: string | undefined;
  readonly status?: BrandPayoutStatus | undefined;
}

export interface SettlementLineRecord {
  readonly rentalId: string;
  readonly slotId: string;
  readonly machineId: string;
  readonly orderCount: number;
  readonly sprayRevenue: string;
}

export interface RevenueSplitRecord {
  readonly brandRevenue: string;
  readonly platformRevenue: string;
  readonly orderCountBrand: number;
  readonly orderCountPlatform: number;
}

/**
 * Đơn được tính tiền (FR-SLT-18, ADR-0013 mục 3): DISPENSED hoặc FORFEITED, theo `paid_at`. Không trừ
 * phí cổng hay khoản hoàn — đơn FAILED/REFUND_PENDING/REFUNDED vốn không thuộc tập này.
 */
function countedOrders(alias: string): RawBuilder<boolean> {
  return sql<boolean>`${sql.ref(`${alias}.status`)} = any(${sql.val(REVENUE_ORDER_STATUSES)}::order_status[])
    and ${sql.ref(`${alias}.paid_at`)} is not null`;
}

/** Ngày đầu tháng (giờ Việt Nam) chứa mốc `at`. */
function vnMonthOf(at: RawBuilder<unknown>): RawBuilder<string> {
  return sql<string>`date_trunc('month', ${at} at time zone ${PAYOUT_TIME_ZONE})::date`;
}

const PAYOUT_COLUMNS = [
  'bp.id',
  'bp.brand_id',
  'bp.status',
  'bp.currency',
  'bp.order_count',
  'bp.amount',
  'bp.confirmed_at',
  'bp.paid_at',
  'bp.transfer_reference',
  'bp.dispute_note',
  'bp.disputed_at',
  'bp.dispute_response',
  'bp.dispute_resolved_at',
  'bp.created_at',
] as const;

@Injectable()
export class RevQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  transaction<T>(work: (tx: Transaction<DB>) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(work);
  }

  // -----------------------------------------------------------------------------------
  // Job kỳ chi trả (FR-SLT-52 AC3, AC4)
  // -----------------------------------------------------------------------------------

  /**
   * Tính lại mọi kỳ còn DRAFT từ đầu và tạo kỳ mới cho tháng có đơn mà chưa có kỳ. Kỳ đã CONFIRMED
   * hay PAID không bao giờ bị ghi lại (`WHERE status = 'DRAFT'` ở nhánh ON CONFLICT).
   *
   * Không giới hạn khoảng thời gian: tháng bị bỏ lỡ vì dịch vụ tắt lâu vẫn được tạo kỳ ở lần chạy sau.
   *
   * @returns số kỳ được tạo mới hoặc đổi số liệu
   */
  async refreshDraftPayouts(executor: Executor): Promise<number> {
    const result = await sql`
      insert into brand_payouts (brand_id, period_month, order_count, amount)
      select o.brand_id, ${vnMonthOf(sql`o.paid_at`)}, count(*), sum(o.amount)
        from orders o
       where o.revenue_owner = 'BRAND'
         and ${countedOrders('o')}
       group by 1, 2
      on conflict (brand_id, period_month) do update
         set order_count = excluded.order_count,
             amount = excluded.amount
       where brand_payouts.status = 'DRAFT'
         and (brand_payouts.order_count, brand_payouts.amount)
             is distinct from (excluded.order_count, excluded.amount)`.execute(executor);
    return Number(result.numAffectedRows ?? 0);
  }

  /**
   * Chốt mọi kỳ DRAFT của tháng đã kết thúc (giờ Việt Nam) tính tới `now`. Gọi ngay sau
   * `refreshDraftPayouts` trong cùng transaction để số được khóa là số vừa tính lại.
   */
  async confirmEndedPeriods(now: Date, executor: Executor): Promise<number> {
    const result = await executor
      .updateTable('brand_payouts')
      .set({ status: 'CONFIRMED', confirmed_at: now })
      .where('status', '=', 'DRAFT')
      .where(sql<boolean>`period_month < ${vnMonthOf(sql`${now}::timestamptz`)}`)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  // -----------------------------------------------------------------------------------
  // Kỳ chi trả — đọc và chuyển trạng thái
  // -----------------------------------------------------------------------------------

  async listPayouts(
    scope: BrandScope,
    filter: PayoutFilter,
  ): Promise<{ items: PayoutRecord[]; total: number }> {
    let base = this.db
      .selectFrom('brand_payouts as bp')
      .where(brandScopedByColumn(scope, 'bp.brand_id'));
    // Lọc theo thương hiệu chỉ có nghĩa với Super Admin; Brand Admin đã bị khóa vào thương hiệu mình.
    if (filter.brandId && scope.kind === 'UNRESTRICTED') {
      base = base.where('bp.brand_id', '=', filter.brandId);
    }
    if (filter.status) base = base.where('bp.status', '=', filter.status);

    const [count, rows] = await Promise.all([
      base.select((eb) => eb.fn.countAll<string>().as('total')).executeTakeFirstOrThrow(),
      base
        .select(PAYOUT_COLUMNS)
        .select(sql<string>`to_char(bp.period_month, 'YYYY-MM-DD')`.as('period_month'))
        .orderBy('bp.period_month', 'desc')
        .orderBy('bp.brand_id')
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize)
        .execute(),
    ]);
    return { items: rows.map(toPayoutRecord), total: Number(count.total) };
  }

  async findPayout(scope: BrandScope, id: string): Promise<PayoutRecord | null> {
    const row = await this.db
      .selectFrom('brand_payouts as bp')
      .select(PAYOUT_COLUMNS)
      .select(sql<string>`to_char(bp.period_month, 'YYYY-MM-DD')`.as('period_month'))
      .where('bp.id', '=', id)
      .where(brandScopedByColumn(scope, 'bp.brand_id'))
      .executeTakeFirst();
    return row ? toPayoutRecord(row) : null;
  }

  /** Khóa kỳ để chuyển trạng thái — hai thao tác cùng lúc trên một kỳ chạy tuần tự. */
  async lockPayout(
    scope: BrandScope,
    id: string,
    executor: Executor,
  ): Promise<PayoutRecord | null> {
    const row = await executor
      .selectFrom('brand_payouts as bp')
      .select(PAYOUT_COLUMNS)
      .select(sql<string>`to_char(bp.period_month, 'YYYY-MM-DD')`.as('period_month'))
      .where('bp.id', '=', id)
      .where(brandScopedByColumn(scope, 'bp.brand_id'))
      .forUpdate()
      .executeTakeFirst();
    return row ? toPayoutRecord(row) : null;
  }

  async markPaid(
    id: string,
    change: { readonly transferReference: string; readonly paidBy: string; readonly at: Date },
    executor: Executor,
  ): Promise<void> {
    await executor
      .updateTable('brand_payouts')
      .set({
        status: 'PAID',
        paid_at: change.at,
        paid_by: change.paidBy,
        transfer_reference: change.transferReference,
      })
      .where('id', '=', id)
      .execute();
  }

  async markDisputed(
    id: string,
    change: { readonly note: string; readonly by: string; readonly at: Date },
    executor: Executor,
  ): Promise<void> {
    await executor
      .updateTable('brand_payouts')
      .set({ dispute_note: change.note, disputed_at: change.at, disputed_by: change.by })
      .where('id', '=', id)
      .execute();
  }

  async markDisputeResolved(
    id: string,
    change: { readonly response: string; readonly by: string; readonly at: Date },
    executor: Executor,
  ): Promise<void> {
    await executor
      .updateTable('brand_payouts')
      .set({
        dispute_response: change.response,
        dispute_resolved_at: change.at,
        dispute_resolved_by: change.by,
      })
      .where('id', '=', id)
      .execute();
  }

  /**
   * Điều kiện chuyển PAID (ADR-0013 mục 3, schema.sql §13 mục 13): đã xác minh pháp nhân VÀ có tài
   * khoản nhận doanh thu. Chỉ đọc hai cờ, không bao giờ đọc bản mã hóa tài khoản.
   */
  async brandPayoutReadiness(
    brandId: string,
    executor: Executor,
  ): Promise<{ readonly verified: boolean; readonly hasPayoutAccount: boolean } | null> {
    const row = await executor
      .selectFrom('brands')
      .select((eb) => [
        eb('legal_verified_at', 'is not', null).as('verified'),
        eb('payout_account_ciphertext', 'is not', null).as('has_payout_account'),
      ])
      .where('id', '=', brandId)
      .executeTakeFirst();
    if (!row) return null;
    return { verified: Boolean(row.verified), hasPayoutAccount: Boolean(row.has_payout_account) };
  }

  // -----------------------------------------------------------------------------------
  // Người nhận thông báo
  // -----------------------------------------------------------------------------------

  async activeUserIdsWithRole(
    roleCode: 'PLATFORM_SUPER_ADMIN' | 'BRAND_ADMIN',
    brandId: string | null,
    executor: Executor,
  ): Promise<string[]> {
    let query = executor
      .selectFrom('users as u')
      .innerJoin('user_roles as ur', 'ur.user_id', 'u.id')
      .innerJoin('roles as r', 'r.id', 'ur.role_id')
      .select('u.id')
      .distinct()
      .where('r.code', '=', roleCode)
      .where('u.status', '=', 'ACTIVE');
    query =
      brandId === null
        ? query.where('u.brand_id', 'is', null)
        : query.where('u.brand_id', '=', brandId);
    return (await query.execute()).map((r) => r.id);
  }

  async insertNotification(
    notification: {
      readonly brandId: string;
      readonly recipientUserId: string;
      readonly type: string;
      readonly subject: string;
      readonly content: string;
      readonly at: Date;
    },
    executor: Executor,
  ): Promise<void> {
    await executor
      .insertInto('notifications')
      .values({
        brand_id: notification.brandId,
        recipient_user_id: notification.recipientUserId,
        type: notification.type,
        channel: 'IN_APP',
        subject: notification.subject,
        content: notification.content,
        status: 'PENDING',
        created_at: notification.at,
      })
      .execute();
  }

  // -----------------------------------------------------------------------------------
  // Bảng đối soát (FR-SLT-17, 18, FR-REV-05) và doanh thu tách hai nguồn (FR-REV-04)
  // -----------------------------------------------------------------------------------

  /**
   * Một dòng cho mỗi hóa đơn của thương hiệu có đơn được tính trong kỳ. Ngày đầu/cuối là ngày theo
   * giờ Việt Nam, cả hai đều bao gồm.
   *
   * Lọc đơn bằng `o.brand_id = :brand AND o.revenue_owner = 'BRAND'` (FR-REV-05) — đơn bán hàng thanh
   * lý mang brand_id cũ nhưng tiền thuộc nền tảng.
   */
  async settlementLines(
    brandId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<SettlementLineRecord[]> {
    const rows = await this.db
      .selectFrom('orders as o')
      .innerJoin('machine_slots as s', 's.id', 'o.slot_id')
      .select(['o.slot_rental_id', 'o.slot_id', 's.machine_id', 's.slot_number'])
      .select(sql<string>`count(*)`.as('order_count'))
      .select(sql<string>`sum(o.amount)::numeric(19, 4)`.as('spray_revenue'))
      .where('o.brand_id', '=', brandId)
      .where('o.revenue_owner', '=', 'BRAND')
      .where(countedOrders('o'))
      .where(
        sql<boolean>`o.paid_at >= (${periodStart}::date)::timestamp at time zone ${PAYOUT_TIME_ZONE}`,
      )
      .where(
        sql<boolean>`o.paid_at < (${periodEnd}::date + 1)::timestamp at time zone ${PAYOUT_TIME_ZONE}`,
      )
      .groupBy(['o.slot_rental_id', 'o.slot_id', 's.machine_id', 's.slot_number'])
      .orderBy('s.machine_id')
      .orderBy('s.slot_number')
      .execute();
    return rows.map((r) => ({
      rentalId: r.slot_rental_id,
      slotId: r.slot_id,
      machineId: r.machine_id,
      orderCount: Number(r.order_count),
      sprayRevenue: r.spray_revenue,
    }));
  }

  /** FR-REV-04: tổng hai nguồn trên cùng tập đơn được tính, khoảng `[from, to)` theo `paid_at`. */
  async revenueSplit(filter: {
    readonly from: Date;
    readonly to: Date;
    readonly machineId?: string | undefined;
  }): Promise<RevenueSplitRecord> {
    let query = this.db
      .selectFrom('orders as o')
      .select([
        sql<string>`coalesce(sum(o.amount) filter (where o.revenue_owner = 'BRAND'), 0)::numeric(19, 4)`.as(
          'brand_revenue',
        ),
        sql<string>`coalesce(sum(o.amount) filter (where o.revenue_owner = 'PLATFORM'), 0)::numeric(19, 4)`.as(
          'platform_revenue',
        ),
        sql<string>`count(*) filter (where o.revenue_owner = 'BRAND')`.as('count_brand'),
        sql<string>`count(*) filter (where o.revenue_owner = 'PLATFORM')`.as('count_platform'),
      ])
      .where(countedOrders('o'))
      .where('o.paid_at', '>=', filter.from)
      .where('o.paid_at', '<', filter.to);
    if (filter.machineId) query = query.where('o.machine_id', '=', filter.machineId);
    const row = await query.executeTakeFirstOrThrow();
    return {
      brandRevenue: row.brand_revenue,
      platformRevenue: row.platform_revenue,
      orderCountBrand: Number(row.count_brand),
      orderCountPlatform: Number(row.count_platform),
    };
  }
}

interface PayoutRow {
  readonly id: string;
  readonly brand_id: string;
  readonly period_month: string;
  readonly status: BrandPayoutStatus;
  readonly currency: string;
  readonly order_count: number;
  readonly amount: string;
  readonly confirmed_at: Date | null;
  readonly paid_at: Date | null;
  readonly transfer_reference: string | null;
  readonly dispute_note: string | null;
  readonly disputed_at: Date | null;
  readonly dispute_response: string | null;
  readonly dispute_resolved_at: Date | null;
  readonly created_at: Date;
}

function toPayoutRecord(r: PayoutRow): PayoutRecord {
  return {
    id: r.id,
    brandId: r.brand_id,
    periodMonth: r.period_month,
    status: r.status,
    currency: r.currency,
    orderCount: r.order_count,
    amount: r.amount,
    confirmedAt: r.confirmed_at,
    paidAt: r.paid_at,
    transferReference: r.transfer_reference,
    disputeNote: r.dispute_note,
    disputedAt: r.disputed_at,
    disputeResponse: r.dispute_response,
    disputeResolvedAt: r.dispute_resolved_at,
    createdAt: r.created_at,
  };
}
