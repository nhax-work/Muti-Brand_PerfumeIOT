/**
 * Đổi chế độ máy trên PostgreSQL thật (FR-MNT-05, 06, 17, FR-MCH-09; ADR-0015, ADR-0017 mục 6):
 *   - yêu cầu bảo trì → DRAINING, phục vụ nốt; máy rảnh thì DSP chuyển ngay sang MAINTENANCE;
 *   - đọc máy không đổi chế độ (bản cũ tự chuyển trong GET);
 *   - ép bảo trì: đơn chờ lượt FAILED + kiểm tra thủ công qua ORD, đơn đang có lệnh để DSP xử lý,
 *     đơn chờ thanh toán bị hủy link; cảnh báo, thông báo, nhật ký.
 */

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DspService } from '../../apps/api/src/modules/dsp/index.js';
import { asUser, createTestApp, login, reauth } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import { kioskFlow, useTestSigningKey } from './helpers/kiosk-flow.js';
import {
  cleanupIsolationFixture,
  releaseOpenOrders,
  seedIsolationFixture,
  seedPlatformStaff,
  TEST_PASSWORD,
  type IsolationFixture,
  type PlatformStaff,
} from './helpers/seed-isolation.js';

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let flow: ReturnType<typeof kioskFlow>;
let dsp: DspService;
let opsStaff: PlatformStaff;
let opsToken: string;
let ops: ReturnType<typeof asUser>;

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  useTestSigningKey();
  opsStaff = await seedPlatformStaff(client, fx, 'OPERATIONS_STAFF', [
    'machine.view',
    'machine.operate',
  ]);
  app = await createTestApp();
  flow = kioskFlow(app, client, fx);
  dsp = app.get(DspService);
  opsToken = (await login(app, opsStaff.email, TEST_PASSWORD)).accessToken;
  ops = asUser(app, opsToken);
}, 60_000);

afterEach(async () => {
  await client.query(
    `DELETE FROM dispense_results WHERE command_id IN
       (SELECT id FROM dispense_commands WHERE machine_id = $1)`,
    [fx.machineId],
  );
  await client.query(`DELETE FROM dispense_commands WHERE machine_id = $1`, [fx.machineId]);
  await releaseOpenOrders(client, fx.machineId);
  await client.query(
    `UPDATE orders SET status = 'FAILED' WHERE machine_id = $1 AND status IN ('PAID', 'DISPENSE_REQUESTED')`,
    [fx.machineId],
  );
  await client.query(`UPDATE machines SET operating_mode = 'NORMAL' WHERE id = $1`, [fx.machineId]);
  await client.query(`DELETE FROM alerts WHERE machine_id = $1`, [fx.machineId]);
});

afterAll(async () => {
  await flow.cleanup();
  await cleanupIsolationFixture(client, fx);
  await opsStaff.cleanup();
  await app.close();
  await client.end();
});

async function setMode(body: Record<string, unknown>, withReauth = true) {
  const headers: Record<string, string> = withReauth
    ? { 'x-reauth-token': await reauth(app, opsToken, TEST_PASSWORD) }
    : {};
  return ops('PUT', `/machines/${fx.machineId}/mode`, { payload: body, headers });
}

async function machine(): Promise<{ operatingMode: string; drainingOrdersCount?: number }> {
  const res = await ops('GET', `/machines/${fx.machineId}`);
  expect(res.statusCode, res.body).toBe(200);
  return res.json();
}

async function orderRow(id: string) {
  const res = await client.query<{
    status: string;
    failure_code: string | null;
    needs_manual_review: boolean;
  }>(`SELECT status, failure_code, needs_manual_review FROM orders WHERE id = $1`, [id]);
  return res.rows[0];
}

function kioskOrder(slotIndex: number) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/kiosk/orders',
    headers: { 'idempotency-key': crypto.randomUUID() },
    payload: { machineSerial: fx.machineSerial, slotId: fx.slots[slotIndex] },
  });
}

describe('Yêu cầu bảo trì qua DRAINING (FR-MNT-05, 06, FR-MCH-09)', () => {
  it('test_FR_MNT_05_enter_maintenance — máy rảnh: sang MAINTENANCE ngay, thông báo thương hiệu', async () => {
    await client.query(
      `DELETE FROM notifications WHERE type = 'MACHINE_MAINTENANCE' AND brand_id = ANY($1::uuid[])`,
      [[fx.brandA, fx.brandB]],
    );
    const res = await setMode({ operatingMode: 'MAINTENANCE', reason: 'Bảo trì định kỳ' });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ operatingMode: 'MAINTENANCE' });

    const history = await client.query<{ to_operating_mode: string }>(
      `SELECT to_operating_mode FROM machine_status_histories
        WHERE machine_id = $1 AND to_operating_mode IS NOT NULL ORDER BY occurred_at DESC LIMIT 2`,
      [fx.machineId],
    );
    expect(history.rows.map((r) => r.to_operating_mode)).toEqual(['MAINTENANCE', 'DRAINING']);

    const notified = await client.query<{ brand_id: string }>(
      `SELECT DISTINCT brand_id FROM notifications WHERE type = 'MACHINE_MAINTENANCE' AND reference_id IS NULL
          AND brand_id = ANY($1::uuid[])`,
      [[fx.brandA, fx.brandB]],
    );
    expect(notified.rows.map((r) => r.brand_id).sort()).toEqual([fx.brandA, fx.brandB].sort());

    // Yêu cầu bảo trì lần nữa: máy đã MAINTENANCE thì giữ nguyên, không lùi về DRAINING.
    const again = await setMode({ operatingMode: 'MAINTENANCE', reason: 'Bấm lại' });
    expect(again.json()).toMatchObject({ operatingMode: 'MAINTENANCE' });
    const latest = await client.query<{ to_operating_mode: string }>(
      `SELECT to_operating_mode FROM machine_status_histories
        WHERE machine_id = $1 AND to_operating_mode IS NOT NULL ORDER BY occurred_at DESC LIMIT 2`,
      [fx.machineId],
    );
    expect(latest.rows).toEqual(history.rows);
  });

  it('test_FR_MNT_05_drain_then_complete — còn đơn thì DRAINING, đọc máy không đổi chế độ, hết đơn thì DSP chuyển', async () => {
    const order = await flow.createOrder(0);
    const res = await setMode({ operatingMode: 'MAINTENANCE', reason: 'Thay vòi xịt' });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ operatingMode: 'DRAINING', drainingOrdersCount: 1 });

    // FR-MNT-06 AC1: DRAINING không nhận đơn mới.
    const blocked = await kioskOrder(2);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ code: 'MACHINE_IN_MAINTENANCE' });

    // Bản cũ chuyển chế độ ngay trong GET — đọc phải không có tác dụng phụ.
    await releaseOpenOrders(client, fx.machineId);
    expect((await machine()).operatingMode).toBe('DRAINING');
    expect((await machine()).drainingOrdersCount).toBe(0);
    expect((await orderRow(order.id))?.status).toBe('EXPIRED');

    expect(await dsp.completeDraining()).toBeGreaterThanOrEqual(1);
    expect((await machine()).operatingMode).toBe('MAINTENANCE');
  });

  it('test_FR_MNT_06_block_order_during_maintenance — MAINTENANCE không nhận đơn, NORMAL nhận lại', async () => {
    await setMode({ operatingMode: 'MAINTENANCE', reason: 'Bảo trì' });
    const blocked = await kioskOrder(0);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ code: 'MACHINE_IN_MAINTENANCE' });

    await setMode({ operatingMode: 'NORMAL' });
    const ok = await kioskOrder(0);
    expect(ok.statusCode, ok.body).toBe(201);
  });

  it('không đặt DRAINING trực tiếp được', async () => {
    const res = await setMode({ operatingMode: 'DRAINING' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('Ép bảo trì khẩn cấp (FR-MNT-17)', () => {
  it('test_FR_MNT_17_force_requires_reason_and_reauth — thiếu lý do REASON_REQUIRED, thiếu xác thực lại REAUTH_REQUIRED', async () => {
    const noReason = await setMode({ operatingMode: 'MAINTENANCE', force: true, reason: '  ' });
    expect(noReason.statusCode).toBe(400);
    expect(noReason.json()).toMatchObject({ code: 'REASON_REQUIRED' });

    const noReauth = await setMode(
      { operatingMode: 'MAINTENANCE', force: true, reason: 'Cháy' },
      false,
    );
    expect(noReauth.statusCode).toBe(403);
    expect(noReauth.json()).toMatchObject({ code: 'REAUTH_REQUIRED' });
    expect((await machine()).operatingMode).toBe('NORMAL');
  });

  it('test_FR_MNT_17_force_emergency_maintenance — đơn chờ lượt FAILED kiểm tra thủ công, đơn đang xịt để DSP xử lý', async () => {
    const inFlight = await flow.paidOrder(0);
    const queued = await flow.paidOrder(1);
    await dsp.armQueuedOrders();
    expect((await orderRow(inFlight.id))?.status).toBe('DISPENSE_REQUESTED');
    expect((await orderRow(queued.id))?.status).toBe('PAID');

    const res = await setMode({
      operatingMode: 'MAINTENANCE',
      force: true,
      reason: 'Rò rỉ dung dịch khẩn cấp',
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ operatingMode: 'MAINTENANCE' });

    expect(await orderRow(queued.id)).toEqual({
      status: 'FAILED',
      failure_code: 'FORCED_MAINTENANCE',
      needs_manual_review: true,
    });
    // Lệnh đã gửi: thiết bị có thể đang xịt — không đóng đơn thay thiết bị (FR-ORD-19).
    expect((await orderRow(inFlight.id))?.status).toBe('DISPENSE_REQUESTED');
    const history = await client.query(
      `SELECT actor_type FROM order_status_histories WHERE order_id = $1 AND to_status = 'FAILED'`,
      [queued.id],
    );
    expect(history.rows).toEqual([{ actor_type: 'SYSTEM' }]);

    const alerts = await client.query(
      `SELECT type, severity, description FROM alerts WHERE machine_id = $1`,
      [fx.machineId],
    );
    expect(alerts.rows).toEqual([
      { type: 'FORCED_MAINTENANCE', severity: 'HIGH', description: 'Rò rỉ dung dịch khẩn cấp' },
    ]);
    const audit = await client.query(
      `SELECT severity FROM audit_logs WHERE action = 'mch.machine.mode_changed' AND target_id = $1
        ORDER BY occurred_at DESC LIMIT 1`,
      [fx.machineId],
    );
    expect(audit.rows).toEqual([{ severity: 'HIGH' }]);
  });

  it('test_FR_MNT_17_force_cancels_unpaid_orders — đơn chờ thanh toán bị hủy link và EXPIRED', async () => {
    const pending = await flow.createOrder(2);
    const res = await setMode({ operatingMode: 'MAINTENANCE', force: true, reason: 'Mất điện' });
    expect(res.statusCode, res.body).toBe(200);

    expect((await orderRow(pending.id))?.status).toBe('EXPIRED');
    const history = await client.query(
      `SELECT reason, actor_type, actor_id FROM order_status_histories
        WHERE order_id = $1 AND to_status = 'EXPIRED'`,
      [pending.id],
    );
    expect(history.rows).toEqual([
      { reason: 'MACHINE_FORCED_MAINTENANCE', actor_type: 'USER', actor_id: opsStaff.userId },
    ]);
    const payments = await client.query(
      `SELECT status FROM payments WHERE order_id = $1 AND status = 'PENDING'`,
      [pending.id],
    );
    expect(payments.rowCount).toBe(0);
  });
});
