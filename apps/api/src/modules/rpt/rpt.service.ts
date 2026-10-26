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
import { AppError, invalidField, notFoundFor } from '../../shared/errors/index.js';
import type { BrandScope, Principal } from '../../shared/scoping/index.js';
import { RptQueries, type MachineMapRow, type ReportPeriod } from './rpt.queries.js';

export type MachineMapSlotDto = Schema<'MachineMapSlot'>;
export type BrandSlotReportDto = Schema<'BrandSlotReportItem'>;

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

  /**
   * FR-RPT-08, FR-RPT-10: số đơn và doanh thu theo từng slot thương hiệu thuê, trong `[from, to)`
   * theo thời điểm khách trả tiền. Bỏ trống mốc nào thì không giới hạn phía đó. Tài khoản mức nền
   * tảng thấy mọi thương hiệu (FR-BND-07).
   */
  async getBrandSlotReport(scope: BrandScope, period: ReportPeriod): Promise<BrandSlotReportDto[]> {
    if (period.from && period.to && period.from >= period.to) {
      throw invalidField('to', 'validation.periodEndBeforeStart');
    }
    const rows = await this.queries.brandSlotReport(scope, period);
    return rows.map((row) => ({
      slotRentalId: row.slotRentalId,
      slotId: row.slotId,
      machineId: row.machineId,
      locationName: row.locationName,
      ...(row.productName !== null ? { productName: row.productName } : {}),
      orderCount: row.orderCount,
      revenue: row.revenue,
    }));
  }

  /**
   * FR-RPT-01, FR-RPT-03, FR-RPT-04, FR-RPT-15: Dashboard nền tảng (chỉ Platform Super Admin).
   */
  async getPlatformDashboard(scope: BrandScope, period: ReportPeriod) {
    if (scope.kind !== 'UNRESTRICTED') {
      throw new AppError('FORBIDDEN_SCOPE', 'common.outOfScope');
    }
    if (period.from && period.to && period.from >= period.to) {
      throw invalidField('to', 'validation.periodEndBeforeStart');
    }
    return this.queries.platformDashboard(period);
  }

  /**
   * FR-RPT-02, FR-RPT-10: Chuỗi thời gian đơn hàng và doanh thu.
   */
  async getOrdersTimeseries(
    scope: BrandScope,
    period: ReportPeriod,
    granularity: 'DAY' | 'WEEK' | 'MONTH' = 'DAY',
  ) {
    if (period.from && period.to && period.from >= period.to) {
      throw invalidField('to', 'validation.periodEndBeforeStart');
    }
    return this.queries.ordersTimeseries(scope, period, granularity);
  }

  /**
   * FR-INV-21, FR-RPT-07: Báo cáo tồn kho slot và máy.
   */
  async getInventoryReport(
    scope: BrandScope,
    filter: { lowStockOnly?: boolean; machineId?: string; fragranceProductId?: string },
  ) {
    return this.queries.inventoryReport(scope, filter);
  }
}
