/**
 * Integration test cho dừng bán an toàn phía ORD/DSP (ADR-0015, tuần 6, TV1) trên PostgreSQL thật:
 *   - FR-ORD-35: mỗi máy một đơn chờ thanh toán — code trả MACHINE_BUSY, và CSDL chặn cả khi hai yêu
 *     cầu tới cùng lúc (uq_machine_open_order).
 *   - FR-ORD-34: đơn đã trả tiền chờ lượt quá PAID_QUEUE_MAX_SEC → FAILED QUEUE_TIMEOUT, có bù sau
 *     downtime.
 *   - FR-ALR-04, FR-MCH-18: CONSECUTIVE_FAIL_ALERT lệnh lỗi liên tiếp trên một slot → cảnh báo, slot
 *     MAINTENANCE, AuditLog; khách không bấm thì cắt chuỗi; bật lại thì đếm lại từ đầu.
 * Từ chối trước ACK gắn cờ kiểm tra thủ công (FR-ORD-19) nằm ở test_dsp_dispatch.test.ts.
 *
 * Gọi thẳng `DspService` như test_dsp_dispatch — không cần broker.
 */

import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DspService, type DeviceResultInput } from '../../apps/api/src/modules/dsp/index.js';
import { SPEC_CONSTRAINTS } from '../../apps/api/src/shared/config/constraints.generated.js';
import { asUser, createTestApp, login } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import { kioskFlow, useTestSigningKey, type OrderBody } from './helpers/kiosk-flow.js';
import {
  cleanupIsolationFixture,
  releaseOpenOrders,
  seedIsolationFixture,
  TEST_PASSWORD,
  type IsolationFixture,
} from './helpers/seed-isolation.js';

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let dsp: DspService;
let flow: ReturnType<typeof kioskFlow>;

const QUEUE_MAX_SEC = SPEC_CONSTRAINTS.PAID_QUEUE_MAX_SEC;
const FAIL_THRESHOLD = SPEC_CONSTRAINTS.CONSECUTIVE_FAIL_ALERT;
const RESULT_TIMEOUT_SEC = SPEC_CONSTRAINTS.DISPENSE_RESULT_TIMEOUT_SEC;

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  useTestSigningKey();
  app = await createTestApp();
  dsp = app.get(DspService);
  flow = kioskFlow(app, client, fx);
}, 60_000);

beforeEach(async () => {
  await releaseOpenOrders(client, fx.machineId);
});

afterEach(async () => {
  // Như test_dsp_dispatch: máy rảnh, không còn lệnh để cộng dồn chuỗi lỗi sang test sau.
  await client.query(
    `DELETE FROM dispense_results WHERE command_id IN
       (SELECT id FROM dispense_commands WHERE machine_id = $1)`,
    [fx.machineId],
  );
  await client.query(`DELETE FROM dispense_commands WHERE machine_id = $1`, [fx.machineId]);
  await client.query(
    `UPDATE orders SET status = 'FAILED'
      WHERE machine_id = $1 AND status IN ('PENDING_PAYMENT', 'PAID', 'DISPENSE_REQUESTED')`,
    [fx.machineId],
  );
  await client.query(
    `UPDATE machine_slots SET status = 'AVAILABLE' WHERE machine_id = $1 AND status = 'MAINTENANCE'`,
    [fx.machineId],
  );
  await client.query(`DELETE FROM alerts WHERE machine_id = $1`, [fx.machineId]);
});

afterAll(async () => {
  await flow.cleanup();
  await cleanupIsolationFixture(client, fx);
  await app.close();
  await client.end();
});

// -------------------------------------------------------------------------------------
// Tiện ích
// -------------------------------------------------------------------------------------

function createOrderRequest(slotIndex: number) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/kiosk/orders',
    headers: { 'idempotency-key': randomUUID() },
    payload: { machineSerial: fx.machineSerial, slotId: fx.slots[slotIndex] },
  });
}

function cancelOrder(order: OrderBody) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/kiosk/orders/${order.id}/cancel`,
    payload: { machineSerial: fx.machineSerial },
  });
}

function report(
  commandToken: string,
  stage: DeviceResultInput['stage'],
  extra: Partial<DeviceResultInput> = {},
): DeviceResultInput {
  return { commandToken, stage, raw: { command_token: commandToken, stage }, ...extra };
}

function deliver(input: DeviceResultInput) {
  return dsp.handleDeviceResult(fx.machineSerial, input);
}

/** Đơn đã trả tiền ở slot → lệnh đã ghi và đã "publish" (SENT). Trả token lệnh. */
async function paidAndSent(slotIndex: number): Promise<{ order: OrderBody; token: string }> {
  const order = await flow.paidOrder(slotIndex);
  await dsp.armQueuedOrders();
  const { command_token: token } = await flow.commandOf(order.id);
  const message = (await dsp.listOutgoing()).find((m) => m.payload.command_token === token);
  expect(message).toBeDefined();
  await dsp.markSent(message!);
  return { order, token };
}

/** Ba kiểu kết thúc lỗi máy (FR-ALR-04) — mỗi lệnh khép trước khi mở lệnh kế. */
const failWith = {
  /** Đã bấm, cơ cấu hỏng. */
  async actuatorFault(slotIndex: number) {
    const { token } = await paidAndSent(slotIndex);
    await deliver(report(token, 'ACK'));
    await deliver(report(token, 'RESULT', { success: false, failureCode: 'ACTUATOR_FAULT' }));
  },
  /** Thiết bị từ chối ngay khi nhận lệnh — đèn chưa sáng. */
  async rejectBeforeAck(slotIndex: number) {
    const { token } = await paidAndSent(slotIndex);
    await deliver(report(token, 'REJECT', { failureCode: 'DOOR_OPEN' }));
  },
  /** Không nhận ACK đúng hạn → UNKNOWN khi quét. */
  async unknown(slotIndex: number) {
    const { token } = await paidAndSent(slotIndex);
    await client.query(
      `UPDATE dispense_commands SET sent_at = now() - make_interval(secs => $2)
        WHERE command_token = $1`,
      [token, RESULT_TIMEOUT_SEC + 1],
    );
    await dsp.sweepTimeouts();
  },
};

async function slotStatus(slotIndex: number): Promise<string> {
  const res = await client.query<{ status: string }>(
    `SELECT status FROM machine_slots WHERE id = $1`,
    [fx.slots[slotIndex]],
  );
  return res.rows[0]!.status;
}

async function failAlertsOf(slotIndex: number) {
  const res = await client.query<{ type: string; severity: string; status: string }>(
    `SELECT type, severity, status FROM alerts
      WHERE slot_id = $1 AND type = 'CONSECUTIVE_DISPENSE_FAILURES'`,
    [fx.slots[slotIndex]],
  );
  return res.rows;
}

// -------------------------------------------------------------------------------------
// FR-ORD-35 — mỗi máy một đơn chờ thanh toán
// -------------------------------------------------------------------------------------

describe('FR-ORD-35 — mỗi máy một đơn chờ thanh toán', () => {
  it('test_FR_ORD_35_second_order_rejected_while_qr_open — khách trước hủy thì khách sau tạo được', async () => {
    const first = await flow.createOrder(0);

    // Khách thứ hai chọn slot khác khi màn QR của khách trước còn mở → MACHINE_BUSY.
    const busy = await createOrderRequest(2);
    expect(busy.statusCode, busy.body).toBe(409);
    expect(busy.json<{ code: string }>().code).toBe('MACHINE_BUSY');

    // Khách trước rời màn QR, kiosk gọi hủy (FR-ORD-33) → máy nhận đơn mới.
    expect((await cancelOrder(first)).statusCode).toBe(200);
    const next = await createOrderRequest(2);
    expect(next.statusCode, next.body).toBe(201);
  });

  it('test_FR_ORD_35_overdue_open_order_expires_on_next_create — không phải chờ nhịp job', async () => {
    const stale = await flow.createOrder(0);
    // Khách bỏ đi, kiosk không kịp hủy, job hết hạn chưa chạy: đơn đã quá hạn nhưng vẫn PENDING_PAYMENT.
    await client.query(`UPDATE orders SET expires_at = now() - interval '1 second' WHERE id = $1`, [
      stale.id,
    ]);

    const next = await createOrderRequest(2);
    expect(next.statusCode, next.body).toBe(201);

    expect((await flow.orderRow(stale.id))?.status).toBe('EXPIRED');
    const history = await client.query<{ reason: string }>(
      `SELECT reason FROM order_status_histories WHERE order_id = $1 AND to_status = 'EXPIRED'`,
      [stale.id],
    );
    expect(history.rows.map((r) => r.reason)).toEqual(['ORDER_PAYMENT_TTL']);
    const payment = await client.query<{ status: string }>(
      `SELECT status FROM payments WHERE order_id = $1`,
      [stale.id],
    );
    expect(payment.rows[0]?.status).toBe('EXPIRED');
  });

  it('test_FR_ORD_35_concurrent_orders_only_one_created — CSDL chặn khi hai yêu cầu tới cùng lúc', async () => {
    const results = await Promise.all([createOrderRequest(0), createOrderRequest(2)]);
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes).toEqual([201, 409]);
    const loser = results.find((r) => r.statusCode === 409)!;
    expect(loser.json<{ code: string }>().code).toBe('MACHINE_BUSY');

    const open = await client.query(
      `SELECT id FROM orders WHERE machine_id = $1 AND status IN ('CREATED', 'PENDING_PAYMENT')`,
      [fx.machineId],
    );
    expect(open.rows).toHaveLength(1);
  });

  it('test_FR_ORD_35_db_rejects_second_open_order — uq_machine_open_order, không qua API', async () => {
    const first = await flow.createOrder(0);
    // Chép đơn đang mở sang một hàng mới cùng máy — CSDL phải từ chối dù code bỏ sót bước kiểm.
    await expect(
      client.query(
        `INSERT INTO orders (brand_id, slot_rental_id, revenue_owner, machine_id, slot_id,
                             fragrance_product_id, product_name_snapshot, amount, currency, status,
                             payment_reference, idempotency_key, expires_at)
         SELECT brand_id, slot_rental_id, revenue_owner, machine_id, slot_id, fragrance_product_id,
                product_name_snapshot, amount, currency, 'PENDING_PAYMENT', $2, $3, expires_at
           FROM orders WHERE id = $1`,
        [first.id, `DUP-${randomUUID()}`, `DUP-${randomUUID()}`],
      ),
    ).rejects.toMatchObject({ code: '23505', constraint: 'uq_machine_open_order' });
  });
});

// -------------------------------------------------------------------------------------
// FR-ORD-34 — chờ lượt tối đa
// -------------------------------------------------------------------------------------

describe('FR-ORD-34 — đơn đã trả tiền chờ lượt quá PAID_QUEUE_MAX_SEC', () => {
  async function setPaidAgo(orderId: string, seconds: number): Promise<void> {
    await client.query(
      `UPDATE orders SET paid_at = now() - make_interval(secs => $2) WHERE id = $1`,
      [orderId, seconds],
    );
  }

  it('test_FR_ORD_34_queue_timeout_fails_paid_order — FAILED, QUEUE_TIMEOUT, kiểm tra thủ công', async () => {
    const waiting = await flow.paidOrder(0);
    const fresh = await flow.paidOrder(2);
    await setPaidAgo(waiting.id, QUEUE_MAX_SEC + 1);
    await setPaidAgo(fresh.id, QUEUE_MAX_SEC - 30);

    expect(await dsp.failQueueTimeouts()).toBe(1);

    expect(await flow.orderRow(waiting.id)).toEqual({
      status: 'FAILED',
      failure_code: 'QUEUE_TIMEOUT',
      needs_manual_review: true,
    });
    expect(await flow.commandsOf(waiting.id)).toHaveLength(0);
    // Đơn chưa quá hạn vẫn chờ lượt.
    expect((await flow.orderRow(fresh.id))?.status).toBe('PAID');

    // Kiosk thấy mã thất bại để hiện màn sự cố, kèm mã tham chiếu cho khách (FR-ORD-21).
    const view = (
      await app.inject({ method: 'GET', url: `/api/v1/kiosk/orders/${waiting.id}/status` })
    ).json<{ status: string; failureCode: string; supportReference: string | null }>();
    expect(view).toMatchObject({ status: 'FAILED', failureCode: 'QUEUE_TIMEOUT' });
    expect(view.supportReference).toBe(waiting.paymentReference);

    // Lịch sử ghi lý do (FR-ORD-18).
    const history = await client.query<{ from_status: string; reason: string; actor_type: string }>(
      `SELECT from_status, reason, actor_type FROM order_status_histories
        WHERE order_id = $1 AND to_status = 'FAILED'`,
      [waiting.id],
    );
    expect(history.rows).toEqual([
      { from_status: 'PAID', reason: 'QUEUE_TIMEOUT', actor_type: 'SYSTEM' },
    ]);
  });

  it('test_FR_ORD_34_catch_up_after_downtime — đơn lỡ trong lúc hệ thống ngừng vẫn bị xử lý', async () => {
    const stuck = await flow.paidOrder(0);
    // Scheduler ngừng một giờ: không có nhịp nào chạy đúng mốc 180 giây.
    await setPaidAgo(stuck.id, 3600);

    await dsp.failQueueTimeouts();
    expect(await flow.orderRow(stuck.id)).toMatchObject({
      status: 'FAILED',
      failure_code: 'QUEUE_TIMEOUT',
    });
    // Không ghi lệnh cho đơn đã FAILED.
    await dsp.armQueuedOrders();
    expect(await flow.commandsOf(stuck.id)).toHaveLength(0);
  });

  it('test_FR_ORD_34_armed_order_not_timed_out — đơn đã sáng đèn không bị job đụng tới', async () => {
    const { order } = await paidAndSent(0);
    await setPaidAgo(order.id, QUEUE_MAX_SEC + 60);

    expect(await dsp.failQueueTimeouts()).toBe(0);
    expect((await flow.orderRow(order.id))?.status).toBe('DISPENSE_REQUESTED');
  });
});

// -------------------------------------------------------------------------------------
// FR-ALR-04, FR-MCH-18 — lỗi liên tiếp tự tắt slot
// -------------------------------------------------------------------------------------

describe('FR-ALR-04, FR-MCH-18 — lỗi liên tiếp trên một slot', () => {
  it('test_FR_ALR_04_three_failed_dispenses — cảnh báo và slot tự MAINTENANCE ở lỗi thứ ba', async () => {
    expect(FAIL_THRESHOLD).toBe(3);

    await failWith.actuatorFault(0);
    await failWith.rejectBeforeAck(0);
    // AC2: chưa đủ ngưỡng → chưa cảnh báo, slot vẫn bán.
    expect(await failAlertsOf(0)).toHaveLength(0);
    expect(await slotStatus(0)).toBe('AVAILABLE');

    // AC1: lỗi thứ ba (UNKNOWN) → cảnh báo + slot MAINTENANCE.
    await failWith.unknown(0);
    expect(await failAlertsOf(0)).toEqual([
      { type: 'CONSECUTIVE_DISPENSE_FAILURES', severity: 'HIGH', status: 'OPEN' },
    ]);
    expect(await slotStatus(0)).toBe('MAINTENANCE');

    // FR-MCH-18: ghi AuditLog cho thay đổi do hệ thống.
    const audit = await client.query<{ actor_type: string; after_data: { status: string } }>(
      `SELECT actor_type, after_data FROM audit_logs
        WHERE action = 'dsp.slot.auto_maintenance' AND target_id = $1
        ORDER BY occurred_at DESC LIMIT 1`,
      [fx.slots[0]],
    );
    expect(audit.rows[0]).toMatchObject({
      actor_type: 'SYSTEM',
      after_data: { status: 'MAINTENANCE' },
    });

    // Slot không còn bán: khách chọn slot đó bị từ chối, slot khác trên máy vẫn bán.
    const blocked = await createOrderRequest(0);
    expect(blocked.json<{ code: string }>().code).toBe('SLOT_UNAVAILABLE');
    expect((await createOrderRequest(2)).statusCode).toBe(201);
  });

  it('test_FR_ALR_04_press_timeout_breaks_streak — khách không bấm không phải lỗi máy', async () => {
    await failWith.actuatorFault(0);
    await failWith.rejectBeforeAck(0);
    // Đèn sáng, khách không bấm → FORFEITED: máy vẫn chạy đúng, chuỗi lỗi bị cắt.
    const { token } = await paidAndSent(0);
    await deliver(report(token, 'ACK'));
    await deliver(report(token, 'REJECT', { failureCode: 'PRESS_TIMEOUT' }));
    await failWith.actuatorFault(0);

    expect(await failAlertsOf(0)).toHaveLength(0);
    expect(await slotStatus(0)).toBe('AVAILABLE');
  });

  it('test_FR_MCH_18_reenabled_slot_counts_streak_from_zero — bật lại sau kiểm tra', async () => {
    for (const fail of [failWith.actuatorFault, failWith.actuatorFault, failWith.actuatorFault]) {
      await fail(1);
    }
    expect(await slotStatus(1)).toBe('MAINTENANCE');

    // Operations Staff bật lại sau khi kiểm tra (FR-MCH-12).
    const admin = asUser(app, (await login(app, fx.superAdminEmail, TEST_PASSWORD)).accessToken);
    const res = await admin('PUT', `/slots/${fx.slots[1]}/enabled`, {
      payload: { enabled: true, reason: 'Đã thay bơm' },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(await slotStatus(1)).toBe('AVAILABLE');
    await client.query(`DELETE FROM alerts WHERE slot_id = $1`, [fx.slots[1]]);

    // Ba lỗi cũ không tính nữa: một lỗi mới chưa làm slot tắt lại.
    await failWith.actuatorFault(1);
    expect(await slotStatus(1)).toBe('AVAILABLE');
    expect(await failAlertsOf(1)).toHaveLength(0);
  });
});

// -------------------------------------------------------------------------------------
// Chốt chặn "máy dừng nhận đơn" và DRAINING (ADR-0015 mục 6, 7 — tuần 7)
// Chế độ DRAINING và phiếu nạp đặt thẳng vào CSDL: API đổi chế độ (TV4) và phiếu nạp (INV) chưa có.
// -------------------------------------------------------------------------------------

describe('FR-MNT-05, FR-MNT-06, FR-INV-30 — máy dừng nhận đơn', () => {
  afterEach(async () => {
    await client.query(`DELETE FROM refill_sessions WHERE machine_id = $1`, [fx.machineId]);
    await client.query(`UPDATE machines SET operating_mode = 'NORMAL' WHERE id = $1`, [
      fx.machineId,
    ]);
    await client.query(
      `DELETE FROM notifications WHERE type = 'MACHINE_MAINTENANCE'
                         AND brand_id = ANY($1::uuid[])`,
      [[fx.brandA, fx.brandB]],
    );
  });

  async function setMode(mode: 'NORMAL' | 'DRAINING' | 'MAINTENANCE') {
    await client.query(`UPDATE machines SET operating_mode = $2 WHERE id = $1`, [
      fx.machineId,
      mode,
    ]);
  }

  async function machineMode(): Promise<string> {
    const res = await client.query<{ operating_mode: string }>(
      `SELECT operating_mode FROM machines WHERE id = $1`,
      [fx.machineId],
    );
    return res.rows[0]!.operating_mode;
  }

  async function openRefillSession(): Promise<void> {
    await client.query(
      `INSERT INTO refill_sessions (brand_id, machine_id, slot_id, performed_by, status)
       VALUES ($1, $2, $3, $4, 'STARTED')`,
      [fx.brandA, fx.machineId, fx.slots[0], fx.superAdminId],
    );
  }

  it('test_FR_MNT_06_block_order_during_maintenance — DRAINING và MAINTENANCE đều từ chối đơn mới', async () => {
    for (const mode of ['DRAINING', 'MAINTENANCE'] as const) {
      await setMode(mode);
      const res = await createOrderRequest(0);
      expect(res.statusCode, mode).toBe(409);
      expect(res.json<{ code: string }>().code, mode).toBe('MACHINE_IN_MAINTENANCE');
    }
    await setMode('NORMAL');
    expect((await createOrderRequest(0)).statusCode).toBe(201);
  });

  it('test_FR_INV_30_open_refill_session_blocks_orders_and_arming — cả máy dừng, đóng phiếu thì bán lại', async () => {
    const queued = await flow.paidOrder(1);
    await openRefillSession();

    const res = await createOrderRequest(2);
    expect(res.statusCode).toBe(409);
    expect(res.json<{ code: string }>().code).toBe('MACHINE_IN_MAINTENANCE');

    // Đơn đã trả tiền không được sáng đèn khi cửa đang mở.
    await dsp.armQueuedOrders();
    expect(await flow.commandsOf(queued.id)).toHaveLength(0);
    expect((await flow.orderRow(queued.id))?.status).toBe('PAID');

    await client.query(
      `UPDATE refill_sessions SET status = 'COMPLETED', completed_at = now() WHERE machine_id = $1`,
      [fx.machineId],
    );
    await dsp.armQueuedOrders();
    expect(await flow.commandsOf(queued.id)).toHaveLength(1);
  });

  it('test_FR_MNT_05_draining_serves_paid_queue_then_enters_maintenance', async () => {
    const order = await flow.paidOrder(0);
    await setMode('DRAINING');

    // DRAINING vẫn ghi lệnh cho đơn đã trả tiền (ADR-0015 mục 7) — không để đơn chết vì QUEUE_TIMEOUT.
    await dsp.armQueuedOrders();
    const { command_token: token } = await flow.commandOf(order.id);
    expect(await dsp.completeDraining()).toBe(0);
    expect(await machineMode()).toBe('DRAINING');

    const message = (await dsp.listOutgoing()).find((m) => m.payload.command_token === token);
    await dsp.markSent(message!);
    await deliver(report(token, 'ACK'));
    await deliver(report(token, 'RESULT', { success: true }));
    expect((await flow.orderRow(order.id))?.status).toBe('DISPENSED');

    expect(await dsp.completeDraining()).toBe(1);
    expect(await machineMode()).toBe('MAINTENANCE');

    const history = await client.query<{ source: string; reason: string }>(
      `SELECT source, reason FROM machine_status_histories
        WHERE machine_id = $1 AND from_operating_mode = 'DRAINING'
          AND to_operating_mode = 'MAINTENANCE'`,
      [fx.machineId],
    );
    expect(history.rows).toEqual([{ source: 'SYSTEM', reason: 'DRAINING_COMPLETED' }]);

    // FR-MNT-07: Brand Admin của cả hai thương hiệu có slot trên máy được báo.
    const notified = await client.query<{ brand_id: string }>(
      `SELECT DISTINCT brand_id FROM notifications
        WHERE type = 'MACHINE_MAINTENANCE' AND brand_id = ANY($1::uuid[])`,
      [[fx.brandA, fx.brandB]],
    );
    expect(notified.rows.map((r) => r.brand_id).sort()).toEqual([fx.brandA, fx.brandB].sort());

    const audit = await client.query(
      `SELECT 1 FROM audit_logs WHERE action = 'dsp.machine.draining_completed' AND target_id = $1`,
      [fx.machineId],
    );
    expect(audit.rowCount).toBeGreaterThanOrEqual(1);
    await client.query(
      `DELETE FROM machine_status_histories WHERE machine_id = $1 AND source = 'SYSTEM'`,
      [fx.machineId],
    );
  });

  it('test_FR_MNT_05_pending_payment_order_keeps_machine_draining — khách còn ở màn QR', async () => {
    const pending = await createOrderRequest(0);
    expect(pending.statusCode).toBe(201);
    await setMode('DRAINING');
    expect(await dsp.completeDraining()).toBe(0);
    expect(await machineMode()).toBe('DRAINING');
  });

  it('test_FR_MNT_05_draining_idle_machine_enters_maintenance_immediately — kể cả nhịp đầu sau downtime', async () => {
    await setMode('DRAINING');
    expect(await dsp.completeDraining()).toBe(1);
    expect(await machineMode()).toBe('MAINTENANCE');
    // Chạy lại không đổi gì thêm.
    expect(await dsp.completeDraining()).toBe(0);
    await client.query(
      `DELETE FROM machine_status_histories WHERE machine_id = $1 AND source = 'SYSTEM'`,
      [fx.machineId],
    );
  });
});
