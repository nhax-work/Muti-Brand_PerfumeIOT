/**
 * Cửa vào HTTP đọc hóa đơn thuê slot (FR-SLT-15, FR-SLT-41). Đường dẫn và tham số theo
 * spec/contracts/openapi.yaml (`listSlotRentals`, `getSlotRental`).
 *
 * Không gắn quyền riêng: Brand Admin xem hóa đơn của mình, tài khoản nền tảng xem tất cả — phân biệt
 * bằng phạm vi thương hiệu (`@CurrentBrandScope`), không bằng quyền.
 *
 * KHÔNG có `POST /slot-rentals` (FR-SLT-01 bãi bỏ, ADR-0006) hay đường kích hoạt tay: hóa đơn sinh
 * từ `POST /rental-checkouts` và kích hoạt khi lắp chai đầu tiên (FR-SLT-24) hoặc job FR-SLT-42.
 */

import { Body, Controller, Get, Inject, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../../shared/http/validation.js';
import type { BrandScope } from '../../shared/scoping/index.js';
import { CurrentBrandScope, CurrentUser, type AuthenticatedUser } from '../auth/index.js';
import { SltService } from './slt.service.js';

const RENTAL_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'EXPIRING',
  'GRACE',
  'RENEWED',
  'LIQUIDATED',
  'CLOSED',
  'TERMINATED',
  'CANCELLED',
] as const;

const RENTAL_STAGES = [
  'AWAITING_PAYMENT',
  'AWAITING_STOCK',
  'ACTIVE',
  'EXPIRING',
  'GRACE',
  'LIQUIDATED',
  'ENDED',
  'CANCELLED',
] as const;

const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  status: z.enum(RENTAL_STATUSES).optional(),
  stage: z.enum(RENTAL_STAGES).optional(),
  machineId: z.string().uuid().optional(),
});

const IdParam = z.object({ id: z.string().uuid() });

const CheckoutItem = z.object({
  slotId: z.string().uuid(),
  rentalPackageId: z.string().uuid(),
  storagePlanId: z.string().uuid(),
});

const CreateCheckoutBody = z.object({
  items: z.array(CheckoutItem).min(1),
});

const ProductAssignBody = z.object({
  fragranceProductId: z.string().uuid(),
});

const PriceUpdateBody = z.object({
  pricePerSpray: z.string().min(1),
});

@Controller('slot-rentals')
export class SltController {
  constructor(@Inject(SltService) private readonly service: SltService) {}

  @Get()
  async list(@CurrentBrandScope() scope: BrandScope, @Query() rawQuery: unknown) {
    const query = parseBody(ListQuery, rawQuery);
    const { items, total } = await this.service.list(scope, query);
    return { items, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  @Get(':id')
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Param() params: unknown,
  ) {
    const { id } = parseBody(IdParam, params);
    return this.service.get(actor, scope, id);
  }

  @Get(':id/invoice')
  getInvoice(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Param() params: unknown,
  ) {
    const { id } = parseBody(IdParam, params);
    return this.service.getInvoice(actor, scope, id);
  }

  @Put(':id/product')
  assignProduct(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { id } = parseBody(IdParam, params);
    const { fragranceProductId } = parseBody(ProductAssignBody, body);
    return this.service.assignProduct(actor, scope, id, fragranceProductId);
  }

  @Put(':id/price')
  setPricePerSpray(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { id } = parseBody(IdParam, params);
    const { pricePerSpray } = parseBody(PriceUpdateBody, body);
    return this.service.setPricePerSpray(actor, scope, id, pricePerSpray);
  }
}

@Controller('rental-checkouts')
export class RentalCheckoutsController {
  constructor(@Inject(SltService) private readonly service: SltService) {}

  @Post()
  createCheckout(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Body() body: unknown,
  ) {
    const parsed = parseBody(CreateCheckoutBody, body);
    return this.service.createCheckout(actor, scope, parsed);
  }

  @Get(':id')
  getCheckout(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Param() params: unknown,
  ) {
    const { id } = parseBody(IdParam, params);
    return this.service.getCheckout(actor, scope, id);
  }

  @Post(':id/payments')
  payCheckout(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Param() params: unknown,
  ) {
    const { id } = parseBody(IdParam, params);
    return this.service.payCheckout(actor, scope, id);
  }

  @Post(':id/cancel')
  cancelCheckout(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Param() params: unknown,
  ) {
    const { id } = parseBody(IdParam, params);
    return this.service.cancelCheckout(actor, scope, id);
  }
}

@Controller('slots')
export class SlotRentalQuoteController {
  constructor(@Inject(SltService) private readonly service: SltService) {}

  @Get(':id/rental-quote')
  getQuote(@CurrentUser() actor: AuthenticatedUser, @Param() params: unknown) {
    const { id } = parseBody(IdParam, params);
    return this.service.getQuote(actor, id);
  }
}
