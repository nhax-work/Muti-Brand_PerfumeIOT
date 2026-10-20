/**
 * Integration test cho Task 8: Báo không gia hạn và rút lại (FR-EXP-23 ÷ 25, ADR-0014).
 * - POST /slot-rentals/:id/non-renewal
 * - DELETE /slot-rentals/:id/non-renewal
 * - Kiểm tra phân quyền & scoping (Brand A, Brand B, Platform Admin).
 * - Kiểm tra trạng thái và mốc thời gian (ACTIVE vs LIQUIDATED/ended).
 * - Kiểm tra tính bất biến / idempotent và ghi audit log.
 * - Kiểm tra cập nhật CSDL (non_renewal_requested_at, non_renewal_requested_by, return_method).
 */

import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestApp, login } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import {
  cleanupIsolationFixture,
  releaseOpenOrders,
  seedIsolationFixture,
  TEST_PASSWORD,
  type IsolationFixture,
} from './helpers/seed-isolation.js';

describe('SLT Non-Renewal Integration Tests (Task 8 / ADR-0014)', () => {
  let app: NestFastifyApplication;
  let raw: pg.Client;
  let fx: IsolationFixture;
  let brandA: ReturnType<typeof asUser>;
  let brandB: ReturnType<typeof asUser>;
  let superAdmin: ReturnType<typeof asUser>;

  beforeAll(async () => {
    raw = await openRawClient();
    fx = await seedIsolationFixture(raw);
    app = await createTestApp();
    brandA = asUser(app, (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken);
    brandB = asUser(app, (await login(app, fx.brandAdminBEmail, TEST_PASSWORD)).accessToken);
    superAdmin = asUser(app, (await login(app, fx.superAdminEmail, TEST_PASSWORD)).accessToken);
  }, 120_000);

  afterAll(async () => {
    if (fx && raw) {
      const orderIds = `SELECT id FROM orders WHERE machine_id = $1`;
      await raw.query(
        `DELETE FROM payment_events WHERE payment_id IN (SELECT id FROM payments WHERE order_id IN (${orderIds}))`,
        [fx.machineId],
      );
      await raw.query(`DELETE FROM payments WHERE order_id IN (${orderIds})`, [fx.machineId]);
      await raw.query(`DELETE FROM order_status_histories WHERE order_id IN (${orderIds})`, [
        fx.machineId,
      ]);
      await raw.query(`DELETE FROM dispense_commands WHERE machine_id = $1`, [fx.machineId]);
      await raw.query(`DELETE FROM orders WHERE machine_id = $1`, [fx.machineId]);
      await cleanupIsolationFixture(raw, fx);
      await raw.end();
    }
    if (app) {
      await app.close();
    }
  });

  it('từ chối 403 FORBIDDEN_SCOPE khi Brand B gọi vào hóa đơn của Brand A', async () => {
    const rentalId = fx.rentals[0]; // thuộc Brand A
    const res = await brandB('POST', `/slot-rentals/${rentalId}/non-renewal`, {
      payload: { returnMethod: 'WAREHOUSE_PICKUP' },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code).toBe('FORBIDDEN_SCOPE');
  });

  it('từ chối 403 FORBIDDEN_SCOPE khi Platform Admin (không có brandId) gọi báo không gia hạn', async () => {
    const rentalId = fx.rentals[0];
    const res = await superAdmin('POST', `/slot-rentals/${rentalId}/non-renewal`, {
      payload: { returnMethod: 'WAREHOUSE_PICKUP' },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code).toBe('FORBIDDEN_SCOPE');
  });

  it('từ chối 403/404 khi không tìm thấy hóa đơn', async () => {
    const nonExistentId = randomUUID();
    const res = await brandA('POST', `/slot-rentals/${nonExistentId}/non-renewal`, {
      payload: { returnMethod: 'WAREHOUSE_PICKUP' },
    });
    expect([403, 404]).toContain(res.statusCode);
  });

  it('từ chối 409 RENTAL_NOT_ACTIVE khi hóa đơn đã quá hạn hoặc không còn ACTIVE', async () => {
    const liquidatedRentalId = fx.rentals[4]; // LIQUIDATED, ends_at trong quá khứ
    const res = await brandA('POST', `/slot-rentals/${liquidatedRentalId}/non-renewal`, {
      payload: { returnMethod: 'WAREHOUSE_PICKUP' },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.code).toBe('RENTAL_NOT_ACTIVE');
  });

  it('từ chối 400 khi body returnMethod không hợp lệ', async () => {
    const rentalId = fx.rentals[0];
    const res = await brandA('POST', `/slot-rentals/${rentalId}/non-renewal`, {
      payload: { returnMethod: 'INVALID_METHOD' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('báo không gia hạn thành công (POST) và ghi nhận vào CSDL cùng audit log', async () => {
    const rentalId = fx.rentals[0];
    const res = await brandA('POST', `/slot-rentals/${rentalId}/non-renewal`, {
      payload: { returnMethod: 'WAREHOUSE_PICKUP' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(rentalId);
    expect(body.nonRenewalRequestedAt).toBeTruthy();
    expect(body.returnMethod).toBe('WAREHOUSE_PICKUP');

    // Kiểm tra trực tiếp bảng slot_rentals trong CSDL
    const dbRental = await raw.query(
      `SELECT non_renewal_requested_at, non_renewal_requested_by, return_method
       FROM slot_rentals WHERE id = $1`,
      [rentalId],
    );
    expect(dbRental.rows.length).toBe(1);
    expect(dbRental.rows[0].non_renewal_requested_at).not.toBeNull();
    expect(dbRental.rows[0].non_renewal_requested_by).not.toBeNull();
    expect(dbRental.rows[0].return_method).toBe('WAREHOUSE_PICKUP');

    // Kiểm tra audit log
    const auditRes = await raw.query(
      `SELECT action, target_id FROM audit_logs
       WHERE target_id = $1 AND action = 'slt.rental.non_renewal_requested'`,
      [rentalId],
    );
    expect(auditRes.rows.length).toBe(1);
  });

  it('idempotent khi gọi lại POST với cùng returnMethod — không sinh thêm audit log', async () => {
    const rentalId = fx.rentals[0];
    const res = await brandA('POST', `/slot-rentals/${rentalId}/non-renewal`, {
      payload: { returnMethod: 'WAREHOUSE_PICKUP' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.returnMethod).toBe('WAREHOUSE_PICKUP');

    const auditRes = await raw.query(
      `SELECT id FROM audit_logs
       WHERE target_id = $1 AND action = 'slt.rental.non_renewal_requested'`,
      [rentalId],
    );
    expect(auditRes.rows.length).toBe(1);
  });

  it('cho phép đổi phương thức nhận hàng (POST SHIP_TO_BRAND) và ghi audit log mới', async () => {
    const rentalId = fx.rentals[0];
    const res = await brandA('POST', `/slot-rentals/${rentalId}/non-renewal`, {
      payload: { returnMethod: 'SHIP_TO_BRAND' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.returnMethod).toBe('SHIP_TO_BRAND');

    const dbRental = await raw.query(`SELECT return_method FROM slot_rentals WHERE id = $1`, [
      rentalId,
    ]);
    expect(dbRental.rows[0].return_method).toBe('SHIP_TO_BRAND');

    const auditRes = await raw.query(
      `SELECT id FROM audit_logs
       WHERE target_id = $1 AND action = 'slt.rental.non_renewal_requested'`,
      [rentalId],
    );
    expect(auditRes.rows.length).toBe(2);
  });

  it('rút lại yêu cầu không gia hạn (DELETE) — xóa thông tin trong CSDL và ghi audit log', async () => {
    const rentalId = fx.rentals[0];
    const res = await brandA('DELETE', `/slot-rentals/${rentalId}/non-renewal`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(rentalId);
    expect(body.nonRenewalRequestedAt).toBeNull();
    expect(body.returnMethod).toBeNull();

    // Kiểm tra CSDL
    const dbRental = await raw.query(
      `SELECT non_renewal_requested_at, non_renewal_requested_by, return_method
       FROM slot_rentals WHERE id = $1`,
      [rentalId],
    );
    expect(dbRental.rows[0].non_renewal_requested_at).toBeNull();
    expect(dbRental.rows[0].non_renewal_requested_by).toBeNull();
    expect(dbRental.rows[0].return_method).toBeNull();

    // Kiểm tra audit log
    const auditRes = await raw.query(
      `SELECT action FROM audit_logs
       WHERE target_id = $1 AND action = 'slt.rental.non_renewal_withdrawn'`,
      [rentalId],
    );
    expect(auditRes.rows.length).toBe(1);
  });

  it('idempotent khi gọi lại DELETE khi chưa/không còn báo không gia hạn — trả 200, không lỗi và không ghi audit log trùng', async () => {
    const rentalId = fx.rentals[0];
    const res = await brandA('DELETE', `/slot-rentals/${rentalId}/non-renewal`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.nonRenewalRequestedAt).toBeNull();
    expect(body.returnMethod).toBeNull();

    const auditRes = await raw.query(
      `SELECT id FROM audit_logs
       WHERE target_id = $1 AND action = 'slt.rental.non_renewal_withdrawn'`,
      [rentalId],
    );
    expect(auditRes.rows.length).toBe(1);
  });

  it('từ chối DELETE khi gọi từ Brand B (403 FORBIDDEN_SCOPE)', async () => {
    const rentalId = fx.rentals[0];
    const res = await brandB('DELETE', `/slot-rentals/${rentalId}/non-renewal`);
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code).toBe('FORBIDDEN_SCOPE');
  });

  it('FR-EXP-25 AC2: đơn kiosk tạo sau ends_at trên slot đã báo không gia hạn — đơn thành công, revenue_owner=BRAND, hóa đơn vẫn ACTIVE/EXPIRING', async () => {
    const rentalId = fx.rentals[1];
    const slotId = fx.slots[1];

    // Báo không gia hạn trước ends_at
    const nonRenewalRes = await brandA('POST', `/slot-rentals/${rentalId}/non-renewal`, {
      payload: { returnMethod: 'SHIP_TO_BRAND' },
    });
    expect(nonRenewalRes.statusCode).toBe(200);

    // Giả lập mốc ends_at đã qua: cập nhật ends_at về 2 ngày trước trong CSDL (vẫn giữ status ACTIVE)
    await raw.query(
      `UPDATE slot_rentals
       SET ends_at = now() - interval '2 days'
       WHERE id = $1`,
      [rentalId],
    );

    // Giải phóng mọi đơn pending trên máy (nếu có) để thỏa uq_machine_open_order
    await releaseOpenOrders(raw, fx.machineId);

    // Khách mua lượt xịt tại máy kiosk sau ends_at
    const orderRes = await app.inject({
      method: 'POST',
      url: '/api/v1/kiosk/orders',
      headers: { 'idempotency-key': randomUUID() },
      payload: { machineSerial: fx.machineSerial, slotId },
    });

    expect(orderRes.statusCode).toBe(201);
    const orderBody = orderRes.json<{
      order: { id: string; revenueOwner: string; status: string };
    }>().order;

    // Doanh thu vẫn thuộc về thương hiệu (revenue_owner = 'BRAND')
    expect(orderBody.revenueOwner).toBe('BRAND');

    // Kiểm tra trực tiếp CSDL: revenue_owner trong bảng orders
    const dbOrder = await raw.query(`SELECT revenue_owner, status FROM orders WHERE id = $1`, [
      orderBody.id,
    ]);
    expect(dbOrder.rows[0].revenue_owner).toBe('BRAND');

    // Hóa đơn vẫn ở trạng thái ACTIVE (không tự đổi sang GRACE hay CLOSED khi chưa tháo chai)
    const dbRental = await raw.query(
      `SELECT status, non_renewal_requested_at FROM slot_rentals WHERE id = $1`,
      [rentalId],
    );
    expect(['ACTIVE', 'EXPIRING']).toContain(dbRental.rows[0].status);
    expect(dbRental.rows[0].non_renewal_requested_at).not.toBeNull();
  });
});
