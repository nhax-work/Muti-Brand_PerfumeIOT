/**
 * Email thông báo tiền/hàng trên PostgreSQL thật (FR-ALR-16, ADR-0017):
 *   - xếp hàng: một IN_APP (đã giao) và một EMAIL (PENDING) cho mỗi Brand Admin ACTIVE;
 *   - job gửi: ghi SENT kèm mã thư của dịch vụ, hoặc FAILED kèm phản hồi lỗi — bằng chứng đối soát;
 *   - tự thử lại sau EMAIL_RETRY_INTERVAL_MIN, dừng ở EMAIL_MAX_ATTEMPTS; Super Admin gửi lại tay;
 *   - phạm vi: người dùng chỉ thấy thông báo của mình, notification.manage thấy tất cả.
 *
 * Kênh gửi là `EMAIL_PROVIDER` của tiến trình test (ConsoleEmailProvider), thay `send` bằng spy để
 * quyết định gửi được hay lỗi — phần cần chứng minh (hàng đợi, khóa, ghi bằng chứng) chạy thật trên CSDL.
 */

import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EMAIL_PROVIDER, type EmailProvider } from '../../apps/api/src/adapters/email/index.js';
import { AlrService } from '../../apps/api/src/modules/alr/index.js';
import { SPEC_CONSTRAINTS } from '../../apps/api/src/shared/config/constraints.generated.js';
import { DATABASE, type Database } from '../../apps/api/src/shared/db/index.js';
import { asUser, createTestApp, login } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
  TEST_PASSWORD,
  type IsolationFixture,
} from './helpers/seed-isolation.js';

const MAX_ATTEMPTS = SPEC_CONSTRAINTS.EMAIL_MAX_ATTEMPTS;
const RETRY_MIN = SPEC_CONSTRAINTS.EMAIL_RETRY_INTERVAL_MIN;

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let alr: AlrService;
let db: Database;
let provider: EmailProvider;
let brandA: ReturnType<typeof asUser>;
let brandB: ReturnType<typeof asUser>;
let superAdmin: ReturnType<typeof asUser>;

interface EmailRow {
  id: string;
  status: string;
  recipient_address: string | null;
  provider_message_id: string | null;
  delivery_attempts: number;
  last_error: string | null;
  sent_at: Date | null;
}

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  app = await createTestApp();
  alr = app.get(AlrService);
  db = app.get(DATABASE);
  provider = app.get(EMAIL_PROVIDER);
  brandA = asUser(app, (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken);
  brandB = asUser(app, (await login(app, fx.brandAdminBEmail, TEST_PASSWORD)).accessToken);
  superAdmin = asUser(app, (await login(app, fx.superAdminEmail, TEST_PASSWORD)).accessToken);
  // Email còn treo của file test khác không được lẫn vào số đếm ở đây.
  await client.query(
    `UPDATE notifications SET status = 'FAILED', delivery_attempts = $1, last_attempt_at = now()
      WHERE channel = 'EMAIL' AND status IN ('PENDING', 'FAILED')`,
    [MAX_ATTEMPTS],
  );
}, 60_000);

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await cleanupIsolationFixture(client, fx);
  await app.close();
  await client.end();
});

/** Xếp hàng thông báo cho Brand Admin của A như một sự kiện tiền/hàng thật. */
async function queueForBrandA(): Promise<string> {
  const referenceId = randomUUID();
  const recipients = await alr.notifyBrandAdmins(db, {
    brandId: fx.brandA,
    type: 'RENTAL_CHECKOUT_PAID',
    subject: `Thanh toán ${referenceId}`,
    content: 'Phiên thanh toán đã được xác nhận.',
    referenceId,
    at: new Date(),
  });
  expect(recipients).toBe(1);
  return referenceId;
}

async function emailOf(referenceId: string): Promise<EmailRow> {
  const res = await client.query<EmailRow>(
    `SELECT id, status, recipient_address, provider_message_id, delivery_attempts, last_error, sent_at
       FROM notifications WHERE reference_id = $1 AND channel = 'EMAIL'`,
    [referenceId],
  );
  expect(res.rowCount).toBe(1);
  return res.rows[0]!;
}

describe('FR-ALR-16 — gửi email và lưu bằng chứng', () => {
  it('test_FR_ALR_16_send_brand_email_notifications — xếp hàng PENDING, job gửi thì SENT kèm mã thư', async () => {
    const send = vi
      .spyOn(provider, 'send')
      .mockResolvedValue({ success: true, providerMessageId: '<smtp-ok-1@test>' });
    const referenceId = await queueForBrandA();

    const queued = await emailOf(referenceId);
    expect(queued).toMatchObject({
      status: 'PENDING',
      recipient_address: fx.brandAdminAEmail,
      delivery_attempts: 0,
      sent_at: null,
    });
    const inApp = await client.query(
      `SELECT status FROM notifications WHERE reference_id = $1 AND channel = 'IN_APP'`,
      [referenceId],
    );
    expect(inApp.rows).toEqual([{ status: 'SENT' }]);

    const result = await alr.dispatchDueEmails();
    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: fx.brandAdminAEmail, subject: `Thanh toán ${referenceId}` }),
    );
    const sent = await emailOf(referenceId);
    expect(sent).toMatchObject({
      status: 'SENT',
      provider_message_id: '<smtp-ok-1@test>',
      delivery_attempts: 1,
      last_error: null,
    });
    expect(sent.sent_at).not.toBeNull();
  });

  it('test_FR_ALR_16_failed_send_recorded_and_retried — lỗi ghi FAILED kèm phản hồi, thử lại sau khoảng chờ', async () => {
    const send = vi
      .spyOn(provider, 'send')
      .mockResolvedValueOnce({
        success: false,
        error: 'SMTP 421: dịch vụ tạm thời không nhận thư',
      });
    const referenceId = await queueForBrandA();

    expect(await alr.dispatchDueEmails()).toEqual({ sent: 0, failed: 1 });
    const failed = await emailOf(referenceId);
    expect(failed).toMatchObject({ status: 'FAILED', delivery_attempts: 1, sent_at: null });
    expect(failed.last_error).toContain('SMTP 421');

    // Chưa qua EMAIL_RETRY_INTERVAL_MIN thì chưa thử lại.
    expect(await alr.dispatchDueEmails()).toEqual({ sent: 0, failed: 0 });

    await client.query(
      `UPDATE notifications SET last_attempt_at = now() - make_interval(mins => $2) WHERE id = $1`,
      [failed.id, RETRY_MIN + 1],
    );
    send.mockResolvedValueOnce({ success: true, providerMessageId: '<smtp-ok-2@test>' });
    expect(await alr.dispatchDueEmails()).toEqual({ sent: 1, failed: 0 });
    expect(await emailOf(referenceId)).toMatchObject({
      status: 'SENT',
      delivery_attempts: 2,
      provider_message_id: '<smtp-ok-2@test>',
      last_error: null,
    });
  });

  it('test_FR_ALR_16_provider_exception_recorded — kênh gửi ném lỗi thì ghi FAILED, không làm hỏng job', async () => {
    vi.spyOn(provider, 'send').mockRejectedValueOnce(new Error('ECONNRESET: mất kết nối SMTP'));
    const referenceId = await queueForBrandA();

    expect(await alr.dispatchDueEmails()).toEqual({ sent: 0, failed: 1 });
    const failed = await emailOf(referenceId);
    expect(failed).toMatchObject({ status: 'FAILED', delivery_attempts: 1, sent_at: null });
    expect(failed.last_error).toContain('ECONNRESET');
  });

  it('test_FR_ALR_16_stop_after_max_attempts — hết EMAIL_MAX_ATTEMPTS lượt thì job dừng tự thử', async () => {
    const send = vi.spyOn(provider, 'send');
    const referenceId = await queueForBrandA();
    const email = await emailOf(referenceId);
    await client.query(
      `UPDATE notifications SET status = 'FAILED', delivery_attempts = $2,
              last_attempt_at = now() - make_interval(mins => $3), last_error = 'SMTP 550'
        WHERE id = $1`,
      [email.id, MAX_ATTEMPTS, RETRY_MIN + 1],
    );
    expect(await alr.dispatchDueEmails()).toEqual({ sent: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('FR-ALR-16 — gửi lại tay và phạm vi tra cứu (ADR-0017 mục 5)', () => {
  let failedEmailId: string;
  let referenceId: string;

  beforeAll(async () => {
    referenceId = await queueForBrandA();
    const email = await emailOf(referenceId);
    failedEmailId = email.id;
    await client.query(
      `UPDATE notifications SET status = 'FAILED', delivery_attempts = $2, last_attempt_at = now(),
              last_error = 'SMTP 550: hộp thư không tồn tại'
        WHERE id = $1`,
      [failedEmailId, MAX_ATTEMPTS],
    );
  });

  it('test_FR_ALR_16_manual_retry — chỉ notification.manage gửi lại được, và chỉ email FAILED', async () => {
    const byBrand = await brandA('POST', `/notifications/${failedEmailId}/retry`);
    expect(byBrand.statusCode).toBe(403);
    expect(byBrand.json()).toMatchObject({ code: 'FORBIDDEN_SCOPE' });

    const res = await superAdmin('POST', `/notifications/${failedEmailId}/retry`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'PENDING',
      deliveryAttempts: MAX_ATTEMPTS,
      lastError: 'SMTP 550: hộp thư không tồn tại',
    });
    const audit = await client.query(
      `SELECT 1 FROM audit_logs WHERE action = 'alr.notification.retry_requested' AND target_id = $1`,
      [failedEmailId],
    );
    expect(audit.rowCount).toBe(1);

    // Đã về PENDING: job nhặt ngay dù đã hết lượt tự thử.
    vi.spyOn(provider, 'send').mockResolvedValue({
      success: true,
      providerMessageId: '<smtp-manual@test>',
    });
    expect(await alr.dispatchDueEmails()).toEqual({ sent: 1, failed: 0 });

    const again = await superAdmin('POST', `/notifications/${failedEmailId}/retry`);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ code: 'NOTIFICATION_NOT_RETRYABLE' });
  });

  it('test_FR_ALR_16_scope_by_recipient — người nhận thấy thông báo của mình, thương hiệu khác thì không', async () => {
    const mine = (await brandA('GET', '/notifications?pageSize=200')).json<{
      items: { id: string; recipientUserId: string }[];
    }>().items;
    expect(mine.some((n) => n.id === failedEmailId)).toBe(true);
    const meId = (await brandA('GET', '/auth/me')).json<{ id?: string; userId?: string }>();
    const myId = meId.id ?? meId.userId;
    expect(mine.every((n) => n.recipientUserId === myId)).toBe(true);

    const other = await brandB('GET', `/notifications/${failedEmailId}`);
    expect(other.statusCode).toBe(404);
    const otherList = (await brandB('GET', '/notifications?pageSize=200')).json<{
      items: { id: string }[];
    }>().items;
    expect(otherList.some((n) => n.id === failedEmailId)).toBe(false);
  });

  it('test_FR_ALR_16_evidence_for_auditor — Super Admin tra bằng chứng gửi theo thương hiệu và kênh', async () => {
    const res = await superAdmin(
      'GET',
      `/notifications?brandId=${fx.brandA}&channel=EMAIL&pageSize=200`,
    );
    const items = res.json<{ items: { id: string; channel: string; brandId: string }[] }>().items;
    expect(items.some((n) => n.id === failedEmailId)).toBe(true);
    expect(items.every((n) => n.channel === 'EMAIL' && n.brandId === fx.brandA)).toBe(true);

    const detail = await superAdmin('GET', `/notifications/${failedEmailId}`);
    expect(detail.json()).toMatchObject({
      recipientAddress: fx.brandAdminAEmail,
      referenceId,
      providerMessageId: '<smtp-manual@test>',
    });
  });
});
