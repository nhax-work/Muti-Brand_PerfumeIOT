/**
 * Khách hủy đơn trên kiosk (FR-ORD-33, ADR-0015 mục 3): HTTP thật → service → PostgreSQL thật, cổng
 * mock. Các nhánh cổng trả "đã thanh toán" / không liên lạc được giả lập bằng cách thay
 * `MockPaymentGateway.cancelPayment` — phần còn lại (khóa đơn, state machine, webhook có chữ ký) chạy
 * thật.
 */

import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  buildMockWebhook,
  MOCK_SIGNATURE_HEADER,
  MockPaymentGateway,
  signMockPayload,
} from '../../apps/api/src/modules/ord/payment/mock-gateway.js';
import { createTestApp, TEST_PAYMENT_WEBHOOK_SECRET } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
  type IsolationFixture,
} from './helpers/seed-isolation.js';

interface OrderBody {
  id: string;
  amount: string;
  currency: string;
  paymentReference: string;
}

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  app = await createTestApp();
}, 60_000);

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  const orderIds = `SELECT id FROM orders WHERE machine_id = $1`;
  await client.query(
    `DELETE FROM payment_events WHERE payment_id IN (SELECT id FROM payments WHERE order_id IN (${orderIds}))`,
    [fx.machineId],
  );
  await client.query(`DELETE FROM payments WHERE order_id IN (${orderIds})`, [fx.machineId]);
  await client.query(`DELETE FROM order_status_histories WHERE order_id IN (${orderIds})`, [
    fx.machineId,
  ]);
  await client.query(`DELETE FROM dispense_commands WHERE machine_id = $1`, [fx.machineId]);
  await cleanupIsolationFixture(client, fx);
  await app.close();
  await client.end();
});

async function newOrder(slotIndex: number): Promise<OrderBody> {
  await client.query(
    `UPDATE orders SET status = 'EXPIRED' WHERE machine_id = $1 AND status IN ('CREATED', 'PENDING_PAYMENT')`,
    [fx.machineId],
  );
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/kiosk/orders',
    headers: { 'idempotency-key': randomUUID() },
    payload: { machineSerial: fx.machineSerial, slotId: fx.slots[slotIndex] },
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json<{ order: OrderBody }>().order;
}

function cancel(orderId: string, machineSerial = fx.machineSerial) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/kiosk/orders/${orderId}/cancel`,
    payload: { machineSerial },
  });
}

async function payWebhook(order: OrderBody) {
  const body = JSON.stringify(
    buildMockWebhook({
      reference: order.paymentReference,
      amount: order.amount,
      currency: order.currency,
    }),
  );
  return app.inject({
    method: 'POST',
    url: '/api/v1/webhooks/payments/mock',
    headers: {
      'content-type': 'application/json',
      [MOCK_SIGNATURE_HEADER]: signMockPayload(TEST_PAYMENT_WEBHOOK_SECRET, body),
    },
    payload: body,
  });
}

async function state(orderId: string) {
  const order = await client.query<{ status: string; needs_manual_review: boolean }>(
    `SELECT status, needs_manual_review FROM orders WHERE id = $1`,
    [orderId],
  );
  const payment = await client.query<{ status: string }>(
    `SELECT status FROM payments WHERE order_id = $1`,
    [orderId],
  );
  const history = await client.query<{
    to_status: string;
    reason: string | null;
    actor_type: string;
    metadata: Record<string, unknown> | null;
  }>(
    `SELECT to_status, reason, actor_type, metadata FROM order_status_histories
      WHERE order_id = $1 ORDER BY occurred_at, id`,
    [orderId],
  );
  const commands = await client.query(`SELECT 1 FROM dispense_commands WHERE order_id = $1`, [
    orderId,
  ]);
  return {
    order: order.rows[0],
    paymentStatus: payment.rows[0]?.status,
    history: history.rows,
    commandCount: commands.rowCount,
  };
}

describe('FR-ORD-33 — khách hủy đơn trên kiosk', () => {
  it('test_FR_ORD_33_kiosk_cancel_pending_order — hủy, gọi lại idempotent, tiền về sau hủy thì hoàn tiền', async () => {
    const order = await newOrder(0);
    const gatewayCancel = vi.spyOn(MockPaymentGateway.prototype, 'cancelPayment');

    const res = await cancel(order.id);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json<{ status: string }>().status).toBe('EXPIRED');
    expect(gatewayCancel).toHaveBeenCalledTimes(1);

    // AC1: EXPIRED với lý do riêng, payment CANCELLED — không có trạng thái đơn mới.
    let s = await state(order.id);
    expect(s.order?.status).toBe('EXPIRED');
    expect(s.paymentStatus).toBe('CANCELLED');
    expect(s.history.at(-1)).toMatchObject({
      to_status: 'EXPIRED',
      reason: 'CUSTOMER_CANCELLED',
      actor_type: 'DEVICE',
      metadata: { gatewayCancelled: true },
    });

    // Gọi lại: cùng kết quả, không gọi cổng lần nữa, không thêm lịch sử.
    const again = await cancel(order.id);
    expect(again.statusCode).toBe(200);
    expect(again.json<{ status: string }>().status).toBe('EXPIRED');
    expect(gatewayCancel).toHaveBeenCalledTimes(1);
    expect((await state(order.id)).history).toHaveLength(s.history.length);

    // AC3: khách đã chuyển ngay trước khi hủy — tiền vẫn tới. Không được bỏ qua như tin trùng.
    const webhook = await payWebhook(order);
    expect(webhook.statusCode, webhook.body).toBe(200);
    s = await state(order.id);
    expect(s.order).toMatchObject({ status: 'REFUND_PENDING', needs_manual_review: true });
    expect(s.paymentStatus).toBe('REFUND_PENDING');
    expect(s.history.at(-1)).toMatchObject({
      to_status: 'REFUND_PENDING',
      reason: 'PAID_AFTER_CANCEL',
    });
    expect(s.commandCount).toBe(0);
  });

  it('test_FR_ORD_33_cancel_refused_when_gateway_already_paid — cổng báo đã nhận tiền thì không hủy', async () => {
    const order = await newOrder(1);
    vi.spyOn(MockPaymentGateway.prototype, 'cancelPayment').mockResolvedValue({
      kind: 'ALREADY_PAID',
    });

    const res = await cancel(order.id);
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json<{ code: string }>().code).toBe('ORDER_NOT_CANCELLABLE');

    const s = await state(order.id);
    expect(s.order?.status).toBe('PENDING_PAYMENT');
    expect(s.paymentStatus).toBe('PENDING');
  });

  it('test_FR_ORD_33_cancel_still_applies_when_gateway_unreachable — mất liên lạc cổng vẫn hủy phía hệ thống', async () => {
    const order = await newOrder(2);
    vi.spyOn(MockPaymentGateway.prototype, 'cancelPayment').mockRejectedValue(
      new Error('ECONNRESET'),
    );

    const res = await cancel(order.id);
    expect(res.statusCode, res.body).toBe(200);
    const s = await state(order.id);
    expect(s.order?.status).toBe('EXPIRED');
    expect(s.paymentStatus).toBe('CANCELLED');
    expect(s.history.at(-1)).toMatchObject({
      reason: 'CUSTOMER_CANCELLED',
      metadata: { gatewayCancelled: false },
    });
  });

  it('test_FR_ORD_33_cancel_other_machine_order_not_found — đơn không thuộc máy gửi yêu cầu', async () => {
    const order = await newOrder(3);
    const res = await cancel(order.id, `SS-NOT-THIS-${randomUUID().slice(0, 8)}`);
    expect(res.statusCode).toBe(404);
    expect((await state(order.id)).order?.status).toBe('PENDING_PAYMENT');

    const missing = await cancel(randomUUID());
    expect(missing.statusCode).toBe(404);

    // Dọn để không còn đơn chờ thanh toán của máy cho test sau.
    expect((await cancel(order.id)).statusCode).toBe(200);
  });

  it('test_FR_ORD_33_paid_order_cannot_be_cancelled — đơn đã thanh toán', async () => {
    const order = await newOrder(4);
    expect((await payWebhook(order)).statusCode).toBe(200);

    const res = await cancel(order.id);
    expect(res.statusCode).toBe(409);
    expect(res.json<{ code: string }>().code).toBe('ORDER_NOT_CANCELLABLE');
    expect((await state(order.id)).order?.status).not.toBe('EXPIRED');
  });
});
