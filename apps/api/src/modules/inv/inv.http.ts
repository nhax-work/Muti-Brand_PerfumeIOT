/**
 * Cửa vào HTTP của INV. Đường dẫn và dữ liệu theo spec/contracts/openapi.yaml (tag INV, ADR-0017).
 *
 *   Đọc khai báo, lô, chai, phiếu nạp — mọi tài khoản đã đăng nhập, phạm vi qua `brand_id`.
 *   Khai báo gửi hàng, nộp giấy tờ — `inventory.declare` (Brand Admin).
 *   Duyệt/từ chối giấy tờ — `inventory.verify` (Super Admin).
 *   Tiếp nhận lô, đăng ký chai, mở/đóng phiếu nạp — `inventory.manage` (Inventory Staff).
 *   Ghi nhận chai hư hỏng — `inventory.adjust` + xác thực lại (FR-SLT-44, ADR-0018).
 */

import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
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
