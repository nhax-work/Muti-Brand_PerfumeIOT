/**
 * Unit test cho module USR — phần quản trị của RBAC (FR-USR-01..05, FR-AUTH-05, FR-AUTH-11).
 * UsrService được khởi tạo trực tiếp với phụ thuộc giả (QT2, ADR-0003).
 */

import 'reflect-metadata';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RoleCode } from '@scentstation/contracts';
import type { AuditEntry } from '../../apps/api/src/shared/audit/index.js';
import type { AuthenticatedUser } from '../../apps/api/src/modules/auth/principal.loader.js';
import { REQUIRED_PERMISSIONS } from '../../apps/api/src/modules/auth/decorators.js';
import { UsrController } from '../../apps/api/src/modules/usr/usr.http.js';
import type { UserRecord, UserStatus } from '../../apps/api/src/modules/usr/usr.queries.js';
import { UsrService } from '../../apps/api/src/modules/usr/usr.service.js';

const BRAND_A = '11111111-1111-4111-8111-000000000001';

class FakeUsrQueries {
  users = new Map<string, UserRecord>();
  brands = new Set([BRAND_A]);
  passwordHashes = new Map<string, string>();
  private seq = 0;

  async list() {
    return { items: [...this.users.values()], total: this.users.size };
  }
  async findById(id: string) {
    return this.users.get(id);
  }
  async emailExists(email: string) {
    return [...this.users.values()].some((u) => u.email.toLowerCase() === email.toLowerCase());
  }
  async brandExists(brandId: string) {
    return this.brands.has(brandId);
  }
  async create(input: {
    email: string;
    fullName: string;
    brandId: string | null;
    passwordHash: string;
    role: RoleCode;
  }) {
    const id = `user-${++this.seq}`;
    this.users.set(id, {
      id,
      brandId: input.brandId,
      email: input.email,
      fullName: input.fullName,
      status: 'INVITED',
      roles: [input.role],
      lastLoginAt: null,
      createdAt: new Date('2026-09-18T08:00:00Z'),
    });
    this.passwordHashes.set(id, input.passwordHash);
    return id;
  }
  async setStatus(id: string, status: UserStatus) {
    const u = this.users.get(id);
    if (u) this.users.set(id, { ...u, status });
  }
}

class FakeAuth {
  revoked: string[] = [];
  resets: string[] = [];
  async revokeAllAccess(userId: string) {
    this.revoked.push(userId);
  }
  async resetToTemporaryPassword(userId: string) {
    this.resets.push(userId);
    return 'temporary-pass-xyz';
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
  permissions: new Set(['user.manage']),
  permissionVersion: 1,
  scope: { type: 'PLATFORM' },
  email: 'admin@scentstation.local',
  fullName: 'Admin',
  sessionId: 'session-1',
  mustChangePassword: false,
};

let queries: FakeUsrQueries;
let auth: FakeAuth;
let audit: FakeAudit;
let service: UsrService;

beforeEach(() => {
  queries = new FakeUsrQueries();
  auth = new FakeAuth();
  audit = new FakeAudit();
  service = new UsrService(queries, auth, audit);
});

async function rejectsWith(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('FR-USR-01, FR-USR-02, FR-AUTH-05 — tạo tài khoản', () => {
  it('test_FR_USR_01_create_brand_admin_bound_to_brand', async () => {
    const created = await service.create(admin, {
      email: 'new@aurore.local',
      fullName: 'Brand Admin mới',
      role: 'BRAND_ADMIN',
      brandId: BRAND_A,
    });
    expect(created).toMatchObject({ brandId: BRAND_A, status: 'INVITED', roles: ['BRAND_ADMIN'] });
  });

  it('test_FR_USR_02_create_platform_staff_without_brand', async () => {
    const created = await service.create(admin, {
      email: 'ops2@scentstation.local',
      fullName: 'Ops 2',
      role: 'OPERATIONS_STAFF',
    });
    expect(created.brandId).toBeNull();
  });

  it('test_FR_AUTH_05_brand_admin_without_brand_rejected', async () => {
    // AC3
    await rejectsWith(
      service.create(admin, { email: 'x@a.local', fullName: 'X', role: 'BRAND_ADMIN' }),
      'VALIDATION_ERROR',
    );
  });

  it('test_FR_AUTH_05_platform_role_with_brand_rejected', async () => {
    // AC4
    await rejectsWith(
      service.create(admin, {
        email: 'y@a.local',
        fullName: 'Y',
        role: 'INVENTORY_STAFF',
        brandId: BRAND_A,
      }),
      'VALIDATION_ERROR',
    );
  });

  it('test_FR_USR_01_unknown_brand_rejected', async () => {
    await rejectsWith(
      service.create(admin, {
        email: 'z@a.local',
        fullName: 'Z',
        role: 'BRAND_ADMIN',
        brandId: '99999999-9999-4999-8999-999999999999',
      }),
      'VALIDATION_ERROR',
    );
  });

  it('test_FR_USR_01_duplicate_email_rejected_case_insensitively', async () => {
    await service.create(admin, { email: 'dup@a.local', fullName: 'A', role: 'INVENTORY_STAFF' });
    await rejectsWith(
      service.create(admin, { email: 'DUP@a.local', fullName: 'B', role: 'INVENTORY_STAFF' }),
      'VALIDATION_ERROR',
    );
  });

  it('test_FR_USR_01_temporary_password_returned_once_and_never_audited', async () => {
    const created = await service.create(admin, {
      email: 'new@a.local',
      fullName: 'New',
      role: 'INVENTORY_STAFF',
    });

    // Trả về đúng một lần trong phản hồi tạo (ADR-0004)...
    expect(created.temporaryPassword.length).toBeGreaterThanOrEqual(12);
    // ...chỉ lưu băm, không lưu dạng gốc...
    expect(queries.passwordHashes.get(created.id)).not.toBe(created.temporaryPassword);
    // ...đọc lại không còn thấy...
    expect(await service.get(admin, created.id)).not.toHaveProperty('temporaryPassword');
    // ...và không lọt vào nhật ký kiểm toán.
    expect(JSON.stringify(audit.entries)).not.toContain(created.temporaryPassword);
  });
});

describe('FR-USR-03, FR-AUTH-10, FR-AUTH-11 — vô hiệu hóa', () => {
  it('test_FR_USR_03_disable_revokes_all_access', async () => {
    const created = await service.create(admin, {
      email: 'gone@a.local',
      fullName: 'Gone',
      role: 'INVENTORY_STAFF',
    });
    await service.disable(admin, created.id);

    expect(queries.users.get(created.id)?.status).toBe('DISABLED');
    expect(auth.revoked).toEqual([created.id]);
    expect(audit.entries.at(-1)?.action).toBe('usr.user.disabled');
  });

  it('test_FR_AUTH_11_super_admin_can_disable_any_brand_user', async () => {
    const brandUser = await service.create(admin, {
      email: 'b@aurore.local',
      fullName: 'B',
      role: 'BRAND_ADMIN',
      brandId: BRAND_A,
    });
    await service.disable(admin, brandUser.id);
    expect(auth.revoked).toEqual([brandUser.id]);
  });

  it('test_FR_USR_03_cannot_disable_own_account', async () => {
    await rejectsWith(service.disable(admin, admin.userId), 'VALIDATION_ERROR');
    expect(auth.revoked).toEqual([]);
  });

  it('test_FR_USR_03_disable_is_idempotent', async () => {
    const created = await service.create(admin, {
      email: 'gone@a.local',
      fullName: 'Gone',
      role: 'INVENTORY_STAFF',
    });
    await service.disable(admin, created.id);
    await service.disable(admin, created.id);
    expect(auth.revoked).toEqual([created.id]);
  });

  it('test_FR_USR_03_unknown_user_returns_not_found_for_platform_admin', async () => {
    await rejectsWith(service.disable(admin, 'missing'), 'NOT_FOUND');
  });
});

describe('FR-USR-04 — đặt lại mật khẩu', () => {
  it('test_FR_USR_04_reset_returns_temporary_password', async () => {
    const created = await service.create(admin, {
      email: 'r@a.local',
      fullName: 'R',
      role: 'INVENTORY_STAFF',
    });
    const { temporaryPassword } = await service.resetPassword(admin, created.id);

    expect(temporaryPassword).toBe('temporary-pass-xyz');
    expect(auth.resets).toEqual([created.id]);
    expect(JSON.stringify(audit.entries)).not.toContain(temporaryPassword);
  });

  it('test_FR_USR_04_reset_rejected_for_disabled_account', async () => {
    // Đặt lại sẽ đưa về INVITED, tức âm thầm mở lại một tài khoản đã bị khóa có chủ ý.
    const created = await service.create(admin, {
      email: 'r@a.local',
      fullName: 'R',
      role: 'INVENTORY_STAFF',
    });
    await service.disable(admin, created.id);
    await rejectsWith(service.resetPassword(admin, created.id), 'VALIDATION_ERROR');
    expect(auth.resets).toEqual([]);
  });
});

describe('FR-USR-05 — chỉ Platform Super Admin quản trị tài khoản', () => {
  it('test_FR_USR_05_user_endpoints_require_user_manage_permission', () => {
    // Cưỡng chế ở tầng controller cho MỌI endpoint của module, bằng quyền mà seed chỉ cấp cho
    // Platform Super Admin.
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS, UsrController)).toEqual(['user.manage']);
  });
});
