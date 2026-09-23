/**
 * Truy vấn của module RPT. Chỉ module rpt được import file này (QT3, ADR-0003).
 */

import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE, type Database } from '../../shared/db/index.js';
import {
  brandHoldsSlotNow,
  brandScopedByColumn,
  HOLDING_RENTAL_STATUSES,
  type BrandScope,
} from '../../shared/scoping/index.js';
import type { SlotStatus } from '../../shared/db/types.generated.js';

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
}
