/**
 * Integration test cho kỳ chi trả doanh thu (FR-SLT-52..54), bảng đối soát (FR-SLT-17, 18) và doanh
 * thu tách hai nguồn (FR-REV-04) — tuần 7, TV1. PostgreSQL thật, HTTP thật, xác thực lại thật.
 *
 * Đơn được chèn thẳng với `paid_at` ở các tháng đã qua (2025) để mỗi test có một tháng riêng, không
 * đụng các đơn gần đây của fixture. Job chạy qua `RevService.refreshPayouts` — đúng hàm scheduler gọi.
 */

import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RevService } from '../../apps/api/src/modules/rev/index.js';
import { asUser, createTestApp, login, reauth } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
  TEST_PASSWORD,
  type IsolationFixture,
} from './helpers/seed-isolation.js';

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let rev: RevService;
let superToken: string;
let brandAToken: string;
let brandBToken: string;

interface PayoutBody {
  id: string;
  brandId: string;
  periodMonth: string;
  status: string;
  orderCount: number;
  amount: string;
  confirmedAt: string | null;
  paidAt: string | null;
  transferReference: string | null;
  disputedAt: string | null;
  disputeResolvedAt: string | null;
}

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  app = await createTestApp();
  rev = app.get(RevService);
  superToken = (await login(app, fx.superAdminEmail, TEST_PASSWORD)).accessToken;
  brandAToken = (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken;
  brandBToken = (await login(app, fx.brandAdminBEmail, TEST_PASSWORD)).accessToken;
}, 60_000);

afterAll(async () => {
  await client.query(
    `DELETE FROM order_status_histories WHERE order_id IN (SELECT id FROM orders WHERE machine_id = $1)`,
    [fx.machineId],
  );
  await cleanupIsolationFixture(client, fx);
  await app.close();
  await client.end();
});

/**
 * Chèn một đơn đã qua thanh toán trên slot `slotIndex` (0..4, slot 5 là hóa đơn đã thanh lý).
 * `revenueOwner` mặc định theo hóa đơn: BRAND cho slot 1..4, PLATFORM cho slot 5.
 */
async function insertOrder(
  slotIndex: number,
  status: 'DISPENSED' | 'FORFEITED' | 'FAILED' | 'REFUND_PENDING' | 'REFUNDED',
  paidAt: string,
  amount = '35000.0000',
): Promise<string> {
  const id = randomUUID();
  const ref = `REV-${id.slice(0, 8)}`;
  await client.query(
    `INSERT INTO orders (id, brand_id, slot_rental_id, revenue_owner, machine_id, slot_id,
                         fragrance_product_id, product_name_snapshot, amount, currency, status,
                         payment_reference, idempotency_key, expires_at, paid_at, dispensed_at,
                         created_at)
     SELECT $1, r.brand_id, r.id,
            CASE WHEN r.status = 'LIQUIDATED' THEN 'PLATFORM' ELSE 'BRAND' END::revenue_owner_type,
            s.machine_id, s.id, r.fragrance_product_id, 'San pham test', $3, 'VND', $4::order_status,
            $5, $5, $6::timestamptz, $6::timestamptz,
            CASE WHEN $4 = 'DISPENSED' THEN $6::timestamptz END, $6::timestamptz
       FROM slot_rentals r JOIN machine_slots s ON s.id = r.slot_id
      WHERE r.id = $2`,
    [id, fx.rentals[slotIndex], amount, status, ref, paidAt],
  );
  return id;
}

async function payoutRow(brandId: string, month: string) {
  const res = await client.query<{
    id: string;
    status: string;
    order_count: number;
    amount: string;
    confirmed_at: Date | null;
  }>(
    `SELECT id, status, order_count, amount, confirmed_at FROM brand_payouts
      WHERE brand_id = $1 AND period_month = $2::date`,
    [brandId, month],
  );
  return res.rows[0];
}

async function verifyBrand(brandId: string): Promise<void> {
  await client.query(
    `UPDATE brands SET tax_code = '0312345678', legal_verified_at = now(), legal_verified_by = $2,
                       payout_account_ciphertext = '\\x00'::bytea, payout_account_key_version = 1
      WHERE id = $1`,
    [brandId, fx.superAdminId],
  );
}

async function unverifyBrand(brandId: string): Promise<void> {
  await client.query(
    `UPDATE brands SET legal_verified_at = NULL, legal_verified_by = NULL,
                       payout_account_ciphertext = NULL, payout_account_key_version = NULL
      WHERE id = $1`,
    [brandId],
  );
}

async function withReauth(token: string) {
  return { 'x-reauth-token': await reauth(app, token, TEST_PASSWORD) };
}

describe('FR-SLT-52 — kỳ chi trả hằng tháng', () => {
  it('test_FR_SLT_52_monthly_payout_lifecycle — tháng đã hết được chốt CONFIRMED kèm số liệu', async () => {
    await insertOrder(0, 'DISPENSED', '2025-01-05T03:00:00Z', '35000.0000');
    await insertOrder(1, 'DISPENSED', '2025-01-20T03:00:00Z', '28000.0000');
    await insertOrder(0, 'FORFEITED', '2025-01-25T03:00:00Z', '35000.0000');

    await rev.refreshPayouts();
    const row = await payoutRow(fx.brandA, '2025-01-01');
    expect(row).toMatchObject({ status: 'CONFIRMED', order_count: 3, amount: '98000.0000' });
    expect(row!.confirmed_at).not.toBeNull();
  });

  it('test_FR_SLT_52_current_month_accumulates_as_draft — DRAFT tính lại mỗi lần chạy', async () => {
    await rev.refreshPayouts();
    const month = (
      await client.query<{ m: string }>(
        `SELECT to_char(date_trunc('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM-DD') AS m`,
      )
    ).rows[0]!.m;
    const before = await payoutRow(fx.brandB, month);
    const beforeCount = before?.order_count ?? 0;
    const beforeAmount = Number(before?.amount ?? 0);

    await insertOrder(2, 'DISPENSED', new Date().toISOString(), '50000.0000');
    await rev.refreshPayouts();
    const after = await payoutRow(fx.brandB, month);
    expect(after).toMatchObject({ status: 'DRAFT', order_count: beforeCount + 1 });
    expect(Number(after!.amount)).toBe(beforeAmount + 50000);
    expect(after!.confirmed_at).toBeNull();

    // Chạy lại không đổi gì (idempotent).
    await rev.refreshPayouts();
    expect(await payoutRow(fx.brandB, month)).toMatchObject({ order_count: beforeCount + 1 });
  });

  it('test_FR_SLT_52_counts_only_dispensed_and_forfeited — FAILED, REFUND_*, PLATFORM không tính', async () => {
    await insertOrder(0, 'DISPENSED', '2025-02-03T03:00:00Z');
    await insertOrder(0, 'FAILED', '2025-02-04T03:00:00Z');
    await insertOrder(0, 'REFUND_PENDING', '2025-02-05T03:00:00Z');
    await insertOrder(0, 'REFUNDED', '2025-02-06T03:00:00Z');
    // Slot 5: hóa đơn của A đã thanh lý — đơn mang brand_id A nhưng doanh thu PLATFORM.
    await insertOrder(4, 'DISPENSED', '2025-02-07T03:00:00Z', '50000.0000');

    await rev.refreshPayouts();
    expect(await payoutRow(fx.brandA, '2025-02-01')).toMatchObject({
      order_count: 1,
      amount: '35000.0000',
    });
  });

  it('test_FR_SLT_52_vietnam_month_boundary — 23:30 ngày cuối tháng giờ VN vẫn thuộc tháng đó', async () => {
    await insertOrder(2, 'DISPENSED', '2025-03-31T16:30:00Z'); // 23:30 31/03 giờ VN
    await insertOrder(2, 'DISPENSED', '2025-03-31T17:00:00Z'); // 00:00 01/04 giờ VN
    await rev.refreshPayouts();
    expect(await payoutRow(fx.brandB, '2025-03-01')).toMatchObject({ order_count: 1 });
    expect(await payoutRow(fx.brandB, '2025-04-01')).toMatchObject({ order_count: 1 });
  });

  it('test_FR_SLT_52_confirmed_period_frozen — đơn về muộn không đổi kỳ đã khóa', async () => {
    await insertOrder(1, 'DISPENSED', '2025-05-10T03:00:00Z');
    await rev.refreshPayouts();
    expect(await payoutRow(fx.brandA, '2025-05-01')).toMatchObject({
      status: 'CONFIRMED',
      order_count: 1,
    });

    await insertOrder(1, 'DISPENSED', '2025-05-11T03:00:00Z');
    await rev.refreshPayouts();
    expect(await payoutRow(fx.brandA, '2025-05-01')).toMatchObject({
      status: 'CONFIRMED',
      order_count: 1,
    });
  });

  it('test_FR_SLT_52_brand_sees_only_own_payouts — cô lập kỳ chi trả giữa thương hiệu', async () => {
    await rev.refreshPayouts();
    const listA = await asUser(app, brandAToken)('GET', '/brand-payouts?pageSize=200');
    expect(listA.statusCode).toBe(200);
    const itemsA = listA.json<{ items: PayoutBody[] }>().items;
    expect(itemsA.length).toBeGreaterThan(0);
    expect(itemsA.every((p) => p.brandId === fx.brandA)).toBe(true);

    // Lọc brandId của B bị bỏ qua với Brand Admin.
    const sneaky = await asUser(app, brandAToken)('GET', `/brand-payouts?brandId=${fx.brandB}`);
    expect(sneaky.json<{ items: PayoutBody[] }>().items.every((p) => p.brandId === fx.brandA)).toBe(
      true,
    );

    const bPayout = await payoutRow(fx.brandB, '2025-03-01');
    const direct = await asUser(app, brandAToken)('GET', `/brand-payouts/${bPayout!.id}`);
    expect(direct.statusCode).toBe(403);
    expect(direct.json<{ code: string }>().code).toBe('FORBIDDEN_SCOPE');
    expect(direct.body).not.toContain(fx.brandB);

    const asSuper = await asUser(app, superToken)('GET', `/brand-payouts/${bPayout!.id}`);
    expect(asSuper.statusCode).toBe(200);
    expect(asSuper.json<PayoutBody>()).toMatchObject({
      brandId: fx.brandB,
      periodMonth: '2025-03-01',
    });
  });
});

describe('FR-SLT-53 — ghi nhận chuyển khoản', () => {
  it('test_FR_SLT_53_payout_requires_legal_verification_and_reauth', async () => {
    await rev.refreshPayouts();
    const payout = await payoutRow(fx.brandA, '2025-01-01');
    const url = `/brand-payouts/${payout!.id}/pay`;
    const payload = { transferReference: 'FT25001234' };
    const call = asUser(app, superToken);

    const noReauth = await call('POST', url, { payload });
    expect(noReauth.statusCode).toBe(403);
    expect(noReauth.json<{ code: string }>().code).toBe('REAUTH_REQUIRED');

    await unverifyBrand(fx.brandA);
    const unverified = await call('POST', url, { payload, headers: await withReauth(superToken) });
    expect(unverified.statusCode).toBe(409);
    expect(unverified.json<{ code: string }>().code).toBe('BRAND_NOT_VERIFIED');

    // Brand Admin không có quyền chuyển tiền.
    const byBrand = await asUser(app, brandAToken)('POST', url, {
      payload,
      headers: await withReauth(brandAToken),
    });
    expect(byBrand.statusCode).toBe(403);

    await verifyBrand(fx.brandA);
    const paid = await call('POST', url, { payload, headers: await withReauth(superToken) });
    expect(paid.statusCode).toBe(200);
    expect(paid.json<PayoutBody>()).toMatchObject({
      status: 'PAID',
      transferReference: 'FT25001234',
    });
    expect(paid.json<PayoutBody>().paidAt).not.toBeNull();

    const audit = await client.query(
      `SELECT 1 FROM audit_logs WHERE action = 'rev.payout.paid' AND target_id = $1`,
      [payout!.id],
    );
    expect(audit.rowCount).toBe(1);

    // Trả hai lần → kỳ không còn CONFIRMED.
    const again = await call('POST', url, { payload, headers: await withReauth(superToken) });
    expect(again.statusCode).toBe(409);
    expect(again.json<{ code: string }>().code).toBe('RENTAL_NOT_ACTIVE');
    await unverifyBrand(fx.brandA);
  });

  it('test_FR_SLT_53_draft_period_not_payable', async () => {
    await rev.refreshPayouts();
    const draft = await client.query<{ id: string }>(
      `SELECT id FROM brand_payouts WHERE brand_id = $1 AND status = 'DRAFT' LIMIT 1`,
      [fx.brandB],
    );
    expect(draft.rows[0]).toBeDefined();
    await verifyBrand(fx.brandB);
    try {
      const res = await asUser(app, superToken)('POST', `/brand-payouts/${draft.rows[0]!.id}/pay`, {
        payload: { transferReference: 'FT-DRAFT' },
        headers: await withReauth(superToken),
      });
      expect(res.statusCode).toBe(409);
      expect(res.json<{ code: string }>().code).toBe('RENTAL_NOT_ACTIVE');
    } finally {
      await unverifyBrand(fx.brandB);
    }
  });
});

describe('FR-SLT-54 — khiếu nại số liệu', () => {
  it('test_FR_SLT_54_dispute_blocks_payout — trả lời khiếu nại rồi mới chuyển khoản được', async () => {
    await rev.refreshPayouts();
    const payout = await payoutRow(fx.brandB, '2025-03-01');
    const id = payout!.id;
    await verifyBrand(fx.brandB);
    try {
      // Thương hiệu khác và tài khoản nền tảng không khiếu nại thay được.
      const byA = await asUser(app, brandAToken)('POST', `/brand-payouts/${id}/dispute`, {
        payload: { note: 'Số liệu sai' },
      });
      expect(byA.statusCode).toBe(403);
      const bySuper = await asUser(app, superToken)('POST', `/brand-payouts/${id}/dispute`, {
        payload: { note: 'Số liệu sai' },
      });
      expect(bySuper.statusCode).toBe(403);

      const disputed = await asUser(app, brandBToken)('POST', `/brand-payouts/${id}/dispute`, {
        payload: { note: 'Thiếu một đơn ngày 31/03' },
      });
      expect(disputed.statusCode).toBe(200);
      expect(disputed.json<PayoutBody>().disputedAt).not.toBeNull();

      const twice = await asUser(app, brandBToken)('POST', `/brand-payouts/${id}/dispute`, {
        payload: { note: 'Lần hai' },
      });
      expect(twice.statusCode).toBe(409);

      const notified = await client.query(
        `SELECT 1 FROM notifications WHERE type = 'PAYOUT_DISPUTED' AND recipient_user_id = $1`,
        [fx.superAdminId],
      );
      expect(notified.rowCount).toBeGreaterThanOrEqual(1);

      const blocked = await asUser(app, superToken)('POST', `/brand-payouts/${id}/pay`, {
        payload: { transferReference: 'FT-BLOCKED' },
        headers: await withReauth(superToken),
      });
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json<{ code: string }>().code).toBe('RENTAL_NOT_ACTIVE');

      const answered = await asUser(app, superToken)(
        'POST',
        `/brand-payouts/${id}/dispute-response`,
        { payload: { response: 'Đơn 31/03 lúc 00:00 giờ VN thuộc kỳ tháng 4' } },
      );
      expect(answered.statusCode).toBe(200);
      expect(answered.json<PayoutBody>().disputeResolvedAt).not.toBeNull();

      const answeredTwice = await asUser(app, superToken)(
        'POST',
        `/brand-payouts/${id}/dispute-response`,
        { payload: { response: 'Lần hai' } },
      );
      expect(answeredTwice.statusCode).toBe(409);

      const paid = await asUser(app, superToken)('POST', `/brand-payouts/${id}/pay`, {
        payload: { transferReference: 'FT-AFTER-DISPUTE' },
        headers: await withReauth(superToken),
      });
      expect(paid.statusCode).toBe(200);
      expect(paid.json<PayoutBody>().status).toBe('PAID');
    } finally {
      await unverifyBrand(fx.brandB);
    }
  });
});

describe('FR-SLT-17, FR-SLT-18 — bảng đối soát', () => {
  it('test_FR_SLT_17_settlement_lines_per_slot — mỗi hóa đơn một dòng, Brand Admin chỉ thấy mình', async () => {
    const res = await asUser(app, brandAToken)(
      'GET',
      `/settlements?periodStart=2025-01-01&periodEnd=2025-01-31&brandId=${fx.brandB}`,
    );
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      brandId: string;
      lines: { rentalId: string; orderCount: number; sprayRevenue: string; amountDue: string }[];
      totals: { orderCount: number; sprayRevenue: string; amountDue: string };
    }>();
    expect(body.brandId).toBe(fx.brandA);
    expect(body.lines).toHaveLength(2);
    const slot1 = body.lines.find((l) => l.rentalId === fx.rentals[0]);
    expect(slot1).toMatchObject({
      orderCount: 2,
      sprayRevenue: '70000.0000',
      amountDue: '70000.0000',
    });
    expect(body.totals).toMatchObject({
      orderCount: 3,
      sprayRevenue: '98000.0000',
      amountDue: '98000.0000',
    });

    const noBrand = await asUser(app, superToken)(
      'GET',
      '/settlements?periodStart=2025-01-01&periodEnd=2025-01-31',
    );
    expect(noBrand.statusCode).toBe(400);
  });

  it('test_FR_SLT_18_settlement_excludes_platform_orders — chỉ đơn BRAND đã xịt hoặc bỏ lượt', async () => {
    const res = await asUser(app, superToken)(
      'GET',
      `/settlements?brandId=${fx.brandA}&periodStart=2025-02-01&periodEnd=2025-02-28`,
    );
    expect(res.statusCode).toBe(200);
    const body = res.json<{ lines: { rentalId: string }[]; totals: { orderCount: number } }>();
    expect(body.totals.orderCount).toBe(1);
    expect(body.lines.map((l) => l.rentalId)).toEqual([fx.rentals[0]]);
  });
});

describe('FR-REV-04 — doanh thu tách hai nguồn', () => {
  it('test_FR_REV_04_split_revenue_dashboard', async () => {
    // Tháng 2/2025 giờ VN trên máy của fixture: 1 đơn BRAND 35000, 1 đơn PLATFORM 50000.
    const url = `/revenue/split?from=2025-01-31T17:00:00Z&to=2025-02-28T17:00:00Z&machineId=${fx.machineId}`;
    const res = await asUser(app, superToken)('GET', url);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      periodStart: '2025-02-01',
      periodEnd: '2025-02-28',
      brandRevenue: '35000.0000',
      platformRevenue: '50000.0000',
      orderCountBrand: 1,
      orderCountPlatform: 1,
    });

    const byBrand = await asUser(app, brandAToken)('GET', url);
    expect(byBrand.statusCode).toBe(403);
    expect(byBrand.body).not.toContain('50000');
  });
});
