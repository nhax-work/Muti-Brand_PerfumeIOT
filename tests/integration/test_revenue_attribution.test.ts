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
import { asUser, createTestApp, login } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import { kioskFlow, useTestSigningKey } from './helpers/kiosk-flow.js';
import {
  cleanupIsolationFixture,
  releaseOpenOrders,
  seedIsolationFixture,
  TEST_PASSWORD,
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

/**
 * Biên quanh mốc thanh lý (lộ trình tuần 8): trạng thái cuối cùng trước thanh lý (GRACE) vẫn là của
 * thương hiệu; đơn được chụp chủ doanh thu LÚC TẠO, nên đơn tạo khi còn GRACE mà trả tiền sau khi hóa
 * đơn đã LIQUIDATED vẫn là BRAND; Brand Admin không thấy đơn PLATFORM dù mang `brand_id` của mình.
 */
describe('revenue_owner — biên quanh mốc thanh lý', () => {
  const rentalId = () => fx.rentals[1]!;

  async function setRentalStatus(status: string): Promise<void> {
    await client.query(`UPDATE slot_rentals SET status = $2 WHERE id = $1`, [rentalId(), status]);
  }

  afterAll(async () => {
    await releaseOpenOrders(client, fx.machineId);
    await setRentalStatus('ACTIVE');
  });

  it('test_FR_REV_02_expiring_and_grace_still_sell_as_brand — EXPIRING, GRACE vẫn quy kết BRAND', async () => {
    for (const status of ['EXPIRING', 'GRACE']) {
      await setRentalStatus(status);
      const order = await flow.createOrder(1);
      expect((await ownerOf(order.id)).revenue_owner, status).toBe('BRAND');
      await releaseOpenOrders(client, fx.machineId);
    }
    await setRentalStatus('ACTIVE');
  });

  it('test_FR_REV_02_order_created_in_grace_paid_after_liquidation_stays_brand — chụp lúc tạo, không lúc trả tiền', async () => {
    await setRentalStatus('GRACE');
    const order = await flow.createOrder(1);
    expect((await ownerOf(order.id)).revenue_owner).toBe('BRAND');

    // Hóa đơn sang LIQUIDATED trong lúc khách đang quét QR; webhook về sau mốc.
    await setRentalStatus('LIQUIDATED');
    await flow.pay(order);
    const paid = await client.query<{ status: string; revenue_owner: string }>(
      `SELECT status, revenue_owner FROM orders WHERE id = $1`,
      [order.id],
    );
    expect(paid.rows[0]!.revenue_owner).toBe('BRAND');
    expect(paid.rows[0]!.status).not.toBe('PENDING_PAYMENT');

    // Đơn kế tiếp, tạo sau mốc, là của nền tảng.
    await releaseOpenOrders(client, fx.machineId);
    const after = await flow.createOrder(1);
    expect((await ownerOf(after.id)).revenue_owner).toBe('PLATFORM');

    // Brand Admin thấy đơn BRAND của mình nhưng KHÔNG thấy đơn PLATFORM cùng brand_id (FR-EXP-20).
    const brandA = asUser(app, (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken);
    const list = await brandA('GET', '/orders?pageSize=100');
    expect(list.statusCode, list.body).toBe(200);
    const ids = list.json<{ items: { id: string }[] }>().items.map((o) => o.id);
    expect(ids).toContain(order.id);
    expect(ids).not.toContain(after.id);

    await releaseOpenOrders(client, fx.machineId);
    await setRentalStatus('ACTIVE');
  });

  it('test_FR_REV_02_closed_rental_does_not_sell — hóa đơn đã CLOSED thì không tạo đơn, không đoán chủ doanh thu', async () => {
    await setRentalStatus('CLOSED');
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/kiosk/orders',
        headers: { 'idempotency-key': `rev-closed-${fx.runId}` },
        payload: { machineSerial: fx.machineSerial, slotId: fx.slots[1] },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: 'SLOT_UNAVAILABLE' });
    } finally {
      await setRentalStatus('ACTIVE');
    }
  });
});
