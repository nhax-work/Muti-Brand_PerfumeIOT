/**
 * Cửa vào HTTP của module PRD.
 * Mọi endpoint đòi quyền `product.manage` (FR-PRD-01..05).
 * Đường dẫn và dữ liệu theo spec/contracts/openapi.yaml, nhóm tag PRD.
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
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import { readImageFile } from '../../shared/http/multipart.js';
import { parseBody } from '../../shared/http/validation.js';
import type { BrandScope } from '../../shared/scoping/index.js';
import {
  CurrentBrandScope,
  CurrentUser,
  RequireAnyPermission,
  RequirePermissions,
  type AuthenticatedUser,
} from '../auth/index.js';
import { ProductImageService } from './product-image.service.js';
import { PrdService } from './prd.service.js';

const PRODUCT_MANAGE = 'product.manage';
const MACHINE_VIEW = 'machine.view';
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
  constructor(
    @Inject(PrdService) private readonly products: PrdService,
    @Inject(ProductImageService) private readonly images: ProductImageService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * FR-PRD-03: Brand Admin xem sản phẩm thương hiệu mình; nhân sự nền tảng xem tất cả — Operations
   * Staff và Inventory Staff cần tên sản phẩm đang lắp trên máy (machine.view). Phạm vi do truy vấn
   * quyết định, không do quyền nào được dùng.
   */
  @Get()
  @RequireAnyPermission(PRODUCT_MANAGE, MACHINE_VIEW)
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

  /**
   * FR-PRD-01, ADR-0020: upload ảnh sản phẩm (multipart, trường `file`). Đọc tối đa
   * PRODUCT_IMAGE_MAX_BYTES; vượt thì FILE_TOO_LARGE, không phải ảnh thì UNSUPPORTED_MEDIA_TYPE.
   */
  @Post(':id/image')
  @HttpCode(200)
  async uploadImage(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ) {
    const productId = parseBody(IdParam, id);
    const data = await readImageFile(request, this.config.constraint('PRODUCT_IMAGE_MAX_BYTES'), {
      required: 'prd.imageFileRequired',
      tooLarge: 'prd.imageTooLarge',
    });
    return this.images.upload(actor, scope, productId, data);
  }

  /** FR-PRD-01, ADR-0020: xóa ảnh sản phẩm. */
  @Delete(':id/image')
  removeImage(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Param('id') id: string,
  ) {
    return this.images.remove(actor, scope, parseBody(IdParam, id));
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
