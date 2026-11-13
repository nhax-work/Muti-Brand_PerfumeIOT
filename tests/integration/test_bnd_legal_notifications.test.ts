/**
 * Thông báo quanh hồ sơ pháp nhân trên PostgreSQL thật (FR-BND-09, FR-BND-10, ADR-0013):
 *   - Brand Admin khai hồ sơ → người có `brand.manage` nhận thông báo chờ xác minh;
 *   - Super Admin xác minh → Brand Admin của thương hiệu nhận thông báo (trong ứng dụng và email),
 *     xác minh lại không báo lần hai.
 */

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestApp, login, reauth } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
  TEST_PASSWORD,
  type IsolationFixture,
} from './helpers/seed-isolation.js';

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let superToken: string;
let brandAToken: string;

interface NoticeRow {
  email: string;
  channel: string;
  content: string;
}

async function notices(type: string, brandId: string): Promise<NoticeRow[]> {
  const res = await client.query<NoticeRow>(
    `SELECT u.email, n.channel, n.content FROM notifications n
       JOIN users u ON u.id = n.recipient_user_id
      WHERE n.type = $1 AND n.brand_id = $2 ORDER BY u.email, n.channel`,
    [type, brandId],
  );
  return res.rows;
}

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  app = await createTestApp();
  superToken = (await login(app, fx.superAdminEmail, TEST_PASSWORD)).accessToken;
  brandAToken = (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken;
}, 60_000);

afterAll(async () => {
  // legal_verified_by trỏ tới Super Admin của fixture — gỡ trước khi xóa tài khoản.
  await client.query(
    `UPDATE brands SET legal_verified_at = NULL, legal_verified_by = NULL WHERE id = $1`,
    [fx.brandA],
  );
  await cleanupIsolationFixture(client, fx);
  await app.close();
  await client.end();
});

describe('Thông báo hồ sơ pháp nhân (FR-BND-09, FR-BND-10)', () => {
  it('test_FR_BND_09_legal_profile_notifies_brand_managers — báo người có brand.manage', async () => {
    const res = await asUser(app, brandAToken)('PUT', '/brands/me/legal-profile', {
      payload: { taxCode: '0312345678' },
    });
    expect(res.statusCode, res.body).toBe(200);

    const rows = await notices('BRAND_LEGAL_PROFILE_SUBMITTED', fx.brandA);
    const recipients = rows.map((r) => r.email);
    expect(recipients).toContain(fx.superAdminEmail);
    expect(recipients).not.toContain(fx.brandAdminAEmail);
    expect(recipients).not.toContain(fx.brandAdminBEmail);
    expect(rows.every((r) => r.channel === 'IN_APP')).toBe(true);
    expect(rows[0]!.content).toContain('0312345678');
  });

  it('test_FR_BND_10_verify_notifies_brand_admins_once — IN_APP + EMAIL, không báo lại', async () => {
    const call = asUser(app, superToken);
    const url = `/brands/${fx.brandA}/legal-verification`;
    const headers = async () => ({
      'x-reauth-token': await reauth(app, superToken, TEST_PASSWORD),
    });

    const first = await call('POST', url, { headers: await headers() });
    expect(first.statusCode, first.body).toBe(201);
    const again = await call('POST', url, { headers: await headers() });
    expect(again.statusCode).toBe(201);

    const rows = await notices('BRAND_LEGAL_VERIFIED', fx.brandA);
    expect(rows.map((r) => [r.email, r.channel])).toEqual([
      [fx.brandAdminAEmail, 'EMAIL'],
      [fx.brandAdminAEmail, 'IN_APP'],
    ]);
    const audit = await client.query(
      `SELECT 1 FROM audit_logs WHERE action = 'bnd.legal.verified' AND target_id = $1`,
      [fx.brandA],
    );
    expect(audit.rowCount).toBe(1);
  });
});
