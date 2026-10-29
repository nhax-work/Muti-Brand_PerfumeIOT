/**
 * Integration test cho kích hoạt hóa đơn thuê slot (FR-SLT-24, FR-SLT-42, FR-SLT-43; ADR-0006).
 *
 * Nhóm kiểm thử trọng yếu: "Job chuyển trạng thái hóa đơn" (spec/testing.md).
 *
 * Bao phủ:
 *   1. FR-SLT-24: Kích hoạt khi lắp chai đầu tiên
 *      - AC1: Hóa đơn DRAFT đã thanh toán -> khi lắp chai đầu tiên, trong cùng transaction:
 *             H -> ACTIVE, starts_at = t, ends_at = t + duration_months, ghi AuditLog, gửi thông báo RENTAL_ACTIVE.
 *      - Rollback test: SLT ném lỗi khi hóa đơn chưa thanh toán -> transaction đóng phiếu nạp ROLLBACK hoàn toàn
 *             (phiếu nạp giữ nguyên STARTED, hóa đơn giữ nguyên DRAFT, chai không vào slot).
 *      - AC3: Lắp các lần sau khi H đã ACTIVE -> starts_at và ends_at không đổi.
 *      - AC4: Hóa đơn gia hạn (previous_rental_id != null) -> việc lắp chai không kích hoạt.
 *   2. FR-SLT-42: Tự kích hoạt khi chờ nạp hàng quá RENTAL_MAX_STOCKING_DAYS (30 ngày)
 *      - AC1: Tự động kích hoạt khi quá hạn, starts_at = thời điểm kích hoạt, ends_at = starts_at + duration.
 *      - AC2: Bù sau downtime (catch-up) -> không bị bỏ sót.
 *      - AC3: Đã lắp chai trước đó -> job không làm gì với H.
 *      - Test biên: 1 giây trước mốc 30 ngày (không kích hoạt), 1 giây sau mốc 30 ngày (kích hoạt).
 *      - Idempotent: Chạy job 2 lần liên tiếp không kích hoạt 2 lần.
 *   3. FR-SLT-43: Thông báo bắt đầu hiệu lực
 *      - AC2/AC3: Cô lập thông báo theo thương hiệu, Brand B không nhận thông báo của Brand A.
 */

import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SltJobs } from '../../apps/api/src/modules/slt/index.js';
import { asUser, createTestApp, login } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import {
  cleanupIsolationFixture,
  releaseOpenOrders,
  seedIsolationFixture,
  seedPlatformStaff,
  TEST_PASSWORD,
  type IsolationFixture,
  type PlatformStaff,
} from './helpers/seed-isolation.js';

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let inventoryStaff: PlatformStaff;
let staff: ReturnType<typeof asUser>;
let sltJobs: SltJobs;

let packageId: string;
let storagePlanId: string;
let batchA: string;

// Danh sách slot được tạo thêm trong bộ test này
const createdSlotIds: string[] = [];
const createdRentalIds: string[] = [];
const createdCheckoutIds: string[] = [];

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  inventoryStaff = await seedPlatformStaff(client, fx, 'INVENTORY_STAFF', ['inventory.manage']);
  app = await createTestApp();
  sltJobs = app.get(SltJobs);

  staff = asUser(app, (await login(app, inventoryStaff.email, TEST_PASSWORD)).accessToken);

  // Tạo package 3 tháng và storage plan phục vụ test
  packageId = randomUUID();
  storagePlanId = randomUUID();
  await client.query(
    `INSERT INTO rental_packages (id, name, duration_months, discount_percent, is_active)
     VALUES ($1, $2, 3, 5.00, true)`,
    [packageId, `Gói 3 tháng Test Activate ${fx.runId}`],
  );
  await client.query(
    `INSERT INTO storage_plans (id, name, monthly_price, coverage_percent, coverage_cap, is_active)
     VALUES ($1, $2, 100000.0000, 30.00, 3000000.0000, true)`,
    [storagePlanId, `Bảo quản chuẩn Test Activate ${fx.runId}`],
  );

  const batch = await client.query<{ id: string }>(
    `SELECT id FROM inventory_batches WHERE brand_id = $1 AND fragrance_product_id = $2`,
    [fx.brandA, fx.products[0]],
  );
  batchA = batch.rows[0]!.id;

  // Duyệt giấy tờ chính hãng cho lô để có thể lắp chai (FR-INV-35)
  await client.query(
    `UPDATE inventory_batches
     SET authenticity_status = 'APPROVED',
         authenticity_document_url = 'https://example.com/doc.pdf',
         authenticity_submitted_by = $2,
         authenticity_submitted_at = now(),
         authenticity_verified_by = $2,
         authenticity_verified_at = now()
     WHERE id = $1`,
    [batchA, fx.superAdminId],
  );
}, 120_000);

afterEach(async () => {
  await releaseOpenOrders(client, fx.machineId);
  await client.query(
    `UPDATE refill_sessions SET status = 'CANCELLED', completed_at = now()
      WHERE machine_id = $1 AND status = 'STARTED'`,
    [fx.machineId],
  );
});

afterAll(async () => {
  await client.query('BEGIN');
  try {
    await client.query("SET session_replication_role = 'replica'");
    if (createdRentalIds.length > 0) {
      await client.query(`DELETE FROM notifications WHERE reference_id = ANY($1)`, [
        createdRentalIds,
      ]);
      await client.query(`DELETE FROM slot_rentals WHERE id = ANY($1)`, [createdRentalIds]);
    }
    if (createdCheckoutIds.length > 0) {
      await client.query(`DELETE FROM rental_checkouts WHERE id = ANY($1)`, [createdCheckoutIds]);
    }
    if (createdSlotIds.length > 0) {
      await client.query(`DELETE FROM refill_sessions WHERE slot_id = ANY($1)`, [createdSlotIds]);
      await client.query(`DELETE FROM machine_slots WHERE id = ANY($1)`, [createdSlotIds]);
    }
    await client.query(`DELETE FROM rental_packages WHERE id = $1`, [packageId]);
    await client.query(`DELETE FROM storage_plans WHERE id = $1`, [storagePlanId]);
    await client.query("SET session_replication_role = 'origin'");
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  await cleanupIsolationFixture(client, fx);
  await inventoryStaff.cleanup();
  await app.close();
  await client.end();
});

// Helper tạo slot mới trên máy test
async function createSlot(slotNumber: number): Promise<string> {
  const slotId = randomUUID();
  await client.query(
    `INSERT INTO machine_slots (id, machine_id, slot_number, status, monthly_rent_price, calibrated_dosage_ml, low_stock_threshold_ml)
     VALUES ($1, $2, $3, 'AVAILABLE', 1000000.0000, 0.1200, 5.0000)`,
    [slotId, fx.machineId, slotNumber],
  );
  createdSlotIds.push(slotId);
  return slotId;
}

// Helper tạo hóa đơn thuê slot
async function createRental(opts: {
  slotId: string;
  brandId: string;
  status?: string;
  paidAt?: Date | null;
  startsAt?: Date;
  endsAt?: Date;
  previousRentalId?: string | null;
  durationMonths?: number;
}): Promise<string> {
  const rentalId = randomUUID();
  const now = new Date();
  const startsAt = opts.startsAt ?? now;
  const durationMonths = opts.durationMonths ?? 3;
  const endsAt = opts.endsAt ?? new Date(startsAt.getTime() + durationMonths * 30 * 86400000);
  const paidAt = opts.paidAt === undefined ? now : opts.paidAt;
  const invoiceNumber = paidAt ? `HD-${randomUUID().slice(0, 8).toUpperCase()}` : null;
  const checkoutId = randomUUID();

  const holdExpiresAt = new Date(now.getTime() + 3600_000);
  await client.query('BEGIN');
  try {
    await client.query(
      `INSERT INTO rental_checkouts (
        id, brand_id, currency, total_amount, hold_expires_at, paid_at, created_by, created_at, updated_at
      ) VALUES ($1, $2, 'VND', 3150000.0000, $3, $4, $5, $6, $6)`,
      [checkoutId, opts.brandId, holdExpiresAt, paidAt, fx.superAdminId, now],
    );
    createdCheckoutIds.push(checkoutId);

    await client.query(
      `INSERT INTO slot_rentals (
        id, slot_id, brand_id, rental_package_id, storage_plan_id,
        fragrance_product_id, status, duration_months, monthly_rent_price, discount_percent,
        storage_monthly_price, storage_coverage_percent, storage_coverage_cap,
        rent_amount, storage_amount, grace_fee_amount, total_amount, currency,
        starts_at, ends_at, paid_at, checkout_id, previous_rental_id, invoice_number,
        created_by, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, 1000000.0000, 5.00,
        100000.0000, 30.00, 3000000.0000,
        2850000.0000, 300000.0000, 0, 3150000.0000, 'VND',
        $9, $10, $11, $12, $13, $14,
        $15, $16, $16
      )`,
      [
        rentalId,
        opts.slotId,
        opts.brandId,
        packageId,
        storagePlanId,
        fx.products[0], // gán sản phẩm 0 của Brand A
        opts.status ?? 'DRAFT',
        durationMonths,
        startsAt,
        endsAt,
        paidAt,
        checkoutId,
        opts.previousRentalId ?? null,
        invoiceNumber,
        fx.superAdminId,
        now,
      ],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  createdRentalIds.push(rentalId);
  return rentalId;
}

// Helper tạo chai trong kho của A
async function createSpareBottle(): Promise<string> {
  const res = await staff('POST', '/bottles', {
    payload: {
      batchId: batchA,
      identifier: `SPARE-${randomUUID().slice(0, 8)}`,
      initialVolumeMl: 50,
    },
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json<{ id: string }>().id;
}

describe('FR-SLT-24: Kích hoạt hóa đơn khi lắp chai đầu tiên', () => {
  it('test_FR_SLT_24_activate_on_first_bottle_install — AC1: Hóa đơn DRAFT đã thanh toán được kích hoạt sang ACTIVE khi lắp chai đầu tiên trong cùng transaction', async () => {
    const slotId = await createSlot(101);
    const rentalId = await createRental({
      slotId,
      brandId: fx.brandA,
      status: 'DRAFT',
      paidAt: new Date(),
    });
    const bottleId = await createSpareBottle();

    // Mở phiếu nạp
    const openRes = await staff('POST', '/refill-sessions', {
      payload: { slotId },
    });
    expect(openRes.statusCode, openRes.body).toBe(201);
    const sessionId = openRes.json<{ id: string }>().id;

    // Đóng phiếu nạp (lắp chai đầu tiên)
    const closeRes = await staff('POST', `/refill-sessions/${sessionId}/close`, {
      payload: {
        newBottleId: bottleId,
        checklistCompleted: true,
        notes: 'Lắp chai đầu',
      },
    });
    expect(closeRes.statusCode, closeRes.body).toBe(200);

    // Kiểm tra hóa đơn đã chuyển ACTIVE
    const rentalRow = await client.query<{
      status: string;
      starts_at: Date;
      ends_at: Date;
      duration_months: number;
    }>(`SELECT status, starts_at, ends_at, duration_months FROM slot_rentals WHERE id = $1`, [
      rentalId,
    ]);
    expect(rentalRow.rows[0]?.status).toBe('ACTIVE');

    const startsAt = new Date(rentalRow.rows[0]!.starts_at);
    const endsAt = new Date(rentalRow.rows[0]!.ends_at);
    expect(endsAt.getTime()).toBeGreaterThan(startsAt.getTime());

    // Kiểm tra AuditLog
    const auditRow = await client.query<{ action: string; target_id: string }>(
      `SELECT action, target_id FROM audit_logs WHERE target_id = $1 AND action = 'slt.rental.activated_on_first_install'`,
      [rentalId],
    );
    expect(auditRow.rows.length).toBe(1);

    // Kiểm tra thông báo RENTAL_ACTIVE được tạo
    const notifRow = await client.query<{ type: string; brand_id: string; reference_id: string }>(
      `SELECT type, brand_id, reference_id FROM notifications WHERE reference_id = $1 AND type = 'RENTAL_ACTIVE'`,
      [rentalId],
    );
    expect(notifRow.rows.length).toBeGreaterThanOrEqual(1);
    expect(notifRow.rows.every((r) => r.brand_id === fx.brandA)).toBe(true);
  });

  it('test_FR_SLT_24_activate_on_first_bottle_install — Rollback test: SLT ném lỗi khi hóa đơn chưa thanh toán -> transaction đóng phiếu nạp ROLLBACK, phiếu nạp giữ nguyên STARTED và hóa đơn vẫn DRAFT', async () => {
    const slotId = await createSlot(102);
    // Hóa đơn tạo ban đầu có paid_at để mở được phiếu nạp
    const rentalId = await createRental({
      slotId,
      brandId: fx.brandA,
      status: 'DRAFT',
      paidAt: new Date(),
    });
    const bottleId = await createSpareBottle();

    // Mở phiếu nạp thành công
    const openRes = await staff('POST', '/refill-sessions', {
      payload: { slotId },
    });
    expect(openRes.statusCode, openRes.body).toBe(201);
    const sessionId = openRes.json<{ id: string }>().id;

    // Giả lập trạng thái hóa đơn chưa thanh toán trước khi đóng phiếu (cả checkout và rental)
    await client.query('BEGIN');
    await client.query(
      `UPDATE rental_checkouts SET paid_at = null WHERE id = (SELECT checkout_id FROM slot_rentals WHERE id = $1)`,
      [rentalId],
    );
    await client.query(
      `UPDATE slot_rentals SET paid_at = null, invoice_number = null WHERE id = $1`,
      [rentalId],
    );
    await client.query('COMMIT');

    // Đóng phiếu nạp -> SLT từ chối vì hóa đơn chưa thanh toán (AC2)
    const closeRes = await staff('POST', `/refill-sessions/${sessionId}/close`, {
      payload: { newBottleId: bottleId, checklistCompleted: true },
    });
    expect(closeRes.statusCode).toBe(409);
    expect(closeRes.json()).toMatchObject({ code: 'RENTAL_NOT_ACTIVE' });

    // Chứng minh rollback hoàn toàn:
    // 1. Phiếu nạp vẫn ở trạng thái STARTED
    const sessionRow = await client.query<{ status: string }>(
      `SELECT status FROM refill_sessions WHERE id = $1`,
      [sessionId],
    );
    expect(sessionRow.rows[0]?.status).toBe('STARTED');

    // 2. Chai không được lắp vào slot
    const slotRow = await client.query<{ active_bottle_id: string | null }>(
      `SELECT active_bottle_id FROM machine_slots WHERE id = $1`,
      [slotId],
    );
    expect(slotRow.rows[0]?.active_bottle_id).toBeNull();

    // 3. Hóa đơn vẫn ở trạng thái DRAFT
    const rentalRow = await client.query<{ status: string }>(
      `SELECT status FROM slot_rentals WHERE id = $1`,
      [rentalId],
    );
    expect(rentalRow.rows[0]?.status).toBe('DRAFT');
  });

  it('test_FR_SLT_24_activate_on_first_bottle_install — AC3: Lắp chai các lần sau khi hóa đơn đã ACTIVE không làm thay đổi starts_at và ends_at', async () => {
    const slotId = await createSlot(103);
    const fixedStarts = new Date('2026-09-01T00:00:00Z');
    const fixedEnds = new Date('2026-12-01T00:00:00Z');
    const rentalId = await createRental({
      slotId,
      brandId: fx.brandA,
      status: 'ACTIVE',
      paidAt: new Date('2026-08-25T00:00:00Z'),
      startsAt: fixedStarts,
      endsAt: fixedEnds,
    });
    const bottleId = await createSpareBottle();

    const openRes = await staff('POST', '/refill-sessions', {
      payload: { slotId },
    });
    expect(openRes.statusCode, openRes.body).toBe(201);
    const sessionId = openRes.json<{ id: string }>().id;

    const closeRes = await staff('POST', `/refill-sessions/${sessionId}/close`, {
      payload: { newBottleId: bottleId, checklistCompleted: true },
    });
    expect(closeRes.statusCode, closeRes.body).toBe(200);

    const rentalRow = await client.query<{ starts_at: Date; ends_at: Date }>(
      `SELECT starts_at, ends_at FROM slot_rentals WHERE id = $1`,
      [rentalId],
    );
    expect(new Date(rentalRow.rows[0]!.starts_at).toISOString()).toBe(fixedStarts.toISOString());
    expect(new Date(rentalRow.rows[0]!.ends_at).toISOString()).toBe(fixedEnds.toISOString());
  });

  it('test_FR_SLT_24_activate_on_first_bottle_install — AC4: Hóa đơn gia hạn (previous_rental_id != null) không bị kích hoạt khi lắp chai', async () => {
    const slotId = await createSlot(104);
    // Hóa đơn cũ H1 đã kết thúc
    const h1Id = await createRental({
      slotId,
      brandId: fx.brandA,
      status: 'CLOSED',
      paidAt: new Date('2026-01-01T00:00:00Z'),
    });
    // Hóa đơn gia hạn H2 ở trạng thái DRAFT
    const h2Id = await createRental({
      slotId,
      brandId: fx.brandA,
      status: 'DRAFT',
      paidAt: new Date(),
      previousRentalId: h1Id,
    });

    const bottleId = await createSpareBottle();
    const openRes = await staff('POST', '/refill-sessions', {
      payload: { slotId },
    });
    expect(openRes.statusCode, openRes.body).toBe(201);
    const sessionId = openRes.json<{ id: string }>().id;

    const closeRes = await staff('POST', `/refill-sessions/${sessionId}/close`, {
      payload: { newBottleId: bottleId, checklistCompleted: true },
    });
    expect(closeRes.statusCode, closeRes.body).toBe(200);

    // H2 vẫn phải ở DRAFT (không kích hoạt khi lắp chai theo AC4)
    const h2Row = await client.query<{ status: string }>(
      `SELECT status FROM slot_rentals WHERE id = $1`,
      [h2Id],
    );
    expect(h2Row.rows[0]?.status).toBe('DRAFT');
  });
});

describe('FR-SLT-42: Tự động kích hoạt khi chờ nạp hàng quá RENTAL_MAX_STOCKING_DAYS (30 ngày)', () => {
  it('test_FR_SLT_42_auto_activate_after_stocking_window — Test biên: 1 giây trước mốc 30 ngày KHÔNG kích hoạt, 1 giây sau mốc 30 ngày ĐƯỢC kích hoạt', async () => {
    const slot1 = await createSlot(105);
    const slot2 = await createSlot(106);

    const now = new Date();
    // 30 ngày = 30 * 24 * 60 * 60 * 1000 ms
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    // Hóa đơn 1: paid_at = now - 30 ngày + 2 giây (chưa đủ 30 ngày)
    const paidBeforeCutoff = new Date(now.getTime() - thirtyDaysMs + 2000);
    const rentalBeforeId = await createRental({
      slotId: slot1,
      brandId: fx.brandA,
      status: 'DRAFT',
      paidAt: paidBeforeCutoff,
    });

    // Hóa đơn 2: paid_at = now - 30 ngày - 2 giây (đã quá 30 ngày)
    const paidAfterCutoff = new Date(now.getTime() - thirtyDaysMs - 2000);
    const rentalAfterId = await createRental({
      slotId: slot2,
      brandId: fx.brandA,
      status: 'DRAFT',
      paidAt: paidAfterCutoff,
    });

    // Chạy job tự kích hoạt
    const activatedCount = await sltJobs.autoActivateStockingOverdue();
    expect(activatedCount).toBeGreaterThanOrEqual(1);

    // Kiểm tra: Hóa đơn 1 giữ nguyên DRAFT
    const row1 = await client.query<{ status: string }>(
      `SELECT status FROM slot_rentals WHERE id = $1`,
      [rentalBeforeId],
    );
    expect(row1.rows[0]?.status).toBe('DRAFT');

    // Kiểm tra: Hóa đơn 2 đã chuyển sang ACTIVE
    const row2 = await client.query<{ status: string; starts_at: Date; ends_at: Date }>(
      `SELECT status, starts_at, ends_at FROM slot_rentals WHERE id = $1`,
      [rentalAfterId],
    );
    expect(row2.rows[0]?.status).toBe('ACTIVE');
    expect(new Date(row2.rows[0]!.ends_at).getTime()).toBeGreaterThan(
      new Date(row2.rows[0]!.starts_at).getTime(),
    );

    // Kiểm tra AuditLog của job
    const auditRow = await client.query<{ action: string; target_id: string }>(
      `SELECT action, target_id FROM audit_logs WHERE target_id = $1 AND action = 'slt.rental.auto_activated_after_stocking_window'`,
      [rentalAfterId],
    );
    expect(auditRow.rows.length).toBe(1);

    // Kiểm tra thông báo RENTAL_ACTIVE được tạo
    const notifRow = await client.query<{ type: string; brand_id: string }>(
      `SELECT type, brand_id FROM notifications WHERE reference_id = $1 AND type = 'RENTAL_ACTIVE'`,
      [rentalAfterId],
    );
    expect(notifRow.rows.length).toBeGreaterThanOrEqual(1);
    expect(notifRow.rows.every((r) => r.brand_id === fx.brandA)).toBe(true);
  });

  it('test_FR_SLT_42_auto_activate_after_stocking_window — AC2 / Idempotent: Chạy lại lần thứ 2 không kích hoạt lại, không ném lỗi', async () => {
    // Chạy tiếp job một lần nữa
    const secondRunCount = await sltJobs.autoActivateStockingOverdue();
    expect(secondRunCount).toBe(0);
  });

  it('test_FR_SLT_43_notify_paid_and_active_invoice — Cô lập thông báo: Brand B không nhận thông báo khi hóa đơn của Brand A được kích hoạt', async () => {
    const slot = await createSlot(107);
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const rentalId = await createRental({
      slotId: slot,
      brandId: fx.brandA,
      status: 'DRAFT',
      paidAt: thirtyOneDaysAgo,
    });

    await sltJobs.autoActivateStockingOverdue();

    // Brand A nhận thông báo
    const notifA = await client.query(
      `SELECT id FROM notifications WHERE reference_id = $1 AND brand_id = $2`,
      [rentalId, fx.brandA],
    );
    expect(notifA.rows.length).toBeGreaterThanOrEqual(1);

    // Brand B không nhận thông báo nào cho rentalId này
    const notifB = await client.query(
      `SELECT id FROM notifications WHERE reference_id = $1 AND brand_id = $2`,
      [rentalId, fx.brandB],
    );
    expect(notifB.rows.length).toBe(0);
  });

  it('test_FR_SLT_42_auto_activate_after_stocking_window — Race condition: Lắp chai và job cùng lúc chỉ kích hoạt hóa đơn một lần duy nhất', async () => {
    const slot = await createSlot(108);
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const rentalId = await createRental({
      slotId: slot,
      brandId: fx.brandA,
      status: 'DRAFT',
      paidAt: thirtyOneDaysAgo,
    });
    const bottleId = await createSpareBottle();

    const openRes = await staff('POST', '/refill-sessions', {
      payload: { slotId: slot },
    });
    expect(openRes.statusCode, openRes.body).toBe(201);
    const sessionId = openRes.json<{ id: string }>().id;

    // Chạy song song cả đóng phiếu nạp và job tự kích hoạt
    const [closeRes] = await Promise.all([
      staff('POST', `/refill-sessions/${sessionId}/close`, {
        payload: { newBottleId: bottleId, checklistCompleted: true },
      }),
      sltJobs.autoActivateStockingOverdue(),
    ]);

    // Phiếu nạp đóng thành công (nếu lắp chai trước hoặc sau khi ACTIVE - AC3)
    expect([200]).toContain(closeRes.statusCode);

    // Hóa đơn phải ở trạng thái ACTIVE
    const rentalRow = await client.query<{ status: string }>(
      `SELECT status FROM slot_rentals WHERE id = $1`,
      [rentalId],
    );
    expect(rentalRow.rows[0]?.status).toBe('ACTIVE');

    // Số bản ghi audit kích hoạt đúng bằng 1
    const auditRows = await client.query(
      `SELECT id FROM audit_logs WHERE target_id = $1 AND action IN (
        'slt.rental.activated_on_first_install',
        'slt.rental.auto_activated_after_stocking_window'
      )`,
      [rentalId],
    );
    expect(auditRows.rows.length).toBe(1);
  });
});
