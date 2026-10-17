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

export interface MachineMapRow {
  readonly slotId: string;
  readonly slotNumber: number;
  readonly status: SlotStatus;
  readonly mine: boolean;
  /** Chỉ khác null khi slot thuộc phạm vi khai thác của người gọi — xem ghi chú dưới. */
  readonly productName: string | null;
  readonly estimatedRemainingSprays: number;
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
}
