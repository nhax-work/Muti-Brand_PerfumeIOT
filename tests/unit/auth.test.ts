/**
 * Unit test cho module auth (apps/api/src/modules/auth).
 *
 * Khởi tạo AuthService, PrincipalLoader và TokenService TRỰC TIẾP với phụ thuộc giả, không dựng Nest
 * và không cần CSDL — đó là hệ quả trực tiếp của QT2 trong ADR-0003 (tầng nghiệp vụ không biết gì
 * về cửa vào).
 *
 * KHÔNG có test nào ở đây mang mã FR-AUTH-07 hay FR-AUTH-08: hai FR đó nghiệm thu bằng
 * tests/integration/test_slot_isolation.ts, thuộc 7 nhóm test người tự viết (spec/testing.md).
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hash } from 'argon2';
import { loadConfig, type AppConfig } from '../../apps/api/src/shared/config/index.js';
import { AppError } from '../../apps/api/src/shared/errors/index.js';
import type { AuditEntry } from '../../apps/api/src/shared/audit/index.js';
import { AuthService } from '../../apps/api/src/modules/auth/auth.service.js';
import {
  LOGIN_FAILED,
  LOGIN_SUCCEEDED,
  type LoginUserRow,
  type PrincipalRow,
  type SessionRow,
  type UserStatus,
} from '../../apps/api/src/modules/auth/auth.queries.js';
import { PrincipalLoader } from '../../apps/api/src/modules/auth/principal.loader.js';
import { TokenService, hashRefreshToken } from '../../apps/api/src/modules/auth/tokens.js';

const PASSWORD = 'correct-password-1';
const BRAND_A = '11111111-1111-4111-8111-000000000001';
const MS_PER_MINUTE = 60_000;

// ---------------------------------------------------------------------------------------------
// Phụ thuộc giả
// ---------------------------------------------------------------------------------------------

class FakeClock {
  current = new Date('2026-09-18T08:00:00Z');
  now = (): Date => new Date(this.current);
  advanceMinutes(n: number): void {
    this.current = new Date(this.current.getTime() + n * MS_PER_MINUTE);
  }
}

interface FakeUser {
  id: string;
  brandId: string | null;
  email: string;
  fullName: string;
  passwordHash: string;
  status: UserStatus;
  permissionVersion: number;
  roles: PrincipalRow['roles'];
  permissions: string[];
}

class FakeQueries {
  users = new Map<string, FakeUser>();
  sessions = new Map<string, SessionRow & { tokenHash: string }>();
  loginLog: { userId: string; action: string; at: Date }[] = [];
  private seq = 0;

  constructor(private readonly clock: FakeClock) {}

  async findUserForLogin(email: string): Promise<LoginUserRow | undefined> {
    const u = [...this.users.values()].find((x) => x.email.toLowerCase() === email.toLowerCase());
    return u && { ...u };
  }
  async findPasswordHash(userId: string): Promise<string | undefined> {
    return this.users.get(userId)?.passwordHash;
  }
  async recentLoginOutcomes(userId: string, limit: number) {
    return this.loginLog
      .filter((e) => e.userId === userId && [LOGIN_SUCCEEDED, LOGIN_FAILED].includes(e.action))
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, limit)
      .map((e) => ({ action: e.action, at: e.at }));
  }
  async loadPrincipal(userId: string): Promise<PrincipalRow | undefined> {
    const u = this.users.get(userId);
    if (!u) return undefined;
    return {
      id: u.id,
      brandId: u.brandId,
      email: u.email,
      fullName: u.fullName,
      status: u.status,
      permissionVersion: u.permissionVersion,
      roles: u.roles,
      permissions: u.permissions,
      scopes: u.brandId ? [{ type: 'BRAND', id: null }] : [{ type: 'PLATFORM', id: null }],
    };
  }
  async createSession(input: { userId: string; tokenHash: string; expiresAt: Date }) {
    const id = `session-${++this.seq}`;
    this.sessions.set(id, {
      id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
    });
    return id;
  }
  async findSessionByTokenHash(tokenHash: string) {
    return [...this.sessions.values()].find((s) => s.tokenHash === tokenHash);
  }
  async rotateSession(id: string, newTokenHash: string) {
    const s = this.sessions.get(id);
    if (s) this.sessions.set(id, { ...s, tokenHash: newTokenHash });
  }
  async isSessionActive(id: string, now: Date) {
    const s = this.sessions.get(id);
    return !!s && s.revokedAt === null && s.expiresAt > now;
  }
  async revokeSession(id: string, now: Date) {
    const s = this.sessions.get(id);
    if (s && s.revokedAt === null) this.sessions.set(id, { ...s, revokedAt: now });
  }
  async revokeAllSessions(userId: string, now: Date) {
    let n = 0;
    for (const s of this.sessions.values()) {
      if (s.userId === userId && s.revokedAt === null) {
        this.sessions.set(s.id, { ...s, revokedAt: now });
        n++;
      }
    }
    return n;
  }
  async bumpPermissionVersion(userId: string) {
    const u = this.users.get(userId);
    if (u) u.permissionVersion += 1;
  }
  async touchLastLogin() {}
  async setPassword(userId: string, passwordHash: string, status: UserStatus) {
    const u = this.users.get(userId);
    if (u) {
      u.passwordHash = passwordHash;
      u.status = status;
    }
  }
}

/** Audit giả: ghi lại mục và nuôi nhật ký đăng nhập mà FakeQueries dùng để tính khóa. */
class FakeAudit {
  entries: AuditEntry[] = [];
  constructor(
    private readonly queries: FakeQueries,
    private readonly clock: FakeClock,
  ) {}
  async log(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    if (entry.targetType === 'user' && entry.targetId) {
      this.queries.loginLog.push({
        userId: entry.targetId,
        action: entry.action,
        at: this.clock.now(),
      });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Dựng hệ thống cần test
// ---------------------------------------------------------------------------------------------

let passwordHash: string;
let clock: FakeClock;
let queries: FakeQueries;
let audit: FakeAudit;
let config: AppConfig;
let tokens: TokenService;
let loader: PrincipalLoader;
let auth: AuthService;

const origin = { ip: '127.0.0.1', userAgent: 'vitest' };

function addUser(overrides: Partial<FakeUser> = {}): FakeUser {
  const user: FakeUser = {
    id: `user-${queries.users.size + 1}`,
    brandId: null,
    email: `user${queries.users.size + 1}@scentstation.local`,
    fullName: 'Người dùng thử',
    passwordHash,
    status: 'ACTIVE',
    permissionVersion: 1,
    roles: ['OPERATIONS_STAFF'],
    permissions: ['alert.handle'],
    ...overrides,
  };
  queries.users.set(user.id, user);
  return user;
}

async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await expect(promise).rejects.toMatchObject({ code });
}

beforeAll(async () => {
  passwordHash = await hash(PASSWORD);
});

beforeEach(() => {
  clock = new FakeClock();
  queries = new FakeQueries(clock);
  audit = new FakeAudit(queries, clock);
  config = loadConfig({ DATABASE_URL: 'postgres://unused', JWT_SECRET: 'unit-test-secret' });
  tokens = new TokenService(
    config.jwtSecret,
    config.constraint('ACCESS_TOKEN_TTL_MIN') * 60,
    config.constraint('REAUTH_TOKEN_TTL_SEC'),
  );
  loader = new PrincipalLoader(queries, config, clock);
  auth = new AuthService(queries, audit, loader, tokens, config, clock);
});

// ---------------------------------------------------------------------------------------------

describe('FR-AUTH-01 — đăng nhập', () => {
  it('test_FR_AUTH_01_login_with_email_password', async () => {
    const user = addUser({ email: 'ops@scentstation.local' });
    const pair = await auth.login('ops@scentstation.local', PASSWORD, origin);

    expect(pair.user.id).toBe(user.id);
    expect(pair.accessToken).toBeTruthy();
    expect(audit.entries.at(-1)?.action).toBe(LOGIN_SUCCEEDED);
  });

  it('test_FR_AUTH_01_unknown_email_and_wrong_password_same_response', async () => {
    addUser({ email: 'ops@scentstation.local' });

    const unknown = await auth.login('nobody@x.local', PASSWORD, origin).catch((e: AppError) => e);
    const wrong = await auth
      .login('ops@scentstation.local', 'wrong-password', origin)
      .catch((e: AppError) => e);

    // AC2: không phân biệt được email tồn tại hay không.
    expect(unknown).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(wrong).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect((unknown as AppError).message).toBe((wrong as AppError).message);
  });

  it('test_FR_AUTH_01_disabled_account_rejected_even_with_correct_password', async () => {
    addUser({ email: 'gone@scentstation.local', status: 'DISABLED' });
    await expectAppError(
      auth.login('gone@scentstation.local', PASSWORD, origin),
      'INVALID_CREDENTIALS',
    );
    // AC3: không cấp token — không có phiên nào được tạo.
    expect(queries.sessions.size).toBe(0);
  });

  it('test_FR_AUTH_01_failed_login_is_audited', async () => {
    addUser({ email: 'ops@scentstation.local' });
    await auth.login('ops@scentstation.local', 'wrong-password', origin).catch(() => undefined);
    // AC5 + FR-AUD-01
    expect(audit.entries.at(-1)).toMatchObject({ action: LOGIN_FAILED, sourceIp: '127.0.0.1' });
  });
});

describe('FR-AUTH-02 — access token và refresh token', () => {
  it('test_FR_AUTH_02_token_ttl_read_from_spec_constraints', async () => {
    addUser({ email: 'ops@scentstation.local' });
    const pair = await auth.login('ops@scentstation.local', PASSWORD, origin);
    // ACCESS_TOKEN_TTL_MIN đọc từ spec/constraints.md, không hardcode.
    expect(pair.expiresIn).toBe(config.constraint('ACCESS_TOKEN_TTL_MIN') * 60);
  });

  it('test_FR_AUTH_02_expired_access_token_returns_token_expired', async () => {
    const shortLived = new TokenService('unit-test-secret', 1, 300);
    const token = shortLived.signAccess({ sub: 'u', sid: 's', pv: 1 });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(() => shortLived.verifyAccess(token)).toThrowError(
      expect.objectContaining({ code: 'TOKEN_EXPIRED' }),
    );
  });

  it('test_FR_AUTH_02_forged_access_token_is_unauthenticated', () => {
    const other = new TokenService('some-other-secret', 3600, 300);
    const forged = other.signAccess({ sub: 'u', sid: 's', pv: 1 });
    expect(() => tokens.verifyAccess(forged)).toThrowError(
      expect.objectContaining({ code: 'UNAUTHENTICATED' }),
    );
  });

  it('test_FR_AUTH_02_refresh_rotates_and_old_token_is_rejected', async () => {
    addUser({ email: 'ops@scentstation.local' });
    const first = await auth.login('ops@scentstation.local', PASSWORD, origin);
    const second = await auth.refresh(first.refreshToken);

    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expectAppError(auth.refresh(first.refreshToken), 'UNAUTHENTICATED');
  });

  it('test_FR_AUTH_02_refresh_token_stored_only_as_hash', async () => {
    addUser({ email: 'ops@scentstation.local' });
    const pair = await auth.login('ops@scentstation.local', PASSWORD, origin);
    const stored = [...queries.sessions.values()][0];
    // AC5 + NFR-SEC-05
    expect(stored?.tokenHash).toBe(hashRefreshToken(pair.refreshToken));
    expect(stored?.tokenHash).not.toBe(pair.refreshToken);
  });

  it('test_FR_AUTH_02_refresh_rejected_for_disabled_account_without_rotating', async () => {
    const user = addUser({ email: 'ops@scentstation.local' });
    const pair = await auth.login('ops@scentstation.local', PASSWORD, origin);
    const hashBefore = [...queries.sessions.values()][0]?.tokenHash;

    user.status = 'DISABLED';
    await expectAppError(auth.refresh(pair.refreshToken), 'UNAUTHENTICATED');
    // Yêu cầu bị từ chối thì không được làm thay đổi phiên.
    expect([...queries.sessions.values()][0]?.tokenHash).toBe(hashBefore);
  });
});

describe('FR-AUTH-03 — khóa tài khoản', () => {
  const attempts = () => config.constraint('LOGIN_LOCKOUT_ATTEMPTS');

  async function failTimes(email: string, n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      await auth.login(email, 'wrong-password', origin).catch(() => undefined);
    }
  }

  it('test_FR_AUTH_03_lock_after_consecutive_failures', async () => {
    addUser({ email: 'ops@scentstation.local' });
    await failTimes('ops@scentstation.local', attempts());
    await expectAppError(
      auth.login('ops@scentstation.local', 'wrong-password', origin),
      'ACCOUNT_LOCKED',
    );
  });

  it('test_FR_AUTH_03_locked_even_with_correct_password', async () => {
    addUser({ email: 'ops@scentstation.local' });
    await failTimes('ops@scentstation.local', attempts());
    // AC1: kể cả mật khẩu đúng.
    await expectAppError(auth.login('ops@scentstation.local', PASSWORD, origin), 'ACCOUNT_LOCKED');
  });

  it('test_FR_AUTH_03_unlocks_after_lockout_window', async () => {
    addUser({ email: 'ops@scentstation.local' });
    await failTimes('ops@scentstation.local', attempts());
    clock.advanceMinutes(config.constraint('LOGIN_LOCKOUT_MIN') + 1);
    // AC2
    await expect(auth.login('ops@scentstation.local', PASSWORD, origin)).resolves.toBeTruthy();
  });

  it('test_FR_AUTH_03_success_resets_consecutive_count', async () => {
    addUser({ email: 'ops@scentstation.local' });
    await failTimes('ops@scentstation.local', attempts() - 2);
    await auth.login('ops@scentstation.local', PASSWORD, origin);
    await failTimes('ops@scentstation.local', 2);
    // AC3: tổng số lần sai = attempts nhưng không liên tiếp -> không khóa.
    await expect(auth.login('ops@scentstation.local', PASSWORD, origin)).resolves.toBeTruthy();
  });

  it('test_FR_AUTH_03_attempts_during_lock_do_not_extend_it', async () => {
    addUser({ email: 'ops@scentstation.local' });
    await failTimes('ops@scentstation.local', attempts());
    // Cố đăng nhập liên tục trong lúc bị khóa...
    for (let i = 0; i < 3; i++) {
      clock.advanceMinutes(1);
      await auth.login('ops@scentstation.local', PASSWORD, origin).catch(() => undefined);
    }
    // ...không kéo dài thời gian khóa: hết LOGIN_LOCKOUT_MIN tính từ lần sai cuối là mở.
    clock.advanceMinutes(config.constraint('LOGIN_LOCKOUT_MIN') - 3 + 1);
    await expect(auth.login('ops@scentstation.local', PASSWORD, origin)).resolves.toBeTruthy();
  });
});

describe('FR-AUTH-04 — đăng xuất', () => {
  it('test_FR_AUTH_04_logout_revokes_only_current_session', async () => {
    addUser({ email: 'ops@scentstation.local' });
    const a = await auth.login('ops@scentstation.local', PASSWORD, origin);
    const b = await auth.login('ops@scentstation.local', PASSWORD, origin);

    const userA = await loader.load(tokens.verifyAccess(a.accessToken));
    await auth.logout(userA, origin);

    // AC1 + AC3: phiên A chết cả access lẫn refresh.
    await expectAppError(loader.load(tokens.verifyAccess(a.accessToken)), 'UNAUTHENTICATED');
    await expectAppError(auth.refresh(a.refreshToken), 'UNAUTHENTICATED');
    // AC2: phiên B còn sống.
    await expect(loader.load(tokens.verifyAccess(b.accessToken))).resolves.toBeTruthy();
  });
});

describe('FR-AUTH-05, FR-AUTH-06 — liên kết thương hiệu và quyền', () => {
  it('test_FR_AUTH_05_brand_admin_scope_is_its_brand', async () => {
    addUser({
      email: 'admin@aurore.local',
      brandId: BRAND_A,
      roles: ['BRAND_ADMIN'],
      permissions: ['report.brand'],
    });
    const pair = await auth.login('admin@aurore.local', PASSWORD, origin);
    const user = await loader.load(tokens.verifyAccess(pair.accessToken));

    expect(user.brandId).toBe(BRAND_A);
    expect(user.scope).toEqual({ type: 'BRAND', brandId: BRAND_A });
  });

  it('test_FR_AUTH_06_permissions_come_from_role_data', async () => {
    addUser({
      email: 'ops@scentstation.local',
      permissions: ['alert.handle', 'maintenance.handle'],
    });
    const pair = await auth.login('ops@scentstation.local', PASSWORD, origin);
    expect(pair.user.permissions).toEqual(['alert.handle', 'maintenance.handle']);
  });
});

describe('FR-AUTH-09 — xác thực lại', () => {
  it('test_FR_AUTH_09_reauth_token_bound_to_user', async () => {
    const owner = addUser({ email: 'ops@scentstation.local' });
    const pair = await auth.login('ops@scentstation.local', PASSWORD, origin);
    const user = await loader.load(tokens.verifyAccess(pair.accessToken));
    const { reauthToken, expiresIn } = await auth.reauthenticate(user, PASSWORD, origin);

    expect(expiresIn).toBe(config.constraint('REAUTH_TOKEN_TTL_SEC'));
    expect(() => tokens.verifyReauth(reauthToken, owner.id)).not.toThrow();
    // Không dùng được reauth token của người khác.
    expect(() => tokens.verifyReauth(reauthToken, 'someone-else')).toThrowError(
      expect.objectContaining({ code: 'REAUTH_REQUIRED' }),
    );
  });

  it('test_FR_AUTH_09_wrong_password_issues_no_reauth_token', async () => {
    addUser({ email: 'ops@scentstation.local' });
    const pair = await auth.login('ops@scentstation.local', PASSWORD, origin);
    const user = await loader.load(tokens.verifyAccess(pair.accessToken));
    // AC3
    await expectAppError(
      auth.reauthenticate(user, 'wrong-password', origin),
      'INVALID_CREDENTIALS',
    );
  });

  it('test_FR_AUTH_09_access_token_cannot_be_used_as_reauth_token', async () => {
    const owner = addUser({ email: 'ops@scentstation.local' });
    const pair = await auth.login('ops@scentstation.local', PASSWORD, origin);
    expect(() => tokens.verifyReauth(pair.accessToken, owner.id)).toThrowError(
      expect.objectContaining({ code: 'REAUTH_REQUIRED' }),
    );
  });
});

describe('FR-AUTH-10 — thu hồi phiên khi vô hiệu hóa tài khoản', () => {
  it('test_FR_AUTH_10_revoke_all_kills_every_session', async () => {
    const user = addUser({ email: 'ops@scentstation.local' });
    const a = await auth.login('ops@scentstation.local', PASSWORD, origin);
    const b = await auth.login('ops@scentstation.local', PASSWORD, origin);

    await auth.revokeAllAccess(user.id);

    // AC1: mọi refresh session bị thu hồi, mọi access token mất hiệu lực.
    for (const pair of [a, b]) {
      await expectAppError(auth.refresh(pair.refreshToken), 'UNAUTHENTICATED');
      await expectAppError(loader.load(tokens.verifyAccess(pair.accessToken)), 'UNAUTHENTICATED');
    }
  });

  it('test_FR_AUTH_10_stale_permission_version_rejected', async () => {
    const user = addUser({ email: 'ops@scentstation.local' });
    const pair = await auth.login('ops@scentstation.local', PASSWORD, origin);
    user.permissionVersion += 1;
    // AC2: token mang permission_version cũ bị từ chối.
    await expectAppError(loader.load(tokens.verifyAccess(pair.accessToken)), 'UNAUTHENTICATED');
  });

  it('test_FR_AUTH_10_cache_never_outlives_session_revoke_max_sec', async () => {
    const user = addUser({ email: 'ops@scentstation.local' });
    const pair = await auth.login('ops@scentstation.local', PASSWORD, origin);
    const claims = tokens.verifyAccess(pair.accessToken);
    await loader.load(claims); // nạp vào bộ nhớ đệm

    // Vô hiệu hóa ở tầng dữ liệu, KHÔNG gọi invalidateUser — mô phỏng một tiến trình khác làm việc đó.
    user.status = 'DISABLED';
    const revokeMaxMinutes = config.constraint('SESSION_REVOKE_MAX_SEC') / 60;
    clock.advanceMinutes(revokeMaxMinutes + 0.1);

    await expectAppError(loader.load(claims), 'UNAUTHENTICATED');
  });
});

describe('ADR-0004 — tài khoản INVITED và đổi mật khẩu', () => {
  it('test_FR_AUTH_01_invited_account_can_login_but_must_change_password', async () => {
    addUser({ email: 'new@scentstation.local', status: 'INVITED' });
    const pair = await auth.login('new@scentstation.local', PASSWORD, origin);
    // AC3 (đã sửa theo ADR-0004): INVITED đăng nhập được nhưng bị đánh dấu phải đổi mật khẩu.
    expect(pair.user.mustChangePassword).toBe(true);
  });

  it('test_FR_AUTH_01_active_account_does_not_need_password_change', async () => {
    addUser({ email: 'ops@scentstation.local' });
    const pair = await auth.login('ops@scentstation.local', PASSWORD, origin);
    expect(pair.user.mustChangePassword).toBe(false);
  });

  it('test_FR_USR_04_change_password_activates_and_revokes_every_session', async () => {
    const user = addUser({ email: 'new@scentstation.local', status: 'INVITED' });
    const a = await auth.login('new@scentstation.local', PASSWORD, origin);
    const b = await auth.login('new@scentstation.local', PASSWORD, origin);
    const current = await loader.load(tokens.verifyAccess(a.accessToken));

    await auth.changePassword(current, PASSWORD, 'brand-new-password', origin);

    expect(user.status).toBe('ACTIVE');
    // Mọi phiên chết, kể cả phiên vừa gọi đổi mật khẩu.
    for (const pair of [a, b]) {
      await expectAppError(auth.refresh(pair.refreshToken), 'UNAUTHENTICATED');
    }
    await expectAppError(
      auth.login('new@scentstation.local', PASSWORD, origin),
      'INVALID_CREDENTIALS',
    );
    await expect(
      auth.login('new@scentstation.local', 'brand-new-password', origin),
    ).resolves.toBeTruthy();
  });

  it('test_FR_USR_04_change_password_rejects_wrong_current_password', async () => {
    addUser({ email: 'new@scentstation.local', status: 'INVITED' });
    const pair = await auth.login('new@scentstation.local', PASSWORD, origin);
    const current = await loader.load(tokens.verifyAccess(pair.accessToken));
    await expectAppError(
      auth.changePassword(current, 'not-the-password', 'brand-new-password', origin),
      'INVALID_CREDENTIALS',
    );
  });

  it('test_FR_USR_04_change_password_rejects_reusing_same_password', async () => {
    addUser({ email: 'new@scentstation.local', status: 'INVITED' });
    const pair = await auth.login('new@scentstation.local', PASSWORD, origin);
    const current = await loader.load(tokens.verifyAccess(pair.accessToken));
    await expectAppError(
      auth.changePassword(current, PASSWORD, PASSWORD, origin),
      'VALIDATION_ERROR',
    );
  });

  it('test_FR_USR_04_reset_to_temporary_password_revokes_access', async () => {
    const user = addUser({ email: 'ops@scentstation.local' });
    const pair = await auth.login('ops@scentstation.local', PASSWORD, origin);

    const temporary = await auth.resetToTemporaryPassword(user.id);

    expect(user.status).toBe('INVITED');
    expect(temporary.length).toBeGreaterThanOrEqual(12);
    await expectAppError(loader.load(tokens.verifyAccess(pair.accessToken)), 'UNAUTHENTICATED');
    await expect(auth.login('ops@scentstation.local', temporary, origin)).resolves.toMatchObject({
      user: { mustChangePassword: true },
    });
  });
});
