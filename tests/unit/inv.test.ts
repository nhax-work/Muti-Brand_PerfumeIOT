/**
 * Unit tests cho Module INV — Khai báo gửi hàng, Giấy tờ chính hãng, Phiếu nạp & Chốt chặn (FR-INV-22..35).
 * Sử dụng FakeInvQueries để test logic nghiệp vụ cô lập và nhanh chóng.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../../apps/api/src/modules/auth/principal.loader.js';
import { InvService } from '../../apps/api/src/modules/inv/inv.service.js';
import type {
  BottleRecord,
  InventoryBatchRecord,
  RefillSessionRecord,
  ShipmentDeclarationRecord,
} from '../../apps/api/src/modules/inv/inv.queries.js';
import { AppError } from '../../apps/api/src/shared/errors/index.js';

const BRAND_A = '11111111-1111-4111-8111-000000000001';
const PRODUCT_A1 = 'prod-1111-1111-1111-000000000001';
const MACHINE_1 = 'mach-1111-1111-1111-000000000001';
const SLOT_1 = 'slot-1111-1111-1111-000000000001';

const BRAND_ADMIN_A: AuthenticatedUser = {
  userId: 'user-brand-a',
  email: 'admin@brand-a.com',
  fullName: 'Brand A Admin',
  roles: ['BRAND_ADMIN'],
  brandId: BRAND_A,
  permissions: new Set(['brand.manage']),
  permissionVersion: 1,
  scope: { type: 'BRAND', brandId: BRAND_A },
  sessionId: 'session-1',
  mustChangePassword: false,
};

const INVENTORY_STAFF: AuthenticatedUser = {
  userId: 'user-inv-staff',
  email: 'inv@station.com',
  fullName: 'Inventory Staff',
  roles: ['INVENTORY_STAFF'],
  brandId: null,
  permissions: new Set(['inventory.manage']),
  permissionVersion: 1,
  scope: { type: 'PLATFORM' },
  sessionId: 'session-2',
  mustChangePassword: false,
};

const SUPER_ADMIN: AuthenticatedUser = {
  userId: 'user-super-admin',
  email: 'admin@station.com',
  fullName: 'Super Admin',
  roles: ['PLATFORM_SUPER_ADMIN'],
  brandId: null,
  permissions: new Set(['*']),
  permissionVersion: 1,
  scope: { type: 'PLATFORM' },
  sessionId: 'session-3',
  mustChangePassword: false,
};

class FakeInvQueries {
  shipments = new Map<string, ShipmentDeclarationRecord>();
  batches = new Map<string, InventoryBatchRecord>();
  bottles = new Map<string, BottleRecord>();
  refillSessions = new Map<string, RefillSessionRecord>();
  slotBottles = new Map<string, string | null>();
  activeRentals = new Map<
    string,
    { id: string; slotId: string; brandId: string; status: string }
  >();
  busyMachines = new Set<string>();

  private seq = 0;

  async createShipmentDeclaration(data: {
    brandId: string;
    fragranceProductId: string;
    declaredQuantity: number;
    declaredBottleVolumeMl: string;
    expectedShipDate?: Date | null;
    declaredBy: string;
  }): Promise<ShipmentDeclarationRecord> {
    const id = `decl-${++this.seq}`;
    const rec: ShipmentDeclarationRecord = {
      id,
      brandId: data.brandId,
      fragranceProductId: data.fragranceProductId,
      declaredQuantity: data.declaredQuantity,
      declaredBottleVolumeMl: data.declaredBottleVolumeMl,
      expectedShipDate: data.expectedShipDate ?? null,
      status: 'DECLARED',
      receivedQuantity: null,
      discrepancyNotes: null,
      declaredBy: data.declaredBy,
      receivedBy: null,
      receivedAt: null,
      createdAt: new Date(),
    };
    this.shipments.set(id, rec);
    return rec;
  }

  async findShipmentDeclarationById(
    id: string,
    scope?: any,
  ): Promise<ShipmentDeclarationRecord | null> {
    const item = this.shipments.get(id);
    if (!item) return null;
    if (scope && scope.kind === 'BRAND' && item.brandId !== scope.brandId) return null;
    return item;
  }

  async listShipmentDeclarations(
    filter: any,
    scope?: any,
  ): Promise<{ items: ShipmentDeclarationRecord[]; total: number }> {
    let list = Array.from(this.shipments.values());
    if (scope && scope.kind === 'BRAND') {
      list = list.filter((x) => x.brandId === scope.brandId);
    }
    return { items: list, total: list.length };
  }

  async updateShipmentDeclarationReceive(id: string, data: any): Promise<void> {
    const item = this.shipments.get(id);
    if (item) {
      Object.assign(item, data);
    }
  }

  async createBatch(data: any): Promise<InventoryBatchRecord> {
    const id = `batch-${++this.seq}`;
    const rec: InventoryBatchRecord = {
      id,
      brandId: data.brandId,
      fragranceProductId: data.fragranceProductId,
      sourceDeclarationId: data.sourceDeclarationId ?? null,
      batchNumber: data.batchNumber,
      quantityReceived: data.quantityReceived,
      receivedAt: data.receivedAt,
      expiresAt: null,
      createdBy: 'user-inv-staff',
      supplierInfo: data.supplierInfo ?? {},
      createdAt: new Date(),
    };
    this.batches.set(id, rec);
    return rec;
  }

  async findBatchById(id: string, scope?: any): Promise<InventoryBatchRecord | null> {
    const item = this.batches.get(id);
    if (!item) return null;
    if (scope && scope.kind === 'BRAND' && item.brandId !== scope.brandId) return null;
    return item;
  }

  async listBatches(
    filter: any,
    scope?: any,
  ): Promise<{ items: InventoryBatchRecord[]; total: number }> {
    let list = Array.from(this.batches.values());
    if (scope && scope.kind === 'BRAND') {
      list = list.filter((x) => x.brandId === scope.brandId);
    }
    return { items: list, total: list.length };
  }

  async updateBatchSupplierInfo(id: string, supplierInfo: any): Promise<void> {
    const item = this.batches.get(id);
    if (item) {
      this.batches.set(id, { ...item, supplierInfo });
    }
  }

  async createBottle(data: any): Promise<BottleRecord> {
    const id = `btl-${++this.seq}`;
    const rec: BottleRecord = {
      id,
      batchId: data.batchId,
      brandId: data.brandId,
      fragranceProductId: data.fragranceProductId,
      identifier: data.identifier,
      initialVolumeMl: data.initialVolumeMl,
      currentEstimatedMl: data.initialVolumeMl,
      owner: 'BRAND',
      status: data.status,
      initialMeasuredWeightG: null,
      currentMeasuredWeightG: null,
      installedAt: null,
      removedAt: null,
      createdAt: new Date(),
    };
    this.bottles.set(id, rec);
    return rec;
  }

  async findBottleById(id: string): Promise<BottleRecord | null> {
    return this.bottles.get(id) ?? null;
  }

  async findBottleByIdentifier(identifier: string): Promise<BottleRecord | null> {
    for (const b of this.bottles.values()) {
      if (b.identifier === identifier) return b;
    }
    return null;
  }

  async listBottles(filter: any, scope?: any): Promise<{ items: BottleRecord[]; total: number }> {
    let list = Array.from(this.bottles.values());
    if (scope && scope.kind === 'BRAND') {
      list = list.filter((x) => x.brandId === scope.brandId);
    }
    return { items: list, total: list.length };
  }

  async updateBottleInstalled(id: string, initialMeasuredWeightG: string): Promise<void> {
    const b = this.bottles.get(id);
    if (b) {
      this.bottles.set(id, {
        ...b,
        status: 'INSTALLED',
        initialMeasuredWeightG,
        installedAt: new Date(),
      });
    }
  }

  async updateSlotBottle(slotId: string, bottleId: string): Promise<void> {
    this.slotBottles.set(slotId, bottleId);
  }

  async hasPendingOrdersOrDispenseOnMachine(machineId: string): Promise<boolean> {
    return this.busyMachines.has(machineId);
  }

  async findActiveSlotRental(slotId: string): Promise<any> {
    return this.activeRentals.get(slotId) ?? null;
  }

  async createRefillSession(data: any): Promise<RefillSessionRecord> {
    const id = `refill-${++this.seq}`;
    const rec: RefillSessionRecord = {
      id,
      machineId: data.machineId,
      slotId: data.slotId,
      brandId: data.brandId,
      oldBottleId: null,
      newBottleId: null,
      checklistCompleted: false,
      status: 'STARTED',
      notes: data.notes ?? null,
      beforeWeightG: null,
      afterWeightG: null,
      performedBy: data.performedBy,
      startedAt: new Date(),
      completedAt: null,
    };
    this.refillSessions.set(id, rec);
    return rec;
  }

  async findRefillSessionById(id: string): Promise<RefillSessionRecord | null> {
    return this.refillSessions.get(id) ?? null;
  }

  async listRefillSessions(_filter: any): Promise<{ items: RefillSessionRecord[]; total: number }> {
    const list = Array.from(this.refillSessions.values());
    return { items: list, total: list.length };
  }

  async closeRefillSession(id: string, data: any): Promise<void> {
    const s = this.refillSessions.get(id);
    if (s) {
      this.refillSessions.set(id, {
        ...s,
        status: 'COMPLETED',
        newBottleId: data.newBottleId,
        afterWeightG: data.afterWeightG,
        checklistCompleted: data.checklistCompleted,
        notes: data.notes ?? s.notes,
        completedAt: data.completedAt,
      });
    }
  }
}

describe('Module INV Unit Tests', () => {
  let fakeQueries: FakeInvQueries;
  let service: InvService;

  beforeEach(() => {
    fakeQueries = new FakeInvQueries();
    service = new InvService(fakeQueries as any);

    // Chuẩn bị 1 hợp đồng thuê slot đang active của BRAND_A
    fakeQueries.activeRentals.set(SLOT_1, {
      id: 'rental-1',
      slotId: SLOT_1,
      brandId: BRAND_A,
      status: 'ACTIVE',
    });
  });

  describe('1. Khai báo gửi hàng (FR-INV-22 ÷ 28)', () => {
    it('FR-INV-22: Brand Admin khai báo lô hàng gửi kho thành công', async () => {
      const decl = await service.declareShipment(BRAND_ADMIN_A, {
        fragranceProductId: PRODUCT_A1,
        declaredQuantity: 20,
        declaredBottleVolumeMl: '50',
      });

      expect(decl.id).toBeDefined();
      expect(decl.brandId).toBe(BRAND_A);
      expect(decl.status).toBe('DECLARED');
      expect(decl.declaredQuantity).toBe(20);
    });

    it('Tài khoản không phải Brand thì không thể khai báo gửi hàng', async () => {
      await expect(
        service.declareShipment(INVENTORY_STAFF, {
          fragranceProductId: PRODUCT_A1,
          declaredQuantity: 10,
          declaredBottleVolumeMl: '50',
        }),
      ).rejects.toThrow(AppError);
    });
  });

  describe('2. Tiếp nhận & đối soát tại kho (FR-INV-24, 25, 26)', () => {
    let declarationId: string;

    beforeEach(async () => {
      const decl = await service.declareShipment(BRAND_ADMIN_A, {
        fragranceProductId: PRODUCT_A1,
        declaredQuantity: 20,
        declaredBottleVolumeMl: '50',
      });
      declarationId = decl.id;
    });

    it('FR-INV-24 & 26: Tiếp nhận khớp số lượng -> RECEIVED & tự động tạo lô tồn kho', async () => {
      const res = await service.receiveShipment(INVENTORY_STAFF, declarationId, {
        receivedQuantity: 20,
      });

      expect(res.declaration.status).toBe('RECEIVED');
      expect(res.declaration.receivedQuantity).toBe(20);
      expect(res.batch).toBeDefined();
      expect(res.batch?.quantityReceived).toBe(20);
      expect(res.batch?.brandId).toBe(BRAND_A);
      expect(res.batch?.supplierInfo?.authenticityStatus).toBe('PENDING');
    });

    it('FR-INV-25 AC2: Số lượng lệch nhưng KHÔNG có ghi chú -> ném lỗi VALIDATION_ERROR', async () => {
      await expect(
        service.receiveShipment(INVENTORY_STAFF, declarationId, {
          receivedQuantity: 18,
          discrepancyNotes: '',
        }),
      ).rejects.toThrow(AppError);
    });

    it('FR-INV-25 AC1 & 26: Số lượng lệch CÓ ghi chú -> DISCREPANCY & tạo lô với số lượng thực nhận', async () => {
      const res = await service.receiveShipment(INVENTORY_STAFF, declarationId, {
        receivedQuantity: 18,
        discrepancyNotes: 'Bị vỡ 2 chai trong quá trình vận chuyển',
      });

      expect(res.declaration.status).toBe('DISCREPANCY');
      expect(res.declaration.discrepancyNotes).toBe('Bị vỡ 2 chai trong quá trình vận chuyển');
      expect(res.batch?.quantityReceived).toBe(18);
    });
  });

  describe('3. Giấy tờ chính hãng của lô (FR-INV-33 ÷ 35)', () => {
    let batchId: string;

    beforeEach(async () => {
      const decl = await service.declareShipment(BRAND_ADMIN_A, {
        fragranceProductId: PRODUCT_A1,
        declaredQuantity: 10,
        declaredBottleVolumeMl: '50',
      });
      const res = await service.receiveShipment(INVENTORY_STAFF, decl.id, {
        receivedQuantity: 10,
      });
      batchId = res.batch!.id;
    });

    it('FR-INV-33: Brand nộp giấy tờ chính hãng cho lô', async () => {
      const updated = await service.submitBatchAuthenticity(BRAND_ADMIN_A, batchId, {
        documentUrl: 'https://docs.brand.com/invoice-123.pdf',
        documentType: 'CERTIFICATE_OF_ORIGIN',
      });

      expect(updated.supplierInfo?.authenticityStatus).toBe('PENDING');
      expect(updated.supplierInfo?.documentUrl).toBe('https://docs.brand.com/invoice-123.pdf');
    });

    it('FR-INV-34 AC1: Super Admin phê duyệt giấy tờ chính hãng thành APPROVED', async () => {
      await service.submitBatchAuthenticity(BRAND_ADMIN_A, batchId, {
        documentUrl: 'https://docs.brand.com/invoice-123.pdf',
      });

      const approved = await service.approveBatchAuthenticity(SUPER_ADMIN, batchId);
      expect(approved.supplierInfo?.authenticityStatus).toBe('APPROVED');
      expect(approved.supplierInfo?.verifiedBy).toBe(SUPER_ADMIN.userId);
    });

    it('FR-INV-34 AC2 & AC3: Super Admin từ chối giấy tờ chính hãng (bắt buộc lý do)', async () => {
      await expect(
        service.rejectBatchAuthenticity(SUPER_ADMIN, batchId, { reason: '' }),
      ).rejects.toThrow(AppError);

      const rejected = await service.rejectBatchAuthenticity(SUPER_ADMIN, batchId, {
        reason: 'Hóa đơn mờ không rõ ngày phát hành',
      });

      expect(rejected.supplierInfo?.authenticityStatus).toBe('REJECTED');
      expect(rejected.supplierInfo?.rejectionReason).toBe('Hóa đơn mờ không rõ ngày phát hành');
    });
  });

  describe('4. Phiếu nạp & Chốt chặn an toàn (FR-INV-29 ÷ 32, FR-INV-35)', () => {
    let approvedBatchId: string;
    let pendingBatchId: string;
    let validBottleId: string;
    let unapprovedBottleId: string;

    beforeEach(async () => {
      // 1 batch đã duyệt chính hãng
      const b1 = await fakeQueries.createBatch({
        brandId: BRAND_A,
        fragranceProductId: PRODUCT_A1,
        batchNumber: 'BATCH-APPROVED',
        quantityReceived: 10,
        receivedAt: new Date(),
        supplierInfo: { authenticityStatus: 'APPROVED' },
      });
      approvedBatchId = b1.id;

      // 1 batch chưa duyệt chính hãng
      const b2 = await fakeQueries.createBatch({
        brandId: BRAND_A,
        fragranceProductId: PRODUCT_A1,
        batchNumber: 'BATCH-PENDING',
        quantityReceived: 10,
        receivedAt: new Date(),
        supplierInfo: { authenticityStatus: 'PENDING' },
      });
      pendingBatchId = b2.id;

      // Đăng ký 2 chai
      const btl1 = await service.registerBottle(INVENTORY_STAFF, {
        batchId: approvedBatchId,
        identifier: 'BOTTLE-OK-001',
        initialVolumeMl: '50',
      });
      validBottleId = btl1.id;

      const btl2 = await service.registerBottle(INVENTORY_STAFF, {
        batchId: pendingBatchId,
        identifier: 'BOTTLE-UNAPPROVED-002',
        initialVolumeMl: '50',
      });
      unapprovedBottleId = btl2.id;
    });

    it('FR-INV-32: Chốt chặn máy bận — từ chối mở phiếu nạp khi máy đang bận', async () => {
      fakeQueries.busyMachines.add(MACHINE_1);

      await expect(
        service.openRefillSession(INVENTORY_STAFF, {
          machineId: MACHINE_1,
          slotId: SLOT_1,
        }),
      ).rejects.toThrow(AppError);
    });

    it('FR-INV-29: Mở phiếu nạp thành công khi máy rảnh', async () => {
      const session = await service.openRefillSession(INVENTORY_STAFF, {
        machineId: MACHINE_1,
        slotId: SLOT_1,
      });

      expect(session.id).toBeDefined();
      expect(session.status).toBe('STARTED');
      expect(session.performedBy).toBe(INVENTORY_STAFF.userId);
    });

    it('FR-INV-35: Chặn lắp chai thuộc lô CHƯA duyệt chính hãng', async () => {
      const session = await service.openRefillSession(INVENTORY_STAFF, {
        machineId: MACHINE_1,
        slotId: SLOT_1,
      });

      await expect(
        service.closeRefillSession(INVENTORY_STAFF, session.id, {
          newBottleId: unapprovedBottleId,
          initialMeasuredWeightG: 120.5,
          checklistCompleted: true,
        }),
      ).rejects.toThrow(AppError);
    });

    it('FR-INV-14: Bắt buộc hoàn tất checklist an toàn trước khi đóng phiếu nạp', async () => {
      const session = await service.openRefillSession(INVENTORY_STAFF, {
        machineId: MACHINE_1,
        slotId: SLOT_1,
      });

      await expect(
        service.closeRefillSession(INVENTORY_STAFF, session.id, {
          newBottleId: validBottleId,
          initialMeasuredWeightG: 120.5,
          checklistCompleted: false, // Chưa tích checklist
        }),
      ).rejects.toThrow(AppError);
    });

    it('FR-INV-31 & 35: Đóng phiếu nạp thành công với chai đã duyệt chính hãng & checklist hoàn tất', async () => {
      const session = await service.openRefillSession(INVENTORY_STAFF, {
        machineId: MACHINE_1,
        slotId: SLOT_1,
      });

      const closed = await service.closeRefillSession(INVENTORY_STAFF, session.id, {
        newBottleId: validBottleId,
        initialMeasuredWeightG: 120.5,
        checklistCompleted: true,
        notes: 'Đã lắp chai và cân thử khớp 120.5g',
      });

      expect(closed.status).toBe('COMPLETED');
      expect(closed.newBottleId).toBe(validBottleId);
      expect(closed.checklistCompleted).toBe(true);

      // Kiểm tra chai đã chuyển sang INSTALLED và gán vào slot
      const bottle = await fakeQueries.findBottleById(validBottleId);
      expect(bottle?.status).toBe('INSTALLED');
      expect(fakeQueries.slotBottles.get(SLOT_1)).toBe(validBottleId);
    });
  });
});
