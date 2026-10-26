/**
 * Cửa vào HTTP của module RPT.
 * Đường dẫn và dữ liệu theo spec/contracts/openapi.yaml, nhóm tag RPT.
 */

import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../../shared/http/validation.js';
import type { BrandScope } from '../../shared/scoping/index.js';
import {
  CurrentBrandScope,
  CurrentUser,
  RequirePermissions,
  type AuthenticatedUser,
} from '../auth/index.js';
import { RptService } from './rpt.service.js';

const REPORT_BRAND = 'report.brand';
const REVENUE_MANAGE = 'revenue.manage';

const IdParam = z.string().uuid();

/** openapi `components.parameters.from/to` — ISO-8601 có offset; `from` bao gồm, `to` không. */
const PeriodQuery = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .strict();

const ProductRankingQuery = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    slotId: z.string().uuid().optional(),
    machineId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
  })
  .strict();

const RentalSalesQuery = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    groupBy: z.enum(['PACKAGE', 'STORAGE_PLAN', 'MACHINE', 'LOCATION']).default('PACKAGE'),
    machineId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
  })
  .strict();

@Controller('reports')
export class RptController {
  constructor(@Inject(RptService) private readonly reports: RptService) {}

  /**
   * FR-RPT-12: Sơ đồ slot của một máy.
   *
   * Quyền `report.brand` chứ không phải `machine.manage`: đây là màn hình của Brand Admin.
   * Platform Super Admin có đủ mọi quyền nên vẫn gọi được, và phạm vi UNRESTRICTED làm mọi slot
   * hiện `mine = true` (FR-BND-07).
   */
  @Get('machine-map/:machineId')
  @RequirePermissions(REPORT_BRAND)
  getMachineMap(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Param('machineId') machineId: string,
  ) {
    return this.reports.getMachineMap(actor, scope, parseBody(IdParam, machineId));
  }

  /** FR-RPT-08, FR-RPT-10: số đơn và doanh thu theo từng slot thương hiệu thuê. */
  @Get('brand-slots')
  @RequirePermissions(REPORT_BRAND)
  getBrandSlots(@CurrentBrandScope() scope: BrandScope, @Query() query: unknown) {
    return this.reports.getBrandSlotReport(scope, parseBody(PeriodQuery, query));
  }

  /** FR-RPT-06, FR-RPT-10: xếp hạng sản phẩm theo lượt được chọn trên kiosk. */
  @Get('product-ranking')
  @RequirePermissions(REPORT_BRAND)
  getProductRanking(@CurrentBrandScope() scope: BrandScope, @Query() query: unknown) {
    return this.reports.getProductRanking(scope, parseBody(ProductRankingQuery, query));
  }

  /** FR-SLT-47, FR-RPT-15: doanh thu bán gói — chỉ Super Admin (`revenue.manage`). */
  @Get('rental-sales')
  @RequirePermissions(REVENUE_MANAGE)
  getRentalSales(@CurrentBrandScope() scope: BrandScope, @Query() query: unknown) {
    return this.reports.getRentalSales(scope, parseBody(RentalSalesQuery, query));
  }
}
