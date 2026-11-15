/**
 * Thông báo phiếu trả hàng cho Brand Admin trên PostgreSQL thật (FR-EXP-26, 28, FR-ALR-16 AC1):
 *   - sự kiện 7: lập phiếu trả hàng → hàng trả về sẵn sàng;
 *   - sự kiện 5: còn 3 ngày tới hạn bàn giao → nhắc đúng một lần, không nhắc hạn đã qua;
 *   - sự kiện 6: quá hạn → chai chuyển sở hữu sang nền tảng và báo thanh lý đúng một lần.
 * Mỗi sự kiện xếp một IN_APP (đã giao) và một EMAIL (PENDING) cho mỗi Brand Admin ACTIVE, chỉ của
 * thương hiệu sở hữu phiếu.
 */

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ExpService } from '../../apps/api/src/modules/exp/index.js';
import { asUser, createTestApp, login } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
  seedPlatformStaff,
  TEST_PASSWORD,
  type IsolationFixture,
  type PlatformStaff,
} from './helpers/seed-isolation.js';

const DAY_MS = 24 * 60 * 60 * 1000;

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let exp: ExpService;
let staff: PlatformStaff;
let brandAdminAId: string;
let brandAdminBId: string;
let returnId: string;

interface NotificationRow {
  recipient_user_id: string;
  channel: string;
  status: string;
  subject: string;
  content: string;
}

async function notificationsOf(type: string): Promise<NotificationRow[]> {
  const res = await client.query<NotificationRow>(
    `SELECT recipient_user_id, channel, status, subject, content FROM notifications
      WHERE type = $1 AND reference_id = $2 ORDER BY channel`,
    [type, returnId],
  );
  return res.rows;
}

async function userIdOf(email: string): Promise<string> {
  const res = await client.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email]);
  return res.rows[0]!.id;
}

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  staff = await seedPlatformStaff(client, fx, 'INVENTORY_STAFF', ['inventory.manage']);
  app = await createTestApp();
  exp = app.get(ExpService);
  brandAdminAId = await userIdOf(fx.brandAdminAEmail);
  brandAdminBId = await userIdOf(fx.brandAdminBEmail);
  // Hóa đơn slot 1 của A đã báo không gia hạn — điều kiện lập phiếu trả hàng (FR-EXP-26).
  await client.query(
    `UPDATE slot_rentals SET non_renewal_requested_at = now(), non_renewal_requested_by = $2,
                             return_method = 'WAREHOUSE_PICKUP'
      WHERE id = $1`,
    [fx.rentals[0], brandAdminAId],
  );
}, 60_000);

afterAll(async () => {
  // Phiếu trả hàng trỏ tới người lập (created_by) — xóa fixture trước rồi mới xóa nhân viên kho.
  await cleanupIsolationFixture(client, fx);
  await staff?.cleanup();
  await app.close();
  await client.end();
});

describe('FR-ALR-16 AC1 — thông báo phiếu trả hàng', () => {
  it('test_FR_EXP_26_bottle_return_ready_notifies_brand_admins — sự kiện 7, IN_APP + EMAIL', async () => {
    const token = (await login(app, staff.email, TEST_PASSWORD)).accessToken;
    const res = await asUser(app, token)('POST', '/bottle-returns', {
      payload: { slotRentalId: fx.rentals[0], bottles: [{ bottleId: fx.bottles[0] }] },
    });
    expect(res.statusCode).toBe(201);
    returnId = res.json<{ id: string }>().id;

    const rows = await notificationsOf('BOTTLE_RETURN_READY');
    expect(rows.map((r) => [r.recipient_user_id, r.channel, r.status])).toEqual([
      [brandAdminAId, 'EMAIL', 'PENDING'],
      [brandAdminAId, 'IN_APP', 'SENT'],
    ]);
    expect(rows.some((r) => r.recipient_user_id === brandAdminBId)).toBe(false);
    // Hóa đơn của fixture chưa có số hóa đơn — thông báo dùng mã hóa đơn thay.
    expect(rows[0]!.subject).toContain(fx.rentals[0]!);
    expect(rows[0]!.content).toContain('1 chai');
    expect(rows[0]!.content).toContain('Nhận tại kho');
  });

  it('test_FR_EXP_28_reminder_sent_once — sự kiện 5, nhắc một lần khi còn dưới 3 ngày', async () => {
    await client.query(
      `UPDATE bottle_returns SET pickup_deadline = now() + interval '2 days' WHERE id = $1`,
      [returnId],
    );

    await exp.sendExpiringReminders();
    await exp.sendExpiringReminders();

    const rows = await notificationsOf('BOTTLE_RETURN_REMINDER');
    expect(rows.map((r) => r.channel)).toEqual(['EMAIL', 'IN_APP']);
    expect(rows.every((r) => r.recipient_user_id === brandAdminAId)).toBe(true);
    const marked = await client.query<{ reminder_sent_at: Date | null }>(
      `SELECT reminder_sent_at FROM bottle_returns WHERE id = $1`,
      [returnId],
    );
    expect(marked.rows[0]!.reminder_sent_at).not.toBeNull();
  });

  it('test_FR_EXP_28_no_reminder_after_deadline — hạn đã qua thì không nhắc nữa', async () => {
    await client.query(
      `DELETE FROM notifications WHERE type = 'BOTTLE_RETURN_REMINDER' AND reference_id = $1`,
      [returnId],
    );
    await client.query(
      // CHECK chk_bottle_return_deadline: hạn phải sau lúc sẵn sàng — lùi cả hai mốc.
      `UPDATE bottle_returns SET reminder_sent_at = NULL, ready_at = $3, pickup_deadline = $2
        WHERE id = $1`,
      [returnId, new Date(Date.now() - DAY_MS), new Date(Date.now() - 10 * DAY_MS)],
    );

    await exp.sendExpiringReminders();

    expect(await notificationsOf('BOTTLE_RETURN_REMINDER')).toEqual([]);
  });

  it('test_FR_EXP_28_forfeit_notifies_once — sự kiện 6, chai về nền tảng và báo một lần', async () => {
    await exp.sweepOverdueForfeitures();
    await exp.sweepOverdueForfeitures();

    const bottle = await client.query<{ owner: string; status: string }>(
      `SELECT owner, status FROM bottles WHERE id = $1`,
      [fx.bottles[0]],
    );
    expect(bottle.rows[0]).toEqual({ owner: 'PLATFORM', status: 'LIQUIDATED' });

    const rows = await notificationsOf('BOTTLE_RETURN_FORFEITED');
    expect(rows.map((r) => [r.recipient_user_id, r.channel])).toEqual([
      [brandAdminAId, 'EMAIL'],
      [brandAdminAId, 'IN_APP'],
    ]);
    const audit = await client.query(
      `SELECT 1 FROM audit_logs WHERE action = 'exp.bottle_return.forfeited' AND target_id = $1`,
      [returnId],
    );
    expect(audit.rowCount).toBe(1);
  });
});
