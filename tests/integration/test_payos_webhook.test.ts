/**
 * Cổng PayOS đi trọn luồng thật của hệ thống (ADR-0016, lộ trình tuần 6): tạo thanh toán → webhook
 * có chữ ký → xác minh chữ ký, số tiền, mã tham chiếu — cho cả đơn kiosk lẫn hóa đơn thuê slot.
 *
 * PayOS không có sandbox: phản hồi API tạo link được giả lập bằng `fetch` giả; webhook ký bằng khóa
 * checksum test đúng thuật toán PayOS. Lượt chạy với tiền thật: docs/PAYOS.md.
 */

import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { payosSignatureOf } from '../../apps/api/src/modules/ord/payment/payos-gateway.js';
import { asUser, createTestApp, login, TEST_PAYOS_CHECKSUM_KEY } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import { kioskFlow } from './helpers/kiosk-flow.js';
import {
  cleanupIsolationFixture,
  releaseOpenOrders,
  seedIsolationFixture,
  TEST_PASSWORD,
  type IsolationFixture,
} from './helpers/seed-isolation.js';

const PAYER_ACCOUNT = '9704229988776655';

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let flow: ReturnType<typeof kioskFlow>;
let brandA: ReturnType<typeof asUser>;
let packageId: string;
let storagePlanId: string;
let vacantSlot: string;
/** Các yêu cầu tạo link app đã gửi PayOS (qua fetch giả). */
const payosRequests: Record<string, unknown>[] = [];

beforeAll(async () => {
  vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
    if (!String(url).endsWith('/v2/payment-requests')) throw new Error(`fetch lạ: ${String(url)}`);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    payosRequests.push(body);
    return new Response(
      JSON.stringify({
        code: '00',
        desc: 'success',
        data: {
          qrCode: `00020101021238VIETQR${String(body['orderCode'])}`,
          checkoutUrl: `https://pay.payos.vn/web/${String(body['orderCode'])}`,
          paymentLinkId: `plink_${String(body['orderCode'])}`,
          status: 'PENDING',
        },
      }),
      { status: 200 },
    );
  });

  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  app = await createTestApp({ paymentProvider: 'payos' });
  flow = kioskFlow(app, client, fx);
  brandA = asUser(app, (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken);

  packageId = randomUUID();
  storagePlanId = randomUUID();
  vacantSlot = randomUUID();
  await client.query(
    `INSERT INTO rental_packages (id, name, duration_months, discount_percent, is_active)
     VALUES ($1, $2, 3, 0.00, true)`,
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

// Mỗi máy một đơn chờ thanh toán (FR-ORD-35): mỗi test bắt đầu như khi khách trước đã rời màn QR.
beforeEach(async () => {
  await releaseOpenOrders(client, fx.machineId);
});

afterAll(async () => {
  vi.unstubAllGlobals();
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

/** Giờ hiện tại theo định dạng PayOS `YYYY-MM-DD HH:mm:ss`, giờ Việt Nam. */
function vietnamNow(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

/** Body webhook PayOS cho một payment, ký bằng khóa checksum test. */
function payosWebhook(orderCode: string, amount: number, overrides: Record<string, unknown> = {}) {
  const data = {
    orderCode: Number(orderCode),
    amount,
    description: 'ORDABC123',
    accountNumber: '12345678',
    reference: `FT${randomUUID().slice(0, 12)}`,
    transactionDateTime: vietnamNow(),
    currency: 'VND',
    paymentLinkId: `plink_${orderCode}`,
    code: '00',
    desc: 'success',
    counterAccountBankId: '970422',
    counterAccountBankName: 'MB Bank',
    counterAccountName: 'NGUYEN VAN A',
    counterAccountNumber: PAYER_ACCOUNT,
    virtualAccountName: null,
    virtualAccountNumber: null,
    ...overrides,
  };
  return {
    code: '00',
    desc: 'success',
    success: true,
    data,
    signature: payosSignatureOf(data, TEST_PAYOS_CHECKSUM_KEY),
  };
}

function sendPayos(body: unknown) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/webhooks/payments/payos',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify(body),
  });
}

async function paymentOfOrder(orderId: string) {
  const res = await client.query<{ provider: string; provider_reference: string; status: string }>(
    `SELECT provider, provider_reference, status FROM payments WHERE order_id = $1`,
    [orderId],
  );
  return res.rows[0]!;
}

describe('PayOS — đơn kiosk (FR-ORD-08, 13, 14, 15)', () => {
  it('test_FR_ORD_08_payos_kiosk_order_gets_vietqr_and_order_code', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/kiosk/orders',
      headers: { 'idempotency-key': randomUUID() },
      payload: { machineSerial: fx.machineSerial, slotId: fx.slots[0] },
    });
    expect(res.statusCode, res.body).toBe(201);
    const { order, qrPayload } = res.json<{
      order: { id: string; paymentReference: string; amount: string };
      qrPayload: string;
    }>();

    const payment = await paymentOfOrder(order.id);
    expect(payment.provider).toBe('payos');
    // Mã khách thấy vẫn là ORD-…; mã gửi PayOS là orderCode số nguyên (ADR-0016).
    expect(order.paymentReference).toMatch(/^ORD-/);
    expect(payment.provider_reference).toMatch(/^\d+$/);
    expect(qrPayload).toBe(`00020101021238VIETQR${payment.provider_reference}`);
    const sent = payosRequests.find((r) => String(r['orderCode']) === payment.provider_reference);
    expect(sent).toMatchObject({ amount: Number(order.amount) });
  });

  it('test_FR_ORD_14_payos_webhook_settles_kiosk_order_once', async () => {
    const order = await flow.createOrder(1);
    const payment = await paymentOfOrder(order.id);
    const webhook = payosWebhook(payment.provider_reference, Number(order.amount));

    const first = await sendPayos(webhook);
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json()).toEqual({ result: 'PROCESSED' });
    expect((await flow.orderRow(order.id))?.status).toBe('PAID');

    // PayOS gửi lại cùng giao dịch → xử lý đúng một lần (FR-ORD-15).
    expect((await sendPayos(webhook)).json()).toEqual({ result: 'WEBHOOK_ALREADY_PROCESSED' });

    // Tài khoản người chuyển không được lưu (NFR-DAT-04, ADR-0012 quy tắc 8).
    const stored = await client.query<{ payload: unknown }>(
      `SELECT payload FROM payment_events WHERE provider = 'payos' AND payment_id IN
         (SELECT id FROM payments WHERE order_id = $1)`,
      [order.id],
    );
    expect(stored.rowCount).toBe(1);
    expect(JSON.stringify(stored.rows[0]!.payload)).not.toContain(PAYER_ACCOUNT);

    await client.query(`UPDATE orders SET status = 'FAILED' WHERE id = $1`, [order.id]);
  });

  it('test_FR_ORD_13_payos_webhook_rejects_tampered_signature_and_wrong_amount', async () => {
    const order = await flow.createOrder(2);
    const payment = await paymentOfOrder(order.id);

    const tampered = payosWebhook(payment.provider_reference, Number(order.amount));
    tampered.data.amount = 1;
    const bad = await sendPayos(tampered);
    expect(bad.statusCode).toBe(401);
    expect(bad.json()).toMatchObject({ code: 'INVALID_WEBHOOK_SIGNATURE' });

    // Ký đúng nhưng số tiền lệch đơn → 400, không PAID (FR-ORD-14 AC2).
    const short = await sendPayos(payosWebhook(payment.provider_reference, 1000));
    expect(short.statusCode).toBe(400);
    expect(short.json()).toMatchObject({ code: 'AMOUNT_MISMATCH' });
    expect((await flow.orderRow(order.id))?.status).toBe('PENDING_PAYMENT');
  });

  it('test_FR_ORD_14_payos_signed_webhook_with_unknown_order_code_acknowledged', async () => {
    // Giao dịch mẫu PayOS gửi lúc xác nhận URL webhook: chữ ký đúng, orderCode lạ (ADR-0016).
    const res = await sendPayos(payosWebhook('123', 2000));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ result: 'UNKNOWN_REFERENCE' });
  });
});

describe('PayOS — hóa đơn thuê slot (FR-SLT-37, FR-SLT-38)', () => {
  it('test_FR_SLT_38_payos_webhook_pays_rental_checkout', async () => {
    const checkoutRes = await brandA('POST', '/rental-checkouts', {
      payload: { items: [{ slotId: vacantSlot, rentalPackageId: packageId, storagePlanId }] },
    });
    expect(checkoutRes.statusCode, checkoutRes.body).toBe(201);
    const checkout = checkoutRes.json<{ id: string; totalAmount: string }>();

    const payRes = await brandA('POST', `/rental-checkouts/${checkout.id}/payments`);
    expect(payRes.statusCode, payRes.body).toBe(200);
    const intent = payRes.json<{ paymentId: string; checkoutUrl: string | null }>();
    const payment = (
      await client.query<{ provider: string; provider_reference: string; amount: string }>(
        `SELECT provider, provider_reference, amount FROM payments WHERE id = $1`,
        [intent.paymentId],
      )
    ).rows[0]!;
    expect(payment.provider).toBe('payos');
    expect(intent.checkoutUrl).toBe(`https://pay.payos.vn/web/${payment.provider_reference}`);

    const res = await sendPayos(payosWebhook(payment.provider_reference, Number(payment.amount)));
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ result: 'PROCESSED' });

    const rentals = await client.query<{ invoice_number: string | null; paid_at: Date | null }>(
      `SELECT invoice_number, paid_at FROM slot_rentals WHERE checkout_id = $1`,
      [checkout.id],
    );
    expect(rentals.rows).toHaveLength(1);
    expect(rentals.rows[0]!.invoice_number).toMatch(/^HD-/);
    expect(rentals.rows[0]!.paid_at).not.toBeNull();
  });
});
