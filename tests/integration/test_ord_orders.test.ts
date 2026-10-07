/**
 * Integration test cho luồng đơn kiosk và webhook thanh toán (tuần 4, TV1): HTTP thật → guard →
 * service → PostgreSQL thật, cổng thanh toán mock với webhook tự ký.
 *
 * KHÔNG có ở đây — thuộc nhóm test trọng yếu (spec/testing.md), file riêng:
 *   - Idempotency webhook (FR-ORD-15) — test_webhook_idempotency.test.ts
 *   - Quy kết revenue_owner (FR-REV-01..03) — test_revenue_attribution.test.ts, chưa có
 *   - Cô lập mức slot của tìm kiếm đơn (FR-ORD-22 AC3) — test_slot_isolation.test.ts
 */

import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildMockWebhook,
  MOCK_SIGNATURE_HEADER,
  signMockPayload,
  type MockWebhookBody,
} from '../../apps/api/src/modules/ord/payment/mock-gateway.js';
import { PAYMENT_REFERENCE_PATTERN } from '../../apps/api/src/modules/ord/payment/payment-reference.js';
import { createTestApp, login, TEST_PAYMENT_WEBHOOK_SECRET } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
  TEST_PASSWORD,
  type IsolationFixture,
} from './helpers/seed-isolation.js';

interface OrderBody {
  id: string;
  status: string;
  amount: string;
  currency: string;
  paymentReference: string;
  brandId: string;
  slotRentalId: string;
  slotId: string;
  machineId: string;
  fragranceProductId: string;
  productNameSnapshot: string;
  expiresAt: string;
  createdAt: string;
  needsManualReview: boolean;
}

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let adminToken: string;

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  app = await createTestApp();
  adminToken = (await login(app, fx.superAdminEmail, TEST_PASSWORD)).accessToken;
}, 60_000);

afterAll(async () => {
  // Dữ liệu do test này tạo thêm, dọn trước khi fixture xóa orders.
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

// -------------------------------------------------------------------------------------
// Tiện ích
// -------------------------------------------------------------------------------------

async function createOrder(slotIndex: number, key = randomUUID()) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/kiosk/orders',
    headers: { 'idempotency-key': key },
    payload: { machineSerial: fx.machineSerial, slotId: fx.slots[slotIndex] },
  });
}

async function newOrder(slotIndex: number): Promise<OrderBody> {
  const res = await createOrder(slotIndex);
  expect(res.statusCode, res.body).toBe(201);
  return res.json<{ order: OrderBody }>().order;
}

async function sendWebhook(payload: MockWebhookBody, secret = TEST_PAYMENT_WEBHOOK_SECRET) {
  const body = JSON.stringify(payload);
  return app.inject({
    method: 'POST',
    url: '/api/v1/webhooks/payments/mock',
    headers: {
      'content-type': 'application/json',
      [MOCK_SIGNATURE_HEADER]: signMockPayload(secret, body),
    },
    payload: body,
  });
}

function paidWebhook(order: OrderBody, overrides: Partial<MockWebhookBody> = {}): MockWebhookBody {
  return buildMockWebhook({
    reference: order.paymentReference,
    amount: order.amount,
    currency: order.currency,
    ...overrides,
  });
}

async function paymentOf(orderId: string) {
  const res = await client.query<{ status: string; provider: string; provider_reference: string }>(
    `SELECT status, provider, provider_reference FROM payments WHERE order_id = $1`,
    [orderId],
  );
  return res.rows[0];
}

async function orderRow(orderId: string) {
  const res = await client.query<{ status: string; needs_manual_review: boolean; amount: string }>(
    `SELECT status, needs_manual_review, amount FROM orders WHERE id = $1`,
    [orderId],
  );
  return res.rows[0];
}

async function withMachine(
  set: { status?: string; mode?: string },
  run: () => Promise<void>,
): Promise<void> {
  await client.query(
    `UPDATE machines SET status = COALESCE($2::machine_connection_status, status),
                         operating_mode = COALESCE($3::machine_operating_mode, operating_mode)
      WHERE id = $1`,
    [fx.machineId, set.status ?? null, set.mode ?? null],
  );
  try {
    await run();
  } finally {
    await client.query(
      `UPDATE machines SET status = 'ONLINE', operating_mode = 'NORMAL' WHERE id = $1`,
      [fx.machineId],
    );
  }
}

// -------------------------------------------------------------------------------------
// Kiosk: danh mục, tạo đơn
// -------------------------------------------------------------------------------------

describe('ORD — kiosk', () => {
  it('test_FR_ORD_01_kiosk_display_available_products', async () => {
    await client.query(`UPDATE machine_slots SET status = 'UNAVAILABLE' WHERE id = $1`, [
      fx.slots[3],
    ]);
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/kiosk/machines/${fx.machineSerial}/catalog`,
      });
      expect(res.statusCode).toBe(200);
      const catalog = res.json<{
        machineStatus: string;
        items: Array<{
          slotId: string;
          available: boolean;
          brandName: string | null;
          product: unknown;
        }>;
      }>();
      expect(catalog.machineStatus).toBe('ONLINE');
      const bySlot = new Map(catalog.items.map((i) => [i.slotId, i]));
      // AC1: slot bán được kèm tên thương hiệu để khách phân biệt.
      expect(bySlot.get(fx.slots[0] as string)).toMatchObject({ available: true });
      expect(bySlot.get(fx.slots[0] as string)?.brandName).toBeTruthy();
      // AC2 + BR-012: slot tạm hết không kèm thương hiệu hay sản phẩm.
      expect(bySlot.get(fx.slots[3] as string)).toMatchObject({
        available: false,
        brandName: null,
        product: null,
      });
    } finally {
      await client.query(`UPDATE machine_slots SET status = 'AVAILABLE' WHERE id = $1`, [
        fx.slots[3],
      ]);
    }
  });

  it('test_FR_ORD_04_validate_machine_and_slot_prerequisites', async () => {
    await withMachine({ status: 'OFFLINE' }, async () => {
      const res = await createOrder(0);
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: 'MACHINE_OFFLINE' });
    });
    await withMachine({ status: 'UNSTABLE' }, async () => {
      expect((await createOrder(0)).json()).toMatchObject({ code: 'MACHINE_OFFLINE' });
    });
    await withMachine({ mode: 'MAINTENANCE' }, async () => {
      const res = await createOrder(0);
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: 'MACHINE_IN_MAINTENANCE' });
    });

    await client.query(`UPDATE machine_slots SET status = 'UNAVAILABLE' WHERE id = $1`, [
      fx.slots[1],
    ]);
    try {
      const res = await createOrder(1);
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: 'SLOT_UNAVAILABLE' });
    } finally {
      await client.query(`UPDATE machine_slots SET status = 'AVAILABLE' WHERE id = $1`, [
        fx.slots[1],
      ]);
    }

    // AC1: máy ONLINE + NORMAL, slot AVAILABLE → đơn PENDING_PAYMENT.
    const order = await newOrder(0);
    expect(order.status).toBe('PENDING_PAYMENT');
  });

  it('test_FR_ORD_05_snapshot_order_metadata', async () => {
    const order = await newOrder(2);
    expect(order).toMatchObject({
      machineId: fx.machineId,
      slotId: fx.slots[2],
      slotRentalId: fx.rentals[2],
      brandId: fx.brandB,
      fragranceProductId: fx.products[2],
      productNameSnapshot: fx.brandBProductNames[0],
      currency: 'VND',
    });
    const rental = await client.query<{ price_per_spray: string }>(
      `SELECT price_per_spray FROM slot_rentals WHERE id = $1`,
      [fx.rentals[2]],
    );
    expect(order.amount).toBe(rental.rows[0]?.price_per_spray);
  });

  it('test_FR_ORD_06_order_price_immutability', async () => {
    const order = await newOrder(1);
    const before = await client.query<{ price_per_spray: string }>(
      `SELECT price_per_spray FROM slot_rentals WHERE id = $1`,
      [fx.rentals[1]],
    );
    await client.query(`UPDATE slot_rentals SET price_per_spray = '99999.0000' WHERE id = $1`, [
      fx.rentals[1],
    ]);
    try {
      // AC1: đổi giá slot không đổi số tiền của đơn đã tạo.
      expect((await orderRow(order.id))?.amount).toBe(order.amount);
      // ADR-0009: ngay cả UPDATE viết tay cũng bị CSDL chặn.
      await expect(
        client.query(`UPDATE orders SET amount = '1.0000' WHERE id = $1`, [order.id]),
      ).rejects.toMatchObject({ constraint: 'chk_order_snapshot_immutable' });
    } finally {
      await client.query(`UPDATE slot_rentals SET price_per_spray = $2 WHERE id = $1`, [
        fx.rentals[1],
        before.rows[0]?.price_per_spray,
      ]);
    }
  });

  it('test_FR_ORD_08_generate_payment_qr', async () => {
    const res = await createOrder(0);
    const body = res.json<{ order: OrderBody; qrPayload: string }>();
    expect(body.order.paymentReference).toMatch(PAYMENT_REFERENCE_PATTERN);
    // AC1: QR chứa đúng mã tham chiếu và số tiền của đơn.
    expect(body.qrPayload).toContain(body.order.paymentReference);
    expect(body.qrPayload).toContain(body.order.amount);
    expect(await paymentOf(body.order.id)).toMatchObject({
      status: 'PENDING',
      provider: 'mock',
      provider_reference: body.order.paymentReference,
    });
  });

  it('test_FR_ORD_09_order_payment_ttl', async () => {
    const order = await newOrder(0);
    const ttlMs = Date.parse(order.expiresAt) - Date.parse(order.createdAt);
    expect(ttlMs).toBe(300 * 1000); // ORDER_PAYMENT_TTL_SEC mặc định
  });

  it('gửi lại cùng Idempotency-Key trả lại đúng đơn và QR cũ (200), không tạo đơn mới', async () => {
    const key = randomUUID();
    const first = await createOrder(0, key);
    const again = await createOrder(0, key);
    expect(first.statusCode).toBe(201);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual(first.json());

    const reused = await createOrder(1, key);
    expect(reused.statusCode).toBe(400);

    const missing = await app.inject({
      method: 'POST',
      url: '/api/v1/kiosk/orders',
      payload: { machineSerial: fx.machineSerial, slotId: fx.slots[0] },
    });
    expect(missing.statusCode).toBe(400);
  });

  it('test_FR_ORD_24_reject_order_while_machine_awaits_press', async () => {
    const seeded = fx.orders[0];
    await client.query(
      `INSERT INTO dispense_commands (brand_id, order_id, machine_id, slot_id, command_type,
                                      command_token, signature, status, expires_at)
       VALUES ($1, $2, $3, $4, 'CUSTOMER', $5, 'test', 'ACKNOWLEDGED', now() + interval '1 minute')`,
      [seeded?.brandId, seeded?.id, fx.machineId, seeded?.slotId, `tok-${randomUUID()}`],
    );
    try {
      // AC1: đang có nút sáng chờ bấm trên máy → đơn mới ở BẤT KỲ slot nào bị từ chối.
      const res = await createOrder(3);
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: 'MACHINE_BUSY' });
    } finally {
      await client.query(`DELETE FROM dispense_commands WHERE machine_id = $1`, [fx.machineId]);
    }
    // AC2: lệnh kết thúc thì tạo đơn bình thường.
    expect((await createOrder(3)).statusCode).toBe(201);
  });
});

// -------------------------------------------------------------------------------------
// Webhook thanh toán
// -------------------------------------------------------------------------------------

describe('ORD — webhook thanh toán', () => {
  it('test_FR_ORD_12_receive_payment_webhook', async () => {
    const order = await newOrder(0);
    const res = await sendWebhook(paidWebhook(order));
    // AC1
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ result: 'PROCESSED' });
    expect((await orderRow(order.id))?.status).toBe('PAID');
    expect((await paymentOf(order.id))?.status).toBe('SUCCEEDED');

    // AC2: body không đọc được.
    const malformed = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/payments/mock',
      headers: { 'content-type': 'application/json' },
      payload: '{không phải json',
    });
    expect(malformed.statusCode).toBe(400);
  });

  it('test_FR_ORD_13_verify_webhook_signature', async () => {
    const order = await newOrder(0);
    const payload = paidWebhook(order);
    const res = await sendWebhook(payload, 'khoa-gia-mao');
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'INVALID_WEBHOOK_SIGNATURE' });
    // Hủy xử lý: đơn và payment không đổi.
    expect((await orderRow(order.id))?.status).toBe('PENDING_PAYMENT');
    expect((await paymentOf(order.id))?.status).toBe('PENDING');
    // Vẫn ghi lại để rà soát, dưới khóa riêng — không chiếm eventId của giao dịch thật.
    const logged = await client.query<{ signature_valid: boolean; provider_event_id: string }>(
      `SELECT signature_valid, provider_event_id FROM payment_events
        WHERE payload->>'reference' = $1`,
      [order.paymentReference],
    );
    expect(logged.rows).toHaveLength(1);
    expect(logged.rows[0]).toMatchObject({ signature_valid: false });
    expect(logged.rows[0]?.provider_event_id).toMatch(/^rejected:/);

    // Webhook thật tới sau với CHÍNH eventId mà bản giả mạo đã dùng vẫn được xử lý.
    expect(await sendWebhook(payload)).toMatchObject({ statusCode: 200 });
    expect((await orderRow(order.id))?.status).toBe('PAID');
  });

  it('test_FR_ORD_14_verify_webhook_amount_and_reference', async () => {
    const order = await newOrder(0);
    // AC2: sai số tiền → 400, không PAID, cắm cờ kiểm tra thủ công.
    const mismatch = await sendWebhook(paidWebhook(order, { amount: '1000' }));
    expect(mismatch.statusCode).toBe(400);
    expect(mismatch.json()).toMatchObject({ code: 'AMOUNT_MISMATCH' });
    expect(await orderRow(order.id)).toMatchObject({
      status: 'PENDING_PAYMENT',
      needs_manual_review: true,
    });
    expect((await paymentOf(order.id))?.status).toBe('PENDING');

    // AC3: mã tham chiếu không tồn tại → 404, không đổi dữ liệu.
    const unknown = await sendWebhook(
      buildMockWebhook({ reference: 'ORD-20260101-ZZZZZZ', amount: '1', currency: 'VND' }),
    );
    expect(unknown.statusCode).toBe(404);
  });

  it('test_FR_ORD_16_order_expiration_timeout', async () => {
    // AC1: quá hạn → EXPIRED khi kiosk hỏi trạng thái; payment đang chờ → EXPIRED.
    const expired = await newOrder(0);
    await client.query(`UPDATE orders SET expires_at = now() - interval '1 second' WHERE id = $1`, [
      expired.id,
    ]);
    const status = await app.inject({
      method: 'GET',
      url: `/api/v1/kiosk/orders/${expired.id}/status`,
    });
    expect(status.json()).toMatchObject({ status: 'EXPIRED' });
    expect((await paymentOf(expired.id))?.status).toBe('EXPIRED');

    // AC3: tiền về sau khi đã EXPIRED → REFUND_PENDING + kiểm tra thủ công, không xịt.
    expect((await sendWebhook(paidWebhook(expired))).statusCode).toBe(200);
    expect(await orderRow(expired.id)).toMatchObject({
      status: 'REFUND_PENDING',
      needs_manual_review: true,
    });
    expect((await paymentOf(expired.id))?.status).toBe('REFUND_PENDING');

    // Cổng ghi nhận giao dịch TRƯỚC hạn nhưng webhook tới sau hạn (chưa ai chuyển EXPIRED):
    // khách đã trả đúng hạn nên đơn vẫn PAID.
    const late = await newOrder(0);
    await client.query(`UPDATE orders SET expires_at = now() - interval '1 second' WHERE id = $1`, [
      late.id,
    ]);
    const paidBeforeDeadline = new Date(Date.now() - 60_000).toISOString();
    await sendWebhook(paidWebhook(late, { occurredAt: paidBeforeDeadline }));
    expect((await orderRow(late.id))?.status).toBe('PAID');
  });

  it('test_FR_ORD_11_kiosk_payment_status_latency', async () => {
    const order = await newOrder(2);
    const statusOf = async () =>
      (await app.inject({ method: 'GET', url: `/api/v1/kiosk/orders/${order.id}/status` })).json<{
        status: string;
        slotNumber: number;
        supportReference: string | null;
      }>();
    expect(await statusOf()).toMatchObject({ status: 'PENDING_PAYMENT', slotNumber: 3 });
    await sendWebhook(paidWebhook(order));
    // Không có hàng đợi hay cache giữa webhook và endpoint poll: lần hỏi ngay sau đã thấy PAID.
    expect(await statusOf()).toMatchObject({ status: 'PAID', supportReference: null });
  });
});

// -------------------------------------------------------------------------------------
// Web quản trị
// -------------------------------------------------------------------------------------

describe('ORD — tra cứu đơn', () => {
  it('test_FR_ORD_18_order_status_history_trail', async () => {
    const order = await newOrder(0);
    await sendWebhook(paidWebhook(order));
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${order.id}/history`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const history =
      res.json<Array<{ fromStatus: string | null; toStatus: string; reason: string }>>();
    expect(history.map((h) => [h.fromStatus, h.toStatus, h.reason])).toEqual([
      [null, 'CREATED', 'ORDER_CREATED'],
      ['CREATED', 'PENDING_PAYMENT', 'PAYMENT_REQUESTED'],
      ['PENDING_PAYMENT', 'PAID', 'PAYMENT_CONFIRMED'],
    ]);
  });

  it('test_FR_ORD_22_search_and_filter_orders', async () => {
    const order = await newOrder(0);
    await sendWebhook(paidWebhook(order));
    const search = async (query: string) =>
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/orders?${query}`,
          headers: { authorization: `Bearer ${adminToken}` },
        })
      ).json<{ items: OrderBody[]; meta: { total: number } }>();

    // AC2: tìm đúng một đơn theo mã tham chiếu.
    const byReference = await search(`paymentReference=${order.paymentReference}`);
    expect(byReference.items.map((o) => o.id)).toEqual([order.id]);

    // AC1: nhiều tiêu chí cùng lúc.
    const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const byFilters = await search(`machineId=${fx.machineId}&status=PAID&from=${from}`);
    expect(byFilters.items.some((o) => o.id === order.id)).toBe(true);
    expect(byFilters.items.every((o) => o.status === 'PAID' && o.machineId === fx.machineId)).toBe(
      true,
    );
  });
});
