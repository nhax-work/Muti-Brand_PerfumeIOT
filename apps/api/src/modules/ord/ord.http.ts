/**
 * Cửa vào HTTP của ORD. Đường dẫn và dữ liệu theo spec/contracts/openapi.yaml, tag ORD.
 *
 *   /kiosk/*  — @Public: kiosk không đăng nhập (security: [] trong contract).
 *   /orders/* — web quản trị, quyền `order.view`, phạm vi qua brandScopedOrders.
 *               Riêng /orders/manual-review cần `order.refund` (việc nội bộ nền tảng).
 */

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
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
import { RefundClaimsService } from './refund-claims/refund-claims.service.js';

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

/** openapi `OrderCancel` — máy đang hiện đơn; sai máy thì như không có đơn. */
const OrderCancelBody = z.object({ machineSerial: z.string().min(1).max(100) });

/** Header Idempotency-Key bắt buộc (openapi `parameters.idempotencyKey`). */
const IdempotencyHeader = z.object({ 'idempotency-key': z.string().min(1).max(150) });

const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

const SearchQuery = PageQuery.extend({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  machineId: z.string().uuid().optional(),
  slotId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  fragranceProductId: z.string().uuid().optional(),
  paymentReference: z.string().min(1).max(150).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
});

/** openapi `KioskInteractionCreate`. */
const InteractionCreateBody = z.object({
  events: z
    .array(
      z.object({
        eventId: z.string().min(1).max(150),
        eventType: z.enum(['PRODUCT_IMPRESSION', 'PRODUCT_SELECTED']),
        slotId: z.string().uuid(),
        kioskSessionId: z.string().uuid(),
        occurredAt: z
          .string()
          .datetime({ offset: true })
          .transform((s) => new Date(s)),
      }),
    )
    .min(1),
});

const IdParam = z.object({ id: z.string().uuid() });
const SerialParam = z.object({ serialNumber: z.string().min(1).max(100) });

interface StatusReply {
  status(code: number): unknown;
}

@Controller('kiosk')
@Public()
export class KioskController {
  constructor(
    @Inject(OrdService) private readonly service: OrdService,
    @Inject(RefundClaimsService) private readonly claims: RefundClaimsService,
  ) {}

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

  /** FR-ORD-11; kèm mã khiếu nại cho QR sự cố khi đơn đủ điều kiện (FR-ORD-28, ADR-0012). */
  @Get('orders/:id/status')
  async status(@Param() params: unknown) {
    const { id } = parseBody(IdParam, params);
    const view = await this.service.getKioskOrderStatus(id);
    return { ...view, claimToken: await this.claims.claimTokenForOrder(id) };
  }

  /** FR-ORD-33 (ADR-0015 mục 3): khách hủy trên kiosk; trả trạng thái đơn sau khi hủy. */
  @Post('orders/:id/cancel')
  @HttpCode(200)
  async cancel(@Param() params: unknown, @Body() body: unknown) {
    const { id } = parseBody(IdParam, params);
    const { machineSerial } = parseBody(OrderCancelBody, body);
    const view = await this.service.cancelKioskOrder(id, machineSerial);
    return { ...view, claimToken: await this.claims.claimTokenForOrder(id) };
  }

  /** FR-RPT-06: 202 — đã tiếp nhận, không trả nội dung. */
  @Post('interactions')
  @HttpCode(202)
  async recordInteractions(@Body() body: unknown): Promise<void> {
    const { events } = parseBody(InteractionCreateBody, body);
    await this.service.recordKioskInteractions(events);
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

  /**
   * FR-ORD-19, FR-RPT-05: đơn đã thanh toán mà chưa nhận được lượt xịt và chưa hoàn tiền. Việc nội
   * bộ nền tảng — cùng quyền với hoàn tiền (FR-ORD-20), Brand Admin không có. Khai báo trước
   * `:id` để không bị nuốt thành tham số.
   */
  @Get('manual-review')
  @RequirePermissions('order.refund')
  async manualReview(@CurrentBrandScope() scope: BrandScope, @Query() rawQuery: unknown) {
    const page = parseBody(PageQuery, rawQuery);
    const { items, total } = await this.service.listNeedingReview(scope, page);
    return { items, meta: { page: page.page, pageSize: page.pageSize, total } };
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
