/**
 * Cửa vào HTTP của module BND.
 * Đường dẫn và dữ liệu theo spec/contracts/openapi.yaml, nhóm tag BND.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../../shared/http/validation.js';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../auth/index.js';
import { BndService } from './bnd.service.js';

const BRAND_MANAGE = 'brand.manage';
const BRAND_STATUSES = ['ACTIVE', 'SUSPENDED', 'DISABLED'] as const;

/** openapi.yaml: components.parameters page/pageSize (tối đa 200). */
const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  status: z.enum(BRAND_STATUSES).optional(),
});

/** openapi.yaml: BrandCreate. */
const CreateBody = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  contactInfo: z.record(z.string(), z.unknown()).optional(),
});

const UpdateBody = z.object({
  name: z.string().min(1).max(200).optional(),
  logoUrl: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  contactInfo: z.record(z.string(), z.unknown()).nullable().optional(),
});

/** openapi.yaml: BrandSelfUpdate. */
const SelfUpdateBody = z.object({
  name: z.string().min(1).max(200).optional(),
  logoUrl: z.string().optional(),
  description: z.string().optional(),
  contactInfo: z.record(z.string(), z.unknown()).optional(),
});

const SetStatusBody = z.object({
  status: z.enum(BRAND_STATUSES),
});

const IdParam = z.string().uuid();

@Controller('brands')
export class BndController {
  constructor(@Inject(BndService) private readonly brands: BndService) {}

  /** FR-BND-07: Platform Super Admin xem danh sách thương hiệu. */
  @Get()
  @RequirePermissions(BRAND_MANAGE)
  async list(@Query() query: unknown) {
    const filter = parseBody(ListQuery, query);
    const { items, total } = await this.brands.list(filter);
    return { items, meta: { page: filter.page, pageSize: filter.pageSize, total } };
  }

  /** FR-BND-01: Platform Super Admin tạo thương hiệu mới. */
  @Post()
  @RequirePermissions(BRAND_MANAGE)
  @HttpCode(201)
  create(@CurrentUser() actor: AuthenticatedUser, @Body() body: unknown) {
    return this.brands.create(actor, parseBody(CreateBody, body));
  }

  /** FR-BND-06: Brand Admin xem thông tin thương hiệu mình. */
  @Get('me')
  getMyBrand(@CurrentUser() actor: AuthenticatedUser) {
    return this.brands.getMyBrand(actor);
  }

  /** FR-BND-06: Brand Admin cập nhật thương hiệu mình. */
  @Patch('me')
  updateMyBrand(@CurrentUser() actor: AuthenticatedUser, @Body() body: unknown) {
    return this.brands.updateMyBrand(actor, parseBody(SelfUpdateBody, body));
  }

  /** FR-BND-07: Platform Super Admin xem chi tiết thương hiệu. */
  @Get(':id')
  @RequirePermissions(BRAND_MANAGE)
  get(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.brands.get(actor, parseBody(IdParam, id));
  }

  /** FR-BND-02: Platform Super Admin cập nhật thương hiệu. */
  @Patch(':id')
  @RequirePermissions(BRAND_MANAGE)
  update(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.brands.update(actor, parseBody(IdParam, id), parseBody(UpdateBody, body));
  }

  /** FR-BND-03: Platform Super Admin đổi trạng thái thương hiệu. */
  @Put(':id/status')
  @RequirePermissions(BRAND_MANAGE)
  setStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { status } = parseBody(SetStatusBody, body);
    return this.brands.setStatus(actor, parseBody(IdParam, id), status);
  }
}
