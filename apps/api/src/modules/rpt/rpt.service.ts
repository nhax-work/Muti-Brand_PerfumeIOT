/**
 * Nghiệp vụ báo cáo (module RPT).
 *
 * Hiện chỉ có sơ đồ máy (FR-RPT-12) — đây là đường DUY NHẤT để Brand Admin nhìn thấy slot của mình
 * trên một máy dùng chung. Các endpoint báo cáo còn lại trong `spec/contracts/openapi.yaml`
 * (`/reports/platform-dashboard`, `/reports/orders-timeseries`, `/reports/product-ranking`,
 * `/reports/brand-slots`, `/reports/inventory`) chưa được hiện thực.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { notFoundFor } from '../../shared/errors/index.js';
import type { BrandScope, Principal } from '../../shared/scoping/index.js';
import { RptQueries, type MachineMapRow } from './rpt.queries.js';

export type MachineMapSlotDto = Schema<'MachineMapSlot'>;

/**
 * Slot ngoài phạm vi khai thác: đúng ba trường, không hơn.
 *
 * Dựng một object MỚI thay vì xóa trường khỏi object đã có — thêm cột vào truy vấn sau này sẽ
 * không âm thầm chảy ra ngoài qua đường này (FR-RPT-12, FR-BND-08 AC3, BR-012).
 */
function toForeignSlotDto(row: MachineMapRow): MachineMapSlotDto {
  return { slotNumber: row.slotNumber, mine: false, available: false };
}

function toOwnSlotDto(row: MachineMapRow): MachineMapSlotDto {
  return {
    slotNumber: row.slotNumber,
    mine: true,
    available: row.status === 'AVAILABLE',
    slotId: row.slotId,
    productName: row.productName,
    estimatedRemainingSprays: row.estimatedRemainingSprays,
  };
}

@Injectable()
export class RptService {
  constructor(@Inject(RptQueries) private readonly queries: RptQueries) {}

  /**
   * FR-RPT-12: Brand Admin chỉ thấy slot thuộc hợp đồng của mình; slot còn lại là `mine = false`,
   * `available = false` và không kèm thông tin nào khác.
   *
   * Máy mà người gọi không còn khai thác slot nào bị từ chối như thể không tồn tại. Nếu không,
   * thương hiệu chỉ cần duyệt id máy là đếm được toàn bộ máy và số slot của nền tảng — đúng thứ
   * BR-012 cấm. Tài khoản mức nền tảng không bị chặn này (FR-BND-07).
   */
  async getMachineMap(
    principal: Principal,
    scope: BrandScope,
    machineId: string,
  ): Promise<MachineMapSlotDto[]> {
    if (!(await this.queries.machineExists(machineId))) {
      throw notFoundFor(principal);
    }
    if (!(await this.queries.holdsAnySlotOnMachine(scope, machineId))) {
      throw notFoundFor(principal);
    }

    const rows = await this.queries.machineMap(scope, machineId);
    return rows.map((row) => (row.mine ? toOwnSlotDto(row) : toForeignSlotDto(row)));
  }
}
