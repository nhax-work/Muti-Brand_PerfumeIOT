/**
 * Kiểm thử tích hợp thông báo hết hạn hóa đơn thuê slot (FR-EXP-01 ÷ 04, FR-SLT-24).
 * Chạy trên PostgreSQL thật.
 */

import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AlrService } from '../../apps/api/src/modules/alr/index.js';
import type { AuthenticatedUser } from '../../apps/api/src/modules/auth/index.js';
import { InvService } from '../../apps/api/src/modules/inv/index.js';
import { createTestApp } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
  seedPlatformStaff,
  type IsolationFixture,
  type PlatformStaff,
} from './helpers/seed-isolation.js';

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let alr: AlrService;
let inv: InvService;
let opsStaff: PlatformStaff;

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  opsStaff = await seedPlatformStaff(client, fx, 'INVENTORY_STAFF', ['inventory.refill']);
  app = await createTestApp();
  alr = app.get(AlrService);
  inv = app.get(InvService);
}, 60_000);

afterEach(async () => {
  await client.query(`DELETE FROM notifications WHERE brand_id = $1`, [fx.brandA]);
});

afterAll(async () => {
  await cleanupIsolationFixture(client, fx);
  await opsStaff.cleanup();
  await app.close();
  await client.end();
});

describe('EXP Expiry Notifications & Rental Activation Integration Tests', () => {
  it('test_FR_EXP_01_expiring_rentals_7_days: Thông báo trước 7 ngày khi hóa đơn sắp hết hạn', async () => {
    const now = new Date('2026-10-25T10:00:00Z');
    const end7Days = new Date('2026-11-01T15:00:00Z');
    await client.query(`UPDATE slot_rentals SET ends_at = $1, status = 'ACTIVE' WHERE id = $2`, [
      end7Days,
      fx.rentals[0],
    ]);

    const res7 = await alr.sweepExpiringRentals(now);
    expect(res7.notified7).toBeGreaterThanOrEqual(1);

    const notifRes7 = await client.query(
      `SELECT type, channel, subject, content, reference_id FROM notifications
       WHERE brand_id = $1 AND type = 'RENTAL_EXPIRING_7_DAYS'`,
      [fx.brandA],
    );
    expect(notifRes7.rows).toHaveLength(2); // 1 IN_APP, 1 EMAIL
    expect(notifRes7.rows[0].subject).toContain('7 ngày');
  });

  it('test_FR_EXP_02_expiring_rentals_3_days: Thông báo khẩn cấp trước 3 ngày khi hóa đơn sắp hết hạn', async () => {
    const now = new Date('2026-10-25T10:00:00Z');
    const end3Days = new Date('2026-10-28T15:00:00Z');
    await client.query(`UPDATE slot_rentals SET ends_at = $1, status = 'ACTIVE' WHERE id = $2`, [
      end3Days,
      fx.rentals[0],
    ]);

    const res3 = await alr.sweepExpiringRentals(now);
    expect(res3.notified3).toBeGreaterThanOrEqual(1);

    const notifRes3 = await client.query(
      `SELECT type, subject, content FROM notifications
       WHERE brand_id = $1 AND type = 'RENTAL_EXPIRING_3_DAYS'`,
      [fx.brandA],
    );
    expect(notifRes3.rows.length).toBeGreaterThanOrEqual(1);
    expect(notifRes3.rows[0].subject).toContain('[Khẩn cấp]');
  });

  it('test_FR_EXP_03_group_expiring_notifications: Gom thông báo cho nhiều slot của cùng thương hiệu hết hạn cùng ngày', async () => {
    const now = new Date('2026-10-25T10:00:00Z');
    const end7Days = new Date('2026-11-01T15:00:00Z');
    await client.query(
      `UPDATE slot_rentals SET ends_at = $1, status = 'ACTIVE' WHERE id IN ($2, $3)`,
      [end7Days, fx.rentals[0], fx.rentals[1]],
    );

    // Xóa thông báo cũ để kiểm tra gom
    await client.query(`DELETE FROM notifications WHERE brand_id = $1`, [fx.brandA]);

    const res = await alr.sweepExpiringRentals(now);
    expect(res.notified7).toBe(1); // Chỉ gửi 1 đợt thông báo (1 in-app, 1 email) dù có thể có nhiều slot

    const notifs = await client.query(
      `SELECT id FROM notifications WHERE brand_id = $1 AND type = 'RENTAL_EXPIRING_7_DAYS'`,
      [fx.brandA],
    );
    expect(notifs.rows.length).toBe(2); // 1 IN_APP, 1 EMAIL cho thương hiệu
  });

  it('test_FR_EXP_04_audit_log_expiring_notice: Ghi AuditLog EXPIRY_NOTICE_SENT cho từng hóa đơn được nhắc nhở', async () => {
    const now = new Date('2026-10-25T10:00:00Z');
    const end7Days = new Date('2026-11-01T15:00:00Z');
    await client.query(`UPDATE slot_rentals SET ends_at = $1, status = 'ACTIVE' WHERE id = $2`, [
      end7Days,
      fx.rentals[0],
    ]);

    await alr.sweepExpiringRentals(now);

    const auditRes = await client.query(
      `SELECT action, target_type, target_id FROM audit_logs
       WHERE brand_id = $1 AND action = 'EXPIRY_NOTICE_SENT' AND target_id = $2`,
      [fx.brandA, fx.rentals[0]],
    );
    expect(auditRes.rows.length).toBeGreaterThanOrEqual(1);
    expect(auditRes.rows[0].target_type).toBe('SlotRental');
  });

  it('test_FR_SLT_24_activate_rental_on_first_install: Kích hoạt hợp đồng DRAFT sang ACTIVE khi gắn chai đầu tiên', async () => {
    const draftRentalId = randomUUID();
    const testSlotId = randomUUID();
    const batchId = randomUUID();
    const bottleId = randomUUID();
    const now = new Date();
    let sessionId: string | undefined;

    try {
      // Tạo slot riêng để kiểm thử kích hoạt
      await client.query(
        `INSERT INTO machine_slots (
           id, machine_id, slot_number, calibrated_dosage_ml, low_stock_threshold_ml,
           estimated_remaining_ml, estimated_remaining_sprays, status
         ) VALUES ($1, $2, 99, 0.1200, 5.0000, 0, 0, 'AVAILABLE')`,
        [testSlotId, fx.machineId],
      );

      const invoiceNum = `INV-TEST-${randomUUID().slice(0, 8)}`;
      await client.query(
        `INSERT INTO slot_rentals (
           id, slot_id, brand_id, fragrance_product_id, product_assigned_at,
           status, starts_at, ends_at, price_per_spray, currency,
           paid_at, invoice_number, created_by
         ) VALUES ($1, $2, $3, $4, $5, 'DRAFT', $5, $6, '35000.0000', 'VND', $5, $7, $8)`,
        [
          draftRentalId,
          testSlotId,
          fx.brandA,
          fx.products[0],
          now,
          new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          invoiceNum,
          opsStaff.userId,
        ],
      );

      // Lô hàng được duyệt chính hãng
      await client.query(
        `INSERT INTO inventory_batches (
           id, brand_id, fragrance_product_id, batch_number, received_at, expires_at,
           quantity_received, created_by, authenticity_status,
           authenticity_document_url, authenticity_submitted_by, authenticity_submitted_at,
           authenticity_verified_by, authenticity_verified_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 10, $7, 'APPROVED', $8, $7, $5, $7, $5)`,
        [
          batchId,
          fx.brandA,
          fx.products[0],
          `LOT-${randomUUID().slice(0, 8)}`,
          now,
          new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
          opsStaff.userId,
          'https://example.com/doc.pdf',
        ],
      );

      await client.query(
        `INSERT INTO bottles (
           id, brand_id, owner, batch_id, fragrance_product_id, identifier,
           status, initial_volume_ml, current_estimated_ml,
           opened_at, installed_at, expires_at
         ) VALUES ($1, $2, 'BRAND', $3, $4, $5, 'IN_STOCK', 100, 100, null, null, $6)`,
        [
          bottleId,
          fx.brandA,
          batchId,
          fx.products[0],
          `BTL-ACTIVATE-${randomUUID().slice(0, 8)}`,
          new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
        ],
      );

      const staffActor: AuthenticatedUser = {
        userId: opsStaff.userId,
        email: opsStaff.email,
        fullName: 'Ops Staff',
        roles: ['INVENTORY_STAFF'],
        permissions: new Set(['inventory.refill']),
        brandId: null,
        sessionId: randomUUID(),
        mustChangePassword: false,
        permissionVersion: 1,
        scope: { type: 'PLATFORM' },
      };

      const session = await inv.openRefillSession(staffActor, { slotId: testSlotId });
      sessionId = session.id;

      await inv.closeRefillSession(staffActor, session.id, { newBottleId: bottleId });

      const rentalCheck = await client.query(`SELECT status FROM slot_rentals WHERE id = $1`, [
        draftRentalId,
      ]);
      expect(rentalCheck.rows[0].status).toBe('ACTIVE');

      const notifCheck = await client.query(
        `SELECT type, subject FROM notifications WHERE brand_id = $1 AND type = 'RENTAL_ACTIVE'`,
        [fx.brandA],
      );
      expect(notifCheck.rows.length).toBeGreaterThanOrEqual(1);
      expect(notifCheck.rows[0].subject).toContain('hiệu lực');
    } finally {
      // Dọn dẹp an toàn các bản ghi do test này tạo ra
      if (sessionId) {
        await client.query(`DELETE FROM refill_sessions WHERE id = $1`, [sessionId]);
      }
      await client.query(`UPDATE machine_slots SET active_bottle_id = NULL WHERE id = $1`, [
        testSlotId,
      ]);
      await client.query(`DELETE FROM bottles WHERE id = $1`, [bottleId]);
      await client.query(`DELETE FROM inventory_batches WHERE id = $1`, [batchId]);
      await client.query(`DELETE FROM slot_rentals WHERE id = $1`, [draftRentalId]);
      await client.query(`DELETE FROM machine_slots WHERE id = $1`, [testSlotId]);
    }
  });
});
