/**
 * Cửa vào HTTP cho module EXP (Trả hàng khi không gia hạn) — FR-EXP-26, FR-EXP-27, FR-EXP-28.
 */

import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../../shared/http/validation.js';
import type { BrandScope } from '../../shared/scoping/index.js';
import {
  CurrentBrandScope,
  CurrentUser,
  RequirePermissions,
  type AuthenticatedUser,
} from '../auth/index.js';
import {
  ExpService,
  type BottleReturn,
  type BottleReturnCreate,
  type BottleReturnHandover,
} from './exp.service.js';

const INVENTORY_MANAGE = 'inventory.manage';

const IdParam = z.object({ id: z.string().uuid() });

const ListReturnsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  open: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  brandId: z.string().uuid().optional(),
});

const BottleReturnCreateBody = z.object({
  slotRentalId: z.string().uuid(),
  bottles: z
    .array(
      z.object({
        bottleId: z.string().uuid(),
      }),
    )
    .min(1),
});

const BottleReturnHandoverBody = z.object({
  recipientName: z.string().trim().min(1).max(255),
  handedOverAt: z.string().datetime().optional(),
  trackingNumber: z.string().trim().max(100).optional(),
});

@Controller('bottle-returns')
export class ExpHttp {
  constructor(@Inject(ExpService) private readonly expService: ExpService) {}

  /**
   * GET /bottle-returns: Danh sách phiếu trả hàng (hỗ trợ Brand Admin lọc theo brandId).
   */
  @Get()
  async listBottleReturns(
    @CurrentBrandScope() scope: BrandScope,
    @Query() rawQuery: unknown,
  ): Promise<{ items: BottleReturn[]; meta: { page: number; pageSize: number; total: number } }> {
    const query = ListReturnsQuery.parse(rawQuery);
    const { items, total } = await this.expService.listBottleReturns(scope, query);
    return {
      items,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
      },
    };
  }

  /**
   * POST /bottle-returns: Tháo chai & Lập phiếu trả hàng (FR-EXP-26).
   */
  @Post()
  @RequirePermissions(INVENTORY_MANAGE)
  async createBottleReturn(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() rawBody: unknown,
  ): Promise<BottleReturn> {
    const input = parseBody(BottleReturnCreateBody, rawBody) as BottleReturnCreate;
    return this.expService.createBottleReturn(actor, input);
  }

  /**
   * GET /bottle-returns/:id: Chi tiết phiếu trả hàng.
   */
  @Get(':id')
  async getBottleReturn(
    @CurrentBrandScope() scope: BrandScope,
    @Param() rawParam: unknown,
  ): Promise<BottleReturn> {
    const { id } = IdParam.parse(rawParam);
    return this.expService.getBottleReturn(scope, id);
  }

  /**
   * POST /bottle-returns/:id/handover: Bàn giao hàng trả về (FR-EXP-27).
   */
  @Post(':id/handover')
  @RequirePermissions(INVENTORY_MANAGE)
  async handOverBottleReturn(
    @CurrentUser() actor: AuthenticatedUser,
    @Param() rawParam: unknown,
    @Body() rawBody: unknown,
  ): Promise<BottleReturn> {
    const { id } = IdParam.parse(rawParam);
    const input = parseBody(BottleReturnHandoverBody, rawBody) as BottleReturnHandover;
    return this.expService.handOverBottleReturn(actor, id, input);
  }
}
