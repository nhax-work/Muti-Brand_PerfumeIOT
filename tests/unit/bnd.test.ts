/**
 * Unit test cho module BND — Thương hiệu và cô lập dữ liệu (FR-BND-01..07).
 * BndService được khởi tạo trực tiếp với phụ thuộc giả (QT2, ADR-0003).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { AuditEntry } from '../../apps/api/src/shared/audit/index.js';
import type { AuthenticatedUser } from '../../apps/api/src/modules/auth/principal.loader.js';
import { BndService, type CreateBrandInput } from '../../apps/api/src/modules/bnd/bnd.service.js';
import type {
  BrandFilter,
  BrandRecord,
  BrandStatus,
  CreateBrandData,
  UpdateBrandData,
} from '../../apps/api/src/modules/bnd/bnd.queries.js';

class FakeBndQueries {
  brands = new Map<string, BrandRecord>();
  private seq = 0;

  async list(filter: BrandFilter) {
    let items = [...this.brands.values()];
    if (filter.status) {
      items = items.filter((b) => b.status === filter.status);
    }
    const total = items.length;
    const offset = (filter.page - 1) * filter.pageSize;
    items = items.slice(offset, offset + filter.pageSize);
    return { items, total };
  }

  async findById(id: string) {
    return this.brands.get(id);
  }

  async findByCode(code: string) {
    return [...this.brands.values()].find((b) => b.code === code);
  }

  async codeExists(code: string) {
    return [...this.brands.values()].some((b) => b.code.toLowerCase() === code.toLowerCase());
  }

  async create(input: CreateBrandData) {
    const id = `brand-${++this.seq}`;
    this.brands.set(id, {
      id,
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      contactInfo: input.contactInfo ?? null,
      kioskContent: null,
      logoUrl: null,
      status: 'ACTIVE',
      createdAt: new Date('2026-09-20T10:00:00Z'),
      updatedAt: new Date('2026-09-20T10:00:00Z'),
    });
    return id;
  }

  async update(id: string, input: UpdateBrandData) {
    const b = this.brands.get(id);
    if (!b) return;
    this.brands.set(id, {
      ...b,
      name: input.name ?? b.name,
      description: input.description !== undefined ? input.description : b.description,
      logoUrl: input.logoUrl !== undefined ? input.logoUrl : b.logoUrl,
      contactInfo: input.contactInfo !== undefined ? input.contactInfo : b.contactInfo,
      updatedAt: new Date('2026-09-20T11:00:00Z'),
    });
  }

  async setStatus(id: string, status: BrandStatus) {
    const b = this.brands.get(id);
    if (!b) return;
    this.brands.set(id, {
      ...b,
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
  permissions: new Set(['brand.manage']),
  permissionVersion: 1,
  scope: { type: 'PLATFORM' },
  email: 'admin@scentstation.local',
  fullName: 'Admin',
  sessionId: 'session-1',
  mustChangePassword: false,
};

const brandAdmin: AuthenticatedUser = {
  userId: 'brand-admin-1',
  brandId: 'brand-1',
  roles: ['BRAND_ADMIN'],
  permissions: new Set(['product.manage', 'rental.request', 'refill.request', 'report.brand']),
  permissionVersion: 1,
  scope: { type: 'BRAND', brandId: 'brand-1' },
  email: 'admin@maison-aurore.local',
  fullName: 'Brand Admin',
  sessionId: 'session-2',
  mustChangePassword: false,
};

let queries: FakeBndQueries;
let audit: FakeAudit;
let service: BndService;

beforeEach(() => {
  queries = new FakeBndQueries();
  audit = new FakeAudit();
  service = new BndService(queries, audit);
});

describe('BndService — FR-BND-01: Tạo thương hiệu', () => {
  it('test_FR_BND_01_create_brand_success', async () => {
    const input: CreateBrandInput = {
      code: 'CHANEL',
      name: 'Chanel Paris',
      description: 'Thương hiệu nước hoa cao cấp',
      contactInfo: { phone: '0123456789' },
    };

    const brand = await service.create(admin, input);

    expect(brand.id).toBe('brand-1');
    expect(brand.code).toBe('CHANEL');
    expect(brand.name).toBe('Chanel Paris');
    expect(brand.status).toBe('ACTIVE');

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]?.action).toBe('bnd.brand.created');
    expect(audit.entries[0]?.targetId).toBe('brand-1');
  });

  it('test_FR_BND_01_duplicate_code_rejected', async () => {
    await service.create(admin, { code: 'DIOR', name: 'Dior 1' });

    await expect(service.create(admin, { code: 'dior', name: 'Dior 2' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});

describe('BndService — FR-BND-02: Cập nhật thông tin thương hiệu', () => {
  it('test_FR_BND_02_update_brand_success', async () => {
    const created = await service.create(admin, { code: 'GUCCI', name: 'Gucci' });

    const updated = await service.update(admin, created.id, {
      name: 'Gucci Beauty',
      description: 'Mô tả mới',
      logoUrl: 'https://example.com/logo.png',
    });

    expect(updated.name).toBe('Gucci Beauty');
    expect(updated.description).toBe('Mô tả mới');
    expect(updated.logoUrl).toBe('https://example.com/logo.png');

    const updateAudit = audit.entries.find((e) => e.action === 'bnd.brand.updated');
    expect(updateAudit).toBeDefined();
  });

  it('test_FR_BND_02_update_nonexistent_brand', async () => {
    await expect(
      service.update(admin, 'nonexistent-id', { name: 'New Name' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('BndService — FR-BND-03: Đổi trạng thái thương hiệu', () => {
  it('test_FR_BND_03_set_status_success', async () => {
    const created = await service.create(admin, { code: 'YSL', name: 'Yves Saint Laurent' });

    const suspended = await service.setStatus(admin, created.id, 'SUSPENDED');
    expect(suspended.status).toBe('SUSPENDED');

    const statusAudit = audit.entries.find((e) => e.action === 'bnd.brand.status_changed');
    expect(statusAudit).toBeDefined();
    expect(statusAudit?.severity).toBe('WARNING');
  });

  it('test_FR_BND_03_set_status_idempotent', async () => {
    const created = await service.create(admin, { code: 'HERMES', name: 'Hermes' });

    const auditCountBefore = audit.entries.length;
    const same = await service.setStatus(admin, created.id, 'ACTIVE');
    expect(same.status).toBe('ACTIVE');
    expect(audit.entries.length).toBe(auditCountBefore);
  });
});

describe('BndService — FR-BND-06: Brand Admin xem và sửa thương hiệu của mình', () => {
  it('test_FR_BND_06_brand_admin_get_my_brand', async () => {
    const created = await service.create(admin, { code: 'MAISON', name: 'Maison Aurore' });
    const userWithBrand: AuthenticatedUser = {
      ...brandAdmin,
      brandId: created.id,
    };

    const myBrand = await service.getMyBrand(userWithBrand);
    expect(myBrand.id).toBe(created.id);
    expect(myBrand.name).toBe('Maison Aurore');
  });

  it('test_FR_BND_06_platform_user_cannot_get_my_brand', async () => {
    await expect(service.getMyBrand(admin)).rejects.toMatchObject({
      code: 'FORBIDDEN_SCOPE',
    });
  });

  it('test_FR_BND_06_brand_admin_update_my_brand', async () => {
    const created = await service.create(admin, { code: 'MAISON2', name: 'Maison' });
    const userWithBrand: AuthenticatedUser = {
      ...brandAdmin,
      brandId: created.id,
    };

    const updated = await service.updateMyBrand(userWithBrand, {
      name: 'Maison Updated',
      logoUrl: 'https://cdn.example.com/logo.jpg',
    });

    expect(updated.name).toBe('Maison Updated');
    expect(updated.logoUrl).toBe('https://cdn.example.com/logo.jpg');
    expect(updated.code).toBe('MAISON2'); // code không đổi
  });
});

describe('BndService — FR-BND-07: Platform Super Admin xem danh sách & chi tiết', () => {
  it('test_FR_BND_07_list_and_get', async () => {
    await service.create(admin, { code: 'B1', name: 'Brand 1' });
    const b2 = await service.create(admin, { code: 'B2', name: 'Brand 2' });
    await service.setStatus(admin, b2.id, 'SUSPENDED');

    const listAll = await service.list({ page: 1, pageSize: 10 });
    expect(listAll.total).toBe(2);

    const listActive = await service.list({ status: 'ACTIVE', page: 1, pageSize: 10 });
    expect(listActive.total).toBe(1);

    const detail = await service.get(admin, b2.id);
    expect(detail.id).toBe(b2.id);
    expect(detail.status).toBe('SUSPENDED');
  });
});
