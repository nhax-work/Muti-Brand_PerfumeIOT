/**
 * Cửa vào HTTP của module SLT (Hợp đồng thuê slot - FR-SLT-01..29).
 * Mọi endpoint đòi quyền `rental.manage`.
 * Đường dẫn và dữ liệu theo spec/contracts/openapi.yaml, nhóm tag SLT.
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
import { SltService } from './slt.service.js';

const RENTAL_MANAGE = 'rental.manage';
const RENTAL_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'EXPIRING',
  'GRACE',
  'RENEWED',
  'LIQUIDATED',
  'CLOSED',
  'TERMINATED',
] as const;

const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  slotId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  status: z.enum(RENTAL_STATUSES).optional(),
});

const moneySchema = z.string().regex(/^\d+(\.\d{1,4})?$/, 'Giá phải là chuỗi số thập phân');

const CreateBody = z.object({
  slotId: z.string().uuid(),
  brandId: z.string().uuid(),
  fragranceProductId: z.string().uuid().optional(),
  requestId: z.string().uuid().optional(),
  previousRentalId: z.string().uuid().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  pricePerSpray: moneySchema,
  currency: z.string().length(3).optional(),
  fixedFee: moneySchema.optional(),
  revenueSharePercent: z.coerce.number().min(0).max(100).optional(),
});

const IdParam = z.string().uuid();

@Controller('slot-rentals')
@RequirePermissions(RENTAL_MANAGE)
export class SltController {
  constructor(@Inject(SltService) private readonly service: SltService) {}

  @Get()
  async list(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Query() rawQuery: unknown,
  ) {
    const query = ListQuery.parse(rawQuery);
    const { items, total } = await this.service.list(actor, scope, query);
    return { items, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  @Get(':id')
  async get(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Param('id') idParam: unknown,
  ) {
    const id = IdParam.parse(idParam);
    return this.service.get(actor, scope, id);
  }

  @Post()
  @HttpCode(201)
  async create(@CurrentUser() actor: AuthenticatedUser, @Body() rawBody: unknown) {
    const body = parseBody(CreateBody, rawBody);
    return this.service.create(actor, body);
  }

  @Post(':id/activate')
  @HttpCode(200)
  async activate(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Param('id') idParam: unknown,
  ) {
    const id = IdParam.parse(idParam);
    return this.service.activate(actor, scope, id);
  }
}
