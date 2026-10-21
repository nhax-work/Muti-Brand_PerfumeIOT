/**
 * Nghiệp vụ Tồn kho, Khai báo gửi hàng, Giấy tờ chính hãng và Phiếu nạp (FR-INV-01..35).
 */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/principal.loader.js';
import { AppError } from '../../shared/errors/index.js';
import { hasPermission, resolveBrandScope } from '../../shared/scoping/index.js';
import {
  InvQueries,
  type BottleRecord,
  type InventoryBatchRecord,
  type RefillSessionRecord,
  type ShipmentDeclarationRecord,
} from './inv.queries.js';

export interface CreateShipmentInput {
  fragranceProductId: string;
  declaredQuantity: number;
  declaredBottleVolumeMl: string;
  expectedShipDate?: string | null;
}

export interface ReceiveShipmentInput {
  receivedQuantity: number;
  discrepancyNotes?: string | null;
}

export interface SubmitAuthenticityInput {
  documentUrl: string;
  documentType?: string;
}

export interface OpenRefillSessionInput {
  machineId: string;
  slotId: string;
  notes?: string | null;
}

export interface CloseRefillSessionInput {
  newBottleId: string;
  initialMeasuredWeightG: number;
  checklistCompleted: boolean;
  notes?: string | null;
}

@Injectable()
export class InvService {
  private readonly logger = new Logger(InvService.name);

  constructor(@Inject(InvQueries) private readonly queries: InvQueries) {}

  // ==========================================
  // 1. KHAI BÁO GỬI HÀNG (FR-INV-22 ÷ 28)
  // ==========================================

  /**
   * FR-INV-22: Brand Admin khai báo lô hàng gửi đến kho.
   */
  async declareShipment(
    actor: AuthenticatedUser,
    input: CreateShipmentInput,
  ): Promise<ShipmentDeclarationRecord> {
    const scope = resolveBrandScope(actor);
    if (scope.kind !== 'BRAND') {
      throw new AppError('FORBIDDEN_SCOPE', 'bnd.brandAccountOnly');
    }

    if (!input.declaredQuantity || input.declaredQuantity <= 0) {
      throw new AppError('VALIDATION_ERROR', 'validation.tooSmall');
    }

    return this.queries.createShipmentDeclaration({
      brandId: scope.brandId,
      fragranceProductId: input.fragranceProductId,
      declaredQuantity: input.declaredQuantity,
      declaredBottleVolumeMl: input.declaredBottleVolumeMl,
      expectedShipDate: input.expectedShipDate ? new Date(input.expectedShipDate) : null,
      declaredBy: actor.userId,
    });
  }

  /**
   * FR-INV-27: Tra cứu danh sách khai báo gửi hàng (cô lập dữ liệu theo thương hiệu).
   */
  async listShipmentDeclarations(
    actor: AuthenticatedUser,
    filter: { page: number; pageSize: number; brandId?: string; status?: any },
  ): Promise<{ items: ShipmentDeclarationRecord[]; total: number }> {
    const scope = resolveBrandScope(actor);
    return this.queries.listShipmentDeclarations(filter, scope);
  }

  /**
   * Chi tiết khai báo gửi hàng.
   */
  async getShipmentDeclaration(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<ShipmentDeclarationRecord> {
    const scope = resolveBrandScope(actor);
    const item = await this.queries.findShipmentDeclarationById(id, scope);
    if (!item) {
      throw new AppError('NOT_FOUND', 'common.notFound');
    }
    return item;
  }

  /**
   * FR-INV-24, 25, 26: Inventory Staff xác nhận tiếp nhận và đối soát thực tế tại kho.
   */
  async receiveShipment(
    actor: AuthenticatedUser,
    id: string,
    input: ReceiveShipmentInput,
  ): Promise<{ declaration: ShipmentDeclarationRecord; batch?: InventoryBatchRecord }> {
    const isPlatformStaff =
      actor.roles.includes('PLATFORM_SUPER_ADMIN') ||
      actor.roles.includes('OPERATIONS_STAFF') ||
      actor.roles.includes('INVENTORY_STAFF');

    if (!isPlatformStaff) {
      throw new AppError('FORBIDDEN_SCOPE', 'common.forbidden');
    }

    const decl = await this.queries.findShipmentDeclarationById(id);
    if (!decl) {
      throw new AppError('NOT_FOUND', 'common.notFound');
    }

    if (decl.status !== 'DECLARED') {
      throw new AppError('VALIDATION_ERROR', 'validation.invalidPayload');
    }

    const receivedQty = Number(input.receivedQuantity);
    if (isNaN(receivedQty) || receivedQty < 0) {
      throw new AppError('VALIDATION_ERROR', 'validation.tooSmall');
    }

    const isDiscrepancy = receivedQty !== decl.declaredQuantity;

    // FR-INV-25 AC2: bắt buộc có ghi chú khi số lượng lệch
    if (isDiscrepancy && (!input.discrepancyNotes || !input.discrepancyNotes.trim())) {
      throw new AppError('VALIDATION_ERROR', 'validation.required');
    }

    const newStatus = isDiscrepancy ? 'DISCREPANCY' : 'RECEIVED';
    const now = new Date();

    // 1. Cập nhật khai báo
    await this.queries.updateShipmentDeclarationReceive(id, {
      status: newStatus,
      receivedQuantity: receivedQty,
      discrepancyNotes: isDiscrepancy ? input.discrepancyNotes : null,
      receivedBy: actor.userId,
      receivedAt: now,
    });

    let createdBatch: InventoryBatchRecord | undefined = undefined;

    // 2. FR-INV-26: Tự động tạo lô nước hoa nếu số thực nhận > 0
    if (receivedQty > 0) {
      const batchNumber = `BATCH-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${decl.brandId.slice(0, 4).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;

      createdBatch = await this.queries.createBatch({
        brandId: decl.brandId,
        fragranceProductId: decl.fragranceProductId,
        sourceDeclarationId: decl.id,
        batchNumber,
        quantityReceived: receivedQty,
        receivedAt: now,
        supplierInfo: {
          authenticityStatus: 'PENDING',
          initialDeclaredQuantity: decl.declaredQuantity,
        },
        createdBy: actor.userId,
      });
    }

    const updatedDecl = (await this.queries.findShipmentDeclarationById(id))!;
    return { declaration: updatedDecl, batch: createdBatch };
  }

  // ==========================================
  // 2. GIẤY TỜ CHÍNH HÃNG CỦA LÔ (FR-INV-33 ÷ 35)
  // ==========================================

  /**
   * Tra cứu danh sách lô hàng trong kho.
   */
  async listBatches(
    actor: AuthenticatedUser,
    filter: { page: number; pageSize: number; brandId?: string; fragranceProductId?: string },
  ): Promise<{ items: InventoryBatchRecord[]; total: number }> {
    const scope = resolveBrandScope(actor);
    return this.queries.listBatches(filter, scope);
  }

  /**
   * Chi tiết lô hàng.
   */
  async getBatch(actor: AuthenticatedUser, id: string): Promise<InventoryBatchRecord> {
    const scope = resolveBrandScope(actor);
    const batch = await this.queries.findBatchById(id, scope);
    if (!batch) {
      throw new AppError('NOT_FOUND', 'common.notFound');
    }
    return batch;
  }

  /**
   * FR-INV-33: Brand Admin nộp giấy tờ chứng minh hàng chính hãng cho lô hàng.
   */
  async submitBatchAuthenticity(
    actor: AuthenticatedUser,
    batchId: string,
    input: SubmitAuthenticityInput,
  ): Promise<InventoryBatchRecord> {
    const scope = resolveBrandScope(actor);
    const batch = await this.queries.findBatchById(batchId, scope);
    if (!batch) {
      throw new AppError('NOT_FOUND', 'common.notFound');
    }

    if (!input.documentUrl || !input.documentUrl.trim()) {
      throw new AppError('VALIDATION_ERROR', 'validation.required');
    }

    const currentSupplierInfo = batch.supplierInfo ?? {};
    const updatedSupplierInfo = {
      ...currentSupplierInfo,
      authenticityStatus: 'PENDING',
      documentUrl: input.documentUrl.trim(),
      documentType: input.documentType ?? 'PURCHASE_INVOICE',
      submittedAt: new Date().toISOString(),
      submittedBy: actor.userId,
    };

    await this.queries.updateBatchSupplierInfo(batchId, updatedSupplierInfo);
    return (await this.queries.findBatchById(batchId, scope))!;
  }

  /**
   * FR-INV-34 AC1: Platform Super Admin phê duyệt giấy tờ chính hãng của lô hàng.
   */
  async approveBatchAuthenticity(
    actor: AuthenticatedUser,
    batchId: string,
  ): Promise<InventoryBatchRecord> {
    if (!actor.roles.includes('PLATFORM_SUPER_ADMIN')) {
      throw new AppError('FORBIDDEN_SCOPE', 'common.forbidden');
    }

    const batch = await this.queries.findBatchById(batchId);
    if (!batch) {
      throw new AppError('NOT_FOUND', 'common.notFound');
    }

    const currentSupplierInfo = batch.supplierInfo ?? {};
    const updatedSupplierInfo = {
      ...currentSupplierInfo,
      authenticityStatus: 'APPROVED',
      verifiedBy: actor.userId,
      verifiedAt: new Date().toISOString(),
      rejectionReason: null,
    };

    await this.queries.updateBatchSupplierInfo(batchId, updatedSupplierInfo);
    return (await this.queries.findBatchById(batchId))!;
  }

  /**
   * FR-INV-34 AC2 & AC3: Platform Super Admin từ chối giấy tờ chính hãng của lô hàng (bắt buộc lý do).
   */
  async rejectBatchAuthenticity(
    actor: AuthenticatedUser,
    batchId: string,
    input: { reason: string },
  ): Promise<InventoryBatchRecord> {
    if (!actor.roles.includes('PLATFORM_SUPER_ADMIN')) {
      throw new AppError('FORBIDDEN_SCOPE', 'common.forbidden');
    }

    if (!input.reason || !input.reason.trim()) {
      throw new AppError('VALIDATION_ERROR', 'mch.reasonRequired');
    }

    const batch = await this.queries.findBatchById(batchId);
    if (!batch) {
      throw new AppError('NOT_FOUND', 'common.notFound');
    }

    const currentSupplierInfo = batch.supplierInfo ?? {};
    const updatedSupplierInfo = {
      ...currentSupplierInfo,
      authenticityStatus: 'REJECTED',
      rejectionReason: input.reason.trim(),
      verifiedBy: actor.userId,
      verifiedAt: new Date().toISOString(),
    };

    await this.queries.updateBatchSupplierInfo(batchId, updatedSupplierInfo);
    return (await this.queries.findBatchById(batchId))!;
  }

  // ==========================================
  // 3. ĐĂNG KÝ CHAI (FR-INV-02 ÷ 07)
  // ==========================================

  /**
   * FR-INV-02: Đăng ký chai nước hoa với mã định danh duy nhất vào lô.
   */
  async registerBottle(
    actor: AuthenticatedUser,
    input: {
      batchId: string;
      identifier: string;
      initialVolumeMl: string;
      emptyWeightG?: string | null;
    },
  ): Promise<BottleRecord> {
    const isInventoryStaff =
      actor.roles.includes('PLATFORM_SUPER_ADMIN') ||
      actor.roles.includes('OPERATIONS_STAFF') ||
      actor.roles.includes('INVENTORY_STAFF');

    if (!isInventoryStaff) {
      throw new AppError('FORBIDDEN_SCOPE', 'common.forbidden');
    }

    const batch = await this.queries.findBatchById(input.batchId);
    if (!batch) {
      throw new AppError('NOT_FOUND', 'common.notFound');
    }

    const existing = await this.queries.findBottleByIdentifier(input.identifier);
    if (existing) {
      throw new AppError('VALIDATION_ERROR', 'validation.invalidPayload');
    }

    return this.queries.createBottle({
      batchId: batch.id,
      brandId: batch.brandId,
      fragranceProductId: batch.fragranceProductId,
      identifier: input.identifier,
      initialVolumeMl: input.initialVolumeMl,
      emptyWeightG: input.emptyWeightG,
      status: 'IN_STOCK',
    });
  }

  async listBottles(
    actor: AuthenticatedUser,
    filter: { page: number; pageSize: number; brandId?: string; batchId?: string; status?: any },
  ): Promise<{ items: BottleRecord[]; total: number }> {
    const scope = resolveBrandScope(actor);
    return this.queries.listBottles(filter, scope);
  }

  // ==========================================
  // 4. PHIẾU NẠP NƯỚC HOA (FR-INV-29 ÷ 32)
  // ==========================================

  /**
   * FR-INV-29, 32: Mở phiếu nạp nước hoa trên slot của máy.
   * Chốt chặn FR-INV-32: từ chối nếu máy bận (đơn chờ thanh toán hoặc lệnh xịt dở dang).
   */
  async openRefillSession(
    actor: AuthenticatedUser,
    input: OpenRefillSessionInput,
  ): Promise<RefillSessionRecord> {
    const isStaff =
      actor.roles.includes('PLATFORM_SUPER_ADMIN') ||
      actor.roles.includes('OPERATIONS_STAFF') ||
      actor.roles.includes('INVENTORY_STAFF');

    if (!isStaff) {
      throw new AppError('FORBIDDEN_SCOPE', 'common.forbidden');
    }

    // 1. Chốt chặn FR-INV-32: kiểm tra máy bận
    const isBusy = await this.queries.hasPendingOrdersOrDispenseOnMachine(input.machineId);
    if (isBusy) {
      throw new AppError('MACHINE_BUSY', 'ord.machineBusy');
    }

    // 2. Kiểm tra slot có hợp đồng thuê hợp lệ (ADR-0006)
    const activeRental = await this.queries.findActiveSlotRental(input.slotId);
    if (!activeRental) {
      throw new AppError('RENTAL_NOT_ACTIVE', 'slt.rentalNotActive');
    }

    // 3. Mở phiếu nạp
    return this.queries.createRefillSession({
      machineId: input.machineId,
      slotId: input.slotId,
      brandId: activeRental.brandId,
      performedBy: actor.userId,
      notes: input.notes,
    });
  }

  /**
   * Tra cứu danh sách phiếu nạp.
   */
  async listRefillSessions(
    filter: { page: number; pageSize: number; machineId?: string; status?: any },
  ): Promise<{ items: RefillSessionRecord[]; total: number }> {
    return this.queries.listRefillSessions(filter);
  }

  /**
   * FR-INV-31, 35: Đóng phiếu nạp và kiểm tra chai hợp lệ.
   */
  async closeRefillSession(
    actor: AuthenticatedUser,
    id: string,
    input: CloseRefillSessionInput,
  ): Promise<RefillSessionRecord> {
    const isStaff =
      actor.roles.includes('PLATFORM_SUPER_ADMIN') ||
      actor.roles.includes('OPERATIONS_STAFF') ||
      actor.roles.includes('INVENTORY_STAFF');

    if (!isStaff) {
      throw new AppError('FORBIDDEN_SCOPE', 'common.forbidden');
    }

    const session = await this.queries.findRefillSessionById(id);
    if (!session) {
      throw new AppError('NOT_FOUND', 'common.notFound');
    }

    if (session.status !== 'STARTED') {
      throw new AppError('VALIDATION_ERROR', 'validation.invalidPayload');
    }

    // 1. Kiểm tra checklist an toàn (FR-INV-14)
    if (!input.checklistCompleted) {
      throw new AppError('VALIDATION_ERROR', 'validation.invalidPayload');
    }

    // 2. Kiểm tra khối lượng ban đầu (FR-INV-05)
    if (!input.initialMeasuredWeightG || input.initialMeasuredWeightG <= 0) {
      throw new AppError('VALIDATION_ERROR', 'validation.tooSmall');
    }

    // 3. Kiểm tra chai mới
    const bottle = await this.queries.findBottleById(input.newBottleId);
    if (!bottle) {
      throw new AppError('NOT_FOUND', 'common.notFound');
    }

    // FR-INV-06: chai phải cùng thương hiệu với phiên nạp/hợp đồng thuê
    if (bottle.brandId !== session.brandId) {
      throw new AppError('BOTTLE_NOT_OWNED', 'common.outOfScope');
    }

    // 4. FR-INV-35: Kiểm tra giấy tờ chính hãng của lô hàng
    const batch = await this.queries.findBatchById(bottle.batchId);
    const authStatus = batch?.supplierInfo?.authenticityStatus;
    if (authStatus !== 'APPROVED') {
      throw new AppError('VALIDATION_ERROR', 'inv.batchNotApproved');
    }

    const now = new Date();
    const weightStr = String(input.initialMeasuredWeightG);

    // 5. Cập nhật chai sang INSTALLED & gán vào slot
    await this.queries.updateBottleInstalled(input.newBottleId, weightStr);
    await this.queries.updateSlotBottle(session.slotId, input.newBottleId);

    // 6. Đóng phiếu nạp
    await this.queries.closeRefillSession(id, {
      newBottleId: input.newBottleId,
      afterWeightG: weightStr,
      checklistCompleted: true,
      notes: input.notes,
      completedAt: now,
    });

    return (await this.queries.findRefillSessionById(id))!;
  }
}

