/**
 * Unit test cho module SLT — Hợp đồng thuê slot (FR-SLT-01..06).
 * SltService được khởi tạo trực tiếp với phụ thuộc giả (QT2, ADR-0003).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { AuditEntry } from '../../apps/api/src/shared/audit/index.js';
import type { AuthenticatedUser } from '../../apps/api/src/modules/auth/principal.loader.js';
import type { BrandScope } from '../../apps/api/src/shared/scoping/index.js';
import { SltService } from '../../apps/api/src/modules/slt/slt.service.js';
import type {
  CreateSlotRentalData,
  SlotRentalFilter,
  SlotRentalRecord,
  SlotRentalStatus,
} from '../../apps/api/src/modules/slt/slt.queries.js';

const BRAND_A = '11111111-1111-4111-8111-000000000001';
const SLOT_1 = '33333333-3333-4333-8333-000000000001';

class FakeAuditService {
  entries: AuditEntry[] = [];
  async log(entry: AuditEntry) {
    this.entries.push(entry);
  }
}

class FakeSltQueries {
  rentals = new Map<string, SlotRentalRecord>();
  private seq = 0;

  async list(scope: BrandScope, filter: SlotRentalFilter) {
    let items = [...this.rentals.values()];
    if (scope.kind === 'BRAND') {
      items = items.filter((r) => r.brandId === scope.brandId);
    }
    if (filter.slotId) {
      items = items.filter((r) => r.slotId === filter.slotId);
    }
    if (filter.brandId) {
      items = items.filter((r) => r.brandId === filter.brandId);
    }
    if (filter.status) {
      items = items.filter((r) => r.status === filter.status);
    }
    const total = items.length;
    const offset = (filter.page - 1) * filter.pageSize;
    items = items.slice(offset, offset + filter.pageSize);
    return { items, total };
  }

  async findById(scope: BrandScope, id: string) {
    const r = this.rentals.get(id);
    if (!r) return undefined;
    if (scope.kind === 'BRAND' && r.brandId !== scope.brandId) {
      return undefined;
    }
    return r;
  }

  async create(input: CreateSlotRentalData) {
    // Giả lập Partial Unique Index: uq_slot_active_rental trên slot_id khi status IN ('ACTIVE', 'EXPIRING', 'GRACE', 'LIQUIDATED')
    if (input.status === 'ACTIVE') {
      const activeExists = [...this.rentals.values()].some(
        (r) => r.slotId === input.slotId && r.status === 'ACTIVE',
      );
      if (activeExists) {
        const err = new Error('duplicate key value violates unique constraint "uq_slot_active_rental"');
        (err as unknown as { code: string; constraint: string }).code = '23505';
        (err as unknown as { code: string; constraint: string }).constraint = 'uq_slot_active_rental';
        throw err;
      }
    }

    const id = `rental-${++this.seq}`;
    const record: SlotRentalRecord = {
      id,
      slotId: input.slotId,
      machineId: 'mch-1',
      brandId: input.brandId,
      fragranceProductId: input.fragranceProductId ?? null,
      productAssignedAt: input.fragranceProductId ? new Date() : null,
      requestId: input.requestId ?? null,
      previousRentalId: input.previousRentalId ?? null,
      status: input.status ?? 'DRAFT',
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      graceEndsAt: input.graceEndsAt ?? null,
      pricePerSpray: input.pricePerSpray,
      currency: input.currency ?? 'VND',
      fixedFee: input.fixedFee ?? '0',
      revenueSharePercent: input.revenueSharePercent ?? 0,
      terminatedReason: null,
      createdBy: input.createdBy,
      createdAt: new Date('2026-09-25T10:00:00Z'),
      updatedAt: new Date('2026-09-25T10:00:00Z'),
    };
    this.rentals.set(id, record);
    return id;
  }

  async updateStatus(
    id: string,
    status: SlotRentalStatus,
    extra?: { terminatedReason?: string | null; graceEndsAt?: Date | null },
  ) {
    const current = this.rentals.get(id);
    if (!current) return;

    if (status === 'ACTIVE') {
      const activeExists = [...this.rentals.values()].some(
        (r) => r.id !== id && r.slotId === current.slotId && r.status === 'ACTIVE',
      );
      if (activeExists) {
        const err = new Error('duplicate key value violates unique constraint "uq_slot_active_rental"');
        (err as unknown as { code: string; constraint: string }).code = '23505';
        (err as unknown as { code: string; constraint: string }).constraint = 'uq_slot_active_rental';
        throw err;
      }
    }

    const updated: SlotRentalRecord = {
      ...current,
      status,
      terminatedReason: extra?.terminatedReason !== undefined ? extra.terminatedReason : current.terminatedReason,
      graceEndsAt: extra?.graceEndsAt !== undefined ? extra.graceEndsAt : current.graceEndsAt,
      updatedAt: new Date(),
    };
    this.rentals.set(id, updated);
  }
}

const adminUser: AuthenticatedUser = {
  userId: 'user-admin',
  brandId: null,
  roles: ['PLATFORM_SUPER_ADMIN'],
  permissions: new Set(['rental.manage']),
  permissionVersion: 1,
  scope: { type: 'PLATFORM' },
  email: 'admin@scentstation.com',
  fullName: 'Super Admin',
  sessionId: 'sess-1',
  mustChangePassword: false,
};

const scopeUnrestricted: BrandScope = { kind: 'UNRESTRICTED' };

describe('SltService — Quản lý hợp đồng thuê slot', () => {
  let queries: FakeSltQueries;
  let audit: FakeAuditService;
  let service: SltService;

  beforeEach(() => {
    queries = new FakeSltQueries();
    audit = new FakeAuditService();
    service = new SltService(queries, audit);
  });

  it('test_FR_SLT_01_create_slot_rental — tạo hợp đồng DRAFT khi bắt đầu ở tương lai', async () => {
    const result = await service.create(adminUser, {
      slotId: SLOT_1,
      brandId: BRAND_A,
      startsAt: '2026-10-01T00:00:00Z',
      endsAt: '2026-12-31T23:59:59Z',
      pricePerSpray: '25000',
    });

    expect(result.id).toBeDefined();
    expect(result.status).toBe('DRAFT');
    expect(result.slotId).toBe(SLOT_1);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]?.action).toBe('slt.rental.created');
  });

  it('test_FR_SLT_01_create_slot_rental — tạo hợp đồng ACTIVE khi ngày bắt đầu ở quá khứ/hiện tại', async () => {
    const result = await service.create(adminUser, {
      slotId: SLOT_1,
      brandId: BRAND_A,
      startsAt: '2026-09-01T00:00:00Z',
      endsAt: '2026-12-31T23:59:59Z',
      pricePerSpray: '25000',
    });

    expect(result.status).toBe('ACTIVE');
  });

  it('test_FR_SLT_01_invalid_rental_period — từ chối khi endsAt <= startsAt', async () => {
    await expect(
      service.create(adminUser, {
        slotId: SLOT_1,
        brandId: BRAND_A,
        startsAt: '2026-10-01T00:00:00Z',
        endsAt: '2026-09-01T00:00:00Z',
        pricePerSpray: '25000',
      }),
    ).rejects.toThrowError();
  });

  it('test_FR_SLT_01_invalid_financials — từ chối khi tham số tài chính âm hoặc vượt 100%', async () => {
    await expect(
      service.create(adminUser, {
        slotId: SLOT_1,
        brandId: BRAND_A,
        startsAt: '2026-10-01T00:00:00Z',
        endsAt: '2026-12-31T23:59:59Z',
        pricePerSpray: '25000',
        revenueSharePercent: 150,
      }),
    ).rejects.toThrowError();
  });

  it('test_FR_SLT_02_activate_slot_rental — chuyển trạng thái từ DRAFT sang ACTIVE', async () => {
    const draft = await service.create(adminUser, {
      slotId: SLOT_1,
      brandId: BRAND_A,
      startsAt: '2026-10-01T00:00:00Z',
      endsAt: '2026-12-31T23:59:59Z',
      pricePerSpray: '25000',
    });

    const active = await service.activate(adminUser, scopeUnrestricted, draft.id);
    expect(active.status).toBe('ACTIVE');
    expect(audit.entries).toHaveLength(2);
    expect(audit.entries[1]?.action).toBe('slt.rental.activated');
  });

  it('test_FR_SLT_02_reject_occupied_slot — CSDL từ chối khi kích hoạt ACTIVE thứ hai trên cùng slot', async () => {
    // Tạo và kích hoạt hợp đồng 1
    const draft1 = await service.create(adminUser, {
      slotId: SLOT_1,
      brandId: BRAND_A,
      startsAt: '2026-10-01T00:00:00Z',
      endsAt: '2026-12-31T23:59:59Z',
      pricePerSpray: '25000',
    });
    await service.activate(adminUser, scopeUnrestricted, draft1.id);

    // Tạo hợp đồng 2 trên cùng slot
    const draft2 = await service.create(adminUser, {
      slotId: SLOT_1,
      brandId: BRAND_A,
      startsAt: '2027-01-01T00:00:00Z',
      endsAt: '2027-03-31T23:59:59Z',
      pricePerSpray: '30000',
    });

    // Kích hoạt hợp đồng 2 phải bị từ chối do CSDL chặn
    await expect(service.activate(adminUser, scopeUnrestricted, draft2.id)).rejects.toThrowError();
  });

  it('test_FR_SLT_06_invalid_status_transition — từ chối kích hoạt khi hợp đồng không phải DRAFT', async () => {
    const active = await service.create(adminUser, {
      slotId: SLOT_1,
      brandId: BRAND_A,
      startsAt: '2026-09-01T00:00:00Z',
      endsAt: '2026-12-31T23:59:59Z',
      pricePerSpray: '25000',
    });

    await expect(service.activate(adminUser, scopeUnrestricted, active.id)).rejects.toThrowError();
  });
});
