/**
 * Bằng chứng camera an ninh độc lập với máy (ADR-0032): HTTP thật → guard → service → PostgreSQL
 * thật → kho riêng tư (thư mục tạm). Đi qua đúng cơ chế cần chứng minh: kiểm khoảng ghi theo khung
 * giờ của giao dịch, chặn người nạp tự nộp bằng chứng, đường dẫn ký có hạn, xóa theo hạn.
 */

import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileUrlKey } from '../../apps/api/src/modules/evd/evidence-rules.js';
import { EvdService } from '../../apps/api/src/modules/evd/index.js';
import {
  claimTokenFor,
  claimViewKeyFor,
} from '../../apps/api/src/modules/ord/refund-claims/claimability.js';
import {
  createTestApp,
  login,
  TEST_PRIVATE_MEDIA_DIR,
  TEST_REFUND_CLAIM_TOKEN_SECRET,
} from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import { fakeMp4, tinyJpeg, uploadEvidence } from './helpers/evidence.js';
import { kioskFlow } from './helpers/kiosk-flow.js';
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
let flow: ReturnType<typeof kioskFlow>;
let ops: PlatformStaff;
let ops2: PlatformStaff;
let inv: PlatformStaff;
let adminToken: string;
let opsToken: string;
let ops2Token: string;
let invToken: string;
let brandAToken: string;
let brandBToken: string;

/** Mỗi lần gửi khiếu nại một IP riêng — REFUND_CLAIM_RATE_LIMIT_PER_MIN tính theo IP. */
let ipSeq = 0;
const nextIp = () => `10.32.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  app = await createTestApp();
  flow = kioskFlow(app, client, fx);
  ops = await seedPlatformStaff(client, fx, 'OPERATIONS_STAFF', [
    'order.view',
    'order.refund',
    'machine.view',
    'machine.operate',
  ]);
  ops2 = await seedPlatformStaff(client, fx, 'OPERATIONS_STAFF', [
    'order.view',
    'order.refund',
    'machine.view',
    'machine.operate',
  ]);
  inv = await seedPlatformStaff(client, fx, 'INVENTORY_STAFF', [
    'inventory.manage',
    'machine.view',
    'refill.fulfill',
  ]);
  adminToken = (await login(app, fx.superAdminEmail, TEST_PASSWORD)).accessToken;
  opsToken = (await login(app, ops.email, TEST_PASSWORD)).accessToken;
  ops2Token = (await login(app, ops2.email, TEST_PASSWORD)).accessToken;
  invToken = (await login(app, inv.email, TEST_PASSWORD)).accessToken;
  brandAToken = (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken;
  brandBToken = (await login(app, fx.brandAdminBEmail, TEST_PASSWORD)).accessToken;
}, 60_000);

afterAll(async () => {
  // Bằng chứng trỏ tới phiếu và tới tài khoản nhân sự — xóa trước cả hai.
  await client.query(`DELETE FROM camera_evidence WHERE uploaded_by = ANY($1::uuid[])`, [
    [ops.userId, ops2.userId, inv.userId, fx.superAdminId],
  ]);
  await client.query(`DELETE FROM footage_requests WHERE brand_id = ANY($1::uuid[])`, [
    [fx.brandA, fx.brandB],
  ]);
  await client.query(
    `DELETE FROM refund_claims WHERE order_id IN (SELECT id FROM orders WHERE machine_id = $1)`,
    [fx.machineId],
  );
  await client.query(`DELETE FROM refill_sessions WHERE machine_id = $1`, [fx.machineId]);
  await client.query(`UPDATE machines SET camera_label = NULL WHERE id = $1`, [fx.machineId]);
  await ops.cleanup();
  await ops2.cleanup();
  await inv.cleanup();
  await flow.cleanup();
  await cleanupIsolationFixture(client, fx);
  await app.close();
  await client.end();
});

// -------------------------------------------------------------------------------------
// Tiện ích
// -------------------------------------------------------------------------------------

function call(
  token: string,
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { authorization: `Bearer ${token}` },
    ...(payload === undefined ? {} : { payload }),
  });
}

/** Phiếu khiếu nại của đơn đã trả tiền mà xịt thất bại, đã giao cho `ops`. */
async function openClaim(assign = true): Promise<{ id: string; code: string; orderId: string }> {
  const order = await flow.paidOrder(0);
  await client.query(
    `UPDATE orders SET status = 'FAILED', needs_manual_review = true, failure_code = 'ACTUATOR_FAULT'
      WHERE id = $1`,
    [order.id],
  );
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/refund-claims',
    remoteAddress: nextIp(),
    payload: {
      orderId: order.id,
      claimToken: claimTokenFor(TEST_REFUND_CLAIM_TOKEN_SECRET, order.id),
      contact: `khach.${randomUUID().slice(0, 6)}@test.local`,
      refundAccount: {
        bankBin: '970422',
        accountNumber: '0123456789',
        accountName: 'NGUYEN VAN A',
      },
      consent: true,
    },
  });
  expect(res.statusCode, res.body).toBe(201);
  const claim = res.json<{ id: string; code: string }>();
  if (assign) {
    const assigned = await call(adminToken, 'POST', `/refund-claims/${claim.id}/assign`, {
      assigneeId: ops.userId,
    });
    expect(assigned.statusCode, assigned.body).toBe(200);
  }
  return { ...claim, orderId: order.id };
}

async function windowOf(path: string, token = opsToken) {
  const res = await call(token, 'GET', `${path}/evidence-window`);
  expect(res.statusCode, res.body).toBe(200);
  return res.json<{ from: string; to: string; cameraLabel: string | null; machineName: string }>();
}

/** Phiếu nạp đã đóng trên slot của thương hiệu A (slot 1), do `performedBy` thực hiện. */
async function refillSession(performedBy: string, startedAgoMin = 30): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO refill_sessions (id, brand_id, machine_id, slot_id, performed_by, status,
                                  checklist_completed, started_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, 'COMPLETED', true,
             now() - make_interval(mins => $6), now() - make_interval(mins => $6) + interval '10 minutes')`,
    [id, fx.brandA, fx.machineId, fx.slots[0], performedBy, startedAgoMin],
  );
  return id;
}

async function attach(token: string, path: string, file: Buffer = fakeMp4()) {
  const window = await windowOf(path, token);
  return uploadEvidence(app, token, `${path}/evidence`, file, {
    recordedFrom: window.from,
    recordedTo: window.to,
  });
}

function getFile(url: string, headers: Record<string, string> = {}) {
  return app.inject({ method: 'GET', url: `/api/v1${url}`, headers });
}

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const plusSec = (iso: string, sec: number) => new Date(Date.parse(iso) + sec * 1000).toISOString();

// -------------------------------------------------------------------------------------

describe('Bằng chứng camera cho phiếu khiếu nại (FR-ORD-38)', () => {
  it('test_FR_ORD_38_assigned_staff_attaches_evidence_matching_transaction_time', async () => {
    const claim = await openClaim(false);
    const path = `/refund-claims/${claim.id}`;
    const window = await windowOf(path);
    expect(window.machineName).toBe(fx.machineDisplayName);
    const clip = fakeMp4(512);

    // Chưa được phân công → không gắn được.
    const notAssigned = await uploadEvidence(app, opsToken, `${path}/evidence`, clip, {
      recordedFrom: window.from,
      recordedTo: window.to,
    });
    expect(notAssigned.statusCode).toBe(403);
    expect(notAssigned.json()).toMatchObject({ code: 'CLAIM_NOT_ASSIGNED' });

    await call(adminToken, 'POST', `${path}/assign`, { assigneeId: ops.userId });

    // Hình ghi lúc khác (một giờ sau giao dịch) → không khớp khung giờ.
    const later = await uploadEvidence(app, opsToken, `${path}/evidence`, clip, {
      recordedFrom: plusSec(window.to, 3600),
      recordedTo: plusSec(window.to, 3660),
    });
    expect(later.statusCode).toBe(400);
    expect(later.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

    // Cùng đoạn đó nhưng đồng hồ camera chạy nhanh đúng một giờ → giờ thật khớp, nhận.
    const corrected = await uploadEvidence(app, opsToken, `${path}/evidence`, clip, {
      cameraLabel: 'Cam-03',
      recordedFrom: plusSec(window.from, 3600),
      recordedTo: plusSec(window.to, 3600),
      clockOffsetSec: 3600,
      note: 'Khách đứng trước máy, đèn nút 1 sáng rồi tắt',
    });
    expect(corrected.statusCode, corrected.body).toBe(201);
    const evidence = corrected.json<Record<string, unknown>>();
    expect(evidence).toMatchObject({
      kind: 'VIDEO',
      contentType: 'video/mp4',
      sizeBytes: clip.length,
      sha256: sha256(clip),
      cameraLabel: 'Cam-03',
      recordedFrom: window.from,
      recordedTo: window.to,
      clockOffsetSec: 3600,
      uploadedBy: ops.userId,
    });

    // Tệp lưu đúng nội dung đã gửi.
    const file = await getFile(evidence['url'] as string);
    expect(file.statusCode).toBe(200);
    expect(sha256(file.rawPayload)).toBe(sha256(clip));

    const audit = await client.query(
      `SELECT metadata FROM audit_logs WHERE action = 'evd.evidence.uploaded' AND target_id = $1`,
      [claim.id],
    );
    expect(audit.rows[0]?.metadata).toMatchObject({ sha256: sha256(clip), kind: 'VIDEO' });
  });

  it('test_FR_ORD_38_rejects_unsupported_files_and_reencodes_images', async () => {
    const claim = await openClaim();
    const path = `/refund-claims/${claim.id}`;

    const text = await attach(opsToken, path, Buffer.from('day khong phai video hay anh'));
    expect(text.statusCode).toBe(415);
    expect(text.json()).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });

    const jpeg = await tinyJpeg();
    expect(jpeg.includes('camera-test')).toBe(true);
    const image = await attach(opsToken, path, jpeg);
    expect(image.statusCode, image.body).toBe(201);
    const body = image.json<{ kind: string; contentType: string; url: string }>();
    expect(body).toMatchObject({ kind: 'IMAGE', contentType: 'image/webp' });

    // Ảnh lưu là WebP do máy chủ mã hóa lại — không còn EXIF của tệp gốc.
    const stored = await getFile(body.url);
    expect(stored.rawPayload.toString('ascii', 8, 12)).toBe('WEBP');
    expect(stored.rawPayload.includes('camera-test')).toBe(false);
  });

  it('test_FR_ORD_38_limit_removal_and_closed_claim', async () => {
    const claim = await openClaim();
    const path = `/refund-claims/${claim.id}`;
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await attach(opsToken, path);
      expect(res.statusCode, res.body).toBe(201);
      ids.push(res.json<{ id: string }>().id);
    }
    const sixth = await attach(opsToken, path);
    expect(sixth.statusCode).toBe(409);
    expect(sixth.json()).toMatchObject({ code: 'EVIDENCE_LIMIT_REACHED' });

    // Chỉ người đã tải mới gỡ được.
    const byOther = await call(ops2Token, 'POST', `/evidence/${ids[0]}/remove`, { reason: 'nhầm' });
    expect(byOther.statusCode).toBe(403);

    const list = await call(opsToken, 'GET', `${path}/evidence`);
    const oldUrl = list.json<{ items: { id: string; url: string }[] }>().items[0]!.url;
    const removed = await call(opsToken, 'POST', `/evidence/${ids[0]}/remove`, {
      reason: 'Tải nhầm đoạn của máy khác',
    });
    expect(removed.statusCode, removed.body).toBe(200);
    expect(removed.json()).toMatchObject({
      url: null,
      removedReason: 'Tải nhầm đoạn của máy khác',
    });
    // Tệp đã bị xóa khỏi kho, dòng còn lại kèm SHA-256.
    expect((await getFile(oldUrl)).statusCode).toBe(404);
    const row = await client.query(
      `SELECT storage_key, sha256, removed_at FROM camera_evidence WHERE id = $1`,
      [ids[0]],
    );
    expect(row.rows[0]).toMatchObject({ storage_key: null });
    expect(row.rows[0].sha256).toHaveLength(64);

    // Dòng đã gỡ vẫn tính vào giới hạn.
    expect((await attach(opsToken, path)).statusCode).toBe(409);

    // Đóng phiếu → không gỡ, không thêm được nữa.
    const rejected = await call(opsToken, 'POST', `${path}/reject`, {
      reason: 'Hình camera cho thấy khách đã nhận lượt xịt',
    });
    expect(rejected.statusCode, rejected.body).toBe(200);
    const late = await call(opsToken, 'POST', `/evidence/${ids[1]}/remove`, { reason: 'muộn' });
    expect(late.statusCode).toBe(409);
    expect(late.json()).toMatchObject({ code: 'EVIDENCE_TARGET_CLOSED' });
    const lateUpload = await attach(opsToken, path);
    expect(lateUpload.json()).toMatchObject({ code: 'EVIDENCE_TARGET_CLOSED' });
  });

  it('test_FR_ORD_38_reject_needs_evidence_for_not_received_claims', async () => {
    const claim = await openClaim();
    const res = await call(opsToken, 'POST', `/refund-claims/${claim.id}/reject`, {
      reason: 'Không đủ điều kiện',
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'EVIDENCE_REQUIRED' });
  });

  it('test_FR_ORD_38_evidence_files_purged_with_claim_contact', async () => {
    const claim = await openClaim();
    const uploaded = (await attach(opsToken, `/refund-claims/${claim.id}`)).json<{ id: string }>();
    await call(opsToken, 'POST', `/refund-claims/${claim.id}/reject`, { reason: 'Đã nhận lượt' });
    const before = await client.query<{ storage_key: string }>(
      `SELECT storage_key FROM camera_evidence WHERE id = $1`,
      [uploaded.id],
    );
    const filePath = join(TEST_PRIVATE_MEDIA_DIR, before.rows[0]!.storage_key);
    expect(existsSync(filePath)).toBe(true);

    // Dịch vụ tắt qua mốc giữ liên hệ (30 ngày sau khi đóng phiếu), bật lại.
    await client.query(
      `UPDATE refund_claims SET closed_at = now() - interval '31 days' WHERE id = $1`,
      [claim.id],
    );
    await app.get(EvdService).runMaintenance();

    const after = await client.query(
      `SELECT storage_key, purged_at, sha256 FROM camera_evidence WHERE id = $1`,
      [uploaded.id],
    );
    expect(after.rows[0]).toMatchObject({ storage_key: null });
    expect(after.rows[0].purged_at).not.toBeNull();
    expect(after.rows[0].sha256).toHaveLength(64);
    expect(existsSync(filePath)).toBe(false);
  });
});

describe('Khách xem bằng chứng của phiếu bị từ chối (FR-ORD-39)', () => {
  it('test_FR_ORD_39_customer_views_evidence_with_email_key_only_after_rejection', async () => {
    const claim = await openClaim();
    const clip = fakeMp4(1024);
    expect((await attach(opsToken, `/refund-claims/${claim.id}`, clip)).statusCode).toBe(201);
    const key = claimViewKeyFor(TEST_REFUND_CLAIM_TOKEN_SECRET, claim.id);
    const view = (k: string, ip: string) =>
      app.inject({
        method: 'GET',
        url: `/api/v1/public/refund-claims/${encodeURIComponent(claim.code)}/evidence?key=${encodeURIComponent(k)}`,
        remoteAddress: ip,
      });

    // Phiếu còn mở → chưa xem được, kể cả đúng khóa.
    expect((await view(key, '10.33.0.1')).statusCode).toBe(404);

    await call(opsToken, 'POST', `/refund-claims/${claim.id}/reject`, {
      reason: 'Hình camera cho thấy khách đã nhận lượt xịt',
    });
    // Chỉ biết mã khiếu nại (không có khóa trong email) → không xem được.
    expect((await view('khoa-doan-bua', '10.33.0.2')).statusCode).toBe(404);

    const res = await view(key, '10.33.0.3');
    expect(res.statusCode, res.body).toBe(200);
    const items = res.json<{ items: Record<string, unknown>[] }>().items;
    expect(items).toHaveLength(1);
    // Khách không thấy người tải, ghi chú nội bộ hay SHA-256.
    expect(Object.keys(items[0]!).sort()).toEqual(
      ['contentType', 'id', 'kind', 'recordedFrom', 'recordedTo', 'url', 'urlExpiresAt'].sort(),
    );

    const url = items[0]!['url'] as string;
    const file = await getFile(url);
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('video/mp4');
    expect(file.headers['cache-control']).toBe('private, no-store');
    expect(sha256(file.rawPayload)).toBe(sha256(clip));

    // Trình duyệt tua video bằng Range.
    const part = await getFile(url, { range: 'bytes=0-9' });
    expect(part.statusCode).toBe(206);
    expect(part.rawPayload).toHaveLength(10);
    expect(part.headers['content-range']).toBe(`bytes 0-9/${clip.length}`);

    // Sửa chữ ký hoặc đường dẫn hết hạn → không tải được.
    expect((await getFile(url.replace(/sig=.{4}/, 'sig=AAAA'))).statusCode).toBe(404);
    const id = items[0]!['id'] as string;
    const pastExp = Math.floor(Date.now() / 1000) - 10;
    const { createHmac } = await import('node:crypto');
    const sig = createHmac('sha256', fileUrlKey(process.env['JWT_SECRET']!))
      .update(`${id}:${pastExp}`)
      .digest('base64url');
    expect((await getFile(`/evidence-files/${id}?exp=${pastExp}&sig=${sig}`)).statusCode).toBe(404);

    // Mỗi lần khách xem có nhật ký, người xem ẩn danh.
    const audits = await client.query(
      `SELECT 1 FROM audit_logs WHERE action = 'evd.evidence.viewed' AND target_id = $1
         AND actor_type = 'ANONYMOUS'`,
      [claim.id],
    );
    expect(audits.rowCount).toBe(1);

    // Trang tra cứu báo phiếu có hình đối chiếu.
    const tracking = await app.inject({
      method: 'GET',
      url: `/api/v1/public/refund-claims/${encodeURIComponent(claim.code)}`,
      remoteAddress: '10.33.0.4',
    });
    expect(tracking.json()).toMatchObject({ hasEvidence: true });
  });
});

describe('Bằng chứng camera cho phiếu nạp (FR-INV-38)', () => {
  it('test_FR_INV_38_platform_staff_attach_but_never_the_performer', async () => {
    const byInv = await refillSession(inv.userId);
    const byOps = await refillSession(ops.userId);

    // Inventory Staff không có quyền gắn hay xem bằng chứng.
    const invUpload = await uploadEvidence(
      app,
      invToken,
      `/refill-sessions/${byInv}/evidence`,
      fakeMp4(),
      {
        recordedFrom: new Date().toISOString(),
        recordedTo: new Date(Date.now() + 1000).toISOString(),
      },
    );
    expect(invUpload.statusCode).toBe(403);
    expect((await call(invToken, 'GET', `/refill-sessions/${byInv}/evidence`)).statusCode).toBe(
      403,
    );

    // Người đã nạp không tự nộp bằng chứng cho phiếu của mình.
    const self = await attach(opsToken, `/refill-sessions/${byOps}`);
    expect(self.statusCode).toBe(403);
    expect(self.json()).toMatchObject({ code: 'EVIDENCE_SELF_REVIEW' });

    // Người khác làm được.
    expect((await attach(opsToken, `/refill-sessions/${byInv}`)).statusCode).toBe(201);
    expect((await attach(adminToken, `/refill-sessions/${byOps}`)).statusCode).toBe(201);

    // Khoảng ghi ngoài khung giờ của phiếu nạp.
    const window = await windowOf(`/refill-sessions/${byInv}`);
    const outside = await uploadEvidence(
      app,
      opsToken,
      `/refill-sessions/${byInv}/evidence`,
      fakeMp4(),
      {
        recordedFrom: plusSec(window.from, -7200),
        recordedTo: plusSec(window.from, -3600),
      },
    );
    expect(outside.statusCode).toBe(400);
  });

  it('test_FR_INV_38_brand_admin_views_only_own_refill_evidence', async () => {
    const session = await refillSession(inv.userId);
    expect((await attach(opsToken, `/refill-sessions/${session}`)).statusCode).toBe(201);

    const own = await call(brandAToken, 'GET', `/refill-sessions/${session}/evidence`);
    expect(own.statusCode, own.body).toBe(200);
    const items = own.json<{ items: { url: string | null }[]; maxItems: number }>();
    expect(items.items).toHaveLength(1);
    expect(items.items[0]!.url).toMatch(/^\/evidence-files\//);
    expect(items.maxItems).toBe(5);

    const other = await call(brandBToken, 'GET', `/refill-sessions/${session}/evidence`);
    expect(other.statusCode).toBe(403);
    expect(other.json()).toMatchObject({ code: 'FORBIDDEN_SCOPE' });

    // Brand Admin xem được nhưng không gắn được.
    const brandUpload = await uploadEvidence(
      app,
      brandAToken,
      `/refill-sessions/${session}/evidence`,
      fakeMp4(),
      {
        recordedFrom: new Date().toISOString(),
        recordedTo: new Date(Date.now() + 1000).toISOString(),
      },
    );
    expect(brandUpload.statusCode).toBe(403);
  });

  it('test_FR_INV_38_refill_evidence_purged_after_retention', async () => {
    const session = await refillSession(inv.userId);
    const uploaded = (await attach(opsToken, `/refill-sessions/${session}`)).json<{ id: string }>();
    await client.query(
      `UPDATE camera_evidence SET uploaded_at = now() - interval '91 days' WHERE id = $1`,
      [uploaded.id],
    );
    await app.get(EvdService).runMaintenance();
    const row = await client.query(
      `SELECT storage_key, purged_at FROM camera_evidence WHERE id = $1`,
      [uploaded.id],
    );
    expect(row.rows[0]).toMatchObject({ storage_key: null });
    expect(row.rows[0].purged_at).not.toBeNull();
  });
});

describe('Yêu cầu trích hình phiếu nạp (FR-INV-39)', () => {
  it('test_FR_INV_39_brand_requests_footage_and_is_told_the_result', async () => {
    const session = await refillSession(inv.userId);
    const path = `/refill-sessions/${session}/footage-requests`;

    const created = await call(brandAToken, 'POST', path, { reason: 'Mùi trong máy khác mẫu gửi' });
    expect(created.statusCode, created.body).toBe(201);
    const request = created.json<{ id: string; status: string; slotNumber: number }>();
    expect(request).toMatchObject({ status: 'OPEN', slotNumber: 1 });

    const again = await call(brandAToken, 'POST', path, { reason: 'Gửi lại' });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ code: 'FOOTAGE_REQUEST_ALREADY_OPEN' });
    expect(
      (await call(brandBToken, 'POST', path, { reason: 'Không phải phiếu của tôi' })).statusCode,
    ).toBe(403);

    // Nhân sự có machine.operate được báo; Inventory Staff thì không.
    const notified = await client.query<{ recipient_user_id: string }>(
      `SELECT recipient_user_id FROM notifications WHERE type = 'FOOTAGE_REQUESTED' AND reference_id = $1`,
      [request.id],
    );
    const recipients = notified.rows.map((r) => r.recipient_user_id);
    expect(recipients).toContain(ops.userId);
    expect(recipients).not.toContain(inv.userId);

    // Chưa có hình thì không đánh dấu đã đính hình được; không có hình thì phải ghi lý do.
    const resolve = (payload: Record<string, unknown>) =>
      call(opsToken, 'POST', `/footage-requests/${request.id}/resolve`, payload);
    expect((await resolve({ outcome: 'FULFILLED' })).json()).toMatchObject({
      code: 'EVIDENCE_REQUIRED',
    });
    expect((await resolve({ outcome: 'UNAVAILABLE' })).statusCode).toBe(400);

    const clip = (await attach(opsToken, `/refill-sessions/${session}`)).json<{ id: string }>();
    const done = await resolve({ outcome: 'FULFILLED' });
    expect(done.statusCode, done.body).toBe(200);
    expect(done.json()).toMatchObject({ status: 'FULFILLED', resolvedBy: ops.userId });
    expect((await resolve({ outcome: 'FULFILLED' })).json()).toMatchObject({
      code: 'EVIDENCE_TARGET_CLOSED',
    });

    const told = await client.query(
      `SELECT 1 FROM notifications n JOIN users u ON u.id = n.recipient_user_id
        WHERE n.type = 'FOOTAGE_FULFILLED' AND n.reference_id = $1 AND u.email = $2`,
      [session, fx.brandAdminAEmail],
    );
    expect(told.rowCount).toBe(1);

    // Đã trả lời thương hiệu → bằng chứng của phiếu nạp không gỡ được nữa.
    const remove = await call(opsToken, 'POST', `/evidence/${clip.id}/remove`, { reason: 'nhầm' });
    expect(remove.json()).toMatchObject({ code: 'EVIDENCE_TARGET_CLOSED' });

    // Danh sách: thương hiệu chỉ thấy yêu cầu của mình.
    const listA = await call(brandAToken, 'GET', `/footage-requests?refillSessionId=${session}`);
    expect(listA.json<{ meta: { total: number } }>().meta.total).toBe(1);
    const listB = await call(brandBToken, 'GET', `/footage-requests?refillSessionId=${session}`);
    expect(listB.json<{ meta: { total: number } }>().meta.total).toBe(0);
    expect((await call(invToken, 'GET', '/footage-requests')).statusCode).toBe(403);
  });

  it('test_FR_INV_39_request_window_and_unavailable_footage', async () => {
    const old = await refillSession(inv.userId, 15 * 24 * 60);
    const expired = await call(brandAToken, 'POST', `/refill-sessions/${old}/footage-requests`, {
      reason: 'Phát hiện muộn',
    });
    expect(expired.statusCode).toBe(409);
    expect(expired.json()).toMatchObject({ code: 'FOOTAGE_REQUEST_EXPIRED' });

    const session = await refillSession(inv.userId);
    const request = (
      await call(brandAToken, 'POST', `/refill-sessions/${session}/footage-requests`, {
        reason: 'Kiểm tra định kỳ',
      })
    ).json<{ id: string }>();
    const res = await call(opsToken, 'POST', `/footage-requests/${request.id}/resolve`, {
      outcome: 'UNAVAILABLE',
      note: 'Đầu ghi hỏng ổ cứng ngày hôm đó',
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'UNAVAILABLE',
      responseNote: 'Đầu ghi hỏng ổ cứng ngày hôm đó',
    });
    const told = await client.query<{ content: string }>(
      `SELECT content FROM notifications WHERE type = 'FOOTAGE_UNAVAILABLE' AND reference_id = $1`,
      [session],
    );
    expect(told.rows[0]?.content).toContain('Đầu ghi hỏng ổ cứng');
  });
});

describe('Nhãn camera của máy (FR-MCH-20)', () => {
  it('test_FR_MCH_20_super_admin_sets_camera_label', async () => {
    const path = `/machines/${fx.machineId}/camera-label`;
    expect((await call(opsToken, 'PUT', path, { cameraLabel: 'Cam-01' })).statusCode).toBe(403);

    const set = await call(adminToken, 'PUT', path, { cameraLabel: '  Cam-03 · tầng 2  ' });
    expect(set.statusCode, set.body).toBe(200);
    expect(set.json()).toMatchObject({ cameraLabel: 'Cam-03 · tầng 2' });

    // Người đi lấy hình thấy nhãn camera ngay ở khung giờ đề xuất.
    const claim = await openClaim();
    expect((await windowOf(`/refund-claims/${claim.id}`)).cameraLabel).toBe('Cam-03 · tầng 2');

    const cleared = await call(adminToken, 'PUT', path, { cameraLabel: '' });
    expect(cleared.json()).toMatchObject({ cameraLabel: null });
    const audits = await client.query(
      `SELECT 1 FROM audit_logs WHERE action = 'mch.machine.camera_label_changed' AND target_id = $1`,
      [fx.machineId],
    );
    expect(audits.rowCount).toBe(2);
  });
});
