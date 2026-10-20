/**
 * Integration test cho Luồng Vàng (Task 6):
 * Đăng ký thương hiệu -> Xác minh email (test double) -> Đăng nhập Brand Admin ->
 * Ký hợp đồng khung -> Giữ chỗ slot -> Ký phụ lục điện tử -> Thanh toán qua Mock Gateway ->
 * Webhook xác nhận -> Phiên PAID + Sinh mã HD-... + Ghi đúng 1 thông báo RENTAL_CHECKOUT_PAID ->
 * Webhook trùng lặp xử lý idempotent (không sinh mã HD mới, không nhân đôi thông báo).
 *
 * Tham chiếu spec:
 * - FR-USR-06, FR-USR-07 (ADR-0013): Đăng ký thương hiệu & xác minh email.
 * - FR-SLT-48, FR-SLT-49 (ADR-0013): Hợp đồng khung dịch vụ điện tử.
 * - FR-SLT-50 (ADR-0013): Phụ lục hợp đồng thuê slot điện tử.
 * - FR-SLT-37, FR-SLT-38, FR-SLT-43: Tạo thanh toán, webhook, kích hoạt hóa đơn.
 * - ADR-0006: Mã hóa đơn HD-YYYYMMDD-XXXXXX.
 */

import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthService } from '../../apps/api/src/modules/auth/auth.service.js';
import type { EmailVerificationSender } from '../../apps/api/src/modules/auth/email-verification-sender.js';
import {
  buildMockWebhook,
  MOCK_SIGNATURE_HEADER,
  signMockPayload,
  type MockWebhookBody,
} from '../../apps/api/src/modules/ord/payment/mock-gateway.js';
import { asUser, createTestApp, TEST_PAYMENT_WEBHOOK_SECRET } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
  TEST_PASSWORD,
  type IsolationFixture,
} from './helpers/seed-isolation.js';

class CapturingEmailSender implements EmailVerificationSender {
  lastEmail: string | null = null;
  lastToken: string | null = null;

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    this.lastEmail = email;
    this.lastToken = token;
  }
}

describe('Golden Path Integration Test (Task 6)', () => {
  let app: NestFastifyApplication;
  let raw: pg.Client;
  let fx: IsolationFixture;
  let capturingSender: CapturingEmailSender;
  let packageId: string;
  let storagePlanId: string;
  let slotId: string;
  let createdBrandId: string | null = null;
  let createdCheckoutId: string | null = null;

  beforeAll(async () => {
    raw = await openRawClient();
    fx = await seedIsolationFixture(raw);
    app = await createTestApp();

    capturingSender = new CapturingEmailSender();
    const authService = app.get(AuthService);
    authService.setEmailSender(capturingSender);

    packageId = randomUUID();
    storagePlanId = randomUUID();
    slotId = randomUUID();

    await raw.query(
      `INSERT INTO rental_packages (id, name, duration_months, discount_percent, is_active)
       VALUES ($1, $2, 3, 5.00, true)`,
      [packageId, `Gói Golden Path 3T ${fx.runId}`],
    );

    await raw.query(
      `INSERT INTO storage_plans (id, name, monthly_price, coverage_percent, coverage_cap, is_active)
       VALUES ($1, $2, 100000.0000, 30.00, 3000000.0000, true)`,
      [storagePlanId, `Bảo quản Golden Path ${fx.runId}`],
    );

    await raw.query(
      `INSERT INTO machine_slots (id, machine_id, slot_number, status, monthly_rent_price, calibrated_dosage_ml, low_stock_threshold_ml)
       VALUES ($1, $2, 8, 'AVAILABLE', 1000000.0000, 0.1200, 5.0000)`,
      [slotId, fx.machineId],
    );
  }, 120_000);

  afterAll(async () => {
    await raw.query("SET session_replication_role = 'replica'");
    if (createdBrandId) {
      await raw.query(`DELETE FROM notifications WHERE brand_id = $1`, [createdBrandId]);
      if (createdCheckoutId) {
        await raw.query(
          `DELETE FROM payment_events WHERE payment_id IN
             (SELECT id FROM payments WHERE rental_checkout_id = $1)`,
          [createdCheckoutId],
        );
        await raw.query(`DELETE FROM agreement_acceptances WHERE rental_checkout_id = $1`, [
          createdCheckoutId,
        ]);
        await raw.query(`DELETE FROM payments WHERE rental_checkout_id = $1`, [createdCheckoutId]);
        await raw.query(`DELETE FROM slot_rentals WHERE checkout_id = $1`, [createdCheckoutId]);
        await raw.query(`DELETE FROM rental_checkouts WHERE id = $1`, [createdCheckoutId]);
      }
      await raw.query(`DELETE FROM email_verifications WHERE email LIKE $1`, [`%${fx.runId}%`]);
      await raw.query(`DELETE FROM agreement_acceptances WHERE brand_id = $1`, [createdBrandId]);
      await raw.query(`DELETE FROM users WHERE brand_id = $1`, [createdBrandId]);
      await raw.query(`DELETE FROM brands WHERE id = $1`, [createdBrandId]);
    }

    await raw.query(`DELETE FROM machine_slots WHERE id = $1`, [slotId]);
    await raw.query(`DELETE FROM rental_packages WHERE id = $1`, [packageId]);
    await raw.query(`DELETE FROM storage_plans WHERE id = $1`, [storagePlanId]);
    await raw.query("SET session_replication_role = 'origin'");

    await cleanupIsolationFixture(raw, fx);
    await app?.close();
    await raw?.end();
  });

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

  it('thực hiện trọn vẹn luồng vàng từ tự đăng ký đến thanh toán, hóa đơn HD-... và thông báo thành công', async () => {
    const brandEmail = `golden.${fx.runId}@hoanggia.vn`;
    const brandName = `Nước Hoa Hoàng Gia ${fx.runId}`;

    // 1. Tự đăng ký thương hiệu (FR-USR-06)
    const registerRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register-brand',
      payload: {
        brandName,
        email: brandEmail,
        password: TEST_PASSWORD,
        fullName: 'Nguyễn Văn Hoàng',
      },
    });
    expect(registerRes.statusCode).toBe(201);
    const regData = registerRes.json<{ brandId: string; userId: string; email: string }>();
    createdBrandId = regData.brandId;
    expect(regData.brandId).toBeDefined();
    expect(regData.userId).toBeDefined();
    expect(regData.email).toBe(brandEmail);

    // Kiểm tra test double nhận được rawToken (không dùng cờ env dev)
    expect(capturingSender.lastEmail).toBe(brandEmail);
    expect(capturingSender.lastToken).toBeTruthy();
    const rawVerificationToken = capturingSender.lastToken!;

    // 2. Xác minh email (FR-USR-07)
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: { token: rawVerificationToken },
    });
    expect(verifyRes.statusCode).toBe(204);

    // 3. Đăng nhập Brand Admin (FR-AUTH-01)
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: brandEmail, password: TEST_PASSWORD },
    });
    expect(loginRes.statusCode).toBe(200);
    const { accessToken } = loginRes.json<{ accessToken: string }>();
    const brandAdmin = asUser(app, accessToken);

    // 4. Kiểm tra và đồng ý hợp đồng khung dịch vụ (FR-SLT-48, FR-SLT-49, ADR-0013)
    const currentAgRes = await brandAdmin('GET', '/agreements/current');
    expect(currentAgRes.statusCode).toBe(200);
    const agData = currentAgRes.json<{
      agreement: { id: string; version: string; contentHash: string };
      acceptance: unknown;
    }>();
    expect(agData.agreement).toBeDefined();

    const acceptAgRes = await brandAdmin('POST', `/agreements/${agData.agreement.version}/accept`, {
      payload: {
        contentHash: agData.agreement.contentHash,
      },
    });
    expect(acceptAgRes.statusCode).toBe(201);

    // 5. Chọn slot trống và tạo phiên thanh toán giữ chỗ (FR-SLT-56, FR-SLT-37)
    const checkoutRes = await brandAdmin('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId, rentalPackageId: packageId, storagePlanId }],
      },
    });
    expect(checkoutRes.statusCode).toBe(201);
    const checkoutData = checkoutRes.json<{
      id: string;
      stage: string;
      totalAmount: string;
      invoices: { id: string; slotId: string }[];
    }>();
    createdCheckoutId = checkoutData.id;
    expect(checkoutData.stage).toBe('AWAITING_PAYMENT');
    expect(checkoutData.invoices).toHaveLength(1);

    // 6. Đọc phụ lục hợp đồng và đồng ý phụ lục điện tử (FR-SLT-50, ADR-0013)
    const annexRes = await brandAdmin('GET', `/rental-checkouts/${checkoutData.id}/annex`);
    expect(annexRes.statusCode).toBe(200);
    const annex = annexRes.json<{ contentHash: string; content: string }>();
    expect(annex.contentHash).toBeDefined();

    const acceptAnnexRes = await brandAdmin(
      'POST',
      `/rental-checkouts/${checkoutData.id}/annex/accept`,
      {
        payload: { contentHash: annex.contentHash },
      },
    );
    expect(acceptAnnexRes.statusCode).toBe(201);

    // 7. Khởi tạo thanh toán PayOS/Mock (FR-SLT-37)
    const payRes = await brandAdmin('POST', `/rental-checkouts/${checkoutData.id}/payments`);
    expect(payRes.statusCode).toBe(200);
    const payment = payRes.json<{
      paymentId: string;
      qrPayload: string;
      checkoutUrl: string | null;
    }>();
    expect(payment.paymentId).toBeDefined();
    expect(payment.qrPayload).toBeDefined();

    const paymentRow = await raw.query<{
      provider_reference: string;
      amount: string;
      currency: string;
    }>(`SELECT provider_reference, amount, currency FROM payments WHERE id = $1`, [
      payment.paymentId,
    ]);
    const { provider_reference: ref, amount, currency } = paymentRow.rows[0]!;

    // 8. Cổng thanh toán gọi Webhook xác nhận (FR-SLT-38, FR-ORD-13)
    const webhookPayload = buildMockWebhook({
      reference: ref,
      amount,
      currency,
      status: 'SUCCEEDED',
    });

    const webhookRes = await sendWebhook(webhookPayload);
    expect(webhookRes.statusCode).toBe(200);

    // 9. Xác minh phiên đã PAID, hóa đơn có mã chuẩn HD-... (ADR-0006)
    const detailRes = await brandAdmin('GET', `/rental-checkouts/${checkoutData.id}`);
    expect(detailRes.statusCode).toBe(200);
    const detail = detailRes.json<{
      stage: string;
      invoices: { id: string; invoiceNumber: string; slotId: string }[];
    }>();
    expect(detail.stage).toBe('PAID');
    expect(detail.invoices).toHaveLength(1);
    const invoice = detail.invoices[0]!;
    expect(invoice.invoiceNumber).toMatch(/^HD-\d{8}-[A-Z0-9]{6}$/);

    // 10. Xác minh đúng 1 thông báo thành công trong bảng `notifications` (FR-SLT-43)
    const notifRows = await raw.query<{
      id: string;
      brand_id: string;
      recipient_user_id: string;
      type: string;
      subject: string;
    }>(
      `SELECT id, brand_id, recipient_user_id, type, subject FROM notifications
       WHERE brand_id = $1 AND recipient_user_id = $2 AND type = 'RENTAL_CHECKOUT_PAID'`,
      [regData.brandId, regData.userId],
    );
    expect(notifRows.rows).toHaveLength(1);
    expect(notifRows.rows[0]?.type).toBe('RENTAL_CHECKOUT_PAID');
    expect(notifRows.rows[0]?.subject).toContain(invoice.invoiceNumber);

    // Slot rental được kích hoạt ở trạng thái DRAFT (chờ kỹ thuật viên/thương hiệu lắp chai, FR-SLT-03)
    const slotRentalRow = await raw.query<{ status: string; invoice_number: string }>(
      `SELECT status, invoice_number FROM slot_rentals WHERE checkout_id = $1`,
      [checkoutData.id],
    );
    expect(slotRentalRow.rows[0]?.status).toBe('DRAFT');
    expect(slotRentalRow.rows[0]?.invoice_number).toMatch(/^HD-\d{8}-[23456789A-HJKMNP-Z]{6}$/);

    // 11. Webhook trùng lặp xử lý idempotent (không tạo mã HD mới, không nhân đôi thông báo)
    const dupWebhookRes = await sendWebhook(webhookPayload);
    expect(dupWebhookRes.statusCode).toBe(200);

    // Hóa đơn vẫn giữ nguyên mã cũ
    const detailAfterDup = (await brandAdmin('GET', `/rental-checkouts/${checkoutData.id}`)).json<{
      stage: string;
      invoices: { invoiceNumber: string }[];
    }>();
    expect(detailAfterDup.stage).toBe('PAID');
    expect(detailAfterDup.invoices[0]?.invoiceNumber).toBe(invoice.invoiceNumber);

    // Vẫn duy nhất 1 thông báo trong bảng notifications
    const notifAfterDup = await raw.query<{ count: string }>(
      `SELECT count(*)::text as count FROM notifications
       WHERE brand_id = $1 AND recipient_user_id = $2 AND type = 'RENTAL_CHECKOUT_PAID'`,
      [regData.brandId, regData.userId],
    );
    expect(Number(notifAfterDup.rows[0]?.count)).toBe(1);
  });
});
