/**
 * Quên mật khẩu qua email trên PostgreSQL thật (FR-AUTH-13, ADR-0030): HTTP thật, bảng
 * password_reset_tokens thật. Cổng gửi email được theo dõi bằng spy để lấy mã gốc — phần cần chứng
 * minh (chỉ lưu bản băm, dùng một lần, thu hồi phiên, không lộ email) chạy thật trên CSDL.
 */

import { createHash } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  PASSWORD_RESET_SENDER,
  type PasswordResetSender,
} from '../../apps/api/src/modules/auth/index.js';
import { createTestApp, login } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
  TEST_PASSWORD,
  type IsolationFixture,
} from './helpers/seed-isolation.js';

const NEW_PASSWORD = 'MatKhauMoi#2026';

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let sender: PasswordResetSender;

/** Gửi email chạy nền — đợi spy nhận được rồi trả mã gốc. */
async function requestToken(email: string, ip: string): Promise<string | null> {
  const spy = vi.spyOn(sender, 'sendPasswordResetEmail').mockResolvedValue();
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/forgot-password',
    payload: { email },
    remoteAddress: ip,
  });
  expect(res.statusCode, res.body).toBe(204);
  await new Promise((resolve) => setImmediate(resolve));
  const call = spy.mock.calls.at(-1);
  spy.mockRestore();
  return call ? call[1] : null;
}

function reset(token: string, newPassword = NEW_PASSWORD) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/reset-password',
    payload: { token, newPassword },
  });
}

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  app = await createTestApp();
  sender = app.get<PasswordResetSender>(PASSWORD_RESET_SENDER);
}, 60_000);

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  // password_reset_tokens xóa theo users (ON DELETE CASCADE).
  await cleanupIsolationFixture(client, fx);
  await app.close();
  await client.end();
});

describe('FR-AUTH-13 — quên mật khẩu qua email', () => {
  it('test_FR_AUTH_13_reset_password_end_to_end — chỉ lưu bản băm, dùng một lần, thu hồi phiên', async () => {
    const before = await login(app, fx.brandAdminAEmail, TEST_PASSWORD);

    const token = await requestToken(fx.brandAdminAEmail, '10.30.0.1');
    expect(token).toBeTruthy();
    const stored = await client.query<{ token_hash: string; used_at: Date | null }>(
      `SELECT t.token_hash, t.used_at FROM password_reset_tokens t
         JOIN users u ON u.id = t.user_id WHERE u.email = $1`,
      [fx.brandAdminAEmail],
    );
    expect(stored.rows[0]!.token_hash).toBe(createHash('sha256').update(token!).digest('hex'));
    expect(stored.rows[0]!.token_hash).not.toBe(token);

    const res = await reset(token!);
    expect(res.statusCode, res.body).toBe(204);

    // Mật khẩu mới đăng nhập được, mật khẩu cũ thì không, phiên cũ bị thu hồi.
    await expect(login(app, fx.brandAdminAEmail, NEW_PASSWORD)).resolves.toBeTruthy();
    const oldLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: fx.brandAdminAEmail, password: TEST_PASSWORD },
    });
    expect(oldLogin.statusCode).toBe(401);
    const refreshed = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: before.refreshToken },
    });
    expect(refreshed.statusCode).toBe(401);

    // Mã đã dùng không dùng lại được.
    const again = await reset(token!, 'MatKhauKhac#2026');
    expect(again.statusCode).toBe(400);
    expect(again.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

    const audit = await client.query(
      `SELECT 1 FROM audit_logs a JOIN users u ON u.id = a.target_id::uuid
        WHERE a.action = 'auth.password.reset' AND u.email = $1`,
      [fx.brandAdminAEmail],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('test_FR_AUTH_13_unknown_email_same_response_no_email', async () => {
    const token = await requestToken(`khong-ton-tai.${fx.runId}@test.local`, '10.30.0.2');
    expect(token).toBeNull();
  });

  it('test_FR_AUTH_13_disabled_account_cannot_reset', async () => {
    await client.query(`UPDATE users SET status = 'DISABLED' WHERE email = $1`, [
      fx.brandAdminBEmail,
    ]);
    try {
      expect(await requestToken(fx.brandAdminBEmail, '10.30.0.3')).toBeNull();
    } finally {
      await client.query(`UPDATE users SET status = 'ACTIVE' WHERE email = $1`, [
        fx.brandAdminBEmail,
      ]);
    }
  });

  it('test_FR_AUTH_13_invalid_payload_rejected', async () => {
    const shortPassword = await reset('x'.repeat(64), 'short');
    expect(shortPassword.statusCode).toBe(400);
    const badEmail = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email: 'not-an-email' },
    });
    expect(badEmail.statusCode).toBe(400);
  });
});
