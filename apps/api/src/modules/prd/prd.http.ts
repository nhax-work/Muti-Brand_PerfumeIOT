/**
 * Cửa vào HTTP của module PRD.
 * Mọi endpoint đòi quyền `product.manage` (FR-PRD-01..05).
 * Đường dẫn và dữ liệu theo spec/contracts/openapi.yaml, nhóm tag PRD.
 */

import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../../shared/http/validation.js';
import type { BrandScope } from '../../shared/scoping/index.js';
import {
  CurrentBrandScope,
  CurrentUser,
  RequirePermissions,
  type AuthenticatedUser,
} from '../auth/index.js';
import { PrdService } from './prd.service.js';

const PRODUCT_MANAGE = 'product.manage';
const PRODUCT_STATUSES = ['ACTIVE', 'DISCONTINUED'] as const;

/** openapi.yaml: components.parameters page/pageSize (tối đa 200). */
const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  status: z.enum(PRODUCT_STATUSES).optional(),
});

/** Money regex: chuỗi số thập phân dương tối đa 4 chữ số sau dấu chấm. */
const moneySchema = z.string().regex(/^\d+(\.\d{1,4})?$/, 'Giá phải là chuỗi số thập phân');

/** openapi.yaml: ProductCreate. */
const CreateBody = z.object({
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  fragranceNotes: z.record(z.string(), z.unknown()).optional(),
  imageUrl: z.string().url().optional(),
  defaultPrice: moneySchema,
  currency: z.string().length(3).optional(),
  fullBottleRetailPrice: moneySchema.optional(),
  fullBottleVolumeMl: z.coerce.number().positive().optional(),
});

const UpdateBody = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  fragranceNotes: z.record(z.string(), z.unknown()).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  defaultPrice: moneySchema.optional(),
  currency: z.string().length(3).optional(),
  fullBottleRetailPrice: moneySchema.nullable().optional(),
  fullBottleVolumeMl: z.coerce.number().positive().nullable().optional(),
});

const IdParam = z.string().uuid();

@Controller('products')
@RequirePermissions(PRODUCT_MANAGE)
export class PrdController {
  constructor(@Inject(PrdService) private readonly products: PrdService) {}

  /** FR-PRD-03: Brand Admin xem sản phẩm thương hiệu mình; Platform Super Admin xem tất cả. */
  @Get()
  async list(@CurrentBrandScope() scope: BrandScope, @Query() query: unknown) {
    const filter = parseBody(ListQuery, query);
    const { items, total } = await this.products.list(scope, filter);
    return { items, meta: { page: filter.page, pageSize: filter.pageSize, total } };
  }

  /** FR-PRD-01, FR-PRD-03, FR-PRD-05: Brand Admin tạo sản phẩm cho thương hiệu mình. */
  @Post()
  @HttpCode(201)
  create(@CurrentUser() actor: AuthenticatedUser, @Body() body: unknown) {
    return this.products.create(actor, parseBody(CreateBody, body));
  }

  /** FR-PRD-03: Chi tiết sản phẩm. */
  @Get(':id')
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Param('id') id: string,
  ) {
    return this.products.get(actor, scope, parseBody(IdParam, id));
  }

  /** FR-PRD-02: Cập nhật sản phẩm. */
  @Patch(':id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.products.update(actor, scope, parseBody(IdParam, id), parseBody(UpdateBody, body));
  }

  /** FR-PRD-02: Ngừng kinh doanh sản phẩm. */
  @Post(':id/discontinue')
  discontinue(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Param('id') id: string,
  ) {
    return this.products.discontinue(actor, scope, parseBody(IdParam, id));
  }
}
