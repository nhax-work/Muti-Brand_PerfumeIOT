/**
 * Bảo hiểm hàng hóa trên PostgreSQL thật (FR-SLT-44 ÷ 46, ADR-0006, ADR-0018):
 *   - ghi nhận chai hư hỏng (`POST /bottles/{id}/mark-damaged`) sinh khoản bồi thường trong cùng
 *     transaction: chọn hóa đơn áp gói, tính theo tỷ lệ × giá bán lẻ, chặn ở hạn mức còn lại;
 *   - chai không được bồi thường (hết hạn, của nền tảng, thương hiệu không có gói) không sinh khoản;
 *   - Super Admin ghi nhận chi trả có xác thực lại; Brand Admin chỉ thấy khoản của mình.
 *
 * Fixture: giá bán lẻ mọi sản phẩm 2.400.000 đ. Hóa đơn fixture theo mô hình cũ nên không có gói bảo
 * quản — mỗi test tự chụp tỷ lệ, hạn mức lên hóa đơn cần dùng.
 */

import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestApp, login, reauth } from './helpers/app.js';
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

interface Compensation {
  id: string;
  brandId: string;
  brandName: string;
  bottleId: string;
  bottleIdentifier: string;
  productName: string;
  slotRentalId: string;
  bottleRetailPrice: string;
  coveragePercent: number;
  amount: string;
  status: string;
  payoutReference: string | null;
  paidAt: string | null;
  damagedAt: string | null;
}

interface DamageResult {
  bottle: {
    id: string;
    status: string;
    damageReason: string | null;
    installedSlotId: string | null;
  };
  compensation: Compensation | null;
}

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let flow: ReturnType<typeof kioskFlow>;
let inventoryStaff: PlatformStaff;
let staffToken: string;
let superAdminToken: string;
let staff: ReturnType<typeof asUser>;
let superAdmin: ReturnType<typeof asUser>;
let brandA: ReturnType<typeof asUser>;
let brandB: ReturnType<typeof asUser>;
let batchA: string;

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  inventoryStaff = await seedPlatformStaff(client, fx, 'INVENTORY_STAFF', [
    'inventory.manage',
    'inventory.adjust',
  ]);
  app = await createTestApp();
  flow = kioskFlow(app, client, fx);
  staffToken = (await login(app, inventoryStaff.email, TEST_PASSWORD)).accessToken;
  superAdminToken = (await login(app, fx.superAdminEmail, TEST_PASSWORD)).accessToken;
  staff = asUser(app, staffToken);
  superAdmin = asUser(app, superAdminToken);
  brandA = asUser(app, (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken);
  brandB = asUser(app, (await login(app, fx.brandAdminBEmail, TEST_PASSWORD)).accessToken);
  const batch = await client.query<{ id: string }>(
    `SELECT id FROM inventory_batches WHERE brand_id = $1 AND fragrance_product_id = $2`,
    [fx.brandA, fx.products[0]],
  );
  batchA = batch.rows[0]!.id;
}, 60_000);

afterEach(async () => {
  await releaseOpenOrders(client, fx.machineId);
  await client.query(`DELETE FROM storage_compensations WHERE brand_id = ANY($1::uuid[])`, [
    [fx.brandA, fx.brandB],
  ]);
  await client.query(
    `UPDATE slot_rentals SET storage_coverage_percent = NULL, storage_coverage_cap = NULL
      WHERE id = ANY($1::uuid[])`,
    [fx.rentals],
  );
});

afterAll(async () => {
  await flow.cleanup();
  await inventoryStaff.cleanup();
  await cleanupIsolationFixture(client, fx);
  await client.end();
  await app.close();
});

/** Chụp gói bảo quản lên hóa đơn fixture — như hóa đơn mua theo gói (FR-SLT-33). */
async function cover(rentalIndex: number, percent: string, cap: string): Promise<void> {
  await client.query(
    `UPDATE slot_rentals SET storage_coverage_percent = $2, storage_coverage_cap = $3 WHERE id = $1`,
    [fx.rentals[rentalIndex], percent, cap],
  );
}

/** Chai mới trong kho của A (lô fixture đã có). */
async function stockBottle(opts: { expiresAt?: Date } = {}): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO bottles (id, brand_id, owner, batch_id, fragrance_product_id, identifier, status,
                          initial_volume_ml, current_estimated_ml, expires_at)
     VALUES ($1, $2, 'BRAND', $3, $4, $5, 'IN_STOCK', 50, 50, $6)`,
    [
      id,
      fx.brandA,
      batchA,
      fx.products[0],
      `DMG-${fx.runId}-${id.slice(0, 6)}`,
      opts.expiresAt ?? new Date(Date.now() + 365 * 24 * 3600 * 1000),
    ],
  );
  return id;
}

/** Chai đang lắp ở slot `slotIndex`: lắp lại chai fixture nếu test trước đã gỡ. */
async function installedBottle(slotIndex: number): Promise<string> {
  const id = fx.bottles[slotIndex]!;
  await client.query(
    `UPDATE bottles SET status = 'INSTALLED', damaged_at = NULL, damage_reason = NULL,
                        removed_at = NULL WHERE id = $1`,
    [id],
  );
  await client.query(`UPDATE machine_slots SET active_bottle_id = $1 WHERE id = $2`, [
    id,
    fx.slots[slotIndex],
  ]);
  return id;
}

async function markDamaged(bottleId: string, reason = 'Vỡ nắp khi vận chuyển trong kho') {
  const token = await reauth(app, staffToken, TEST_PASSWORD);
  return staff('POST', `/bottles/${bottleId}/mark-damaged`, {
    payload: { reason },
    headers: { 'x-reauth-token': token },
  });
}

async function markDamagedOk(bottleId: string): Promise<DamageResult> {
  const res = await markDamaged(bottleId);
  expect(res.statusCode, res.body).toBe(200);
  return res.json<DamageResult>();
}

describe('Tính bồi thường khi chai hư hỏng (FR-SLT-44)', () => {
  it('test_FR_SLT_44_compute_storage_compensation — chai đang lắp: 60% × giá bán lẻ, PENDING, gắn hóa đơn của slot', async () => {
    await cover(0, '60.00', '5000000.0000');
    const bottleId = await installedBottle(0);

    const result = await markDamagedOk(bottleId);

    expect(result.bottle).toMatchObject({
      id: bottleId,
      status: 'DAMAGED',
      damageReason: 'Vỡ nắp khi vận chuyển trong kho',
      installedSlotId: null,
    });
    expect(result.compensation).toMatchObject({
      brandId: fx.brandA,
      bottleId,
      slotRentalId: fx.rentals[0],
      bottleRetailPrice: '2400000.0000',
      coveragePercent: 60,
      amount: '1440000.0000',
      status: 'PENDING',
      payoutReference: null,
    });
    expect(result.compensation!.damagedAt).not.toBeNull();

    // Slot không còn bán chai hỏng.
    const slot = await client.query(
      `SELECT active_bottle_id, estimated_remaining_sprays FROM machine_slots WHERE id = $1`,
      [fx.slots[0]],
    );
    expect(slot.rows[0]).toMatchObject({ active_bottle_id: null, estimated_remaining_sprays: 0 });

    // AuditLog cho cả hai việc: chai hỏng và khoản bồi thường.
    const logs = await client.query<{ action: string }>(
      `SELECT action FROM audit_logs WHERE target_id = ANY($1::uuid[]) ORDER BY occurred_at`,
      [[bottleId, result.compensation!.id]],
    );
    expect(logs.rows.map((r) => r.action)).toEqual(
      expect.arrayContaining(['inv.bottle.damaged', 'slt.compensation.created']),
    );

    // Brand Admin nhận thông báo trong ứng dụng.
    const notes = await client.query(
      `SELECT 1 FROM notifications WHERE type = 'STORAGE_COMPENSATION_CREATED' AND reference_id = $1`,
      [result.compensation!.id],
    );
    expect(notes.rowCount).toBeGreaterThan(0);
  });

  it('test_FR_SLT_44_compute_storage_compensation — chai trong kho: áp gói có tỷ lệ cao nhất của thương hiệu (AC2)', async () => {
    await cover(0, '30.00', '5000000.0000');
    await cover(1, '60.00', '5000000.0000');
    const bottleId = await stockBottle();

    const { compensation } = await markDamagedOk(bottleId);

    expect(compensation).toMatchObject({ slotRentalId: fx.rentals[1], amount: '1440000.0000' });
  });

  it('test_FR_SLT_44_compute_storage_compensation — chạm hạn mức: khoản bằng phần hạn mức còn lại (AC3)', async () => {
    await cover(1, '60.00', '500000.0000');
    const bottleId = await installedBottle(1);

    const { compensation } = await markDamagedOk(bottleId);

    expect(compensation).toMatchObject({ slotRentalId: fx.rentals[1], amount: '500000.0000' });

    // Hạn mức đã hết: chai trong kho tiếp theo (hóa đơn có gói duy nhất là hóa đơn này) không sinh khoản.
    expect((await markDamagedOk(await stockBottle())).compensation).toBeNull();
  });

  it('test_FR_SLT_44_compute_storage_compensation — hai chai cùng hóa đơn hỏng đồng thời không vượt hạn mức', async () => {
    await cover(0, '60.00', '2000000.0000');
    const first = await stockBottle();
    const second = await stockBottle();
    await cover(1, '10.00', '5000000.0000');

    const [a, b] = await Promise.all([markDamaged(first), markDamaged(second)]);
    expect(a.statusCode, a.body).toBe(200);
    expect(b.statusCode, b.body).toBe(200);

    const total = await client.query<{ total: string }>(
      `SELECT sum(amount)::numeric(19,4) AS total FROM storage_compensations WHERE slot_rental_id = $1`,
      [fx.rentals[0]],
    );
    expect(total.rows[0]!.total).toBe('2000000.0000');
  });

  it('test_FR_SLT_44_compute_storage_compensation — chai hết hạn, chai của nền tảng, thương hiệu không có gói: không bồi thường (AC4)', async () => {
    await cover(0, '60.00', '5000000.0000');

    const expired = await stockBottle({ expiresAt: new Date(Date.now() - 24 * 3600 * 1000) });
    expect((await markDamagedOk(expired)).compensation).toBeNull();

    // Chai slot 5 đã thanh lý: owner = PLATFORM (FR-EXP-17).
    expect((await markDamagedOk(fx.bottles[4]!)).compensation).toBeNull();

    // B không có hóa đơn nào chụp gói bảo quản.
    const bBottle = await installedBottle(2);
    expect((await markDamagedOk(bBottle)).compensation).toBeNull();

    const rows = await client.query(
      `SELECT 1 FROM storage_compensations WHERE bottle_id = ANY($1)`,
      [[expired, fx.bottles[4], bBottle]],
    );
    expect(rows.rowCount).toBe(0);
  });

  it('test_FR_SLT_44_compute_storage_compensation — chai đã hỏng thì không ghi nhận lần nữa (một chai một khoản)', async () => {
    await cover(0, '60.00', '5000000.0000');
    const bottleId = await stockBottle();
    await markDamagedOk(bottleId);

    const again = await markDamaged(bottleId);
    expect(again.statusCode).toBe(400);
    expect(again.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    const rows = await client.query(`SELECT 1 FROM storage_compensations WHERE bottle_id = $1`, [
      bottleId,
    ]);
    expect(rows.rowCount).toBe(1);
  });

  it('test_FR_SLT_44_compute_storage_compensation — chai đang lắp trên máy bận thì MACHINE_BUSY, không đổi gì', async () => {
    await cover(0, '60.00', '5000000.0000');
    const bottleId = await installedBottle(0);
    await flow.createOrder(1);

    const res = await markDamaged(bottleId);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'MACHINE_BUSY' });
    const bottle = await client.query(`SELECT status FROM bottles WHERE id = $1`, [bottleId]);
    expect(bottle.rows[0]).toMatchObject({ status: 'INSTALLED' });
  });

  it('test_FR_SLT_44_compute_storage_compensation — cần xác thực lại, thiếu lý do bị từ chối, Brand Admin không được gọi', async () => {
    const bottleId = await stockBottle();

    const noReauth = await staff('POST', `/bottles/${bottleId}/mark-damaged`, {
      payload: { reason: 'Vỡ' },
    });
    expect(noReauth.statusCode).toBe(403);
    expect(noReauth.json()).toMatchObject({ code: 'REAUTH_REQUIRED' });

    const blank = await markDamaged(bottleId, '   ');
    expect(blank.statusCode).toBe(400);
    expect(blank.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

    const byBrand = await brandA('POST', `/bottles/${bottleId}/mark-damaged`, {
      payload: { reason: 'Vỡ' },
    });
    expect(byBrand.statusCode).toBe(403);
    expect(byBrand.json()).toMatchObject({ code: 'FORBIDDEN_SCOPE' });

    const status = await client.query(`SELECT status FROM bottles WHERE id = $1`, [bottleId]);
    expect(status.rows[0]).toMatchObject({ status: 'IN_STOCK' });
  });
});

describe('Ghi nhận chi trả bồi thường (FR-SLT-45)', () => {
  async function pendingCompensation(): Promise<Compensation> {
    await cover(0, '60.00', '5000000.0000');
    const { compensation } = await markDamagedOk(await stockBottle());
    return compensation!;
  }

  it('test_FR_SLT_45_record_compensation_payout — Super Admin đã xác thực lại: PAID kèm mã giao dịch, ghi AuditLog', async () => {
    const compensation = await pendingCompensation();
    const token = await reauth(app, superAdminToken, TEST_PASSWORD);

    const res = await superAdmin('POST', `/storage-compensations/${compensation.id}/payout`, {
      payload: { payoutReference: 'FT26300123456' },
      headers: { 'x-reauth-token': token },
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      id: compensation.id,
      status: 'PAID',
      payoutReference: 'FT26300123456',
    });
    expect(res.json<Compensation>().paidAt).not.toBeNull();
    const row = await client.query(`SELECT paid_by FROM storage_compensations WHERE id = $1`, [
      compensation.id,
    ]);
    expect(row.rows[0]).toMatchObject({ paid_by: fx.superAdminId });
    const log = await client.query(
      `SELECT 1 FROM audit_logs WHERE action = 'slt.compensation.paid' AND target_id = $1`,
      [compensation.id],
    );
    expect(log.rowCount).toBe(1);
  });

  it('test_FR_SLT_45_record_compensation_payout — chưa xác thực lại thì REAUTH_REQUIRED (AC2)', async () => {
    const compensation = await pendingCompensation();
    const res = await superAdmin('POST', `/storage-compensations/${compensation.id}/payout`, {
      payload: { payoutReference: 'FT1' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'REAUTH_REQUIRED' });
  });

  it('test_FR_SLT_45_record_compensation_payout — đã chi trả thì VALIDATION_ERROR (AC3)', async () => {
    const compensation = await pendingCompensation();
    const pay = async () =>
      superAdmin('POST', `/storage-compensations/${compensation.id}/payout`, {
        payload: { payoutReference: 'FT2' },
        headers: { 'x-reauth-token': await reauth(app, superAdminToken, TEST_PASSWORD) },
      });
    expect((await pay()).statusCode).toBe(200);
    const again = await pay();
    expect(again.statusCode).toBe(400);
    expect(again.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('test_FR_SLT_45_record_compensation_payout — không phải Super Admin thì FORBIDDEN_SCOPE (AC4)', async () => {
    const compensation = await pendingCompensation();
    const res = await brandA('POST', `/storage-compensations/${compensation.id}/payout`, {
      payload: { payoutReference: 'FT3' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'FORBIDDEN_SCOPE' });
  });
});

describe('Brand Admin xem khoản bồi thường (FR-SLT-46)', () => {
  it('test_FR_SLT_46_list_brand_compensations — mỗi thương hiệu chỉ thấy khoản của mình; Super Admin thấy và lọc được tất cả', async () => {
    await cover(0, '60.00', '5000000.0000');
    await cover(2, '50.00', '5000000.0000');
    const aComp = (await markDamagedOk(await stockBottle())).compensation!;
    const bComp = (await markDamagedOk(await installedBottle(2))).compensation!;
    expect(bComp.brandId).toBe(fx.brandB);

    const aList = await brandA('GET', '/storage-compensations');
    expect(aList.statusCode).toBe(200);
    const aItems = aList.json<{ items: Compensation[] }>().items;
    expect(aItems.map((c) => c.id)).toEqual([aComp.id]);
    expect(aItems[0]).toMatchObject({
      productName: expect.any(String),
      bottleIdentifier: expect.any(String),
      amount: '1440000.0000',
      status: 'PENDING',
    });
    // AC2: không lọt khoản của B, kể cả khi A cố lọc theo brandId của B.
    expect(aList.body).not.toContain(bComp.id);
    const sneaky = await brandA('GET', `/storage-compensations?brandId=${fx.brandB}`);
    expect(sneaky.json<{ items: Compensation[] }>().items.map((c) => c.id)).toEqual([aComp.id]);

    const bList = await brandB('GET', '/storage-compensations');
    expect(bList.json<{ items: Compensation[] }>().items.map((c) => c.id)).toEqual([bComp.id]);

    const all = await superAdmin(
      'GET',
      `/storage-compensations?brandId=${fx.brandB}&status=PENDING`,
    );
    expect(all.json<{ items: Compensation[]; meta: { total: number } }>()).toMatchObject({
      items: [{ id: bComp.id }],
      meta: { total: 1 },
    });
  });
});
