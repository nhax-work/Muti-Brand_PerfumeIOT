/**
 * Việc cần nạp (ADR-0026) trên PostgreSQL thật: máy chủ tính từng việc từ hóa đơn, yêu cầu bổ sung,
 * tồn kho và lô — lắp chai đầu tiên, theo yêu cầu bổ sung, sắp hết — kèm lý do chưa làm được và chai
 * gợi ý. Chai gợi ý phải lắp được thật: test đóng phiếu bằng đúng chai đó.
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
  seedPlatformStaff,
  TEST_PASSWORD,
  type IsolationFixture,
  type PlatformStaff,
} from './helpers/seed-isolation.js';

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let inventoryStaff: PlatformStaff;
let brandA: ReturnType<typeof asUser>;
let superAdmin: ReturnType<typeof asUser>;
let staff: ReturnType<typeof asUser>;
/** Lô của A cho sản phẩm 0 (fixture), chưa nộp giấy tờ. */
let batchA: string;
/** Slot 6 thêm vào máy fixture, hóa đơn DRAFT đã thanh toán — chờ lắp chai đầu tiên. */
const extraSlot = randomUUID();
const extraRental = randomUUID();

interface WorkItem {
  slotId: string;
  slotNumber: number;
  machineName: string;
  brandName: string;
  productName: string | null;
  kind: string;
  blocker: string | null;
  pendingShipment: boolean;
  estimatedRemainingSprays: number | null;
  refillRequestId: string | null;
  refillRequestStatus: string | null;
  openRefillSessionId: string | null;
  suggestedBottle: { id: string; identifier: string; expiresAt: string | null } | null;
  availableBottleCount: number;
}

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  inventoryStaff = await seedPlatformStaff(client, fx, 'INVENTORY_STAFF', ['inventory.manage']);
  app = await createTestApp();
  brandA = asUser(app, (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken);
  superAdmin = asUser(app, (await login(app, fx.superAdminEmail, TEST_PASSWORD)).accessToken);
  staff = asUser(app, (await login(app, inventoryStaff.email, TEST_PASSWORD)).accessToken);
  const batch = await client.query<{ id: string }>(
    `SELECT id FROM inventory_batches WHERE brand_id = $1 AND fragrance_product_id = $2`,
    [fx.brandA, fx.products[0]],
  );
  batchA = batch.rows[0]!.id;

  await client.query(
    `INSERT INTO machine_slots (id, machine_id, slot_number, calibrated_dosage_ml,
                                low_stock_threshold_ml, estimated_remaining_ml,
                                estimated_remaining_sprays, status)
     VALUES ($1, $2, 6, 0.1200, 5.0000, 0, 0, 'AVAILABLE')`,
    [extraSlot, fx.machineId],
  );
  await client.query(
    `INSERT INTO slot_rentals (id, slot_id, brand_id, status, starts_at, ends_at, paid_at,
                               invoice_number, currency, created_by)
     VALUES ($1, $2, $3, 'DRAFT', now(), now() + interval '6 months', now(), $4, 'VND', $5)`,
    [extraRental, extraSlot, fx.brandA, `INV-WL-${randomUUID().slice(0, 8)}`, fx.superAdminId],
  );
}, 60_000);

afterAll(async () => {
  await client.query(`DELETE FROM refill_sessions WHERE slot_id = $1`, [extraSlot]);
  await client.query(`DELETE FROM refill_requests WHERE slot_id = ANY($1::uuid[])`, [
    [...fx.slots, extraSlot],
  ]);
  await client.query(`UPDATE machine_slots SET active_bottle_id = NULL WHERE id = $1`, [extraSlot]);
  await client.query(`DELETE FROM storage_compensations WHERE slot_rental_id = $1`, [extraRental]);
  // audit_logs chỉ cho thêm (FR-AUD-09) và không có khóa ngoại tới hóa đơn — để lại như fixture.
  // Hóa đơn slot 6 không thuộc fx.slots nên hàm dọn fixture không xóa; slot 6 thì xóa theo máy.
  await client.query(`DELETE FROM slot_rentals WHERE id = $1`, [extraRental]);
  await cleanupIsolationFixture(client, fx);
  await inventoryStaff.cleanup();
  await app.close();
  await client.end();
});

/** Việc trên máy của fixture — CSDL test còn dữ liệu của file khác. */
async function worklist(): Promise<WorkItem[]> {
  const res = await staff('GET', '/refill-worklist');
  expect(res.statusCode, res.body).toBe(200);
  const slots = new Set([...fx.slots, extraSlot]);
  return res.json<{ items: WorkItem[] }>().items.filter((i) => slots.has(i.slotId));
}

async function itemFor(slotId: string): Promise<WorkItem | undefined> {
  return (await worklist()).find((i) => i.slotId === slotId);
}

async function spareBottle(identifier: string, expiresAt: string): Promise<string> {
  const res = await staff('POST', '/bottles', {
    payload: {
      batchId: batchA,
      identifier: `${identifier}-${fx.runId}`,
      initialVolumeMl: 50,
      expiresAt,
    },
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json<{ id: string }>().id;
}

describe('Việc cần nạp (ADR-0026)', () => {
  it('test_FR_INV_36_worklist_requires_inventory_manage — Brand Admin không xem được', async () => {
    const res = await brandA('GET', '/refill-worklist');
    expect(res.statusCode).toBe(403);
  });

  it('test_FR_INV_36_healthy_slots_not_listed — slot đang bán còn đầy không phải việc', async () => {
    const items = await worklist();
    expect(items.map((i) => i.slotId)).toEqual([extraSlot]);
  });

  it('test_FR_INV_36_first_install_waits_for_product — hóa đơn đã trả tiền, chưa gán sản phẩm thì bị chặn', async () => {
    const item = await itemFor(extraSlot);
    expect(item).toMatchObject({
      slotNumber: 6,
      kind: 'FIRST_INSTALL',
      blocker: 'PRODUCT_NOT_ASSIGNED',
      productName: null,
      estimatedRemainingSprays: null,
      suggestedBottle: null,
    });
  });

  it('test_FR_INV_36_blockers_follow_stock_and_docs — không có chai → NO_STOCK, có chai lô chưa duyệt → DOCS_NOT_APPROVED', async () => {
    await client.query(
      `UPDATE slot_rentals SET fragrance_product_id = $1, product_assigned_at = now() WHERE id = $2`,
      [fx.products[0], extraRental],
    );
    expect(await itemFor(extraSlot)).toMatchObject({
      kind: 'FIRST_INSTALL',
      blocker: 'NO_STOCK',
      availableBottleCount: 0,
    });

    await spareBottle('WL-LATE', '2029-01-01T00:00:00.000Z');
    expect(await itemFor(extraSlot)).toMatchObject({
      blocker: 'DOCS_NOT_APPROVED',
      suggestedBottle: null,
      availableBottleCount: 0,
    });
  });

  it('test_FR_INV_36_suggests_earliest_expiring_installable_bottle — lô đã duyệt thì gợi ý chai hết hạn sớm nhất và lắp được', async () => {
    const early = await spareBottle('WL-EARLY', '2028-01-01T00:00:00.000Z');
    const submitted = await brandA('POST', `/inventory-batches/${batchA}/authenticity-documents`, {
      payload: { documentUrl: 'https://docs.test/lo.pdf' },
    });
    expect(submitted.statusCode, submitted.body).toBe(200);
    const approved = await superAdmin('POST', `/inventory-batches/${batchA}/approve-authenticity`);
    expect(approved.statusCode, approved.body).toBe(200);

    const item = await itemFor(extraSlot);
    expect(item).toMatchObject({
      kind: 'FIRST_INSTALL',
      blocker: null,
      availableBottleCount: 2,
      suggestedBottle: { id: early, identifier: `WL-EARLY-${fx.runId}` },
    });

    // Mở phiếu: việc chuyển lên đầu, mang id phiếu; phiếu trả số slot và sản phẩm cần lắp.
    const opened = await staff('POST', '/refill-sessions', { payload: { slotId: extraSlot } });
    expect(opened.statusCode, opened.body).toBe(201);
    const session = opened.json<{ id: string }>();
    expect(opened.json()).toMatchObject({
      slotNumber: 6,
      fragranceProductId: fx.products[0],
      productName: expect.stringContaining('A Matinale'),
    });
    expect((await itemFor(extraSlot))?.openRefillSessionId).toBe(session.id);

    // Chai gợi ý lắp được thật — máy chủ không từ chối.
    const closed = await staff('POST', `/refill-sessions/${session.id}/close`, {
      payload: { newBottleId: item!.suggestedBottle!.id, checklistCompleted: true },
    });
    expect(closed.statusCode, closed.body).toBe(200);
    expect(await itemFor(extraSlot)).toBeUndefined();
  });

  it('test_FR_INV_36_low_stock_without_request — slot đang bán dưới ngưỡng thành việc LOW_STOCK', async () => {
    await client.query(
      `UPDATE machine_slots SET estimated_remaining_ml = 3, estimated_remaining_sprays = 25
        WHERE id = $1`,
      [fx.slots[0]],
    );
    expect(await itemFor(fx.slots[0]!)).toMatchObject({
      kind: 'LOW_STOCK',
      blocker: null,
      estimatedRemainingSprays: 25,
      refillRequestId: null,
    });
  });

  it('test_FR_INV_36_refill_request_needs_approval — yêu cầu bổ sung SUBMITTED thì chờ duyệt, đã duyệt thì làm được', async () => {
    const created = await brandA('POST', '/refill-requests', {
      payload: {
        slotRentalId: fx.rentals[0],
        slotId: fx.slots[0],
        fragranceProductId: fx.products[0],
        reason: 'LOW_STOCK',
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const request = created.json<{ id: string }>();
    expect(await itemFor(fx.slots[0]!)).toMatchObject({
      kind: 'REFILL_REQUEST',
      blocker: 'REQUEST_NOT_APPROVED',
      refillRequestId: request.id,
      refillRequestStatus: 'SUBMITTED',
    });

    await client.query(`UPDATE refill_requests SET status = 'ACCEPTED' WHERE id = $1`, [
      request.id,
    ]);
    expect(await itemFor(fx.slots[0]!)).toMatchObject({
      kind: 'REFILL_REQUEST',
      blocker: null,
      refillRequestStatus: 'ACCEPTED',
    });
  });

  it('test_FR_INV_36_bottles_filter_by_product — ô chọn chai lọc theo sản phẩm', async () => {
    const res = await staff(
      'GET',
      `/bottles?status=IN_STOCK&fragranceProductId=${fx.products[0]}&pageSize=200`,
    );
    expect(res.statusCode, res.body).toBe(200);
    const items = res.json<{ items: { fragranceProductId: string }[] }>().items;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((b) => b.fragranceProductId === fx.products[0])).toBe(true);
  });
});
