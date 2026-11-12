/**
 * Cửa vào HTTP của INV. Đường dẫn và dữ liệu theo spec/contracts/openapi.yaml (tag INV, ADR-0017).
 *
 *   Đọc khai báo, lô, chai, phiếu nạp — mọi tài khoản đã đăng nhập, phạm vi qua `brand_id`.
 *   Khai báo gửi hàng, nộp giấy tờ — `inventory.declare` (Brand Admin).
 *   Duyệt/từ chối giấy tờ — `inventory.verify` (Super Admin).
 *   Tiếp nhận lô, đăng ký chai, mở/đóng phiếu nạp — `inventory.manage` (Inventory Staff).
 *   Ghi nhận chai hư hỏng — `inventory.adjust` + xác thực lại (FR-SLT-44, ADR-0018).
 */

import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../../shared/http/validation.js';
import type { BrandScope } from '../../shared/scoping/index.js';
import {
  CurrentBrandScope,
  CurrentUser,
  RequirePermissions,
  RequireReauth,
  type AuthenticatedUser,
} from '../auth/index.js';
import { InvService } from './inv.service.js';

const INVENTORY_DECLARE = 'inventory.declare';
const INVENTORY_VERIFY = 'inventory.verify';
const INVENTORY_MANAGE = 'inventory.manage';
const INVENTORY_ADJUST = 'inventory.adjust';

const IdParam = z.object({ id: z.string().uuid() });
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const IsoDateTime = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime())
  .transform((value) => new Date(value));

const Page = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
};

const ShipmentQuery = z.object({
  ...Page,
  status: z.enum(['DECLARED', 'RECEIVED', 'DISCREPANCY', 'CANCELLED']).optional(),
});

/** openapi `ShipmentDeclarationCreate`. */
const ShipmentCreateBody = z.object({
  fragranceProductId: z.string().uuid(),
  declaredQuantity: z.number().int().min(1),
  declaredBottleVolumeMl: z.number().positive(),
  expectedShipDate: IsoDate.optional(),
});

/** openapi `ShipmentReceive`. */
const ShipmentReceiveBody = z.object({
  receivedQuantity: z.number().int().min(0),
  batchNumber: z.string().trim().min(1).max(100),
  expiresAt: z.coerce.date().optional(),
  discrepancyNotes: z.string().max(2000).optional(),
});

const BatchQuery = z.object({
  ...Page,
  fragranceProductId: z.string().uuid().optional(),
  authenticityStatus: z.enum(['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED']).optional(),
});

/** openapi `AuthenticityDocumentSubmit`. */
const AuthenticitySubmitBody = z.object({
  documentUrl: z.string().trim().min(1).max(1000),
  documentType: z.string().trim().max(50).optional(),
});

/** openapi `AuthenticityReject` — thiếu lý do trả REASON_REQUIRED ở service, không phải 400 chung. */
const AuthenticityRejectBody = z.object({ reason: z.string().optional() });

const BottleQuery = z.object({
  ...Page,
  status: z
    .enum([
      'IN_STOCK',
      'INSTALLED',
      'LOW',
      'EMPTY',
      'DAMAGED',
      'EXPIRED',
      'LIQUIDATED',
      'RETURNED_TO_BRAND',
    ])
    .optional(),
  batchId: z.string().uuid().optional(),
});

/** openapi `BottleDamageReport` — lý do rỗng sau khi cắt khoảng trắng bị service từ chối. */
const BottleDamageBody = z.object({ reason: z.string().max(2000) });

/** openapi `BottleCreate`. */
const BottleCreateBody = z.object({
  batchId: z.string().uuid(),
  identifier: z.string().trim().min(1).max(150),
  initialVolumeMl: z.number().positive(),
  expiresAt: z.coerce.date().optional(),
});

/** openapi `InventoryBatchCreate` (FR-INV-01). */
const BatchCreateBody = z.object({
  brandId: z.string().uuid(),
  fragranceProductId: z.string().uuid(),
  batchNumber: z.string().trim().min(1).max(100),
  receivedAt: IsoDateTime,
  expiresAt: IsoDateTime.optional(),
  quantityReceived: z.number().int().min(1),
  supplierInfo: z.record(z.string(), z.unknown()).optional(),
});

const BottleHistoryQuery = z.object({ ...Page });

const BottleRemovalBody = z.object({
  notes: z.string().trim().max(500).optional(),
});

/** openapi `InventoryAdjustmentCreate` — thiếu lý do trả `ADJUSTMENT_REASON_REQUIRED`. */
const AdjustmentCreateBody = z.object({
  bottleId: z.string().uuid(),
  slotId: z.string().uuid().optional(),
  afterQuantityMl: z.number().finite().min(0),
  reason: z.string().nullable().optional(),
});

const RefillQuery = z.object({
  ...Page,
  machineId: z.string().uuid().optional(),
  status: z.enum(['STARTED', 'COMPLETED', 'CANCELLED']).optional(),
});

/** openapi `RefillSessionOpen` — máy suy từ slot; yêu cầu bổ sung được xử lý, nếu có (FR-RFQ-08). */
const RefillOpenBody = z.object({
  slotId: z.string().uuid(),
  refillRequestId: z.string().uuid().optional(),
});

/** openapi `RefillSessionClose` — checklist phải hoàn tất (FR-INV-14). */
const RefillCloseBody = z.object({
  newBottleId: z.string().uuid(),
  checklistCompleted: z.literal(true),
  notes: z.string().max(2000).optional(),
});

@Controller('shipment-declarations')
export class ShipmentDeclarationsController {
  constructor(@Inject(InvService) private readonly inv: InvService) {}

  /** FR-INV-27 */
  @Get()
  async list(@CurrentBrandScope() scope: BrandScope, @Query() rawQuery: unknown) {
    const query = parseBody(ShipmentQuery, rawQuery);
    const { items, total } = await this.inv.listShipments(scope, query);
    return { items, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  /** FR-INV-22, 23, 28 */
  @Post()
  @RequirePermissions(INVENTORY_DECLARE)
  declare(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Body() body: unknown,
  ) {
    return this.inv.declareShipment(actor, scope, parseBody(ShipmentCreateBody, body));
  }

  /** FR-INV-24, 25, 26 */
  @Post(':id/receive')
  @HttpCode(200)
  @RequirePermissions(INVENTORY_MANAGE)
  receive(
    @CurrentUser() actor: AuthenticatedUser,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    return this.inv.receiveShipment(
      actor,
      parseBody(IdParam, params).id,
      parseBody(ShipmentReceiveBody, body),
    );
  }
}

@Controller('inventory-batches')
export class InventoryBatchesController {
  constructor(@Inject(InvService) private readonly inv: InvService) {}

  /** FR-INV-01, 21, 34 */
  @Get()
  async list(@CurrentBrandScope() scope: BrandScope, @Query() rawQuery: unknown) {
    const query = parseBody(BatchQuery, rawQuery);
    const { items, total } = await this.inv.listBatches(scope, query);
    return { items, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  /** FR-INV-01 */
  @Post()
  @RequirePermissions(INVENTORY_MANAGE)
  create(@CurrentUser() actor: AuthenticatedUser, @Body() body: unknown) {
    return this.inv.createBatch(actor, parseBody(BatchCreateBody, body));
  }

  /** FR-INV-33 */
  @Post(':id/authenticity-documents')
  @HttpCode(200)
  @RequirePermissions(INVENTORY_DECLARE)
  submitAuthenticity(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    return this.inv.submitAuthenticity(
      actor,
      scope,
      parseBody(IdParam, params).id,
      parseBody(AuthenticitySubmitBody, body),
    );
  }

  /** FR-INV-34 AC1 */
  @Post(':id/approve-authenticity')
  @HttpCode(200)
  @RequirePermissions(INVENTORY_VERIFY)
  approve(@CurrentUser() actor: AuthenticatedUser, @Param() params: unknown) {
    return this.inv.approveAuthenticity(actor, parseBody(IdParam, params).id);
  }

  /** FR-INV-34 AC2, AC3 */
  @Post(':id/reject-authenticity')
  @HttpCode(200)
  @RequirePermissions(INVENTORY_VERIFY)
  reject(@CurrentUser() actor: AuthenticatedUser, @Param() params: unknown, @Body() body: unknown) {
    const { reason } = parseBody(AuthenticityRejectBody, body ?? {});
    return this.inv.rejectAuthenticity(actor, parseBody(IdParam, params).id, reason);
  }
}

@Controller('bottles')
export class BottlesController {
  constructor(@Inject(InvService) private readonly inv: InvService) {}

  /** FR-INV-04, 21 */
  @Get()
  async list(@CurrentBrandScope() scope: BrandScope, @Query() rawQuery: unknown) {
    const query = parseBody(BottleQuery, rawQuery);
    const { items, total } = await this.inv.listBottles(scope, query);
    return { items, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  /** FR-INV-02, 03, 05 */
  @Post()
  @RequirePermissions(INVENTORY_MANAGE)
  register(@CurrentUser() actor: AuthenticatedUser, @Body() body: unknown) {
    return this.inv.registerBottle(actor, parseBody(BottleCreateBody, body));
  }

  /** FR-SLT-44, ADR-0018 */
  @Post(':id/mark-damaged')
  @HttpCode(200)
  @RequirePermissions(INVENTORY_ADJUST)
  @RequireReauth()
  markDamaged(
    @CurrentUser() actor: AuthenticatedUser,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { reason } = parseBody(BottleDamageBody, body);
    return this.inv.markBottleDamaged(actor, parseBody(IdParam, params).id, reason);
  }

  /** FR-INV-17 */
  @Get(':id/history')
  async history(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Param() params: unknown,
    @Query() rawQuery: unknown,
  ) {
    const query = parseBody(BottleHistoryQuery, rawQuery);
    const { items, total } = await this.inv.getBottleHistory(
      actor,
      scope,
      parseBody(IdParam, params).id,
      query,
    );
    return { items, meta: { page: query.page, pageSize: query.pageSize, total } };
  }
}

@Controller('refill-sessions')
export class RefillSessionsController {
  constructor(@Inject(InvService) private readonly inv: InvService) {}

  /** FR-INV-13: Brand Admin chỉ thấy phiếu trên slot mình thuê. */
  @Get()
  async list(@CurrentBrandScope() scope: BrandScope, @Query() rawQuery: unknown) {
    const query = parseBody(RefillQuery, rawQuery);
    const { items, total } = await this.inv.listRefillSessions(scope, query);
    return { items, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  /** FR-INV-29, 30, 32 */
  @Post()
  @RequirePermissions(INVENTORY_MANAGE)
  open(@CurrentUser() actor: AuthenticatedUser, @Body() body: unknown) {
    return this.inv.openRefillSession(actor, parseBody(RefillOpenBody, body));
  }

  /** FR-INV-31, 35 */
  @Post(':id/close')
  @HttpCode(200)
  @RequirePermissions(INVENTORY_MANAGE)
  close(@CurrentUser() actor: AuthenticatedUser, @Param() params: unknown, @Body() body: unknown) {
    return this.inv.closeRefillSession(
      actor,
      parseBody(IdParam, params).id,
      parseBody(RefillCloseBody, body),
    );
  }
}

@Controller('slots')
export class SlotBottleController {
  constructor(@Inject(InvService) private readonly inv: InvService) {}

  /** FR-INV-15: Tháo chai khỏi slot về kho (ADR-0019, FR-MCH-17). */
  @Delete(':id/bottle')
  @RequirePermissions(INVENTORY_MANAGE)
  removeBottle(
    @CurrentUser() actor: AuthenticatedUser,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { notes } = parseBody(BottleRemovalBody, body ?? {});
    return this.inv.removeBottleFromSlot(actor, parseBody(IdParam, params).id, notes);
  }
}

@Controller('inventory-adjustments')
export class InventoryAdjustmentsController {
  constructor(@Inject(InvService) private readonly inv: InvService) {}

  /** FR-INV-16: Điều chỉnh tồn kho kèm lý do bắt buộc (FR-AUTH-09). */
  @Post()
  @RequirePermissions(INVENTORY_ADJUST)
  @RequireReauth()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() body: unknown) {
    return this.inv.createAdjustment(actor, parseBody(AdjustmentCreateBody, body));
  }
}
