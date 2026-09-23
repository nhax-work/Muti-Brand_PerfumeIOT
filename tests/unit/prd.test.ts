/**
 * Unit test cho module PRD — Danh mục sản phẩm (FR-PRD-01..05, FR-BND-08).
 * PrdService được khởi tạo trực tiếp với phụ thuộc giả (QT2, ADR-0003).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { AuditEntry } from '../../apps/api/src/shared/audit/index.js';
import type { AuthenticatedUser } from '../../apps/api/src/modules/auth/principal.loader.js';
import type { BrandScope } from '../../apps/api/src/shared/scoping/index.js';
import { PrdService, type CreateProductInput } from '../../apps/api/src/modules/prd/prd.service.js';
import type {
  CreateProductData,
  ProductFilter,
  ProductRecord,
  ProductStatus,
  UpdateProductData,
} from '../../apps/api/src/modules/prd/prd.queries.js';

const BRAND_A = '11111111-1111-4111-8111-000000000001';
const BRAND_B = '22222222-2222-4222-8222-000000000002';

class FakePrdQueries {
  products = new Map<string, ProductRecord>();
  private seq = 0;

  async list(scope: BrandScope, filter: ProductFilter) {
    let items = [...this.products.values()];
    if (scope.kind === 'BRAND') {
      items = items.filter((p) => p.brandId === scope.brandId);
    }
    if (filter.status) {
      items = items.filter((p) => p.status === filter.status);
    }
    const total = items.length;
    const offset = (filter.page - 1) * filter.pageSize;
    items = items.slice(offset, offset + filter.pageSize);
    return { items, total };
  }

  async findById(scope: BrandScope, id: string) {
    const p = this.products.get(id);
    if (!p) return undefined;
    if (scope.kind === 'BRAND' && p.brandId !== scope.brandId) {
      return undefined;
    }
    return p;
  }

  async skuExists(brandId: string, sku: string) {
    return [...this.products.values()].some(
      (p) => p.brandId === brandId && p.sku.toLowerCase() === sku.toLowerCase(),
    );
  }

  async create(input: CreateProductData) {
    const id = `product-${++this.seq}`;
    this.products.set(id, {
      id,
      brandId: input.brandId,
      sku: input.sku,
      name: input.name,
      description: input.description ?? null,
      fragranceNotes: input.fragranceNotes ?? null,
      imageUrl: input.imageUrl ?? null,
      defaultPrice: input.defaultPrice,
      currency: input.currency ?? 'VND',
      fullBottleRetailPrice: input.fullBottleRetailPrice ?? null,
      fullBottleVolumeMl: input.fullBottleVolumeMl ?? null,
      status: 'ACTIVE',
      createdAt: new Date('2026-09-20T10:00:00Z'),
      updatedAt: new Date('2026-09-20T10:00:00Z'),
    });
    return id;
  }

  async update(id: string, input: UpdateProductData) {
    const p = this.products.get(id);
    if (!p) return;
    this.products.set(id, {
      ...p,
      name: input.name ?? p.name,
      description: input.description !== undefined ? input.description : p.description,
      fragranceNotes: input.fragranceNotes !== undefined ? input.fragranceNotes : p.fragranceNotes,
      imageUrl: input.imageUrl !== undefined ? input.imageUrl : p.imageUrl,
      defaultPrice: input.defaultPrice ?? p.defaultPrice,
      currency: input.currency ?? p.currency,
      fullBottleRetailPrice:
        input.fullBottleRetailPrice !== undefined
          ? input.fullBottleRetailPrice
          : p.fullBottleRetailPrice,
      fullBottleVolumeMl:
        input.fullBottleVolumeMl !== undefined ? input.fullBottleVolumeMl : p.fullBottleVolumeMl,
      updatedAt: new Date('2026-09-20T11:00:00Z'),
    });
  }

  async setStatus(id: string, status: ProductStatus) {
    const p = this.products.get(id);
    if (!p) return;
    this.products.set(id, {
      ...p,
      status,
      updatedAt: new Date('2026-09-20T11:00:00Z'),
    });
  }
}

class FakeAudit {
  entries: AuditEntry[] = [];
  async log(entry: AuditEntry) {
    this.entries.push(entry);
  }
}

const admin: AuthenticatedUser = {
  userId: 'admin-1',
  brandId: null,
  roles: ['PLATFORM_SUPER_ADMIN'],
  permissions: new Set(['product.manage']),
  permissionVersion: 1,
  scope: { type: 'PLATFORM' },
  email: 'admin@scentstation.local',
  fullName: 'Admin',
  sessionId: 'session-1',
  mustChangePassword: false,
};

const brandAdminA: AuthenticatedUser = {
  userId: 'brand-admin-a',
  brandId: BRAND_A,
  roles: ['BRAND_ADMIN'],
  permissions: new Set(['product.manage']),
  permissionVersion: 1,
  scope: { type: 'BRAND', brandId: BRAND_A },
  email: 'admin@brand-a.local',
  fullName: 'Brand Admin A',
  sessionId: 'session-2',
  mustChangePassword: false,
};

const brandAdminB: AuthenticatedUser = {
  userId: 'brand-admin-b',
  brandId: BRAND_B,
  roles: ['BRAND_ADMIN'],
  permissions: new Set(['product.manage']),
  permissionVersion: 1,
  scope: { type: 'BRAND', brandId: BRAND_B },
  email: 'admin@brand-b.local',
  fullName: 'Brand Admin B',
  sessionId: 'session-3',
  mustChangePassword: false,
};

const scopeA: BrandScope = { kind: 'BRAND', brandId: BRAND_A };
const scopeB: BrandScope = { kind: 'BRAND', brandId: BRAND_B };
const scopeUnrestricted: BrandScope = { kind: 'UNRESTRICTED' };

let queries: FakePrdQueries;
let audit: FakeAudit;
let service: PrdService;

beforeEach(() => {
  queries = new FakePrdQueries();
  audit = new FakeAudit();
  service = new PrdService(queries, audit);
});

describe('PrdService — FR-PRD-01, FR-PRD-03: Tạo sản phẩm & gán thương hiệu', () => {
  it('test_FR_PRD_01_create_product_success', async () => {
    const input: CreateProductInput = {
      sku: 'NO5-EDP-50',
      name: 'Chanel No 5',
      description: 'Hương thơm quyến rũ vượt thời gian',
      fragranceNotes: {
        top: ['Aldehydes', 'Ylang-Ylang'],
        heart: ['Rose', 'Jasmine'],
        base: ['Vanilla', 'Sandalwood'],
      },
      imageUrl: 'https://example.com/no5.png',
      defaultPrice: '35000.0000',
      currency: 'VND',
      fullBottleRetailPrice: '3500000.0000',
      fullBottleVolumeMl: 50,
    };

    const product = await service.create(brandAdminA, input);

    expect(product.id).toBe('product-1');
    expect(product.brandId).toBe(BRAND_A);
    expect(product.sku).toBe('NO5-EDP-50');
    expect(product.status).toBe('ACTIVE');
    expect(product.defaultPrice).toBe('35000.0000');

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]?.action).toBe('prd.product.created');
    expect(audit.entries[0]?.brandId).toBe(BRAND_A);
  });

  it('test_FR_PRD_01_duplicate_sku_in_same_brand_rejected', async () => {
    await service.create(brandAdminA, {
      sku: 'SKU-001',
      name: 'Product 1',
      defaultPrice: '30000.0000',
    });

    await expect(
      service.create(brandAdminA, {
        sku: 'sku-001',
        name: 'Product 1 Duplicate',
        defaultPrice: '30000.0000',
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('test_FR_PRD_01_same_sku_different_brands_allowed', async () => {
    const pA = await service.create(brandAdminA, {
      sku: 'ROSE-01',
      name: 'Rose Brand A',
      defaultPrice: '30000.0000',
    });

    const pB = await service.create(brandAdminB, {
      sku: 'ROSE-01',
      name: 'Rose Brand B',
      defaultPrice: '40000.0000',
    });

    expect(pA.brandId).toBe(BRAND_A);
    expect(pB.brandId).toBe(BRAND_B);
  });

  it('test_FR_PRD_01_user_without_brand_cannot_create', async () => {
    await expect(
      service.create(admin, {
        sku: 'SKU-ADMIN',
        name: 'Admin Product',
        defaultPrice: '30000.0000',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN_SCOPE',
    });
  });
});

describe('PrdService — FR-PRD-02: Cập nhật & ngừng kinh doanh', () => {
  it('test_FR_PRD_02_update_product_success', async () => {
    const created = await service.create(brandAdminA, {
      sku: 'BLEU-EDP',
      name: 'Bleu de Chanel',
      defaultPrice: '40000.0000',
    });

    const updated = await service.update(brandAdminA, scopeA, created.id, {
      name: 'Bleu de Chanel Parfum',
      defaultPrice: '45000.0000',
    });

    expect(updated.name).toBe('Bleu de Chanel Parfum');
    expect(updated.defaultPrice).toBe('45000.0000');

    const updateAudit = audit.entries.find((e) => e.action === 'prd.product.updated');
    expect(updateAudit).toBeDefined();
  });

  it('test_FR_PRD_02_discontinue_product', async () => {
    const created = await service.create(brandAdminA, {
      sku: 'GAB-EDP',
      name: 'Gabrielle',
      defaultPrice: '50000.0000',
    });

    const discontinued = await service.discontinue(brandAdminA, scopeA, created.id);
    expect(discontinued.status).toBe('DISCONTINUED');

    const discAudit = audit.entries.find((e) => e.action === 'prd.product.discontinued');
    expect(discAudit).toBeDefined();
    expect(discAudit?.severity).toBe('WARNING');
  });
});

describe('PrdService — FR-PRD-03, FR-BND-08: Cô lập dữ liệu giữa các thương hiệu', () => {
  it('test_FR_PRD_03_co_tenant_isolation_get', async () => {
    const productA = await service.create(brandAdminA, {
      sku: 'PROD-A',
      name: 'Exclusive A',
      defaultPrice: '30000.0000',
    });

    // Brand A đọc được
    const foundA = await service.get(brandAdminA, scopeA, productA.id);
    expect(foundA.id).toBe(productA.id);

    // Brand B đọc sản phẩm của Brand A -> ném NOT_FOUND (hoặc FORBIDDEN_SCOPE) không tiết lộ thông tin (FR-BND-08)
    await expect(service.get(brandAdminB, scopeB, productA.id)).rejects.toMatchObject({
      code: 'FORBIDDEN_SCOPE',
    });

    // Super Admin đọc được sản phẩm của Brand A
    const foundAdmin = await service.get(admin, scopeUnrestricted, productA.id);
    expect(foundAdmin.id).toBe(productA.id);
  });

  it('test_FR_PRD_03_co_tenant_isolation_update', async () => {
    const productA = await service.create(brandAdminA, {
      sku: 'PROD-A2',
      name: 'Exclusive A2',
      defaultPrice: '30000.0000',
    });

    // Brand B cố tình cập nhật sản phẩm của Brand A -> bị chặn
    await expect(
      service.update(brandAdminB, scopeB, productA.id, { name: 'Hacked Name' }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN_SCOPE',
    });
  });

  it('test_FR_PRD_03_co_tenant_isolation_list', async () => {
    await service.create(brandAdminA, {
      sku: 'A1',
      name: 'Product A1',
      defaultPrice: '10000.0000',
    });
    await service.create(brandAdminA, {
      sku: 'A2',
      name: 'Product A2',
      defaultPrice: '20000.0000',
    });
    await service.create(brandAdminB, {
      sku: 'B1',
      name: 'Product B1',
      defaultPrice: '30000.0000',
    });

    const listA = await service.list(scopeA, { page: 1, pageSize: 10 });
    expect(listA.total).toBe(2);
    expect(listA.items.every((p) => p.brandId === BRAND_A)).toBe(true);

    const listB = await service.list(scopeB, { page: 1, pageSize: 10 });
    expect(listB.total).toBe(1);
    expect(listB.items[0]?.brandId).toBe(BRAND_B);

    const listAdmin = await service.list(scopeUnrestricted, { page: 1, pageSize: 10 });
    expect(listAdmin.total).toBe(3);
  });
});
