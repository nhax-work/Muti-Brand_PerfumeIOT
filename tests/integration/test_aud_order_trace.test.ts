/**
 * Truy vết đầu-cuối một đơn (FR-AUD-11) trên PostgreSQL thật. Đơn đi hết luồng thật: kiosk tạo đơn →
 * webhook có chữ ký → DSP ghi lệnh → thiết bị ACK → RESULT — rồi truy vết phải thấy đủ từng mắt xích.
 */

import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DspService } from '../../apps/api/src/modules/dsp/index.js';
import { asUser, createTestApp, login } from './helpers/app.js';
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

interface Trace {
  order: { id: string; status: string; slotRentalId: string };
  slotRental: { id: string; brandId: string };
  statusHistory: { fromStatus: string | null; toStatus: string; occurredAt: string }[];
  payments: { id: string; orderId: string; status: string; amount: string }[];
  dispenseCommands: {
    id: string;
    status: string;
    commandType: string;
    result: { success: boolean; executedAt: string | null } | null;
  }[];
  inventoryAdjustments: { id: string; reason: string }[];
  auditLogs: { action: string; targetId: string | null; occurredAt: string }[];
}

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let flow: ReturnType<typeof kioskFlow>;
let dsp: DspService;
let ops: PlatformStaff;
let superAdmin: ReturnType<typeof asUser>;
let opsUser: ReturnType<typeof asUser>;
let brandA: ReturnType<typeof asUser>;
let dispensedOrderId: string;

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  useTestSigningKey();
  ops = await seedPlatformStaff(client, fx, 'OPERATIONS_STAFF', ['order.view', 'order.refund']);
  app = await createTestApp();
  dsp = app.get(DspService);
  flow = kioskFlow(app, client, fx);
  superAdmin = asUser(app, (await login(app, fx.superAdminEmail, TEST_PASSWORD)).accessToken);
  opsUser = asUser(app, (await login(app, ops.email, TEST_PASSWORD)).accessToken);
  brandA = asUser(app, (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken);

  // Luồng thật tới DISPENSED.
  const order = await flow.paidOrder(0);
  await dsp.armQueuedOrders();
  const { command_token: token } = await flow.commandOf(order.id);
  const message = (await dsp.listOutgoing()).find((m) => m.payload.command_token === token);
  await dsp.markSent(message!);
  await dsp.handleDeviceResult(fx.machineSerial, {
    commandToken: token,
    stage: 'ACK',
    raw: { command_token: token, stage: 'ACK' },
  });
  await dsp.handleDeviceResult(fx.machineSerial, {
    commandToken: token,
    stage: 'RESULT',
    success: true,
    executedAt: new Date(),
    raw: { command_token: token, stage: 'RESULT' },
  });
  expect((await flow.orderRow(order.id))?.status).toBe('DISPENSED');
  dispensedOrderId = order.id;

  // Điều chỉnh tồn kho trên slot của đơn, sau khi đơn được tạo.
  await client.query(
    `INSERT INTO inventory_adjustments (brand_id, bottle_id, slot_id, before_quantity_ml,
                                        after_quantity_ml, difference_ml, reason, adjusted_by)
     VALUES ($1, $2, $3, 48, 47.88, -0.12, 'Đối soát sau lượt xịt', $4)`,
    [fx.brandA, fx.bottles[0], fx.slots[0], fx.superAdminId],
  );
}, 60_000);

afterAll(async () => {
  await releaseOpenOrders(client, fx.machineId);
  await flow.cleanup();
  await cleanupIsolationFixture(client, fx);
  await ops.cleanup();
  await client.end();
  await app.close();
});

describe('Truy vết đơn hàng (FR-AUD-11)', () => {
  it('test_FR_AUD_11_order_trace — đơn đã xịt: thanh toán, lệnh kèm kết quả, lịch sử, tồn kho, hóa đơn, nhật ký (AC1)', async () => {
    const res = await superAdmin('GET', `/audit-logs/order-trace/${dispensedOrderId}`);
    expect(res.statusCode, res.body).toBe(200);
    const trace = res.json<Trace>();

    expect(trace.order).toMatchObject({ id: dispensedOrderId, status: 'DISPENSED' });
    expect(trace.slotRental).toMatchObject({ id: fx.rentals[0], brandId: fx.brandA });

    expect(trace.payments).toHaveLength(1);
    expect(trace.payments[0]).toMatchObject({ orderId: dispensedOrderId, status: 'SUCCEEDED' });

    expect(trace.dispenseCommands).toHaveLength(1);
    expect(trace.dispenseCommands[0]).toMatchObject({
      commandType: 'CUSTOMER',
      status: 'SUCCEEDED',
      result: { success: true },
    });

    // Lịch sử đi đúng thứ tự thời gian và kết thúc ở DISPENSED.
    const statuses = trace.statusHistory.map((h) => h.toStatus);
    expect(statuses.at(-1)).toBe('DISPENSED');
    expect(statuses).toEqual(expect.arrayContaining(['PAID', 'DISPENSE_REQUESTED', 'DISPENSED']));
    const times = trace.statusHistory.map((h) => h.occurredAt);
    expect([...times].sort()).toEqual(times);

    expect(trace.inventoryAdjustments.map((a) => a.reason)).toEqual(['Đối soát sau lượt xịt']);

    // Nhật ký chỉ của đơn, thanh toán, lệnh — theo thời gian tăng dần.
    const targets = new Set([
      dispensedOrderId,
      trace.payments[0]!.id,
      trace.dispenseCommands[0]!.id,
    ]);
    expect(trace.auditLogs.length).toBeGreaterThan(0);
    expect(trace.auditLogs.every((l) => l.targetId !== null && targets.has(l.targetId))).toBe(true);
    const logTimes = trace.auditLogs.map((l) => l.occurredAt);
    expect([...logTimes].sort()).toEqual(logTimes);
  });

  it('test_FR_AUD_11_order_trace — đơn chưa thanh toán: lệnh xịt và điều chỉnh tồn kho rỗng, không lỗi (AC2)', async () => {
    const order = await flow.createOrder(1);
    try {
      const res = await superAdmin('GET', `/audit-logs/order-trace/${order.id}`);
      expect(res.statusCode, res.body).toBe(200);
      const trace = res.json<Trace>();
      expect(trace.order.status).toBe('PENDING_PAYMENT');
      expect(trace.dispenseCommands).toEqual([]);
      expect(trace.inventoryAdjustments).toEqual([]);
      expect(trace.payments).toHaveLength(1);
    } finally {
      await releaseOpenOrders(client, fx.machineId);
    }
  });

  it('test_FR_AUD_11_order_trace — đơn không tồn tại NOT_FOUND; không có audit.read thì FORBIDDEN_SCOPE (AC3, AC4)', async () => {
    const missing = await superAdmin('GET', `/audit-logs/order-trace/${randomUUID()}`);
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: 'NOT_FOUND' });

    for (const user of [brandA, opsUser]) {
      const res = await user('GET', `/audit-logs/order-trace/${dispensedOrderId}`);
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: 'FORBIDDEN_SCOPE' });
    }
  });
});
