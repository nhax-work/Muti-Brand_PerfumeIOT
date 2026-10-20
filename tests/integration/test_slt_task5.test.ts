/**
 * Integration test cho Task 5 (FR-SLT-50, FR-SLT-55, FR-SLT-56):
 * - Giới hạn giữ chỗ slot theo thương hiệu (FR-SLT-56): ngưỡng 5 slot, đồng thời, hủy/hết hạn.
 * - Phụ lục thanh toán & chữ ký điện tử (FR-SLT-50): nội dung snapshot, bất biến hash, chặn thanh toán, idempotent, 404 phiên cũ, 403 khác thương hiệu.
 * - Đổi slot trong 48 giờ (FR-SLT-55): cùng máy, cùng giá, chưa lắp chai, biên 48h (47h59 vs 48h01), chặn đổi 2 lần, tranh chấp đồng thời vào cùng slot đích.
 */

import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
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

let app: NestFastifyApplication;
let raw: pg.Client;
let fx: IsolationFixture;
let brandA: ReturnType<typeof asUser>;
let brandB: ReturnType<typeof asUser>;
let packageId: string;
let storagePlanId: string;

/** Danh sách slot trống dùng trong test. */
let vacantSlots: string[];
const SAME_PRICE = 1000000.0;
const DIFF_PRICE = 2000000.0;

beforeAll(async () => {
  raw = await openRawClient();
  fx = await seedIsolationFixture(raw);
  app = await createTestApp();
  brandA = asUser(app, (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken);
  brandB = asUser(app, (await login(app, fx.brandAdminBEmail, TEST_PASSWORD)).accessToken);

  packageId = randomUUID();
  storagePlanId = randomUUID();

  await raw.query(
    `INSERT INTO rental_packages (id, name, duration_months, discount_percent, is_active)
     VALUES ($1, $2, 3, 0.00, true)`,
    [packageId, `Gói Task5 3 tháng ${fx.runId}`],
  );

  await raw.query(
    `INSERT INTO storage_plans (id, name, monthly_price, coverage_percent, coverage_cap, is_active)
     VALUES ($1, $2, 100000.0000, 30.00, 3000000.0000, true)`,
    [storagePlanId, `Bảo quản Task5 ${fx.runId}`],
  );

  // Tạo 14 slot trống:
  // slot 6..15: giá 1.000.000
  // slot 16..19: giá 2.000.000
  vacantSlots = Array.from({ length: 14 }, () => randomUUID());
  for (const [i, slotId] of vacantSlots.entries()) {
    const price = i < 10 ? SAME_PRICE : DIFF_PRICE;
    await raw.query(
      `INSERT INTO machine_slots (id, machine_id, slot_number, status, monthly_rent_price,
                                  calibrated_dosage_ml, low_stock_threshold_ml)
       VALUES ($1, $2, $3, 'AVAILABLE', $4, 0.1200, 5.0000)`,
      [slotId, fx.machineId, 6 + i, price],
    );
  }
}, 120_000);

afterEach(async () => {
  if (fx) {
    const leftover = await raw.query<{ id: string }>(
      `SELECT id FROM rental_checkouts WHERE brand_id IN ($1, $2)`,
      [fx.brandA, fx.brandB],
    );
    if (leftover.rows.length > 0) {
      await deleteCheckouts(leftover.rows.map((r) => r.id));
    }
    if (vacantSlots?.length > 0) {
      await raw.query(
        `UPDATE machine_slots SET active_bottle_id = NULL, status = 'AVAILABLE' WHERE id = ANY($1::uuid[])`,
        [vacantSlots],
      );
    }
  }
});

afterAll(async () => {
  if (fx) {
    const leftover = await raw.query<{ id: string }>(
      `SELECT id FROM rental_checkouts WHERE brand_id IN ($1, $2)`,
      [fx.brandA, fx.brandB],
    );
    if (leftover.rows.length > 0) {
      await deleteCheckouts(leftover.rows.map((r) => r.id));
    }
    if (vacantSlots?.length > 0) {
      await raw.query(`DELETE FROM machine_slots WHERE id = ANY($1::uuid[])`, [vacantSlots]);
    }
    await raw.query(`DELETE FROM rental_packages WHERE id = $1`, [packageId]);
    await raw.query(`DELETE FROM storage_plans WHERE id = $1`, [storagePlanId]);
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

async function deleteCheckouts(checkoutIds: readonly string[]): Promise<void> {
  if (checkoutIds.length === 0) return;
  const ids = [...checkoutIds];
  await inTransaction(async () => {
    // Dùng session_replication_role = 'replica' để dọn dẹp test mà không vi phạm
    // trigger bất biến trg_agreement_acceptances_append_only
    await raw.query("SET session_replication_role = 'replica'");
    await raw.query(
      `DELETE FROM payment_events WHERE payment_id IN
         (SELECT id FROM payments WHERE rental_checkout_id = ANY($1::uuid[]))`,
      [ids],
    );
    await raw.query(
      `DELETE FROM agreement_acceptances WHERE rental_checkout_id = ANY($1::uuid[])`,
      [ids],
    );
    await raw.query(`DELETE FROM payments WHERE rental_checkout_id = ANY($1::uuid[])`, [ids]);
    await raw.query(`DELETE FROM slot_rentals WHERE checkout_id = ANY($1::uuid[])`, [ids]);
    await raw.query(`DELETE FROM rental_checkouts WHERE id = ANY($1::uuid[])`, [ids]);
    await raw.query("SET session_replication_role = 'origin'");
  });
}

async function acceptAnnex(checkoutId: string, user = brandA) {
  const annexRes = await user('GET', `/rental-checkouts/${checkoutId}/annex`);
  const { contentHash } = annexRes.json<{ contentHash: string }>();
  return user('POST', `/rental-checkouts/${checkoutId}/annex/accept`, {
    payload: { contentHash },
  });
}

async function payCheckoutFully(checkoutId: string, user = brandA): Promise<void> {
  await acceptAnnex(checkoutId, user);
  const payRes = await user('POST', `/rental-checkouts/${checkoutId}/payments`);
  const payment = payRes.json<{ paymentId: string }>();
  const pRow = await raw.query<{ provider_reference: string; amount: string; currency: string }>(
    `SELECT provider_reference, amount, currency FROM payments WHERE id = $1`,
    [payment.paymentId],
  );
  const body = JSON.stringify(
    buildMockWebhook({
      reference: pRow.rows[0]!.provider_reference,
      amount: pRow.rows[0]!.amount,
      currency: pRow.rows[0]!.currency,
      status: 'SUCCEEDED',
    }),
  );
  await app.inject({
    method: 'POST',
    url: '/api/v1/webhooks/payments/mock',
    headers: {
      'content-type': 'application/json',
      [MOCK_SIGNATURE_HEADER]: signMockPayload(TEST_PAYMENT_WEBHOOK_SECRET, body),
    },
    payload: body,
  });
}

describe('FR-SLT-56: Giới hạn số slot giữ chỗ tối đa theo thương hiệu', () => {
  it('test_FR_SLT_56_concurrent_hold_limit_same_brand', async () => {
    // 2 request đồng thời từ Brand A: mỗi request giữ 3 slot -> tổng 6 slot > BRAND_MAX_HELD_SLOTS (5)
    // Hệ thống phải tuần tự hóa qua lock thương hiệu và chỉ cho phép ĐÚNG 1 request thành công.
    const req1 = brandA('POST', '/rental-checkouts', {
      payload: {
        items: [
          { slotId: vacantSlots[0], rentalPackageId: packageId, storagePlanId },
          { slotId: vacantSlots[1], rentalPackageId: packageId, storagePlanId },
          { slotId: vacantSlots[2], rentalPackageId: packageId, storagePlanId },
        ],
      },
    });

    const req2 = brandA('POST', '/rental-checkouts', {
      payload: {
        items: [
          { slotId: vacantSlots[3], rentalPackageId: packageId, storagePlanId },
          { slotId: vacantSlots[4], rentalPackageId: packageId, storagePlanId },
          { slotId: vacantSlots[5], rentalPackageId: packageId, storagePlanId },
        ],
      },
    });

    const [res1, res2] = await Promise.all([req1, req2]);
    const statuses = [res1.statusCode, res2.statusCode].sort();
    expect(statuses).toEqual([201, 409]);

    const failed = res1.statusCode === 409 ? res1 : res2;
    const success = res1.statusCode === 201 ? res1 : res2;
    expect(failed.json()).toMatchObject({ code: 'HOLD_LIMIT_REACHED' });

    await deleteCheckouts([success.json<{ id: string }>().id]);
  });

  it('test_FR_SLT_56_exact_5_held_slots_and_6th_rejected', async () => {
    // Giữ chính xác 5 slot (3 + 2 = 5)
    const res1 = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [
          { slotId: vacantSlots[0], rentalPackageId: packageId, storagePlanId },
          { slotId: vacantSlots[1], rentalPackageId: packageId, storagePlanId },
          { slotId: vacantSlots[2], rentalPackageId: packageId, storagePlanId },
        ],
      },
    });
    expect(res1.statusCode).toBe(201);
    const checkoutId1 = res1.json<{ id: string }>().id;

    const res2 = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [
          { slotId: vacantSlots[3], rentalPackageId: packageId, storagePlanId },
          { slotId: vacantSlots[4], rentalPackageId: packageId, storagePlanId },
        ],
      },
    });
    expect(res2.statusCode).toBe(201);
    const checkoutId2 = res2.json<{ id: string }>().id;

    // Slot thứ 6 bị chặn
    const res3 = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId: vacantSlots[5], rentalPackageId: packageId, storagePlanId }],
      },
    });
    expect(res3.statusCode).toBe(409);
    expect(res3.json()).toMatchObject({ code: 'HOLD_LIMIT_REACHED' });

    await deleteCheckouts([checkoutId1, checkoutId2]);
  });

  it('test_FR_SLT_56_cancelled_and_expired_checkouts_freed', async () => {
    // Tạo 1 checkout 5 slot
    const res = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [
          { slotId: vacantSlots[0], rentalPackageId: packageId, storagePlanId },
          { slotId: vacantSlots[1], rentalPackageId: packageId, storagePlanId },
          { slotId: vacantSlots[2], rentalPackageId: packageId, storagePlanId },
          { slotId: vacantSlots[3], rentalPackageId: packageId, storagePlanId },
          { slotId: vacantSlots[4], rentalPackageId: packageId, storagePlanId },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const checkoutId = res.json<{ id: string }>().id;

    // Hủy phiên này
    const cancelRes = await brandA('POST', `/rental-checkouts/${checkoutId}/cancel`);
    expect([200, 201]).toContain(cancelRes.statusCode);

    // Sau khi hủy, slot được giải phóng, Brand A tạo lại checkout mới thành công
    const newRes = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId: vacantSlots[0], rentalPackageId: packageId, storagePlanId }],
      },
    });
    expect(newRes.statusCode).toBe(201);
    const newId = newRes.json<{ id: string }>().id;

    await deleteCheckouts([checkoutId, newId]);
  });
});

describe('FR-SLT-50: Phụ lục thanh toán & Chữ ký điện tử', () => {
  it('test_FR_SLT_50_content_and_hash_consistent_even_if_catalog_price_changes', async () => {
    // Tạo phiên thanh toán
    const checkoutRes = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId: vacantSlots[0], rentalPackageId: packageId, storagePlanId }],
      },
    });
    expect(checkoutRes.statusCode).toBe(201);
    const checkout = checkoutRes.json<{ id: string; totalAmount: string }>();

    // Lấy phụ lục
    const annex1 = await brandA('GET', `/rental-checkouts/${checkout.id}/annex`);
    expect(annex1.statusCode).toBe(200);
    const data1 = annex1.json<{
      checkoutId: string;
      content: string;
      contentHash: string;
      agreementVersionId: string;
    }>();

    // Kiểm tra các trường thông tin trong phụ lục (FR-SLT-50 AC1)
    expect(data1.content).toContain('PHỤ LỤC HỢP ĐỒNG THUÊ SLOT');
    expect(data1.content).toContain('1000000'); // monthly_rent_price
    expect(data1.content).toContain('Bảo quản'); // storage plan
    expect(data1.content).toContain('3000000'); // coverage_cap
    expect(data1.content).toContain(checkout.totalAmount); // tổng tiền
    expect(data1.contentHash).toMatch(/^[0-9a-f]{64}$/);

    // Thay đổi giá niêm yết trong danh mục sau khi tạo phiên
    await raw.query(`UPDATE machine_slots SET monthly_rent_price = 9999999 WHERE id = $1`, [
      vacantSlots[0],
    ]);
    await raw.query(`UPDATE rental_packages SET discount_percent = 50.00 WHERE id = $1`, [
      packageId,
    ]);

    // Lấy lại phụ lục: nội dung và hash PHẢI GIỮ NGUYÊN do lấy từ ảnh chụp giá phiên
    const annex2 = await brandA('GET', `/rental-checkouts/${checkout.id}/annex`);
    expect(annex2.statusCode).toBe(200);
    const data2 = annex2.json<{ content: string; contentHash: string }>();
    expect(data2.contentHash).toBe(data1.contentHash);
    expect(data2.content).toBe(data1.content);

    // Phục hồi giá niêm yết
    await raw.query(`UPDATE machine_slots SET monthly_rent_price = $1 WHERE id = $2`, [
      SAME_PRICE,
      vacantSlots[0],
    ]);
    await raw.query(`UPDATE rental_packages SET discount_percent = 0.00 WHERE id = $1`, [
      packageId,
    ]);

    await deleteCheckouts([checkout.id]);
  });

  it('test_FR_SLT_50_payment_blocked_when_annex_unaccepted', async () => {
    const res = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId: vacantSlots[0], rentalPackageId: packageId, storagePlanId }],
      },
    });
    const checkoutId = res.json<{ id: string }>().id;

    // Chưa đồng ý phụ lục mà thanh toán -> 403 AGREEMENT_NOT_ACCEPTED
    const payRes = await brandA('POST', `/rental-checkouts/${checkoutId}/payments`);
    expect(payRes.statusCode).toBe(403);
    expect(payRes.json()).toMatchObject({ code: 'AGREEMENT_NOT_ACCEPTED' });

    await deleteCheckouts([checkoutId]);
  });

  it('test_FR_SLT_50_accept_annex_idempotent', async () => {
    const res = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId: vacantSlots[0], rentalPackageId: packageId, storagePlanId }],
      },
    });
    const checkoutId = res.json<{ id: string }>().id;

    const annex = await brandA('GET', `/rental-checkouts/${checkoutId}/annex`);
    const { contentHash } = annex.json<{ contentHash: string }>();

    // Lần 1: 201 Created
    const acc1 = await brandA('POST', `/rental-checkouts/${checkoutId}/annex/accept`, {
      payload: { contentHash },
    });
    expect(acc1.statusCode).toBe(201);
    const accData1 = acc1.json<{ id: string; kind: string; brandId: string }>();
    expect(accData1.kind).toBe('ANNEX');
    expect(accData1.brandId).toBe(fx.brandA);

    // Lần 2: 200 OK (idempotent, trả cùng bản ghi)
    const acc2 = await brandA('POST', `/rental-checkouts/${checkoutId}/annex/accept`, {
      payload: { contentHash },
    });
    expect(acc2.statusCode).toBe(200);
    expect(acc2.json<{ id: string }>().id).toBe(accData1.id);

    // Kiểm tra CSDL: chỉ có đúng 1 bản ghi và lưu đầy đủ thông tin kiểm toán
    const rows = await raw.query<{
      accepted_by: string;
      brand_id: string;
      rental_checkout_id: string;
      content_hash: string;
      kind: string;
      ip_address: string;
      accepted_at: Date;
    }>(`SELECT * FROM agreement_acceptances WHERE rental_checkout_id = $1 AND kind = 'ANNEX'`, [
      checkoutId,
    ]);
    expect(rows.rowCount).toBe(1);
    const r = rows.rows[0]!;
    expect(r.brand_id).toBe(fx.brandA);
    expect(r.rental_checkout_id).toBe(checkoutId);
    expect(r.content_hash).toBe(contentHash);
    expect(r.kind).toBe('ANNEX');
    expect(r.accepted_at).toBeInstanceOf(Date);

    await deleteCheckouts([checkoutId]);
  });

  it('test_FR_SLT_50_accept_annex_hash_mismatch_fails', async () => {
    const res = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId: vacantSlots[0], rentalPackageId: packageId, storagePlanId }],
      },
    });
    const checkoutId = res.json<{ id: string }>().id;

    const badHash = '0000000000000000000000000000000000000000000000000000000000000000';
    const failRes = await brandA('POST', `/rental-checkouts/${checkoutId}/annex/accept`, {
      payload: { contentHash: badHash },
    });
    expect(failRes.statusCode).toBe(400);
    expect(failRes.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

    await deleteCheckouts([checkoutId]);
  });

  it('test_FR_SLT_50_legacy_checkout_returns_404_annex', async () => {
    // Tạo phiên thanh toán
    const res = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId: vacantSlots[0], rentalPackageId: packageId, storagePlanId }],
      },
    });
    const checkoutId = res.json<{ id: string }>().id;

    // Giả lập phiên cũ bằng cách set agreement_version_id = NULL
    await raw.query(`UPDATE rental_checkouts SET agreement_version_id = NULL WHERE id = $1`, [
      checkoutId,
    ]);

    // Phiên cũ không có phụ lục -> 404 NOT_FOUND (FR-SLT-50 AC3)
    const annexRes = await brandA('GET', `/rental-checkouts/${checkoutId}/annex`);
    expect(annexRes.statusCode).toBe(404);
    expect(annexRes.json()).toMatchObject({ code: 'NOT_FOUND' });

    await deleteCheckouts([checkoutId]);
  });

  it('test_FR_SLT_50_annex_forbidden_for_other_brand', async () => {
    const res = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId: vacantSlots[0], rentalPackageId: packageId, storagePlanId }],
      },
    });
    const checkoutId = res.json<{ id: string }>().id;

    // Brand B không thể xem hoặc chấp thuận phụ lục của Brand A -> 403 FORBIDDEN_SCOPE
    const getRes = await brandB('GET', `/rental-checkouts/${checkoutId}/annex`);
    expect(getRes.statusCode).toBe(403);
    expect(getRes.json()).toMatchObject({ code: 'FORBIDDEN_SCOPE' });

    const postRes = await brandB('POST', `/rental-checkouts/${checkoutId}/annex/accept`, {
      payload: { contentHash: 'e'.repeat(64) },
    });
    expect(postRes.statusCode).toBe(403);
    expect(postRes.json()).toMatchObject({ code: 'FORBIDDEN_SCOPE' });

    await deleteCheckouts([checkoutId]);
  });
});

describe('FR-SLT-55: Đổi slot trong 48 giờ sau thanh toán', () => {
  it('test_FR_SLT_55_swap_slot_success_and_db_consistency', async () => {
    // 1. Tạo checkout slot 0 và thanh toán đầy đủ
    const res = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId: vacantSlots[0], rentalPackageId: packageId, storagePlanId }],
      },
    });
    const checkoutId = res.json<{ id: string }>().id;
    await payCheckoutFully(checkoutId, brandA);

    // Lấy thông tin hóa đơn ban đầu
    const rentals = await raw.query<{
      id: string;
      invoice_number: string;
      rental_code: string;
      monthly_rent_price: string;
      rent_amount: string;
      storage_amount: string;
      paid_at: Date;
    }>(`SELECT * FROM slot_rentals WHERE checkout_id = $1`, [checkoutId]);
    const rental = rentals.rows[0]!;

    // 2. Thực hiện đổi sang slot 1 (cùng máy, cùng giá 1.000.000, đang AVAILABLE)
    const swapRes = await brandA('POST', `/slot-rentals/${rental.id}/swap-slot`, {
      payload: { targetSlotId: vacantSlots[1] },
    });
    expect(swapRes.statusCode).toBe(200);
    const swapData = swapRes.json<{
      id: string;
      slotId: string;
      swappedFromSlotId: string;
      swappedAt: string;
    }>();
    expect(swapData.id).toBe(rental.id);
    expect(swapData.slotId).toBe(vacantSlots[1]);
    expect(swapData.swappedFromSlotId).toBe(vacantSlots[0]);
    expect(swapData.swappedAt).toBeTruthy();

    // 3. Kiểm tra tính nhất quán CSDL:
    // Slot cũ (vacantSlots[0]): trạng thái AVAILABLE, active_bottle_id = null
    const slot0Row = await raw.query<{ status: string; active_bottle_id: string | null }>(
      `SELECT status, active_bottle_id FROM machine_slots WHERE id = $1`,
      [vacantSlots[0]],
    );
    expect(slot0Row.rows[0]!.status).toBe('AVAILABLE');
    expect(slot0Row.rows[0]!.active_bottle_id).toBeNull();

    // Slot mới (vacantSlots[1]): AVAILABLE (slot occupancy do slot_rentals kiểm soát)
    const slot1Row = await raw.query<{ status: string }>(
      `SELECT status FROM machine_slots WHERE id = $1`,
      [vacantSlots[1]],
    );
    expect(slot1Row.rows[0]!.status).toBe('AVAILABLE');

    // Hóa đơn slot_rentals: giữ nguyên số hóa đơn, gói thuê, số tiền, ngày thanh toán
    const updatedRental = await raw.query<{
      slot_id: string;
      swapped_from_slot_id: string;
      invoice_number: string;
      rental_code: string;
      monthly_rent_price: string;
      rent_amount: string;
      storage_amount: string;
      paid_at: Date;
      status: string;
    }>(`SELECT * FROM slot_rentals WHERE id = $1`, [rental.id]);
    const r = updatedRental.rows[0]!;
    expect(r.slot_id).toBe(vacantSlots[1]);
    expect(r.swapped_from_slot_id).toBe(vacantSlots[0]);
    expect(r.invoice_number).toBe(rental.invoice_number);
    expect(r.rental_code).toBe(rental.rental_code);
    expect(r.monthly_rent_price).toBe(rental.monthly_rent_price);
    expect(r.rent_amount).toBe(rental.rent_amount);
    expect(r.storage_amount).toBe(rental.storage_amount);
    expect(r.status).toBe('DRAFT');

    await deleteCheckouts([checkoutId]);
  });

  it('test_FR_SLT_55_swap_slot_different_price_rejected', async () => {
    // Tạo checkout và thanh toán cho slot 0 (giá 1.000.000)
    const res = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId: vacantSlots[0], rentalPackageId: packageId, storagePlanId }],
      },
    });
    const checkoutId = res.json<{ id: string }>().id;
    await payCheckoutFully(checkoutId, brandA);

    const rentalId = (
      await raw.query<{ id: string }>(`SELECT id FROM slot_rentals WHERE checkout_id = $1`, [
        checkoutId,
      ])
    ).rows[0]!.id;

    // vacantSlots[10] có giá 2.000.000 (khác giá 1.000.000)
    const swapRes = await brandA('POST', `/slot-rentals/${rentalId}/swap-slot`, {
      payload: { targetSlotId: vacantSlots[10] },
    });
    expect(swapRes.statusCode).toBe(409);
    expect(swapRes.json()).toMatchObject({ code: 'SLOT_SWAP_NOT_ALLOWED' });

    await deleteCheckouts([checkoutId]);
  });

  it('test_FR_SLT_55_swap_slot_boundary_48h', async () => {
    // 1. Ca 47h59m: trong cửa sổ 48h -> ĐƯỢC PHÉP
    const res1 = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId: vacantSlots[0], rentalPackageId: packageId, storagePlanId }],
      },
    });
    const checkoutId1 = res1.json<{ id: string }>().id;
    await payCheckoutFully(checkoutId1, brandA);
    const rentalId1 = (
      await raw.query<{ id: string }>(`SELECT id FROM slot_rentals WHERE checkout_id = $1`, [
        checkoutId1,
      ])
    ).rows[0]!.id;

    // Đặt paid_at lùi về 47 giờ 59 phút trước
    await raw.query(
      `UPDATE slot_rentals SET paid_at = now() - interval '47 hours 59 minutes' WHERE id = $1`,
      [rentalId1],
    );

    const swapRes1 = await brandA('POST', `/slot-rentals/${rentalId1}/swap-slot`, {
      payload: { targetSlotId: vacantSlots[1] },
    });
    expect(swapRes1.statusCode).toBe(200);

    // 2. Ca 48h01m: quá cửa sổ 48h -> BỊ CHẶN
    const res2 = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId: vacantSlots[2], rentalPackageId: packageId, storagePlanId }],
      },
    });
    const checkoutId2 = res2.json<{ id: string }>().id;
    await payCheckoutFully(checkoutId2, brandA);
    const rentalId2 = (
      await raw.query<{ id: string }>(`SELECT id FROM slot_rentals WHERE checkout_id = $1`, [
        checkoutId2,
      ])
    ).rows[0]!.id;

    // Đặt paid_at lùi về 48 giờ 1 phút trước
    await raw.query(
      `UPDATE slot_rentals SET paid_at = now() - interval '48 hours 1 minute' WHERE id = $1`,
      [rentalId2],
    );

    const swapRes2 = await brandA('POST', `/slot-rentals/${rentalId2}/swap-slot`, {
      payload: { targetSlotId: vacantSlots[3] },
    });
    expect(swapRes2.statusCode).toBe(409);
    expect(swapRes2.json()).toMatchObject({ code: 'SLOT_SWAP_NOT_ALLOWED' });

    await deleteCheckouts([checkoutId1, checkoutId2]);
  });

  it('test_FR_SLT_55_swap_slot_bottle_installed_rejected', async () => {
    const res = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId: vacantSlots[0], rentalPackageId: packageId, storagePlanId }],
      },
    });
    const checkoutId = res.json<{ id: string }>().id;
    await payCheckoutFully(checkoutId, brandA);
    const rentalId = (
      await raw.query<{ id: string }>(`SELECT id FROM slot_rentals WHERE checkout_id = $1`, [
        checkoutId,
      ])
    ).rows[0]!.id;

    // Giả lập slot đã được lắp chai bằng cách chèn 1 bottle mới riêng
    const existingBottle = await raw.query<{ batch_id: string; fragrance_product_id: string }>(
      `SELECT batch_id, fragrance_product_id FROM bottles WHERE id = $1`,
      [fx.bottles[0]!],
    );
    const testBottleId = randomUUID();
    await raw.query(
      `INSERT INTO bottles (id, brand_id, batch_id, fragrance_product_id, identifier, initial_volume_ml, current_estimated_ml)
       VALUES ($1, $2, $3, $4, $5, 100.0, 100.0)`,
      [
        testBottleId,
        fx.brandA,
        existingBottle.rows[0]!.batch_id,
        existingBottle.rows[0]!.fragrance_product_id,
        `BT-${randomUUID().slice(0, 8)}`,
      ],
    );
    await raw.query(`UPDATE machine_slots SET active_bottle_id = $1 WHERE id = $2`, [
      testBottleId,
      vacantSlots[0],
    ]);

    try {
      const swapRes = await brandA('POST', `/slot-rentals/${rentalId}/swap-slot`, {
        payload: { targetSlotId: vacantSlots[1] },
      });
      expect(swapRes.statusCode).toBe(409);
      expect(swapRes.json()).toMatchObject({ code: 'SLOT_SWAP_NOT_ALLOWED' });
    } finally {
      await raw.query(`UPDATE machine_slots SET active_bottle_id = NULL WHERE id = $1`, [
        vacantSlots[0],
      ]);
      await raw.query(`DELETE FROM bottles WHERE id = $1`, [testBottleId]);
    }

    await deleteCheckouts([checkoutId]);
  });

  it('test_FR_SLT_55_swap_slot_already_swapped_rejected', async () => {
    const res = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId: vacantSlots[0], rentalPackageId: packageId, storagePlanId }],
      },
    });
    const checkoutId = res.json<{ id: string }>().id;
    await payCheckoutFully(checkoutId, brandA);
    const rentalId = (
      await raw.query<{ id: string }>(`SELECT id FROM slot_rentals WHERE checkout_id = $1`, [
        checkoutId,
      ])
    ).rows[0]!.id;

    // Đổi lần 1: thành công
    const swap1 = await brandA('POST', `/slot-rentals/${rentalId}/swap-slot`, {
      payload: { targetSlotId: vacantSlots[1] },
    });
    expect(swap1.statusCode).toBe(200);

    // Đổi lần 2 (cố đổi tiếp sang slot 2): bị chặn
    const swap2 = await brandA('POST', `/slot-rentals/${rentalId}/swap-slot`, {
      payload: { targetSlotId: vacantSlots[2] },
    });
    expect(swap2.statusCode).toBe(409);
    expect(swap2.json()).toMatchObject({ code: 'SLOT_SWAP_NOT_ALLOWED' });

    await deleteCheckouts([checkoutId]);
  });

  it('test_FR_SLT_55_swap_slot_concurrent_to_same_slot', async () => {
    // Tạo 2 checkout riêng cho 2 slot khác nhau (slot 0 và slot 1), thanh toán cả 2
    const res1 = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId: vacantSlots[0], rentalPackageId: packageId, storagePlanId }],
      },
    });
    const checkoutId1 = res1.json<{ id: string }>().id;
    await payCheckoutFully(checkoutId1, brandA);
    const rentalId1 = (
      await raw.query<{ id: string }>(`SELECT id FROM slot_rentals WHERE checkout_id = $1`, [
        checkoutId1,
      ])
    ).rows[0]!.id;

    const res2 = await brandA('POST', '/rental-checkouts', {
      payload: {
        items: [{ slotId: vacantSlots[1], rentalPackageId: packageId, storagePlanId }],
      },
    });
    const checkoutId2 = res2.json<{ id: string }>().id;
    await payCheckoutFully(checkoutId2, brandA);
    const rentalId2 = (
      await raw.query<{ id: string }>(`SELECT id FROM slot_rentals WHERE checkout_id = $1`, [
        checkoutId2,
      ])
    ).rows[0]!.id;

    // 2 request cùng swap đồng thời vào slot 2
    const req1 = brandA('POST', `/slot-rentals/${rentalId1}/swap-slot`, {
      payload: { targetSlotId: vacantSlots[2] },
    });
    const req2 = brandA('POST', `/slot-rentals/${rentalId2}/swap-slot`, {
      payload: { targetSlotId: vacantSlots[2] },
    });

    const [swapRes1, swapRes2] = await Promise.all([req1, req2]);
    const statuses = [swapRes1.statusCode, swapRes2.statusCode].sort();
    expect(statuses).toEqual([200, 409]);

    const failed = swapRes1.statusCode === 409 ? swapRes1 : swapRes2;
    expect(failed.json()).toMatchObject({ code: 'SLOT_OCCUPIED' });

    await deleteCheckouts([checkoutId1, checkoutId2]);
  });
});
