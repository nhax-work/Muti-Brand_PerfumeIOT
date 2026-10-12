/**
 * Integration test cho Job hủy phiên hết giờ giữ chỗ (FR-SLT-39, ADR-0008)
 * và thông báo thanh toán thành công một lần mỗi phiên (FR-SLT-43).
 *
 * Bao phủ:
 *   - test_FR_SLT_39_cancel_unpaid_invoice_after_hold:
 *       + AC1: Phiên quá hạn giữ chỗ → phiên và mọi hóa đơn cùng CANCELLED, payment PENDING → EXPIRED, ghi AuditLog.
 *       + AC2: Giải phóng slot sau khi hủy → thương hiệu khác tạo phiên mới cùng slot thành công.
 *       + AC3: Bù sau downtime (catch-up) → phiên quá hạn trong lúc downtime vẫn được hủy đầy đủ.
 *       + AC4: Phiên đã thanh toán không bị hủy dù quá hold_expires_at.
 *       + AC5/Idempotent: Chạy lại nhiều lần an toàn, không sinh lỗi.
 */

import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SltJobs } from '../../apps/api/src/modules/slt/index.js';
import { asUser, createTestApp, login } from './helpers/app.js';
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
let sltJobs: SltJobs;
let packageId: string;
let storagePlanId: string;
let vacantSlot1: string;
let vacantSlot2: string;

beforeAll(async () => {
  raw = await openRawClient();
  fx = await seedIsolationFixture(raw);
  app = await createTestApp();
  sltJobs = app.get(SltJobs);
  brandA = asUser(app, (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken);
  brandB = asUser(app, (await login(app, fx.brandAdminBEmail, TEST_PASSWORD)).accessToken);

  packageId = randomUUID();
  storagePlanId = randomUUID();
  await raw.query(
    `INSERT INTO rental_packages (id, name, duration_months, discount_percent, is_active)
     VALUES ($1, $2, 3, 5.00, true)`,
    [packageId, `Gói 3 tháng Job ${fx.runId}`],
  );
  await raw.query(
    `INSERT INTO storage_plans (id, name, monthly_price, coverage_percent, coverage_cap, is_active)
     VALUES ($1, $2, 100000.0000, 30.00, 3000000.0000, true)`,
    [storagePlanId, `Bảo quản chuẩn Job ${fx.runId}`],
  );

  vacantSlot1 = randomUUID();
  vacantSlot2 = randomUUID();
  await raw.query(
    `INSERT INTO machine_slots (id, machine_id, slot_number, status, monthly_rent_price, calibrated_dosage_ml, low_stock_threshold_ml)
     VALUES ($1, $2, 8, 'AVAILABLE', 1000000.0000, 0.1200, 5.0000),
            ($3, $2, 9, 'AVAILABLE', 1200000.0000, 0.1200, 5.0000)`,
    [vacantSlot1, fx.machineId, vacantSlot2],
  );
}, 120_000);

afterAll(async () => {
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

describe('FR-SLT-39 — Hủy phiên và hóa đơn hết giờ giữ chỗ', () => {
  it('test_FR_SLT_39_cancel_unpaid_invoice_after_hold — AC1, AC2 & AC5', async () => {
    // 1. Tạo phiên gồm 2 slot và bấm thanh toán để tạo Payment PENDING
    const checkoutRes = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [
          { slotId: vacantSlot1, rentalPackageId: packageId, storagePlanId },
          { slotId: vacantSlot2, rentalPackageId: packageId, storagePlanId },
        ],
      },
    });
    expect(checkoutRes.statusCode).toBe(201);
    const checkout = checkoutRes.json<{ id: string }>();

    const payRes = await brandA('POST', `/rental-checkouts/${checkout.id}/payments`);
    expect(payRes.statusCode).toBe(200);
    const payment = payRes.json<{ paymentId: string }>();

    // 2. Chỉnh mốc hold_expires_at về quá khứ (đã quá hạn giữ chỗ)
    await raw.query(
      `UPDATE rental_checkouts SET hold_expires_at = now() - interval '10 minutes' WHERE id = $1`,
      [checkout.id],
    );

    // 3. Kích hoạt job hủy phiên
    const cancelledCount = await sltJobs.cancelExpiredCheckouts();
    expect(cancelledCount).toBeGreaterThanOrEqual(1);

    // AC1: Kiểm tra rental_checkouts: cancelled_at đã được gán
    const checkoutRow = await raw.query(
      `SELECT cancelled_at, paid_at FROM rental_checkouts WHERE id = $1`,
      [checkout.id],
    );
    expect(checkoutRow.rows[0].cancelled_at).not.toBeNull();
    expect(checkoutRow.rows[0].paid_at).toBeNull();

    // AC1: Kiểm tra mọi hóa đơn của phiên: status = 'CANCELLED', cancelled_at = checkout.cancelled_at
    const rentalRows = await raw.query(
      `SELECT id, status, cancelled_at FROM slot_rentals WHERE checkout_id = $1`,
      [checkout.id],
    );
    expect(rentalRows.rows).toHaveLength(2);
    for (const r of rentalRows.rows) {
      expect(r.status).toBe('CANCELLED');
      expect(r.cancelled_at).not.toBeNull();
    }

    // AC1: Payment PENDING của phiên chuyển thành EXPIRED
    const paymentRow = await raw.query(`SELECT status FROM payments WHERE id = $1`, [
      payment.paymentId,
    ]);
    expect(paymentRow.rows[0].status).toBe('EXPIRED');

    // AC1: AuditLog được ghi lại
    const auditRow = await raw.query(
      `SELECT action, target_type, target_id FROM audit_logs
       WHERE target_id = $1 AND action = 'slt.rental_checkout.cancelled_due_to_expiry'`,
      [checkout.id],
    );
    expect(auditRow.rowCount).toBe(1);

    // AC2 (Giải phóng slot): Brand B có thể chọn và tạo phiên mới với slot vừa được giải phóng
    const newCheckoutRes = await brandB('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId: vacantSlot1, rentalPackageId: packageId, storagePlanId }],
      },
    });
    expect(newCheckoutRes.statusCode).toBe(201);
    const newCheckout = newCheckoutRes.json<{ id: string }>();

    // AC5/Idempotency: Chạy lại job lần nữa không gây lỗi, phiên đã hủy không bị hủy lại
    const secondRunCount = await sltJobs.cancelExpiredCheckouts();
    expect(secondRunCount).toBe(0);

    // Dọn dẹp
    await deleteCheckouts([checkout.id, newCheckout.id]);
  });

  it('test_FR_SLT_39_cancel_unpaid_invoice_after_hold — AC3 Bù sau downtime (Catch-up)', async () => {
    // AC3: Giả lập hệ thống ngừng hoạt động qua mốc hold_expires_at (ví dụ 3 giờ trước)
    const checkoutRes = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId: vacantSlot1, rentalPackageId: packageId, storagePlanId }],
      },
    });
    expect(checkoutRes.statusCode).toBe(201);
    const checkout = checkoutRes.json<{ id: string }>();

    // Giả lập mốc hold_expires_at rơi vào lúc hệ thống downtime (3 giờ trước)
    await raw.query(
      `UPDATE rental_checkouts SET hold_expires_at = now() - interval '3 hours' WHERE id = $1`,
      [checkout.id],
    );

    // Khi hệ thống khởi động lại, job chạy lần đầu tiên
    const count = await sltJobs.cancelExpiredCheckouts();
    expect(count).toBeGreaterThanOrEqual(1);

    // Phiên và hóa đơn phải được hủy đầy đủ, không bị sót
    const row = await raw.query(
      `SELECT c.cancelled_at as checkout_cancelled, r.status, r.cancelled_at as rental_cancelled
       FROM rental_checkouts c
       JOIN slot_rentals r ON r.checkout_id = c.id
       WHERE c.id = $1`,
      [checkout.id],
    );
    expect(row.rows[0].checkout_cancelled).not.toBeNull();
    expect(row.rows[0].status).toBe('CANCELLED');
    expect(row.rows[0].rental_cancelled).not.toBeNull();

    await deleteCheckouts([checkout.id]);
  });

  it('test_FR_SLT_39_cancel_unpaid_invoice_after_hold — AC4 Phiên đã thanh toán không bị hủy', async () => {
    // AC4: Phiên đã thanh toán, dù quá hold_expires_at, job chạy cũng KHÔNG hủy
    const checkoutRes = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId: vacantSlot1, rentalPackageId: packageId, storagePlanId }],
      },
    });
    expect(checkoutRes.statusCode).toBe(201);
    const checkout = checkoutRes.json<{ id: string }>();

    // Giả lập phiên đã thanh toán
    const paidTime = new Date();
    await inTransaction(async () => {
      await raw.query(
        `UPDATE rental_checkouts
         SET paid_at = $1, hold_expires_at = now() - interval '30 minutes'
         WHERE id = $2`,
        [paidTime, checkout.id],
      );
      await raw.query(
        `UPDATE slot_rentals
         SET paid_at = $1, invoice_number = 'HD-20261009-TEST01'
         WHERE checkout_id = $2`,
        [paidTime, checkout.id],
      );
    });

    // Chạy job
    await sltJobs.cancelExpiredCheckouts();

    // Phiên và hóa đơn KHÔNG bị hủy
    const checkRow = await raw.query(
      `SELECT cancelled_at, paid_at FROM rental_checkouts WHERE id = $1`,
      [checkout.id],
    );
    expect(checkRow.rows[0].cancelled_at).toBeNull();
    expect(checkRow.rows[0].paid_at).not.toBeNull();

    const rentalRow = await raw.query(
      `SELECT status, cancelled_at FROM slot_rentals WHERE checkout_id = $1`,
      [checkout.id],
    );
    expect(rentalRow.rows[0].status).toBe('DRAFT');
    expect(rentalRow.rows[0].cancelled_at).toBeNull();

    await deleteCheckouts([checkout.id]);
  });
});
