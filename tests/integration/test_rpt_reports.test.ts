/**
 * Hai báo cáo tuần 8 trên PostgreSQL thật:
 *   - FR-SLT-47 doanh thu bán gói: hóa đơn mua qua đúng luồng thật (phiên → phụ lục → thanh toán →
 *     webhook có chữ ký), chỉ tính hóa đơn đã thanh toán, không tính phiên chưa trả hoặc đã hủy; tách
 *     phí thuê, bảo quản, ân hạn; nhóm và lọc theo gói, máy, địa điểm; chỉ Super Admin.
 *   - FR-RPT-06 xếp hạng sản phẩm: nguồn là sự kiện kiosk ghi qua `POST /kiosk/interactions`, lọc theo
 *     slot, máy, địa điểm, thời gian; Brand Admin không thấy gì của thương hiệu khác.
 */

import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildMockWebhook,
  MOCK_SIGNATURE_HEADER,
  signMockPayload,
} from '../../apps/api/src/modules/ord/payment/mock-gateway.js';
import { asUser, createTestApp, login, TEST_PAYMENT_WEBHOOK_SECRET } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
  TEST_PASSWORD,
  type IsolationFixture,
} from './helpers/seed-isolation.js';

interface Amounts {
  invoiceCount: number;
  rentAmount: string;
  storageAmount: string;
  graceFeeAmount: string;
  totalAmount: string;
}
interface RentalSales {
  from: string;
  to: string;
  groupBy: string;
  totals: Amounts;
  items: (Amounts & { key: string; label: string })[];
}
interface RankingItem {
  fragranceProductId: string;
  productName: string;
  impressionCount: number;
  selectionCount: number;
  orderCount: number;
}

let app: NestFastifyApplication;
let raw: pg.Client;
let fx: IsolationFixture;
let brandA: ReturnType<typeof asUser>;
let brandB: ReturnType<typeof asUser>;
let superAdmin: ReturnType<typeof asUser>;

const pkg3 = randomUUID();
const pkg6 = randomUUID();
const plan = randomUUID();
const location2 = randomUUID();
const machine2 = randomUUID();
/** Slot 6..9 trên máy fixture, slot 1 trên máy thứ hai. */
const vacant = Array.from({ length: 5 }, () => randomUUID());
let testStart: Date;
const checkouts: string[] = [];

beforeAll(async () => {
  raw = await openRawClient();
  fx = await seedIsolationFixture(raw);
  app = await createTestApp();
  brandA = asUser(app, (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken);
  brandB = asUser(app, (await login(app, fx.brandAdminBEmail, TEST_PASSWORD)).accessToken);
  superAdmin = asUser(app, (await login(app, fx.superAdminEmail, TEST_PASSWORD)).accessToken);

  await raw.query(
    `INSERT INTO rental_packages (id, name, duration_months, discount_percent, is_active)
     VALUES ($1, $2, 3, 0, true), ($3, $4, 6, 10.00, true)`,
    [pkg3, `Gói 3 tháng ${fx.runId}`, pkg6, `Gói 6 tháng ${fx.runId}`],
  );
  await raw.query(
    `INSERT INTO storage_plans (id, name, monthly_price, coverage_percent, coverage_cap, is_active)
     VALUES ($1, $2, 200000.0000, 60.00, 5000000.0000, true)`,
    [plan, `Bảo quản ${fx.runId}`],
  );
  await raw.query(
    `INSERT INTO locations (id, code, name, address, status)
     VALUES ($1, $2, $3, 'Dia chi 2', 'ACTIVE')`,
    [location2, `LOC2_${fx.runId}`, `Địa điểm 2 ${fx.runId}`],
  );
  await raw.query(
    `INSERT INTO machines (id, location_id, serial_number, display_name, status, operating_mode,
                           firmware_version, simulator_enabled)
     VALUES ($1, $2, $3, $4, 'ONLINE', 'NORMAL', '0.1.0-test', true)`,
    [machine2, location2, `TEST2-${fx.runId}`, `Máy 2 ${fx.runId}`],
  );
  for (let i = 0; i < 4; i++) {
    await raw.query(
      `INSERT INTO machine_slots (id, machine_id, slot_number, status, monthly_rent_price,
                                  calibrated_dosage_ml, low_stock_threshold_ml)
       VALUES ($1, $2, $3, 'AVAILABLE', $4, 0.1200, 5.0000)`,
      [vacant[i], fx.machineId, 6 + i, i === 1 ? '1200000.0000' : '1000000.0000'],
    );
  }
  await raw.query(
    `INSERT INTO machine_slots (id, machine_id, slot_number, status, monthly_rent_price,
                                calibrated_dosage_ml, low_stock_threshold_ml)
     VALUES ($1, $2, 1, 'AVAILABLE', 900000.0000, 0.1200, 5.0000)`,
    [vacant[4], machine2],
  );
  testStart = new Date(Date.now() - 1000);

  // Đã thanh toán: A mua slot 6 (3 tháng) + slot 7 (6 tháng); B mua slot 1 máy 2 (3 tháng).
  await paidCheckout(brandA, [
    { slotId: vacant[0]!, rentalPackageId: pkg3 },
    { slotId: vacant[1]!, rentalPackageId: pkg6 },
  ]);
  await paidCheckout(brandB, [{ slotId: vacant[4]!, rentalPackageId: pkg3 }]);
  // Không tính (AC2): A giữ chỗ slot 8 chưa trả tiền; A giữ chỗ slot 9 rồi phiên bị hủy.
  await createCheckout(brandA, [{ slotId: vacant[2]!, rentalPackageId: pkg3 }]);
  const cancelled = await createCheckout(brandA, [{ slotId: vacant[3]!, rentalPackageId: pkg6 }]);
  await inTransaction(async () => {
    await raw.query(`UPDATE rental_checkouts SET cancelled_at = now() WHERE id = $1`, [cancelled]);
    await raw.query(
      `UPDATE slot_rentals SET status = 'CANCELLED', cancelled_at = now() WHERE checkout_id = $1`,
      [cancelled],
    );
  });
}, 120_000);

afterAll(async () => {
  if (fx) {
    await raw.query(`DELETE FROM notifications WHERE brand_id IN ($1, $2)`, [fx.brandA, fx.brandB]);
    await raw.query(`DELETE FROM kiosk_interaction_events WHERE machine_id = $1`, [fx.machineId]);
    await inTransaction(async () => {
      await raw.query("SET session_replication_role = 'replica'");
      await raw.query(
        `DELETE FROM payment_events WHERE payment_id IN
           (SELECT id FROM payments WHERE rental_checkout_id = ANY($1::uuid[]))`,
        [checkouts],
      );
      await raw.query(
        `DELETE FROM agreement_acceptances WHERE rental_checkout_id = ANY($1::uuid[])`,
        [checkouts],
      );
      await raw.query(`DELETE FROM payments WHERE rental_checkout_id = ANY($1::uuid[])`, [
        checkouts,
      ]);
      await raw.query(`DELETE FROM slot_rentals WHERE checkout_id = ANY($1::uuid[])`, [checkouts]);
      await raw.query(`DELETE FROM rental_checkouts WHERE id = ANY($1::uuid[])`, [checkouts]);
      await raw.query("SET session_replication_role = 'origin'");
    });
    await raw.query(`DELETE FROM machine_slots WHERE id = ANY($1::uuid[])`, [vacant]);
    await raw.query(`DELETE FROM machines WHERE id = $1`, [machine2]);
    await raw.query(`DELETE FROM locations WHERE id = $1`, [location2]);
    await raw.query(`DELETE FROM rental_packages WHERE id = ANY($1::uuid[])`, [[pkg3, pkg6]]);
    await raw.query(`DELETE FROM storage_plans WHERE id = $1`, [plan]);
    await cleanupIsolationFixture(raw, fx);
  }
  await app?.close();
  await raw?.end();
});

async function inTransaction(fn: () => Promise<void>): Promise<void> {
  await raw.query('BEGIN');
  try {
    await fn();
    await raw.query('COMMIT');
  } catch (err) {
    await raw.query('ROLLBACK');
    throw err;
  }
}

async function createCheckout(
  user: ReturnType<typeof asUser>,
  items: { slotId: string; rentalPackageId: string }[],
): Promise<string> {
  const res = await user('POST', '/rental-checkouts', {
    payload: { items: items.map((i) => ({ ...i, storagePlanId: plan })) },
  });
  expect(res.statusCode, res.body).toBe(201);
  const id = res.json<{ id: string }>().id;
  checkouts.push(id);
  return id;
}

/** Luồng mua gói thật: phiên → đồng ý phụ lục → tạo thanh toán → webhook có chữ ký (ADR-0008). */
async function paidCheckout(
  user: ReturnType<typeof asUser>,
  items: { slotId: string; rentalPackageId: string }[],
): Promise<void> {
  const id = await createCheckout(user, items);
  const annex = await user('GET', `/rental-checkouts/${id}/annex`);
  expect(annex.statusCode, annex.body).toBe(200);
  const accepted = await user('POST', `/rental-checkouts/${id}/annex/accept`, {
    payload: { contentHash: annex.json<{ contentHash: string }>().contentHash },
  });
  expect(accepted.statusCode, accepted.body).toBeLessThan(300);
  const pay = await user('POST', `/rental-checkouts/${id}/payments`);
  expect(pay.statusCode, pay.body).toBe(200);
  const payment = await raw.query<{ provider_reference: string; amount: string; currency: string }>(
    `SELECT provider_reference, amount, currency FROM payments WHERE id = $1`,
    [pay.json<{ paymentId: string }>().paymentId],
  );
  const row = payment.rows[0]!;
  const body = JSON.stringify(
    buildMockWebhook({
      reference: row.provider_reference,
      amount: row.amount,
      currency: row.currency,
      status: 'SUCCEEDED',
    }),
  );
  const webhook = await app.inject({
    method: 'POST',
    url: '/api/v1/webhooks/payments/mock',
    headers: {
      'content-type': 'application/json',
      [MOCK_SIGNATURE_HEADER]: signMockPayload(TEST_PAYMENT_WEBHOOK_SECRET, body),
    },
    payload: body,
  });
  expect(webhook.statusCode, webhook.body).toBe(200);
}

/** Tổng tiền thật trong CSDL của các hóa đơn đã thanh toán trên tập slot — đáp án đối chiếu. */
async function expectedFor(slotIds: readonly string[]): Promise<Amounts> {
  const res = await raw.query<{
    n: string;
    rent: string;
    storage: string;
    grace: string;
    total: string;
  }>(
    `SELECT count(*) AS n,
            coalesce(sum(rent_amount), 0)::numeric(19,4) AS rent,
            coalesce(sum(storage_amount), 0)::numeric(19,4) AS storage,
            coalesce(sum(grace_fee_amount), 0)::numeric(19,4) AS grace,
            coalesce(sum(total_amount), 0)::numeric(19,4) AS total
       FROM slot_rentals
      WHERE slot_id = ANY($1::uuid[]) AND paid_at IS NOT NULL AND cancelled_at IS NULL`,
    [slotIds],
  );
  const r = res.rows[0]!;
  return {
    invoiceCount: Number(r.n),
    rentAmount: r.rent,
    storageAmount: r.storage,
    graceFeeAmount: r.grace,
    totalAmount: r.total,
  };
}

function salesUrl(params: Record<string, string>): string {
  const query = new URLSearchParams({
    from: testStart.toISOString(),
    to: new Date(Date.now() + 60_000).toISOString(),
    ...params,
  });
  return `/reports/rental-sales?${query.toString()}`;
}

describe('Doanh thu bán gói (FR-SLT-47)', () => {
  it('test_FR_SLT_47_rental_sales_report — chỉ hóa đơn đã thanh toán; tách phí thuê, bảo quản, ân hạn; nhóm theo gói', async () => {
    const res = await superAdmin('GET', salesUrl({ machineId: fx.machineId, groupBy: 'PACKAGE' }));
    expect(res.statusCode, res.body).toBe(200);
    const report = res.json<RentalSales>();

    // AC2: slot 8 (chưa trả tiền) và slot 9 (đã hủy) không tính — chỉ hai hóa đơn của slot 6, 7.
    const expected = await expectedFor([vacant[0]!, vacant[1]!]);
    expect(expected.invoiceCount).toBe(2);
    expect(Number(expected.rentAmount)).toBeGreaterThan(0);
    expect(Number(expected.storageAmount)).toBeGreaterThan(0);
    expect(report).toMatchObject({ groupBy: 'PACKAGE', currency: 'VND', totals: expected });
    // Tổng = phí thuê + phí bảo quản + phí ân hạn.
    expect(Number(report.totals.totalAmount)).toBeCloseTo(
      Number(report.totals.rentAmount) +
        Number(report.totals.storageAmount) +
        Number(report.totals.graceFeeAmount),
      4,
    );

    expect(report.items.map((i) => i.key).sort()).toEqual([pkg3, pkg6].sort());
    expect(report.items.find((i) => i.key === pkg3)).toMatchObject({
      label: `Gói 3 tháng ${fx.runId}`,
      ...(await expectedFor([vacant[0]!])),
    });
    expect(report.items.find((i) => i.key === pkg6)).toMatchObject(await expectedFor([vacant[1]!]));
  });

  it('test_FR_SLT_47_rental_sales_report — lọc theo địa điểm, nhóm theo máy và gói bảo quản', async () => {
    const byLocation = await superAdmin(
      'GET',
      salesUrl({ locationId: location2, groupBy: 'MACHINE' }),
    );
    expect(byLocation.statusCode, byLocation.body).toBe(200);
    expect(byLocation.json<RentalSales>()).toMatchObject({
      totals: await expectedFor([vacant[4]!]),
      items: [{ key: machine2, label: `Máy 2 ${fx.runId}` }],
    });

    const byPlan = await superAdmin(
      'GET',
      salesUrl({ machineId: fx.machineId, groupBy: 'STORAGE_PLAN' }),
    );
    expect(byPlan.json<RentalSales>().items).toEqual([
      expect.objectContaining({ key: plan, invoiceCount: 2 }),
    ]);

    const byPlace = await superAdmin(
      'GET',
      salesUrl({ locationId: fx.locationId, groupBy: 'LOCATION' }),
    );
    expect(byPlace.json<RentalSales>().items).toEqual([
      expect.objectContaining({ key: fx.locationId, label: fx.locationName }),
    ]);
  });

  it('test_FR_SLT_47_rental_sales_report — Brand Admin bị FORBIDDEN_SCOPE; khoảng thời gian ngược bị từ chối (AC3)', async () => {
    const res = await brandA('GET', salesUrl({}));
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'FORBIDDEN_SCOPE' });

    const inverted = await superAdmin(
      'GET',
      `/reports/rental-sales?from=${new Date().toISOString()}&to=${testStart.toISOString()}`,
    );
    expect(inverted.statusCode).toBe(400);
    expect(inverted.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('Xếp hạng sản phẩm (FR-RPT-06)', () => {
  const recent = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();

  beforeAll(async () => {
    const session = randomUUID();
    const events: Record<string, unknown>[] = [];
    const add = (slotIndex: number, type: string, count: number) => {
      for (let i = 0; i < count; i++) {
        events.push({
          eventId: `RANK-${fx.runId}-${slotIndex}-${type}-${i}`,
          eventType: type,
          slotId: fx.slots[slotIndex],
          kioskSessionId: session,
          occurredAt: recent(),
        });
      }
    };
    add(0, 'PRODUCT_SELECTED', 5); // A, sản phẩm 0
    add(0, 'PRODUCT_IMPRESSION', 12);
    add(1, 'PRODUCT_SELECTED', 2); // A, sản phẩm 1
    add(2, 'PRODUCT_SELECTED', 9); // B, sản phẩm 2
    add(4, 'PRODUCT_SELECTED', 7); // slot 5 của A đã thanh lý — hàng của nền tảng
    // Một sự kiện cũ ngoài khoảng xem.
    events.push({
      eventId: `RANK-${fx.runId}-old`,
      eventType: 'PRODUCT_SELECTED',
      slotId: fx.slots[0],
      kioskSessionId: session,
      occurredAt: '2025-01-01T00:00:00Z',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/kiosk/interactions',
      payload: { events },
    });
    expect(res.statusCode, res.body).toBe(202);
  });

  function rankingUrl(params: Record<string, string> = {}): string {
    const query = new URLSearchParams({
      from: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
      to: new Date(Date.now() + 60_000).toISOString(),
      ...params,
    });
    return `/reports/product-ranking?${query.toString()}`;
  }

  it('test_FR_RPT_06_product_ranking — Brand Admin: sản phẩm của mình xếp theo lượt chọn, kèm lượt xem và số đơn (AC1)', async () => {
    const res = await brandA('GET', rankingUrl());
    expect(res.statusCode, res.body).toBe(200);
    const ranking = res.json<RankingItem[]>();
    expect(ranking).toEqual([
      expect.objectContaining({
        fragranceProductId: fx.products[0],
        selectionCount: 5,
        impressionCount: 12,
        // Fixture có hai đơn DISPENSED trên slot 1 trong 30 ngày qua.
        orderCount: 2,
      }),
      expect.objectContaining({ fragranceProductId: fx.products[1], selectionCount: 2 }),
    ]);
  });

  it('test_FR_RPT_06_product_ranking — không lộ sản phẩm, số đếm của thương hiệu khác hay hàng đã thanh lý (AC3)', async () => {
    const res = await brandA('GET', rankingUrl({ machineId: fx.machineId }));
    const ids = res.json<RankingItem[]>().map((r) => r.fragranceProductId);
    expect(ids).not.toContain(fx.products[2]);
    expect(ids).not.toContain(fx.products[4]);
    for (const name of fx.brandBProductNames) expect(res.body).not.toContain(name);

    const b = await brandB('GET', rankingUrl());
    expect(b.json<RankingItem[]>()).toEqual([
      expect.objectContaining({ fragranceProductId: fx.products[2], selectionCount: 9 }),
    ]);

    // Super Admin thấy toàn bộ, kể cả slot đã thanh lý.
    const all = await superAdmin('GET', rankingUrl({ machineId: fx.machineId }));
    expect(all.json<RankingItem[]>().map((r) => [r.fragranceProductId, r.selectionCount])).toEqual([
      [fx.products[2], 9],
      [fx.products[4], 7],
      [fx.products[0], 5],
      [fx.products[1], 2],
    ]);
  });

  it('test_FR_RPT_06_product_ranking — lọc theo slot, địa điểm, thời gian; khoảng ngược bị từ chối (AC2)', async () => {
    const bySlot = await brandA('GET', rankingUrl({ slotId: fx.slots[1]! }));
    expect(bySlot.json<RankingItem[]>().map((r) => r.fragranceProductId)).toEqual([fx.products[1]]);

    const otherPlace = await superAdmin('GET', rankingUrl({ locationId: location2 }));
    expect(otherPlace.json<RankingItem[]>()).toEqual([]);

    // Sự kiện năm 2025 chỉ hiện khi khoảng xem bao trùm nó.
    const old = await brandA(
      'GET',
      `/reports/product-ranking?from=2024-12-31T00:00:00Z&to=2025-01-02T00:00:00Z`,
    );
    expect(old.json<RankingItem[]>()).toEqual([
      expect.objectContaining({ fragranceProductId: fx.products[0], selectionCount: 1 }),
    ]);

    const inverted = await brandA(
      'GET',
      `/reports/product-ranking?from=2025-01-02T00:00:00Z&to=2025-01-01T00:00:00Z`,
    );
    expect(inverted.statusCode).toBe(400);
    expect(inverted.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
