/**
 * Cửa vào HTTP của bảo hiểm hàng hóa — `/storage-compensations` (tag SLT, FR-SLT-44 ÷ 46).
 *
 *   Đọc — `report.brand`: Brand Admin thấy khoản của mình, Super Admin thấy tất cả.
 *   Ghi nhận chi trả — `revenue.manage` (cùng nhóm tiền với kỳ chi trả, chỉ Super Admin) + xác thực lại.
 *
 * Khoản bồi thường không có endpoint tạo: nó sinh ra khi INV ghi nhận chai hư hỏng
 * (`POST /bottles/{id}/mark-damaged`, ADR-0018).
 */

import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../../shared/http/validation.js';
import type { BrandScope } from '../../shared/scoping/index.js';
import {
  CurrentBrandScope,
  CurrentUser,
  RequirePermissions,
  RequireReauth,
  type AuthenticatedUser,
} from '../auth/index.js';
import { CompensationService } from './compensation.service.js';

const REPORT_BRAND = 'report.brand';
const REVENUE_MANAGE = 'revenue.manage';

const IdParam = z.object({ id: z.string().uuid() });

const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  status: z.enum(['PENDING', 'PAID']).optional(),
  brandId: z.string().uuid().optional(),
});

/** openapi `StorageCompensationPayout`. */
const PayoutBody = z.object({ payoutReference: z.string().trim().min(1).max(200) });

@Controller('storage-compensations')
export class StorageCompensationsController {
  constructor(@Inject(CompensationService) private readonly service: CompensationService) {}

  @Get()
  @RequirePermissions(REPORT_BRAND)
  async list(@CurrentBrandScope() scope: BrandScope, @Query() rawQuery: unknown) {
    const query = parseBody(ListQuery, rawQuery);
    const { items, total } = await this.service.list(scope, query);
    return { items, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  /** FR-SLT-45: thao tác chuyển tiền — xác thực lại (FR-AUTH-09). */
  @Post(':id/payout')
  @HttpCode(200)
  @RequirePermissions(REVENUE_MANAGE)
  @RequireReauth()
  payout(@CurrentUser() actor: AuthenticatedUser, @Param() params: unknown, @Body() body: unknown) {
    const { payoutReference } = parseBody(PayoutBody, body);
    return this.service.payout(actor, parseBody(IdParam, params).id, payoutReference);
  }
}
