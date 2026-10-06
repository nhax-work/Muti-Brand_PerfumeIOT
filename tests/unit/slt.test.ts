/**
 * Unit test cho module SLT — đọc hóa đơn thuê slot và bảng giá (ADR-0006).
 * Service khởi tạo trực tiếp với phụ thuộc giả (QT2, ADR-0003).
 *
 * Bản trước kiểm `create`/`activate` — hai đường đã bỏ cùng `POST /slot-rentals` và
 * `POST /slot-rentals/:id/activate` (FR-SLT-01 bãi bỏ, ADR-0006). Ràng buộc "một hóa đơn hiệu lực mỗi
 * slot" (FR-SLT-02) do CSDL cưỡng chế và được chứng minh ở tests/integration/test_slot_constraint.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { AuditEntry, AuditService } from '../../apps/api/src/shared/audit/index.js';
import type { AuthenticatedUser } from '../../apps/api/src/modules/auth/principal.loader.js';
import type { BrandScope } from '../../apps/api/src/shared/scoping/index.js';
import { AppError } from '../../apps/api/src/shared/errors/index.js';
import { SltService } from '../../apps/api/src/modules/slt/slt.service.js';
import {
  stageOf,
  type CheckoutCreateItemData,
  type SlotRentalFilter,
  type SlotRentalRecord,
  type SlotRentalStatus,
  type SltQueries,
} from '../../apps/api/src/modules/slt/slt.queries.js';
import { CatalogService } from '../../apps/api/src/modules/slt/catalog.service.js';
import type {
  CatalogQueries,
  RentalPackageRow,
  StoragePlanRow,
} from '../../apps/api/src/modules/slt/catalog.queries.js';
import type { MchService } from '../../apps/api/src/modules/mch/index.js';
import type { MchQueries } from '../../apps/api/src/modules/mch/mch.queries.js';

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
  products: Array<{ id: string; brandId: string; status: string }> = [];
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

  async findInvoiceDetailById(scope: BrandScope, id: string) {
    const r = await this.findById(scope, id);
    if (!r) return null;
    return {
      rentalId: r.id,
      checkoutId: r.checkoutId,
      invoiceNumber: r.invoiceNumber,
      status: r.status,
      brandId: r.brandId,
      slotId: r.slotId,
      slotNumber: 1,
      machineId: r.machineId,
      machineDisplayName: 'Máy Test',
      locationName: 'Địa Điểm Test',
      packageName: 'Gói 3 tháng',
      durationMonths: r.durationMonths,
      discountPercent: r.discountPercent,
      planName: 'Bảo quản Tiêu Chuẩn',
      storageMonthlyPrice: r.storageMonthlyPrice,
      storageCoveragePercent: r.storageCoveragePercent,
      storageCoverageCap: r.storageCoverageCap,
      monthlyRentPrice: r.monthlyRentPrice,
      rentAmount: r.rentAmount,
      storageAmount: r.storageAmount,
      graceFeeAmount: r.graceFeeAmount,
      totalAmount: r.totalAmount,
      currency: r.currency,
      holdExpiresAt: r.holdExpiresAt,
      paidAt: r.paidAt,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
    };
  }

  async findCheckoutById(scope: BrandScope, id: string) {
    const items = this.rentals.filter(
      (r) => r.checkoutId === id && (scope.kind === 'UNRESTRICTED' || r.brandId === scope.brandId),
    );
    if (items.length === 0) return null;
    const first = items[0]!;
    return {
      checkout: {
        id,
        brandId: first.brandId,
        currency: 'VND',
        totalAmount: '3300000.0000',
        holdExpiresAt: first.holdExpiresAt ?? new Date(),
        paidAt: first.paidAt,
        cancelledAt: first.cancelledAt,
        createdBy: 'user-1',
        createdAt: first.createdAt,
      },
      items,
    };
  }

  async createCheckoutTx(params: {
    brandId: string;
    createdBy: string;
    holdExpiresAt: Date;
    totalAmount: string;
    items: CheckoutCreateItemData[];
  }) {
    const checkoutId = `co-${Date.now()}`;
    const newRentals: SlotRentalRecord[] = params.items.map((item, index) => {
      const rec = rental(`r-${Date.now()}-${index}`, {
        slotId: item.slotId,
        brandId: params.brandId,
        checkoutId,
        status: 'DRAFT',
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        rentalPackageId: item.rentalPackageId,
        storagePlanId: item.storagePlanId,
        durationMonths: item.durationMonths,
        monthlyRentPrice: item.monthlyRentPrice,
        discountPercent: item.discountPercent,
        storageMonthlyPrice: item.storageMonthlyPrice,
        storageCoveragePercent: item.storageCoveragePercent,
        storageCoverageCap: item.storageCoverageCap,
        rentAmount: item.rentAmount,
        storageAmount: item.storageAmount,
        totalAmount: item.totalAmount,
        holdExpiresAt: params.holdExpiresAt,
      });
      return rec;
    });

    this.rentals.push(...newRentals);

    return {
      checkout: {
        id: checkoutId,
        brandId: params.brandId,
        currency: 'VND',
        totalAmount: params.totalAmount,
        holdExpiresAt: params.holdExpiresAt,
        paidAt: null,
        cancelledAt: null,
        createdBy: params.createdBy,
        createdAt: new Date(),
      },
      items: newRentals,
    };
  }

  async findProductById(id: string) {
    return this.products.find((p) => p.id === id) ?? null;
  }

  async updateProduct(
    scope: BrandScope,
    id: string,
    fragranceProductId: string,
  ): Promise<SlotRentalRecord | null> {
    const index = this.rentals.findIndex((r) => r.id === id);
    if (index === -1) return null;
    const current = this.rentals[index]!;
    const updated: SlotRentalRecord = {
      ...current,
      fragranceProductId,
      productAssignedAt: new Date(),
    };
    this.rentals[index] = updated;
    return updated;
  }

  async updatePricePerSpray(
    scope: BrandScope,
    id: string,
    pricePerSpray: string,
  ): Promise<SlotRentalRecord | null> {
    const index = this.rentals.findIndex((r) => r.id === id);
    if (index === -1) return null;
    const current = this.rentals[index]!;
    const updated: SlotRentalRecord = {
      ...current,
      pricePerSpray,
    };
    this.rentals[index] = updated;
    return updated;
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

describe('SltService — đọc và thao tác hóa đơn thuê slot', () => {
  let queries: FakeSltQueries;
  let catalogQueries: FakeCatalogQueries;
  let service: SltService;

  beforeEach(() => {
    queries = new FakeSltQueries();
    catalogQueries = new FakeCatalogQueries();
    catalogQueries.packages = [pkg('pkg-1', true)];
    catalogQueries.plans = [plan('plan-1', true)];

    const mchQueries = {
      findSlotById: async (id: string) => {
        if (id === 'slot-closed') return { id, monthlyRentPrice: null, currentRentalId: null };
        if (id === 'slot-occupied')
          return { id, monthlyRentPrice: '1000000.0000', currentRentalId: 'r-occ' };
        return { id, monthlyRentPrice: '1000000.0000', currentRentalId: null };
      },
    } as unknown as MchQueries;

    const audit = { log: async () => {} } as unknown as AuditService;
    const fakeConfig = {
      constraint: (name: string) =>
        name === 'RENTAL_MAX_STOCKING_DAYS' ? 30 : name === 'RENTAL_CHECKOUT_HOLD_MIN' ? 15 : 0,
    };

    service = new SltService(
      queries as unknown as SltQueries,
      catalogQueries as unknown as CatalogQueries,
      mchQueries,
      audit,
      {} as never,
      { now: () => new Date() } as never,
      {} as never,
      fakeConfig as never,
    );
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

  it('test_FR_SLT_34_show_package_quotes', async () => {
    const quote = await service.getQuote(brandAdmin, 'slot-1');
    expect(quote.slotId).toBe('slot-1');
    expect(quote.monthlyRentPrice).toBe('1000000.0000');
    expect(quote.packages.length).toBe(1);
    expect(quote.packages[0]).toMatchObject({
      rentalPackageId: 'pkg-1',
      durationMonths: 3,
      discountPercent: 0,
      rentAmount: '3000000.0000',
    });
    expect(quote.storagePlans.length).toBe(1);

    // Slot chưa có giá niêm yết
    await expect(service.getQuote(brandAdmin, 'slot-closed')).rejects.toThrow();

    // Slot đang bị chiếm dụng
    await expect(service.getQuote(brandAdmin, 'slot-occupied')).rejects.toThrow();
  });

  it('test_FR_SLT_35_checkout_holds_slot', async () => {
    const checkout = await service.createCheckout(
      brandAdmin,
      { kind: 'BRAND', brandId: BRAND_A },
      {
        items: [
          { slotId: 'slot-1', rentalPackageId: 'pkg-1', storagePlanId: 'plan-1' },
          { slotId: 'slot-2', rentalPackageId: 'pkg-1', storagePlanId: 'plan-1' },
        ],
      },
    );

    expect(checkout.brandId).toBe(BRAND_A);
    expect(checkout.stage).toBe('AWAITING_PAYMENT');
    expect(checkout.invoices.length).toBe(2);
    expect(checkout.invoices[0]!.status).toBe('DRAFT');

    // Chặn trùng slot trong items
    await expect(
      service.createCheckout(
        brandAdmin,
        { kind: 'BRAND', brandId: BRAND_A },
        {
          items: [
            { slotId: 'slot-1', rentalPackageId: 'pkg-1', storagePlanId: 'plan-1' },
            { slotId: 'slot-1', rentalPackageId: 'pkg-1', storagePlanId: 'plan-1' },
          ],
        },
      ),
    ).rejects.toThrow();
  });

  it('test_FR_SLT_27_assign_product_to_slot', async () => {
    const rPaid = rental('r-paid', { paidAt: new Date(), status: 'DRAFT' });
    queries.rentals = [rPaid];
    queries.products = [
      { id: 'p-1', brandId: BRAND_A, status: 'ACTIVE' },
      { id: 'p-other', brandId: BRAND_B, status: 'ACTIVE' },
      { id: 'p-discontinued', brandId: BRAND_A, status: 'DISCONTINUED' },
    ];

    // Gán thành công
    const updated = await service.assignProduct(
      brandAdmin,
      { kind: 'BRAND', brandId: BRAND_A },
      'r-paid',
      'p-1',
    );
    expect(updated.fragranceProductId).toBe('p-1');

    // Sản phẩm của thương hiệu khác -> PRODUCT_NOT_OWNED (403)
    await expect(
      service.assignProduct(brandAdmin, { kind: 'BRAND', brandId: BRAND_A }, 'r-paid', 'p-other'),
    ).rejects.toMatchObject({ code: 'PRODUCT_NOT_OWNED' });

    // Hóa đơn chưa thanh toán -> RENTAL_NOT_ACTIVE (409)
    const rUnpaid = rental('r-unpaid', { paidAt: null, status: 'DRAFT' });
    queries.rentals.push(rUnpaid);
    await expect(
      service.assignProduct(brandAdmin, { kind: 'BRAND', brandId: BRAND_A }, 'r-unpaid', 'p-1'),
    ).rejects.toMatchObject({ code: 'RENTAL_NOT_ACTIVE' });
  });

  it('test_FR_SLT_08_free_pricing', async () => {
    const rPaid = rental('r-paid', { paidAt: new Date(), status: 'DRAFT' });
    queries.rentals = [rPaid];

    // Đặt giá tự do > 0 -> Thành công
    const updated = await service.setPricePerSpray(
      brandAdmin,
      { kind: 'BRAND', brandId: BRAND_A },
      'r-paid',
      '25000',
    );
    expect(updated.pricePerSpray).toBe('25000.0000');

    // Giá <= 0 -> VALIDATION_ERROR (400)
    await expect(
      service.setPricePerSpray(brandAdmin, { kind: 'BRAND', brandId: BRAND_A }, 'r-paid', '0'),
    ).rejects.toThrow();
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
  async listPlans(isActive?: boolean) {
    return this.plans.filter((p) => isActive === undefined || p.is_active === isActive);
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

describe('newInvoiceNumber — sinh số hóa đơn thuê slot (FR-SLT-38)', () => {
  it('sinh mã đúng định dạng HD-YYYYMMDD-XXXXXX', async () => {
    const { newInvoiceNumber, INVOICE_NUMBER_PATTERN } =
      await import('../../apps/api/src/modules/slt/invoice-number.js');
    const date = new Date('2026-10-04T10:30:00Z');
    const invoiceNum = newInvoiceNumber(date, 'Asia/Ho_Chi_Minh');
    expect(invoiceNum).toMatch(INVOICE_NUMBER_PATTERN);
    expect(invoiceNum.startsWith('HD-20261004-')).toBe(true);
  });

  it('dùng nguồn ngẫu nhiên được truyền vào', async () => {
    const { newInvoiceNumber } = await import('../../apps/api/src/modules/slt/invoice-number.js');
    const date = new Date('2026-10-04T10:30:00Z');
    // ALPHABET[0] là '2'
    const invoiceNum = newInvoiceNumber(date, 'Asia/Ho_Chi_Minh', () => 0);
    expect(invoiceNum).toBe('HD-20261004-222222');
  });
});
