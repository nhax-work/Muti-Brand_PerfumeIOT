/**
 * Nghiệp vụ Tồn kho, Khai báo gửi hàng, Giấy tờ chính hãng và Phiếu nạp (FR-INV-01..35).
 */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/principal.loader.js';
import { AppError } from '../../shared/errors/index.js';
import { resolveBrandScope } from '../../shared/scoping/index.js';
import { DATABASE, type Database } from '../../shared/db/index.js';
import type { BottleStatus } from '../../shared/db/types.generated.js';
import { AuditService } from '../../shared/audit/index.js';
import {
  InvQueries,
  type BottleRecord,
  type Executor,
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
  batchNumber?: string;
  expiresAt?: string | Date | null;
  discrepancyNotes?: string | null;
}

export interface SubmitAuthenticityInput {
  documentUrl: string;
  documentType?: string;
}

export interface OpenRefillSessionInput {
  machineId?: string;
  slotId: string;
  beforeWeightG?: number | null;
  refillRequestId?: string | null;
  notes?: string | null;
}

export interface CloseRefillSessionInput {
  newBottleId: string;
  checklistCompleted: boolean;
  initialMeasuredWeightG?: number;
  afterWeightG?: number;
  notes?: string | null;
}

type Audit = Pick<AuditService, 'log'>;

@Injectable()
export class InvService {
  private readonly logger = new Logger(InvService.name);

  constructor(
    @Inject(InvQueries) private readonly queries: InvQueries,
    @Optional() @Inject(DATABASE) private readonly db?: Database,
    @Optional() @Inject(AuditService) private readonly audit?: Audit,
  ) {}

  private async runInTx<T>(fn: (tx: Executor) => Promise<T>): Promise<T> {
    if (this.db) {
      return this.db.transaction().execute((tx) => fn(tx));
    }
    return fn(this.queries as any);
  }

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

    // FR-INV-22 AC2: Sản phẩm phải thuộc thương hiệu khai báo
    const product = await this.queries.findFragranceProductById(input.fragranceProductId);
    if (!product) {
      throw new AppError('NOT_FOUND', 'common.notFound');
    }
    if (product.brandId !== scope.brandId) {
      throw new AppError('PRODUCT_NOT_OWNED', 'common.outOfScope');
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

    return this.runInTx(async (tx) => {
      // 1. Khóa bản ghi khai báo FOR UPDATE để tránh race condition
      const decl = await this.queries.findShipmentDeclarationByIdForUpdate(id, tx);
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

      // 2. Cập nhật khai báo trong cùng transaction
      await this.queries.updateShipmentDeclarationReceive(
        id,
        {
          status: newStatus,
          receivedQuantity: receivedQty,
          discrepancyNotes: isDiscrepancy ? input.discrepancyNotes : null,
          receivedBy: actor.userId,
          receivedAt: now,
        },
        tx,
      );

      let createdBatch: InventoryBatchRecord | undefined = undefined;

      // 3. FR-INV-26: Tự động tạo lô nước hoa nếu số thực nhận > 0
      if (receivedQty > 0) {
        const batchNumber =
          input.batchNumber && input.batchNumber.trim()
            ? input.batchNumber.trim()
            : `BATCH-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${decl.brandId.slice(0, 4).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;

        createdBatch = await this.queries.createBatch(
          {
            brandId: decl.brandId,
            fragranceProductId: decl.fragranceProductId,
            sourceDeclarationId: decl.id,
            batchNumber,
            quantityReceived: receivedQty,
            receivedAt: now,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
            supplierInfo: {
              authenticityStatus: 'PENDING',
              initialDeclaredQuantity: decl.declaredQuantity,
            },
            createdBy: actor.userId,
          },
          tx,
        );
      }

      // 4. Ghi AuditLog (FR-AUD-07)
      if (this.audit) {
        await this.audit.log(
          {
            actorType: 'USER',
            actorId: actor.userId,
            brandId: decl.brandId,
            action: 'inv.shipment.received',
            targetType: 'shipment_declaration',
            targetId: id,
            after: {
              status: newStatus,
              receivedQuantity: receivedQty,
              batchId: createdBatch?.id,
            },
          },
          tx as any,
        );
      }

      const updatedDecl = (await this.queries.findShipmentDeclarationById(
        id,
        { kind: 'UNRESTRICTED' },
        tx,
      ))!;
      return { declaration: updatedDecl, batch: createdBatch };
    });
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

    return this.runInTx(async (tx) => {
      // 1. Kiểm tra slot tồn tại và suy ra máy đích (RefillSessionOpen contract)
      const slot = await this.queries.findSlotById(input.slotId, tx);
      if (!slot) {
        throw new AppError('NOT_FOUND', 'common.notFound');
      }

      const machineId = input.machineId ?? slot.machineId;
      if (input.machineId && input.machineId !== slot.machineId) {
        throw new AppError('VALIDATION_ERROR', 'validation.invalidPayload');
      }

      // 2. Khóa dòng máy trong CSDL để tránh kiosk tạo đơn chen ngang
      await this.queries.lockMachine(machineId, tx);

      // 3. Chốt chặn FR-INV-32: kiểm tra máy bận
      const isBusy = await this.queries.hasPendingOrdersOrDispenseOnMachine(machineId, tx);
      if (isBusy) {
        throw new AppError('MACHINE_BUSY', 'ord.machineBusy');
      }

      // 4. Chặn hai phiếu STARTED trên cùng slot
      const existingSession = await this.queries.findActiveRefillSessionOnSlot(input.slotId, tx);
      if (existingSession) {
        throw new AppError('SLOT_OCCUPIED', 'validation.invalidPayload');
      }

      // 5. Kiểm tra slot có hợp đồng thuê hợp lệ (ADR-0006)
      const activeRental = await this.queries.findActiveSlotRental(input.slotId, tx);
      if (!activeRental) {
        throw new AppError('RENTAL_NOT_ACTIVE', 'slt.rentalNotActive');
      }

      // 6. Mở phiếu nạp
      const session = await this.queries.createRefillSession(
        {
          machineId,
          slotId: input.slotId,
          brandId: activeRental.brandId,
          oldBottleId: slot.activeBottleId,
          performedBy: actor.userId,
          notes: input.notes,
        },
        tx,
      );

      if (this.audit) {
        await this.audit.log(
          {
            actorType: 'USER',
            actorId: actor.userId,
            brandId: activeRental.brandId,
            action: 'inv.refill.opened',
            targetType: 'refill_session',
            targetId: session.id,
            after: {
              machineId,
              slotId: input.slotId,
              oldBottleId: slot.activeBottleId,
            },
          },
          tx as any,
        );
      }

      return session;
    });
  }

  /**
   * Tra cứu danh sách phiếu nạp (lọc theo thương hiệu theo BR-012).
   */
  async listRefillSessions(
    actor: AuthenticatedUser,
    filter: {
      page: number;
      pageSize: number;
      machineId?: string;
      status?: any;
    },
  ): Promise<{ items: RefillSessionRecord[]; total: number }> {
    const scope = resolveBrandScope(actor);
    return this.queries.listRefillSessions(filter, scope);
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

    return this.runInTx(async (tx) => {
      // 1. Khóa phiếu FOR UPDATE
      const session = await this.queries.findRefillSessionByIdForUpdate(id, tx);
      if (!session) {
        throw new AppError('NOT_FOUND', 'common.notFound');
      }

      if (session.status !== 'STARTED') {
        throw new AppError('VALIDATION_ERROR', 'validation.invalidPayload');
      }

      // 2. Kiểm tra checklist an toàn (FR-INV-14)
      if (!input.checklistCompleted) {
        throw new AppError('VALIDATION_ERROR', 'validation.invalidPayload');
      }

      // 3. Kiểm tra khối lượng đo được (nếu cung cấp)
      const measuredWeight = input.afterWeightG ?? input.initialMeasuredWeightG;
      if (measuredWeight != null && measuredWeight <= 0) {
        throw new AppError('VALIDATION_ERROR', 'validation.tooSmall');
      }

      // 4. Kiểm tra chai mới
      const bottle = await this.queries.findBottleById(input.newBottleId, tx);
      if (!bottle) {
        throw new AppError('NOT_FOUND', 'common.notFound');
      }

      if (bottle.status !== 'IN_STOCK') {
        throw new AppError('VALIDATION_ERROR', 'validation.invalidPayload');
      }

      // FR-INV-06: chai phải cùng thương hiệu với phiên nạp/hợp đồng thuê (BOTTLE_NOT_OWNED)
      if (bottle.brandId !== session.brandId) {
        throw new AppError('BOTTLE_NOT_OWNED', 'common.outOfScope');
      }

      const now = new Date();

      // 5. FR-INV-35: Kiểm tra giấy tờ chính hãng của lô hàng (BATCH_NOT_APPROVED)
      const batch = await this.queries.findBatchById(bottle.batchId, { kind: 'UNRESTRICTED' }, tx);
      const authStatus = batch?.supplierInfo?.authenticityStatus;
      if (authStatus !== 'APPROVED') {
        throw new AppError('VALIDATION_ERROR', 'inv.batchNotApproved');
      }

      // FR-INV-08: Chai quá hạn sử dụng (BOTTLE_EXPIRED)
      const isExpired = batch?.expiresAt && new Date(batch.expiresAt) < now;
      if (isExpired) {
        throw new AppError('BOTTLE_EXPIRED', 'validation.invalidPayload');
      }

      // FR-INV-07: Chai lệch sản phẩm cấu hình cho slot (PRODUCT_MISMATCH)
      const rental = await this.queries.findActiveSlotRental(session.slotId, tx);
      if (rental?.fragranceProductId && rental.fragranceProductId !== bottle.fragranceProductId) {
        throw new AppError('PRODUCT_MISMATCH', 'validation.invalidPayload');
      }

      // 6. Xử lý chai cũ trong slot (nếu có)
      if (session.oldBottleId) {
        const oldBottle = await this.queries.findBottleById(session.oldBottleId, tx);
        if (oldBottle) {
          const remainingMl = Number(oldBottle.currentEstimatedMl ?? 0);
          const oldStatus: BottleStatus = remainingMl > 0 ? 'IN_STOCK' : 'EMPTY';
          await this.queries.updateBottleRemoved(
            session.oldBottleId,
            {
              status: oldStatus,
              removedAt: now,
            },
            tx,
          );
        }
      }

      const weightStr = measuredWeight != null ? String(measuredWeight) : '0';

      // 7. Cập nhật chai sang INSTALLED & gán vào slot
      await this.queries.updateBottleInstalled(input.newBottleId, weightStr, tx);
      await this.queries.updateSlotBottle(session.slotId, input.newBottleId, tx);

      // 8. Đóng phiếu nạp
      await this.queries.closeRefillSession(
        id,
        {
          newBottleId: input.newBottleId,
          afterWeightG: weightStr,
          checklistCompleted: true,
          notes: input.notes,
          completedAt: now,
        },
        tx,
      );

      // 9. Ghi AuditLog (FR-AUD-07)
      if (this.audit) {
        await this.audit.log(
          {
            actorType: 'USER',
            actorId: actor.userId,
            brandId: session.brandId,
            action: 'mch.refill.closed',
            targetType: 'refill_session',
            targetId: id,
            after: {
              machineId: session.machineId,
              slotId: session.slotId,
              newBottleId: input.newBottleId,
              oldBottleId: session.oldBottleId,
              completedAt: now,
            },
          },
          tx as any,
        );
      }

      return (await this.queries.findRefillSessionById(id, tx))!;
    });
  }
}
