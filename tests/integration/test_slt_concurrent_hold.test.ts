/**
 * Giữ chỗ slot đồng thời qua API (nhóm test trọng yếu, docs/LO_TRINH_AI_HARNESS_13_TUAN.md mục "Chín
 * chỗ test trọng yếu"): hai thương hiệu checkout cùng slot thì chỉ một hóa đơn DRAFT được tạo, và một
 * phiên nhiều slot là tất cả hoặc không gì cả (FR-SLT-35, ADR-0006, ADR-0008).
 *
 * test_slot_constraint.test.ts đã chứng minh `excl_slot_rental_overlap` ở tầng CSDL bằng INSERT thẳng;
 * file này đi qua `POST /rental-checkouts` thật để chứng minh service dựa vào chính ràng buộc đó và
 * không để sót hóa đơn của các slot còn lại khi một slot bị chiếm.
 */

import { randomUUID } from 'node:crypto';
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
let client: pg.Client;
let fx: IsolationFixture;
let brandA: ReturnType<typeof asUser>;
let brandB: ReturnType<typeof asUser>;
let packageId: string;
let storagePlanId: string;
/** Slot trống có giá niêm yết, số 6 trở đi — không đụng 5 slot của fixture. */
let vacant: string[];

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  app = await createTestApp();
  brandA = asUser(app, (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken);
  brandB = asUser(app, (await login(app, fx.brandAdminBEmail, TEST_PASSWORD)).accessToken);

  packageId = randomUUID();
  storagePlanId = randomUUID();
  await client.query(
    `INSERT INTO rental_packages (id, name, duration_months, discount_percent, is_active)
     VALUES ($1, $2, 3, 0.00, true)`,
    [packageId, `Gói 3 tháng ${fx.runId}`],
  );
  await client.query(
    `INSERT INTO storage_plans (id, name, monthly_price, coverage_percent, coverage_cap, is_active)
     VALUES ($1, $2, 100000.0000, 30.00, 3000000.0000, true)`,
    [storagePlanId, `Bảo quản chuẩn ${fx.runId}`],
  );
  vacant = Array.from({ length: 8 }, () => randomUUID());
  for (const [i, slotId] of vacant.entries()) {
    await client.query(
      `INSERT INTO machine_slots (id, machine_id, slot_number, status, monthly_rent_price,
                                  calibrated_dosage_ml, low_stock_threshold_ml)
       VALUES ($1, $2, $3, 'AVAILABLE', 1000000.0000, 0.1200, 5.0000)`,
      [slotId, fx.machineId, 6 + i],
    );
  }
}, 60_000);

afterAll(async () => {
  const checkouts = await client.query<{ id: string }>(
    `SELECT id FROM rental_checkouts WHERE brand_id = ANY($1::uuid[])`,
    [[fx.brandA, fx.brandB]],
  );
  const ids = checkouts.rows.map((r) => r.id);
  if (ids.length > 0) {
    // Bất biến phiên ↔ hóa đơn kiểm lúc COMMIT (ADR-0008) — xóa chung một transaction.
    await client.query('BEGIN');
    await client.query(`DELETE FROM slot_rentals WHERE checkout_id = ANY($1::uuid[])`, [ids]);
    await client.query(`DELETE FROM rental_checkouts WHERE id = ANY($1::uuid[])`, [ids]);
    await client.query('COMMIT');
  }
  await client.query(`DELETE FROM machine_slots WHERE id = ANY($1::uuid[])`, [vacant]);
  await client.query(`DELETE FROM rental_packages WHERE id = $1`, [packageId]);
  await client.query(`DELETE FROM storage_plans WHERE id = $1`, [storagePlanId]);
  await cleanupIsolationFixture(client, fx);
  await app.close();
  await client.end();
});

function checkout(as: ReturnType<typeof asUser>, slotIds: readonly string[]) {
  return as('POST', '/rental-checkouts', {
    payload: {
      items: slotIds.map((slotId) => ({ slotId, rentalPackageId: packageId, storagePlanId })),
    },
  });
}

/** Hóa đơn còn chiếm slot (mọi trạng thái trừ CANCELLED), kèm thương hiệu sở hữu. */
async function holdsOn(slotIds: readonly string[]) {
  const res = await client.query<{ slot_id: string; brand_id: string }>(
    `SELECT slot_id, brand_id FROM slot_rentals
      WHERE slot_id = ANY($1::uuid[]) AND status::text <> 'CANCELLED'`,
    [slotIds],
  );
  return res.rows;
}

describe('Giữ chỗ slot đồng thời (FR-SLT-35)', () => {
  it('test_FR_SLT_35_concurrent_checkout_same_slot_single_draft', async () => {
    const slot = vacant[0]!;

    const [resA, resB] = await Promise.all([checkout(brandA, [slot]), checkout(brandB, [slot])]);
    const codes = [resA.statusCode, resB.statusCode].sort();

    // Đúng một bên giữ được slot, bên còn lại nhận SLOT_OCCUPIED — không có 500.
    expect(codes, `${resA.body} | ${resB.body}`).toEqual([201, 409]);
    const loser = resA.statusCode === 409 ? resA : resB;
    expect(loser.json()).toMatchObject({ code: 'SLOT_OCCUPIED' });

    const holds = await holdsOn([slot]);
    expect(holds).toHaveLength(1);
    expect(holds[0]!.brand_id).toBe(resA.statusCode === 201 ? fx.brandA : fx.brandB);
  });

  it('test_FR_SLT_35_cart_with_held_slot_rejected_entirely', async () => {
    const [free, held] = [vacant[1]!, vacant[2]!];
    const first = await checkout(brandB, [held]);
    expect(first.statusCode, first.body).toBe(201);

    // Giỏ của A có một slot trống và một slot B đang giữ → cả phiên bị từ chối.
    const cart = await checkout(brandA, [free, held]);
    expect(cart.statusCode, cart.body).toBe(409);
    expect(cart.json()).toMatchObject({ code: 'SLOT_OCCUPIED' });

    // Không sót hóa đơn nào của A cho slot còn trống — phiên là tất cả hoặc không gì cả (ADR-0008).
    expect(await holdsOn([free])).toEqual([]);
    const orphanCheckouts = await client.query(
      `SELECT 1 FROM rental_checkouts c
        WHERE c.brand_id = $1
          AND NOT EXISTS (SELECT 1 FROM slot_rentals r WHERE r.checkout_id = c.id)`,
      [fx.brandA],
    );
    expect(orphanCheckouts.rowCount).toBe(0);
  });

  it('test_FR_SLT_35_overlapping_carts_concurrent_only_one_succeeds', async () => {
    const [onlyA, onlyB, shared] = [vacant[3]!, vacant[4]!, vacant[5]!];

    const [resA, resB] = await Promise.all([
      checkout(brandA, [onlyA, shared]),
      checkout(brandB, [onlyB, shared]),
    ]);
    const codes = [resA.statusCode, resB.statusCode].sort();
    expect(codes, `${resA.body} | ${resB.body}`).toEqual([201, 409]);

    const winnerBrand = resA.statusCode === 201 ? fx.brandA : fx.brandB;
    const loserOnly = resA.statusCode === 201 ? onlyB : onlyA;

    // Giỏ thắng giữ đủ cả hai slot; giỏ thua không để lại hóa đơn nào, kể cả slot riêng của nó.
    const holds = await holdsOn([onlyA, onlyB, shared]);
    expect(holds).toHaveLength(2);
    expect(holds.every((h) => h.brand_id === winnerBrand)).toBe(true);
    expect(await holdsOn([loserOnly])).toEqual([]);
  });
  it('test_FR_SLT_35_reverse_order_carts_no_deadlock', async () => {
    const [x, y] = [vacant[6]!, vacant[7]!];

    // Cùng hai slot nhưng ngược thứ tự: không được kẹt nhau (deadlock) thành lỗi 500.
    const [resA, resB] = await Promise.all([checkout(brandA, [x, y]), checkout(brandB, [y, x])]);
    const codes = [resA.statusCode, resB.statusCode].sort();
    expect(codes, `${resA.body} | ${resB.body}`).toEqual([201, 409]);

    const holds = await holdsOn([x, y]);
    expect(holds).toHaveLength(2);
    expect(new Set(holds.map((h) => h.brand_id)).size).toBe(1);
  });
});
