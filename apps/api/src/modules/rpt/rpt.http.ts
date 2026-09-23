/**
 * Cửa vào HTTP của module RPT.
 * Đường dẫn và dữ liệu theo spec/contracts/openapi.yaml, nhóm tag RPT.
 */

import { Controller, Get, Inject, Param } from '@nestjs/common';
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

const IdParam = z.string().uuid();

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
}
