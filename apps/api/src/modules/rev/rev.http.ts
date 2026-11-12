/**
 * Cửa vào HTTP của REV. Đường dẫn và dữ liệu theo spec/contracts/openapi.yaml (tag SLT cho
 * /brand-payouts, /settlements; tag REV cho /revenue/split).
 *
 *   Đọc kỳ chi trả, bảng đối soát, khiếu nại — `report.brand`, phạm vi qua `bp.brand_id`.
 *   Chuyển PAID, trả lời khiếu nại, doanh thu tách hai nguồn — `revenue.manage` (chỉ Super Admin).
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
import { RevService } from './rev.service.js';

const REPORT_BRAND = 'report.brand';
const REVENUE_MANAGE = 'revenue.manage';

const IdParam = z.object({ id: z.string().uuid() });
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const PayoutQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  brandId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'CONFIRMED', 'PAID']).optional(),
});

/** openapi `BrandPayoutPay`, `BrandPayoutDispute`, `BrandPayoutDisputeResponse`. */
const PayBody = z.object({ transferReference: z.string().trim().min(1).max(100) });
const DisputeBody = z.object({ note: z.string().trim().min(1).max(2000) });
const DisputeResponseBody = z.object({ response: z.string().trim().min(1).max(2000) });

const SettlementQuery = z.object({
  brandId: z.string().uuid().optional(),
  periodStart: IsoDate,
  periodEnd: IsoDate,
});

const SplitQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  machineId: z.string().uuid().optional(),
});

@Controller('brand-payouts')
export class BrandPayoutsController {
  constructor(@Inject(RevService) private readonly service: RevService) {}

  @Get()
  @RequirePermissions(REPORT_BRAND)
  async list(@CurrentBrandScope() scope: BrandScope, @Query() rawQuery: unknown) {
    const query = parseBody(PayoutQuery, rawQuery);
    const { items, total } = await this.service.listPayouts(scope, query);
    return { items, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  @Get(':id')
  @RequirePermissions(REPORT_BRAND)
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Param() params: unknown,
  ) {
    return this.service.getPayout(actor, scope, parseBody(IdParam, params).id);
  }

  /** FR-SLT-53: thao tác chuyển tiền — xác thực lại (FR-AUTH-09). */
  @Post(':id/pay')
  @HttpCode(200)
  @RequirePermissions(REVENUE_MANAGE)
  @RequireReauth()
  pay(@CurrentUser() actor: AuthenticatedUser, @Param() params: unknown, @Body() body: unknown) {
    const { transferReference } = parseBody(PayBody, body);
    return this.service.pay(actor, parseBody(IdParam, params).id, transferReference);
  }

  @Post(':id/dispute')
  @HttpCode(200)
  @RequirePermissions(REPORT_BRAND)
  dispute(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { note } = parseBody(DisputeBody, body);
    return this.service.dispute(actor, scope, parseBody(IdParam, params).id, note);
  }

  @Post(':id/dispute-response')
  @HttpCode(200)
  @RequirePermissions(REVENUE_MANAGE)
  respond(
    @CurrentUser() actor: AuthenticatedUser,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { response } = parseBody(DisputeResponseBody, body);
    return this.service.respondToDispute(actor, parseBody(IdParam, params).id, response);
  }
}

@Controller()
export class RevenueController {
  constructor(@Inject(RevService) private readonly service: RevService) {}

  @Get('settlements')
  @RequirePermissions(REPORT_BRAND)
  settlement(@CurrentBrandScope() scope: BrandScope, @Query() rawQuery: unknown) {
    return this.service.settlement(scope, parseBody(SettlementQuery, rawQuery));
  }

  @Get('revenue/split')
  @RequirePermissions(REVENUE_MANAGE)
  split(@CurrentBrandScope() scope: BrandScope, @Query() rawQuery: unknown) {
    return this.service.revenueSplit(scope, parseBody(SplitQuery, rawQuery));
  }
}
