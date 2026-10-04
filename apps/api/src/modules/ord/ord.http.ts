/**
 * Cửa vào HTTP của ORD. Đường dẫn và dữ liệu theo spec/contracts/openapi.yaml, tag ORD.
 *
 *   /kiosk/*  — @Public: kiosk không đăng nhập (security: [] trong contract).
 *   /orders/* — web quản trị, quyền `order.view`, phạm vi qua brandScopedOrders.
 */

import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Res } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../../shared/http/validation.js';
import type { BrandScope } from '../../shared/scoping/index.js';
import {
  CurrentBrandScope,
  CurrentUser,
  Public,
  RequirePermissions,
  type AuthenticatedUser,
} from '../auth/index.js';
import { OrdService } from './ord.service.js';

const ORDER_STATUSES = [
  'CREATED',
  'PENDING_PAYMENT',
  'PAID',
  'DISPENSE_REQUESTED',
  'DISPENSED',
  'FAILED',
  'EXPIRED',
  'REFUND_PENDING',
  'REFUNDED',
  'FORFEITED',
] as const;

const OrderCreateBody = z.object({
  machineSerial: z.string().min(1).max(100),
  slotId: z.string().uuid(),
  kioskSessionId: z.string().uuid().optional(),
});

/** Header Idempotency-Key bắt buộc (openapi `parameters.idempotencyKey`). */
const IdempotencyHeader = z.object({ 'idempotency-key': z.string().min(1).max(150) });

const SearchQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  machineId: z.string().uuid().optional(),
  slotId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  fragranceProductId: z.string().uuid().optional(),
  paymentReference: z.string().min(1).max(150).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
});

const IdParam = z.object({ id: z.string().uuid() });
const SerialParam = z.object({ serialNumber: z.string().min(1).max(100) });

interface StatusReply {
  status(code: number): unknown;
}

@Controller('kiosk')
@Public()
export class KioskController {
  constructor(@Inject(OrdService) private readonly service: OrdService) {}

  @Get('machines/:serialNumber/catalog')
  catalog(@Param() params: unknown) {
    const { serialNumber } = parseBody(SerialParam, params);
    return this.service.getKioskCatalog(serialNumber);
  }

  /** 201 khi tạo mới, 200 khi Idempotency-Key đã dùng (trả lại đơn cũ). */
  @Post('orders')
  async createOrder(
    @Headers() headers: unknown,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: StatusReply,
  ) {
    const { 'idempotency-key': idempotencyKey } = parseBody(IdempotencyHeader, headers);
    const input = parseBody(OrderCreateBody, body);
    const { replayed, body: created } = await this.service.createOrder({
      ...input,
      idempotencyKey,
    });
    reply.status(replayed ? 200 : 201);
    return created;
  }

  @Get('orders/:id/status')
  status(@Param() params: unknown) {
    const { id } = parseBody(IdParam, params);
    return this.service.getKioskOrderStatus(id);
  }
}

@Controller('orders')
@RequirePermissions('order.view')
export class OrdersController {
  constructor(@Inject(OrdService) private readonly service: OrdService) {}

  @Get()
  async search(@CurrentBrandScope() scope: BrandScope, @Query() rawQuery: unknown) {
    const query = parseBody(SearchQuery, rawQuery);
    const { items, total } = await this.service.search(scope, query);
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

  @Get(':id/history')
  history(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Param() params: unknown,
  ) {
    const { id } = parseBody(IdParam, params);
    return this.service.history(actor, scope, id);
  }
}
