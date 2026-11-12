/**
 * Yêu cầu bổ sung nước hoa trên PostgreSQL thật (FR-RFQ-01 ÷ 12, ADR-0018):
 *   - thương hiệu tạo yêu cầu cho slot mình đang thuê, lý do trong danh mục, mỗi slot một yêu cầu mở;
 *   - nhân sự nền tảng chấp nhận / từ chối / lên lịch / hủy; trạng thái kết thúc không đổi được nữa;
 *   - phiếu nạp mở kèm `refillRequestId` thì liên kết, đóng phiếu thì yêu cầu COMPLETED — cùng
 *     transaction; CSDL chặn COMPLETED khi chưa liên kết phiếu;
 *   - cô lập dữ liệu theo thương hiệu; Brand Admin không đụng được phiếu nạp.
 */

import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestApp, login } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import {
  cleanupIsolationFixture,
  releaseOpenOrders,
  seedIsolationFixture,
  seedPlatformStaff,
  TEST_PASSWORD,
  type IsolationFixture,
  type PlatformStaff,
} from './helpers/seed-isolation.js';

interface RefillRequest {
  id: string;
  brandId: string;
  brandName: string;
  slotRentalId: string;
  slotId: string;
  slotNumber: number;
  machineId: string;
  machineSerial: string;
  fragranceProductId: string;
  productName: string;
  reason: string;
  status: string;
  requestedBy: string;
  reviewedBy: string | null;
  rejectionReason: string | null;
  scheduledAt: string | null;
  refillSessionId: string | null;
  note: string | null;
}

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let inventoryStaff: PlatformStaff;
let staff: ReturnType<typeof asUser>;
let superAdmin: ReturnType<typeof asUser>;
let brandA: ReturnType<typeof asUser>;
let brandB: ReturnType<typeof asUser>;
let brandAdminAId: string;
let batchA: string;

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  inventoryStaff = await seedPlatformStaff(client, fx, 'INVENTORY_STAFF', [
    'inventory.manage',
    'refill.fulfill',
  ]);
  app = await createTestApp();
  staff = asUser(app, (await login(app, inventoryStaff.email, TEST_PASSWORD)).accessToken);
  superAdmin = asUser(app, (await login(app, fx.superAdminEmail, TEST_PASSWORD)).accessToken);
  brandA = asUser(app, (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken);
  brandB = asUser(app, (await login(app, fx.brandAdminBEmail, TEST_PASSWORD)).accessToken);
  const admin = await client.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [
    fx.brandAdminAEmail,
  ]);
  brandAdminAId = admin.rows[0]!.id;
  const batch = await client.query<{ id: string }>(
    `SELECT id FROM inventory_batches WHERE brand_id = $1 AND fragrance_product_id = $2`,
    [fx.brandA, fx.products[0]],
  );
  batchA = batch.rows[0]!.id;
  // Lắp chai cần lô đã duyệt giấy tờ chính hãng (FR-INV-35) — điều kiện của INV, không phải RFQ.
  await client.query(
    `UPDATE inventory_batches
        SET authenticity_status = 'APPROVED', authenticity_document_url = 'https://docs.test/lo.pdf',
            authenticity_submitted_by = $2, authenticity_submitted_at = now(),
            authenticity_verified_by = $2, authenticity_verified_at = now()
      WHERE id = $1`,
    [batchA, fx.superAdminId],
  );
}, 60_000);

afterEach(async () => {
  await releaseOpenOrders(client, fx.machineId);
  await client.query(
    `UPDATE refill_sessions SET status = 'CANCELLED', completed_at = now()
      WHERE machine_id = $1 AND status = 'STARTED'`,
    [fx.machineId],
  );
  await client.query(`DELETE FROM refill_requests WHERE brand_id = ANY($1::uuid[])`, [
    [fx.brandA, fx.brandB],
  ]);
});

afterAll(async () => {
  // Fixture trước: phiếu nạp trỏ tới tài khoản Inventory Staff (performed_by).
  await cleanupIsolationFixture(client, fx);
  await inventoryStaff.cleanup();
  await client.end();
  await app.close();
});

function create(
  rentalIndex: number,
  reason: unknown = 'LOW_STOCK',
  as: ReturnType<typeof asUser> = brandA,
) {
  return as('POST', '/refill-requests', {
    payload: { slotRentalId: fx.rentals[rentalIndex], reason, note: '  Còn khoảng 10%  ' },
  });
}

async function createOk(rentalIndex: number, as = brandA): Promise<RefillRequest> {
  const res = await create(rentalIndex, 'LOW_STOCK', as);
  expect(res.statusCode, res.body).toBe(201);
  return res.json<RefillRequest>();
}

function act(id: string, action: string, payload?: Record<string, unknown>, as = staff) {
  return as('POST', `/refill-requests/${id}/${action}`, payload ? { payload } : {});
}

async function actOk(id: string, action: string, payload?: Record<string, unknown>) {
  const res = await act(id, action, payload);
  expect(res.statusCode, res.body).toBe(200);
  return res.json<RefillRequest>();
}

const tomorrow = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString();

describe('Tạo yêu cầu bổ sung (FR-RFQ-01, 02, 05, 12)', () => {
  it('test_FR_RFQ_01_create_refill_request — slot đang thuê: SUBMITTED, người gửi, slot và sản phẩm suy từ hóa đơn', async () => {
    const request = await createOk(0);
    expect(request).toMatchObject({
      brandId: fx.brandA,
      slotRentalId: fx.rentals[0],
      slotId: fx.slots[0],
      slotNumber: 1,
      machineId: fx.machineId,
      machineSerial: fx.machineSerial,
      fragranceProductId: fx.products[0],
      reason: 'LOW_STOCK',
      status: 'SUBMITTED',
      requestedBy: brandAdminAId,
      note: 'Còn khoảng 10%',
    });
  });

  it('test_FR_RFQ_01_create_refill_request — hóa đơn của thương hiệu khác thì FORBIDDEN_SCOPE (AC2)', async () => {
    const res = await create(2);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'FORBIDDEN_SCOPE' });
  });

  it('test_FR_RFQ_01_create_refill_request — hóa đơn không cho nạp (đã thanh lý, chưa thanh toán) thì RENTAL_NOT_ACTIVE (AC3)', async () => {
    const liquidated = await create(4);
    expect(liquidated.statusCode).toBe(409);
    expect(liquidated.json()).toMatchObject({ code: 'RENTAL_NOT_ACTIVE' });

    await client.query(
      `UPDATE slot_rentals SET status = 'CANCELLED', cancelled_at = now() WHERE id = $1`,
      [fx.rentals[1]],
    );
    try {
      const cancelled = await create(1);
      expect(cancelled.statusCode).toBe(409);
      expect(cancelled.json()).toMatchObject({ code: 'RENTAL_NOT_ACTIVE' });
    } finally {
      await client.query(
        `UPDATE slot_rentals SET status = 'ACTIVE', cancelled_at = NULL WHERE id = $1`,
        [fx.rentals[1]],
      );
    }
  });

  it('test_FR_RFQ_01_create_refill_request — tài khoản nền tảng không gửi thay thương hiệu', async () => {
    const res = await create(0, 'LOW_STOCK', superAdmin);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'FORBIDDEN_SCOPE' });
  });

  it('test_FR_RFQ_02_require_valid_reason — lý do trong danh mục được lưu; thiếu hoặc sai lý do thì VALIDATION_ERROR', async () => {
    const missing = await brandA('POST', '/refill-requests', {
      payload: { slotRentalId: fx.rentals[0] },
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    const wrong = await create(0, 'OUT_OF_MOOD');
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

    for (const [index, reason] of [
      [0, 'LOW_STOCK'],
      [1, 'PRODUCT_CHANGE'],
    ] as const) {
      const res = await create(index, reason);
      expect(res.statusCode, res.body).toBe(201);
      const row = await client.query(`SELECT reason FROM refill_requests WHERE id = $1`, [
        res.json<RefillRequest>().id,
      ]);
      expect(row.rows[0]).toMatchObject({ reason });
    }
    const expiring = await create(3, 'EXPIRING', brandB);
    expect(expiring.statusCode, expiring.body).toBe(201);
  });

  it('test_FR_RFQ_05_notify_staff_on_new_request — Super Admin và Inventory Staff nhận thông báo kèm máy, slot, thương hiệu', async () => {
    const request = await createOk(0);
    const notes = await client.query<{ recipient_user_id: string; subject: string }>(
      `SELECT recipient_user_id, subject FROM notifications
        WHERE type = 'REFILL_REQUEST_SUBMITTED' AND reference_id = $1`,
      [request.id],
    );
    const recipients = notes.rows.map((r) => r.recipient_user_id);
    expect(recipients).toEqual(expect.arrayContaining([fx.superAdminId, inventoryStaff.userId]));
    expect(recipients).not.toContain(brandAdminAId);
    for (const note of notes.rows) {
      expect(note.subject).toContain(fx.machineSerial);
      expect(note.subject).toContain('slot 1');
      expect(note.subject).toContain(request.brandName);
    }
  });

  it('test_FR_RFQ_12_prevent_duplicate_open_refill_request — slot còn yêu cầu mở thì REFILL_REQUEST_PENDING; yêu cầu cũ đóng rồi thì tạo được', async () => {
    const first = await createOk(0);
    const duplicate = await create(0);
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({ code: 'REFILL_REQUEST_PENDING' });

    await actOk(first.id, 'reject', { reason: 'Kho tạm hết chai dự phòng' });
    await createOk(0);
  });

  it('test_FR_RFQ_12_prevent_duplicate_open_refill_request — hai lần gửi đồng thời: đúng một yêu cầu được tạo', async () => {
    const results = await Promise.all([create(1), create(1), create(1)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409, 409]);
    const rows = await client.query(
      `SELECT 1 FROM refill_requests WHERE slot_id = $1 AND status = 'SUBMITTED'`,
      [fx.slots[1]],
    );
    expect(rows.rowCount).toBe(1);
  });
});

describe('Gợi ý tạo yêu cầu khi sắp hết (FR-RFQ-03)', () => {
  it('test_FR_RFQ_03_suggest_refill_on_low_stock — sơ đồ máy gắn lowStock cho slot của mình chạm ngưỡng hoặc chai LOW', async () => {
    try {
      // Slot 1 còn 3 ml, ngưỡng 5 ml; slot 2 chai sang LOW; slot 3 (của B) cũng chạm ngưỡng.
      await client.query(
        `UPDATE machine_slots SET estimated_remaining_ml = 3 WHERE id = ANY($1::uuid[])`,
        [[fx.slots[0], fx.slots[2]]],
      );
      const res = await brandA('GET', `/reports/machine-map/${fx.machineId}`);
      expect(res.statusCode).toBe(200);
      const map = res.json<{ slotNumber: number; lowStock?: boolean }[]>();
      expect(map.find((m) => m.slotNumber === 1)?.lowStock).toBe(true);
      expect(map.find((m) => m.slotNumber === 2)?.lowStock).toBe(false);
      // Slot của B không lộ cờ nào (BR-012).
      expect(map.find((m) => m.slotNumber === 3)).not.toHaveProperty('lowStock');

      await client.query(`UPDATE bottles SET status = 'LOW' WHERE id = $1`, [fx.bottles[1]]);
      const after = await brandA('GET', `/reports/machine-map/${fx.machineId}`);
      expect(
        after.json<{ slotNumber: number; lowStock?: boolean }[]>().find((m) => m.slotNumber === 2)
          ?.lowStock,
      ).toBe(true);
    } finally {
      await client.query(
        `UPDATE machine_slots SET estimated_remaining_ml = 48 WHERE id = ANY($1::uuid[])`,
        [[fx.slots[0], fx.slots[2]]],
      );
      await client.query(`UPDATE bottles SET status = 'INSTALLED' WHERE id = $1`, [fx.bottles[1]]);
    }
  });
});

describe('Duyệt, lên lịch, hủy (FR-RFQ-04, 06, 07)', () => {
  it('test_FR_RFQ_06_review_refill_request — chấp nhận ghi người duyệt và AuditLog', async () => {
    const request = await createOk(0);
    const accepted = await actOk(request.id, 'accept');
    expect(accepted).toMatchObject({ status: 'ACCEPTED', reviewedBy: inventoryStaff.userId });
    const log = await client.query(
      `SELECT 1 FROM audit_logs WHERE action = 'rfq.request.accepted' AND target_id = $1`,
      [request.id],
    );
    expect(log.rowCount).toBe(1);
    // Brand Admin được báo tiến trình (FR-RFQ-10).
    const notes = await client.query(
      `SELECT 1 FROM notifications WHERE recipient_user_id = $1 AND reference_id = $2
          AND type = 'REFILL_REQUEST_ACCEPTED'`,
      [brandAdminAId, request.id],
    );
    expect(notes.rowCount).toBe(1);
  });

  it('test_FR_RFQ_06_review_refill_request — từ chối lưu lý do; lý do rỗng hoặc chỉ khoảng trắng thì VALIDATION_ERROR', async () => {
    const request = await createOk(0);
    for (const payload of [{}, { reason: '   ' }]) {
      const res = await act(request.id, 'reject', payload);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    const rejected = await actOk(request.id, 'reject', {
      reason: 'Kho tạm hết chai dự phòng cho sản phẩm này',
    });
    expect(rejected).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Kho tạm hết chai dự phòng cho sản phẩm này',
      reviewedBy: inventoryStaff.userId,
    });
  });

  it('test_FR_RFQ_06_review_refill_request — Brand Admin không duyệt được (FORBIDDEN_SCOPE)', async () => {
    const request = await createOk(0);
    for (const action of ['accept', 'reject', 'schedule', 'cancel']) {
      const res = await act(request.id, action, { reason: 'x', scheduledAt: tomorrow() }, brandA);
      expect(res.statusCode, action).toBe(403);
      expect(res.json()).toMatchObject({ code: 'FORBIDDEN_SCOPE' });
    }
  });

  it('test_FR_RFQ_07_schedule_refill_request — ACCEPTED lên lịch sang SCHEDULED; mốc ở quá khứ bị từ chối', async () => {
    const request = await createOk(0);
    // Chưa chấp nhận thì không lên lịch được.
    const early = await act(request.id, 'schedule', { scheduledAt: tomorrow() });
    expect(early.statusCode).toBe(400);
    await actOk(request.id, 'accept');

    const past = await act(request.id, 'schedule', { scheduledAt: '2020-01-01T00:00:00Z' });
    expect(past.statusCode).toBe(400);
    expect(past.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

    const at = tomorrow();
    const scheduled = await actOk(request.id, 'schedule', { scheduledAt: at });
    expect(scheduled).toMatchObject({ status: 'SCHEDULED' });
    expect(new Date(scheduled.scheduledAt!).toISOString()).toBe(at);
  });

  it('test_FR_RFQ_04_status_transitions — chỉ đi đúng đường; trạng thái kết thúc không đổi được nữa', async () => {
    const request = await createOk(0);
    // SUBMITTED không hủy, không lên lịch được.
    expect((await act(request.id, 'cancel')).statusCode).toBe(400);
    await actOk(request.id, 'accept');
    expect((await act(request.id, 'accept')).statusCode).toBe(400);
    expect((await act(request.id, 'reject', { reason: 'muộn' })).statusCode).toBe(400);
    await actOk(request.id, 'schedule', { scheduledAt: tomorrow() });
    const cancelled = await actOk(request.id, 'cancel');
    expect(cancelled.status).toBe('CANCELLED');

    for (const [action, payload] of [
      ['accept', undefined],
      ['reject', { reason: 'x' }],
      ['schedule', { scheduledAt: tomorrow() }],
      ['cancel', undefined],
    ] as const) {
      const res = await act(request.id, action, payload);
      expect(res.statusCode, action).toBe(400);
      expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    const row = await client.query(`SELECT status FROM refill_requests WHERE id = $1`, [
      request.id,
    ]);
    expect(row.rows[0]).toMatchObject({ status: 'CANCELLED' });
  });
});

describe('Liên kết phiếu nạp (FR-RFQ-08, 09, 11)', () => {
  async function spareBottle(): Promise<string> {
    const res = await staff('POST', '/bottles', {
      payload: {
        batchId: batchA,
        identifier: `RFQ-${randomUUID().slice(0, 8)}`,
        initialVolumeMl: 50,
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<{ id: string }>().id;
  }

  it('test_FR_RFQ_08_link_refill_session — mở phiếu nạp kèm yêu cầu thì liên kết; yêu cầu sai slot hoặc chưa duyệt bị từ chối', async () => {
    const request = await createOk(0);

    // Chưa chấp nhận: không liên kết được, phiếu cũng không được mở.
    const notAccepted = await staff('POST', '/refill-sessions', {
      payload: { slotId: fx.slots[0], refillRequestId: request.id },
    });
    expect(notAccepted.statusCode).toBe(400);
    expect(notAccepted.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    const sessions = await client.query(
      `SELECT 1 FROM refill_sessions WHERE slot_id = $1 AND status = 'STARTED'`,
      [fx.slots[0]],
    );
    expect(sessions.rowCount).toBe(0);

    await actOk(request.id, 'accept');
    const wrongSlot = await staff('POST', '/refill-sessions', {
      payload: { slotId: fx.slots[1], refillRequestId: request.id },
    });
    expect(wrongSlot.statusCode).toBe(400);

    const opened = await staff('POST', '/refill-sessions', {
      payload: { slotId: fx.slots[0], refillRequestId: request.id },
    });
    expect(opened.statusCode, opened.body).toBe(201);
    const session = opened.json<{ id: string }>();
    const row = await client.query(`SELECT refill_session_id FROM refill_requests WHERE id = $1`, [
      request.id,
    ]);
    expect(row.rows[0]).toMatchObject({ refill_session_id: session.id });

    // Yêu cầu đang gắn phiếu mở thì không hủy được.
    const cancel = await act(request.id, 'cancel');
    expect(cancel.statusCode).toBe(400);
  });

  it('test_FR_RFQ_09_complete_on_session_completion — đóng phiếu nạp liên kết thì yêu cầu COMPLETED', async () => {
    const request = await createOk(0);
    await actOk(request.id, 'accept');
    await actOk(request.id, 'schedule', { scheduledAt: tomorrow() });
    const opened = await staff('POST', '/refill-sessions', {
      payload: { slotId: fx.slots[0], refillRequestId: request.id },
    });
    expect(opened.statusCode, opened.body).toBe(201);
    const sessionId = opened.json<{ id: string }>().id;

    const closed = await staff('POST', `/refill-sessions/${sessionId}/close`, {
      payload: { newBottleId: await spareBottle(), checklistCompleted: true },
    });
    expect(closed.statusCode, closed.body).toBe(200);

    const list = await brandA('GET', '/refill-requests');
    expect(list.json<{ items: RefillRequest[] }>().items[0]).toMatchObject({
      id: request.id,
      status: 'COMPLETED',
      refillSessionId: sessionId,
    });
    const log = await client.query(
      `SELECT 1 FROM audit_logs WHERE action = 'rfq.request.completed' AND target_id = $1`,
      [request.id],
    );
    expect(log.rowCount).toBe(1);
  });

  it('test_FR_RFQ_09_complete_on_session_completion — CSDL chặn COMPLETED khi chưa liên kết phiếu nạp (AC2)', async () => {
    const request = await createOk(0);
    await expect(
      client.query(`UPDATE refill_requests SET status = 'COMPLETED' WHERE id = $1`, [request.id]),
    ).rejects.toMatchObject({ constraint: 'chk_refill_request_completed_has_session' });
  });

  it('test_FR_RFQ_11_brand_admin_cannot_touch_refill_sessions — Brand Admin mở/đóng phiếu nạp bị FORBIDDEN_SCOPE', async () => {
    const opened = await brandA('POST', '/refill-sessions', { payload: { slotId: fx.slots[0] } });
    expect(opened.statusCode).toBe(403);
    expect(opened.json()).toMatchObject({ code: 'FORBIDDEN_SCOPE' });

    const session = await staff('POST', '/refill-sessions', { payload: { slotId: fx.slots[0] } });
    expect(session.statusCode, session.body).toBe(201);
    const closed = await brandA(
      'POST',
      `/refill-sessions/${session.json<{ id: string }>().id}/close`,
      {
        payload: { newBottleId: randomUUID(), checklistCompleted: true },
      },
    );
    expect(closed.statusCode).toBe(403);
    expect(closed.json()).toMatchObject({ code: 'FORBIDDEN_SCOPE' });
  });
});

describe('Theo dõi trạng thái và lịch sử (FR-RFQ-10)', () => {
  it('test_FR_RFQ_10_list_brand_refill_requests — mỗi thương hiệu chỉ thấy yêu cầu của mình, mới nhất trước, lọc theo trạng thái', async () => {
    const a1 = await createOk(0);
    const a2 = await createOk(1);
    await actOk(a1.id, 'accept');
    const b1 = await createOk(2, brandB);

    const aList = await brandA('GET', '/refill-requests');
    expect(aList.statusCode).toBe(200);
    const aBody = aList.json<{ items: RefillRequest[]; meta: { total: number } }>();
    expect(aBody.items.map((r) => r.id)).toEqual([a2.id, a1.id]);
    expect(aBody.meta.total).toBe(2);
    expect(aList.body).not.toContain(b1.id);
    for (const name of fx.brandBProductNames) expect(aList.body).not.toContain(name);

    const accepted = await brandA('GET', '/refill-requests?status=ACCEPTED');
    expect(accepted.json<{ items: RefillRequest[] }>().items.map((r) => r.id)).toEqual([a1.id]);

    const bList = await brandB('GET', '/refill-requests');
    expect(bList.json<{ items: RefillRequest[] }>().items.map((r) => r.id)).toEqual([b1.id]);

    const all = await superAdmin('GET', '/refill-requests?pageSize=50');
    const ids = all.json<{ items: RefillRequest[] }>().items.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([a1.id, a2.id, b1.id]));
  });
});
