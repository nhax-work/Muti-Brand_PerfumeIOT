/**
 * Bảng giá thuê slot qua HTTP thật (FR-SLT-30..32, ADR-0006): gói thuê, gói bảo quản, giá niêm yết.
 *
 * Danh mục gói là dữ liệu toàn nền tảng (không theo thương hiệu), nên tên gói mang hậu tố của lần
 * chạy và được dọn ở cuối. Ca "không ngừng được gói bảo quản cuối cùng" phụ thuộc mọi gói đang có
 * trong CSDL, nên kiểm ở tests/unit/slt.test.ts thay vì ở đây.
 */

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
let admin: ReturnType<typeof asUser>;
let brandA: ReturnType<typeof asUser>;

beforeAll(async () => {
  raw = await openRawClient();
  fx = await seedIsolationFixture(raw);
  app = await createTestApp();
  admin = asUser(app, (await login(app, fx.superAdminEmail, TEST_PASSWORD)).accessToken);
  brandA = asUser(app, (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken);
}, 120_000);

afterAll(async () => {
  await raw.query(`DELETE FROM rental_packages WHERE name LIKE $1`, [`%${fx.runId}%`]);
  await raw.query(`DELETE FROM storage_plans WHERE name LIKE $1`, [`%${fx.runId}%`]);
  await cleanupIsolationFixture(raw, fx);
  await app?.close();
  await raw?.end();
});

describe('bảng giá thuê slot', () => {
  it('test_FR_SLT_30_manage_rental_packages', async () => {
    // AC1: Super Admin tạo gói, mặc định đang mở bán, có nhật ký.
    const created = await admin('POST', '/rental-packages', {
      payload: { name: `12 tháng ${fx.runId}`, durationMonths: 12, discountPercent: 10 },
    });
    expect(created.statusCode).toBe(201);
    const pkg = created.json<{ id: string; isActive: boolean; discountPercent: number }>();
    expect(pkg).toMatchObject({ isActive: true, discountPercent: 10 });
    const audit = await raw.query(
      `SELECT 1 FROM audit_logs WHERE action = 'slt.rental_package.created' AND target_id = $1`,
      [pkg.id],
    );
    expect(audit.rowCount).toBe(1);

    // AC2: tham số sai.
    for (const payload of [
      { name: `x ${fx.runId}`, durationMonths: 0 },
      { name: `y ${fx.runId}`, durationMonths: 3, discountPercent: 101 },
    ]) {
      expect((await admin('POST', '/rental-packages', { payload })).statusCode).toBe(400);
    }

    // AC4: không phải Super Admin thì không ghi được.
    const forbidden = await brandA('POST', '/rental-packages', {
      payload: { name: `z ${fx.runId}`, durationMonths: 3 },
    });
    expect(forbidden.statusCode).toBe(403);

    // AC3: ngừng mở bán → Brand Admin không còn thấy.
    expect(
      (await admin('PATCH', `/rental-packages/${pkg.id}`, { payload: { isActive: false } }))
        .statusCode,
    ).toBe(200);
    const seenByBrand = (await brandA('GET', '/rental-packages')).json<Array<{ id: string }>>();
    expect(seenByBrand.some((p) => p.id === pkg.id)).toBe(false);
    const seenByAdmin = (await admin('GET', '/rental-packages?isActive=false')).json<
      Array<{ id: string }>
    >();
    expect(seenByAdmin.some((p) => p.id === pkg.id)).toBe(true);
  });

  it('test_FR_SLT_31_manage_storage_plans', async () => {
    // AC1
    const created = await admin('POST', '/storage-plans', {
      payload: {
        name: `Tiêu chuẩn ${fx.runId}`,
        monthlyPrice: '200000',
        coveragePercent: 60,
        coverageCap: '5000000',
      },
    });
    expect(created.statusCode).toBe(201);
    const plan = created.json<{ id: string; monthlyPrice: string; coveragePercent: number }>();
    expect(plan).toMatchObject({ monthlyPrice: '200000.0000', coveragePercent: 60 });

    // AC2: số âm, tỷ lệ ngoài [0, 100].
    for (const payload of [
      { name: `a ${fx.runId}`, monthlyPrice: '-1', coveragePercent: 60, coverageCap: '1' },
      { name: `b ${fx.runId}`, monthlyPrice: '1', coveragePercent: 160, coverageCap: '1' },
    ]) {
      expect((await admin('POST', '/storage-plans', { payload })).statusCode).toBe(400);
    }
    // AC4
    expect(
      (await brandA('PATCH', `/storage-plans/${plan.id}`, { payload: { monthlyPrice: '1' } }))
        .statusCode,
    ).toBe(403);
    // Sửa giá không đụng hóa đơn đã chụp giá (FR-SLT-33) — ở đây chỉ kiểm gói đổi đúng.
    const updated = await admin('PATCH', `/storage-plans/${plan.id}`, {
      payload: { monthlyPrice: '250000.5' },
    });
    expect(updated.json()).toMatchObject({ monthlyPrice: '250000.5000' });
  });

  it('test_FR_SLT_32_set_slot_rent_price', async () => {
    // Slot 3 trống (hóa đơn của B kết thúc) nhưng chưa có giá → chưa chào thuê.
    await raw.query(`UPDATE slot_rentals SET status = 'CLOSED' WHERE id = $1`, [fx.rentals[2]]);
    try {
      const available = async () =>
        (await brandA('GET', `/slots/available?machineId=${fx.machineId}`)).json<{
          items: Array<{ slotId: string; monthlyRentPrice: string }>;
        }>().items;
      expect(await available()).toHaveLength(0);

      // AC1: đặt giá → slot trả về có giá, và xuất hiện trong danh sách slot trống.
      const res = await admin('PUT', `/slots/${fx.slots[2]}/rent-price`, {
        payload: { monthlyRentPrice: '1500000' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: fx.slots[2], monthlyRentPrice: '1500000.0000' });
      expect(await available()).toEqual([
        expect.objectContaining({ slotId: fx.slots[2], monthlyRentPrice: '1500000.0000' }),
      ]);

      // AC2: giá âm. AC3: không phải Super Admin.
      expect(
        (
          await admin('PUT', `/slots/${fx.slots[2]}/rent-price`, {
            payload: { monthlyRentPrice: '-5' },
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await brandA('PUT', `/slots/${fx.slots[2]}/rent-price`, {
            payload: { monthlyRentPrice: '1' },
          })
        ).statusCode,
      ).toBe(403);

      // null đóng slot khỏi danh sách cho thuê.
      await admin('PUT', `/slots/${fx.slots[2]}/rent-price`, {
        payload: { monthlyRentPrice: null },
      });
      expect(await available()).toHaveLength(0);
    } finally {
      await raw.query(`UPDATE machine_slots SET monthly_rent_price = NULL WHERE id = $1`, [
        fx.slots[2],
      ]);
      await raw.query(`UPDATE slot_rentals SET status = 'ACTIVE' WHERE id = $1`, [fx.rentals[2]]);
    }
  });

  it('Brand Admin xem được hóa đơn của mình kèm nhãn stage (FR-SLT-41)', async () => {
    const res = await brandA('GET', `/slot-rentals?machineId=${fx.machineId}&stage=ACTIVE`);
    expect(res.statusCode).toBe(200);
    const items = res.json<{ items: Array<{ brandId: string; stage: string }> }>().items;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((r) => r.brandId === fx.brandA && r.stage === 'ACTIVE')).toBe(true);
  });

  it('không còn đường tạo hóa đơn tay hay kích hoạt tay (FR-SLT-01 bãi bỏ, ADR-0006)', async () => {
    expect((await admin('POST', '/slot-rentals', { payload: {} })).statusCode).toBe(404);
    expect((await admin('POST', `/slot-rentals/${fx.rentals[0]}/activate`)).statusCode).toBe(404);
  });
});
