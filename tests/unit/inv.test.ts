/**
 * Unit test cho module INV — phần mở rộng vòng đời tồn kho:
 * tạo lô thủ công, tháo chai về kho, điều chỉnh tồn kho, lịch sử chai và audit log đóng phiếu nạp.
 */

import 'reflect-metadata';
import type { Schema } from '@scentstation/contracts';
import type { Kysely } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuditEntry } from '../../apps/api/src/shared/audit/index.js';
import type { AppConfig } from '../../apps/api/src/shared/config/index.js';
import type { DB } from '../../apps/api/src/shared/db/index.js';
import type { BottleStatus, SlotStatus } from '../../apps/api/src/shared/db/types.generated.js';
import { AppError } from '../../apps/api/src/shared/errors/index.js';
import type { BrandScope } from '../../apps/api/src/shared/scoping/index.js';
import {
  REQUIRED_PERMISSIONS,
  REQUIRES_REAUTH,
} from '../../apps/api/src/modules/auth/decorators.js';
import type { AuthenticatedUser } from '../../apps/api/src/modules/auth/principal.loader.js';
import type { AlrService } from '../../apps/api/src/modules/alr/index.js';
import {
  BottlesController,
  InventoryAdjustmentsController,
  InventoryBatchesController,
  SlotBottleController,
} from '../../apps/api/src/modules/inv/inv.http.js';
import type {
  BatchRecord,
  BottleAdjustmentTarget,
  BottleRecord,
  InventoryAdjustmentRecord,
  InvQueries,
  PageFilter,
  RefillSessionRecord,
  SlotForRefill,
  StockableRental,
} from '../../apps/api/src/modules/inv/inv.queries.js';
import { InvService } from '../../apps/api/src/modules/inv/inv.service.js';
import type { RfqService } from '../../apps/api/src/modules/rfq/index.js';
import type { CompensationService, SltService } from '../../apps/api/src/modules/slt/index.js';

const BRAND_A = '11111111-1111-4111-8111-111111111111';
const BRAND_B = '22222222-2222-4222-8222-222222222222';
const PRODUCT_A = '33333333-3333-4333-8333-333333333333';
const PRODUCT_B = '44444444-4444-4444-8444-444444444444';
const MACHINE_1 = '55555555-5555-4555-8555-555555555555';
const SLOT_1 = '66666666-6666-4666-8666-666666666666';
const RENTAL_1 = '77777777-7777-4777-8777-777777777777';
const BATCH_1 = '88888888-8888-4888-8888-888888888888';
const BOTTLE_1 = '99999999-9999-4999-8999-999999999999';
const BOTTLE_2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION_1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const inventoryStaff: AuthenticatedUser = {
  userId: 'user-inv-1',
  brandId: null,
  roles: ['INVENTORY_STAFF'],
  permissions: new Set(['inventory.manage', 'inventory.adjust']),
  permissionVersion: 1,
  scope: { type: 'PLATFORM' },
  email: 'inv@scentstation.local',
  fullName: 'Inventory Staff',
  sessionId: 'sess-inv-1',
  mustChangePassword: false,
  emailVerificationPending: false,
};

const brandAdminA: AuthenticatedUser = {
  userId: 'user-brand-a',
  brandId: BRAND_A,
  roles: ['BRAND_ADMIN'],
  permissions: new Set(['inventory.declare', 'inventory.adjust']),
  permissionVersion: 1,
  scope: { type: 'BRAND', brandId: BRAND_A },
  email: 'brand-a@scentstation.local',
  fullName: 'Brand Admin A',
  sessionId: 'sess-brand-a',
  mustChangePassword: false,
  emailVerificationPending: false,
};

class FakeInvQueries {
  brands = new Set<string>([BRAND_A, BRAND_B]);
  products = new Map<string, { brandId: string; name: string }>([
    [PRODUCT_A, { brandId: BRAND_A, name: 'Santal Nocturne' }],
    [PRODUCT_B, { brandId: BRAND_B, name: 'Rose Oud' }],
  ]);
  batches = new Map<string, BatchRecord>();
  bottles = new Map<string, BottleRecord>();
  slots = new Map<string, SlotForRefill>();
  rentals = new Map<string, StockableRental>();
  sessions = new Map<string, RefillSessionRecord>();
  adjustments: InventoryAdjustmentRecord[] = [];
  busyMachines = new Set<string>();
  openRefillSlots = new Set<string>();
  nonRenewalSlots = new Set<string>();
  duplicateBatchKey = false;
  transactionCalls = 0;

  private batchSeq = 0;
  private adjSeq = 0;

  constructor(private readonly auditLogs: Schema<'AuditLogEntry'>[]) {}

  async transaction<T>(work: (tx: Kysely<DB>) => Promise<T>): Promise<T> {
    this.transactionCalls += 1;
    return work({} as Kysely<DB>);
  }

  async brandExists(brandId: string): Promise<boolean> {
    return this.brands.has(brandId);
  }

  async findProductBrand(productId: string): Promise<string | null> {
    return this.products.get(productId)?.brandId ?? null;
  }

  async insertBatch(data: {
    readonly brandId: string;
    readonly fragranceProductId: string;
    readonly sourceDeclarationId: string | null;
    readonly batchNumber: string;
    readonly receivedAt: Date;
    readonly expiresAt: Date | null;
    readonly quantityReceived: number;
    readonly supplierInfo?: Record<string, unknown> | null;
    readonly createdBy: string;
  }): Promise<string> {
    if (this.duplicateBatchKey) {
      throw { code: '23505', constraint: 'uq_batch_brand_product_number' };
    }
    const id = `batch-gen-${++this.batchSeq}`;
    this.batches.set(id, {
      id,
      brandId: data.brandId,
      fragranceProductId: data.fragranceProductId,
      productName: this.products.get(data.fragranceProductId)?.name ?? 'Unknown',
      sourceDeclarationId: data.sourceDeclarationId,
      batchNumber: data.batchNumber,
      receivedAt: data.receivedAt,
      expiresAt: data.expiresAt,
      quantityReceived: data.quantityReceived,
      authenticityStatus: 'APPROVED',
      authenticityDocumentUrl: null,
      authenticityDocumentType: null,
      authenticitySubmittedAt: null,
      authenticityVerifiedAt: null,
      authenticityRejectionReason: null,
    });
    return id;
  }

  async findBatch(id: string): Promise<BatchRecord | null> {
    return this.batches.get(id) ?? null;
  }

  async lockSlotAndMachine(slotId: string): Promise<SlotForRefill | null> {
    return this.slots.get(slotId) ?? null;
  }

  async machineIsBusy(machineId: string): Promise<boolean> {
    return this.busyMachines.has(machineId);
  }

  async slotHasOpenRefillSession(slotId: string): Promise<boolean> {
    return this.openRefillSlots.has(slotId);
  }

  async slotHasNonRenewalRental(slotId: string): Promise<boolean> {
    return this.nonRenewalSlots.has(slotId);
  }

  async lockBottleForAdjustment(id: string): Promise<BottleAdjustmentTarget | null> {
    const b = this.bottles.get(id);
    if (!b) return null;
    return {
      id: b.id,
      brandId: b.brandId,
      owner: b.owner,
      status: b.status,
      currentEstimatedMl: b.currentEstimatedMl,
    };
  }

  async clearSlotBottle(
    slotId: string,
    _tx: Kysely<DB>,
    options?: { readonly markUnavailableIfAvailable?: boolean },
  ): Promise<void> {
    const s = this.slots.get(slotId);
    if (!s) return;
    this.slots.set(slotId, {
      ...s,
      activeBottleId: null,
      slotStatus:
        options?.markUnavailableIfAvailable && s.slotStatus === 'AVAILABLE'
          ? 'UNAVAILABLE'
          : s.slotStatus,
    });
    for (const [id, b] of this.bottles.entries()) {
      if (b.installedSlotId === slotId) {
        this.bottles.set(id, { ...b, installedSlotId: null });
      }
    }
  }

  async removeBottle(id: string): Promise<void> {
    const b = this.bottles.get(id);
    if (!b) return;
    const nextStatus: BottleStatus =
      b.status === 'LIQUIDATED' || b.status === 'EXPIRED' || b.status === 'DAMAGED'
        ? b.status
        : Number(b.currentEstimatedMl) > 0
          ? 'IN_STOCK'
          : 'EMPTY';
    this.bottles.set(id, { ...b, status: nextStatus, installedSlotId: null });
  }

  async findBottle(id: string): Promise<BottleRecord | null> {
    return this.bottles.get(id) ?? null;
  }

  async findBottleScoped(id: string, scope: BrandScope): Promise<BottleRecord | null> {
    const b = this.bottles.get(id);
    if (!b) return null;
    if (scope.kind === 'BRAND' && b.brandId !== scope.brandId) return null;
    return b;
  }

  async slotHoldingBottle(bottleId: string): Promise<string | null> {
    for (const s of this.slots.values()) {
      if (s.activeBottleId === bottleId) return s.id;
    }
    return null;
  }

  async setBottleStock(
    id: string,
    data: { readonly remainingMl: string; readonly status: BottleStatus },
  ): Promise<void> {
    const b = this.bottles.get(id);
    if (!b) return;
    this.bottles.set(id, {
      ...b,
      currentEstimatedMl: data.remainingMl,
      status: data.status,
    });
  }

  readonly updatedSlotStocks: Array<{
    slotId: string;
    remainingMl: string;
    sprays: number;
    status: SlotStatus;
  }> = [];

  async setSlotStock(
    id: string,
    data: { readonly remainingMl: string; readonly sprays: number; readonly status: SlotStatus },
  ): Promise<void> {
    this.updatedSlotStocks.push({ slotId: id, ...data });
    const s = this.slots.get(id);
    if (!s) return;
    this.slots.set(id, { ...s, slotStatus: data.status });
  }

  async insertAdjustment(data: {
    readonly brandId: string;
    readonly bottleId: string;
    readonly slotId: string | null;
    readonly beforeQuantityMl: string;
    readonly afterQuantityMl: string;
    readonly differenceMl: string;
    readonly reason: string;
    readonly adjustedBy: string;
  }): Promise<InventoryAdjustmentRecord> {
    const record: InventoryAdjustmentRecord = {
      id: `adj-${++this.adjSeq}`,
      brandId: data.brandId,
      bottleId: data.bottleId,
      slotId: data.slotId,
      beforeQuantityMl: data.beforeQuantityMl,
      afterQuantityMl: data.afterQuantityMl,
      differenceMl: data.differenceMl,
      reason: data.reason,
      adjustedBy: data.adjustedBy,
      createdAt: new Date('2026-10-19T10:00:00Z'),
    };
    this.adjustments.push(record);
    return record;
  }

  async listBottleHistory(
    bottleId: string,
    filter: PageFilter,
  ): Promise<{ items: Schema<'AuditLogEntry'>[]; total: number }> {
    const matching = this.auditLogs.filter(
      (entry) => entry.targetType === 'Bottle' && entry.targetId === bottleId,
    );
    const offset = (filter.page - 1) * filter.pageSize;
    return { items: matching.slice(offset, offset + filter.pageSize), total: matching.length };
  }

  async lockRefillSession(id: string): Promise<RefillSessionRecord | null> {
    return this.sessions.get(id) ?? null;
  }

  async findStockableRental(slotId: string): Promise<StockableRental | null> {
    return this.rentals.get(slotId) ?? null;
  }

  async lockBottleForInstall(id: string) {
    const b = this.bottles.get(id);
    if (!b) return null;
    const batch = this.batches.get(b.batchId);
    return {
      id: b.id,
      brandId: b.brandId,
      owner: b.owner,
      status: b.status,
      expiresAt: b.expiresAt,
      fragranceProductId: b.fragranceProductId,
      batchAuthenticity: batch?.authenticityStatus ?? 'APPROVED',
      currentEstimatedMl: b.currentEstimatedMl,
    };
  }

  async installBottle(id: string): Promise<void> {
    const b = this.bottles.get(id);
    if (!b) return;
    this.bottles.set(id, { ...b, status: 'INSTALLED' });
  }

  async setSlotBottle(slot: SlotForRefill, bottle: { id: string }): Promise<void> {
    const s = this.slots.get(slot.id);
    if (!s) return;
    this.slots.set(slot.id, { ...s, activeBottleId: bottle.id, slotStatus: 'AVAILABLE' });
    const b = this.bottles.get(bottle.id);
    if (b) {
      this.bottles.set(bottle.id, { ...b, installedSlotId: slot.id });
    }
  }

  async completeRefillSession(
    id: string,
    data: {
      readonly oldBottleId: string | null;
      readonly newBottleId: string;
      readonly notes: string | null;
      readonly completedAt: Date;
    },
  ): Promise<void> {
    const s = this.sessions.get(id);
    if (!s) return;
    this.sessions.set(id, {
      ...s,
      oldBottleId: data.oldBottleId,
      newBottleId: data.newBottleId,
      notes: data.notes,
      status: 'COMPLETED',
      checklistCompleted: true,
      completedAt: data.completedAt,
    });
  }

  async findRefillSession(id: string): Promise<RefillSessionRecord | null> {
    return this.sessions.get(id) ?? null;
  }
}

class FakeAudit {
  entries: AuditEntry[] = [];
  logEntries: Schema<'AuditLogEntry'>[] = [];
  private seq = 0;

  async log(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    this.logEntries.push({
      id: `audit-${++this.seq}`,
      brandId: entry.brandId ?? null,
      actorType: entry.actorType === 'ANONYMOUS' ? 'SYSTEM' : entry.actorType,
      actorId: entry.actorId ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      sourceIp: null,
      severity: entry.severity ?? 'INFO',
      beforeData: (entry.before ?? null) as Record<string, unknown> | null,
      afterData: (entry.after ?? null) as Record<string, unknown> | null,
      occurredAt: '2026-10-19T10:00:00.000Z',
    });
  }
}

function makeBottle(overrides: Partial<BottleRecord> = {}): BottleRecord {
  return {
    id: BOTTLE_1,
    brandId: BRAND_A,
    owner: 'BRAND',
    batchId: BATCH_1,
    fragranceProductId: PRODUCT_A,
    identifier: 'BTL-001',
    status: 'INSTALLED',
    initialVolumeMl: '50.0000',
    currentEstimatedMl: '48.1255',
    installedSlotId: SLOT_1,
    expiresAt: null,
    sourceRentalId: null,
    liquidatedAt: null,
    bottleReturnId: null,
    damagedAt: null,
    damageReason: null,
    ...overrides,
  };
}

function makeSlot(overrides: Partial<SlotForRefill> = {}): SlotForRefill {
  return {
    id: SLOT_1,
    machineId: MACHINE_1,
    slotStatus: 'AVAILABLE',
    activeBottleId: BOTTLE_1,
    calibratedDosageMl: '0.2500',
    lowStockThresholdMl: '10.0000',
    ...overrides,
  };
}

let queries: FakeInvQueries;
let audit: FakeAudit;
let service: InvService;
const sltCalls = { activatedRentals: [] as string[] };
const rfqCalls = { completedSessions: [] as string[] };

beforeEach(() => {
  sltCalls.activatedRentals = [];
  rfqCalls.completedSessions = [];
  audit = new FakeAudit();
  queries = new FakeInvQueries(audit.logEntries);

  const sltStub = {
    activateOnFirstBottleInstall: async (rentalId: string) => {
      sltCalls.activatedRentals.push(rentalId);
    },
  } as unknown as SltService;

  const rfqStub = {
    completeForSession: async (_tx: Kysely<DB>, sessionId: string) => {
      rfqCalls.completedSessions.push(sessionId);
    },
  } as unknown as RfqService;

  service = new InvService(
    queries as unknown as InvQueries,
    sltStub,
    {} as AlrService,
    {} as CompensationService,
    rfqStub,
    audit as unknown as never,
    {} as AppConfig,
    { now: () => new Date('2026-10-19T10:00:00Z') },
  );
});

describe('INV controllers — quyền, xác thực lại và validate HTTP', () => {
  it('gắn đúng decorator phân quyền và reauth cho 4 endpoint mới', () => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS, InventoryBatchesController.prototype.create),
    ).toEqual(['inventory.manage']);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS, SlotBottleController.prototype.removeBottle),
    ).toEqual(['inventory.manage']);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS, InventoryAdjustmentsController.prototype.create),
    ).toEqual(['inventory.adjust']);
    expect(
      Reflect.getMetadata(REQUIRES_REAUTH, InventoryAdjustmentsController.prototype.create),
    ).toBe(true);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS, BottlesController.prototype.history),
    ).toBeUndefined();
  });

  it('controller điều chỉnh tồn kho cho reason trống đi qua parseBody để service trả ADJUSTMENT_REASON_REQUIRED', async () => {
    const ctrl = new InventoryAdjustmentsController(service);
    await expect(
      ctrl.create(inventoryStaff, { bottleId: BOTTLE_1, afterQuantityMl: 10, reason: '   ' }),
    ).rejects.toMatchObject({ code: 'ADJUSTMENT_REASON_REQUIRED' });
  });

  it('controller tạo lô từ chối số lượng không hợp lệ bằng VALIDATION_ERROR', async () => {
    const ctrl = new InventoryBatchesController(service);
    let caught: unknown;
    try {
      await ctrl.create(inventoryStaff, {
        brandId: BRAND_A,
        fragranceProductId: PRODUCT_A,
        batchNumber: 'LOT-01',
        receivedAt: '2026-10-19T08:00:00Z',
        quantityReceived: 0,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect(caught).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('controller lịch sử chai trả về items và meta phân trang', async () => {
    queries.bottles.set(BOTTLE_1, makeBottle());
    await audit.log({
      actorType: 'USER',
      actorId: inventoryStaff.userId,
      brandId: BRAND_A,
      action: 'inv.bottle.registered',
      targetType: 'Bottle',
      targetId: BOTTLE_1,
    });
    const ctrl = new BottlesController(service);
    const res = await ctrl.history(
      inventoryStaff,
      { kind: 'UNRESTRICTED' },
      { id: BOTTLE_1 },
      { page: '1', pageSize: '10' },
    );
    expect(res.meta).toEqual({ page: 1, pageSize: 10, total: 1 });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]?.action).toBe('inv.bottle.registered');
  });
});

describe('InvService.createBatch — FR-INV-01', () => {
  it('tạo lô thủ công (sourceDeclarationId null), trim mã lô và ghi audit log', async () => {
    const batch = await service.createBatch(inventoryStaff, {
      brandId: BRAND_A,
      fragranceProductId: PRODUCT_A,
      batchNumber: '  LOT-MANUAL-01  ',
      receivedAt: new Date('2026-10-19T08:00:00Z'),
      expiresAt: new Date('2027-10-19T08:00:00Z'),
      quantityReceived: 24,
      supplierInfo: { supplier: 'Grasse Labs' },
    });

    expect(batch.sourceDeclarationId).toBeNull();
    expect(batch.batchNumber).toBe('LOT-MANUAL-01');
    expect(batch.quantityReceived).toBe(24);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]?.action).toBe('inv.batch.created');
    expect(audit.entries[0]?.targetType).toBe('InventoryBatch');
  });

  it('chặn actor gắn thương hiệu tạo lô hộ thương hiệu khác bằng FORBIDDEN_SCOPE', async () => {
    await expect(
      service.createBatch(brandAdminA, {
        brandId: BRAND_B,
        fragranceProductId: PRODUCT_B,
        batchNumber: 'LOT-CROSS',
        receivedAt: new Date('2026-10-19T08:00:00Z'),
        quantityReceived: 5,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
  });

  it('từ chối khi hạn sử dụng không lớn hơn ngày nhập (expiresBeforeReceived)', async () => {
    await expect(
      service.createBatch(inventoryStaff, {
        brandId: BRAND_A,
        fragranceProductId: PRODUCT_A,
        batchNumber: 'LOT-EXP',
        receivedAt: new Date('2026-10-19T08:00:00Z'),
        expiresAt: new Date('2026-10-19T08:00:00Z'),
        quantityReceived: 5,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('từ chối khi sản phẩm thuộc thương hiệu khác (PRODUCT_NOT_OWNED)', async () => {
    await expect(
      service.createBatch(inventoryStaff, {
        brandId: BRAND_A,
        fragranceProductId: PRODUCT_B,
        batchNumber: 'LOT-MISMATCH',
        receivedAt: new Date('2026-10-19T08:00:00Z'),
        quantityReceived: 5,
      }),
    ).rejects.toMatchObject({ code: 'PRODUCT_NOT_OWNED' });
  });

  it('ánh xạ lỗi trùng mã lô trong cùng brand+product sang VALIDATION_ERROR', async () => {
    queries.duplicateBatchKey = true;
    await expect(
      service.createBatch(inventoryStaff, {
        brandId: BRAND_A,
        fragranceProductId: PRODUCT_A,
        batchNumber: 'LOT-DUP',
        receivedAt: new Date('2026-10-19T08:00:00Z'),
        quantityReceived: 5,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('InvService.removeBottleFromSlot — FR-INV-15', () => {
  it('tháo chai còn nước hoa về IN_STOCK, giữ nguyên ml và chuyển slot AVAILABLE → UNAVAILABLE', async () => {
    queries.slots.set(SLOT_1, makeSlot());
    queries.bottles.set(BOTTLE_1, makeBottle({ currentEstimatedMl: '32.5000' }));

    const result = await service.removeBottleFromSlot(
      inventoryStaff,
      SLOT_1,
      '  Bảo dưỡng định kỳ  ',
    );

    expect(result.status).toBe('IN_STOCK');
    expect(result.currentEstimatedMl).toBe(32.5);
    expect(result.installedSlotId).toBeNull();
    expect(queries.slots.get(SLOT_1)?.activeBottleId).toBeNull();
    expect(queries.slots.get(SLOT_1)?.slotStatus).toBe('UNAVAILABLE');
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]?.action).toBe('inv.bottle.removed');
    expect(audit.entries[0]?.targetType).toBe('Bottle');
    expect(audit.entries[0]?.after).toMatchObject({
      slotStatus: 'UNAVAILABLE',
      status: 'IN_STOCK',
      notes: 'Bảo dưỡng định kỳ',
    });
  });

  it('tháo chai 0ml về EMPTY và giữ nguyên trạng thái LIQUIDATED nếu chai đã thanh lý', async () => {
    queries.slots.set(SLOT_1, makeSlot({ slotStatus: 'UNAVAILABLE' }));
    queries.bottles.set(BOTTLE_1, makeBottle({ currentEstimatedMl: '0.0000' }));
    const emptyRes = await service.removeBottleFromSlot(inventoryStaff, SLOT_1);
    expect(emptyRes.status).toBe('EMPTY');

    queries.slots.set(SLOT_1, makeSlot({ slotStatus: 'MAINTENANCE' }));
    queries.bottles.set(
      BOTTLE_1,
      makeBottle({ owner: 'PLATFORM', status: 'LIQUIDATED', currentEstimatedMl: '20.0000' }),
    );
    const liqRes = await service.removeBottleFromSlot(inventoryStaff, SLOT_1);
    expect(liqRes.status).toBe('LIQUIDATED');
    expect(queries.slots.get(SLOT_1)?.slotStatus).toBe('MAINTENANCE');
  });

  it('chặn slot trống, máy bận, phiếu nạp mở, hóa đơn không gia hạn và sai phạm vi', async () => {
    await expect(service.removeBottleFromSlot(brandAdminA, SLOT_1)).rejects.toMatchObject({
      code: 'FORBIDDEN_SCOPE',
    });
    await expect(service.removeBottleFromSlot(inventoryStaff, SLOT_1)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    queries.slots.set(SLOT_1, makeSlot({ activeBottleId: null }));
    await expect(service.removeBottleFromSlot(inventoryStaff, SLOT_1)).rejects.toMatchObject({
      code: 'SLOT_UNAVAILABLE',
    });

    queries.slots.set(SLOT_1, makeSlot());
    queries.bottles.set(BOTTLE_1, makeBottle());

    queries.busyMachines.add(MACHINE_1);
    await expect(service.removeBottleFromSlot(inventoryStaff, SLOT_1)).rejects.toMatchObject({
      code: 'MACHINE_BUSY',
    });
    queries.busyMachines.delete(MACHINE_1);

    queries.openRefillSlots.add(SLOT_1);
    await expect(service.removeBottleFromSlot(inventoryStaff, SLOT_1)).rejects.toMatchObject({
      code: 'REFILL_SESSION_OPEN',
    });
    queries.openRefillSlots.delete(SLOT_1);

    queries.nonRenewalSlots.add(SLOT_1);
    await expect(service.removeBottleFromSlot(inventoryStaff, SLOT_1)).rejects.toMatchObject({
      code: 'RENTAL_NOT_ACTIVE',
    });
  });
});

describe('InvService.createAdjustment — FR-INV-16', () => {
  it('từ chối ngay nếu thiếu lý do mà không mở transaction', async () => {
    await expect(
      service.createAdjustment(inventoryStaff, {
        bottleId: BOTTLE_1,
        afterQuantityMl: 25,
        reason: null,
      }),
    ).rejects.toBeInstanceOf(AppError);
    expect(queries.transactionCalls).toBe(0);
  });

  it('đồng bộ chai đang lắp + slot với fixed-point và chuyển LOW / EMPTY theo ngưỡng', async () => {
    queries.slots.set(
      SLOT_1,
      makeSlot({ calibratedDosageMl: '0.2500', lowStockThresholdMl: '10.0000' }),
    );
    queries.bottles.set(BOTTLE_1, makeBottle({ currentEstimatedMl: '48.1255' }));

    const lowAdj = await service.createAdjustment(inventoryStaff, {
      bottleId: BOTTLE_1,
      afterQuantityMl: 8.5,
      reason: '  Kiểm kê hao hụt thực tế  ',
    });

    expect(lowAdj.beforeQuantityMl).toBe(48.1255);
    expect(lowAdj.afterQuantityMl).toBe(8.5);
    expect(lowAdj.differenceMl).toBe(-39.6255);
    expect(lowAdj.reason).toBe('Kiểm kê hao hụt thực tế');
    expect(lowAdj.slotId).toBe(SLOT_1);
    expect(queries.bottles.get(BOTTLE_1)?.status).toBe('LOW');
    expect(queries.updatedSlotStocks[0]).toEqual({
      slotId: SLOT_1,
      remainingMl: '8.5000',
      sprays: 34,
      status: 'AVAILABLE',
    });

    const emptyAdj = await service.createAdjustment(inventoryStaff, {
      bottleId: BOTTLE_1,
      afterQuantityMl: 0.2,
      reason: 'Cạn dưới mức 1 liều xịt',
    });
    expect(emptyAdj.differenceMl).toBe(-8.3);
    expect(queries.bottles.get(BOTTLE_1)?.status).toBe('EMPTY');
    expect(queries.slots.get(SLOT_1)?.slotStatus).toBe('UNAVAILABLE');
    expect(audit.entries.at(-1)?.severity).toBe('WARNING');
    expect(audit.entries.at(-1)?.action).toBe('inv.inventory.adjusted');
  });

  it('điều chỉnh chai trong kho cập nhật IN_STOCK/EMPTY và giữ nguyên trạng thái kết thúc', async () => {
    queries.bottles.set(
      BOTTLE_1,
      makeBottle({ status: 'EMPTY', currentEstimatedMl: '0.0000', installedSlotId: null }),
    );
    const restock = await service.createAdjustment(inventoryStaff, {
      bottleId: BOTTLE_1,
      afterQuantityMl: 12.25,
      reason: 'Hiệu chỉnh kiểm đếm kho',
    });
    expect(restock.slotId).toBeNull();
    expect(queries.bottles.get(BOTTLE_1)?.status).toBe('IN_STOCK');

    queries.bottles.set(
      BOTTLE_2,
      makeBottle({
        id: BOTTLE_2,
        status: 'LIQUIDATED',
        currentEstimatedMl: '15.0000',
        installedSlotId: null,
      }),
    );
    await service.createAdjustment(inventoryStaff, {
      bottleId: BOTTLE_2,
      afterQuantityMl: 14,
      reason: 'Đo lại chai thanh lý',
    });
    expect(queries.bottles.get(BOTTLE_2)?.status).toBe('LIQUIDATED');
  });

  it('chặn sai slotId đang lắp và ẩn tồn tại chai khác thương hiệu bằng notFoundFor (FORBIDDEN_SCOPE / NOT_FOUND)', async () => {
    queries.slots.set(SLOT_1, makeSlot());
    queries.bottles.set(BOTTLE_1, makeBottle({ brandId: BRAND_B }));

    await expect(
      service.createAdjustment(inventoryStaff, {
        bottleId: BOTTLE_1,
        slotId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        afterQuantityMl: 10,
        reason: 'Test mismatch',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      service.createAdjustment(brandAdminA, {
        bottleId: BOTTLE_1,
        afterQuantityMl: 10,
        reason: 'Cross brand',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });

    await expect(
      service.createAdjustment(inventoryStaff, {
        bottleId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        afterQuantityMl: 10,
        reason: 'Missing bottle',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('InvService.getBottleHistory & closeRefillSession audit — FR-INV-17 / 31', () => {
  it('ẩn lịch sử chai khác thương hiệu bằng notFoundFor (FORBIDDEN_SCOPE cho brand)', async () => {
    queries.bottles.set(BOTTLE_1, makeBottle({ brandId: BRAND_B }));

    await expect(
      service.getBottleHistory(brandAdminA, { kind: 'BRAND', brandId: BRAND_A }, BOTTLE_1, {
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });

    await expect(
      service.getBottleHistory(
        inventoryStaff,
        { kind: 'UNRESTRICTED' },
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        { page: 1, pageSize: 20 },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const ok = await service.getBottleHistory(inventoryStaff, { kind: 'UNRESTRICTED' }, BOTTLE_1, {
      page: 1,
      pageSize: 20,
    });
    expect(ok).toEqual({ items: [], total: 0 });
  });

  it('closeRefillSession ghi audit inv.bottle.removed cho chai cũ và inv.bottle.installed cho chai mới', async () => {
    queries.slots.set(SLOT_1, makeSlot({ activeBottleId: BOTTLE_1 }));
    queries.rentals.set(SLOT_1, {
      id: RENTAL_1,
      brandId: BRAND_A,
      fragranceProductId: PRODUCT_A,
      status: 'ACTIVE',
      startsAt: new Date('2026-10-01T00:00:00Z'),
      endsAt: new Date('2026-11-01T00:00:00Z'),
      previousRentalId: null,
    });
    queries.batches.set(BATCH_1, {
      id: BATCH_1,
      brandId: BRAND_A,
      fragranceProductId: PRODUCT_A,
      productName: 'Santal Nocturne',
      sourceDeclarationId: null,
      batchNumber: 'LOT-1',
      receivedAt: new Date('2026-10-01T00:00:00Z'),
      expiresAt: null,
      quantityReceived: 10,
      authenticityStatus: 'APPROVED',
      authenticityDocumentUrl: null,
      authenticityDocumentType: null,
      authenticitySubmittedAt: null,
      authenticityVerifiedAt: null,
      authenticityRejectionReason: null,
    });
    queries.bottles.set(BOTTLE_1, makeBottle({ status: 'LOW', currentEstimatedMl: '5.0000' }));
    queries.bottles.set(
      BOTTLE_2,
      makeBottle({
        id: BOTTLE_2,
        identifier: 'BTL-002',
        status: 'IN_STOCK',
        currentEstimatedMl: '50.0000',
        installedSlotId: null,
      }),
    );
    queries.sessions.set(SESSION_1, {
      id: SESSION_1,
      brandId: BRAND_A,
      machineId: MACHINE_1,
      slotId: SLOT_1,
      oldBottleId: BOTTLE_1,
      newBottleId: null,
      performedBy: inventoryStaff.userId,
      status: 'STARTED',
      checklistCompleted: false,
      notes: null,
      startedAt: new Date('2026-10-19T09:50:00Z'),
      completedAt: null,
    });

    await service.closeRefillSession(inventoryStaff, SESSION_1, {
      newBottleId: BOTTLE_2,
      notes: 'Thay chai đầy',
    });

    expect(rfqCalls.completedSessions).toEqual([SESSION_1]);
    expect(sltCalls.activatedRentals).toEqual([RENTAL_1]);
    expect(audit.entries.map((e) => [e.action, e.targetType, e.targetId])).toEqual([
      ['inv.bottle.removed', 'Bottle', BOTTLE_1],
      ['inv.bottle.installed', 'Bottle', BOTTLE_2],
      ['inv.refill.closed', 'RefillSession', SESSION_1],
    ]);
    expect(audit.entries[0]?.after).toMatchObject({
      status: 'IN_STOCK',
      refillSessionId: SESSION_1,
    });
    expect(audit.entries[1]?.after).toMatchObject({ status: 'INSTALLED', slotId: SLOT_1 });
  });
});
