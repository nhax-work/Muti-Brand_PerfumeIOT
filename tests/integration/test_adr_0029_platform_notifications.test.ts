/**
 * Thông báo cho nhân sự nền tảng không gắn thương hiệu trên PostgreSQL thật (ADR-0029):
 *   - phân công cảnh báo mức máy → người được giao nhận ALERT_ASSIGNED, brand_id NULL;
 *   - phân công phiếu bảo trì → người được giao nhận MAINTENANCE_TICKET_ASSIGNED, brand_id NULL;
 *   - tự giao cho mình hay giao lại cùng người thì không báo.
 */

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AlrService } from '../../apps/api/src/modules/alr/index.js';
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

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let alr: AlrService;
let staff: PlatformStaff;
let superAdmin: ReturnType<typeof asUser>;
let asStaff: ReturnType<typeof asUser>;

interface NoticeRow {
  brand_id: string | null;
  recipient_user_id: string;
  channel: string;
  content: string;
}

async function notices(type: string, referenceId: string): Promise<NoticeRow[]> {
  const res = await client.query<NoticeRow>(
    `SELECT brand_id, recipient_user_id, channel, content FROM notifications
      WHERE type = $1 AND reference_id = $2`,
    [type, referenceId],
  );
  return res.rows;
}

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  staff = await seedPlatformStaff(client, fx, 'OPERATIONS_STAFF', [
    'alert.handle',
    'maintenance.handle',
  ]);
  app = await createTestApp();
  alr = app.get(AlrService);
  superAdmin = asUser(app, (await login(app, fx.superAdminEmail, TEST_PASSWORD)).accessToken);
  asStaff = asUser(app, (await login(app, staff.email, TEST_PASSWORD)).accessToken);
}, 60_000);

afterAll(async () => {
  await client.query(
    `DELETE FROM maintenance_activities WHERE ticket_id IN
       (SELECT id FROM maintenance_tickets WHERE machine_id = $1)`,
    [fx.machineId],
  );
  await client.query(`DELETE FROM maintenance_tickets WHERE machine_id = $1`, [fx.machineId]);
  await client.query(
    `DELETE FROM notifications WHERE brand_id IS NULL AND recipient_user_id = $1`,
    [staff.userId],
  );
  await cleanupIsolationFixture(client, fx);
  await staff.cleanup();
  await app.close();
  await client.end();
});

describe('ADR-0029 — thông báo phân công cho nhân sự nền tảng', () => {
  it('test_FR_ALR_11_assign_machine_alert_notifies_assignee — cảnh báo mức máy, brand_id NULL', async () => {
    await alr.raiseAlert({
      machineId: fx.machineId,
      type: 'SENSOR_FAULT',
      severity: 'HIGH',
      deduplicationKey: `ASSIGN_NOTICE:${fx.runId}`,
      title: 'Cảm biến nhiệt lỗi',
    });
    const alert = await client.query<{ id: string }>(
      `SELECT id FROM alerts WHERE deduplication_key = $1`,
      [`ASSIGN_NOTICE:${fx.runId}`],
    );
    const alertId = alert.rows[0]!.id;

    const res = await superAdmin('POST', `/alerts/${alertId}/assign`, {
      payload: { assignedTo: staff.userId },
    });
    expect(res.statusCode, res.body).toBe(200);
    // Giao lại cùng người: không báo lần hai.
    await superAdmin('POST', `/alerts/${alertId}/assign`, {
      payload: { assignedTo: staff.userId },
    });

    const rows = await notices('ALERT_ASSIGNED', alertId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      brand_id: null,
      recipient_user_id: staff.userId,
      channel: 'IN_APP',
    });
    expect(rows[0]!.content).toContain('Cảm biến nhiệt lỗi');

    // Người nhận thấy thông báo nội bộ trong chuông của mình (ADR-0028).
    const bell = await asStaff('GET', '/notifications?mine=true');
    expect(bell.statusCode).toBe(200);
    expect(bell.json<{ items: { type: string; brandId: string | null }[] }>().items).toContainEqual(
      expect.objectContaining({ type: 'ALERT_ASSIGNED', brandId: null }),
    );
  });

  it('test_FR_ALR_11_self_assign_not_notified — tự nhận cảnh báo không tự báo mình', async () => {
    await alr.raiseAlert({
      machineId: fx.machineId,
      type: 'SENSOR_FAULT',
      severity: 'WARNING',
      deduplicationKey: `SELF_ASSIGN:${fx.runId}`,
      title: 'Cảm biến độ ẩm lỗi',
    });
    const alert = await client.query<{ id: string }>(
      `SELECT id FROM alerts WHERE deduplication_key = $1`,
      [`SELF_ASSIGN:${fx.runId}`],
    );
    const alertId = alert.rows[0]!.id;

    const res = await asStaff('POST', `/alerts/${alertId}/assign`, {
      payload: { assignedTo: staff.userId },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(await notices('ALERT_ASSIGNED', alertId)).toEqual([]);
  });

  it('test_FR_MNT_02_assign_ticket_notifies_assignee — phiếu bảo trì, brand_id NULL', async () => {
    const created = await superAdmin('POST', '/maintenance-tickets', {
      payload: {
        machineId: fx.machineId,
        category: 'PUMP',
        severity: 'HIGH',
        priority: 'HIGH',
        dueAt: '2027-01-15T03:00:00.000Z',
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const ticket = created.json<{ id: string; ticketNumber: string }>();

    const res = await superAdmin('POST', `/maintenance-tickets/${ticket.id}/assign`, {
      payload: { assignedTo: staff.userId },
    });
    expect(res.statusCode, res.body).toBe(200);

    const rows = await notices('MAINTENANCE_TICKET_ASSIGNED', ticket.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ brand_id: null, recipient_user_id: staff.userId });
    expect(rows[0]!.content).toContain(ticket.ticketNumber);
    expect(rows[0]!.content).toContain('15/01/2027');
  });
});
