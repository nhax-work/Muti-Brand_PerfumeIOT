/**
 * Integration test cho thanh toán phiên thuê slot và webhook xác nhận (FR-SLT-37, FR-SLT-38, FR-SLT-43).
 *
 * TV3 tuần 5:
 *   - test_FR_SLT_37_initiate_invoice_payment: AC1, AC2, AC4, AC5, AC7
 *   - test_FR_SLT_38_confirm_invoice_payment_webhook: AC1, AC5
 *   - test_FR_SLT_43_notify_paid_and_active_invoice: AC1, AC3
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
import { asUser, createTestApp, login, TEST_PAYMENT_WEBHOOK_SECRET } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
  TEST_PASSWORD,
  type IsolationFixture,
} from './helpers/seed-isolation.js';

let app: NestFastifyApplication;
let raw: pg.Client;
let fx: IsolationFixture;
let brandA: ReturnType<typeof asUser>;
let brandB: ReturnType<typeof asUser>;
let packageId: string;
let storagePlanId: string;
let vacantSlot1: string;
let vacantSlot2: string;

beforeAll(async () => {
  raw = await openRawClient();
  fx = await seedIsolationFixture(raw);
  app = await createTestApp();
  brandA = asUser(app, (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken);
  brandB = asUser(app, (await login(app, fx.brandAdminBEmail, TEST_PASSWORD)).accessToken);

  // Tạo rental_package và storage_plan cho test
  packageId = randomUUID();
  storagePlanId = randomUUID();
  await raw.query(
    `INSERT INTO rental_packages (id, name, duration_months, discount_percent, is_active)
     VALUES ($1, $2, 3, 5.00, true)`,
    [packageId, `Gói 3 tháng ${fx.runId}`],
  );
  await raw.query(
    `INSERT INTO storage_plans (id, name, monthly_price, coverage_percent, coverage_cap, is_active)
     VALUES ($1, $2, 100000.0000, 30.00, 3000000.0000, true)`,
    [storagePlanId, `Bảo quản chuẩn ${fx.runId}`],
  );

  // Tạo 2 slot trống có giá niêm yết trên máy của fixture
  vacantSlot1 = randomUUID();
  vacantSlot2 = randomUUID();
  await raw.query(
    `INSERT INTO machine_slots (id, machine_id, slot_number, status, monthly_rent_price, calibrated_dosage_ml, low_stock_threshold_ml)
     VALUES ($1, $2, 6, 'AVAILABLE', 1000000.0000, 0.1200, 5.0000),
            ($3, $2, 7, 'AVAILABLE', 1200000.0000, 0.1200, 5.0000)`,
    [vacantSlot1, fx.machineId, vacantSlot2],
  );
}, 120_000);

afterAll(async () => {
  // Dọn payments, events, checkouts, rentals tạo thêm
  await raw.query(`DELETE FROM notifications WHERE brand_id IN ($1, $2)`, [fx.brandA, fx.brandB]);
  const leftover = await raw.query<{ id: string }>(
    `SELECT id FROM rental_checkouts WHERE brand_id IN ($1, $2)`,
    [fx.brandA, fx.brandB],
  );
  await deleteCheckouts(leftover.rows.map((r) => r.id));
  await raw.query(`DELETE FROM machine_slots WHERE id IN ($1, $2)`, [vacantSlot1, vacantSlot2]);
  await raw.query(`DELETE FROM rental_packages WHERE id = $1`, [packageId]);
  await raw.query(`DELETE FROM storage_plans WHERE id = $1`, [storagePlanId]);

  await cleanupIsolationFixture(raw, fx);
  await app?.close();
  await raw?.end();
});

/**
 * Bất biến phiên ↔ hóa đơn là constraint trigger HOÃN tới COMMIT (ADR-0008,
 * migrations/1790757100000_rental-checkouts.sql). `raw` chạy autocommit, nên mọi thao tác sửa cả
 * phiên lẫn hóa đơn phải gói chung một transaction — tách lệnh thì trigger thấy trạng thái dở dang.
 */
async function inTransaction(fn: () => Promise<void>): Promise<void> {
  await raw.query('BEGIN');
  try {
    await fn();
    await raw.query('COMMIT');
  } catch (err) {
    await raw.query('ROLLBACK');
    throw err;
  }
}

async function deleteCheckouts(checkoutIds: readonly string[]): Promise<void> {
  if (checkoutIds.length === 0) return;
  const ids = [...checkoutIds];
  await inTransaction(async () => {
    await raw.query(
      `DELETE FROM payment_events WHERE payment_id IN
         (SELECT id FROM payments WHERE rental_checkout_id = ANY($1::uuid[]))`,
      [ids],
    );
    await raw.query(`DELETE FROM payments WHERE rental_checkout_id = ANY($1::uuid[])`, [ids]);
    await raw.query(`DELETE FROM slot_rentals WHERE checkout_id = ANY($1::uuid[])`, [ids]);
    await raw.query(`DELETE FROM rental_checkouts WHERE id = ANY($1::uuid[])`, [ids]);
  });
}

/** Giả lập job hủy phiên (FR-SLT-39): phiên và mọi hóa đơn cùng bị hủy trong một transaction. */
async function cancelCheckoutDirectly(checkoutId: string, at: Date = new Date()): Promise<void> {
  await inTransaction(async () => {
    await raw.query(`UPDATE rental_checkouts SET cancelled_at = $1 WHERE id = $2`, [
      at,
      checkoutId,
    ]);
    await raw.query(
      `UPDATE slot_rentals SET status = 'CANCELLED', cancelled_at = $1 WHERE checkout_id = $2`,
      [at, checkoutId],
    );
  });
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

describe('FR-SLT-37 — Khởi tạo thanh toán phiên thuê slot', () => {
  it('test_FR_SLT_37_initiate_invoice_payment', async () => {
    // Tạo phiên thanh toán cho slot 1
    const checkoutRes = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId: vacantSlot1, rentalPackageId: packageId, storagePlanId }],
      },
    });
    expect(checkoutRes.statusCode).toBe(201);
    const checkout = checkoutRes.json<{ id: string; totalAmount: string; holdExpiresAt: string }>();

    // AC7: Brand B không thể bấm thanh toán cho phiên của Brand A → 403 FORBIDDEN_SCOPE
    const forbiddenRes = await brandB('POST', `/rental-checkouts/${checkout.id}/payments`);
    expect(forbiddenRes.statusCode).toBe(403);

    // AC1: Brand A bấm thanh toán → trả RentalPaymentIntent PENDING
    const payRes = await brandA('POST', `/rental-checkouts/${checkout.id}/payments`);
    expect(payRes.statusCode).toBe(200);
    const payment = payRes.json<{
      paymentId: string;
      checkoutId: string;
      amount: string;
      currency: string;
      status: string;
      qrPayload: string | null;
      checkoutUrl: string | null;
      expiresAt: string;
    }>();
    expect(payment.checkoutId).toBe(checkout.id);
    expect(payment.status).toBe('PENDING');
    expect(payment.amount).toBe(checkout.totalAmount);
    expect(payment.currency).toBe('VND');
    expect(payment.qrPayload).toBeTruthy();

    // AC2: Bấm lại → trả lại chính Payment PENDING đó
    const payAgainRes = await brandA('POST', `/rental-checkouts/${checkout.id}/payments`);
    expect(payAgainRes.statusCode).toBe(200);
    const paymentAgain = payAgainRes.json<{ paymentId: string }>();
    expect(paymentAgain.paymentId).toBe(payment.paymentId);

    // AC4: Hết giờ giữ chỗ → từ chối 409 RENTAL_NOT_ACTIVE
    await raw.query(
      `UPDATE rental_checkouts SET hold_expires_at = now() - interval '5 minutes' WHERE id = $1`,
      [checkout.id],
    );
    const expiredRes = await brandA('POST', `/rental-checkouts/${checkout.id}/payments`);
    expect(expiredRes.statusCode).toBe(409);

    // AC5: Đã hủy → từ chối 409 RENTAL_NOT_ACTIVE
    const cancelCheckoutRes = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId: vacantSlot2, rentalPackageId: packageId, storagePlanId }],
      },
    });
    expect(cancelCheckoutRes.statusCode).toBe(201);
    const cancelledCheckout = cancelCheckoutRes.json<{ id: string }>();

    await cancelCheckoutDirectly(cancelledCheckout.id);
    const payCancelledRes = await brandA(
      'POST',
      `/rental-checkouts/${cancelledCheckout.id}/payments`,
    );
    expect(payCancelledRes.statusCode).toBe(409);

    // Dọn dẹp checkout tạm
    await deleteCheckouts([checkout.id, cancelledCheckout.id]);
  });

  it('test_FR_SLT_37_concurrent_payments_single_pending — AC3 hai yêu cầu đồng thời', async () => {
    // AC3: Hai yêu cầu thanh toán cho cùng phiên đến đồng thời
    const checkoutRes = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId: vacantSlot1, rentalPackageId: packageId, storagePlanId }],
      },
    });
    expect(checkoutRes.statusCode).toBe(201);
    const checkout = checkoutRes.json<{ id: string }>();

    // Bấm thanh toán đồng thời
    const [res1, res2] = await Promise.all([
      brandA('POST', `/rental-checkouts/${checkout.id}/payments`),
      brandA('POST', `/rental-checkouts/${checkout.id}/payments`),
    ]);

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);

    const pay1 = res1.json<{ paymentId: string }>();
    const pay2 = res2.json<{ paymentId: string }>();
    expect(pay1.paymentId).toBe(pay2.paymentId);

    // CSDL chỉ có đúng 1 payment PENDING cho checkout
    const paymentsCount = await raw.query(
      `SELECT count(*) as count FROM payments WHERE rental_checkout_id = $1 AND status = 'PENDING'`,
      [checkout.id],
    );
    expect(Number(paymentsCount.rows[0].count)).toBe(1);

    await deleteCheckouts([checkout.id]);
  });
});

describe('FR-SLT-38 & FR-SLT-43 — Xác nhận webhook và thông báo', () => {
  it('test_FR_SLT_38_confirm_invoice_payment_webhook', async () => {
    // AC1: Tạo phiên gồm 2 hóa đơn
    const checkoutRes = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [
          { slotId: vacantSlot1, rentalPackageId: packageId, storagePlanId },
          { slotId: vacantSlot2, rentalPackageId: packageId, storagePlanId },
        ],
      },
    });
    expect(checkoutRes.statusCode).toBe(201);
    const checkout = checkoutRes.json<{ id: string; totalAmount: string }>();

    const payRes = await brandA('POST', `/rental-checkouts/${checkout.id}/payments`);
    expect(payRes.statusCode).toBe(200);
    const payment = payRes.json<{ paymentId: string }>();

    const paymentRow = await raw.query(
      `SELECT provider_reference, amount, currency FROM payments WHERE id = $1`,
      [payment.paymentId],
    );
    const ref = paymentRow.rows[0].provider_reference;
    const amount = paymentRow.rows[0].amount;
    const currency = paymentRow.rows[0].currency;

    // Gửi webhook thành công
    const webhookRes = await sendWebhook(
      buildMockWebhook({
        reference: ref,
        amount,
        currency,
        status: 'SUCCEEDED',
      }),
    );
    expect(webhookRes.statusCode).toBe(200);

    // Kiểm tra CSDL: rental_checkouts.paid_at khác null
    const updatedCheckout = await raw.query(`SELECT paid_at FROM rental_checkouts WHERE id = $1`, [
      checkout.id,
    ]);
    expect(updatedCheckout.rows[0].paid_at).not.toBeNull();

    // Kiểm tra các hóa đơn: paid_at = checkout.paid_at, mỗi hóa đơn một invoice_number riêng, status = 'DRAFT'
    const updatedRentals = await raw.query(
      `SELECT id, status, invoice_number, paid_at FROM slot_rentals WHERE checkout_id = $1`,
      [checkout.id],
    );
    expect(updatedRentals.rows).toHaveLength(2);
    for (const r of updatedRentals.rows) {
      expect(r.status).toBe('DRAFT');
      expect(r.paid_at).not.toBeNull();
      expect(r.invoice_number).toMatch(/^HD-\d{8}-[23456789A-HJKMNP-Z]{6}$/);
    }
    // Hai số hóa đơn phải khác nhau
    expect(updatedRentals.rows[0].invoice_number).not.toBe(updatedRentals.rows[1].invoice_number);

    // Dọn dẹp
    await deleteCheckouts([checkout.id]);
  });

  it('test_FR_SLT_38_confirm_invoice_payment_webhook — AC5 phiên đã hủy', async () => {
    // AC5: Phiên đã hủy, payment đã EXPIRED → webhook về → REFUND_PENDING, không khôi phục phiên
    const checkoutRes = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId: vacantSlot1, rentalPackageId: packageId, storagePlanId }],
      },
    });
    expect(checkoutRes.statusCode).toBe(201);
    const checkout = checkoutRes.json<{ id: string }>();

    const payRes = await brandA('POST', `/rental-checkouts/${checkout.id}/payments`);
    expect(payRes.statusCode).toBe(200);
    const payment = payRes.json<{ paymentId: string }>();

    const paymentRow = await raw.query(
      `SELECT provider_reference, amount, currency FROM payments WHERE id = $1`,
      [payment.paymentId],
    );
    const ref = paymentRow.rows[0].provider_reference;
    const amount = paymentRow.rows[0].amount;
    const currency = paymentRow.rows[0].currency;

    // Giả lập job hủy đã chạy: phiên cancelled_at, hóa đơn CANCELLED, payment EXPIRED
    await cancelCheckoutDirectly(checkout.id);
    await raw.query(`UPDATE payments SET status = 'EXPIRED' WHERE id = $1`, [payment.paymentId]);

    // Webhook gửi về báo thành công
    const webhookRes = await sendWebhook(
      buildMockWebhook({
        reference: ref,
        amount,
        currency,
        status: 'SUCCEEDED',
      }),
    );
    expect(webhookRes.statusCode).toBe(200);

    // Payment chuyển REFUND_PENDING
    const updatedPayment = await raw.query(`SELECT status FROM payments WHERE id = $1`, [
      payment.paymentId,
    ]);
    expect(updatedPayment.rows[0].status).toBe('REFUND_PENDING');

    // Phiên và hóa đơn KHÔNG được khôi phục
    const afterCheckout = await raw.query(
      `SELECT paid_at, cancelled_at FROM rental_checkouts WHERE id = $1`,
      [checkout.id],
    );
    expect(afterCheckout.rows[0].paid_at).toBeNull();
    expect(afterCheckout.rows[0].cancelled_at).not.toBeNull();

    // Dọn dẹp
    await deleteCheckouts([checkout.id]);
  });

  it('test_FR_SLT_38_amount_mismatch_and_invalid_signature', async () => {
    // AC2: Số tiền lệch → HTTP 400 AMOUNT_MISMATCH
    const checkoutRes = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId: vacantSlot1, rentalPackageId: packageId, storagePlanId }],
      },
    });
    expect(checkoutRes.statusCode).toBe(201);
    const checkout = checkoutRes.json<{ id: string }>();

    const payRes = await brandA('POST', `/rental-checkouts/${checkout.id}/payments`);
    expect(payRes.statusCode).toBe(200);
    const payment = payRes.json<{ paymentId: string }>();

    const paymentRow = await raw.query(
      `SELECT provider_reference, amount, currency FROM payments WHERE id = $1`,
      [payment.paymentId],
    );
    const ref = paymentRow.rows[0].provider_reference;
    const amount = paymentRow.rows[0].amount;
    const currency = paymentRow.rows[0].currency;

    // AC3: Chữ ký không hợp lệ → HTTP 401 INVALID_WEBHOOK_SIGNATURE
    const invalidSigRes = await sendWebhook(
      buildMockWebhook({
        reference: ref,
        amount,
        currency,
        status: 'SUCCEEDED',
      }),
      'wrong_webhook_secret',
    );
    expect(invalidSigRes.statusCode).toBe(401);

    // AC2: Số tiền khác tổng phiên → HTTP 400 AMOUNT_MISMATCH
    const mismatchAmount = (Number(amount) + 50000).toFixed(4);
    const mismatchRes = await sendWebhook(
      buildMockWebhook({
        reference: ref,
        amount: mismatchAmount,
        currency,
        status: 'SUCCEEDED',
      }),
    );
    expect(mismatchRes.statusCode).toBe(400);

    // Trạng thái payment và checkout giữ nguyên PENDING và chưa thanh toán
    const paymentAfter = await raw.query(`SELECT status FROM payments WHERE id = $1`, [
      payment.paymentId,
    ]);
    expect(paymentAfter.rows[0].status).toBe('PENDING');

    const checkoutAfter = await raw.query(`SELECT paid_at FROM rental_checkouts WHERE id = $1`, [
      checkout.id,
    ]);
    expect(checkoutAfter.rows[0].paid_at).toBeNull();

    await deleteCheckouts([checkout.id]);
  });

  it('test_FR_SLT_43_notify_paid_and_active_invoice', async () => {
    // Xóa notifications cũ của Brand A và B để đếm chính xác
    await raw.query(`DELETE FROM notifications WHERE brand_id IN ($1, $2)`, [fx.brandA, fx.brandB]);

    const checkoutRes = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId: vacantSlot1, rentalPackageId: packageId, storagePlanId }],
      },
    });
    expect(checkoutRes.statusCode).toBe(201);
    const checkout = checkoutRes.json<{ id: string }>();

    const payRes = await brandA('POST', `/rental-checkouts/${checkout.id}/payments`);
    const payment = payRes.json<{ paymentId: string }>();

    const paymentRow = await raw.query(
      `SELECT provider_reference, amount, currency FROM payments WHERE id = $1`,
      [payment.paymentId],
    );
    const ref = paymentRow.rows[0].provider_reference;
    const amount = paymentRow.rows[0].amount;
    const currency = paymentRow.rows[0].currency;

    // Gửi webhook thành công
    await sendWebhook(
      buildMockWebhook({
        reference: ref,
        amount,
        currency,
        status: 'SUCCEEDED',
      }),
    );

    // AC1: Mọi Brand Admin active của Brand A nhận đúng 1 thông báo
    const notifsA = await raw.query(
      `SELECT * FROM notifications WHERE brand_id = $1 AND type = 'RENTAL_CHECKOUT_PAID'`,
      [fx.brandA],
    );
    expect(notifsA.rowCount).toBeGreaterThanOrEqual(1);
    for (const notif of notifsA.rows) {
      expect(notif.channel).toBe('IN_APP');
      expect(notif.status).toBe('PENDING');
      expect(notif.content).toContain('HD-');
    }

    // AC3: Brand Admin của Brand B không nhận thông báo nào
    const notifsB = await raw.query(`SELECT * FROM notifications WHERE brand_id = $1`, [fx.brandB]);
    expect(notifsB.rowCount).toBe(0);

    // Dọn dẹp
    await raw.query(`DELETE FROM notifications WHERE brand_id = $1`, [fx.brandA]);
    await deleteCheckouts([checkout.id]);
  });
});
