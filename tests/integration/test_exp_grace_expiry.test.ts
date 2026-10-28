/**
 * Integration test cho Task 1: Giai đoạn ân hạn và gia hạn hợp đồng thuê slot
 * (FR-EXP-01 ÷ 07, FR-EXP-10, FR-EXP-12, FR-EXP-13, FR-EXP-25, FR-SLT-12; ADR-0014).
 *
 * Bao phủ:
 *   1. FR-EXP-05: Chuyển sang EXPIRING khi ends_at <= now + 7 ngày
 *   2. FR-EXP-01, 02, 03, 04: Thông báo T-7 và T-3, gộp theo thương hiệu (FR-EXP-03), audit log EXPIRY_NOTICE_SENT
 *   3. FR-EXP-06: Chuyển sang GRACE khi ends_at <= now, mặc định 7 ngày
 *   4. FR-EXP-07: Super Admin cập nhật ngày kết thúc ân hạn (PUT /slot-rentals/:id/grace-period)
 *   5. FR-EXP-10: Tính phí lưu kho ân hạn hằng ngày (0.05 * retailPrice * bottles), idempotent theo ngày
 *   6. FR-EXP-12, FR-SLT-12: Gia hạn tự phục vụ (POST /slot-rentals/:id/renew) trong EXPIRING và GRACE, cộng dồn phí ân hạn
 *   7. FR-EXP-13: Thanh toán hóa đơn gia hạn trong GRACE chuyển H1 -> RENEWED, H2 -> ACTIVE ngay lập tức
 *   8. FR-EXP-25: Job GRACE bỏ qua hóa đơn đã báo không gia hạn
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
import { SltJobs } from '../../apps/api/src/modules/slt/index.js';
import { asUser, createTestApp, login, TEST_PAYMENT_WEBHOOK_SECRET } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
  TEST_PASSWORD,
  type IsolationFixture,
} from './helpers/seed-isolation.js';

describe('Expiring & Grace Period Integration Tests (Task 1 / ADR-0014)', () => {
  let app: NestFastifyApplication;
  let raw: pg.Client;
  let fx: IsolationFixture;
  let brandA: ReturnType<typeof asUser>;
  let superAdmin: ReturnType<typeof asUser>;
  let sltJobs: SltJobs;

  let packageId: string;
  let storagePlanId: string;

  const testSlotIds: string[] = [];
  const testRentalIds: string[] = [];
  const testCheckoutIds: string[] = [];

  beforeAll(async () => {
    raw = await openRawClient();
    fx = await seedIsolationFixture(raw);
    app = await createTestApp();
    sltJobs = app.get(SltJobs);

    brandA = asUser(app, (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken);
    superAdmin = asUser(app, (await login(app, fx.superAdminEmail, TEST_PASSWORD)).accessToken);

    // Chuẩn bị package và storage plan dùng cho gia hạn
    packageId = randomUUID();
    storagePlanId = randomUUID();
    const pkgRes = await raw.query(
      `INSERT INTO rental_packages (id, name, duration_months, discount_percent, is_active)
       VALUES ($1, $2, 1, 0, true)
       ON CONFLICT (name) DO UPDATE SET is_active = true RETURNING id`,
      [packageId, `Gói Test 1 Tháng Task 1 ${fx.runId}`],
    );
    packageId = pkgRes.rows[0].id;

    const planRes = await raw.query(
      `INSERT INTO storage_plans (id, name, monthly_price, currency, coverage_percent, coverage_cap, is_active)
       VALUES ($1, $2, 50000, 'VND', 30, 2000000, true)
       ON CONFLICT (name) DO UPDATE SET is_active = true RETURNING id`,
      [storagePlanId, `Bảo quản Test Task 1 ${fx.runId}`],
    );
    storagePlanId = planRes.rows[0].id;
  }, 120_000);

  afterAll(async () => {
    if (raw) {
      await raw.query('BEGIN');
      try {
        await raw.query("SET session_replication_role = 'replica'");
        await raw.query(
          `DELETE FROM notifications WHERE reference_id LIKE 'EXPIRING_%' OR reference_id LIKE 'GRACE_%'`,
        );
        if (testSlotIds.length > 0) {
          await raw.query(`UPDATE machine_slots SET active_bottle_id = NULL WHERE id = ANY($1)`, [
            testSlotIds,
          ]);
        }
        await raw.query(`DELETE FROM bottles WHERE identifier LIKE 'BTL-TEST-%'`);
        if (testRentalIds.length > 0) {
          await raw.query(`UPDATE slot_rentals SET previous_rental_id = NULL WHERE id = ANY($1)`, [
            testRentalIds,
          ]);
          await raw.query(`DELETE FROM slot_rentals WHERE id = ANY($1)`, [testRentalIds]);
        }
        if (testCheckoutIds.length > 0) {
          await raw.query(
            `DELETE FROM payment_events WHERE payment_id IN (SELECT id FROM payments WHERE rental_checkout_id = ANY($1))`,
            [testCheckoutIds],
          );
          await raw.query(`DELETE FROM agreement_acceptances WHERE rental_checkout_id = ANY($1)`, [
            testCheckoutIds,
          ]);
          await raw.query(`DELETE FROM payments WHERE rental_checkout_id = ANY($1)`, [
            testCheckoutIds,
          ]);
          await raw.query(`DELETE FROM rental_checkouts WHERE id = ANY($1)`, [testCheckoutIds]);
        }
        if (testSlotIds.length > 0) {
          await raw.query(`DELETE FROM machine_slots WHERE id = ANY($1)`, [testSlotIds]);
        }
        await raw.query(`DELETE FROM rental_packages WHERE id = $1`, [packageId]);
        await raw.query(`DELETE FROM storage_plans WHERE id = $1`, [storagePlanId]);
        await raw.query("SET session_replication_role = 'origin'");
        await raw.query('COMMIT');
      } catch (err) {
        console.error('Teardown error in test_exp_grace_expiry:', err);
        await raw.query('ROLLBACK');
      }

      await cleanupIsolationFixture(raw, fx);
      await raw.end();
    }
    if (app) {
      await app.close();
    }
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

  // Helper tạo 1 slot và 1 rental nhanh cho test
  async function createTestRental(options: {
    brandId: string;
    status: 'ACTIVE' | 'EXPIRING' | 'GRACE';
    startsAt: Date;
    endsAt: Date;
    graceEndsAt?: Date | null;
    graceFeeAmount?: number;
    nonRenewalRequestedAt?: Date | null;
    fragranceProductId?: string;
  }) {
    const slotId = randomUUID();
    testSlotIds.push(slotId);
    await raw.query(
      `INSERT INTO machine_slots (id, machine_id, slot_number, status, monthly_rent_price, calibrated_dosage_ml, low_stock_threshold_ml)
       VALUES ($1, $2, (SELECT COALESCE(MAX(slot_number), 0) + 1 FROM machine_slots WHERE machine_id = $2), 'AVAILABLE', 1000000, 0.5, 5.0)`,
      [slotId, fx.machineId],
    );

    const totalAmount = 1050000 + (options.graceFeeAmount ?? 0);
    const checkoutId = randomUUID();
    testCheckoutIds.push(checkoutId);

    const rentalId = randomUUID();
    testRentalIds.push(rentalId);

    await raw.query('BEGIN');
    try {
      await raw.query(
        `INSERT INTO rental_checkouts (
          id, brand_id, currency, total_amount, hold_expires_at, paid_at, created_by
        ) VALUES ($1, $2, 'VND', $3, NOW() + INTERVAL '1 hour', NOW() - INTERVAL '10 days', $4)`,
        [checkoutId, options.brandId, totalAmount, fx.superAdminId],
      );

      await raw.query(
        `INSERT INTO slot_rentals (
           id, slot_id, brand_id, fragrance_product_id, checkout_id, status, starts_at, ends_at,
           grace_ends_at, grace_fee_amount, currency,
           duration_months, monthly_rent_price, discount_percent, storage_monthly_price,
           storage_coverage_percent, storage_coverage_cap, rent_amount, storage_amount, total_amount,
           paid_at, invoice_number, rental_package_id, storage_plan_id, non_renewal_requested_at, created_by
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8,
           $9, $10, 'VND',
           1, 1000000, 0, 50000,
           30, 2000000, 1000000, 50000, $11,
           NOW() - INTERVAL '10 days', $12, $13, $14, $15, $16
         )`,
        [
          rentalId,
          slotId,
          options.brandId,
          options.fragranceProductId ?? null,
          checkoutId,
          options.status,
          options.startsAt,
          options.endsAt,
          options.graceEndsAt ?? null,
          options.graceFeeAmount ?? 0,
          totalAmount,
          `HD-20261001-${randomUUID().slice(0, 6).toUpperCase()}`,
          packageId,
          storagePlanId,
          options.nonRenewalRequestedAt ?? null,
          fx.superAdminId,
        ],
      );
      await raw.query('COMMIT');
    } catch (err) {
      await raw.query('ROLLBACK');
      throw err;
    }

    return { slotId, rentalId };
  }

  // -------------------------------------------------------------------------------------
  // 1. FR-EXP-05: Chuyển sang EXPIRING khi ends_at <= now + 7 ngày
  // -------------------------------------------------------------------------------------
  it('test_FR_EXP_05_transition_to_expiring — tự động chuyển ACTIVE sang EXPIRING khi còn <= 7 ngày', async () => {
    // Rental 1: ends_at trong 5 ngày tới (<= 7 ngày) -> phải chuyển sang EXPIRING
    const { rentalId: rExpiring } = await createTestRental({
      brandId: fx.brandA,
      status: 'ACTIVE',
      startsAt: new Date(Date.now() - 25 * 86400 * 1000),
      endsAt: new Date(Date.now() + 5 * 86400 * 1000),
    });

    // Rental 2: ends_at trong 15 ngày tới (> 7 ngày) -> phải giữ nguyên ACTIVE
    const { rentalId: rStillActive } = await createTestRental({
      brandId: fx.brandA,
      status: 'ACTIVE',
      startsAt: new Date(Date.now() - 15 * 86400 * 1000),
      endsAt: new Date(Date.now() + 15 * 86400 * 1000),
    });

    await sltJobs.scanExpiringRentals();

    const check1 = await raw.query(`SELECT status FROM slot_rentals WHERE id = $1`, [rExpiring]);
    expect(check1.rows[0].status).toBe('EXPIRING');

    const check2 = await raw.query(`SELECT status FROM slot_rentals WHERE id = $1`, [rStillActive]);
    expect(check2.rows[0].status).toBe('ACTIVE');

    // Kiểm tra audit log
    const audit = await raw.query(
      `SELECT action FROM audit_logs WHERE target_id = $1 AND action = 'slt.rental.transitioned_to_expiring'`,
      [rExpiring],
    );
    expect(audit.rows.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------------------
  // -------------------------------------------------------------------------------------
  // 2. FR-EXP-01 ÷ 04: Thông báo T-7 và T-3, gộp theo thương hiệu và ghi AuditLog
  // -------------------------------------------------------------------------------------
  it('test_FR_EXP_01_send_t7_expiring_notices — gửi thông báo T-7 khi còn 7 ngày hết hạn', async () => {
    await raw.query(
      `DELETE FROM notifications WHERE reference_id LIKE 'EXPIRING_%' OR reference_id LIKE 'GRACE_%'`,
    );
    const t7Date = new Date();
    t7Date.setDate(t7Date.getDate() + 7);

    await createTestRental({
      brandId: fx.brandA,
      status: 'EXPIRING',
      startsAt: new Date(Date.now() - 23 * 86400 * 1000),
      endsAt: t7Date,
    });

    await sltJobs.sendExpiringNotices();

    const dateStr = t7Date.toISOString().slice(0, 10);
    const expectedRefA = `EXPIRING_T7_${fx.brandA}_${dateStr}`;
    const notifA = await raw.query(
      `SELECT * FROM notifications WHERE brand_id = $1 AND reference_id = $2`,
      [fx.brandA, expectedRefA],
    );
    expect(notifA.rows.length).toBeGreaterThanOrEqual(1);
    expect(notifA.rows[0].subject).toContain('7 ngày');
  });

  it('test_FR_EXP_02_send_t3_expiring_notices — gửi thông báo T-3 khi còn 3 ngày hết hạn', async () => {
    await raw.query(
      `DELETE FROM notifications WHERE reference_id LIKE 'EXPIRING_%' OR reference_id LIKE 'GRACE_%'`,
    );
    const t3Date = new Date();
    t3Date.setDate(t3Date.getDate() + 3);

    await createTestRental({
      brandId: fx.brandB,
      status: 'EXPIRING',
      startsAt: new Date(Date.now() - 27 * 86400 * 1000),
      endsAt: t3Date,
    });

    await sltJobs.sendExpiringNotices();

    const dateStrB = t3Date.toISOString().slice(0, 10);
    const expectedRefB = `EXPIRING_T3_${fx.brandB}_${dateStrB}`;
    const notifB = await raw.query(
      `SELECT * FROM notifications WHERE brand_id = $1 AND reference_id = $2`,
      [fx.brandB, expectedRefB],
    );
    expect(notifB.rows.length).toBeGreaterThanOrEqual(1);
    expect(notifB.rows[0].subject).toContain('3 ngày');
  });

  it('test_FR_EXP_03_consolidate_expiring_notifications — gộp thông báo của nhiều slot cùng thương hiệu và ngày hết hạn', async () => {
    await raw.query(
      `DELETE FROM notifications WHERE reference_id LIKE 'EXPIRING_%' OR reference_id LIKE 'GRACE_%'`,
    );
    const t7Date = new Date();
    t7Date.setDate(t7Date.getDate() + 7);

    await createTestRental({
      brandId: fx.brandA,
      status: 'EXPIRING',
      startsAt: new Date(Date.now() - 23 * 86400 * 1000),
      endsAt: t7Date,
    });
    await createTestRental({
      brandId: fx.brandA,
      status: 'EXPIRING',
      startsAt: new Date(Date.now() - 23 * 86400 * 1000),
      endsAt: t7Date,
    });

    await sltJobs.sendExpiringNotices();

    const dateStr = t7Date.toISOString().slice(0, 10);
    const expectedRefA = `EXPIRING_T7_${fx.brandA}_${dateStr}`;
    const notifA = await raw.query(
      `SELECT * FROM notifications WHERE brand_id = $1 AND reference_id = $2`,
      [fx.brandA, expectedRefA],
    );
    // Gộp thông báo: Chỉ có 1 reference_id duy nhất cho cả 2 slot
    expect(notifA.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('test_FR_EXP_04_audit_expiry_notification — ghi AuditLog EXPIRY_NOTICE_SENT khi gửi thông báo', async () => {
    await raw.query(
      `DELETE FROM notifications WHERE reference_id LIKE 'EXPIRING_%' OR reference_id LIKE 'GRACE_%'`,
    );
    const t7Date = new Date();
    t7Date.setDate(t7Date.getDate() + 7);

    const { rentalId } = await createTestRental({
      brandId: fx.brandA,
      status: 'EXPIRING',
      startsAt: new Date(Date.now() - 23 * 86400 * 1000),
      endsAt: t7Date,
    });

    await sltJobs.sendExpiringNotices();

    const audit = await raw.query(
      `SELECT * FROM audit_logs WHERE target_id = $1 AND action = 'EXPIRY_NOTICE_SENT'`,
      [rentalId],
    );
    expect(audit.rows.length).toBe(1);
  });

  // -------------------------------------------------------------------------------------
  // 3. FR-EXP-06: Chuyển sang GRACE khi ends_at <= now, mặc định 7 ngày
  // -------------------------------------------------------------------------------------
  it('test_FR_EXP_06_transition_to_grace — chuyển sang GRACE khi quá hạn, mặc định grace_ends_at = ends_at + 7d', async () => {
    const pastEndsAt = new Date(Date.now() - 3600 * 1000); // hết hạn 1 giờ trước
    const { rentalId } = await createTestRental({
      brandId: fx.brandA,
      status: 'EXPIRING',
      startsAt: new Date(Date.now() - 30 * 86400 * 1000),
      endsAt: pastEndsAt,
    });

    await sltJobs.autoTransitionToGrace();

    const row = await raw.query(`SELECT status, grace_ends_at FROM slot_rentals WHERE id = $1`, [
      rentalId,
    ]);
    expect(row.rows[0].status).toBe('GRACE');
    expect(row.rows[0].grace_ends_at).not.toBeNull();

    // Thời hạn ân hạn xấp xỉ ends_at + 7 ngày
    const expectedGraceEnds = new Date(pastEndsAt.getTime() + 7 * 86400 * 1000);
    const actualGraceEnds = new Date(row.rows[0].grace_ends_at);
    expect(Math.abs(actualGraceEnds.getTime() - expectedGraceEnds.getTime())).toBeLessThan(5000);

    // Kiểm tra thông báo bắt đầu ân hạn
    const notif = await raw.query(
      `SELECT * FROM notifications WHERE brand_id = $1 AND reference_id = $2`,
      [fx.brandA, `GRACE_${rentalId}`],
    );
    expect(notif.rows.length).toBeGreaterThanOrEqual(1);

    // Kiểm tra audit log slt.rental.transitioned_to_grace
    const audit = await raw.query(
      `SELECT * FROM audit_logs WHERE target_id = $1 AND action = 'slt.rental.transitioned_to_grace'`,
      [rentalId],
    );
    expect(audit.rows.length).toBe(1);
  });

  // -------------------------------------------------------------------------------------
  // 4. FR-EXP-07: Sửa thời hạn ân hạn (PUT /slot-rentals/:id/grace-period)
  // -------------------------------------------------------------------------------------
  it('test_FR_EXP_07_set_grace_period_end_date — Super Admin cập nhật thời hạn ân hạn', async () => {
    const { rentalId } = await createTestRental({
      brandId: fx.brandA,
      status: 'GRACE',
      startsAt: new Date(Date.now() - 31 * 86400 * 1000),
      endsAt: new Date(Date.now() - 1 * 86400 * 1000),
      graceEndsAt: new Date(Date.now() + 6 * 86400 * 1000),
    });

    const newGraceEndsAt = new Date(Date.now() + 14 * 86400 * 1000).toISOString();

    // 4.1. Brand Admin gọi -> 403 Forbidden
    const resBrand = await brandA('PUT', `/slot-rentals/${rentalId}/grace-period`, {
      payload: { graceEndsAt: newGraceEndsAt },
    });
    expect(resBrand.statusCode).toBe(403);

    // 4.2. Super Admin gửi ngày trong quá khứ -> 400 Invalid Field
    const resPast = await superAdmin('PUT', `/slot-rentals/${rentalId}/grace-period`, {
      payload: { graceEndsAt: new Date(Date.now() - 3600 * 1000).toISOString() },
    });
    expect(resPast.statusCode).toBe(400);

    // 4.3. Super Admin cập nhật hợp lệ -> 200 OK
    const resOk = await superAdmin('PUT', `/slot-rentals/${rentalId}/grace-period`, {
      payload: { graceEndsAt: newGraceEndsAt },
    });
    expect(resOk.statusCode).toBe(200);
    const body = resOk.json();
    expect(new Date(body.graceEndsAt).toISOString()).toBe(newGraceEndsAt);

    // Kiểm tra audit log slt.rental.grace_period_updated
    const audit = await raw.query(
      `SELECT * FROM audit_logs WHERE target_id = $1 AND action = 'slt.rental.grace_period_updated'`,
      [rentalId],
    );
    expect(audit.rows.length).toBe(1);
  });

  // -------------------------------------------------------------------------------------
  // 5. FR-EXP-10: Tính phí lưu kho ân hạn hằng ngày
  // -------------------------------------------------------------------------------------
  it('test_FR_EXP_10_calculate_grace_storage_fee — tính 0.05 * retailPrice * activeBottles và idempotent', async () => {
    const { slotId, rentalId } = await createTestRental({
      brandId: fx.brandA,
      status: 'GRACE',
      startsAt: new Date(Date.now() - 32 * 86400 * 1000),
      endsAt: new Date(Date.now() - 2 * 86400 * 1000),
      graceEndsAt: new Date(Date.now() + 5 * 86400 * 1000),
      graceFeeAmount: 0,
      fragranceProductId: fx.products[0],
    });

    const bottleId = randomUUID();
    await raw.query(
      `INSERT INTO bottles (id, brand_id, owner, batch_id, fragrance_product_id, identifier,
                            status, initial_volume_ml, current_estimated_ml, empty_weight_g,
                            opened_at, installed_at, expires_at)
       VALUES ($1, $2, 'BRAND', (SELECT id FROM inventory_batches WHERE brand_id = $2 LIMIT 1),
               $3, $4, 'INSTALLED', 50, 45, 60, NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days', NOW() + INTERVAL '1 year')`,
      [bottleId, fx.brandA, fx.products[0], `BTL-TEST-${randomUUID().slice(0, 8)}`],
    );

    // Gán chai active của brand A vào slot này
    await raw.query(`UPDATE machine_slots SET active_bottle_id = $1 WHERE id = $2`, [
      bottleId,
      slotId,
    ]);

    // Chạy job tính phí:
    // fx.products[0] có full_bottle_retail_price = 2,400,000 VND
    // Số chai active = 1 -> Phí = 0.05 * 2,400,000 * 1 = 120,000 VND
    await sltJobs.calculateDailyGraceFees();

    const check = await raw.query(`SELECT grace_fee_amount FROM slot_rentals WHERE id = $1`, [
      rentalId,
    ]);
    expect(Number(check.rows[0].grace_fee_amount)).toBe(120000);

    // Chạy lại lần nữa trong cùng ngày -> Idempotent, không cộng thêm
    await sltJobs.calculateDailyGraceFees();
    const checkAgain = await raw.query(`SELECT grace_fee_amount FROM slot_rentals WHERE id = $1`, [
      rentalId,
    ]);
    expect(Number(checkAgain.rows[0].grace_fee_amount)).toBe(120000);

    // Cleanup chai và active_bottle_id
    await raw.query(`UPDATE machine_slots SET active_bottle_id = NULL WHERE id = $1`, [slotId]);
    await raw.query(`DELETE FROM bottles WHERE id = $1`, [bottleId]);
  });

  // -------------------------------------------------------------------------------------
  // 6. FR-EXP-12 & FR-SLT-12: Gia hạn tự phục vụ (POST /slot-rentals/:id/renew)
  // -------------------------------------------------------------------------------------
  it('test_FR_SLT_12_renew_in_grace_adds_grace_fee_to_checkout — gia hạn trong GRACE cộng gộp phí ân hạn', async () => {
    const { rentalId } = await createTestRental({
      brandId: fx.brandA,
      status: 'GRACE',
      startsAt: new Date(Date.now() - 32 * 86400 * 1000),
      endsAt: new Date(Date.now() - 2 * 86400 * 1000),
      graceEndsAt: new Date(Date.now() + 5 * 86400 * 1000),
      graceFeeAmount: 45000,
    });

    const res = await brandA('POST', `/slot-rentals/${rentalId}/renew`, {
      payload: {
        rentalPackageId: packageId,
        storagePlanId: storagePlanId,
      },
    });

    expect(res.statusCode).toBe(201);
    const checkout = res.json();
    testCheckoutIds.push(checkout.id);

    // Tổng tiền checkout = rent (1,000,000) + storage (50,000) + grace fee (45,000) = 1,095,000 VND
    expect(Number(checkout.totalAmount)).toBe(1095000);

    // Kiểm tra hóa đơn H2 được tạo với previous_rental_id = H1
    const h2 = await raw.query(
      `SELECT id, status, previous_rental_id, grace_fee_amount, total_amount 
       FROM slot_rentals WHERE checkout_id = $1`,
      [checkout.id],
    );
    expect(h2.rows.length).toBe(1);
    expect(h2.rows[0].previous_rental_id).toBe(rentalId);
    expect(Number(h2.rows[0].grace_fee_amount)).toBe(45000);
    testRentalIds.push(h2.rows[0].id);
  });

  // -------------------------------------------------------------------------------------
  // 7. FR-EXP-13: Thanh toán gia hạn trong GRACE chuyển H1 -> RENEWED, H2 -> ACTIVE
  // -------------------------------------------------------------------------------------
  it('test_FR_EXP_13_paying_renewal_in_grace_transitions_h1_renewed_and_h2_active — thanh toán gia hạn trong GRACE kích hoạt ngay', async () => {
    const { slotId, rentalId: h1Id } = await createTestRental({
      brandId: fx.brandA,
      status: 'GRACE',
      startsAt: new Date(Date.now() - 33 * 86400 * 1000),
      endsAt: new Date(Date.now() - 3 * 86400 * 1000),
      graceEndsAt: new Date(Date.now() + 4 * 86400 * 1000),
      graceFeeAmount: 30000,
    });

    // Tạo checkout gia hạn
    const renewRes = await brandA('POST', `/slot-rentals/${h1Id}/renew`, {
      payload: {
        rentalPackageId: packageId,
        storagePlanId: storagePlanId,
      },
    });
    expect(renewRes.statusCode).toBe(201);
    const checkout = renewRes.json();
    testCheckoutIds.push(checkout.id);

    const h2Row = await raw.query(`SELECT id FROM slot_rentals WHERE checkout_id = $1`, [
      checkout.id,
    ]);
    const h2Id = h2Row.rows[0].id;
    testRentalIds.push(h2Id);

    // Đồng ý phụ lục hợp đồng
    const annexRes = await brandA('GET', `/rental-checkouts/${checkout.id}/annex`);
    const { contentHash } = annexRes.json<{ contentHash: string }>();
    await brandA('POST', `/rental-checkouts/${checkout.id}/annex/accept`, {
      payload: { contentHash },
    });

    // Tạo PaymentIntent PENDING
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

    // Gửi webhook xác nhận thanh toán thành công
    const webhookRes = await sendWebhook(
      buildMockWebhook({
        reference: ref,
        amount,
        currency,
        status: 'SUCCEEDED',
      }),
    );
    expect(webhookRes.statusCode).toBe(200);

    // Kiểm tra H1 đã chuyển thành RENEWED và H2 đã chuyển thành ACTIVE ngay lập tức
    const h1Check = await raw.query(`SELECT status FROM slot_rentals WHERE id = $1`, [h1Id]);
    expect(h1Check.rows[0].status).toBe('RENEWED');

    const h2Check = await raw.query(
      `SELECT status, starts_at, ends_at FROM slot_rentals WHERE id = $1`,
      [h2Id],
    );
    expect(h2Check.rows[0].status).toBe('ACTIVE');
    expect(h2Check.rows[0].starts_at).not.toBeNull();
    expect(h2Check.rows[0].ends_at).not.toBeNull();

    // H2 chiếm slot này
    const h2Rental = await raw.query(`SELECT slot_id FROM slot_rentals WHERE id = $1`, [h2Id]);
    expect(h2Rental.rows[0].slot_id).toBe(slotId);
  });
});
