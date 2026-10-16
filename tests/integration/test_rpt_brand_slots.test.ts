/**
 * Integration test cho báo cáo theo slot của thương hiệu — `GET /reports/brand-slots` (FR-RPT-08,
 * FR-RPT-10), nguồn số liệu của màn "Slot của tôi" trên web quản trị.
 *
 * Fixture (helpers/seed-isolation.ts): slot 1, 2 của A và 3, 4 của B đang ACTIVE, mỗi slot hai đơn
 * DISPENSED 35.000đ (20 và 5 ngày trước); slot 5 của A đã thanh lý — một đơn BRAND 40 ngày trước và
 * một đơn PLATFORM 5 ngày trước.
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

interface Row {
  slotRentalId: string;
  slotId: string;
  machineId: string;
  locationName: string;
  productName?: string;
  orderCount: number;
  revenue: string;
}

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let asA: ReturnType<typeof asUser>;
let asB: ReturnType<typeof asUser>;
let asAdmin: ReturnType<typeof asUser>;

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  app = await createTestApp();
  asA = asUser(app, (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken);
  asB = asUser(app, (await login(app, fx.brandAdminBEmail, TEST_PASSWORD)).accessToken);
  asAdmin = asUser(app, (await login(app, fx.superAdminEmail, TEST_PASSWORD)).accessToken);
}, 60_000);

afterAll(async () => {
  await cleanupIsolationFixture(client, fx);
  await app.close();
  await client.end();
});

async function report(as: ReturnType<typeof asUser>, query = ''): Promise<Row[]> {
  const res = await as('GET', `/reports/brand-slots${query}`);
  expect(res.statusCode, res.body).toBe(200);
  return res.json<Row[]>().filter((r) => r.machineId === fx.machineId);
}

const DAY = 24 * 60 * 60 * 1000;

describe('GET /reports/brand-slots', () => {
  it('test_FR_RPT_08_brand_slot_revenue — số đơn và doanh thu từng slot của thương hiệu', async () => {
    const rows = await report(asA);
    const bySlot = new Map(rows.map((r) => [r.slotId, r]));

    expect(bySlot.get(fx.slots[0]!)).toMatchObject({
      slotRentalId: fx.rentals[0],
      orderCount: 2,
      revenue: '70000.0000',
      locationName: fx.locationName,
      productName: expect.stringContaining('A Matinale'),
    });
    expect(bySlot.get(fx.slots[1]!)).toMatchObject({ orderCount: 2, revenue: '70000.0000' });
  });

  it('test_FR_RPT_10_brand_report_scoped_to_own_rentals — không lộ slot hay doanh thu của B', async () => {
    const rowsA = await report(asA);
    const rowsB = await report(asB);

    expect(rowsA.map((r) => r.slotId)).not.toContain(fx.slots[2]);
    expect(rowsA.map((r) => r.slotId)).not.toContain(fx.slots[3]);
    expect(rowsB.map((r) => r.slotId).sort()).toEqual([fx.slots[2], fx.slots[3]].sort());
    for (const name of fx.brandBProductNames) {
      expect(JSON.stringify(rowsA)).not.toContain(name);
    }
  });

  it('test_FR_RPT_10_liquidated_platform_orders_excluded — đơn sau thanh lý thuộc nền tảng', async () => {
    const slot5 = (await report(asA)).find((r) => r.slotId === fx.slots[4]);
    // Chỉ đơn BRAND trước thanh lý; đơn PLATFORM sau thanh lý không cộng (FR-REV-06, FR-EXP-20).
    expect(slot5).toMatchObject({ orderCount: 1, revenue: '35000.0000' });
  });

  it('test_FR_RPT_08_period_filter — đếm theo thời điểm trả tiền trong [from, to)', async () => {
    const from = new Date(Date.now() - 10 * DAY).toISOString();
    const rows = await report(asA, `?from=${encodeURIComponent(from)}`);
    const bySlot = new Map(rows.map((r) => [r.slotId, r]));

    expect(bySlot.get(fx.slots[0]!)).toMatchObject({ orderCount: 1, revenue: '35000.0000' });
    // Slot đã thanh lý không có đơn được tính trong kỳ → không xuất hiện.
    expect(bySlot.has(fx.slots[4]!)).toBe(false);

    const bad = await asA(
      'GET',
      `/reports/brand-slots?from=${encodeURIComponent(from)}&to=${encodeURIComponent(from)}`,
    );
    expect(bad.statusCode).toBe(400);
    expect(bad.json<{ code: string }>().code).toBe('VALIDATION_ERROR');
  });

  it('test_FR_RPT_08_failed_orders_not_counted — đơn FAILED/REFUNDED không phải doanh thu', async () => {
    const before = (await report(asA)).find((r) => r.slotId === fx.slots[0])!;
    const failed = fx.orders.find((o) => o.slotId === fx.slots[0])!;
    await client.query(`UPDATE orders SET status = 'REFUNDED' WHERE id = $1`, [failed.id]);
    try {
      const after = (await report(asA)).find((r) => r.slotId === fx.slots[0])!;
      expect(after.orderCount).toBe(before.orderCount - 1);
      expect(Number(after.revenue)).toBe(Number(before.revenue) - 35000);
    } finally {
      await client.query(`UPDATE orders SET status = 'DISPENSED' WHERE id = $1`, [failed.id]);
    }
  });

  it('Super Admin thấy slot của mọi thương hiệu (FR-BND-07)', async () => {
    const slots = (await report(asAdmin)).map((r) => r.slotId);
    for (const slot of fx.slots.slice(0, 4)) expect(slots).toContain(slot);
  });
});
