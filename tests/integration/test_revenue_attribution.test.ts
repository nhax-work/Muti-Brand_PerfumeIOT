/**
 * NHÓM TEST TRỌNG YẾU — quy kết `revenue_owner` (spec/testing.md, ADR-0009, ADR-0010).
 *
 * Đi qua cơ chế thật, không mock: đơn tạo bằng `POST /kiosk/orders` (revenueOwnerFor trong
 * OrdService), trả tiền bằng webhook có chữ ký, bất biến do trigger `trg_orders_snapshot_immutable`
 * của CSDL chặn. Hóa đơn được đưa sang LIQUIDATED bằng SQL vì code thanh lý (FR-EXP-14..16) chưa có —
 * thứ được chứng minh ở đây là cách ĐƠN quy kết theo trạng thái hóa đơn, không phải luồng thanh lý.
 *
 * Người review: đối chiếu từng assert với FR-REV-01..03 ở spec/modules/REV.md và dòng `revenue_owner`
 * ở bảng "Các chỗ test trọng yếu" của lộ trình.
 */

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import { kioskFlow, useTestSigningKey } from './helpers/kiosk-flow.js';
import {
  cleanupIsolationFixture,
  releaseOpenOrders,
  seedIsolationFixture,
  type IsolationFixture,
} from './helpers/seed-isolation.js';

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let flow: ReturnType<typeof kioskFlow>;

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  useTestSigningKey();
  app = await createTestApp();
  flow = kioskFlow(app, client, fx);
}, 60_000);

beforeEach(async () => {
  // Mỗi máy một đơn chờ thanh toán (FR-ORD-35) — test trước để lại đơn mở thì đơn sau bị MACHINE_BUSY.
  await releaseOpenOrders(client, fx.machineId);
});

afterAll(async () => {
  await flow.cleanup();
  await cleanupIsolationFixture(client, fx);
  await app.close();
  await client.end();
});

interface OwnerRow {
  readonly revenue_owner: string | null;
  readonly brand_id: string;
  readonly slot_rental_id: string;
}

async function ownerOf(orderId: string): Promise<OwnerRow> {
  const res = await client.query<OwnerRow>(
    `SELECT revenue_owner, brand_id, slot_rental_id FROM orders WHERE id = $1`,
    [orderId],
  );
  return res.rows[0]!;
}

describe('revenue_owner — nhóm test trọng yếu', () => {
  it('test_FR_REV_01_revenue_owner_snapshot — đơn tạo qua kiosk mang BRAND ngay lúc tạo, không NULL', async () => {
    const order = await flow.createOrder(0);
    expect(await ownerOf(order.id)).toEqual({
      revenue_owner: 'BRAND',
      brand_id: fx.brandA,
      slot_rental_id: fx.rentals[0],
    });

    // Trả tiền rồi xịt xong cũng không đổi giá trị đã chụp.
    await flow.pay(order);
    expect((await ownerOf(order.id)).revenue_owner).toBe('BRAND');
  });

  it('test_FR_REV_01_db_rejects_missing_revenue_owner — CSDL không cho đơn thiếu chủ doanh thu', async () => {
    await expect(
      client.query(
        `INSERT INTO orders (brand_id, slot_rental_id, revenue_owner, machine_id, slot_id,
                             fragrance_product_id, product_name_snapshot, amount, currency,
                             status, payment_reference, idempotency_key, expires_at)
         SELECT o.brand_id, o.slot_rental_id, NULL, o.machine_id, o.slot_id,
                o.fragrance_product_id, o.product_name_snapshot, o.amount, o.currency,
                'EXPIRED', 'REV01-NULL-OWNER', 'rev01-null-owner', now()
           FROM orders o WHERE o.id = $1`,
        [fx.orders[0]!.id],
      ),
    ).rejects.toMatchObject({ code: '23502', column: 'revenue_owner' });
  });

  it('test_FR_REV_02_liquidation_keeps_old_orders_brand — đơn cũ giữ BRAND, đơn sau thanh lý thuộc PLATFORM', async () => {
    const rentalId = fx.rentals[1]!;
    const before = await flow.createOrder(1);
    await flow.pay(before);
    expect((await ownerOf(before.id)).revenue_owner).toBe('BRAND');

    await client.query(`UPDATE slot_rentals SET status = 'LIQUIDATED' WHERE id = $1`, [rentalId]);
    try {
      const after = await flow.createOrder(1);
      // Hàng đã thuộc nền tảng: doanh thu PLATFORM, nhưng brand_id và hóa đơn vẫn là của thương
      // hiệu cũ (schema.sql — orders.brand_id giữ nguyên để truy vết).
      expect(await ownerOf(after.id)).toEqual({
        revenue_owner: 'PLATFORM',
        brand_id: fx.brandA,
        slot_rental_id: rentalId,
      });
      // Đơn tạo trước mốc thanh lý không bị quy kết lại.
      expect((await ownerOf(before.id)).revenue_owner).toBe('BRAND');
    } finally {
      await releaseOpenOrders(client, fx.machineId);
      await client.query(`UPDATE slot_rentals SET status = 'ACTIVE' WHERE id = $1`, [rentalId]);
    }
  });

  it('test_FR_REV_02_liquidated_rental_sells_as_platform — slot 5 đã thanh lý trong fixture', async () => {
    const order = await flow.createOrder(4);
    expect((await ownerOf(order.id)).revenue_owner).toBe('PLATFORM');
  });

  it('test_FR_REV_03_update_revenue_owner_rejected_by_trigger — chk_order_snapshot_immutable', async () => {
    const order = await flow.createOrder(0);
    await flow.pay(order);

    // Đúng ca của lộ trình: UPDATE orders SET revenue_owner = … bị CSDL từ chối.
    await expect(
      client.query(`UPDATE orders SET revenue_owner = 'PLATFORM' WHERE id = $1`, [order.id]),
    ).rejects.toMatchObject({ constraint: 'chk_order_snapshot_immutable' });

    // Cũng không lách được bằng cách đổi brand_id hay hóa đơn mà revenue_owner suy ra từ đó.
    await expect(
      client.query(`UPDATE orders SET brand_id = $2 WHERE id = $1`, [order.id, fx.brandB]),
    ).rejects.toMatchObject({ constraint: 'chk_order_snapshot_immutable' });
    await expect(
      client.query(`UPDATE orders SET slot_rental_id = $2 WHERE id = $1`, [
        order.id,
        fx.rentals[4],
      ]),
    ).rejects.toMatchObject({ constraint: 'chk_order_snapshot_immutable' });

    expect(await ownerOf(order.id)).toEqual({
      revenue_owner: 'BRAND',
      brand_id: fx.brandA,
      slot_rental_id: fx.rentals[0],
    });
  });

  it('test_FR_REV_03_seeded_orders_never_change_owner — đơn BRAND của slot đã thanh lý vẫn là BRAND', async () => {
    // Fixture: slot 5 có một đơn BRAND trước mốc thanh lý và một đơn PLATFORM sau mốc.
    const onLiquidated = fx.orders.filter((o) => o.slotId === fx.slots[4]);
    for (const seeded of onLiquidated) {
      expect((await ownerOf(seeded.id)).revenue_owner).toBe(seeded.revenueOwner);
    }
    expect(onLiquidated.map((o) => o.revenueOwner).sort()).toEqual(['BRAND', 'PLATFORM']);
  });
});
