/**
 * Unit test cho module SLT — đọc hóa đơn thuê slot và bảng giá (ADR-0006).
 * Service khởi tạo trực tiếp với phụ thuộc giả (QT2, ADR-0003).
 *
 * Bản trước kiểm `create`/`activate` — hai đường đã bỏ cùng `POST /slot-rentals` và
 * `POST /slot-rentals/:id/activate` (FR-SLT-01 bãi bỏ, ADR-0006). Ràng buộc "một hóa đơn hiệu lực mỗi
 * slot" (FR-SLT-02) do CSDL cưỡng chế và được chứng minh ở tests/integration/test_slot_constraint.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { AuditEntry } from '../../apps/api/src/shared/audit/index.js';
import type { AuthenticatedUser } from '../../apps/api/src/modules/auth/principal.loader.js';
import type { BrandScope } from '../../apps/api/src/shared/scoping/index.js';
import { AppError } from '../../apps/api/src/shared/errors/index.js';
import { SltService } from '../../apps/api/src/modules/slt/slt.service.js';
import {
  stageOf,
  type SlotRentalFilter,
  type SlotRentalRecord,
  type SlotRentalStatus,
} from '../../apps/api/src/modules/slt/slt.queries.js';
import { CatalogService } from '../../apps/api/src/modules/slt/catalog.service.js';
import type {
  CatalogQueries,
  RentalPackageRow,
  StoragePlanRow,
} from '../../apps/api/src/modules/slt/catalog.queries.js';
import type { MchService } from '../../apps/api/src/modules/mch/index.js';

const BRAND_A = '11111111-1111-4111-8111-000000000001';
const BRAND_B = '11111111-1111-4111-8111-000000000002';

function rental(id: string, overrides: Partial<SlotRentalRecord> = {}): SlotRentalRecord {
  return {
    id,
    slotId: 'slot-1',
    machineId: 'machine-1',
    brandId: BRAND_A,
    fragranceProductId: null,
    productAssignedAt: null,
    requestId: null,
    previousRentalId: null,
    status: 'DRAFT',
    startsAt: new Date('2026-10-01T00:00:00Z'),
    endsAt: new Date('2027-02-01T00:00:00Z'),
    graceEndsAt: null,
    pricePerSpray: null,
    currency: 'VND',
    fixedFee: '0.0000',
    revenueSharePercent: '0.00',
    terminatedReason: null,
    checkoutId: 'checkout-1',
    invoiceNumber: null,
    rentalPackageId: 'pkg-1',
    storagePlanId: 'plan-1',
    durationMonths: 3,
    monthlyRentPrice: '1000000.0000',
    discountPercent: '0.00',
    storageMonthlyPrice: '100000.0000',
    storageCoveragePercent: '30.00',
    storageCoverageCap: '3000000.0000',
    rentAmount: '3000000.0000',
    storageAmount: '300000.0000',
    graceFeeAmount: '0.0000',
    totalAmount: '3300000.0000',
    holdExpiresAt: new Date('2026-10-01T00:15:00Z'),
    paidAt: null,
    cancelledAt: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  };
}

class FakeSltQueries {
  rentals: SlotRentalRecord[] = [];
  lastFilter: SlotRentalFilter | null = null;

  async list(scope: BrandScope, filter: SlotRentalFilter) {
    this.lastFilter = filter;
    const items = this.rentals.filter(
      (r) => scope.kind === 'UNRESTRICTED' || r.brandId === scope.brandId,
    );
    return { items, total: items.length };
  }

  async findById(scope: BrandScope, id: string) {
    return (
      this.rentals.find(
        (r) => r.id === id && (scope.kind === 'UNRESTRICTED' || r.brandId === scope.brandId),
      ) ?? null
    );
  }
}

function user(overrides: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    userId: 'user-1',
    brandId: null,
    roles: [],
    permissions: new Set<string>(),
    permissionVersion: 1,
    scope: { type: 'PLATFORM' },
    email: 'u@scentstation.local',
    fullName: 'Người dùng',
    sessionId: 'sess-1',
    mustChangePassword: false,
    ...overrides,
  } as AuthenticatedUser;
}

const superAdmin = user({ permissions: new Set(['rental.manage']) });
const brandAdmin = user({
  userId: 'user-brand-a',
  brandId: BRAND_A,
  scope: { type: 'BRAND', brandId: BRAND_A } as AuthenticatedUser['scope'],
});

describe('SltService — đọc hóa đơn thuê slot', () => {
  let queries: FakeSltQueries;
  let service: SltService;

  beforeEach(() => {
    queries = new FakeSltQueries();
    service = new SltService(queries);
  });

  it('test_FR_SLT_41_list_brand_invoices', async () => {
    // AC1: mỗi hóa đơn đúng một nhãn.
    const cases: Array<[SlotRentalStatus, Date | null, string]> = [
      ['DRAFT', null, 'AWAITING_PAYMENT'],
      ['DRAFT', new Date(), 'AWAITING_STOCK'],
      ['ACTIVE', new Date(), 'ACTIVE'],
      ['EXPIRING', new Date(), 'EXPIRING'],
      ['GRACE', new Date(), 'GRACE'],
      ['LIQUIDATED', new Date(), 'LIQUIDATED'],
      ['RENEWED', new Date(), 'ENDED'],
      ['CLOSED', new Date(), 'ENDED'],
      ['TERMINATED', new Date(), 'ENDED'],
      ['CANCELLED', null, 'CANCELLED'],
    ];
    for (const [status, paidAt, expected] of cases) {
      expect(stageOf(status, paidAt)).toBe(expected);
    }

    queries.rentals = cases.map(([status, paidAt], i) => rental(`r-${i}`, { status, paidAt }));
    const { items } = await service.list(
      { kind: 'BRAND', brandId: BRAND_A },
      { page: 1, pageSize: 20 },
    );
    expect(items.map((r) => r.stage)).toEqual(cases.map(([, , stage]) => stage));
  });

  it('DTO mang đủ ảnh chụp giá và hạn giữ chỗ của phiên (FR-SLT-33, FR-SLT-40, ADR-0008)', async () => {
    queries.rentals = [rental('r-1')];
    const dto = await service.get(superAdmin, { kind: 'UNRESTRICTED' }, 'r-1');
    expect(dto).toMatchObject({
      status: 'DRAFT',
      stage: 'AWAITING_PAYMENT',
      checkoutId: 'checkout-1',
      monthlyRentPrice: '1000000.0000',
      discountPercent: 0,
      storageCoveragePercent: 30,
      totalAmount: '3300000.0000',
      holdExpiresAt: '2026-10-01T00:15:00.000Z',
      invoiceNumber: null,
    });
  });

  it('hóa đơn của thương hiệu khác trả FORBIDDEN_SCOPE, không phải 404 (FR-AUTH-08 AC2)', async () => {
    queries.rentals = [rental('r-b', { brandId: BRAND_B })];
    const error = await service
      .get(brandAdmin, { kind: 'BRAND', brandId: BRAND_A }, 'r-b')
      .catch((e: unknown) => e);
    expect((error as AppError).code).toBe('FORBIDDEN_SCOPE');
  });
});

// -------------------------------------------------------------------------------------
// Bảng giá (FR-SLT-30..32)
// -------------------------------------------------------------------------------------

class FakeCatalogQueries {
  packages: RentalPackageRow[] = [];
  plans: StoragePlanRow[] = [];
  lastPackageFilter: boolean | undefined | 'unset' = 'unset';

  async transaction<T>(work: (tx: never) => Promise<T>) {
    return work(undefined as never);
  }
  async listPackages(isActive?: boolean) {
    this.lastPackageFilter = isActive;
    return this.packages.filter((p) => isActive === undefined || p.is_active === isActive);
  }
  async lockPlan(id: string) {
    return this.plans.find((p) => p.id === id);
  }
  async lockActivePlanIds() {
    return this.plans.filter((p) => p.is_active).map((p) => p.id);
  }
  async updatePlan(id: string, changes: { isActive?: boolean }) {
    const plan = this.plans.find((p) => p.id === id) as StoragePlanRow;
    const updated = { ...plan, is_active: changes.isActive ?? plan.is_active };
    this.plans = this.plans.map((p) => (p.id === id ? updated : p));
    return updated;
  }
}

function pkg(id: string, isActive: boolean): RentalPackageRow {
  return {
    id,
    name: `Gói ${id}`,
    duration_months: 3,
    discount_percent: '0.00',
    is_active: isActive,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function plan(id: string, isActive: boolean): StoragePlanRow {
  return {
    id,
    name: `Bảo quản ${id}`,
    description: null,
    monthly_price: '100000.0000',
    currency: 'VND',
    coverage_percent: '30.00',
    coverage_cap: '3000000.0000',
    is_active: isActive,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

describe('CatalogService — bảng giá', () => {
  let queries: FakeCatalogQueries;
  let audits: AuditEntry[];
  let service: CatalogService;

  beforeEach(() => {
    queries = new FakeCatalogQueries();
    audits = [];
    service = new CatalogService(
      queries as unknown as CatalogQueries,
      { log: async (e: AuditEntry) => void audits.push(e) } as never,
      {} as MchService,
    );
  });

  it('test_FR_SLT_30_manage_rental_packages', async () => {
    queries.packages = [pkg('p1', true), pkg('p2', false)];
    // Super Admin thấy mọi gói, lọc được theo isActive.
    expect((await service.listPackages(superAdmin)).map((p) => p.id)).toEqual(['p1', 'p2']);
    expect((await service.listPackages(superAdmin, false)).map((p) => p.id)).toEqual(['p2']);
    // AC3: gói ngừng mở bán không xuất hiện với Brand Admin — kể cả khi hỏi thẳng isActive=false.
    expect((await service.listPackages(brandAdmin)).map((p) => p.id)).toEqual(['p1']);
    expect(await service.listPackages(brandAdmin, false)).toEqual([]);
  });

  it('test_FR_SLT_31_manage_storage_plans', async () => {
    queries.plans = [plan('a', true), plan('b', true)];
    // Ngừng mở bán khi vẫn còn gói khác đang mở: được, có ghi nhật ký.
    const updated = await service.updatePlan(superAdmin, 'a', { isActive: false });
    expect(updated.isActive).toBe(false);
    expect(audits.at(-1)?.action).toBe('slt.storage_plan.updated');

    // AC3: không ngừng được gói cuối cùng đang mở bán.
    const error = await service
      .updatePlan(superAdmin, 'b', { isActive: false })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('VALIDATION_ERROR');
    expect(queries.plans.find((p) => p.id === 'b')?.is_active).toBe(true);
  });
});
