/**
 * Integration tests cho 4 API còn lại của TV4 trong module INV:
 * - POST /inventory-batches        (FR-INV-01)
 * - DELETE /slots/:id/bottle       (FR-INV-15, FR-MCH-17)
 * - POST /inventory-adjustments    (FR-INV-16, FR-AUTH-09)
 * - GET /bottles/:id/history       (FR-INV-17, FR-AUTH-07)
 */

import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestApp, login, reauth } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import { kioskFlow, useTestSigningKey } from './helpers/kiosk-flow.js';
import {
  cleanupIsolationFixture,
  releaseOpenOrders,
  seedIsolationFixture,
  seedPlatformStaff,
  TEST_PASSWORD,
  type IsolationFixture,
  type PlatformStaff,
} from './helpers/seed-isolation.js';

interface BatchDto {
  id: string;
  brandId: string;
  fragranceProductId: string;
  sourceDeclarationId: string | null;
  batchNumber: string;
  receivedAt: string;
  expiresAt: string | null;
  quantityReceived: number;
  authenticityStatus: string;
}

interface BottleDto {
  id: string;
  brandId: string;
  owner: 'BRAND' | 'PLATFORM';
  status: string;
  currentEstimatedMl: number;
  installedSlotId: string | null;
  removedAt: string | null;
}

interface AdjustmentDto {
  id: string;
  brandId: string;
  bottleId: string;
  slotId: string | null;
  beforeQuantityMl: number;
  afterQuantityMl: number;
  differenceMl: number;
  reason: string;
  adjustedBy: string;
  createdAt: string;
}

interface AuditEntryDto {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  occurredAt: string;
}

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let flow: ReturnType<typeof kioskFlow>;
let staffManageOnly: PlatformStaff;
let staffFullInv: PlatformStaff;
let brandA: ReturnType<typeof asUser>;
let brandB: ReturnType<typeof asUser>;
let manageStaff: ReturnType<typeof asUser>;
let invStaff: ReturnType<typeof asUser>;
let invStaffToken: string;
let superAdmin: ReturnType<typeof asUser>;
let superAdminToken: string;

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  useTestSigningKey();
  staffManageOnly = await seedPlatformStaff(client, fx, 'INVENTORY_STAFF', ['inventory.manage']);
  staffFullInv = await seedPlatformStaff(client, fx, 'INVENTORY_STAFF', [
    'inventory.manage',
    'inventory.adjust',
  ]);
  app = await createTestApp();
  flow = kioskFlow(app, client, fx);

  brandA = asUser(app, (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken);
  brandB = asUser(app, (await login(app, fx.brandAdminBEmail, TEST_PASSWORD)).accessToken);
  manageStaff = asUser(app, (await login(app, staffManageOnly.email, TEST_PASSWORD)).accessToken);
  invStaffToken = (await login(app, staffFullInv.email, TEST_PASSWORD)).accessToken;
  invStaff = asUser(app, invStaffToken);
  superAdminToken = (await login(app, fx.superAdminEmail, TEST_PASSWORD)).accessToken;
  superAdmin = asUser(app, superAdminToken);
}, 120_000);

afterAll(async () => {
  if (client && fx) {
    await releaseOpenOrders(client, fx.machineId);
  }
  await flow?.cleanup();
  await staffManageOnly?.cleanup();
  await staffFullInv?.cleanup();
  if (client && fx) {
    await cleanupIsolationFixture(client, fx);
    await client.end();
  }
  await app?.close();
});

describe('Tạo lô nước hoa thủ công (FR-INV-01)', () => {
  it('test_FR_INV_01_create_batch — tạo lô đầy đủ thông tin, lưu CSDL và ghi nhật ký (AC1)', async () => {
    const batchNumber = `MANUAL-${fx.runId}-01`;
    const receivedAt = '2026-05-01T08:30:00.000Z';
    const expiresAt = '2028-05-01T08:30:00.000Z';

    const res = await invStaff('POST', '/inventory-batches', {
      payload: {
        brandId: fx.brandA,
        fragranceProductId: fx.products[0],
        batchNumber,
        receivedAt,
        expiresAt,
        quantityReceived: 24,
        supplierInfo: { supplierName: 'Maison Grasse', poCode: 'PO-2026-01' },
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json<BatchDto>();
    expect(body).toMatchObject({
      brandId: fx.brandA,
      fragranceProductId: fx.products[0],
      sourceDeclarationId: null,
      batchNumber,
      quantityReceived: 24,
      authenticityStatus: 'NONE',
    });
    expect(new Date(body.receivedAt).toISOString()).toBe(receivedAt);
    expect(new Date(body.expiresAt!).toISOString()).toBe(expiresAt);

    const dbRow = await client.query<{
      source_declaration_id: string | null;
      supplier_info: { supplierName?: string } | null;
      created_by: string;
    }>(
      `SELECT source_declaration_id, supplier_info, created_by
         FROM inventory_batches WHERE id = $1`,
      [body.id],
    );
    expect(dbRow.rows[0]?.source_declaration_id).toBeNull();
    expect(dbRow.rows[0]?.supplier_info).toMatchObject({ supplierName: 'Maison Grasse' });
    expect(dbRow.rows[0]?.created_by).toBe(staffFullInv.userId);

    const auditRow = await client.query(
      `SELECT 1 FROM audit_logs WHERE action = 'inv.batch.created' AND target_id = $1`,
      [body.id],
    );
    expect(auditRow.rowCount).toBe(1);
  });

  it('test_FR_INV_01_create_batch — từ chối thiếu thông tin, sai sở hữu, trùng số lô hoặc sai quyền (AC2)', async () => {
    // Thiếu thông tin bắt buộc hoặc số lượng <= 0 -> 400
    const missingBatch = await invStaff('POST', '/inventory-batches', {
      payload: {
        brandId: fx.brandA,
        fragranceProductId: fx.products[0],
        receivedAt: '2026-05-01T08:30:00.000Z',
        quantityReceived: 5,
      },
    });
    expect(missingBatch.statusCode).toBe(400);
    expect(missingBatch.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

    const invalidExpiry = await invStaff('POST', '/inventory-batches', {
      payload: {
        brandId: fx.brandA,
        fragranceProductId: fx.products[0],
        batchNumber: `EXP-BAD-${fx.runId}`,
        receivedAt: '2026-05-10T08:30:00.000Z',
        expiresAt: '2026-05-01T08:30:00.000Z',
        quantityReceived: 5,
      },
    });
    expect(invalidExpiry.statusCode).toBe(400);

    // Sản phẩm của Brand B nhưng khai báo cho Brand A -> 403 PRODUCT_NOT_OWNED
    const wrongOwner = await invStaff('POST', '/inventory-batches', {
      payload: {
        brandId: fx.brandA,
        fragranceProductId: fx.products[2],
        batchNumber: `OWN-${fx.runId}`,
        receivedAt: '2026-05-01T08:30:00.000Z',
        quantityReceived: 5,
      },
    });
    expect(wrongOwner.statusCode).toBe(403);
    expect(wrongOwner.json()).toMatchObject({ code: 'PRODUCT_NOT_OWNED' });

    // Trùng số lô trong cùng (brand, product) -> 400 VALIDATION_ERROR
    const duplicate = await invStaff('POST', '/inventory-batches', {
      payload: {
        brandId: fx.brandA,
        fragranceProductId: fx.products[0],
        batchNumber: `MANUAL-${fx.runId}-01`,
        receivedAt: '2026-05-02T08:30:00.000Z',
        quantityReceived: 10,
      },
    });
    expect(duplicate.statusCode).toBe(400);
    expect(duplicate.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

    // Brand Admin không có inventory.manage -> 403 FORBIDDEN_SCOPE
    const byBrand = await brandA('POST', '/inventory-batches', {
      payload: {
        brandId: fx.brandA,
        fragranceProductId: fx.products[0],
        batchNumber: `BY-BRAND-${fx.runId}`,
        receivedAt: '2026-05-01T08:30:00.000Z',
        quantityReceived: 5,
      },
    });
    expect(byBrand.statusCode).toBe(403);
    expect(byBrand.json()).toMatchObject({ code: 'FORBIDDEN_SCOPE' });
  });
});

describe('Tháo chai khỏi slot về kho (FR-INV-15)', () => {
  it('test_FR_INV_15_remove_to_stock — tháo chai còn dung tích về IN_STOCK, hết về EMPTY, slot chuyển UNAVAILABLE (AC1)', async () => {
    // 1. Chai đang INSTALLED trên slot 2 (fx.slots[1]) có 48ml
    const res = await invStaff('DELETE', `/slots/${fx.slots[1]}/bottle`, {
      payload: { notes: 'Rút chai về kiểm tra vòi' },
    });
    expect(res.statusCode, res.body).toBe(200);
    const removedBottle = res.json<BottleDto>();
    expect(removedBottle).toMatchObject({
      id: fx.bottles[1],
      status: 'IN_STOCK',
      currentEstimatedMl: 48,
      installedSlotId: null,
    });
    expect(removedBottle.removedAt).not.toBeNull();

    const slotAfter = await client.query<{
      active_bottle_id: string | null;
      status: string;
      estimated_remaining_ml: string;
      estimated_remaining_sprays: number;
    }>(
      `SELECT active_bottle_id, status, estimated_remaining_ml, estimated_remaining_sprays
         FROM machine_slots WHERE id = $1`,
      [fx.slots[1]],
    );
    expect(slotAfter.rows[0]).toMatchObject({
      active_bottle_id: null,
      status: 'UNAVAILABLE',
      estimated_remaining_sprays: 0,
    });
    expect(Number(slotAfter.rows[0]?.estimated_remaining_ml)).toBe(0);

    // Gọi lại lần nữa khi slot trống -> 409 SLOT_UNAVAILABLE
    const repeat = await invStaff('DELETE', `/slots/${fx.slots[1]}/bottle`);
    expect(repeat.statusCode).toBe(409);
    expect(repeat.json()).toMatchObject({ code: 'SLOT_UNAVAILABLE' });

    // 2. Chai có lượng còn lại = 0 -> khi tháo về trạng thái EMPTY
    await client.query(`UPDATE bottles SET current_estimated_ml = 0 WHERE id = $1`, [fx.bottles[3]]);
    const emptyRes = await invStaff('DELETE', `/slots/${fx.slots[3]}/bottle`);
    expect(emptyRes.statusCode, emptyRes.body).toBe(200);
    expect(emptyRes.json<BottleDto>()).toMatchObject({
      id: fx.bottles[3],
      status: 'EMPTY',
      currentEstimatedMl: 0,
      installedSlotId: null,
    });

    // 3. Chai trên slot đã LIQUIDATED (fx.slots[4]) khi tháo giữ nguyên LIQUIDATED + owner PLATFORM
    const liqRes = await invStaff('DELETE', `/slots/${fx.slots[4]}/bottle`);
    expect(liqRes.statusCode, liqRes.body).toBe(200);
    expect(liqRes.json<BottleDto>()).toMatchObject({
      id: fx.bottles[4],
      owner: 'PLATFORM',
      status: 'LIQUIDATED',
      installedSlotId: null,
    });

    // 4. Hai yêu cầu tháo cùng lúc trên cùng slot -> chỉ một yêu cầu thành công, yêu cầu còn lại 409 SLOT_UNAVAILABLE
    const [r1, r2] = await Promise.all([
      invStaff('DELETE', `/slots/${fx.slots[2]}/bottle`),
      invStaff('DELETE', `/slots/${fx.slots[2]}/bottle`),
    ]);
    const statuses = [r1.statusCode, r2.statusCode].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);

    // Phục hồi fx.bottles[2] lên fx.slots[2] cho suite điều chỉnh tồn kho kiểm tra lệch slot
    await client.query(
      `UPDATE bottles SET status = 'INSTALLED', removed_at = NULL WHERE id = $1`,
      [fx.bottles[2]],
    );
    await client.query(
      `UPDATE machine_slots
          SET active_bottle_id = $1,
              estimated_remaining_ml = 48,
              estimated_remaining_sprays = 400,
              status = 'AVAILABLE'
        WHERE id = $2`,
      [fx.bottles[2], fx.slots[2]],
    );
  });

  it('test_FR_INV_15_remove_to_stock — chặn Brand Admin, máy bận, phiếu nạp đang mở và hóa đơn đã báo không gia hạn', async () => {
    // Brand Admin không có quyền tháo -> 403
    const byBrand = await brandA('DELETE', `/slots/${fx.slots[0]}/bottle`);
    expect(byBrand.statusCode).toBe(403);
    expect(byBrand.json()).toMatchObject({ code: 'FORBIDDEN_SCOPE' });

    // Slot không tồn tại -> 404 NOT_FOUND
    const missingSlot = await invStaff('DELETE', `/slots/${randomUUID()}/bottle`);
    expect(missingSlot.statusCode).toBe(404);
    expect(missingSlot.json()).toMatchObject({ code: 'NOT_FOUND' });

    // Hóa đơn đã báo không gia hạn (ADR-0014 / FR-EXP-26) -> 409 RENTAL_NOT_ACTIVE
    await client.query(
      `UPDATE slot_rentals SET non_renewal_requested_at = now() WHERE id = $1`,
      [fx.rentals[2]],
    );
    try {
      const nonRenew = await invStaff('DELETE', `/slots/${fx.slots[2]}/bottle`);
      expect(nonRenew.statusCode).toBe(409);
      expect(nonRenew.json()).toMatchObject({ code: 'RENTAL_NOT_ACTIVE' });
    } finally {
      await client.query(
        `UPDATE slot_rentals SET non_renewal_requested_at = NULL WHERE id = $1`,
        [fx.rentals[2]],
      );
    }

    // Máy có đơn đang chờ thanh toán -> 409 MACHINE_BUSY
    await flow.createOrder(0);
    try {
      const busyRes = await invStaff('DELETE', `/slots/${fx.slots[0]}/bottle`);
      expect(busyRes.statusCode).toBe(409);
      expect(busyRes.json()).toMatchObject({ code: 'MACHINE_BUSY' });
    } finally {
      await releaseOpenOrders(client, fx.machineId);
    }

    // Slot đang có phiếu nạp mở -> 409 REFILL_SESSION_OPEN
    const opened = await invStaff('POST', '/refill-sessions', { payload: { slotId: fx.slots[0] } });
    expect(opened.statusCode, opened.body).toBe(201);
    const sessionId = opened.json<{ id: string }>().id;
    try {
      const openRefill = await invStaff('DELETE', `/slots/${fx.slots[0]}/bottle`);
      expect(openRefill.statusCode).toBe(409);
      expect(openRefill.json()).toMatchObject({ code: 'REFILL_SESSION_OPEN' });
    } finally {
      await client.query(`DELETE FROM refill_sessions WHERE id = $1`, [sessionId]);
    }
  });
});

describe('Điều chỉnh tồn kho kèm lý do (FR-INV-16)', () => {
  it('test_FR_INV_16_inventory_adjustment — bắt buộc reauth, quyền inventory.adjust, đồng bộ chai và slot (AC1, FR-AUTH-09)', async () => {
    // Thiếu X-Reauth-Token -> 403 REAUTH_REQUIRED
    const noReauth = await invStaff('POST', '/inventory-adjustments', {
      payload: { bottleId: fx.bottles[0], afterQuantityMl: 40, reason: 'Kiểm kê định kỳ' },
    });
    expect(noReauth.statusCode).toBe(403);
    expect(noReauth.json()).toMatchObject({ code: 'REAUTH_REQUIRED' });

    // Có inventory.manage nhưng thiếu inventory.adjust -> 403 FORBIDDEN_SCOPE
    const manageToken = (await login(app, staffManageOnly.email, TEST_PASSWORD)).accessToken;
    const manageReauth = await reauth(app, manageToken, TEST_PASSWORD);
    const noPerm = await manageStaff('POST', '/inventory-adjustments', {
      headers: { 'x-reauth-token': manageReauth },
      payload: { bottleId: fx.bottles[0], afterQuantityMl: 40, reason: 'Kiểm kê định kỳ' },
    });
    expect(noPerm.statusCode).toBe(403);
    expect(noPerm.json()).toMatchObject({ code: 'FORBIDDEN_SCOPE' });

    const reauthToken = await reauth(app, invStaffToken, TEST_PASSWORD);

    // 1. Điều chỉnh chai đang lắp trên slot 1 xuống dưới ngưỡng thấp (4.5 < 5.0)
    const lowRes = await invStaff('POST', '/inventory-adjustments', {
      headers: { 'x-reauth-token': reauthToken },
      payload: {
        bottleId: fx.bottles[0],
        afterQuantityMl: 4.5,
        reason: 'Kiểm kê thực tế hao hụt bay hơi',
      },
    });
    expect(lowRes.statusCode, lowRes.body).toBe(201);
    expect(lowRes.json<AdjustmentDto>()).toMatchObject({
      brandId: fx.brandA,
      bottleId: fx.bottles[0],
      slotId: fx.slots[0],
      beforeQuantityMl: 48,
      afterQuantityMl: 4.5,
      differenceMl: -43.5,
      reason: 'Kiểm kê thực tế hao hụt bay hơi',
      adjustedBy: staffFullInv.userId,
    });

    const slotLow = await client.query<{
      status: string;
      estimated_remaining_ml: string;
      estimated_remaining_sprays: number;
    }>(
      `SELECT status, estimated_remaining_ml, estimated_remaining_sprays
         FROM machine_slots WHERE id = $1`,
      [fx.slots[0]],
    );
    expect(slotLow.rows[0]?.status).toBe('AVAILABLE');
    expect(Number(slotLow.rows[0]?.estimated_remaining_ml)).toBe(4.5);
    expect(slotLow.rows[0]?.estimated_remaining_sprays).toBe(37);

    const bottleLow = await client.query<{ status: string; current_estimated_ml: string }>(
      `SELECT status, current_estimated_ml FROM bottles WHERE id = $1`,
      [fx.bottles[0]],
    );
    expect(bottleLow.rows[0]?.status).toBe('LOW');
    expect(Number(bottleLow.rows[0]?.current_estimated_ml)).toBe(4.5);

    // 2. Điều chỉnh chai đang lắp về 0 -> chai EMPTY, slot UNAVAILABLE
    const zeroRes = await invStaff('POST', '/inventory-adjustments', {
      headers: { 'x-reauth-token': reauthToken },
      payload: {
        bottleId: fx.bottles[0],
        slotId: fx.slots[0],
        afterQuantityMl: 0,
        reason: 'Chai cạn hoàn toàn khi kiểm tra',
      },
    });
    expect(zeroRes.statusCode, zeroRes.body).toBe(201);

    const slotZero = await client.query<{ status: string; estimated_remaining_sprays: number }>(
      `SELECT status, estimated_remaining_sprays FROM machine_slots WHERE id = $1`,
      [fx.slots[0]],
    );
    expect(slotZero.rows[0]?.status).toBe('UNAVAILABLE');
    expect(slotZero.rows[0]?.estimated_remaining_sprays).toBe(0);

    // 3. Điều chỉnh chai IN_STOCK (fx.bottles[1] đã tháo ở suite trước) -> 48 lên 50
    const stockRes = await invStaff('POST', '/inventory-adjustments', {
      headers: { 'x-reauth-token': reauthToken },
      payload: {
        bottleId: fx.bottles[1],
        afterQuantityMl: 50,
        reason: 'Cân lại tại kho sau hiệu chuẩn',
      },
    });
    expect(stockRes.statusCode, stockRes.body).toBe(201);
    expect(stockRes.json<AdjustmentDto>()).toMatchObject({
      bottleId: fx.bottles[1],
      slotId: null,
      beforeQuantityMl: 48,
      afterQuantityMl: 50,
      differenceMl: 2,
    });
  });

  it('test_FR_INV_16_inventory_adjustment — từ chối khi thiếu lý do (ADJUSTMENT_REASON_REQUIRED) hoặc lệch slot (AC2)', async () => {
    const reauthToken = await reauth(app, invStaffToken, TEST_PASSWORD);

    for (const reason of [undefined, '', '   ']) {
      const res = await invStaff('POST', '/inventory-adjustments', {
        headers: { 'x-reauth-token': reauthToken },
        payload: {
          bottleId: fx.bottles[2],
          afterQuantityMl: 45,
          ...(reason !== undefined ? { reason } : {}),
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'ADJUSTMENT_REASON_REQUIRED' });
    }

    // fx.bottles[2] đang lắp ở fx.slots[2], truyền fx.slots[0] -> 400 VALIDATION_ERROR
    const mismatch = await invStaff('POST', '/inventory-adjustments', {
      headers: { 'x-reauth-token': reauthToken },
      payload: {
        bottleId: fx.bottles[2],
        slotId: fx.slots[0],
        afterQuantityMl: 45,
        reason: 'Lệch slot',
      },
    });
    expect(mismatch.statusCode).toBe(400);
    expect(mismatch.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('Lịch sử vòng đời từng chai (FR-INV-17)', () => {
  it('test_FR_INV_17_bottle_history — lưu đủ lắp/nạp, điều chỉnh, tháo, hư hỏng, thanh lý và không sinh bản ghi giả (AC1, AC2)', async () => {
    // Lô đã duyệt giấy tờ chính hãng để đăng ký chai và lắp qua phiếu nạp thật.
    const approvedBatchRes = await invStaff('POST', '/inventory-batches', {
      payload: {
        brandId: fx.brandA,
        fragranceProductId: fx.products[1],
        batchNumber: `LIFE-${fx.runId}`,
        receivedAt: '2026-05-01T08:00:00.000Z',
        expiresAt: '2028-05-01T08:00:00.000Z',
        quantityReceived: 5,
      },
    });
    expect(approvedBatchRes.statusCode, approvedBatchRes.body).toBe(201);
    const batchId = approvedBatchRes.json<BatchDto>().id;
    await client.query(
      `UPDATE inventory_batches SET authenticity_status = 'APPROVED' WHERE id = $1`,
      [batchId],
    );

    // Đăng ký 2 chai mới
    const b1Res = await invStaff('POST', '/bottles', {
      payload: { batchId, identifier: `LIFE-B1-${fx.runId}`, initialVolumeMl: 50 },
    });
    expect(b1Res.statusCode, b1Res.body).toBe(201);
    const b1Id = b1Res.json<BottleDto>().id;

    const b2Res = await invStaff('POST', '/bottles', {
      payload: { batchId, identifier: `LIFE-B2-${fx.runId}`, initialVolumeMl: 50 },
    });
    expect(b2Res.statusCode, b2Res.body).toBe(201);
    const b2Id = b2Res.json<BottleDto>().id;

    // AC2: Chai chưa phát sinh sự kiện nào -> mảng rỗng, không sinh bản ghi giả; chai vừa đăng ký -> chỉ inv.bottle.registered
    const unloggedId = randomUUID();
    await client.query(
      `INSERT INTO bottles (id, brand_id, owner, batch_id, fragrance_product_id, identifier,
                            status, initial_volume_ml, current_estimated_ml, expires_at)
       VALUES ($1, $2, 'BRAND', $3, $4, $5, 'IN_STOCK', 50, 50, now() + interval '18 months')`,
      [unloggedId, fx.brandA, batchId, fx.products[1], `UNLOG-${fx.runId}`],
    );
    const unloggedHist = await invStaff('GET', `/bottles/${unloggedId}/history`);
    expect(unloggedHist.statusCode, unloggedHist.body).toBe(200);
    expect(unloggedHist.json<{ items: AuditEntryDto[]; meta: { total: number } }>()).toMatchObject({
      items: [],
      meta: { total: 0 },
    });

    const freshHistory = await invStaff('GET', `/bottles/${b1Id}/history`);
    expect(freshHistory.statusCode, freshHistory.body).toBe(200);
    const freshActions = freshHistory
      .json<{ items: AuditEntryDto[] }>()
      .items.map((entry) => entry.action);
    expect(freshActions).toEqual(['inv.bottle.registered']);

    // AC1: Lắp & nạp b1 lên fx.slots[1] (trống sau suite FR-INV-15) -> inv.bottle.installed
    const openRefill = await invStaff('POST', '/refill-sessions', {
      payload: { slotId: fx.slots[1] },
    });
    expect(openRefill.statusCode, openRefill.body).toBe(201);
    const refillId = openRefill.json<{ id: string }>().id;

    const closeRefill = await invStaff('POST', `/refill-sessions/${refillId}/close`, {
      payload: { newBottleId: b1Id, checklistCompleted: true, notes: 'Lắp mới cho kiểm thử' },
    });
    expect(closeRefill.statusCode, closeRefill.body).toBe(200);

    // Điều chỉnh tồn kho b1 -> inv.inventory.adjusted
    const staffReauth = await reauth(app, invStaffToken, TEST_PASSWORD);
    const adj = await invStaff('POST', '/inventory-adjustments', {
      headers: { 'x-reauth-token': staffReauth },
      payload: { bottleId: b1Id, afterQuantityMl: 42, reason: 'Hiệu chỉnh vòi xịt' },
    });
    expect(adj.statusCode, adj.body).toBe(201);

    // Tháo b1 về kho -> inv.bottle.removed
    const removed = await invStaff('DELETE', `/slots/${fx.slots[1]}/bottle`, {
      payload: { notes: 'Tháo kiểm tra' },
    });
    expect(removed.statusCode, removed.body).toBe(200);

    // Lắp b1 lại rồi báo hư hỏng -> inv.bottle.installed + inv.bottle.damaged
    const open2 = await invStaff('POST', '/refill-sessions', {
      payload: { slotId: fx.slots[1] },
    });
    expect(open2.statusCode, open2.body).toBe(201);
    const refill2Id = open2.json<{ id: string }>().id;
    const close2 = await invStaff('POST', `/refill-sessions/${refill2Id}/close`, {
      payload: { newBottleId: b1Id, checklistCompleted: true },
    });
    expect(close2.statusCode, close2.body).toBe(200);

    const dmg = await invStaff('POST', `/bottles/${b1Id}/mark-damaged`, {
      headers: { 'x-reauth-token': await reauth(app, invStaffToken, TEST_PASSWORD) },
      payload: { reason: 'Vỡ thân chai' },
    });
    expect(dmg.statusCode, dmg.body).toBe(200);

    // Lắp b2 lên slot 1 rồi thanh lý hóa đơn -> slt.bottle.liquidated
    const open3 = await invStaff('POST', '/refill-sessions', {
      payload: { slotId: fx.slots[1] },
    });
    expect(open3.statusCode, open3.body).toBe(201);
    const close3 = await invStaff('POST', `/refill-sessions/${open3.json<{ id: string }>().id}/close`, {
      payload: { newBottleId: b2Id, checklistCompleted: true },
    });
    expect(close3.statusCode, close3.body).toBe(200);

    await client.query(`UPDATE slot_rentals SET status = 'GRACE' WHERE id = $1`, [fx.rentals[1]]);
    const adminReauth = await reauth(app, superAdminToken, TEST_PASSWORD);
    const liq = await superAdmin('POST', `/slot-rentals/${fx.rentals[1]}/liquidate`, {
      headers: { 'x-reauth-token': adminReauth },
    });
    expect(liq.statusCode, liq.body).toBe(200);

    // Kiểm tra lịch sử b1 (đăng ký, lắp, điều chỉnh, tháo, lắp lại, hư hỏng) + phân trang
    const b1Hist = await invStaff('GET', `/bottles/${b1Id}/history?page=1&pageSize=20`);
    expect(b1Hist.statusCode, b1Hist.body).toBe(200);
    const b1Body = b1Hist.json<{ items: AuditEntryDto[]; meta: { total: number } }>();
    expect(b1Body.meta.total).toBe(6);
    expect(b1Body.items.map((item) => item.action)).toEqual(
      expect.arrayContaining([
        'inv.bottle.registered',
        'inv.bottle.installed',
        'inv.inventory.adjusted',
        'inv.bottle.removed',
        'inv.bottle.damaged',
      ]),
    );

    const b1Page2 = await invStaff('GET', `/bottles/${b1Id}/history?page=2&pageSize=2`);
    expect(b1Page2.statusCode).toBe(200);
    expect(b1Page2.json<{ items: AuditEntryDto[]; meta: { total: number } }>()).toMatchObject({
      meta: { total: 6 },
    });
    expect(b1Page2.json<{ items: AuditEntryDto[] }>().items).toHaveLength(2);

    // Kiểm tra lịch sử b2 (có sự kiện thanh lý slt.bottle.liquidated)
    const b2Hist = await invStaff('GET', `/bottles/${b2Id}/history`);
    expect(b2Hist.statusCode, b2Hist.body).toBe(200);
    expect(b2Hist.json<{ items: AuditEntryDto[] }>().items.map((i) => i.action)).toEqual(
      expect.arrayContaining(['inv.bottle.registered', 'inv.bottle.installed', 'slt.bottle.liquidated']),
    );

    // Cô lập dữ liệu (FR-AUTH-07): Brand A xem được chai của A; Brand B nhận 403 FORBIDDEN_SCOPE; ID lạ -> 404
    const byOwnerBrand = await brandA('GET', `/bottles/${b1Id}/history`);
    expect(byOwnerBrand.statusCode).toBe(200);

    const byOtherBrand = await brandB('GET', `/bottles/${b1Id}/history`);
    expect(byOtherBrand.statusCode).toBe(403);
    expect(byOtherBrand.json()).toMatchObject({ code: 'FORBIDDEN_SCOPE' });

    const missingBottle = await invStaff('GET', `/bottles/${randomUUID()}/history`);
    expect(missingBottle.statusCode).toBe(404);
    expect(missingBottle.json()).toMatchObject({ code: 'NOT_FOUND' });
  });
});
