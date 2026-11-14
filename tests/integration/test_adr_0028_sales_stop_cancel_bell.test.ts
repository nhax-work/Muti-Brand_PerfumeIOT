/**
 * ADR-0028 trên PostgreSQL thật:
 *   - máy đang dừng bán (FR-MCH-19): cùng luật với kiosk — banner báo dừng khi và chỉ khi kiosk từ
 *     chối đơn; Brand Admin chỉ thấy máy có slot mình thuê, không thấy ai mở phiếu nạp;
 *   - hủy phiếu nạp (FR-INV-37): bắt lý do, máy bán lại ngay, yêu cầu bổ sung được gỡ khỏi phiếu;
 *   - chuông thông báo (FR-ALR-17): đếm và đánh dấu đã đọc chỉ thông báo của chính người gọi.
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
let inventoryStaff: PlatformStaff;
let brandA: ReturnType<typeof asUser>;
let brandB: ReturnType<typeof asUser>;
let superAdmin: ReturnType<typeof asUser>;
let staff: ReturnType<typeof asUser>;
let brandAdminAId: string;

interface SalesStop {
  machineId: string;
  reason: string;
  since: string | null;
  refillSession?: { id: string; slotNumber: number; performedByName: string };
}

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  inventoryStaff = await seedPlatformStaff(client, fx, 'INVENTORY_STAFF', ['inventory.manage']);
  app = await createTestApp();
  brandA = asUser(app, (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken);
  brandB = asUser(app, (await login(app, fx.brandAdminBEmail, TEST_PASSWORD)).accessToken);
  superAdmin = asUser(app, (await login(app, fx.superAdminEmail, TEST_PASSWORD)).accessToken);
  staff = asUser(app, (await login(app, inventoryStaff.email, TEST_PASSWORD)).accessToken);
  const user = await client.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [
    fx.brandAdminAEmail,
  ]);
  brandAdminAId = user.rows[0]!.id;
}, 60_000);

afterEach(async () => {
  await releaseOpenOrders(client, fx.machineId);
  await client.query(
    `UPDATE refill_sessions SET status = 'CANCELLED', completed_at = now()
      WHERE machine_id = $1 AND status = 'STARTED'`,
    [fx.machineId],
  );
  await client.query(
    `UPDATE machines SET status = 'ONLINE', operating_mode = 'NORMAL' WHERE id = $1`,
    [fx.machineId],
  );
});

afterAll(async () => {
  // Đơn kiosk do test tạo có lịch sử trạng thái, thanh toán — dọn trước fixture.
  await kioskFlow(app, client, fx).cleanup();
  await cleanupIsolationFixture(client, fx);
  await inventoryStaff.cleanup();
  await app.close();
  await client.end();
});

async function stopsOf(as: ReturnType<typeof asUser>): Promise<SalesStop[]> {
  const res = await as('GET', '/machine-sales-stops');
  expect(res.statusCode, res.body).toBe(200);
  return res.json<{ items: SalesStop[] }>().items;
}

async function fixtureStop(as: ReturnType<typeof asUser>): Promise<SalesStop | undefined> {
  return (await stopsOf(as)).find((s) => s.machineId === fx.machineId);
}

function kioskOrder(slotIndex: number) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/kiosk/orders',
    headers: { 'idempotency-key': randomUUID() },
    payload: { machineSerial: fx.machineSerial, slotId: fx.slots[slotIndex] },
  });
}

async function openRefill(slotIndex: number): Promise<string> {
  const res = await staff('POST', '/refill-sessions', { payload: { slotId: fx.slots[slotIndex] } });
  expect(res.statusCode, res.body).toBe(201);
  return res.json<{ id: string }>().id;
}

describe('Máy đang dừng bán (FR-MCH-19, ADR-0028)', () => {
  it('test_FR_MCH_19_normal_machine_not_listed — máy đang bán không có trong danh sách', async () => {
    expect(await fixtureStop(staff)).toBeUndefined();
    const order = await kioskOrder(0);
    expect(order.statusCode, order.body).toBe(201);
  });

  it('test_FR_MCH_19_refill_session_matches_kiosk — phiếu nạp mở: banner báo dừng, kiosk cũng từ chối', async () => {
    const sessionId = await openRefill(0);
    const stop = await fixtureStop(staff);
    expect(stop).toMatchObject({
      reason: 'REFILL_SESSION',
      refillSession: { id: sessionId, slotNumber: 1 },
    });
    expect(stop!.since).not.toBeNull();
    expect(stop!.refillSession!.performedByName.length).toBeGreaterThan(0);

    const order = await kioskOrder(2);
    expect(order.statusCode).toBe(409);
    expect(order.json()).toMatchObject({ code: 'MACHINE_IN_MAINTENANCE' });
  });

  it('test_FR_MCH_19_brand_scope — Brand Admin chỉ thấy máy có slot mình thuê, không thấy ai mở phiếu', async () => {
    await openRefill(0);
    const forA = await stopsOf(brandA);
    expect(forA.every((s) => s.machineId === fx.machineId)).toBe(true);
    const stop = forA.find((s) => s.machineId === fx.machineId);
    expect(stop).toMatchObject({ reason: 'REFILL_SESSION' });
    expect(stop).not.toHaveProperty('refillSession');
  });

  it('test_FR_MCH_19_reason_precedence — mất kết nối đứng trước chế độ, chế độ đứng trước phiếu nạp', async () => {
    await openRefill(0);
    await client.query(`UPDATE machines SET operating_mode = 'DRAINING' WHERE id = $1`, [
      fx.machineId,
    ]);
    expect((await fixtureStop(superAdmin))?.reason).toBe('DRAINING');
    await client.query(`UPDATE machines SET status = 'OFFLINE' WHERE id = $1`, [fx.machineId]);
    expect((await fixtureStop(superAdmin))?.reason).toBe('OFFLINE');
  });
});

describe('Hủy phiếu nạp (FR-INV-37, ADR-0028)', () => {
  it('test_FR_INV_37_cancel_requires_reason_and_permission — thiếu lý do 400, Brand Admin 403', async () => {
    const sessionId = await openRefill(0);
    const blank = await staff('POST', `/refill-sessions/${sessionId}/cancel`, {
      payload: { reason: '   ' },
    });
    expect(blank.statusCode).toBe(400);
    expect(blank.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    const asBrand = await brandA('POST', `/refill-sessions/${sessionId}/cancel`, {
      payload: { reason: 'Thử' },
    });
    expect(asBrand.statusCode).toBe(403);
  });

  it('test_FR_INV_37_cancel_resumes_sales — hủy phiếu: CANCELLED, giữ chai cũ, máy bán lại ngay', async () => {
    const before = await client.query<{ active_bottle_id: string }>(
      `SELECT active_bottle_id FROM machine_slots WHERE id = $1`,
      [fx.slots[0]],
    );
    const sessionId = await openRefill(0);
    const res = await staff('POST', `/refill-sessions/${sessionId}/cancel`, {
      payload: { reason: 'Mở nhầm slot' },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ status: 'CANCELLED', notes: 'Mở nhầm slot' });

    const after = await client.query(`SELECT active_bottle_id FROM machine_slots WHERE id = $1`, [
      fx.slots[0],
    ]);
    expect(after.rows[0]).toEqual(before.rows[0]);
    expect(await fixtureStop(staff)).toBeUndefined();
    const order = await kioskOrder(0);
    expect(order.statusCode, order.body).toBe(201);

    const again = await staff('POST', `/refill-sessions/${sessionId}/cancel`, {
      payload: { reason: 'Lần hai' },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ code: 'REFILL_SESSION_NOT_OPEN' });
  });

  it('test_FR_INV_37_cancel_unlinks_refill_request — yêu cầu bổ sung gỡ khỏi phiếu hủy, gắn lại được phiếu sau', async () => {
    const created = await brandA('POST', '/refill-requests', {
      payload: {
        slotRentalId: fx.rentals[1],
        slotId: fx.slots[1],
        fragranceProductId: fx.products[1],
        reason: 'LOW_STOCK',
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const requestId = created.json<{ id: string }>().id;
    await client.query(`UPDATE refill_requests SET status = 'ACCEPTED' WHERE id = $1`, [requestId]);

    const first = await staff('POST', '/refill-sessions', {
      payload: { slotId: fx.slots[1], refillRequestId: requestId },
    });
    expect(first.statusCode, first.body).toBe(201);
    const cancelled = await staff(
      'POST',
      `/refill-sessions/${first.json<{ id: string }>().id}/cancel`,
      {
        payload: { reason: 'Không có chai đúng sản phẩm' },
      },
    );
    expect(cancelled.statusCode, cancelled.body).toBe(200);

    const request = await client.query(
      `SELECT status, refill_session_id FROM refill_requests WHERE id = $1`,
      [requestId],
    );
    expect(request.rows[0]).toEqual({ status: 'ACCEPTED', refill_session_id: null });

    const second = await staff('POST', '/refill-sessions', {
      payload: { slotId: fx.slots[1], refillRequestId: requestId },
    });
    expect(second.statusCode, second.body).toBe(201);
  });
});

describe('Chuông thông báo (FR-ALR-17, ADR-0028)', () => {
  async function notify(recipient: string, channel: 'IN_APP' | 'EMAIL'): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO notifications (id, brand_id, recipient_user_id, type, channel, content, status, sent_at)
       VALUES ($1, $2, $3, 'TEST_BELL', $4, 'Nội dung', 'SENT', now())`,
      [id, fx.brandA, recipient, channel],
    );
    return id;
  }

  async function unread(as: ReturnType<typeof asUser>): Promise<number> {
    const res = await as('GET', '/notifications/unread-count');
    expect(res.statusCode, res.body).toBe(200);
    return res.json<{ unread: number }>().unread;
  }

  it('test_FR_ALR_17_unread_count_and_mark_read — chỉ đếm IN_APP của mình; đọc từng cái rồi đọc hết', async () => {
    const start = await unread(brandA);
    const first = await notify(brandAdminAId, 'IN_APP');
    await notify(brandAdminAId, 'IN_APP');
    await notify(brandAdminAId, 'EMAIL');
    expect(await unread(brandA)).toBe(start + 2);

    // Người khác — kể cả Super Admin thấy được mọi thông báo — không đánh dấu hộ được.
    expect((await brandB('POST', `/notifications/${first}/read`)).statusCode).toBe(404);
    expect((await superAdmin('POST', `/notifications/${first}/read`)).statusCode).toBe(404);

    const read = await brandA('POST', `/notifications/${first}/read`);
    expect(read.statusCode, read.body).toBe(200);
    expect(read.json()).toMatchObject({ id: first, status: 'READ' });
    const firstReadAt = read.json<{ readAt: string }>().readAt;
    expect(await unread(brandA)).toBe(start + 1);

    // Đọc lại giữ thời điểm đọc đầu tiên.
    const reread = await brandA('POST', `/notifications/${first}/read`);
    expect(reread.json<{ readAt: string }>().readAt).toBe(firstReadAt);

    const all = await brandA('POST', '/notifications/read-all');
    expect(all.statusCode, all.body).toBe(200);
    expect(await unread(brandA)).toBe(0);
  });

  it('test_FR_ALR_17_mine_filter_for_auditor — Super Admin xem chuông chỉ thấy thông báo của mình', async () => {
    await notify(brandAdminAId, 'IN_APP');
    const all = await superAdmin('GET', '/notifications?pageSize=200');
    const mine = await superAdmin('GET', '/notifications?mine=true&pageSize=200');
    expect(mine.statusCode, mine.body).toBe(200);
    const superId = (
      await client.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [
        fx.superAdminEmail,
      ])
    ).rows[0]!.id;
    const mineItems = mine.json<{ items: { recipientUserId: string }[] }>().items;
    expect(mineItems.every((n) => n.recipientUserId === superId)).toBe(true);
    expect(
      all
        .json<{ items: { recipientUserId: string }[] }>()
        .items.some((n) => n.recipientUserId === brandAdminAId),
    ).toBe(true);
  });
});
