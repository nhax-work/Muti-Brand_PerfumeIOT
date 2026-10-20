import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuditEntry } from '../../apps/api/src/shared/audit/index.js';
import { AccessGuard } from '../../apps/api/src/modules/auth/access.guard.js';
import {
  REQUIRED_PERMISSIONS,
  REQUIRES_REAUTH,
} from '../../apps/api/src/modules/auth/decorators.js';
import type {
  AuthenticatedUser,
  PrincipalLoader,
} from '../../apps/api/src/modules/auth/principal.loader.js';
import { TokenService } from '../../apps/api/src/modules/auth/tokens.js';
import { BndController } from '../../apps/api/src/modules/bnd/bnd.http.js';
import {
  BndService,
  type CreateBrandInput,
  type UpdateBrandLegalProfileInput,
} from '../../apps/api/src/modules/bnd/bnd.service.js';
import type {
  BrandFilter,
  BrandRecord,
  BrandStatus,
  CreateBrandData,
  UpdateBrandData,
  UpdateLegalProfileData,
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
      taxCode: null,
      businessLicenseNumber: null,
      payoutAccountCiphertext: null,
      payoutAccountKeyVersion: null,
      legalVerifiedAt: null,
      legalVerifiedBy: null,
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

  async updateLegalProfile(id: string, input: UpdateLegalProfileData) {
    const b = this.brands.get(id);
    if (!b) return;
    this.brands.set(id, {
      ...b,
      taxCode: input.taxCode,
      businessLicenseNumber: input.businessLicenseNumber ?? b.businessLicenseNumber,
      payoutAccountCiphertext: input.payoutAccountCiphertext,
      payoutAccountKeyVersion: input.payoutAccountKeyVersion,
      legalVerifiedAt: null,
      legalVerifiedBy: null,
      updatedAt: new Date('2026-09-20T11:00:00Z'),
    });
  }

  async verifyLegal(id: string, adminId: string, verifiedAt: Date) {
    const b = this.brands.get(id);
    if (!b) return;
    this.brands.set(id, {
      ...b,
      legalVerifiedAt: verifiedAt,
      legalVerifiedBy: adminId,
      updatedAt: verifiedAt,
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
const fakeKey = Buffer.alloc(32, 7);
const fakeClock = { now: () => new Date('2026-10-19T10:00:00Z') };

const tokens = new TokenService('bnd-test-secret', 3600, 300);

function guardForUser(loaded: AuthenticatedUser): AccessGuard {
  const loader = { load: async () => loaded } as unknown as PrincipalLoader;
  return new AccessGuard(new Reflector(), tokens, loader);
}

function executionContextFor(
  handler: (...args: any[]) => any,
  controller: object,
  headers: Record<string, string> = {},
): ExecutionContext {
  const request = { headers };
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function bearer(userId: string): Record<string, string> {
  return {
    authorization: `Bearer ${tokens.signAccess({ sub: userId, sid: 'session-1', pv: 1 })}`,
  };
}

beforeEach(() => {
  queries = new FakeBndQueries();
  audit = new FakeAudit();
  service = new BndService(queries, audit, { refundAccountEncKey: fakeKey }, fakeClock);
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

describe('BndService — FR-BND-09: Brand Admin khai hồ sơ pháp nhân & tài khoản nhận doanh thu', () => {
  it('test_FR_BND_09_declare_legal_profile_success', async () => {
    const created = await service.create(admin, { code: 'LEGAL1', name: 'Legal Brand' });
    const userWithBrand: AuthenticatedUser = {
      ...brandAdmin,
      brandId: created.id,
    };

    const input: UpdateBrandLegalProfileInput = {
      taxCode: '0123456789',
      businessLicenseNumber: 'GP-987654',
      payoutAccount: {
        bankCode: 'VCB',
        accountNumber: '9876543210',
        accountHolder: 'CONG TY TNHH HUONG THOM',
      },
    };

    const updated = await service.updateMyBrandLegalProfile(userWithBrand, input);

    expect(updated.taxCode).toBe('0123456789');
    expect(updated.businessLicenseNumber).toBe('GP-987654');
    expect(updated.legalVerifiedAt).toBeNull();
    expect(updated.payoutAccountMasked).toEqual({
      bankCode: 'VCB',
      maskedAccountNumber: '****3210',
      accountHolder: 'CONG TY TNHH HUONG THOM',
    });

    const record = await queries.findById(created.id);
    expect(record?.payoutAccountCiphertext).not.toBeNull();
    expect(record?.payoutAccountKeyVersion).toBe(1);
  });

  it('test_FR_BND_09_updating_profile_resets_verification_status', async () => {
    const created = await service.create(admin, { code: 'LEGAL2', name: 'Legal Brand 2' });
    const userWithBrand: AuthenticatedUser = {
      ...brandAdmin,
      brandId: created.id,
    };

    // Khai lần 1 và verify
    await service.updateMyBrandLegalProfile(userWithBrand, {
      taxCode: '0123456789',
    });
    const verified = await service.verifyBrandLegal(admin, created.id);
    expect(verified.legalVerifiedAt).not.toBeNull();

    // Sửa hồ sơ -> trạng thái xác minh phải bị xóa
    const updated = await service.updateMyBrandLegalProfile(userWithBrand, {
      taxCode: '9876543210',
      businessLicenseNumber: 'GP-NEW',
    });
    expect(updated.legalVerifiedAt).toBeNull();
    const resetRecord = await queries.findById(created.id);
    expect(resetRecord?.legalVerifiedBy).toBeNull();
  });

  it('test_FR_BND_09_forbidden_for_non_brand_admin', async () => {
    await expect(
      service.updateMyBrandLegalProfile(admin, {
        taxCode: '0123456789',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN_SCOPE',
    });
  });

  it('test_FR_BND_09_raw_account_never_leaked_in_audit_or_dto', async () => {
    const created = await service.create(admin, { code: 'LEGAL3', name: 'Legal Brand 3' });
    const userWithBrand: AuthenticatedUser = {
      ...brandAdmin,
      brandId: created.id,
    };

    const rawAccount = '123456789999';
    const updated = await service.updateMyBrandLegalProfile(userWithBrand, {
      taxCode: '0123456789',
      payoutAccount: {
        bankCode: 'MB',
        accountNumber: rawAccount,
        accountHolder: 'CONG TY TEST',
      },
    });

    // DTO chỉ có masked, không có raw account
    expect(JSON.stringify(updated)).not.toContain(rawAccount);
    expect(updated.payoutAccountMasked?.maskedAccountNumber).toBe('****9999');

    // Audit log không chứa raw account
    const auditStr = JSON.stringify(audit.entries);
    expect(auditStr).not.toContain(rawAccount);
  });
});

describe('BndService — FR-BND-10: Super Admin xác minh pháp nhân thương hiệu', () => {
  it('test_FR_BND_10_super_admin_verify_legal_success', async () => {
    const created = await service.create(admin, { code: 'VERIFY1', name: 'Verify Brand' });
    const userWithBrand: AuthenticatedUser = {
      ...brandAdmin,
      brandId: created.id,
    };

    await service.updateMyBrandLegalProfile(userWithBrand, {
      taxCode: '0123456789',
      businessLicenseNumber: 'GP-111',
    });

    const verified = await service.verifyBrandLegal(admin, created.id);
    expect(verified.legalVerifiedAt).toBe('2026-10-19T10:00:00.000Z');
    const record = await queries.findById(created.id);
    expect(record?.legalVerifiedBy).toBe(admin.userId);

    const auditEntry = audit.entries.find((e) => e.action === 'bnd.legal.verified');
    expect(auditEntry).toBeDefined();
    expect(auditEntry?.targetId).toBe(created.id);
    expect(auditEntry?.actorId).toBe(admin.userId);
  });

  it('test_FR_BND_10_verify_fails_without_tax_code', async () => {
    const created = await service.create(admin, { code: 'VERIFY2', name: 'Verify Brand No Tax' });

    await expect(service.verifyBrandLegal(admin, created.id)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('test_FR_BND_10_verify_idempotent', async () => {
    const created = await service.create(admin, {
      code: 'VERIFY3',
      name: 'Verify Brand Idempotent',
    });
    const userWithBrand: AuthenticatedUser = {
      ...brandAdmin,
      brandId: created.id,
    };

    await service.updateMyBrandLegalProfile(userWithBrand, {
      taxCode: '0123456789',
    });

    const first = await service.verifyBrandLegal(admin, created.id);
    const auditCount = audit.entries.length;

    const second = await service.verifyBrandLegal(admin, created.id);
    expect(second.legalVerifiedAt).toBe(first.legalVerifiedAt);
    expect(audit.entries.length).toBe(auditCount); // Không tạo thêm audit log
  });
});

describe('BndController & AccessGuard — Bảo vệ pháp nhân và phân quyền (FR-BND-09, FR-BND-10)', () => {
  it('test_FR_BND_10_endpoint_has_brand_manage_and_reauth_metadata', () => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS, BndController.prototype.verifyBrandLegal),
    ).toEqual(['brand.manage']);
    expect(Reflect.getMetadata(REQUIRES_REAUTH, BndController.prototype.verifyBrandLegal)).toBe(
      true,
    );
  });

  it('test_FR_BND_10_non_super_admin_cannot_verify_legal (FR-BND-10 AC3: 403 FORBIDDEN_SCOPE)', async () => {
    const target = executionContextFor(
      BndController.prototype.verifyBrandLegal,
      BndController,
      bearer(brandAdmin.userId),
    );
    await expect(guardForUser(brandAdmin).canActivate(target)).rejects.toMatchObject({
      code: 'FORBIDDEN_SCOPE',
    });
  });

  it('test_FR_BND_10_missing_reauth_token_returns_reauth_required', async () => {
    const target = executionContextFor(
      BndController.prototype.verifyBrandLegal,
      BndController,
      bearer(admin.userId),
    );
    await expect(guardForUser(admin).canActivate(target)).rejects.toMatchObject({
      code: 'REAUTH_REQUIRED',
    });
  });

  it('test_FR_BND_10_super_admin_with_valid_reauth_token_passes_guard', async () => {
    const headers = {
      ...bearer(admin.userId),
      'x-reauth-token': tokens.signReauth(admin.userId),
    };
    const target = executionContextFor(
      BndController.prototype.verifyBrandLegal,
      BndController,
      headers,
    );
    await expect(guardForUser(admin).canActivate(target)).resolves.toBe(true);
  });

  it('test_FR_BND_09_controller_validation_rejects_invalid_tax_code_and_missing_payout_field', () => {
    const controller = new BndController(service);

    // Mã số thuế dưới 10 ký tự -> VALIDATION_ERROR
    expect(() =>
      controller.updateMyBrandLegalProfile(brandAdmin, { taxCode: '12345' }),
    ).toThrowError();

    // Mã số thuế trên 20 ký tự -> VALIDATION_ERROR
    expect(() =>
      controller.updateMyBrandLegalProfile(brandAdmin, {
        taxCode: '123456789012345678901',
      }),
    ).toThrowError();

    // payoutAccount thiếu accountNumber hoặc accountHolder -> VALIDATION_ERROR
    expect(() =>
      controller.updateMyBrandLegalProfile(brandAdmin, {
        taxCode: '0123456789',
        payoutAccount: { bankCode: 'VCB' } as unknown,
      }),
    ).toThrowError();
  });

  it('test_FR_BND_09_brand_admin_only_updates_own_brand_and_non_brand_rejected', async () => {
    const b1 = await service.create(admin, { code: 'BRAND_A', name: 'Brand A' });
    const b2 = await service.create(admin, { code: 'BRAND_B', name: 'Brand B' });

    const adminOfB1: AuthenticatedUser = {
      ...brandAdmin,
      brandId: b1.id,
      scope: { type: 'BRAND', brandId: b1.id },
    };

    // Brand Admin B1 cập nhật hồ sơ của mình
    await service.updateMyBrandLegalProfile(adminOfB1, {
      taxCode: '0123456789',
      businessLicenseNumber: 'GP-B1',
    });

    const b1Record = await queries.findById(b1.id);
    const b2Record = await queries.findById(b2.id);

    expect(b1Record?.taxCode).toBe('0123456789');
    expect(b2Record?.taxCode).toBeNull(); // Brand B không bị ảnh hưởng

    // Role không phải Brand Admin (e.g. Platform Super Admin không có brandId) không thể gọi updateMyBrandLegalProfile
    await expect(
      service.updateMyBrandLegalProfile(admin, { taxCode: '9999999999' }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN_SCOPE',
    });
  });

  it('test_FR_BND_09_corrupted_ciphertext_does_not_crash_list_or_get', async () => {
    const id = 'brand-corrupt';
    queries.brands.set(id, {
      id,
      code: 'CORRUPT',
      name: 'Corrupt Brand',
      description: null,
      contactInfo: null,
      kioskContent: null,
      logoUrl: null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      taxCode: '0123456789',
      businessLicenseNumber: null,
      payoutAccountCiphertext: Buffer.from('invalid-garbage-ciphertext'),
      payoutAccountKeyVersion: 1,
      legalVerifiedAt: null,
      legalVerifiedBy: null,
    });

    // get() không bị 500, fallback an toàn payoutAccountMasked = null
    const single = await service.get(admin, id);
    expect(single.id).toBe(id);
    expect(single.payoutAccountMasked).toBeNull();

    // list() không bị 500 cho toàn bộ danh sách
    const list = await service.list({ page: 1, pageSize: 10 });
    expect(list.items.some((b) => b.id === id)).toBe(true);
  });
});
