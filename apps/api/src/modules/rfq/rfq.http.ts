/**
 * Cửa vào HTTP của RFQ — `/refill-requests` (tag RFQ, FR-RFQ-01 ÷ 12, ADR-0018).
 *
 *   Đọc — mọi tài khoản đã đăng nhập, phạm vi qua `brand_id` (Brand Admin chỉ thấy của mình).
 *   Tạo — `refill.request` (Brand Admin).
 *   Chấp nhận, từ chối, lên lịch, hủy — `refill.fulfill` (Super Admin, Inventory Staff).
 */

import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../../shared/http/validation.js';
import type { BrandScope } from '../../shared/scoping/index.js';
import {
  CurrentBrandScope,
  CurrentUser,
  RequirePermissions,
  type AuthenticatedUser,
} from '../auth/index.js';
import { RfqService } from './rfq.service.js';

const REFILL_REQUEST = 'refill.request';
const REFILL_FULFILL = 'refill.fulfill';

const IdParam = z.object({ id: z.string().uuid() });

const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  status: z
    .enum(['SUBMITTED', 'ACCEPTED', 'REJECTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED'])
    .optional(),
});

/** openapi `RefillRequestCreate` — lý do ngoài danh mục là VALIDATION_ERROR (FR-RFQ-02 AC2). */
const CreateBody = z.object({
  slotRentalId: z.string().uuid(),
  reason: z.enum(['LOW_STOCK', 'EXPIRING', 'PRODUCT_CHANGE']),
  note: z.string().max(2000).optional(),
});

/**
 * openapi `RejectRequest` (`{ reason }`) — AC FR-RFQ-06 gọi trường này là `rejectionReason`, contract là
 * nguồn đúng. Lý do rỗng sau khi cắt khoảng trắng bị service từ chối.
 */
const RejectBody = z.object({ reason: z.string().max(2000).optional() });

/** openapi `RefillRequestSchedule`. */
const ScheduleBody = z.object({ scheduledAt: z.coerce.date() });

@Controller('refill-requests')
export class RefillRequestsController {
  constructor(@Inject(RfqService) private readonly service: RfqService) {}

  /** FR-RFQ-04, 10 */
  @Get()
  async list(@CurrentBrandScope() scope: BrandScope, @Query() rawQuery: unknown) {
    const query = parseBody(ListQuery, rawQuery);
    const { items, total } = await this.service.list(scope, query);
    return { items, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  /** FR-RFQ-01, 02, 05, 12 */
  @Post()
  @RequirePermissions(REFILL_REQUEST)
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Body() body: unknown,
  ) {
    return this.service.create(actor, scope, parseBody(CreateBody, body));
  }

  /** FR-RFQ-06 AC1 */
  @Post(':id/accept')
  @HttpCode(200)
  @RequirePermissions(REFILL_FULFILL)
  accept(@CurrentUser() actor: AuthenticatedUser, @Param() params: unknown) {
    return this.service.accept(actor, parseBody(IdParam, params).id);
  }

  /** FR-RFQ-06 AC2, AC3 */
  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermissions(REFILL_FULFILL)
  reject(@CurrentUser() actor: AuthenticatedUser, @Param() params: unknown, @Body() body: unknown) {
    const { reason } = parseBody(RejectBody, body ?? {});
    return this.service.reject(actor, parseBody(IdParam, params).id, reason ?? '');
  }

  /** FR-RFQ-07 */
  @Post(':id/schedule')
  @HttpCode(200)
  @RequirePermissions(REFILL_FULFILL)
  schedule(
    @CurrentUser() actor: AuthenticatedUser,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { scheduledAt } = parseBody(ScheduleBody, body);
    return this.service.schedule(actor, parseBody(IdParam, params).id, scheduledAt);
  }

  /** FR-RFQ-04 AC2 */
  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions(REFILL_FULFILL)
  cancel(@CurrentUser() actor: AuthenticatedUser, @Param() params: unknown) {
    return this.service.cancel(actor, parseBody(IdParam, params).id);
  }
}
