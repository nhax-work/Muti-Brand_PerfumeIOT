/**
 * Truy vấn của module RPT. Chỉ module rpt được import file này (QT3, ADR-0003).
 */

import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE, type Database } from '../../shared/db/index.js';
import {
  brandHoldsSlotNow,
  brandScopedByColumn,
  brandScopedOrders,
  HOLDING_RENTAL_STATUSES,
  type BrandScope,
} from '../../shared/scoping/index.js';
import type { OrderStatus, SlotStatus } from '../../shared/db/types.generated.js';

/**
 * Đơn được tính vào doanh thu của thương hiệu (ADR-0013 mục 3, FR-SLT-18): khách đã nhận lượt xịt,
 * hoặc đã bỏ lượt (FR-ORD-27 vẫn ghi doanh thu). Kỳ chi trả (FR-SLT-52) phải dùng đúng tập này để
 * số trên báo cáo khớp số được chuyển trả.
 */
export const REVENUE_ORDER_STATUSES: readonly OrderStatus[] = ['DISPENSED', 'FORFEITED'];

export interface BrandSlotReportRow {
  readonly slotRentalId: string;
  readonly slotId: string;
  readonly machineId: string;
  readonly locationName: string;
  readonly productName: string | null;
  readonly orderCount: number;
  readonly revenue: string;
}

export interface ReportPeriod {
  /** Bao gồm. */
  readonly from?: Date | undefined;
  /** Không bao gồm. */
  readonly to?: Date | undefined;
}

/** Nhóm của báo cáo doanh thu bán gói (openapi `RentalSalesReport.groupBy`). */
export type RentalSalesGroupBy = 'PACKAGE' | 'STORAGE_PLAN' | 'MACHINE' | 'LOCATION';

export interface RentalSalesFilter {
  /** Bao gồm, theo `paid_at`. */
  readonly from: Date;
  /** Không bao gồm. */
  readonly to: Date;
  readonly groupBy: RentalSalesGroupBy;
  readonly machineId?: string | undefined;
  readonly locationId?: string | undefined;
}

export interface RentalSalesAmountsRow {
  readonly invoiceCount: number;
  readonly rentAmount: string;
  readonly storageAmount: string;
  readonly graceFeeAmount: string;
  readonly totalAmount: string;
}

export interface RentalSalesRow extends RentalSalesAmountsRow {
  readonly key: string;
  readonly label: string;
}

export interface ProductRankingFilter extends ReportPeriod {
  readonly slotId?: string | undefined;
  readonly machineId?: string | undefined;
  readonly locationId?: string | undefined;
}

export interface ProductRankingRow {
  readonly fragranceProductId: string;
  readonly productName: string;
  readonly impressionCount: number;
  readonly selectionCount: number;
  readonly orderCount: number;
}

/** Cột khóa và nhãn theo từng cách nhóm — chỉ chọn từ danh sách cố định này, không nối chuỗi vào SQL. */
const RENTAL_SALES_GROUP_COLUMNS: Readonly<
  Record<RentalSalesGroupBy, { readonly key: string; readonly label: string }>
> = {
  PACKAGE: { key: 'rp.id', label: 'rp.name' },
  STORAGE_PLAN: { key: 'sp.id', label: 'sp.name' },
  MACHINE: { key: 'm.id', label: 'm.display_name' },
  LOCATION: { key: 'l.id', label: 'l.name' },
};

export interface MachineMapRow {
  readonly slotId: string;
  readonly slotNumber: number;
  readonly status: SlotStatus;
  readonly mine: boolean;
  /** Chỉ khác null khi slot thuộc phạm vi khai thác của người gọi — xem ghi chú dưới. */
  readonly productName: string | null;
  readonly estimatedRemainingSprays: number;
  /**
   * Chai đang lắp ở LOW/EMPTY, hoặc lượng còn lại chạm `low_stock_threshold_ml` của slot — gợi ý tạo
   * yêu cầu bổ sung (FR-RFQ-03, ADR-0018). Chỉ được đưa ra ngoài cho slot của người gọi.
   */
  readonly lowStock: boolean;
}

@Injectable()
export class RptQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async machineExists(machineId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('machines')
      .select('id')
      .where('id', '=', machineId)
      .executeTakeFirst();
    return row !== undefined;
  }

  /** Người gọi có còn khai thác ít nhất một slot trên máy này không (FR-RPT-12, BR-012). */
  async holdsAnySlotOnMachine(scope: BrandScope, machineId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('machine_slots as s')
      .select('s.id')
      .where('s.machine_id', '=', machineId)
      .where(brandHoldsSlotNow(scope, 's.id'))
      .executeTakeFirst();
    return row !== undefined;
  }

  /**
   * Sơ đồ slot của một máy.
   *
   * `product_name` lấy qua truy vấn con ĐÃ gắn phạm vi: tên sản phẩm của thương hiệu khác không
   * bao giờ được CSDL trả về, thay vì trả về rồi trông chờ tầng trên xóa đi. Một lớp chặn ở tầng
   * trình bày là một lớp chặn có thể quên (BR-012).
   */
  async machineMap(scope: BrandScope, machineId: string): Promise<MachineMapRow[]> {
    const rows = await this.db
      .selectFrom('machine_slots as s')
      .select(['s.id as slot_id', 's.slot_number', 's.status', 's.estimated_remaining_sprays'])
      .select(sql<boolean>`${brandHoldsSlotNow(scope, 's.id')}`.as('mine'))
      .select(
        sql<boolean>`coalesce((select b.status in ('LOW', 'EMPTY') from bottles b
                                where b.id = s.active_bottle_id), false)
          or (s.low_stock_threshold_ml is not null
              and s.estimated_remaining_ml <= s.low_stock_threshold_ml)`.as('low_stock'),
      )
      .select((eb) =>
        eb
          .selectFrom('slot_rentals as r')
          .innerJoin('fragrance_products as fp', 'fp.id', 'r.fragrance_product_id')
          .whereRef('r.slot_id', '=', 's.id')
          // Hai điều kiện, thiếu cái nào cũng rò: trạng thái để không bốc phải hợp đồng DRAFT hay
          // CLOSED của bên khác trên cùng slot, và brand_id để tên sản phẩm luôn là của người gọi.
          .where('r.status', 'in', [...HOLDING_RENTAL_STATUSES])
          .where(brandScopedByColumn(scope, 'r.brand_id'))
          .select('fp.name')
          .limit(1)
          .as('product_name'),
      )
      .where('s.machine_id', '=', machineId)
      .orderBy('s.slot_number', 'asc')
      .execute();

    return rows.map((r) => ({
      slotId: r.slot_id,
      slotNumber: r.slot_number,
      status: r.status,
      mine: r.mine,
      productName: r.product_name ?? null,
      estimatedRemainingSprays: r.estimated_remaining_sprays,
      lowStock: r.low_stock,
    }));
  }

  /**
   * FR-RPT-08, FR-RPT-10: số đơn và doanh thu theo từng hóa đơn thuê slot của thương hiệu.
   *
   * Phạm vi đặt ở HAI chỗ, cùng lúc: hóa đơn lọc theo `r.brand_id`, đơn lọc bằng `brandScopedOrders`
   * (kèm `revenue_owner = BRAND`) — đơn bán hàng đã thanh lý của slot cũ mang `brand_id` của thương
   * hiệu nhưng tiền thuộc nền tảng, không được cộng vào (FR-REV-06, FR-EXP-20).
   *
   * Hóa đơn được liệt kê khi thương hiệu còn khai thác slot (ACTIVE, EXPIRING, GRACE), đã trả tiền
   * chờ nạp hàng, hoặc có đơn được tính trong kỳ — để xem lại kỳ cũ của hóa đơn đã kết thúc.
   */
  async brandSlotReport(scope: BrandScope, period: ReportPeriod): Promise<BrandSlotReportRow[]> {
    const counted = sql<boolean>`o.status = any(${sql.val(REVENUE_ORDER_STATUSES)}::order_status[])
        and ${brandScopedOrders(scope, 'o')}
        and o.revenue_owner = 'BRAND'
        and (${period.from ?? null}::timestamptz is null or o.paid_at >= ${period.from ?? null})
        and (${period.to ?? null}::timestamptz is null or o.paid_at < ${period.to ?? null})`;

    const rows = await this.db
      .selectFrom('slot_rentals as r')
      .innerJoin('machine_slots as s', 's.id', 'r.slot_id')
      .innerJoin('machines as m', 'm.id', 's.machine_id')
      .innerJoin('locations as l', 'l.id', 'm.location_id')
      .leftJoin('fragrance_products as fp', 'fp.id', 'r.fragrance_product_id')
      .leftJoin('orders as o', (join) =>
        join.onRef('o.slot_rental_id', '=', 'r.id').on(sql<boolean>`${counted}`),
      )
      .select([
        'r.id as rental_id',
        'r.slot_id',
        's.machine_id',
        's.slot_number',
        'l.name as location_name',
        'fp.name as product_name',
      ])
      .select(sql<string>`count(o.id)`.as('order_count'))
      .select(sql<string>`coalesce(sum(o.amount), 0)::numeric(19, 4)`.as('revenue'))
      .where(brandScopedByColumn(scope, 'r.brand_id'))
      .groupBy(['r.id', 'r.slot_id', 's.machine_id', 's.slot_number', 'l.name', 'fp.name'])
      .having((eb) =>
        eb.or([
          eb('r.status', 'in', [...HOLDING_RENTAL_STATUSES]),
          eb.and([eb('r.status', '=', 'DRAFT'), eb('r.paid_at', 'is not', null)]),
          sql<boolean>`count(o.id) > 0`,
        ]),
      )
      .orderBy('s.machine_id')
      .orderBy('s.slot_number')
      .execute();

    return rows.map((r) => ({
      slotRentalId: r.rental_id,
      slotId: r.slot_id,
      machineId: r.machine_id,
      locationName: r.location_name,
      productName: r.product_name ?? null,
      orderCount: Number(r.order_count),
      revenue: r.revenue,
    }));
  }

  /**
   * FR-SLT-47: doanh thu bán gói thuê và gói bảo quản theo `paid_at` trong `[from, to)`.
   *
   * Chỉ hóa đơn mua theo gói (`rental_package_id` có giá trị — ADR-0006) đã thanh toán và không bị hủy.
   * Hóa đơn mô hình cũ không có ảnh chụp số tiền gói nên không thuộc báo cáo này. Tổng và từng nhóm tính
   * trên cùng một tập hóa đơn, nên cộng các nhóm luôn bằng tổng.
   */
  async rentalSales(
    filter: RentalSalesFilter,
  ): Promise<{ totals: RentalSalesAmountsRow; items: RentalSalesRow[] }> {
    const group = RENTAL_SALES_GROUP_COLUMNS[filter.groupBy];
    const base = this.db
      .selectFrom('slot_rentals as r')
      .innerJoin('rental_packages as rp', 'rp.id', 'r.rental_package_id')
      .innerJoin('storage_plans as sp', 'sp.id', 'r.storage_plan_id')
      .innerJoin('machine_slots as s', 's.id', 'r.slot_id')
      .innerJoin('machines as m', 'm.id', 's.machine_id')
      .innerJoin('locations as l', 'l.id', 'm.location_id')
      .where('r.paid_at', 'is not', null)
      .where('r.cancelled_at', 'is', null)
      .where('r.status', '<>', 'CANCELLED')
      .where('r.paid_at', '>=', filter.from)
      .where('r.paid_at', '<', filter.to)
      .$if(filter.machineId !== undefined, (qb) => qb.where('m.id', '=', filter.machineId!))
      .$if(filter.locationId !== undefined, (qb) => qb.where('l.id', '=', filter.locationId!));

    const amounts = [
      sql<string>`count(r.id)`.as('invoice_count'),
      sql<string>`coalesce(sum(r.rent_amount), 0)::numeric(19, 4)`.as('rent_amount'),
      sql<string>`coalesce(sum(r.storage_amount), 0)::numeric(19, 4)`.as('storage_amount'),
      sql<string>`coalesce(sum(r.grace_fee_amount), 0)::numeric(19, 4)`.as('grace_fee_amount'),
      sql<string>`coalesce(sum(r.total_amount), 0)::numeric(19, 4)`.as('total_amount'),
    ] as const;
    const [totals, rows] = await Promise.all([
      base.select(amounts).executeTakeFirstOrThrow(),
      base
        .select([
          sql<string>`${sql.ref(group.key)}`.as('group_key'),
          sql<string>`${sql.ref(group.label)}`.as('group_label'),
          ...amounts,
        ])
        .groupBy([sql.ref(group.key), sql.ref(group.label)])
        .orderBy(sql`total_amount`, 'desc')
        .orderBy(sql`group_label`, 'asc')
        .execute(),
    ]);
    return {
      totals: amountsOf(totals),
      items: rows.map((r) => ({ key: r.group_key, label: r.group_label, ...amountsOf(r) })),
    };
  }

  /**
   * FR-RPT-01, FR-RPT-03, FR-RPT-04, FR-RPT-15: Số liệu dashboard nền tảng.
   */
  async platformDashboard(period: ReportPeriod) {
    const connRows = await this.db
      .selectFrom('machines')
      .select(['status', sql<string>`count(id)`.as('count')])
      .groupBy('status')
      .execute();
    const machinesByConnectionStatus: Record<string, number> = {};
    for (const r of connRows) {
      machinesByConnectionStatus[r.status] = Number(r.count);
    }

    const modeRows = await this.db
      .selectFrom('machines')
      .select(['operating_mode', sql<string>`count(id)`.as('count')])
      .groupBy('operating_mode')
      .execute();
    const machinesByOperatingMode: Record<string, number> = {};
    for (const r of modeRows) {
      machinesByOperatingMode[r.operating_mode] = Number(r.count);
    }

    let orderQuery = this.db.selectFrom('orders');
    if (period.from) orderQuery = orderQuery.where('created_at', '>=', period.from);
    if (period.to) orderQuery = orderQuery.where('created_at', '<', period.to);

    const statusRows = await orderQuery
      .select(['status', sql<string>`count(id)`.as('count')])
      .groupBy('status')
      .execute();
    const byStatus: Record<string, number> = {};
    let totalOrders = 0;
    for (const r of statusRows) {
      const c = Number(r.count);
      byStatus[r.status] = c;
      totalOrders += c;
    }

    let revQuery = this.db.selectFrom('orders').where('status', 'in', ['DISPENSED', 'FORFEITED']);
    if (period.from) revQuery = revQuery.where('paid_at', '>=', period.from);
    if (period.to) revQuery = revQuery.where('paid_at', '<', period.to);
    const revRes = await revQuery
      .select(sql<string>`coalesce(sum(amount), 0)::numeric(19, 4)`.as('total_revenue'))
      .executeTakeFirst();
    const revenueAmount = revRes?.total_revenue ?? '0';

    // FR-RPT-04: Tách bạch DISPENSED, FAILED, FORFEITED (không tính FORFEITED vào lỗi kỹ thuật)
    const successCount = byStatus['DISPENSED'] ?? 0;
    const failureCount = byStatus['FAILED'] ?? 0;
    const unknownCount = byStatus['EXPIRED'] ?? 0;
    const totalTech = successCount + failureCount;
    const successRate = totalTech > 0 ? Number((successCount / totalTech).toFixed(4)) : 1;

    const alertRes = await this.db
      .selectFrom('alerts')
      .where('status', 'in', ['OPEN', 'ACKNOWLEDGED'])
      .select((eb) => eb.fn.count<string>('id').as('count'))
      .executeTakeFirst();
    const openAlerts = Number(alertRes?.count ?? 0);

    const ticketRes = await this.db
      .selectFrom('maintenance_tickets')
      .where('status', 'in', ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_PART', 'POST_TEST'])
      .select((eb) => eb.fn.count<string>('id').as('count'))
      .executeTakeFirst();
    const openTickets = Number(ticketRes?.count ?? 0);

    // Bảng tỷ lệ từng máy (FR-RPT-04, ADR-0015)
    const machineOutcomeRows = await this.db
      .selectFrom('machines as m')
      .innerJoin('locations as l', 'l.id', 'm.location_id')
      .leftJoin('orders as o', (join) =>
        join
          .onRef('o.machine_id', '=', 'm.id')
          .on('o.status', 'in', ['DISPENSED', 'FORFEITED', 'FAILED'])
          .on(
            sql<boolean>`(${period.from ?? null}::timestamptz is null or o.paid_at >= ${period.from ?? null})`,
          )
          .on(
            sql<boolean>`(${period.to ?? null}::timestamptz is null or o.paid_at < ${period.to ?? null})`,
          ),
      )
      .select([
        'm.id as machine_id',
        'm.serial_number',
        'm.display_name',
        'm.status as connection_status',
        'm.operating_mode',
        'l.name as location_name',
        sql<string>`count(case when o.status = 'DISPENSED' then 1 end)`.as('success_count'),
        sql<string>`count(case when o.status = 'FORFEITED' then 1 end)`.as('forfeited_count'),
        sql<string>`count(case when o.status = 'FAILED' then 1 end)`.as('failure_count'),
        sql<string>`count(o.id)`.as('total_paid_orders'),
      ])
      .groupBy([
        'm.id',
        'm.serial_number',
        'm.display_name',
        'm.status',
        'm.operating_mode',
        'l.name',
      ])
      .orderBy('m.serial_number')
      .execute();

    const machineBreakdown = machineOutcomeRows.map((r) => {
      const sCount = Number(r.success_count);
      const forfCount = Number(r.forfeited_count);
      const fCount = Number(r.failure_count);
      const totalPaid = Number(r.total_paid_orders);

      const techTotal = sCount + fCount;
      const mSuccessRate = techTotal > 0 ? Number((sCount / techTotal).toFixed(4)) : 1;
      const mForfeitedRate = totalPaid > 0 ? Number((forfCount / totalPaid).toFixed(4)) : 0;
      const mFailureRate = techTotal > 0 ? Number((fCount / techTotal).toFixed(4)) : 0;

      return {
        machineId: r.machine_id,
        serialNumber: r.serial_number,
        displayName: r.display_name,
        locationName: r.location_name,
        connectionStatus: r.connection_status,
        operatingMode: r.operating_mode,
        totalPaidOrders: totalPaid,
        successCount: sCount,
        forfeitedCount: forfCount,
        failureCount: fCount,
        successRate: mSuccessRate,
        forfeitedRate: mForfeitedRate,
        failureRate: mFailureRate,
        forfeitedAlert: mForfeitedRate > 0.1, // Cảnh báo vượt ngưỡng 10%
      };
    });

    return {
      machinesByConnectionStatus,
      machinesByOperatingMode,
      orders: {
        total: totalOrders,
        byStatus,
        revenue: {
          amount: revenueAmount,
          currency: 'VND' as const,
        },
        currency: 'VND' as const,
      },
      dispense: {
        successCount,
        failureCount,
        unknownCount,
        successRate,
      },
      openAlerts,
      openTickets,
      machineBreakdown,
    };
  }

  /**
   * FR-RPT-02, FR-RPT-10: Chuỗi thời gian đơn hàng và doanh thu.
   */
  async ordersTimeseries(
    scope: BrandScope,
    period: ReportPeriod,
    granularity: 'DAY' | 'WEEK' | 'MONTH',
  ): Promise<
    Array<{ bucket: string; orderCount: number; revenue: { amount: string; currency: 'VND' } }>
  > {
    const truncUnit = granularity === 'MONTH' ? 'month' : granularity === 'WEEK' ? 'week' : 'day';

    const counted = sql<boolean>`o.status in ('DISPENSED', 'FORFEITED')
      and ${brandScopedOrders(scope, 'o')}
      and (${scope.kind === 'BRAND' ? sql`o.revenue_owner = 'BRAND'` : sql`1=1`})
      and (${period.from ?? null}::timestamptz is null or o.paid_at >= ${period.from ?? null})
      and (${period.to ?? null}::timestamptz is null or o.paid_at < ${period.to ?? null})`;

    const rows = await this.db
      .selectFrom('orders as o')
      .select([
        sql<string>`date_trunc(${sql.val(truncUnit)}, o.paid_at)::text`.as('bucket'),
        sql<string>`count(o.id)`.as('order_count'),
        sql<string>`coalesce(sum(o.amount), 0)::numeric(19, 4)`.as('revenue'),
      ])
      .where(counted)
      .groupBy(sql`date_trunc(${sql.val(truncUnit)}, o.paid_at)`)
      .orderBy(sql`date_trunc(${sql.val(truncUnit)}, o.paid_at)`, 'asc')
      .execute();

    return rows.map((r) => ({
      bucket: new Date(r.bucket).toISOString(),
      orderCount: Number(r.order_count),
      revenue: {
        amount: r.revenue,
        currency: 'VND' as const,
      },
    }));
  }

  /**
   * FR-INV-21, FR-RPT-07: Báo cáo tồn kho slot và máy.
   */
  async inventoryReport(
    scope: BrandScope,
    filter: { lowStockOnly?: boolean; machineId?: string; fragranceProductId?: string },
  ) {
    let base = this.db
      .selectFrom('machine_slots as s')
      .innerJoin('machines as m', 'm.id', 's.machine_id')
      .innerJoin('locations as l', 'l.id', 'm.location_id')
      .leftJoin('slot_rentals as r', (join) =>
        join.onRef('r.slot_id', '=', 's.id').on('r.status', 'in', [...HOLDING_RENTAL_STATUSES]),
      )
      .leftJoin('fragrance_products as fp', 'fp.id', 'r.fragrance_product_id')
      .leftJoin('bottles as b', (join) => join.onRef('b.id', '=', 's.active_bottle_id'));

    if (scope.kind === 'BRAND') {
      base = base.where('r.brand_id', '=', scope.brandId);
    }
    if (filter.machineId) {
      base = base.where('m.id', '=', filter.machineId);
    }
    if (filter.fragranceProductId) {
      base = base.where('r.fragrance_product_id', '=', filter.fragranceProductId);
    }

    const rows = await base
      .select([
        'r.brand_id',
        'r.fragrance_product_id',
        'fp.name as product_name',
        'b.batch_id',
        's.machine_id',
        's.id as slot_id',
        's.slot_number',
        's.status as slot_status',
        's.estimated_remaining_sprays',
        's.estimated_remaining_ml',
        's.low_stock_threshold_ml',
        'm.serial_number as machine_serial',
        'l.name as location_name',
      ])
      .execute();

    const items = rows
      .filter((r) => r.brand_id && r.fragrance_product_id)
      .map((r) => {
        const sprays = r.estimated_remaining_sprays ?? 0;
        const remainingMl = Number(r.estimated_remaining_ml ?? (sprays * 0.1).toFixed(1));
        const threshold = Number(r.low_stock_threshold_ml ?? 10);
        const isLow = remainingMl <= threshold || sprays < 50;
        return {
          brandId: r.brand_id!,
          fragranceProductId: r.fragrance_product_id!,
          productName: r.product_name ?? undefined,
          batchId: r.batch_id ?? null,
          machineId: r.machine_id,
          slotId: r.slot_id,
          estimatedRemainingMl: remainingMl,
          estimatedRemainingSprays: sprays,
          lowStock: isLow,
        };
      });

    if (filter.lowStockOnly) {
      return items.filter((i) => i.lowStock);
    }

    return items;
  }

  /**
   * FR-RPT-06: xếp hạng sản phẩm theo số lượt được chọn trên kiosk (`kiosk_interaction_events`), kèm số
   * đơn đã thanh toán trong cùng khoảng và bộ lọc.
   *
   * Phạm vi ở cả hai nguồn: sự kiện lọc theo `e.brand_id`, đơn lọc bằng `brandScopedOrders` (kèm
   * `revenue_owner = BRAND`). Với tài khoản thương hiệu, sự kiện của hóa đơn đã LIQUIDATED bị loại hẳn:
   * bảng sự kiện không ghi chủ sở hữu doanh thu, mà sau thanh lý slot bán hàng của nền tảng. Mất phần lịch
   * sử trước thanh lý vẫn hơn để thương hiệu thấy hoạt động bán hàng của nền tảng (FR-EXP-20).
   */
  async productRanking(
    scope: BrandScope,
    filter: ProductRankingFilter,
  ): Promise<ProductRankingRow[]> {
    const { from, to, slotId, machineId, locationId } = filter;
    const rows = await this.db
      .selectFrom('kiosk_interaction_events as e')
      .innerJoin('fragrance_products as fp', 'fp.id', 'e.fragrance_product_id')
      .innerJoin('machines as m', 'm.id', 'e.machine_id')
      .innerJoin('slot_rentals as r', 'r.id', 'e.slot_rental_id')
      .where(brandScopedByColumn(scope, 'e.brand_id'))
      .$if(scope.kind === 'BRAND', (qb) => qb.where('r.status', '<>', 'LIQUIDATED'))
      .$if(from !== undefined, (qb) => qb.where('e.occurred_at', '>=', from!))
      .$if(to !== undefined, (qb) => qb.where('e.occurred_at', '<', to!))
      .$if(slotId !== undefined, (qb) => qb.where('e.slot_id', '=', slotId!))
      .$if(machineId !== undefined, (qb) => qb.where('e.machine_id', '=', machineId!))
      .$if(locationId !== undefined, (qb) => qb.where('m.location_id', '=', locationId!))
      .select([
        'e.fragrance_product_id',
        'fp.name as product_name',
        sql<string>`count(*) filter (where e.event_type = 'PRODUCT_IMPRESSION')`.as('impressions'),
        sql<string>`count(*) filter (where e.event_type = 'PRODUCT_SELECTED')`.as('selections'),
      ])
      .select((eb) =>
        eb
          .selectFrom('orders as o')
          .innerJoin('machines as om', 'om.id', 'o.machine_id')
          .whereRef('o.fragrance_product_id', '=', 'e.fragrance_product_id')
          .where(brandScopedOrders(scope, 'o'))
          .where('o.paid_at', 'is not', null)
          .$if(from !== undefined, (qb) => qb.where('o.paid_at', '>=', from!))
          .$if(to !== undefined, (qb) => qb.where('o.paid_at', '<', to!))
          .$if(slotId !== undefined, (qb) => qb.where('o.slot_id', '=', slotId!))
          .$if(machineId !== undefined, (qb) => qb.where('o.machine_id', '=', machineId!))
          .$if(locationId !== undefined, (qb) => qb.where('om.location_id', '=', locationId!))
          .select(sql<string>`count(*)`.as('n'))
          .as('order_count'),
      )
      .groupBy(['e.fragrance_product_id', 'fp.name'])
      .orderBy(sql`selections`, 'desc')
      .orderBy('fp.name', 'asc')
      .execute();
    return rows.map((r) => ({
      fragranceProductId: r.fragrance_product_id,
      productName: r.product_name,
      impressionCount: Number(r.impressions),
      selectionCount: Number(r.selections),
      orderCount: Number(r.order_count ?? 0),
    }));
  }
}

function amountsOf(r: {
  invoice_count: string;
  rent_amount: string;
  storage_amount: string;
  grace_fee_amount: string;
  total_amount: string;
}): RentalSalesAmountsRow {
  return {
    invoiceCount: Number(r.invoice_count),
    rentAmount: r.rent_amount,
    storageAmount: r.storage_amount,
    graceFeeAmount: r.grace_fee_amount,
    totalAmount: r.total_amount,
  };
}
