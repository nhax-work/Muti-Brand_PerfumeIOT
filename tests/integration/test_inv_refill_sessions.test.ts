/**
 * Phiếu nạp trên PostgreSQL thật (FR-INV-29 ÷ 32, 35; ADR-0006, ADR-0015, ADR-0017):
 *   - mở phiếu: máy suy từ slot, chặn máy bận, chặn slot chưa có hóa đơn đã thanh toán, một phiếu mở
 *     mỗi slot (cả khi hai người bấm cùng lúc);
 *   - phiếu mở thì cả máy dừng nhận đơn, đóng phiếu thì nhận lại;
 *   - đóng phiếu: chai phải trong kho, đúng chủ, đúng sản phẩm, chưa hết hạn, lô đã duyệt giấy tờ;
 *     chai cũ rời slot, chai mới INSTALLED, tất cả trong một transaction.
 */

import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestApp, login } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import { kioskFlow } from './helpers/kiosk-flow.js';
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
let flow: ReturnType<typeof kioskFlow>;
let inventoryStaff: PlatformStaff;
let brandA: ReturnType<typeof asUser>;
let brandB: ReturnType<typeof asUser>;
let superAdmin: ReturnType<typeof asUser>;
let staff: ReturnType<typeof asUser>;
/** Lô của A cho sản phẩm 0 (fixture) — chai dự phòng đăng ký vào đây. */
let batchA: string;

interface Session {
  id: string;
  machineId: string;
  slotId: string;
  brandId: string;
  status: string;
  oldBottleId: string | null;
  newBottleId: string | null;
  performedBy: string;
  completedAt: string | null;
}

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  inventoryStaff = await seedPlatformStaff(client, fx, 'INVENTORY_STAFF', ['inventory.manage']);
  app = await createTestApp();
  flow = kioskFlow(app, client, fx);
  brandA = asUser(app, (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken);
  brandB = asUser(app, (await login(app, fx.brandAdminBEmail, TEST_PASSWORD)).accessToken);
  superAdmin = asUser(app, (await login(app, fx.superAdminEmail, TEST_PASSWORD)).accessToken);
  staff = asUser(app, (await login(app, inventoryStaff.email, TEST_PASSWORD)).accessToken);
  const batch = await client.query<{ id: string }>(
    `SELECT id FROM inventory_batches WHERE brand_id = $1 AND fragrance_product_id = $2`,
    [fx.brandA, fx.products[0]],
  );
  batchA = batch.rows[0]!.id;
}, 60_000);

afterEach(async () => {
  await releaseOpenOrders(client, fx.machineId);
  // Phiếu còn mở của test trước không được chặn máy cho test sau.
  await client.query(
    `UPDATE refill_sessions SET status = 'CANCELLED', completed_at = now()
      WHERE machine_id = $1 AND status = 'STARTED'`,
    [fx.machineId],
  );
});

afterAll(async () => {
  await flow.cleanup();
  await cleanupIsolationFixture(client, fx);
  await inventoryStaff.cleanup();
  await app.close();
  await client.end();
});

function open(slotIndex: number, as = staff) {
  return as('POST', '/refill-sessions', {
    payload: { slotId: fx.slots[slotIndex], beforeWeightG: 80 },
  });
}

async function openOk(slotIndex: number): Promise<Session> {
  const res = await open(slotIndex);
  expect(res.statusCode, res.body).toBe(201);
  return res.json<Session>();
}

function close(sessionId: string, newBottleId: string, checklistCompleted: boolean = true) {
  return staff('POST', `/refill-sessions/${sessionId}/close`, {
    payload: { newBottleId, checklistCompleted, afterWeightG: 112.5, notes: 'Thay chai' },
  });
}

/** Chai mới trong kho của A, lô `batchId` (mặc định lô sản phẩm 0). */
async function spareBottle(batchId = batchA): Promise<string> {
  const res = await staff('POST', '/bottles', {
    payload: { batchId, identifier: `SPARE-${randomUUID().slice(0, 8)}`, initialVolumeMl: 50 },
  });
  expect(res.statusCode, res.body).toBe(201);
  expect(res.json()).toMatchObject({ status: 'IN_STOCK', brandId: fx.brandA, owner: 'BRAND' });
  return res.json<{ id: string }>().id;
}

/** Duyệt giấy tờ chính hãng của lô qua đúng API (FR-INV-33, 34). */
async function approveBatch(batchId: string): Promise<void> {
  const submitted = await brandA('POST', `/inventory-batches/${batchId}/authenticity-documents`, {
    payload: { documentUrl: 'https://docs.test/lo.pdf' },
  });
  expect(submitted.statusCode, submitted.body).toBe(200);
  const approved = await superAdmin('POST', `/inventory-batches/${batchId}/approve-authenticity`);
  expect(approved.statusCode, approved.body).toBe(200);
}

function kioskOrder(slotIndex: number) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/kiosk/orders',
    headers: { 'idempotency-key': randomUUID() },
    payload: { machineSerial: fx.machineSerial, slotId: fx.slots[slotIndex] },
  });
}

describe('Mở phiếu nạp (FR-INV-29, 30, 32)', () => {
  it('test_FR_INV_32_reject_open_refill_when_machine_busy — máy còn đơn chờ thanh toán thì MACHINE_BUSY', async () => {
    const order = await flow.createOrder(1);
    expect(order.status).toBe('PENDING_PAYMENT');
    const res = await open(2);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'MACHINE_BUSY' });

    // AC3: máy rảnh thì mở được.
    await releaseOpenOrders(client, fx.machineId);
    await openOk(2);
  });

  it('test_FR_INV_29_open_refill_session — máy suy từ slot, ghi người mở, chai cũ, chưa có chai mới', async () => {
    const session = await openOk(0);
    expect(session).toMatchObject({
      machineId: fx.machineId,
      slotId: fx.slots[0],
      brandId: fx.brandA,
      status: 'STARTED',
      performedBy: inventoryStaff.userId,
      oldBottleId: fx.bottles[0],
      newBottleId: null,
    });

    const again = await open(0);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ code: 'REFILL_SESSION_OPEN' });
  });

  it('test_FR_INV_29_forbid_brand_admin — Brand Admin không mở phiếu nạp (FR-RFQ-11)', async () => {
    const res = await open(0, brandA);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'FORBIDDEN_SCOPE' });
  });

  it('test_FR_INV_29_concurrent_open — hai người mở cùng một slot cùng lúc chỉ một phiếu', async () => {
    const results = await Promise.all([open(3), open(3)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    const rows = await client.query(
      `SELECT 1 FROM refill_sessions WHERE slot_id = $1 AND status = 'STARTED'`,
      [fx.slots[3]],
    );
    expect(rows.rowCount).toBe(1);
  });

  it('test_FR_INV_29_require_paid_rental — slot không có hóa đơn đã thanh toán thì không nhận chai (ADR-0006)', async () => {
    // Slot 5: hóa đơn đã thanh lý.
    const liquidated = await open(4);
    expect(liquidated.statusCode).toBe(409);
    expect(liquidated.json()).toMatchObject({ code: 'RENTAL_NOT_ACTIVE' });

    // Slot 4 giả làm hóa đơn DRAFT đang giữ chỗ (chưa thanh toán), rồi đã thanh toán chờ nạp hàng.
    const rentalId = fx.rentals[3];
    await client.query(
      `UPDATE slot_rentals SET status = 'DRAFT', paid_at = NULL, invoice_number = NULL WHERE id = $1`,
      [rentalId],
    );
    try {
      const unpaid = await open(3);
      expect(unpaid.statusCode).toBe(409);
      expect(unpaid.json()).toMatchObject({ code: 'RENTAL_NOT_ACTIVE' });

      // chk_rental_invoice_on_payment: đã thanh toán thì phải có số hóa đơn.
      await client.query(
        `UPDATE slot_rentals SET paid_at = now(), invoice_number = 'INV-' || left(id::text, 8)
          WHERE id = $1`,
        [rentalId],
      );
      await openOk(3);
    } finally {
      await client.query(
        `UPDATE refill_sessions SET status = 'CANCELLED', completed_at = now()
          WHERE slot_id = $1 AND status = 'STARTED'`,
        [fx.slots[3]],
      );
      await client.query(
        `UPDATE slot_rentals SET status = 'ACTIVE', paid_at = NULL, invoice_number = NULL
          WHERE id = $1`,
        [rentalId],
      );
    }
  });

  it('test_FR_INV_30_block_orders_during_refill — phiếu mở thì kiosk không tạo được đơn trên cả máy', async () => {
    await openOk(0);
    // Slot khác trên cùng máy cũng bị chặn: cả máy dừng nhận đơn (ADR-0015).
    const res = await kioskOrder(2);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'MACHINE_IN_MAINTENANCE' });
  });

  it('test_FR_INV_13_list_scoped — Brand B không thấy phiếu nạp trên slot của A', async () => {
    const session = await openOk(0);
    const forA = (await brandA('GET', '/refill-sessions?pageSize=200')).json<{ items: Session[] }>()
      .items;
    expect(forA.some((s) => s.id === session.id)).toBe(true);
    const forB = (await brandB('GET', '/refill-sessions?pageSize=200')).json<{ items: Session[] }>()
      .items;
    expect(forB.some((s) => s.brandId === fx.brandA)).toBe(false);
  });
});

describe('Đóng phiếu nạp (FR-INV-31, 35; FR-INV-06, 07, 08)', () => {
  it('test_FR_INV_35_reject_install_unapproved_batch_bottle — chai của lô chưa duyệt bị chặn, phiếu vẫn mở', async () => {
    const bottle = await spareBottle();
    const session = await openOk(0);
    const res = await close(session.id, bottle);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'BATCH_NOT_APPROVED' });
    const row = await client.query(`SELECT status FROM refill_sessions WHERE id = $1`, [
      session.id,
    ]);
    expect(row.rows[0]).toEqual({ status: 'STARTED' });
  });

  it('test_FR_INV_31_checklist_required — checklist chưa xong thì không đóng được (FR-INV-14)', async () => {
    const bottle = await spareBottle();
    const session = await openOk(0);
    const res = await close(session.id, bottle, false);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('test_FR_INV_31_reject_wrong_bottle — chai của thương hiệu khác, chai đang lắp, chai hết hạn, chai khác sản phẩm', async () => {
    const session = await openOk(0);

    const otherBrand = await close(session.id, fx.bottles[2]!);
    expect(otherBrand.statusCode).toBe(403);
    expect(otherBrand.json()).toMatchObject({ code: 'BOTTLE_NOT_OWNED' });

    const installed = await close(session.id, fx.bottles[1]!);
    expect(installed.statusCode).toBe(409);
    expect(installed.json()).toMatchObject({ code: 'BOTTLE_NOT_IN_STOCK' });

    const expired = await spareBottle();
    await client.query(`UPDATE bottles SET expires_at = now() - interval '1 day' WHERE id = $1`, [
      expired,
    ]);
    const expiredRes = await close(session.id, expired);
    expect(expiredRes.statusCode).toBe(409);
    expect(expiredRes.json()).toMatchObject({ code: 'BOTTLE_EXPIRED' });

    // Lô sản phẩm 1 của A, đã duyệt — chai đúng chủ nhưng khác sản phẩm cấu hình cho slot 1.
    const otherProductBatch = randomUUID();
    await client.query(
      `INSERT INTO inventory_batches (id, brand_id, fragrance_product_id, batch_number, received_at,
                                      quantity_received, created_by)
       VALUES ($1, $2, $3, $4, now(), 5, $5)`,
      [otherProductBatch, fx.brandA, fx.products[1], `LOT-${fx.runId}-P1`, fx.superAdminId],
    );
    await approveBatch(otherProductBatch);
    const mismatch = await close(session.id, await spareBottle(otherProductBatch));
    expect(mismatch.statusCode).toBe(409);
    expect(mismatch.json()).toMatchObject({ code: 'PRODUCT_MISMATCH' });
  });

  it('test_FR_INV_31_close_refill_session — đóng phiếu: chai mới lắp, chai cũ về kho, máy nhận đơn lại', async () => {
    await approveBatch(batchA);
    const bottle = await spareBottle();
    const session = await openOk(0);

    const res = await close(session.id, bottle);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json<Session>()).toMatchObject({
      status: 'COMPLETED',
      newBottleId: bottle,
      oldBottleId: fx.bottles[0],
    });
    expect(res.json<Session>().completedAt).not.toBeNull();

    const slot = await client.query(`SELECT active_bottle_id FROM machine_slots WHERE id = $1`, [
      fx.slots[0],
    ]);
    expect(slot.rows[0]).toEqual({ active_bottle_id: bottle });
    const bottles = await client.query<{ id: string; status: string; removed: boolean }>(
      `SELECT id, status, removed_at IS NOT NULL AS removed FROM bottles WHERE id = ANY($1::uuid[])`,
      [[bottle, fx.bottles[0]]],
    );
    expect(Object.fromEntries(bottles.rows.map((b) => [b.id, [b.status, b.removed]]))).toEqual({
      [bottle]: ['INSTALLED', false],
      [fx.bottles[0]!]: ['IN_STOCK', true],
    });
    const audit = await client.query(
      `SELECT 1 FROM audit_logs WHERE action = 'inv.refill.closed' AND target_id = $1`,
      [session.id],
    );
    expect(audit.rowCount).toBe(1);

    const again = await close(session.id, bottle);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ code: 'REFILL_SESSION_NOT_OPEN' });

    // AC5: phiếu đóng thì máy nhận đơn lại.
    const order = await kioskOrder(0);
    expect(order.statusCode, order.body).toBe(201);
  });

  it('test_FR_INV_02_register_bottle — mã định danh trùng trong thương hiệu bị từ chối', async () => {
    const identifier = `DUP-${fx.runId}`;
    const first = await staff('POST', '/bottles', {
      payload: { batchId: batchA, identifier, initialVolumeMl: 50 },
    });
    expect(first.statusCode, first.body).toBe(201);
    const dup = await staff('POST', '/bottles', {
      payload: { batchId: batchA, identifier, initialVolumeMl: 50 },
    });
    expect(dup.statusCode).toBe(400);
    expect(dup.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
