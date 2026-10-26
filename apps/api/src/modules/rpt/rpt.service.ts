/**
 * Nghiệp vụ báo cáo (module RPT).
 *
 * Sơ đồ máy (FR-RPT-12) — đường DUY NHẤT để Brand Admin nhìn thấy slot của mình trên một máy dùng
 * chung —, báo cáo theo slot (FR-RPT-08), xếp hạng sản phẩm (FR-RPT-06) và doanh thu bán gói
 * (FR-SLT-47, chỉ Super Admin).
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { CLOCK, type Clock } from '../../shared/clock.js';
import { AppError, invalidField, notFoundFor } from '../../shared/errors/index.js';
import type { BrandScope, Principal } from '../../shared/scoping/index.js';
import {
  RptQueries,
  type MachineMapRow,
  type ProductRankingFilter,
  type ReportPeriod,
  type RentalSalesGroupBy,
} from './rpt.queries.js';

export type MachineMapSlotDto = Schema<'MachineMapSlot'>;
export type BrandSlotReportDto = Schema<'BrandSlotReportItem'>;
export type ProductRankingDto = Schema<'ProductRankingItem'>;
export type RentalSalesReportDto = Schema<'RentalSalesReport'>;

/** Việt Nam không có giờ mùa hè — lệch cố định UTC+7. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Ngày đầu tháng chứa `at`, theo giờ Việt Nam, dưới dạng mốc UTC. */
function vnMonthStart(at: Date): Date {
  const local = new Date(at.getTime() + VN_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - VN_OFFSET_MS);
}

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
    lowStock: row.lowStock,
  };
}

@Injectable()
export class RptService {
  constructor(
    @Inject(RptQueries) private readonly queries: RptQueries,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

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
   * FR-RPT-06: xếp hạng sản phẩm theo lượt được chọn trên kiosk. Brand Admin chỉ thấy sản phẩm của mình
   * (BR-007, BR-012) — phạm vi áp ở truy vấn.
   */
  async getProductRanking(
    scope: BrandScope,
    filter: ProductRankingFilter,
  ): Promise<ProductRankingDto[]> {
    if (filter.from && filter.to && filter.from >= filter.to) {
      throw invalidField('to', 'validation.periodEndBeforeStart');
    }
    return this.queries.productRanking(scope, filter);
  }

  /**
   * FR-SLT-47, FR-RPT-15: doanh thu bán gói của nền tảng. Mặc định từ đầu tháng hiện tại (giờ Việt Nam)
   * tới hiện tại. Quyền `revenue.manage` chỉ Super Admin có; kiểm phạm vi thêm một lần để tài khoản
   * thương hiệu không bao giờ thấy doanh thu nền tảng dù được cấp nhầm quyền.
   */
  async getRentalSales(
    scope: BrandScope,
    filter: {
      readonly from?: Date | undefined;
      readonly to?: Date | undefined;
      readonly groupBy: RentalSalesGroupBy;
      readonly machineId?: string | undefined;
      readonly locationId?: string | undefined;
    },
  ): Promise<RentalSalesReportDto> {
    if (scope.kind !== 'UNRESTRICTED') {
      throw new AppError('FORBIDDEN_SCOPE', 'common.outOfScope');
    }
    const now = this.clock.now();
    const to = filter.to ?? now;
    const from = filter.from ?? vnMonthStart(now);
    if (from >= to) throw invalidField('to', 'validation.periodEndBeforeStart');
    const { totals, items } = await this.queries.rentalSales({ ...filter, from, to });
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      currency: 'VND',
      groupBy: filter.groupBy,
      totals,
      items,
    };
  }
}
