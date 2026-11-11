/**
 * Cửa vào HTTP của module BND.
 * Đường dẫn và dữ liệu theo spec/contracts/openapi.yaml, nhóm tag BND.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import { AppError } from '../../shared/errors/index.js';
import { readImageFile } from '../../shared/http/multipart.js';
import { parseBody } from '../../shared/http/validation.js';
import type { BrandScope } from '../../shared/scoping/index.js';
import {
  CurrentBrandScope,
  CurrentUser,
  RequireAnyPermission,
  RequirePermissions,
  RequireReauth,
  type AuthenticatedUser,
} from '../auth/index.js';
import { BndService } from './bnd.service.js';
import { BrandLogoService } from './brand-logo.service.js';

const BRAND_MANAGE = 'brand.manage';
const MACHINE_VIEW = 'machine.view';
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

const PayoutAccountBody = z.object({
  bankCode: z.string().min(1).max(20),
  accountNumber: z.string().min(1).max(30),
  accountHolder: z.string().min(1).max(200),
});

/** openapi.yaml: BrandLegalProfileUpdate. */
const LegalProfileBody = z.object({
  taxCode: z.string().min(10).max(20),
  businessLicenseNumber: z.string().max(100).optional(),
  payoutAccount: PayoutAccountBody.optional(),
});

const SetStatusBody = z.object({
  status: z.enum(BRAND_STATUSES),
});

const IdParam = z.string().uuid();

@Controller('brands')
export class BndController {
  constructor(
    @Inject(BndService) private readonly brands: BndService,
    @Inject(BrandLogoService) private readonly logos: BrandLogoService,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'constraint'>,
  ) {}

  /**
   * FR-BND-07: nhân sự nền tảng xem danh sách thương hiệu. Super Admin quản lý (brand.manage);
   * Operations Staff và Inventory Staff chỉ cần tên thương hiệu thuê slot trên máy (machine.view).
   * Tài khoản thuộc thương hiệu không bao giờ được xem danh sách này (BR-012).
   */
  @Get()
  @RequireAnyPermission(BRAND_MANAGE, MACHINE_VIEW)
  async list(@CurrentBrandScope() scope: BrandScope, @Query() query: unknown) {
    if (scope.kind === 'BRAND') throw new AppError('FORBIDDEN_SCOPE', 'auth.missingPermission');
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

  /**
   * FR-BND-06, ADR-0022: upload logo thương hiệu (multipart, trường `file`). Đọc tối đa
   * BRAND_LOGO_MAX_BYTES; vượt thì FILE_TOO_LARGE, không phải ảnh thì UNSUPPORTED_MEDIA_TYPE.
   */
  @Post('me/logo')
  @HttpCode(200)
  async uploadMyBrandLogo(@CurrentUser() actor: AuthenticatedUser, @Req() request: FastifyRequest) {
    // Kiểm quyền trước khi đọc tệp: tài khoản nền tảng bị từ chối ngay, không phải chờ upload xong.
    if (!actor.brandId) throw new AppError('FORBIDDEN_SCOPE', 'bnd.brandAccountOnly');
    const data = await readImageFile(request, this.config.constraint('BRAND_LOGO_MAX_BYTES'), {
      required: 'bnd.logoFileRequired',
      tooLarge: 'bnd.logoTooLarge',
    });
    return this.logos.upload(actor, data);
  }

  /** FR-BND-06, ADR-0022: xóa logo thương hiệu. */
  @Delete('me/logo')
  deleteMyBrandLogo(@CurrentUser() actor: AuthenticatedUser) {
    return this.logos.remove(actor);
  }

  /** FR-BND-09: Brand Admin khai hồ sơ pháp nhân và tài khoản nhận doanh thu. */
  @Put('me/legal-profile')
  updateMyBrandLegalProfile(@CurrentUser() actor: AuthenticatedUser, @Body() body: unknown) {
    return this.brands.updateMyBrandLegalProfile(actor, parseBody(LegalProfileBody, body));
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

  /** FR-BND-10: Platform Super Admin ghi nhận đã xác minh pháp nhân. */
  @Post(':id/legal-verification')
  @RequirePermissions(BRAND_MANAGE)
  @RequireReauth()
  verifyBrandLegal(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.brands.verifyBrandLegal(actor, parseBody(IdParam, id));
  }
}
