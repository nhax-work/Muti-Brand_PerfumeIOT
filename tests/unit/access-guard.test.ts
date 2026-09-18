/**
 * Unit test cho AccessGuard — guard toàn cục mà MỌI endpoint của MỌI module đều đi qua.
 *
 * Dựng Reflector thật và gắn metadata bằng chính các decorator mà module nghiệp vụ dùng, nên test
 * kiểm đúng cơ chế mà các thành viên khác sẽ dựa vào.
 *
 * Không đặt mã FR-AUTH-08 dù guard trả FORBIDDEN_SCOPE: FR-AUTH-08 nghiệm thu bằng
 * tests/integration/test_slot_isolation.ts (test người tự viết).
 */

import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessGuard } from '../../apps/api/src/modules/auth/access.guard.js';
import {
  AllowPendingPasswordChange,
  Public,
  RequirePermissions,
  RequireReauth,
} from '../../apps/api/src/modules/auth/decorators.js';
import type {
  AuthenticatedUser,
  PrincipalLoader,
} from '../../apps/api/src/modules/auth/principal.loader.js';
import { TokenService } from '../../apps/api/src/modules/auth/tokens.js';

const tokens = new TokenService('guard-test-secret', 3600, 300);

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    userId: 'user-1',
    brandId: null,
    roles: ['OPERATIONS_STAFF'],
    permissions: new Set(['alert.handle']),
    permissionVersion: 1,
    scope: { type: 'PLATFORM' },
    email: 'ops@scentstation.local',
    fullName: 'Ops',
    sessionId: 'session-1',
    mustChangePassword: false,
    ...overrides,
  };
}

function guardFor(loaded: AuthenticatedUser): AccessGuard {
  const loader = { load: async () => loaded } as unknown as PrincipalLoader;
  return new AccessGuard(new Reflector(), tokens, loader);
}

/** Một "endpoint" giả: hàm xử lý và lớp controller, mỗi thứ có thể mang metadata. */
function endpoint(...decorators: ((target: object) => void)[]) {
  const handler = function handler() {};
  class Controller {}
  for (const decorate of decorators) decorate(handler);
  return { handler, Controller };
}

function context(
  target: ReturnType<typeof endpoint>,
  headers: Record<string, string> = {},
): ExecutionContext {
  const request = { headers };
  return {
    getHandler: () => target.handler,
    getClass: () => target.Controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function bearer(): Record<string, string> {
  return {
    authorization: `Bearer ${tokens.signAccess({ sub: 'user-1', sid: 'session-1', pv: 1 })}`,
  };
}

async function rejectsWith(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('AccessGuard', () => {
  it('test_FR_AUTH_02_guard_rejects_request_without_bearer_token', async () => {
    await rejectsWith(guardFor(user()).canActivate(context(endpoint())), 'UNAUTHENTICATED');
  });

  it('public endpoint passes without any token', async () => {
    const target = endpoint(Public());
    await expect(guardFor(user()).canActivate(context(target))).resolves.toBe(true);
  });

  it('test_FR_AUTH_06_guard_rejects_missing_permission', async () => {
    const target = endpoint(RequirePermissions('user.manage'));
    await rejectsWith(guardFor(user()).canActivate(context(target, bearer())), 'FORBIDDEN_SCOPE');
  });

  it('test_FR_AUTH_06_guard_allows_when_every_permission_present', async () => {
    const target = endpoint(RequirePermissions('alert.handle'));
    await expect(guardFor(user()).canActivate(context(target, bearer()))).resolves.toBe(true);
  });

  it('requires ALL listed permissions, not any one of them', async () => {
    const target = endpoint(RequirePermissions('alert.handle', 'user.manage'));
    await rejectsWith(guardFor(user()).canActivate(context(target, bearer())), 'FORBIDDEN_SCOPE');
  });

  it('test_FR_AUTH_09_guard_requires_reauth_token', async () => {
    const target = endpoint(RequireReauth());
    await rejectsWith(guardFor(user()).canActivate(context(target, bearer())), 'REAUTH_REQUIRED');
  });

  it('test_FR_AUTH_09_guard_accepts_valid_reauth_token', async () => {
    const target = endpoint(RequireReauth());
    const headers = { ...bearer(), 'x-reauth-token': tokens.signReauth('user-1') };
    await expect(guardFor(user()).canActivate(context(target, headers))).resolves.toBe(true);
  });

  it('test_FR_AUTH_09_guard_rejects_reauth_token_of_another_user', async () => {
    const target = endpoint(RequireReauth());
    const headers = { ...bearer(), 'x-reauth-token': tokens.signReauth('someone-else') };
    await rejectsWith(guardFor(user()).canActivate(context(target, headers)), 'REAUTH_REQUIRED');
  });

  it('invited account is blocked from ordinary endpoints (ADR-0004)', async () => {
    const invited = user({ mustChangePassword: true });
    await rejectsWith(
      guardFor(invited).canActivate(context(endpoint(), bearer())),
      'FORBIDDEN_SCOPE',
    );
  });

  it('invited account may call endpoints marked AllowPendingPasswordChange', async () => {
    const invited = user({ mustChangePassword: true });
    const target = endpoint(AllowPendingPasswordChange());
    await expect(guardFor(invited).canActivate(context(target, bearer()))).resolves.toBe(true);
  });

  it('authentication runs before authorization', async () => {
    // Endpoint vừa đòi quyền vừa không có token: phải báo thiếu xác thực, không báo thiếu quyền —
    // phân quyền trước xác thực là lộ ra endpoint nào đòi quyền gì.
    const target = endpoint(RequirePermissions('user.manage'));
    await rejectsWith(guardFor(user()).canActivate(context(target)), 'UNAUTHENTICATED');
  });
});
