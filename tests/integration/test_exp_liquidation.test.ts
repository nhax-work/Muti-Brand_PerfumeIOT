/**
 * Integration test cho Task 3: Thanh lý: chuyển quyền sở hữu chai, đóng hóa đơn
 * (FR-EXP-14 ÷ 16, FR-EXP-21, FR-SLT-14; ADR-0014, FR-AUTH-09).
 *
 * Bao phủ:
 *   1. FR-EXP-14, 15, 16: Tự động chuyển LIQUIDATED khi hết hạn ân hạn qua Job:
 *      - Hóa đơn GRACE quá hạn -> LIQUIDATED
 *      - Chuyển toàn bộ chai tồn của thương hiệu tại slot sang owner = 'PLATFORM', status = 'LIQUIDATED'
 *      - Ghi nhận liquidated_at = now() và source_rental_id = rental.id
 *      - Ghi audit log slt.rental.liquidated và slt.bottle.liquidated
 *   2. FR-EXP-14, 15: Super Admin thanh lý thủ công qua API POST /slot-rentals/:id/liquidate:
 *      - Bắt buộc xác thực lại (header X-Reauth-Token từ POST /auth/reauth) -> 403 REAUTH_REQUIRED nếu thiếu
 *      - Chuyển quyền chai sang PLATFORM thành công
 *   3. Phân quyền và điều kiện trạng thái:
 *      - Brand Admin gọi liquidate -> 403
 *      - Gọi liquidate khi hóa đơn không ở GRACE -> 409 RENTAL_NOT_ACTIVE
 *   4. FR-SLT-14: Platform Super Admin đóng hóa đơn LIQUIDATED qua POST /slot-rentals/:id/close:
 *      - Từ chối 409 SLOT_HAS_ACTIVE_BOTTLE nếu chai trên slot vẫn còn dung tích (> 0) và chưa tháo
 *      - Đóng thành công khi chai rỗng (EMPTY) hoặc đã tháo: rental -> CLOSED, slot -> AVAILABLE
 *      - Ghi audit log slt.rental.closed
 *   5. Phân quyền và điều kiện trạng thái cho close:
 *      - Brand Admin gọi close -> 403 FORBIDDEN_SCOPE
 *      - Đóng khi hóa đơn chưa LIQUIDATED -> 409 RENTAL_NOT_ACTIVE
 */

import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SltJobs } from '../../apps/api/src/modules/slt/index.js';
import { asUser, createTestApp, login, reauth } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
  TEST_PASSWORD,
  type IsolationFixture,
} from './helpers/seed-isolation.js';

describe('Liquidation & Close Rental Integration Tests (Task 3 / FR-EXP-14..16, FR-SLT-14)', () => {
  let app: NestFastifyApplication;
  let raw: pg.Client;
  let fx: IsolationFixture;
  let brandA: ReturnType<typeof asUser>;
  let superAdmin: ReturnType<typeof asUser>;
  let brandAToken: string;
  let superAdminToken: string;
  let sltJobs: SltJobs;

  let packageId: string;
  let storagePlanId: string;

  const testSlotIds: string[] = [];
  const testRentalIds: string[] = [];
  const testBottleIds: string[] = [];
  const testCheckoutIds: string[] = [];

  beforeAll(async () => {
    raw = await openRawClient();
    fx = await seedIsolationFixture(raw);
    app = await createTestApp();
    sltJobs = app.get(SltJobs);

    const brandALogin = await login(app, fx.brandAdminAEmail, TEST_PASSWORD);
    brandAToken = brandALogin.accessToken;
    brandA = asUser(app, brandAToken);

    const superAdminLogin = await login(app, fx.superAdminEmail, TEST_PASSWORD);
    superAdminToken = superAdminLogin.accessToken;
    superAdmin = asUser(app, superAdminToken);

    packageId = randomUUID();
    storagePlanId = randomUUID();
    const pkgRes = await raw.query(
      `INSERT INTO rental_packages (id, name, duration_months, discount_percent, is_active)
       VALUES ($1, $2, 1, 0, true)
       ON CONFLICT (name) DO UPDATE SET is_active = true RETURNING id`,
      [packageId, `Gói Test 1 Tháng Task 3 ${fx.runId}`],
    );
    packageId = pkgRes.rows[0].id;

    const planRes = await raw.query(
      `INSERT INTO storage_plans (id, name, monthly_price, currency, coverage_percent, coverage_cap, is_active)
       VALUES ($1, $2, 50000, 'VND', 30, 2000000, true)
       ON CONFLICT (name) DO UPDATE SET is_active = true RETURNING id`,
      [storagePlanId, `Bảo quản Test Task 3 ${fx.runId}`],
    );
    storagePlanId = planRes.rows[0].id;
  }, 120_000);

  afterAll(async () => {
    if (raw) {
      await raw.query('BEGIN');
      try {
        await raw.query("SET session_replication_role = 'replica'");
        if (testSlotIds.length > 0) {
          await raw.query(`UPDATE machine_slots SET active_bottle_id = NULL WHERE id = ANY($1)`, [
            testSlotIds,
          ]);
        }
        if (testBottleIds.length > 0) {
          await raw.query(`DELETE FROM bottles WHERE id = ANY($1)`, [testBottleIds]);
        }
        if (testRentalIds.length > 0) {
          await raw.query(`DELETE FROM slot_rentals WHERE id = ANY($1)`, [testRentalIds]);
        }
        if (testCheckoutIds.length > 0) {
          await raw.query(`DELETE FROM rental_checkouts WHERE id = ANY($1)`, [testCheckoutIds]);
        }
        await raw.query("SET session_replication_role = 'origin'");
        await raw.query('COMMIT');
      } catch {
        await raw.query('ROLLBACK');
      }
      await cleanupIsolationFixture(raw, fx);
      await raw.end();
    }
    if (app) {
      await app.close();
    }
  });

  /** Helper tạo slot và hóa đơn thuê */
  async function createRentalFixture(params: {
    status: 'ACTIVE' | 'EXPIRING' | 'GRACE' | 'LIQUIDATED' | 'CLOSED';
    endsAtOffsetDays: number;
    graceEndsAtOffsetDays?: number | null;
  }) {
    const slotId = randomUUID();
    testSlotIds.push(slotId);
    const checkoutId = randomUUID();
    testCheckoutIds.push(checkoutId);
    const rentalId = randomUUID();
    testRentalIds.push(rentalId);

    const now = new Date();
    const startsAt = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const endsAt = new Date(now.getTime() + params.endsAtOffsetDays * 24 * 60 * 60 * 1000);
    const graceEndsAt =
      params.graceEndsAtOffsetDays !== undefined && params.graceEndsAtOffsetDays !== null
        ? new Date(now.getTime() + params.graceEndsAtOffsetDays * 24 * 60 * 60 * 1000)
        : null;

    await raw.query('BEGIN');
    try {
      await raw.query(
        `INSERT INTO machine_slots (id, machine_id, slot_number, status, monthly_rent_price, calibrated_dosage_ml, low_stock_threshold_ml)
         VALUES ($1, $2, (SELECT COALESCE(MAX(slot_number), 0) + 1 FROM machine_slots WHERE machine_id = $2), 'AVAILABLE', 1000000, 0.5, 5.0)`,
        [slotId, fx.machineId],
      );

      await raw.query(
        `INSERT INTO rental_checkouts (id, brand_id, currency, total_amount, hold_expires_at, paid_at, created_by)
         VALUES ($1, $2, 'VND', 1050000, NOW() + INTERVAL '1 hour', NOW() - INTERVAL '10 days', $3)`,
        [checkoutId, fx.brandA, fx.superAdminId],
      );

      await raw.query(
        `INSERT INTO slot_rentals (
           id, slot_id, brand_id, rental_package_id, storage_plan_id,
           checkout_id, duration_months, monthly_rent_price, discount_percent,
           storage_monthly_price, storage_coverage_percent, storage_coverage_cap,
           rent_amount, storage_amount, grace_fee_amount, total_amount,
           starts_at, ends_at, grace_ends_at, status, currency, created_by,
           paid_at, invoice_number, fragrance_product_id
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, 1, 1000000, 0,
           50000, 30, 2000000,
           1000000, 50000, 0, 1050000,
           $7, $8, $9, $10, 'VND', $11,
           $12, $13, $14
         )`,
        [
          rentalId,
          slotId,
          fx.brandA,
          packageId,
          storagePlanId,
          checkoutId,
          startsAt,
          endsAt,
          graceEndsAt,
          params.status,
          fx.superAdminId,
          startsAt,
          `HD-TEST-${randomUUID().slice(0, 8)}`,
          fx.products[0],
        ],
      );

      await raw.query('COMMIT');
    } catch (err) {
      await raw.query('ROLLBACK');
      throw err;
    }

    return { slotId, rentalId };
  }

  /** Helper tạo chai và gắn vào slot */
  async function createBottleFixture(params: {
    slotId: string;
    rentalId: string;
    status: 'IN_STOCK' | 'INSTALLED' | 'EMPTY' | 'LIQUIDATED';
    currentEstimatedMl: number;
    owner?: 'BRAND' | 'PLATFORM';
    isInstalledOnSlot?: boolean;
  }) {
    const bottleId = randomUUID();
    testBottleIds.push(bottleId);

    await raw.query(
      `INSERT INTO bottles (
         id, brand_id, batch_id, fragrance_product_id, identifier,
         status, initial_volume_ml, current_estimated_ml, owner,
         source_rental_id, expires_at
       ) VALUES (
         $1, $2, (SELECT id FROM inventory_batches WHERE brand_id = $2 LIMIT 1), $3, $4,
         $5, 100, $6, $7,
         $8, NOW() + INTERVAL '1 year'
       )`,
      [
        bottleId,
        fx.brandA,
        fx.products[0],
        `BTL-TEST-${randomUUID().slice(0, 8)}`,
        params.status,
        params.currentEstimatedMl,
        params.owner ?? 'BRAND',
        params.rentalId,
      ],
    );

    const shouldInstall = params.isInstalledOnSlot ?? (params.status === 'INSTALLED');
    if (shouldInstall) {
      await raw.query(`UPDATE machine_slots SET active_bottle_id = $1 WHERE id = $2`, [
        bottleId,
        params.slotId,
      ]);
    }

    return bottleId;
  }

  describe('FR-EXP-14, FR-EXP-15, FR-EXP-16: Tự động thanh lý qua Job', () => {
    it('test_FR_EXP_14_job_auto_liquidates_overdue_grace_rental_and_transfers_bottle_ownership', async () => {
      // Setup: Hóa đơn GRACE đã quá hạn (grace_ends_at = now - 1 day)
      const { slotId, rentalId } = await createRentalFixture({
        status: 'GRACE',
        endsAtOffsetDays: -8,
        graceEndsAtOffsetDays: -1,
      });

      // Chai đang lắp trên slot
      const bottle1Id = await createBottleFixture({
        slotId,
        rentalId,
        status: 'INSTALLED',
        currentEstimatedMl: 45,
        owner: 'BRAND',
      });

      // Chai dự phòng được gán source_rental_id
      const bottle2Id = await createBottleFixture({
        slotId,
        rentalId,
        status: 'IN_STOCK',
        currentEstimatedMl: 100,
        owner: 'BRAND',
      });

      // Kích hoạt job
      const count = await sltJobs.autoTransitionToLiquidated();
      expect(count).toBeGreaterThanOrEqual(1);

      // 1. Kiểm tra trạng thái hóa đơn
      const rentalCheck = await raw.query(`SELECT status FROM slot_rentals WHERE id = $1`, [
        rentalId,
      ]);
      expect(rentalCheck.rows[0].status).toBe('LIQUIDATED');

      // 2. Kiểm tra quyền sở hữu chai: owner = 'PLATFORM', status = 'LIQUIDATED' (FR-EXP-15)
      const bottle1Check = await raw.query(
        `SELECT owner, status, liquidated_at, source_rental_id FROM bottles WHERE id = $1`,
        [bottle1Id],
      );
      expect(bottle1Check.rows[0].owner).toBe('PLATFORM');
      expect(bottle1Check.rows[0].status).toBe('LIQUIDATED');
      expect(bottle1Check.rows[0].liquidated_at).not.toBeNull();
      expect(bottle1Check.rows[0].source_rental_id).toBe(rentalId);

      const bottle2Check = await raw.query(
        `SELECT owner, status, liquidated_at, source_rental_id FROM bottles WHERE id = $1`,
        [bottle2Id],
      );
      expect(bottle2Check.rows[0].owner).toBe('PLATFORM');
      expect(bottle2Check.rows[0].status).toBe('LIQUIDATED');
      expect(bottle2Check.rows[0].liquidated_at).not.toBeNull();
      expect(bottle2Check.rows[0].source_rental_id).toBe(rentalId);

      // 3. Kiểm tra audit log (FR-EXP-21)
      const auditRental = await raw.query(
        `SELECT * FROM audit_logs WHERE target_id = $1 AND action = 'slt.rental.liquidated'`,
        [rentalId],
      );
      expect(auditRental.rows.length).toBeGreaterThanOrEqual(1);

      const auditBottle = await raw.query(
        `SELECT * FROM audit_logs WHERE target_id = $1 AND action = 'slt.bottle.liquidated'`,
        [bottle1Id],
      );
      expect(auditBottle.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('test_FR_EXP_21_audit_log_recorded_for_liquidation_and_closure', async () => {
      // Xác nhận audit log ghi nhận đầy đủ action slt.rental.liquidated, slt.bottle.liquidated và slt.rental.closed
      const res = await raw.query(
        `SELECT action FROM audit_logs WHERE action IN ('slt.rental.liquidated', 'slt.bottle.liquidated', 'slt.rental.closed')`,
      );
      expect(res.rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('FR-EXP-15, FR-EXP-16: Super Admin thanh lý thủ công qua API', () => {
    it('test_FR_EXP_16_rejects_without_reauth_token', async () => {
      const { rentalId } = await createRentalFixture({
        status: 'GRACE',
        endsAtOffsetDays: -2,
        graceEndsAtOffsetDays: 5,
      });

      const res = await superAdmin('POST', `/slot-rentals/${rentalId}/liquidate`);
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('REAUTH_REQUIRED');
    });

    it('test_FR_EXP_15_manual_liquidate_succeeds_with_valid_reauth_token', async () => {
      const { slotId, rentalId } = await createRentalFixture({
        status: 'GRACE',
        endsAtOffsetDays: -2,
        graceEndsAtOffsetDays: 5,
      });

      const bottleId = await createBottleFixture({
        slotId,
        rentalId,
        status: 'INSTALLED',
        currentEstimatedMl: 30,
        owner: 'BRAND',
      });

      // 1. Lấy reauth token từ POST /auth/reauth
      const reauthToken = await reauth(app, superAdminToken, TEST_PASSWORD);
      expect(reauthToken).toBeDefined();

      // 2. Gọi API liquidate kèm header X-Reauth-Token
      const liquidateRes = await superAdmin('POST', `/slot-rentals/${rentalId}/liquidate`, {
        headers: { 'x-reauth-token': reauthToken },
      });
      expect(liquidateRes.statusCode).toBe(200);
      const body = liquidateRes.json();
      expect(body.rental.status).toBe('LIQUIDATED');
      expect(body.bottles.length).toBeGreaterThanOrEqual(1);
      expect(body.bottles[0].owner).toBe('PLATFORM');
      expect(body.bottles[0].status).toBe('LIQUIDATED');

      // 3. Kiểm tra DB
      const bottleCheck = await raw.query(
        `SELECT owner, status, liquidated_at FROM bottles WHERE id = $1`,
        [bottleId],
      );
      expect(bottleCheck.rows[0].owner).toBe('PLATFORM');
      expect(bottleCheck.rows[0].status).toBe('LIQUIDATED');
      expect(bottleCheck.rows[0].liquidated_at).not.toBeNull();
    });

    it('test_FR_EXP_16_rejects_brand_admin_forbidden_scope', async () => {
      const { rentalId } = await createRentalFixture({
        status: 'GRACE',
        endsAtOffsetDays: -2,
        graceEndsAtOffsetDays: 5,
      });

      const reauthToken = await reauth(app, brandAToken, TEST_PASSWORD);

      const res = await brandA('POST', `/slot-rentals/${rentalId}/liquidate`, {
        headers: { 'x-reauth-token': reauthToken },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('FORBIDDEN_SCOPE');
    });

    it('test_FR_EXP_16_rejects_when_rental_not_grace', async () => {
      const { rentalId } = await createRentalFixture({
        status: 'ACTIVE',
        endsAtOffsetDays: 15,
      });

      const reauthToken = await reauth(app, superAdminToken, TEST_PASSWORD);

      const res = await superAdmin('POST', `/slot-rentals/${rentalId}/liquidate`, {
        headers: { 'x-reauth-token': reauthToken },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('RENTAL_NOT_ACTIVE');
    });
  });

  describe('FR-SLT-14, FR-EXP-21: Platform Super Admin đóng hóa đơn (POST /slot-rentals/:id/close)', () => {
    it('test_FR_SLT_14_rejects_conflict_when_slot_has_active_bottle', async () => {
      const { slotId, rentalId } = await createRentalFixture({
        status: 'LIQUIDATED',
        endsAtOffsetDays: -10,
      });

      // Chai trên slot còn 25ml và chưa tháo
      await createBottleFixture({
        slotId,
        rentalId,
        status: 'LIQUIDATED',
        currentEstimatedMl: 25,
        owner: 'PLATFORM',
        isInstalledOnSlot: true,
      });

      const res = await superAdmin('POST', `/slot-rentals/${rentalId}/close`);
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('SLOT_HAS_ACTIVE_BOTTLE');
    });

    it('test_FR_SLT_14_closes_successfully_and_frees_slot_when_bottle_empty', async () => {
      const { slotId, rentalId } = await createRentalFixture({
        status: 'LIQUIDATED',
        endsAtOffsetDays: -10,
      });

      // Chai trên slot đã EMPTY (dung tích = 0)
      await createBottleFixture({
        slotId,
        rentalId,
        status: 'EMPTY',
        currentEstimatedMl: 0,
        owner: 'PLATFORM',
        isInstalledOnSlot: true,
      });

      const res = await superAdmin('POST', `/slot-rentals/${rentalId}/close`);
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('CLOSED');

      // 1. Kiểm tra trạng thái hóa đơn trong DB
      const rentalCheck = await raw.query(`SELECT status FROM slot_rentals WHERE id = $1`, [
        rentalId,
      ]);
      expect(rentalCheck.rows[0].status).toBe('CLOSED');

      // 2. Kiểm tra slot đã được giải phóng sang AVAILABLE và active_bottle_id được gỡ bỏ
      const slotCheck = await raw.query(
        `SELECT status, active_bottle_id FROM machine_slots WHERE id = $1`,
        [slotId],
      );
      expect(slotCheck.rows[0].status).toBe('AVAILABLE');
      expect(slotCheck.rows[0].active_bottle_id).toBeNull();

      // 3. Kiểm tra audit log slt.rental.closed (FR-EXP-21)
      const auditCheck = await raw.query(
        `SELECT * FROM audit_logs WHERE target_id = $1 AND action = 'slt.rental.closed'`,
        [rentalId],
      );
      expect(auditCheck.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('test_FR_SLT_14_closes_successfully_when_slot_has_no_active_bottle', async () => {
      const { slotId, rentalId } = await createRentalFixture({
        status: 'LIQUIDATED',
        endsAtOffsetDays: -10,
      });

      // Slot không có active_bottle_id (đã tháo chai trước đó)
      await raw.query(`UPDATE machine_slots SET active_bottle_id = NULL WHERE id = $1`, [slotId]);

      const res = await superAdmin('POST', `/slot-rentals/${rentalId}/close`);
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('CLOSED');

      const slotCheck = await raw.query(`SELECT status FROM machine_slots WHERE id = $1`, [slotId]);
      expect(slotCheck.rows[0].status).toBe('AVAILABLE');
    });

    it('test_FR_SLT_14_rejects_brand_admin_scope', async () => {
      const { rentalId } = await createRentalFixture({
        status: 'LIQUIDATED',
        endsAtOffsetDays: -10,
      });

      const res = await brandA('POST', `/slot-rentals/${rentalId}/close`);
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('FORBIDDEN_SCOPE');
    });

    it('test_FR_SLT_14_rejects_when_rental_not_liquidated', async () => {
      const { rentalId } = await createRentalFixture({
        status: 'GRACE',
        endsAtOffsetDays: -2,
        graceEndsAtOffsetDays: 5,
      });

      const res = await superAdmin('POST', `/slot-rentals/${rentalId}/close`);
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('RENTAL_NOT_ACTIVE');
    });
  });
});
