/**
 * Giới hạn tần suất tạo đơn kiosk theo máy (NFR-SEC-06, `ORDER_RATE_LIMIT_PER_MIN`, `RATE_LIMITED`).
 *
 * App test dựng với ngưỡng 3 — `createTestApp` mặc định nâng ngưỡng lên cho các file khác vì chúng tạo
 * hàng chục đơn trên cùng một máy trong vài giây. Hai giới hạn tần suất còn lại của lộ trình tuần 8 có
 * test riêng: đăng ký thương hiệu (`tests/unit/auth.test.ts`) và gửi khiếu nại
 * (`tests/integration/test_refund_claims.test.ts`).
 */

import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import { kioskFlow } from './helpers/kiosk-flow.js';
import {
  cleanupIsolationFixture,
  releaseOpenOrders,
  seedIsolationFixture,
  type IsolationFixture,
} from './helpers/seed-isolation.js';

const LIMIT = 3;

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let flow: ReturnType<typeof kioskFlow>;

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  app = await createTestApp({ orderRateLimitPerMin: LIMIT });
  flow = kioskFlow(app, client, fx);
}, 60_000);

afterEach(async () => {
  await releaseOpenOrders(client, fx.machineId);
});

afterAll(async () => {
  await releaseOpenOrders(client, fx.machineId);
  await flow.cleanup();
  await cleanupIsolationFixture(client, fx);
  await client.end();
  await app.close();
});

function createOrder(idempotencyKey: string, machineSerial = fx.machineSerial) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/kiosk/orders',
    headers: { 'idempotency-key': idempotencyKey },
    payload: { machineSerial, slotId: fx.slots[0] },
  });
}

describe('Giới hạn tạo đơn kiosk (NFR-SEC-06)', () => {
  it('test_NFR_SEC_06_kiosk_order_rate_limit — quá ORDER_RATE_LIMIT_PER_MIN lần tạo mới trong một phút thì RATE_LIMITED 429; gửi lại cùng Idempotency-Key không tính', async () => {
    const keys: string[] = [];
    for (let i = 0; i < LIMIT; i++) {
      const key = randomUUID();
      keys.push(key);
      const res = await createOrder(key);
      expect(res.statusCode, res.body).toBe(201);
      // Mỗi máy một đơn chờ thanh toán (FR-ORD-35) — khách trước rời màn QR.
      await releaseOpenOrders(client, fx.machineId);
    }

    // Gửi lại đúng một yêu cầu cũ: cùng đơn, không phải lần tạo mới.
    const replay = await createOrder(keys[0]!);
    expect(replay.statusCode, replay.body).toBe(200);

    const limited = await createOrder(randomUUID());
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({
      code: 'RATE_LIMITED',
      details: { messageKey: 'ord.orderRateLimited' },
    });
    const orders = await client.query(`SELECT 1 FROM orders WHERE idempotency_key = ANY($1)`, [
      keys,
    ]);
    expect(orders.rowCount).toBe(LIMIT);
  });
});
