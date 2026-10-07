/**
 * Các bước kiosk → thanh toán → lệnh xịt dùng chung cho test DSP, test idempotency webhook và test
 * e2e TTL lệnh xịt. Đi qua HTTP thật (`app.inject`) và webhook mock tự ký, như kiosk và cổng thật.
 */

import { generateKeyPairSync, randomUUID, type KeyObject } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { expect } from 'vitest';
import {
  buildMockWebhook,
  MOCK_SIGNATURE_HEADER,
  signMockPayload,
  type MockWebhookBody,
} from '../../../apps/api/src/modules/ord/payment/mock-gateway.js';
import { TEST_PAYMENT_WEBHOOK_SECRET } from './app.js';
import type { IsolationFixture } from './seed-isolation.js';

/**
 * Sinh khóa Ed25519 mới và đặt làm DISPENSE_SIGNING_KEY — gọi TRƯỚC `createTestApp()` vì
 * `loadConfig()` đọc biến này lúc khởi tạo. Trả khóa công khai để phía "thiết bị" kiểm chữ ký.
 */
export function useTestSigningKey(): KeyObject {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  process.env['DISPENSE_SIGNING_KEY'] = privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString();
  return publicKey;
}

export interface OrderBody {
  readonly id: string;
  readonly status: string;
  readonly amount: string;
  readonly currency: string;
  readonly paymentReference: string;
}

export interface OrderRow {
  readonly status: string;
  readonly needs_manual_review: boolean;
  readonly failure_code: string | null;
}

export interface CommandRow {
  readonly id: string;
  readonly command_token: string;
  readonly status: string;
  readonly command_type: string;
  readonly expires_at: Date;
  readonly created_at: Date;
  readonly sent_at: Date | null;
  readonly acknowledged_at: Date | null;
}

export function kioskFlow(app: NestFastifyApplication, client: pg.Client, fx: IsolationFixture) {
  async function createOrder(slotIndex: number) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/kiosk/orders',
      headers: { 'idempotency-key': randomUUID() },
      payload: { machineSerial: fx.machineSerial, slotId: fx.slots[slotIndex] },
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<{ order: OrderBody }>().order;
  }

  async function sendWebhook(payload: MockWebhookBody) {
    const body = JSON.stringify(payload);
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

  function paidWebhook(order: OrderBody): MockWebhookBody {
    return buildMockWebhook({
      reference: order.paymentReference,
      amount: order.amount,
      currency: order.currency,
    });
  }

  /** Webhook thành công cho đơn → đơn PAID. */
  async function pay(order: OrderBody): Promise<void> {
    const res = await sendWebhook(paidWebhook(order));
    expect(res.statusCode, res.body).toBe(200);
  }

  async function paidOrder(slotIndex: number): Promise<OrderBody> {
    const order = await createOrder(slotIndex);
    await pay(order);
    return order;
  }

  async function orderRow(orderId: string): Promise<OrderRow | undefined> {
    const res = await client.query<OrderRow>(
      `SELECT status, needs_manual_review, failure_code FROM orders WHERE id = $1`,
      [orderId],
    );
    return res.rows[0];
  }

  /** Mọi lệnh của đơn, cũ trước. */
  async function commandsOf(orderId: string): Promise<CommandRow[]> {
    const res = await client.query<CommandRow>(
      `SELECT id, command_token, status, command_type, expires_at, created_at, sent_at,
              acknowledged_at
         FROM dispense_commands WHERE order_id = $1 ORDER BY created_at`,
      [orderId],
    );
    return res.rows;
  }

  async function commandOf(orderId: string): Promise<CommandRow> {
    const commands = await commandsOf(orderId);
    expect(commands).toHaveLength(1);
    return commands[0] as CommandRow;
  }

  /** Dọn dữ liệu mà luồng kiosk sinh thêm trên máy của fixture — gọi trước `cleanupIsolationFixture`. */
  async function cleanup(): Promise<void> {
    const orderIds = `SELECT id FROM orders WHERE machine_id = $1`;
    await client.query(
      `DELETE FROM dispense_results WHERE command_id IN
         (SELECT id FROM dispense_commands WHERE machine_id = $1)`,
      [fx.machineId],
    );
    await client.query(`DELETE FROM dispense_commands WHERE machine_id = $1`, [fx.machineId]);
    await client.query(
      `DELETE FROM payment_events WHERE payment_id IN
         (SELECT id FROM payments WHERE order_id IN (${orderIds}))`,
      [fx.machineId],
    );
    await client.query(`DELETE FROM payments WHERE order_id IN (${orderIds})`, [fx.machineId]);
    await client.query(`DELETE FROM order_status_histories WHERE order_id IN (${orderIds})`, [
      fx.machineId,
    ]);
  }

  return {
    createOrder,
    sendWebhook,
    paidWebhook,
    pay,
    paidOrder,
    orderRow,
    commandsOf,
    commandOf,
    cleanup,
  };
}
