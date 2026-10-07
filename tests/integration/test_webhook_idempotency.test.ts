/**
 * Idempotency webhook thanh toán (nhóm test trọng yếu, spec/testing.md): cổng gửi lại cùng sự kiện —
 * tuần tự hay song song — thì tiền chỉ được ghi nhận một lần, đơn chỉ có một lệnh xịt, hóa đơn thuê
 * slot chỉ được cấp số một lần (FR-ORD-15, FR-SLT-38 AC4, Gate 3).
 *
 * Chống trùng là ràng buộc CSDL `uq_payment_event`, không phải câu SELECT "đã có chưa" — ca song song
 * dưới đây là thứ chứng minh điều đó: SELECT-rồi-INSERT sẽ để lọt hai luồng cùng xử lý.
 */

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DspService } from '../../apps/api/src/modules/dsp/index.js';
import { buildMockWebhook } from '../../apps/api/src/modules/ord/payment/mock-gateway.js';
import { asUser, createTestApp, login } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import { kioskFlow } from './helpers/kiosk-flow.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
  TEST_PASSWORD,
  type IsolationFixture,
} from './helpers/seed-isolation.js';

const RESENDS = 5;

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let flow: ReturnType<typeof kioskFlow>;
let brandA: ReturnType<typeof asUser>;
let packageId: string;
let storagePlanId: string;
let vacantSlot: string;

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  app = await createTestApp();
  flow = kioskFlow(app, client, fx);
  brandA = asUser(app, (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken);

  packageId = randomUUID();
  storagePlanId = randomUUID();
  vacantSlot = randomUUID();
  await client.query(
    `INSERT INTO rental_packages (id, name, duration_months, discount_percent, is_active)
     VALUES ($1, $2, 3, 5.00, true)`,
    [packageId, `Gói 3 tháng ${fx.runId}`],
  );
  await client.query(
    `INSERT INTO storage_plans (id, name, monthly_price, coverage_percent, coverage_cap, is_active)
     VALUES ($1, $2, 100000.0000, 30.00, 3000000.0000, true)`,
    [storagePlanId, `Bảo quản chuẩn ${fx.runId}`],
  );
  await client.query(
    `INSERT INTO machine_slots (id, machine_id, slot_number, status, monthly_rent_price,
                                calibrated_dosage_ml, low_stock_threshold_ml)
     VALUES ($1, $2, 6, 'AVAILABLE', 1000000.0000, 0.1200, 5.0000)`,
    [vacantSlot, fx.machineId],
  );
}, 60_000);

afterAll(async () => {
  await client.query(`DELETE FROM notifications WHERE brand_id IN ($1, $2)`, [
    fx.brandA,
    fx.brandB,
  ]);
  const checkouts = await client.query<{ id: string }>(
    `SELECT id FROM rental_checkouts WHERE brand_id = $1`,
    [fx.brandA],
  );
  const ids = checkouts.rows.map((r) => r.id);
  if (ids.length > 0) {
    // Bất biến phiên ↔ hóa đơn kiểm lúc COMMIT (ADR-0008) — xóa chung một transaction.
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM payment_events WHERE payment_id IN
         (SELECT id FROM payments WHERE rental_checkout_id = ANY($1::uuid[]))`,
      [ids],
    );
    await client.query(`DELETE FROM payments WHERE rental_checkout_id = ANY($1::uuid[])`, [ids]);
    await client.query(`DELETE FROM slot_rentals WHERE checkout_id = ANY($1::uuid[])`, [ids]);
    await client.query(`DELETE FROM rental_checkouts WHERE id = ANY($1::uuid[])`, [ids]);
    await client.query('COMMIT');
  }
  await client.query(`DELETE FROM machine_slots WHERE id = $1`, [vacantSlot]);
  await client.query(`DELETE FROM rental_packages WHERE id = $1`, [packageId]);
  await client.query(`DELETE FROM storage_plans WHERE id = $1`, [storagePlanId]);
  await flow.cleanup();
  await cleanupIsolationFixture(client, fx);
  await app.close();
  await client.end();
});

/** Kết quả `{ result }` của mỗi lần gửi, theo thứ tự gửi. */
async function results(responses: Promise<{ statusCode: number; body: string }>[]) {
  const settled = await Promise.all(responses);
  for (const res of settled) expect(res.statusCode, res.body).toBe(200);
  return settled.map((res) => (JSON.parse(res.body) as { result: string }).result);
}

async function acceptedEvents(eventId: string): Promise<number> {
  const res = await client.query(
    `SELECT 1 FROM payment_events WHERE provider = 'mock' AND provider_event_id = $1`,
    [eventId],
  );
  return res.rowCount ?? 0;
}

async function paidTransitions(orderId: string): Promise<number> {
  const res = await client.query(
    `SELECT 1 FROM order_status_histories WHERE order_id = $1 AND to_status = 'PAID'`,
    [orderId],
  );
  return res.rowCount ?? 0;
}

describe('Idempotency webhook — đơn kiosk', () => {
  it('test_FR_ORD_15_webhook_idempotent', async () => {
    const order = await flow.createOrder(0);
    const webhook = flow.paidWebhook(order);

    // AC1: lần đầu xử lý, đơn PAID.
    expect(await results([flow.sendWebhook(webhook)])).toEqual(['PROCESSED']);
    expect((await flow.orderRow(order.id))?.status).toBe('PAID');

    // AC2: cổng gửi lại đúng sự kiện đó → 200 WEBHOOK_ALREADY_PROCESSED, không xử lý lại.
    const resent = await results(
      Array.from({ length: RESENDS - 1 }, () => flow.sendWebhook(webhook)),
    );
    expect(resent).toEqual(Array(RESENDS - 1).fill('WEBHOOK_ALREADY_PROCESSED'));
    expect(await acceptedEvents(webhook.eventId)).toBe(1);
    expect(await paidTransitions(order.id)).toBe(1);

    // Gate 3: webhook gửi lại 5 lần chỉ tạo 1 lệnh xịt.
    await app.get(DspService).armQueuedOrders();
    await app.get(DspService).armQueuedOrders();
    expect(await flow.commandsOf(order.id)).toHaveLength(1);

    // Cùng giao dịch được cổng báo lại dưới eventId MỚI: payment đã SUCCEEDED nên vẫn chỉ một lần.
    const sameTransaction = buildMockWebhook({
      reference: webhook.reference,
      amount: webhook.amount,
      currency: webhook.currency,
      transactionId: webhook.transactionId,
    });
    expect(await results([flow.sendWebhook(sameTransaction)])).toEqual([
      'WEBHOOK_ALREADY_PROCESSED',
    ]);
    expect(await paidTransitions(order.id)).toBe(1);
    expect(await flow.commandsOf(order.id)).toHaveLength(1);

    await client.query(`UPDATE dispense_commands SET status = 'FAILED' WHERE order_id = $1`, [
      order.id,
    ]);
  });

  it('test_FR_ORD_15_concurrent_duplicate_webhooks_processed_once', async () => {
    const order = await flow.createOrder(1);
    const webhook = flow.paidWebhook(order);

    // AC3: năm bản trùng tới cùng lúc — đúng một luồng xử lý, các luồng còn lại nhận "đã xử lý".
    const outcomes = await results(
      Array.from({ length: RESENDS }, () => flow.sendWebhook(webhook)),
    );
    expect(outcomes.filter((r) => r === 'PROCESSED')).toHaveLength(1);
    expect(outcomes.filter((r) => r === 'WEBHOOK_ALREADY_PROCESSED')).toHaveLength(RESENDS - 1);

    expect((await flow.orderRow(order.id))?.status).toBe('PAID');
    expect(await acceptedEvents(webhook.eventId)).toBe(1);
    expect(await paidTransitions(order.id)).toBe(1);
    const payment = await client.query<{ status: string }>(
      `SELECT status FROM payments WHERE order_id = $1`,
      [order.id],
    );
    expect(payment.rows).toEqual([{ status: 'SUCCEEDED' }]);

    await client.query(`UPDATE orders SET status = 'FAILED' WHERE id = $1`, [order.id]);
  });
});

describe('Idempotency webhook — phiên thuê slot', () => {
  it('test_FR_SLT_38_duplicate_invoice_webhook_recorded_once', async () => {
    const checkoutRes = await brandA('POST', '/rental-checkouts', {
      payload: { items: [{ slotId: vacantSlot, rentalPackageId: packageId, storagePlanId }] },
    });
    expect(checkoutRes.statusCode, checkoutRes.body).toBe(201);
    const checkout = checkoutRes.json<{ id: string }>();
    const payRes = await brandA('POST', `/rental-checkouts/${checkout.id}/payments`);
    expect(payRes.statusCode, payRes.body).toBe(200);
    const { paymentId } = payRes.json<{ paymentId: string }>();
    const payment = await client.query<{
      provider_reference: string;
      amount: string;
      currency: string;
    }>(`SELECT provider_reference, amount, currency FROM payments WHERE id = $1`, [paymentId]);
    const row = payment.rows[0]!;
    const webhook = buildMockWebhook({
      reference: row.provider_reference,
      amount: row.amount,
      currency: row.currency,
    });

    // Gửi song song rồi gửi lại tuần tự — cả hai kiểu đều chỉ ghi nhận một lần.
    const concurrent = await results(
      Array.from({ length: RESENDS }, () => flow.sendWebhook(webhook)),
    );
    expect(concurrent.filter((r) => r === 'PROCESSED')).toHaveLength(1);

    const rental = await client.query<{ invoice_number: string; paid_at: Date }>(
      `SELECT invoice_number, paid_at FROM slot_rentals WHERE checkout_id = $1`,
      [checkout.id],
    );
    expect(rental.rows).toHaveLength(1);
    const first = rental.rows[0]!;
    expect(first.invoice_number).toMatch(/^HD-/);

    expect(await results([flow.sendWebhook(webhook)])).toEqual(['WEBHOOK_ALREADY_PROCESSED']);

    // AC4: không ghi nhận lần hai, không cấp số hóa đơn thứ hai.
    const after = await client.query<{ invoice_number: string; paid_at: Date }>(
      `SELECT invoice_number, paid_at FROM slot_rentals WHERE checkout_id = $1`,
      [checkout.id],
    );
    expect(after.rows).toEqual([first]);
    expect(await acceptedEvents(webhook.eventId)).toBe(1);
    // Một thông báo thanh toán cho mỗi Brand Admin, không nhân theo số lần gửi (FR-SLT-43).
    const notifications = await client.query(
      `SELECT 1 FROM notifications WHERE brand_id = $1 AND type = 'RENTAL_CHECKOUT_PAID'`,
      [fx.brandA],
    );
    expect(notifications.rowCount).toBe(1);
  });
});
