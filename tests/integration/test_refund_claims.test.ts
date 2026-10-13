/**
 * Phiếu khiếu nại hoàn tiền thủ công (ADR-0012): HTTP thật → guard → service → PostgreSQL thật.
 *
 * Gồm nhóm test trọng yếu "Tài khoản hoàn tiền" (ADR-0012): tài khoản ngân hàng của khách chỉ nằm
 * trong refund_claims dưới dạng mã hóa, chỉ người được phân công xem được, bị xóa khi phiếu đóng, và
 * không lọt sang audit_logs / payment_events / notifications. PR sửa file này cần người review riêng
 * phần test (spec/testing.md).
 */

import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildMockWebhook } from '../../apps/api/src/modules/ord/payment/mock-gateway.js';
import { claimTokenFor } from '../../apps/api/src/modules/ord/refund-claims/claimability.js';
import { RefundClaimsService } from '../../apps/api/src/modules/ord/index.js';
import { createTestApp, login, reauth, TEST_REFUND_CLAIM_TOKEN_SECRET } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import { kioskFlow } from './helpers/kiosk-flow.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
  TEST_PASSWORD,
  type IsolationFixture,
} from './helpers/seed-isolation.js';

/** Số tài khoản dùng để soi rò rỉ — đủ dài và lạ để không trùng dữ liệu khác. */
const ACCOUNT_NUMBER = '9704229988776655';
const CONTACT = '0909123456';

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let flow: ReturnType<typeof kioskFlow>;
let adminToken: string;
let opsToken: string;
let opsUserId: string;
let opsRoleId: string;

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  app = await createTestApp();
  flow = kioskFlow(app, client, fx);
  adminToken = (await login(app, fx.superAdminEmail, TEST_PASSWORD)).accessToken;

  // Fixture chưa có Operations Staff — tạo một tài khoản với quyền xử lý hoàn tiền.
  opsRoleId = randomUUID();
  opsUserId = randomUUID();
  const opsEmail = `ops.${fx.runId}@test.local`;
  await client.query(
    `INSERT INTO roles (id, brand_id, code, name, is_system)
     VALUES ($1, NULL, 'OPERATIONS_STAFF', $2, true)`,
    [opsRoleId, `Ops ${fx.runId}`],
  );
  await client.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT $1, p.id FROM permissions p WHERE p.code = ANY($2::varchar[])`,
    [opsRoleId, ['order.view', 'order.refund']],
  );
  await client.query(
    `INSERT INTO users (id, brand_id, email, password_hash, full_name, status)
     SELECT $1, NULL, $2, password_hash, 'Nhan vien van hanh', 'ACTIVE' FROM users WHERE id = $3`,
    [opsUserId, opsEmail, fx.superAdminId],
  );
  await client.query(
    `INSERT INTO user_roles (id, user_id, role_id, scope_type) VALUES ($1, $2, $3, 'PLATFORM')`,
    [randomUUID(), opsUserId, opsRoleId],
  );
  opsToken = (await login(app, opsEmail, TEST_PASSWORD)).accessToken;
}, 60_000);

afterAll(async () => {
  await client.query(
    `DELETE FROM refund_claims WHERE order_id IN (SELECT id FROM orders WHERE machine_id = $1)`,
    [fx.machineId],
  );
  await client.query(`DELETE FROM alerts WHERE machine_id = $1`, [fx.machineId]);
  await client.query(`DELETE FROM refresh_sessions WHERE user_id = $1`, [opsUserId]);
  await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [opsUserId]);
  await client.query(`DELETE FROM users WHERE id = $1`, [opsUserId]);
  await client.query(`DELETE FROM role_permissions WHERE role_id = $1`, [opsRoleId]);
  await client.query(`DELETE FROM roles WHERE id = $1`, [opsRoleId]);
  await flow.cleanup();
  await cleanupIsolationFixture(client, fx);
  await app.close();
  await client.end();
});

// -------------------------------------------------------------------------------------
// Tiện ích
// -------------------------------------------------------------------------------------

/** Đơn khách đã trả tiền mà xịt thất bại (đường thật của FR-ORD-19 do DSP ghi; ở đây đặt thẳng). */
async function failedPaidOrder(slotIndex = 0) {
  const order = await flow.paidOrder(slotIndex);
  await client.query(
    `UPDATE orders SET status = 'FAILED', needs_manual_review = true, failure_code = 'ACTUATOR_FAULT'
      WHERE id = $1`,
    [order.id],
  );
  return order;
}

async function kioskStatus(orderId: string) {
  const res = await app.inject({ method: 'GET', url: `/api/v1/kiosk/orders/${orderId}/status` });
  expect(res.statusCode, res.body).toBe(200);
  return res.json<{ status: string; claimToken: string | null }>();
}

function submitClaim(orderId: string, overrides: Record<string, unknown> = {}, ip = '10.0.0.1') {
  return app.inject({
    method: 'POST',
    url: '/api/v1/public/refund-claims',
    remoteAddress: ip,
    payload: {
      orderId,
      claimToken: claimTokenFor(TEST_REFUND_CLAIM_TOKEN_SECRET, orderId),
      contact: CONTACT,
      refundAccount: {
        bankBin: '970422',
        accountNumber: ACCOUNT_NUMBER,
        accountName: 'NGUYEN VAN A',
      },
      consent: true,
      ...overrides,
    },
  });
}

async function openClaim(orderId: string, ip?: string): Promise<{ id: string; amount: string }> {
  const res = await submitClaim(orderId, {}, ip);
  expect(res.statusCode, res.body).toBe(201);
  return res.json<{ id: string; amount: string }>();
}

function asOps(
  method: 'GET' | 'POST',
  url: string,
  payload?: Record<string, unknown>,
  reauthToken?: string,
) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    headers: {
      authorization: `Bearer ${opsToken}`,
      ...(reauthToken ? { 'x-reauth-token': reauthToken } : {}),
    },
    ...(payload === undefined ? {} : { payload }),
  });
}

async function assignToOps(claimId: string) {
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/refund-claims/${claimId}/assign`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { assigneeId: opsUserId },
  });
  expect(res.statusCode, res.body).toBe(200);
}

async function claimRow(claimId: string) {
  const res = await client.query<{
    status: string;
    account_ciphertext: Buffer | null;
    contact_ciphertext: Buffer | null;
    account_purged_at: Date | null;
    payout_reference: string | null;
  }>(
    `SELECT status, account_ciphertext, contact_ciphertext, account_purged_at, payout_reference
       FROM refund_claims WHERE id = $1`,
    [claimId],
  );
  return res.rows[0]!;
}

/** Số bảng ngoài refund_claims có chứa chuỗi `needle` (dạng văn bản). */
async function leaksOf(needle: string): Promise<string[]> {
  const checks: [string, string][] = [
    [
      'audit_logs',
      `SELECT 1 FROM audit_logs WHERE coalesce(before_data::text,'') || coalesce(after_data::text,'') || coalesce(metadata::text,'') LIKE $1`,
    ],
    ['payment_events', `SELECT 1 FROM payment_events WHERE payload::text LIKE $1`],
    ['payments', `SELECT 1 FROM payments WHERE coalesce(raw_response::text,'') LIKE $1`],
    ['notifications', `SELECT 1 FROM notifications WHERE coalesce(subject,'') || content LIKE $1`],
    ['alerts', `SELECT 1 FROM alerts WHERE title || coalesce(description,'') LIKE $1`],
  ];
  const leaks: string[] = [];
  for (const [table, query] of checks) {
    const res = await client.query(query, [`%${needle}%`]);
    if ((res.rowCount ?? 0) > 0) leaks.push(table);
  }
  return leaks;
}

// -------------------------------------------------------------------------------------

describe('Phiếu khiếu nại — kiosk và khách (FR-ORD-28, FR-ORD-29)', () => {
  it('test_FR_ORD_28_kiosk_shows_claim_qr_only_for_unserved_paid_orders', async () => {
    const failed = await failedPaidOrder();
    expect((await kioskStatus(failed.id)).claimToken).toBe(
      claimTokenFor(TEST_REFUND_CLAIM_TOKEN_SECRET, failed.id),
    );

    // Đơn khách đã nhận lượt xịt và không chuyển thừa: không có gì để hoàn.
    const served = await flow.paidOrder(1);
    await client.query(
      `UPDATE orders SET status = 'DISPENSED', dispensed_at = now() WHERE id = $1`,
      [served.id],
    );
    expect((await kioskStatus(served.id)).claimToken).toBeNull();

    // Đã gửi khiếu nại thì mã hết hiệu lực — QR không hiện nữa.
    await openClaim(failed.id, '10.0.1.1');
    expect((await kioskStatus(failed.id)).claimToken).toBeNull();
  });

  it('test_FR_ORD_29_customer_submits_refund_claim', async () => {
    const order = await failedPaidOrder();
    const res = await submitClaim(order.id, {}, '10.0.2.1');
    expect(res.statusCode, res.body).toBe(201);
    const receipt = res.json<Record<string, unknown>>();
    expect(receipt).toMatchObject({
      status: 'OPEN',
      amount: order.amount,
      currency: order.currency,
    });
    // Phản hồi cho khách không chứa dữ liệu cá nhân.
    expect(res.body).not.toContain(ACCOUNT_NUMBER);
    expect(res.body).not.toContain(CONTACT);

    // Lưu dạng mã hóa — bản mã không chứa số tài khoản dạng rõ.
    const row = await claimRow(receipt['id'] as string);
    expect(row.account_ciphertext).not.toBeNull();
    expect(row.account_ciphertext!.toString('utf8')).not.toContain(ACCOUNT_NUMBER);
    expect(row.contact_ciphertext!.toString('utf8')).not.toContain(CONTACT);

    // Mã khiếu nại chỉ dùng một lần.
    const again = await submitClaim(order.id, {}, '10.0.2.2');
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ code: 'CLAIM_ALREADY_OPEN' });
  });

  it('test_FR_ORD_29_reject_invalid_token_unclaimable_order_and_missing_consent', async () => {
    const order = await failedPaidOrder();
    const badToken = await submitClaim(order.id, { claimToken: 'doan-bua' }, '10.0.3.1');
    expect(badToken.statusCode).toBe(404);
    expect(badToken.json()).toMatchObject({ code: 'NOT_FOUND' });

    const noConsent = await submitClaim(order.id, { consent: false }, '10.0.3.2');
    expect(noConsent.statusCode).toBe(400);

    const served = await flow.paidOrder(1);
    await client.query(
      `UPDATE orders SET status = 'DISPENSED', dispensed_at = now() WHERE id = $1`,
      [served.id],
    );
    const notClaimable = await submitClaim(served.id, {}, '10.0.3.3');
    expect(notClaimable.statusCode).toBe(409);
    expect(notClaimable.json()).toMatchObject({ code: 'ORDER_NOT_CLAIMABLE' });
  });

  it('test_FR_ORD_29_extra_transfer_claim_refunds_only_the_extra_amount', async () => {
    // Khách đã nhận lượt xịt nhưng chuyển khoản hai lần cùng mã QR.
    const order = await flow.paidOrder(2);
    await client.query(
      `UPDATE orders SET status = 'DISPENSED', dispensed_at = now() WHERE id = $1`,
      [order.id],
    );
    const second = buildMockWebhook({
      reference: order.paymentReference,
      amount: order.amount,
      currency: order.currency,
    });
    expect((await flow.sendWebhook(second)).statusCode).toBe(200);

    const claim = await openClaim(order.id, '10.0.4.1');
    expect(claim.amount).toBe(order.amount);
    const row = await client.query<{ refund_order: boolean }>(
      `SELECT refund_order FROM refund_claims WHERE id = $1`,
      [claim.id],
    );
    expect(row.rows[0]!.refund_order).toBe(false);
  });

  it('test_FR_ORD_29_rate_limit_per_ip', async () => {
    const order = await failedPaidOrder();
    const ip = '10.0.5.1';
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      codes.push((await submitClaim(order.id, { claimToken: 'sai-ma' }, ip)).statusCode);
    }
    expect(codes.slice(0, 5)).toEqual([404, 404, 404, 404, 404]);
    expect(codes[5]).toBe(429);
    const limited = await submitClaim(order.id, {}, ip);
    expect(limited.json()).toMatchObject({ code: 'RATE_LIMITED' });
  });
});

describe('Phiếu khiếu nại — Operations Staff (FR-ORD-20, FR-ORD-30)', () => {
  it('test_FR_ORD_30_only_assigned_staff_views_refund_account', async () => {
    const order = await failedPaidOrder();
    const claim = await openClaim(order.id, '10.0.6.1');

    // Danh sách và chi tiết không bao giờ chứa tài khoản.
    const list = await asOps('GET', '/refund-claims?status=OPEN&pageSize=200');
    expect(list.statusCode).toBe(200);
    expect(list.body).not.toContain(ACCOUNT_NUMBER);
    expect(
      list.json<{ items: { id: string; hasRefundAccount: boolean }[] }>().items,
    ).toContainEqual(expect.objectContaining({ id: claim.id, hasRefundAccount: true }));

    // Chưa được phân công → không xem được, kể cả Super Admin.
    const adminReauth = await reauth(app, adminToken, TEST_PASSWORD);
    const asAdmin = await app.inject({
      method: 'GET',
      url: `/api/v1/refund-claims/${claim.id}/refund-account`,
      headers: { authorization: `Bearer ${adminToken}`, 'x-reauth-token': adminReauth },
    });
    expect(asAdmin.statusCode).toBe(403);
    expect(asAdmin.json()).toMatchObject({ code: 'CLAIM_NOT_ASSIGNED' });

    await assignToOps(claim.id);

    // Được phân công nhưng chưa xác thực lại → REAUTH_REQUIRED.
    const noReauth = await asOps('GET', `/refund-claims/${claim.id}/refund-account`);
    expect(noReauth.statusCode).toBe(403);
    expect(noReauth.json()).toMatchObject({ code: 'REAUTH_REQUIRED' });

    const opsReauth = await reauth(app, opsToken, TEST_PASSWORD);
    const view = await asOps(
      'GET',
      `/refund-claims/${claim.id}/refund-account`,
      undefined,
      opsReauth,
    );
    expect(view.statusCode, view.body).toBe(200);
    expect(view.json()).toEqual({
      bankBin: '970422',
      accountNumber: ACCOUNT_NUMBER,
      accountName: 'NGUYEN VAN A',
      contact: CONTACT,
    });

    // Mỗi lần xem có nhật ký, và nhật ký không chứa dữ liệu tài khoản.
    const audits = await client.query(
      `SELECT 1 FROM audit_logs WHERE action = 'ord.refund_claim.account_viewed' AND target_id = $1
         AND actor_id = $2`,
      [claim.id, opsUserId],
    );
    expect(audits.rowCount).toBe(1);
    expect(await leaksOf(ACCOUNT_NUMBER)).toEqual([]);
  });

  it('test_FR_ORD_20_record_manual_refund_closes_claim_and_order', async () => {
    const order = await failedPaidOrder();
    const claim = await openClaim(order.id, '10.0.7.1');
    await assignToOps(claim.id);

    const payout = await asOps(
      'POST',
      `/refund-claims/${claim.id}/refund`,
      { payoutReference: 'FT26101300001' },
      await reauth(app, opsToken, TEST_PASSWORD),
    );
    expect(payout.statusCode, payout.body).toBe(200);
    expect(payout.json()).toMatchObject({ status: 'REFUNDED', payoutReference: 'FT26101300001' });

    const order2 = await flow.orderRow(order.id);
    expect(order2).toMatchObject({ status: 'REFUNDED', needs_manual_review: false });

    // Phiếu đã đóng thì không thao tác thêm được.
    const again = await asOps(
      'POST',
      `/refund-claims/${claim.id}/refund`,
      { payoutReference: 'FT-LAN-HAI' },
      await reauth(app, opsToken, TEST_PASSWORD),
    );
    expect(again.statusCode).toBe(400);
  });

  it('test_FR_ORD_20_reject_claim_requires_assignee_and_reason', async () => {
    const order = await failedPaidOrder();
    const claim = await openClaim(order.id, '10.0.8.1');

    const notAssigned = await asOps('POST', `/refund-claims/${claim.id}/reject`, {
      reason: 'Trùng',
    });
    expect(notAssigned.statusCode).toBe(403);
    expect(notAssigned.json()).toMatchObject({ code: 'CLAIM_NOT_ASSIGNED' });

    await assignToOps(claim.id);
    expect(
      (await asOps('POST', `/refund-claims/${claim.id}/reject`, { reason: '' })).statusCode,
    ).toBe(400);
    const rejected = await asOps('POST', `/refund-claims/${claim.id}/reject`, {
      reason: 'Khách đã được xịt bù tại chỗ',
    });
    expect(rejected.statusCode, rejected.body).toBe(200);
    expect(rejected.json()).toMatchObject({ status: 'REJECTED' });
    expect((await claimRow(claim.id)).account_ciphertext).toBeNull();
  });
});

describe('Tài khoản hoàn tiền — bất biến dữ liệu (FR-ORD-31, FR-ORD-32, NFR-DAT-04)', () => {
  it('test_FR_ORD_31_account_purged_on_close_and_enforced_by_database', async () => {
    const order = await failedPaidOrder();
    const claim = await openClaim(order.id, '10.0.9.1');
    await assignToOps(claim.id);
    await asOps(
      'POST',
      `/refund-claims/${claim.id}/refund`,
      { payoutReference: 'FT26101300002' },
      await reauth(app, opsToken, TEST_PASSWORD),
    );

    const row = await claimRow(claim.id);
    expect(row.account_ciphertext).toBeNull();
    expect(row.account_purged_at).not.toBeNull();
    // Liên hệ còn giữ thêm REFUND_CLAIM_CONTACT_RETENTION_DAYS ngày.
    expect(row.contact_ciphertext).not.toBeNull();

    // CSDL tự chặn: không thể đóng phiếu mà vẫn còn tài khoản.
    const other = await openClaim((await failedPaidOrder()).id, '10.0.9.2');
    const violation = await client
      .query(
        `UPDATE refund_claims SET status = 'REJECTED', resolution_note = 'x', closed_at = now()
          WHERE id = $1`,
        [other.id],
      )
      .catch((e: { constraint?: string }) => e);
    expect((violation as { constraint?: string }).constraint).toBe(
      'chk_refund_claim_account_purged_on_close',
    );

    expect(await leaksOf(ACCOUNT_NUMBER)).toEqual([]);
    expect(await leaksOf(CONTACT)).toEqual([]);
  });

  it('test_FR_ORD_31_contact_purged_after_retention_with_catch_up', async () => {
    const order = await failedPaidOrder();
    const claim = await openClaim(order.id, '10.0.10.1');
    await assignToOps(claim.id);
    await asOps('POST', `/refund-claims/${claim.id}/reject`, { reason: 'Không đủ điều kiện' });

    // Giả lập dịch vụ tắt qua mốc giữ liên hệ: phiếu đã đóng từ 31 ngày trước.
    await client.query(
      `UPDATE refund_claims SET closed_at = now() - interval '31 days' WHERE id = $1`,
      [claim.id],
    );
    await app.get(RefundClaimsService).runMaintenance();
    expect((await claimRow(claim.id)).contact_ciphertext).toBeNull();
  });

  it('test_FR_ORD_32_expire_stale_claims_and_alert_sla_breach', async () => {
    const stale = await openClaim((await failedPaidOrder()).id, '10.0.11.1');
    const late = await openClaim((await failedPaidOrder()).id, '10.0.11.2');
    await client.query(
      `UPDATE refund_claims SET created_at = now() - interval '31 days' WHERE id = $1`,
      [stale.id],
    );
    await client.query(
      `UPDATE refund_claims SET created_at = now() - interval '25 hours' WHERE id = $1`,
      [late.id],
    );

    const service = app.get(RefundClaimsService);
    await service.runMaintenance();
    // Chạy lại không sinh cảnh báo trùng (FR-ALR-07).
    await service.runMaintenance();

    const staleRow = await claimRow(stale.id);
    expect(staleRow.status).toBe('EXPIRED');
    expect(staleRow.account_ciphertext).toBeNull();
    expect((await claimRow(late.id)).status).toBe('OPEN');

    const alerts = await client.query(
      `SELECT 1 FROM alerts WHERE deduplication_key = $1 AND type = 'REFUND_CLAIM_SLA_BREACHED'`,
      [`REFUND_CLAIM_SLA:${late.id}`],
    );
    expect(alerts.rowCount).toBe(1);
  });
});
