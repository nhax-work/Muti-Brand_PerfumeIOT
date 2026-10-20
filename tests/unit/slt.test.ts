/**
 * Unit test cho module SLT — đọc hóa đơn thuê slot và bảng giá (ADR-0006).
 * Service khởi tạo trực tiếp với phụ thuộc giả (QT2, ADR-0003).
 *
 * Bản trước kiểm `create`/`activate` — hai đường đã bỏ cùng `POST /slot-rentals` và
 * `POST /slot-rentals/:id/activate` (FR-SLT-01 bãi bỏ, ADR-0006). Ràng buộc "một hóa đơn hiệu lực mỗi
 * slot" (FR-SLT-02) do CSDL cưỡng chế và được chứng minh ở tests/integration/test_slot_constraint.
 */

import { createHash } from 'node:crypto';
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
import { SltJobs } from '../../apps/api/src/modules/slt/slt.jobs.js';
import type { Clock } from '../../apps/api/src/shared/clock.js';
import type { Database } from '../../apps/api/src/shared/db/index.js';
import type { PaymentService } from '../../apps/api/src/modules/ord/index.js';
import type {
  AgreementAcceptanceRecord,
  AgreementVersionRecord,
  RentalCheckoutRecord,
} from '../../apps/api/src/modules/slt/slt.queries.js';

const BRAND_A = '11111111-1111-4111-8111-000000000001';
const BRAND_B = '11111111-1111-4111-8111-000000000002';
const HASH_V1 = 'a'.repeat(64);

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
    swappedFromSlotId: null,
    swappedAt: null,
    ...overrides,
  };
}

class FakeSltQueries {
  rentals: SlotRentalRecord[] = [];
  products: Array<{ id: string; brandId: string; status: string }> = [];
  lastFilter: SlotRentalFilter | null = null;
  currentAgreement: AgreementVersionRecord | null = {
    id: 'ag-1',
    version: 'v1.0',
    title: 'Hợp đồng khung',
    content: 'Nội dung',
    contentHash: HASH_V1,
    isCurrent: true,
    publishedAt: new Date('2026-10-01T00:00:00Z'),
    createdAt: new Date('2026-10-01T00:00:00Z'),
  };
  acceptances: AgreementAcceptanceRecord[] = [BRAND_A, BRAND_B].map((brandId, i) => ({
    id: `acc-${i + 1}`,
    brandId,
    acceptedBy: `user-${i + 1}`,
    kind: 'FRAMEWORK' as const,
    agreementVersionId: 'ag-1',
    rentalCheckoutId: null,
    contentHash: HASH_V1,
    acceptedAt: new Date('2026-10-02T00:00:00Z'),
  }));

  unverifiedEmail = false;

  async hasUnverifiedEmailRecord(_userId: string) {
    return this.unverifiedEmail;
  }

  async findCurrentAgreementVersion() {
    return this.currentAgreement;
  }

  async findFrameworkAcceptance(brandId: string, agreementVersionId: string) {
    return (
      this.acceptances.find(
        (a) => a.brandId === brandId && a.agreementVersionId === agreementVersionId,
      ) ?? null
    );
  }

  async insertFrameworkAcceptance(params: {
    brandId: string;
    agreementVersionId: string;
    acceptedBy: string;
    contentHash: string;
    ipAddress: string;
    userAgent: string | null;
  }) {
    const existing = await this.findFrameworkAcceptance(params.brandId, params.agreementVersionId);
    if (existing) return { acceptance: existing, created: false };
    const acceptance: AgreementAcceptanceRecord = {
      id: `acc-${this.acceptances.length + 1}`,
      brandId: params.brandId,
      acceptedBy: params.acceptedBy,
      kind: 'FRAMEWORK',
      agreementVersionId: params.agreementVersionId,
      rentalCheckoutId: null,
      contentHash: params.contentHash,
      acceptedAt: new Date('2026-10-03T00:00:00Z'),
    };
    this.acceptances.push(acceptance);
    return { acceptance, created: true };
  }

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

  checkouts: Map<string, RentalCheckoutRecord> = new Map();
  annexAcceptances: Map<string, AgreementAcceptanceRecord> = new Map();
  activeBottlesOnSlots: Set<string> = new Set();
  occupiedSlots: Set<string> = new Set();
  slotMachines: Map<string, string> = new Map([
    ['slot-1', 'machine-1'],
    ['slot-2', 'machine-1'],
    ['slot-diff-mch', 'machine-2'],
  ]);
  slotPrices: Map<string, string> = new Map([
    ['slot-1', '1000000.0000'],
    ['slot-2', '1000000.0000'],
    ['slot-diff-price', '2000000.0000'],
  ]);

  async findCheckoutRecordById(id: string) {
    if (this.checkouts.has(id)) return this.checkouts.get(id)!;
    const items = this.rentals.filter((r) => r.checkoutId === id);
    if (items.length === 0) return null;
    const first = items[0]!;
    return {
      id,
      brandId: first.brandId,
      currency: 'VND',
      totalAmount: '3300000.0000',
      holdExpiresAt: first.holdExpiresAt ?? new Date(),
      paidAt: first.paidAt,
      cancelledAt: first.cancelledAt,
      createdBy: 'user-1',
      createdAt: first.createdAt,
      agreementVersionId: 'ag-1',
    };
  }

  async findInvoiceDetailsByCheckoutId(checkoutId: string) {
    const items = this.rentals.filter((r) => r.checkoutId === checkoutId);
    return items.map((r, i) => ({
      rentalId: r.id,
      checkoutId: r.checkoutId,
      invoiceNumber: r.invoiceNumber,
      status: r.status,
      brandId: r.brandId,
      slotId: r.slotId,
      slotNumber: i + 1,
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
      swappedFromSlotId: r.swappedFromSlotId,
      swappedAt: r.swappedAt,
    }));
  }

  async findAnnexAcceptance(checkoutId: string) {
    return this.annexAcceptances.get(checkoutId) ?? null;
  }

  async insertAnnexAcceptance(params: {
    brandId: string;
    agreementVersionId: string;
    rentalCheckoutId: string;
    acceptedBy: string;
    contentHash: string;
    ipAddress: string;
    userAgent: string | null;
  }) {
    const existing = this.annexAcceptances.get(params.rentalCheckoutId);
    if (existing) return { acceptance: existing, created: false };
    const acceptance: AgreementAcceptanceRecord = {
      id: `annex-acc-${this.annexAcceptances.size + 1}`,
      brandId: params.brandId,
      acceptedBy: params.acceptedBy,
      kind: 'ANNEX',
      agreementVersionId: params.agreementVersionId,
      rentalCheckoutId: params.rentalCheckoutId,
      contentHash: params.contentHash,
      acceptedAt: new Date(),
    };
    this.annexAcceptances.set(params.rentalCheckoutId, acceptance);
    return { acceptance, created: true };
  }

  async lockCheckoutById(id: string) {
    return this.findCheckoutRecordById(id);
  }

  async swapSlotTx(params: {
    rentalId: string;
    brandId: string;
    targetSlotId: string;
    now: Date;
    swapWindowHours: number;
  }) {
    const rental = this.rentals.find((r) => r.id === params.rentalId);
    if (!rental || rental.brandId !== params.brandId) return { notFound: true as const };

    if (params.targetSlotId === 'slot-nonexistent') return { notFound: true as const };
    if (params.targetSlotId === rental.slotId)
      return { notAllowed: 'slt.slotSwapNotAllowed' as const };

    const targetMachine = this.slotMachines.get(params.targetSlotId) ?? 'machine-1';
    if (targetMachine !== rental.machineId)
      return { notAllowed: 'slt.slotSwapDifferentMachine' as const };

    const targetPrice = this.slotPrices.get(params.targetSlotId) ?? '1000000.0000';
    if (Number(targetPrice) !== Number(rental.monthlyRentPrice))
      return { notAllowed: 'slt.slotSwapDifferentPrice' as const };

    if (rental.swappedFromSlotId !== null)
      return { notAllowed: 'slt.slotSwapAlreadySwapped' as const };
    if (rental.status !== 'DRAFT') return { notAllowed: 'slt.slotSwapNotDraft' as const };
    if (!rental.paidAt) return { notAllowed: 'slt.slotSwapUnpaid' as const };

    const windowMs = params.swapWindowHours * 3600 * 1000;
    if (params.now.getTime() - new Date(rental.paidAt).getTime() > windowMs) {
      return { notAllowed: 'slt.slotSwapTimeExpired' as const };
    }

    if (this.activeBottlesOnSlots.has(rental.slotId)) {
      return { notAllowed: 'slt.slotSwapBottleInstalled' as const };
    }

    if (this.occupiedSlots.has(params.targetSlotId)) {
      return { occupied: true as const };
    }

    const updated: SlotRentalRecord = {
      ...rental,
      slotId: params.targetSlotId,
      swappedFromSlotId: rental.slotId,
      swappedAt: params.now,
    };
    const index = this.rentals.findIndex((r) => r.id === rental.id);
    this.rentals[index] = updated;

    return { success: true as const, updated };
  }

  async createCheckoutTx(params: {
    brandId: string;
    createdBy: string;
    holdExpiresAt: Date;
    totalAmount: string;
    agreementVersionId?: string;
    maxHeldSlots?: number;
    items: CheckoutCreateItemData[];
  }) {
    if (params.maxHeldSlots !== undefined) {
      const currentHeld = this.rentals.filter(
        (r) =>
          r.brandId === params.brandId &&
          r.status === 'DRAFT' &&
          r.paidAt === null &&
          r.cancelledAt === null &&
          r.holdExpiresAt &&
          r.holdExpiresAt.getTime() > Date.now(),
      ).length;
      if (currentHeld + params.items.length > params.maxHeldSlots) {
        return { holdLimitReached: true as const };
      }
    }

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

    const checkout: RentalCheckoutRecord = {
      id: checkoutId,
      brandId: params.brandId,
      currency: 'VND',
      totalAmount: params.totalAmount,
      holdExpiresAt: params.holdExpiresAt,
      paidAt: null,
      cancelledAt: null,
      createdBy: params.createdBy,
      createdAt: new Date(),
      agreementVersionId: params.agreementVersionId ?? null,
    };
    this.checkouts.set(checkoutId, checkout);

    return {
      checkout,
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
  let audits: Array<Record<string, unknown>>;

  beforeEach(() => {
    queries = new FakeSltQueries();
    catalogQueries = new FakeCatalogQueries();
    catalogQueries.packages = [pkg('pkg-1', true)];
    catalogQueries.plans = [plan('plan-1', true)];
    audits = [];

    const audit = {
      record: async (entry: Record<string, unknown>) => {
        audits.push(entry);
      },
      log: async (entry: Record<string, unknown>) => {
        audits.push(entry);
      },
    };

    const mchQueries = {
      findSlotById: async (id: string) => {
        if (id === 'slot-closed')
          return { id, machineId: 'machine-1', monthlyRentPrice: null, currentRentalId: null };
        if (id === 'slot-occupied')
          return {
            id,
            machineId: 'machine-1',
            monthlyRentPrice: '1000000.0000',
            currentRentalId: 'r-occ',
          };
        if (id === 'slot-diff-mch')
          return {
            id,
            machineId: 'machine-diff',
            monthlyRentPrice: '1000000.0000',
            currentRentalId: null,
          };
        if (id === 'slot-diff-price')
          return {
            id,
            machineId: 'machine-1',
            monthlyRentPrice: '2000000.0000',
            currentRentalId: null,
          };
        return {
          id,
          machineId: 'machine-1',
          monthlyRentPrice: '1000000.0000',
          currentRentalId: null,
        };
      },
    } as unknown as MchQueries;

    const fakeDb = {
      transaction: () => ({
        execute: async (fn: (tx: any) => Promise<any>) => fn({}),
      }),
    };
    const fakeClock = { now: () => new Date('2026-10-15T10:00:00Z') };
    const paymentService = {
      findPendingIntent: async () => null,
      createPending: async (params: any) => ({
        paymentId: 'pay-1',
        amount: params.amount,
        currency: params.currency,
        status: 'PENDING',
        checkoutUrl: 'https://pay.test/1',
        qrPayload: 'qr-test',
      }),
    };
    const fakeConfig = {
      constraint: (name: string) => {
        if (name === 'RENTAL_MAX_STOCKING_DAYS') return 30;
        if (name === 'RENTAL_CHECKOUT_HOLD_MIN') return 15;
        if (name === 'BRAND_MAX_HELD_SLOTS') return 5;
        if (name === 'SLOT_SWAP_WINDOW_HOURS') return 48;
        return 0;
      },
    };

    service = new SltService(
      queries as unknown as SltQueries,
      catalogQueries as unknown as CatalogQueries,
      mchQueries,
      audit as never,
      paymentService as never,
      fakeClock as never,
      fakeDb as never,
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

  it('test_FR_SLT_48_get_current_agreement', async () => {
    const current = await service.getCurrentAgreement({ kind: 'BRAND', brandId: BRAND_A });
    expect(current.agreement).toMatchObject({
      version: 'v1.0',
      title: 'Hợp đồng khung',
      content: 'Nội dung',
      contentHash: HASH_V1,
      isCurrent: true,
    });
    expect(current.acceptance).toMatchObject({ brandId: BRAND_A, kind: 'FRAMEWORK' });

    // Tài khoản mức nền tảng luôn nhận acceptance = null
    const platform = await service.getCurrentAgreement({ kind: 'UNRESTRICTED' });
    expect(platform.acceptance).toBeNull();
  });

  it('test_FR_SLT_49_accept_agreement_idempotent', async () => {
    queries.acceptances = [];
    const origin = { ip: '127.0.0.1', userAgent: 'vitest' };
    const scope: BrandScope = { kind: 'BRAND', brandId: BRAND_A };
    const input = { version: 'v1.0', contentHash: HASH_V1 };

    const first = await service.acceptAgreement(brandAdmin, scope, input, origin);
    expect(first.created).toBe(true);
    expect(first.body).toMatchObject({ brandId: BRAND_A, agreementVersionId: 'ag-1' });
    expect(queries.acceptances).toHaveLength(1);

    // Đồng ý lại: trả bản ghi cũ (HTTP 200), không sinh bản ghi trùng
    const again = await service.acceptAgreement(brandAdmin, scope, input, origin);
    expect(again.created).toBe(false);
    expect(again.body.id).toBe(first.body.id);
    expect(queries.acceptances).toHaveLength(1);
  });

  it('test_FR_SLT_49_accept_rejects_non_current_version_or_changed_content', async () => {
    queries.acceptances = [];
    const origin = { ip: '127.0.0.1', userAgent: 'vitest' };
    const scope: BrandScope = { kind: 'BRAND', brandId: BRAND_A };

    await expect(
      service.acceptAgreement(brandAdmin, scope, { version: 'v0.9', contentHash: HASH_V1 }, origin),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      service.acceptAgreement(
        brandAdmin,
        scope,
        { version: 'v1.0', contentHash: 'b'.repeat(64) },
        origin,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(queries.acceptances).toHaveLength(0);
  });

  it('test_FR_SLT_49_checkout_rejected_when_email_not_verified', async () => {
    queries.unverifiedEmail = true;
    await expect(
      service.createCheckout(
        brandAdmin,
        { kind: 'BRAND', brandId: BRAND_A },
        {
          items: [{ slotId: 'slot-1', rentalPackageId: 'pkg-1', storagePlanId: 'plan-1' }],
        },
      ),
    ).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    queries.unverifiedEmail = false;
  });

  it('test_FR_SLT_49_checkout_rejected_when_agreement_not_accepted', async () => {
    queries.acceptances = [];
    await expect(
      service.createCheckout(
        brandAdmin,
        { kind: 'BRAND', brandId: BRAND_A },
        {
          items: [{ slotId: 'slot-1', rentalPackageId: 'pkg-1', storagePlanId: 'plan-1' }],
        },
      ),
    ).rejects.toMatchObject({ code: 'AGREEMENT_NOT_ACCEPTED' });
  });

  it('test_FR_SLT_49_checkout_rejected_when_no_active_agreement', async () => {
    const prev = queries.currentAgreement;
    queries.currentAgreement = null;
    await expect(
      service.createCheckout(
        brandAdmin,
        { kind: 'BRAND', brandId: BRAND_A },
        {
          items: [{ slotId: 'slot-1', rentalPackageId: 'pkg-1', storagePlanId: 'plan-1' }],
        },
      ),
    ).rejects.toMatchObject({ code: 'AGREEMENT_NOT_ACCEPTED' });
    queries.currentAgreement = prev;
  });

  // -------------------------------------------------------------------------------------
  // Task 5 tests: FR-SLT-56 (Hold limit), FR-SLT-50 (Annex), FR-SLT-55 (Swap slot)
  // -------------------------------------------------------------------------------------

  describe('FR-SLT-56: Giới hạn tổng số slot được giữ chỗ cùng thời điểm (BRAND_MAX_HELD_SLOTS = 5)', () => {
    it('test_FR_SLT_56_brand_max_held_slots_limit — từ chối khi vượt 5 slot giữ chỗ', async () => {
      // Giả lập thương hiệu đã có 4 slot chưa thanh toán đang giữ chỗ
      const futureHold = new Date(Date.now() + 15 * 60 * 1000);
      for (let i = 0; i < 4; i++) {
        queries.rentals.push(
          rental(`r-held-${i}`, {
            brandId: BRAND_A,
            status: 'DRAFT',
            paidAt: null,
            cancelledAt: null,
            holdExpiresAt: futureHold,
          }),
        );
      }

      // Tạo thêm 2 slot -> tổng 6 > 5 -> bị từ chối 409 HOLD_LIMIT_REACHED
      await expect(
        service.createCheckout(
          brandAdmin,
          { kind: 'BRAND', brandId: BRAND_A },
          {
            items: [
              { slotId: 'slot-1', rentalPackageId: 'pkg-1', storagePlanId: 'plan-1' },
              { slotId: 'slot-2', rentalPackageId: 'pkg-1', storagePlanId: 'plan-1' },
            ],
          },
        ),
      ).rejects.toMatchObject({
        code: 'HOLD_LIMIT_REACHED',
      });

      // Tạo thêm 1 slot -> tổng 5 <= 5 -> thành công
      const checkout = await service.createCheckout(
        brandAdmin,
        { kind: 'BRAND', brandId: BRAND_A },
        {
          items: [{ slotId: 'slot-1', rentalPackageId: 'pkg-1', storagePlanId: 'plan-1' }],
        },
      );
      expect(checkout.id).toBeTruthy();
    });
  });

  describe('FR-SLT-50: Phụ lục điều khoản cho từng phiên thanh toán', () => {
    it('test_FR_SLT_50_generate_checkout_annex — sinh phụ lục xác định và kiểm tra hash', async () => {
      // Tạo một checkout
      const checkout = await service.createCheckout(
        brandAdmin,
        { kind: 'BRAND', brandId: BRAND_A },
        {
          items: [{ slotId: 'slot-1', rentalPackageId: 'pkg-1', storagePlanId: 'plan-1' }],
        },
      );

      // Lấy phụ lục
      const annex = await service.getCheckoutAnnex(
        brandAdmin,
        { kind: 'BRAND', brandId: BRAND_A },
        checkout.id,
      );
      expect(annex.checkoutId).toBe(checkout.id);
      expect(annex.agreementVersionId).toBe('ag-1');
      expect(annex.content).toContain('PHỤ LỤC HỢP ĐỒNG THUÊ SLOT KIOSK NƯỚC HOA');
      expect(annex.content).toContain('Mã phiên thanh toán: ' + checkout.id);
      expect(annex.acceptance).toBeNull();

      // Hash xác định
      const expectedHash = createHash('sha256').update(annex.content, 'utf8').digest('hex');
      expect(annex.contentHash).toBe(expectedHash);

      // Lấy lại phụ lục cho cùng hash (AC1: xác định)
      const annex2 = await service.getCheckoutAnnex(
        brandAdmin,
        { kind: 'BRAND', brandId: BRAND_A },
        checkout.id,
      );
      expect(annex2.contentHash).toBe(annex.contentHash);

      // Thương hiệu khác gọi -> 403 FORBIDDEN_SCOPE
      await expect(
        service.getCheckoutAnnex(brandAdmin, { kind: 'BRAND', brandId: BRAND_B }, checkout.id),
      ).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
    });

    it('test_FR_SLT_50_accept_checkout_annex — đồng ý phụ lục hợp lệ và idempotent', async () => {
      const checkout = await service.createCheckout(
        brandAdmin,
        { kind: 'BRAND', brandId: BRAND_A },
        {
          items: [{ slotId: 'slot-1', rentalPackageId: 'pkg-1', storagePlanId: 'plan-1' }],
        },
      );

      const annex = await service.getCheckoutAnnex(
        brandAdmin,
        { kind: 'BRAND', brandId: BRAND_A },
        checkout.id,
      );

      // Hash sai -> 400 VALIDATION_ERROR
      await expect(
        service.acceptCheckoutAnnex(
          brandAdmin,
          { kind: 'BRAND', brandId: BRAND_A },
          checkout.id,
          { contentHash: 'wronghash'.padEnd(64, '0') },
          { ip: '127.0.0.1', userAgent: 'test' },
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

      // Đồng ý thành công -> 201 (created = true)
      const res1 = await service.acceptCheckoutAnnex(
        brandAdmin,
        { kind: 'BRAND', brandId: BRAND_A },
        checkout.id,
        { contentHash: annex.contentHash },
        { ip: '127.0.0.1', userAgent: 'test' },
      );
      expect(res1.created).toBe(true);
      expect(res1.body.kind).toBe('ANNEX');
      expect(res1.body.rentalCheckoutId).toBe(checkout.id);

      // Gọi lại -> 200 (created = false, trả lại bản ghi cũ)
      const res2 = await service.acceptCheckoutAnnex(
        brandAdmin,
        { kind: 'BRAND', brandId: BRAND_A },
        checkout.id,
        { contentHash: annex.contentHash },
        { ip: '127.0.0.1', userAgent: 'test' },
      );
      expect(res2.created).toBe(false);
      expect(res2.body.id).toBe(res1.body.id);

      // getCheckoutAnnex giờ trả kèm acceptance
      const annexAfter = await service.getCheckoutAnnex(
        brandAdmin,
        { kind: 'BRAND', brandId: BRAND_A },
        checkout.id,
      );
      expect(annexAfter.acceptance).not.toBeNull();
      expect(annexAfter.acceptance!.id).toBe(res1.body.id);
    });

    it('test_FR_SLT_50_payment_requires_annex_acceptance — chặn thanh toán khi chưa đồng ý phụ lục', async () => {
      const checkout = await service.createCheckout(
        brandAdmin,
        { kind: 'BRAND', brandId: BRAND_A },
        {
          items: [{ slotId: 'slot-1', rentalPackageId: 'pkg-1', storagePlanId: 'plan-1' }],
        },
      );

      // Chưa đồng ý phụ lục -> 403 AGREEMENT_NOT_ACCEPTED (AC2)
      await expect(
        service.payCheckout(brandAdmin, { kind: 'BRAND', brandId: BRAND_A }, checkout.id),
      ).rejects.toMatchObject({ code: 'AGREEMENT_NOT_ACCEPTED' });

      // Đồng ý phụ lục
      const annex = await service.getCheckoutAnnex(
        brandAdmin,
        { kind: 'BRAND', brandId: BRAND_A },
        checkout.id,
      );
      await service.acceptCheckoutAnnex(
        brandAdmin,
        { kind: 'BRAND', brandId: BRAND_A },
        checkout.id,
        { contentHash: annex.contentHash },
        { ip: '127.0.0.1', userAgent: 'test' },
      );

      // Thanh toán thành công -> trả payment intent
      const payment = await service.payCheckout(
        brandAdmin,
        { kind: 'BRAND', brandId: BRAND_A },
        checkout.id,
      );
      expect(payment.paymentId).toBe('pay-1');
      expect(payment.status).toBe('PENDING');
    });
  });

  describe('FR-SLT-55: Đổi slot trong cùng máy sau khi mua gói', () => {
    it('test_FR_SLT_55_swap_slot_success — đổi slot hợp lệ trong 48 giờ', async () => {
      const paidAt = new Date('2026-10-15T08:00:00Z'); // 2 giờ trước (< 48h)
      const r = rental('r-swap-1', {
        slotId: 'slot-1',
        machineId: 'machine-1',
        monthlyRentPrice: '1000000.0000',
        status: 'DRAFT',
        paidAt,
      });
      queries.rentals.push(r);

      const swapped = await service.swapSlot(
        brandAdmin,
        { kind: 'BRAND', brandId: BRAND_A },
        r.id,
        'slot-2',
      );
      expect(swapped.id).toBe(r.id);
      expect(swapped.slotId).toBe('slot-2');
      expect(swapped.swappedFromSlotId).toBe('slot-1');
      expect(swapped.swappedAt).toBeTruthy();
    });

    it('test_FR_SLT_55_swap_slot_rejected_after_window — từ chối khi quá 48 giờ', async () => {
      const paidAt = new Date('2026-10-10T08:00:00Z'); // 5 ngày trước (> 48h so với 2026-10-15)
      const r = rental('r-swap-old', {
        slotId: 'slot-1',
        machineId: 'machine-1',
        monthlyRentPrice: '1000000.0000',
        status: 'DRAFT',
        paidAt,
      });
      queries.rentals.push(r);

      await expect(
        service.swapSlot(brandAdmin, { kind: 'BRAND', brandId: BRAND_A }, r.id, 'slot-2'),
      ).rejects.toMatchObject({ code: 'SLOT_SWAP_NOT_ALLOWED' });
    });

    it('test_FR_SLT_55_swap_slot_rejected_if_already_swapped — từ chối khi đã đổi 1 lần', async () => {
      const paidAt = new Date('2026-10-15T08:00:00Z');
      const r = rental('r-swapped-once', {
        slotId: 'slot-2',
        machineId: 'machine-1',
        monthlyRentPrice: '1000000.0000',
        status: 'DRAFT',
        paidAt,
        swappedFromSlotId: 'slot-1',
        swappedAt: new Date('2026-10-15T09:00:00Z'),
      });
      queries.rentals.push(r);

      await expect(
        service.swapSlot(brandAdmin, { kind: 'BRAND', brandId: BRAND_A }, r.id, 'slot-1'),
      ).rejects.toMatchObject({ code: 'SLOT_SWAP_NOT_ALLOWED' });
    });

    it('test_FR_SLT_55_swap_slot_rejected_if_diff_price_or_machine — từ chối khác máy hoặc khác giá', async () => {
      const paidAt = new Date('2026-10-15T08:00:00Z');
      const r = rental('r-swap-diff', {
        slotId: 'slot-1',
        machineId: 'machine-1',
        monthlyRentPrice: '1000000.0000',
        status: 'DRAFT',
        paidAt,
      });
      queries.rentals.push(r);

      // Khác máy
      await expect(
        service.swapSlot(brandAdmin, { kind: 'BRAND', brandId: BRAND_A }, r.id, 'slot-diff-mch'),
      ).rejects.toMatchObject({ code: 'SLOT_SWAP_NOT_ALLOWED' });

      // Khác giá niêm yết
      await expect(
        service.swapSlot(brandAdmin, { kind: 'BRAND', brandId: BRAND_A }, r.id, 'slot-diff-price'),
      ).rejects.toMatchObject({ code: 'SLOT_SWAP_NOT_ALLOWED' });
    });

    it('test_FR_SLT_55_swap_slot_rejected_if_slot_occupied — từ chối khi slot đích đã bị giữ', async () => {
      const paidAt = new Date('2026-10-15T08:00:00Z');
      const r = rental('r-swap-occ', {
        slotId: 'slot-1',
        machineId: 'machine-1',
        monthlyRentPrice: '1000000.0000',
        status: 'DRAFT',
        paidAt,
      });
      queries.rentals.push(r);
      queries.occupiedSlots.add('slot-2');

      await expect(
        service.swapSlot(brandAdmin, { kind: 'BRAND', brandId: BRAND_A }, r.id, 'slot-2'),
      ).rejects.toMatchObject({ code: 'SLOT_OCCUPIED' });
    });
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

// -------------------------------------------------------------------------------------
// Job hủy phiên hết giờ giữ chỗ (FR-SLT-39)
// -------------------------------------------------------------------------------------

function checkoutRecord(
  id: string,
  holdExpiresAt: Date,
  overrides: Partial<RentalCheckoutRecord> = {},
): RentalCheckoutRecord {
  return {
    id,
    brandId: BRAND_A,
    currency: 'VND',
    totalAmount: '3300000.0000',
    holdExpiresAt,
    paidAt: null,
    cancelledAt: null,
    createdBy: 'user-1',
    createdAt: new Date('2026-10-01T00:00:00Z'),
    agreementVersionId: null,
    ...overrides,
  };
}

class FakeSltJobsQueries {
  checkouts = new Map<string, RentalCheckoutRecord>();
  rentals = new Map<string, SlotRentalRecord[]>();
  callLog: string[] = [];
  lastFindNow: Date | null = null;
  lastFindLimit: number | null = null;
  failLockOnId?: string;

  async findExpiredCheckoutIds(now: Date, limit = 100): Promise<string[]> {
    this.lastFindNow = now;
    this.lastFindLimit = limit;
    this.callLog.push(`queries.findExpiredCheckoutIds(limit=${limit})`);

    const result: string[] = [];
    for (const [id, c] of this.checkouts.entries()) {
      if (
        c.paidAt === null &&
        c.cancelledAt === null &&
        c.holdExpiresAt.getTime() <= now.getTime()
      ) {
        result.push(id);
        if (result.length >= limit) break;
      }
    }
    return result;
  }

  async lockCheckoutById(id: string, _tx: unknown): Promise<RentalCheckoutRecord | null> {
    this.callLog.push(`queries.lockCheckoutById(${id})`);
    if (this.failLockOnId === id) {
      throw new Error(`DB Lock Timeout for checkout ${id}`);
    }
    const c = this.checkouts.get(id);
    return c ? { ...c } : null;
  }

  async cancelCheckoutAndRentals(
    checkoutId: string,
    cancelledAt: Date,
    _tx: unknown,
  ): Promise<void> {
    this.callLog.push(`queries.cancelCheckoutAndRentals(${checkoutId})`);
    const c = this.checkouts.get(checkoutId);
    if (c) {
      this.checkouts.set(checkoutId, { ...c, cancelledAt });
    }
    const rList = this.rentals.get(checkoutId);
    if (rList) {
      this.rentals.set(
        checkoutId,
        rList.map((r) => ({ ...r, status: 'CANCELLED', cancelledAt })),
      );
    }
  }
}

class FakePaymentServiceForJobs {
  callLog: string[] = [];
  expiredCheckoutIds: string[] = [];

  async expirePending(target: { rentalCheckoutId: string }, _tx: unknown): Promise<void> {
    this.callLog.push(`payments.expirePending(${target.rentalCheckoutId})`);
    this.expiredCheckoutIds.push(target.rentalCheckoutId);
  }
}

class FakeAuditServiceForJobs {
  entries: AuditEntry[] = [];
  callLog: string[] = [];

  async log(entry: AuditEntry, _tx?: unknown): Promise<void> {
    this.callLog.push(`audit.log(${entry.action}, ${entry.targetId})`);
    this.entries.push(entry);
  }
}

class FakeDbForJobs {
  transaction() {
    return {
      execute: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
        return fn({});
      },
    };
  }
}

describe('SltJobs — job hủy phiên hết giờ giữ chỗ (FR-SLT-39)', () => {
  let queries: FakeSltJobsQueries;
  let payments: FakePaymentServiceForJobs;
  let audit: FakeAuditServiceForJobs;
  let db: FakeDbForJobs;
  let now: Date;
  let clock: Clock;
  let jobs: SltJobs;

  beforeEach(() => {
    queries = new FakeSltJobsQueries();
    payments = new FakePaymentServiceForJobs();
    audit = new FakeAuditServiceForJobs();
    db = new FakeDbForJobs();
    now = new Date('2026-10-11T10:00:00.000Z');
    clock = { now: () => now };

    jobs = new SltJobs(
      queries as unknown as SltQueries,
      payments as unknown as PaymentService,
      audit as unknown as AuditService,
      clock,
      db as unknown as Database,
    );
  });

  it('test_FR_SLT_39_cancel_unpaid_invoice_after_hold — hủy phiên, hóa đơn, expire pending payment và ghi audit log', async () => {
    // AC1: Given phiên C chưa thanh toán gồm hóa đơn H1, H2 ở DRAFT, now() > C.hold_expires_at
    const checkoutId = 'co-1';
    const holdExpiresAt = new Date('2026-10-11T09:45:00.000Z'); // quá hạn 15 phút
    queries.checkouts.set(checkoutId, checkoutRecord(checkoutId, holdExpiresAt));

    const r1 = rental('r-1', { checkoutId, status: 'DRAFT', cancelledAt: null });
    const r2 = rental('r-2', { checkoutId, status: 'DRAFT', cancelledAt: null });
    queries.rentals.set(checkoutId, [r1, r2]);

    const count = await jobs.cancelExpiredCheckouts();

    // 1. Số phiên hủy thành công
    expect(count).toBe(1);

    // 2. Checkout chuyển cancelled_at = now
    const updatedCheckout = queries.checkouts.get(checkoutId)!;
    expect(updatedCheckout.cancelledAt).toEqual(now);

    // 3. Mọi hóa đơn của phiên chuyển status = 'CANCELLED' và cancelled_at = now
    const rentals = queries.rentals.get(checkoutId)!;
    expect(rentals[0]!.status).toBe('CANCELLED');
    expect(rentals[0]!.cancelledAt).toEqual(now);
    expect(rentals[1]!.status).toBe('CANCELLED');
    expect(rentals[1]!.cancelledAt).toEqual(now);

    // 4. Payment PENDING của phiên chuyển EXPIRED
    expect(payments.expiredCheckoutIds).toContain(checkoutId);

    // 5. Thứ tự khóa đúng tránh deadlock với webhook (payment trước, checkout sau, rồi đến update & audit)
    expect(queries.callLog).toEqual([
      'queries.findExpiredCheckoutIds(limit=100)',
      'queries.lockCheckoutById(co-1)',
      'queries.cancelCheckoutAndRentals(co-1)',
    ]);
    expect(payments.callLog).toEqual(['payments.expirePending(co-1)']);

    // 6. Ghi AuditLog đầy đủ
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      actorType: 'SYSTEM',
      action: 'slt.rental_checkout.cancelled_due_to_expiry',
      targetType: 'RentalCheckout',
      targetId: checkoutId,
      after: {
        id: checkoutId,
        cancelledAt: now.toISOString(),
      },
    });
  });

  it('test_FR_SLT_39_catch_up_after_downtime — bù sau downtime quét theo hold_expires_at <= now', async () => {
    // AC3: Given hệ thống ngừng hoạt động qua mốc hold_expires_at của nhiều phiên
    // Các phiên hết hạn ở các mốc khác nhau trong quá khứ (lúc downtime)
    const co1 = 'co-downtime-1';
    const co2 = 'co-downtime-2';
    const co3 = 'co-downtime-3';
    const coFuture = 'co-future';

    queries.checkouts.set(
      co1,
      checkoutRecord(co1, new Date('2026-10-11T06:00:00.000Z')), // 4 tiếng trước
    );
    queries.checkouts.set(
      co2,
      checkoutRecord(co2, new Date('2026-10-11T08:30:00.000Z')), // 1.5 tiếng trước
    );
    queries.checkouts.set(
      co3,
      checkoutRecord(co3, new Date('2026-10-11T09:59:00.000Z')), // 1 phút trước
    );
    queries.checkouts.set(
      coFuture,
      checkoutRecord(coFuture, new Date('2026-10-11T10:15:00.000Z')), // còn 15 phút mới hết hạn
    );

    queries.rentals.set(co1, [rental('r-d1', { checkoutId: co1, status: 'DRAFT' })]);
    queries.rentals.set(co2, [rental('r-d2', { checkoutId: co2, status: 'DRAFT' })]);
    queries.rentals.set(co3, [rental('r-d3', { checkoutId: co3, status: 'DRAFT' })]);
    queries.rentals.set(coFuture, [rental('r-fut', { checkoutId: coFuture, status: 'DRAFT' })]);

    // When job chạy lần đầu sau khi hệ thống khởi động lại lúc 10:00
    const count = await jobs.cancelExpiredCheckouts();

    // Then cả 3 phiên quá hạn trong lúc downtime đều được hủy bù đầy đủ
    expect(count).toBe(3);
    expect(queries.checkouts.get(co1)!.cancelledAt).toEqual(now);
    expect(queries.checkouts.get(co2)!.cancelledAt).toEqual(now);
    expect(queries.checkouts.get(co3)!.cancelledAt).toEqual(now);

    // Phiên tương lai chưa hết hạn không bị hủy
    expect(queries.checkouts.get(coFuture)!.cancelledAt).toBeNull();
    expect(queries.rentals.get(coFuture)![0]!.status).toBe('DRAFT');
  });

  it('test_FR_SLT_39_paid_checkout_is_not_cancelled — không hủy phiên đã thanh toán', async () => {
    // AC4: Given phiên đã thanh toán, When job chạy sau hold_expires_at, Then không bị hủy
    const coPaid = 'co-paid';
    queries.checkouts.set(
      coPaid,
      checkoutRecord(coPaid, new Date('2026-10-11T09:00:00.000Z'), {
        paidAt: new Date('2026-10-11T09:10:00.000Z'),
      }),
    );
    queries.rentals.set(coPaid, [
      rental('r-paid', { checkoutId: coPaid, status: 'DRAFT', paidAt: new Date() }),
    ]);

    const count = await jobs.cancelExpiredCheckouts();
    expect(count).toBe(0);
    expect(queries.checkouts.get(coPaid)!.cancelledAt).toBeNull();

    // Race condition: quét ra ID nhưng webhook vừa ghi nhận paidAt khi job lock FOR UPDATE
    const coRace = 'co-race';
    const recRace = checkoutRecord(coRace, new Date('2026-10-11T09:00:00.000Z'));
    queries.checkouts.set(coRace, recRace);
    queries.rentals.set(coRace, [rental('r-race', { checkoutId: coRace, status: 'DRAFT' })]);

    // Giả lập webhook hoàn tất thanh toán đúng lúc lockCheckoutById
    const originalLock = queries.lockCheckoutById.bind(queries);
    queries.lockCheckoutById = async (id, tx) => {
      const res = await originalLock(id, tx);
      if (res && id === coRace) {
        return { ...res, paidAt: new Date('2026-10-11T10:00:00.000Z') }; // Webhook vừa thắng race condition
      }
      return res;
    };

    const raceCount = await jobs.cancelExpiredCheckouts();
    expect(raceCount).toBe(0);
    expect(queries.checkouts.get(coRace)!.cancelledAt).toBeNull();
    expect(audit.entries).toHaveLength(0);
  });

  it('test_FR_SLT_39_already_cancelled_or_missing_checkout_is_safely_skipped — idempotent và an toàn', async () => {
    // Phiên đã bị hủy trước đó
    const coCancelled = 'co-cancelled';
    queries.checkouts.set(
      coCancelled,
      checkoutRecord(coCancelled, new Date('2026-10-11T09:00:00.000Z'), {
        cancelledAt: new Date('2026-10-11T09:30:00.000Z'),
      }),
    );

    let count = await jobs.cancelExpiredCheckouts();
    expect(count).toBe(0);

    // Phiên không tồn tại (lock trả về null)
    queries.findExpiredCheckoutIds = async () => ['co-nonexistent'];
    count = await jobs.cancelExpiredCheckouts();
    expect(count).toBe(0);
    expect(audit.entries).toHaveLength(0);
  });

  it('test_FR_SLT_39_no_expired_checkouts_returns_zero_without_transaction — mảng rỗng dừng ngay', async () => {
    const count = await jobs.cancelExpiredCheckouts();
    expect(count).toBe(0);
    expect(queries.callLog).toEqual(['queries.findExpiredCheckoutIds(limit=100)']);
    expect(payments.callLog).toHaveLength(0);
  });

  it('test_FR_SLT_39_resilient_batch_continues_on_individual_failure — lỗi đơn lẻ không dừng cả batch', async () => {
    const co1 = 'co-err-1';
    const co2 = 'co-err-2';
    const co3 = 'co-err-3';

    queries.checkouts.set(co1, checkoutRecord(co1, new Date('2026-10-11T09:00:00.000Z')));
    queries.checkouts.set(co2, checkoutRecord(co2, new Date('2026-10-11T09:00:00.000Z')));
    queries.checkouts.set(co3, checkoutRecord(co3, new Date('2026-10-11T09:00:00.000Z')));

    queries.rentals.set(co1, [rental('r-1', { checkoutId: co1 })]);
    queries.rentals.set(co2, [rental('r-2', { checkoutId: co2 })]);
    queries.rentals.set(co3, [rental('r-3', { checkoutId: co3 })]);

    // Giả lập co2 ném lỗi DB Lock Timeout
    queries.failLockOnId = co2;

    const count = await jobs.cancelExpiredCheckouts();

    // co1 và co3 vẫn thành công, co2 bị bỏ qua
    expect(count).toBe(2);
    expect(queries.checkouts.get(co1)!.cancelledAt).toEqual(now);
    expect(queries.checkouts.get(co2)!.cancelledAt).toBeNull();
    expect(queries.checkouts.get(co3)!.cancelledAt).toEqual(now);
  });

  it('test_FR_SLT_39_custom_batch_size_is_propagated_to_queries — tuân thủ batchSize', async () => {
    for (let i = 1; i <= 5; i++) {
      const id = `co-batch-${i}`;
      queries.checkouts.set(id, checkoutRecord(id, new Date('2026-10-11T09:00:00.000Z')));
      queries.rentals.set(id, [rental(`r-${i}`, { checkoutId: id })]);
    }

    const count = await jobs.cancelExpiredCheckouts(3);
    expect(queries.lastFindLimit).toBe(3);
    expect(count).toBe(3);
  });
});
