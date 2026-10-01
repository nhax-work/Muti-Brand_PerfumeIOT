/**
 * Cửa vào HTTP của bảng giá thuê slot (FR-SLT-30..32). Theo spec/contracts/openapi.yaml:
 * `/rental-packages`, `/storage-plans`, `PUT /slots/{id}/rent-price`.
 *
 * Đọc: mọi tài khoản đã đăng nhập (Brand Admin cần xem gói để mua — FR-SLT-34); service lọc chỉ còn
 * gói đang mở bán với người không có quyền quản lý. Ghi: `rental.manage` — chỉ Platform Super Admin.
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
import { CATALOG_MANAGE, CatalogService } from './catalog.service.js';

/** Khớp `Money` của contract và `numeric(19,4)`; số âm bị từ chối (FR-SLT-31 AC2, FR-SLT-32 AC2). */
const Money = z.string().regex(/^\d{1,15}(\.\d{1,4})?$/, 'validation.priceFormat');
const Percent = z.number().min(0).max(100);
const Name = z.string().trim().min(1).max(100);

const ActiveQuery = z.object({
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

const PackageCreate = z.object({
  name: Name,
  durationMonths: z.number().int().min(1).max(120),
  discountPercent: Percent.default(0),
});
const PackageUpdate = z
  .object({ name: Name, discountPercent: Percent, isActive: z.boolean() })
  .partial()
  .strict();

const PlanCreate = z.object({
  name: Name,
  description: z.string().max(2000).nullable().default(null),
  monthlyPrice: Money,
  coveragePercent: Percent,
  coverageCap: Money,
});
const PlanUpdate = z
  .object({
    name: Name,
    description: z.string().max(2000).nullable(),
    monthlyPrice: Money,
    coveragePercent: Percent,
    coverageCap: Money,
    isActive: z.boolean(),
  })
  .partial()
  .strict();

const RentPriceUpdate = z.object({ monthlyRentPrice: Money.nullable() });
const IdParam = z.object({ id: z.string().uuid() });

@Controller('rental-packages')
export class RentalPackagesController {
  constructor(@Inject(CatalogService) private readonly service: CatalogService) {}

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Query() query: unknown) {
    return this.service.listPackages(actor, parseBody(ActiveQuery, query).isActive);
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions(CATALOG_MANAGE)
  create(@CurrentUser() actor: AuthenticatedUser, @Body() body: unknown) {
    return this.service.createPackage(actor, parseBody(PackageCreate, body));
  }

  @Patch(':id')
  @RequirePermissions(CATALOG_MANAGE)
  update(@CurrentUser() actor: AuthenticatedUser, @Param() params: unknown, @Body() body: unknown) {
    const { id } = parseBody(IdParam, params);
    return this.service.updatePackage(actor, id, parseBody(PackageUpdate, body));
  }
}

@Controller('storage-plans')
export class StoragePlansController {
  constructor(@Inject(CatalogService) private readonly service: CatalogService) {}

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Query() query: unknown) {
    return this.service.listPlans(actor, parseBody(ActiveQuery, query).isActive);
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions(CATALOG_MANAGE)
  create(@CurrentUser() actor: AuthenticatedUser, @Body() body: unknown) {
    return this.service.createPlan(actor, parseBody(PlanCreate, body));
  }

  @Patch(':id')
  @RequirePermissions(CATALOG_MANAGE)
  update(@CurrentUser() actor: AuthenticatedUser, @Param() params: unknown, @Body() body: unknown) {
    const { id } = parseBody(IdParam, params);
    return this.service.updatePlan(actor, id, parseBody(PlanUpdate, body));
  }
}

@Controller('slots')
export class SlotRentPriceController {
  constructor(@Inject(CatalogService) private readonly service: CatalogService) {}

  @Put(':id/rent-price')
  @RequirePermissions(CATALOG_MANAGE)
  setRentPrice(
    @CurrentUser() actor: AuthenticatedUser,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { id } = parseBody(IdParam, params);
    const { monthlyRentPrice } = parseBody(RentPriceUpdate, body);
    return this.service.setSlotRentPrice(actor, id, monthlyRentPrice);
  }
}
