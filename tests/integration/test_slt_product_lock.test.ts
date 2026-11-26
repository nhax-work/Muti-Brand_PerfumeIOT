/**
 * Khóa đổi sản phẩm của slot trên PostgreSQL thật (FR-SLT-28, ADR-0035): đã lắp chai cho hóa đơn, kho
 * có hàng lắp được của sản phẩm đang gán, phiếu nạp mở, yêu cầu bổ sung chưa kết thúc. Lý do khóa tính
 * bằng SQL nên phải thử trên CSDL thật — gồm cả ca lô bị từ chối và chai hết hạn tự mở khóa.
 *
 * Dùng slot 2 của fixture (`rentals[1]`, thương hiệu A, `products[1]`). Fixture lắp chai thẳng vào slot
 * không qua phiếu nạp; tháo chai ra là slot coi như chưa lắp cho hóa đơn.
 */

import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { asUser, createTestApp, login } from './helpers/app.js';
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
let asBrandA: ReturnType<typeof asUser>;

/** Hóa đơn, slot và hai sản phẩm của thương hiệu A dùng trong file này. */
let rentalId: string;
let slotId: string;
let productId: string;
let otherProductId: string;

beforeAll(async () => {
  raw = await openRawClient();
  fx = await seedIsolationFixture(raw);
  rentalId = fx.rentals[1]!;
  slotId = fx.slots[1]!;
  productId = fx.products[1]!;
  otherProductId = fx.products[0]!;
  // Gán và đổi sản phẩm cần hóa đơn đã thanh toán (FR-SLT-27); đã thanh toán thì phải có số hóa đơn.
  await raw.query(
    `UPDATE slot_rentals SET paid_at = now() - interval '10 days',
            invoice_number = 'HD-LOCK-' || left(id::text, 8)
      WHERE id = ANY($1)`,
    [fx.rentals],
  );
  app = await createTestApp();
  asBrandA = asUser(app, (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken);
});

afterAll(async () => {
  await app?.close();
  if (fx) await cleanupIsolationFixture(raw, fx);
  await raw?.end();
});

/** Hóa đơn cũ dựng làm chuỗi gia hạn trước `rentalId` — gỡ ở mỗi ca. */
const predecessors: string[] = [];

/** Mỗi ca bắt đầu từ slot chưa lắp chai, kho trống, không phiếu nạp, không yêu cầu bổ sung. */
beforeEach(async () => {
  await raw.query(`UPDATE slot_rentals SET previous_rental_id = NULL WHERE id = $1`, [rentalId]);
  if (predecessors.length > 0) {
    await raw.query(`DELETE FROM slot_rentals WHERE id = ANY($1)`, [predecessors.splice(0)]);
  }
  await raw.query(`UPDATE machine_slots SET active_bottle_id = NULL WHERE id = $1`, [slotId]);
  await raw.query(`DELETE FROM refill_requests WHERE slot_id = $1`, [slotId]);
  await raw.query(`DELETE FROM refill_sessions WHERE slot_id = $1`, [slotId]);
  await raw.query(`DELETE FROM bottles WHERE identifier LIKE 'LOCK-%'`);
  await raw.query(`DELETE FROM inventory_batches WHERE batch_number LIKE 'LOCK-%'`);
  await raw.query(`DELETE FROM notifications WHERE type = 'SLOT_PRODUCT_CHANGED'`);
  await raw.query(
    `UPDATE slot_rentals SET fragrance_product_id = $2, price_per_spray = '35000.0000' WHERE id = $1`,
    [rentalId, productId],
  );
});

async function changeProduct(to: string) {
  return asBrandA('PUT', `/slot-rentals/${rentalId}/product`, {
    payload: { fragranceProductId: to },
  });
}

async function lockReason(): Promise<string | null> {
  const res = await asBrandA('GET', `/slot-rentals/${rentalId}`);
  expect(res.statusCode).toBe(200);
  return res.json<{ productLockReason?: string | null }>().productLockReason ?? null;
}

async function currentProduct(): Promise<string> {
  const res = await raw.query<{ fragrance_product_id: string }>(
    'SELECT fragrance_product_id FROM slot_rentals WHERE id = $1',
    [rentalId],
  );
  return res.rows[0]!.fragrance_product_id;
}

/**
 * Một hóa đơn cũ đã gia hạn (`RENEWED`) trên cùng slot, thanh toán `paidDaysAgo` ngày trước.
 * `RENEWED` nằm ngoài `uq_slot_active_rental` và `excl_slot_rental_overlap` nên không đụng hóa đơn
 * đang chạy của fixture.
 */
async function pastRental(paidDaysAgo: number, previousId: string | null): Promise<string> {
  const id = randomUUID();
  predecessors.push(id);
  await raw.query(
    `INSERT INTO slot_rentals (id, slot_id, brand_id, fragrance_product_id, product_assigned_at,
                               previous_rental_id, status, starts_at, ends_at, price_per_spray,
                               created_by, paid_at, invoice_number)
     VALUES ($1, $2, $3, $4, now() - make_interval(days => $5),
             $6, 'RENEWED', now() - make_interval(days => $5), now() - make_interval(days => $5 - 30),
             '35000.0000', $7, now() - make_interval(days => $5), $8)`,
    [
      id,
      slotId,
      fx.brandA,
      productId,
      paidDaysAgo,
      previousId,
      fx.superAdminId,
      `HD-LOCKPREV-${id.slice(0, 8)}`,
    ],
  );
  return id;
}

/** Một lô của sản phẩm đang gán kèm một chai `IN_STOCK` trong kho. */
async function stockBottle(opts: {
  authenticity: 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  expiresAt?: string;
}): Promise<void> {
  const batchId = randomUUID();
  const submitted = opts.authenticity !== 'NOT_SUBMITTED';
  const verified = opts.authenticity === 'APPROVED' || opts.authenticity === 'REJECTED';
  // Đủ cột theo các CHECK chk_batch_authenticity_* của từng trạng thái giấy tờ.
  await raw.query(
    `INSERT INTO inventory_batches (id, brand_id, fragrance_product_id, batch_number, received_at,
                                    quantity_received, created_by, authenticity_status,
                                    authenticity_document_url, authenticity_submitted_by,
                                    authenticity_submitted_at, authenticity_verified_by,
                                    authenticity_verified_at, authenticity_rejection_reason)
     VALUES ($1, $2, $3, $4, now(), 1, $5, $6,
             $7, $8, CASE WHEN $9::boolean THEN now() END,
             $10, CASE WHEN $11::boolean THEN now() END, $12)`,
    [
      batchId,
      fx.brandA,
      productId,
      `LOCK-${randomUUID().slice(0, 8)}`,
      fx.superAdminId,
      opts.authenticity,
      submitted ? 'https://example.test/coa.pdf' : null,
      submitted ? fx.superAdminId : null,
      submitted,
      verified ? fx.superAdminId : null,
      verified,
      opts.authenticity === 'REJECTED' ? 'Giấy tờ không khớp lô' : null,
    ],
  );
  await raw.query(
    `INSERT INTO bottles (id, brand_id, owner, batch_id, fragrance_product_id, identifier, status,
                          initial_volume_ml, current_estimated_ml, expires_at)
     VALUES ($1, $2, 'BRAND', $3, $4, $5, 'IN_STOCK', 50.0000, 50.0000, $6)`,
    [
      randomUUID(),
      fx.brandA,
      batchId,
      productId,
      `LOCK-${randomUUID().slice(0, 8)}`,
      opts.expiresAt ?? new Date(Date.now() + 365 * 86_400_000).toISOString(),
    ],
  );
}

describe('Khóa đổi sản phẩm của slot (FR-SLT-28, ADR-0035)', () => {
  it('test_FR_SLT_28_change_slot_product', async () => {
    expect(await lockReason()).toBeNull();

    const res = await changeProduct(otherProductId);

    expect(res.statusCode).toBe(200);
    expect(res.json<{ fragranceProductId: string }>().fragranceProductId).toBe(otherProductId);
    expect(await currentProduct()).toBe(otherProductId);
  });

  it('test_FR_SLT_28_notify_inventory_on_change', async () => {
    expect((await changeProduct(otherProductId)).statusCode).toBe(200);

    // Super Admin của fixture có quyền inventory.manage (AC9).
    const sent = await raw.query<{ brand_id: string; reference_id: string; content: string }>(
      `SELECT brand_id, reference_id, content FROM notifications
        WHERE type = 'SLOT_PRODUCT_CHANGED' AND recipient_user_id = $1`,
      [fx.superAdminId],
    );
    expect(sent.rows).toHaveLength(1);
    expect(sent.rows[0]).toMatchObject({ brand_id: fx.brandA, reference_id: rentalId });
  });

  it('test_FR_SLT_28_reject_change_after_install', async () => {
    // AC3: slot đang có chai của thương hiệu.
    await raw.query(`UPDATE machine_slots SET active_bottle_id = $1 WHERE id = $2`, [
      fx.bottles[1],
      slotId,
    ]);
    expect(await lockReason()).toBe('INSTALLED');
    const res = await changeProduct(otherProductId);
    expect(res.statusCode).toBe(409);
    expect(res.json<{ code: string }>().code).toBe('SLOT_PRODUCT_LOCKED');
    expect(await currentProduct()).toBe(productId);
  });

  it('test_FR_SLT_28_reject_change_after_install_even_when_bottle_removed', async () => {
    // AC3: đã có phiếu nạp hoàn tất kể từ lúc thanh toán — khóa tới hết hóa đơn dù slot đã trống.
    await raw.query(
      `INSERT INTO refill_sessions (brand_id, machine_id, slot_id, new_bottle_id, performed_by,
                                    status, checklist_completed, started_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, 'COMPLETED', true, now() - interval '2 days',
               now() - interval '2 days')`,
      [fx.brandA, fx.machineId, slotId, fx.bottles[1], fx.superAdminId],
    );
    expect(await lockReason()).toBe('INSTALLED');
    expect((await changeProduct(otherProductId)).statusCode).toBe(409);
  });

  it('test_FR_SLT_28_install_before_payment_does_not_lock', async () => {
    // Phiếu nạp hoàn tất trước lúc thanh toán hóa đơn này (hóa đơn cũ của slot) không tính là đã lắp.
    await raw.query(
      `INSERT INTO refill_sessions (brand_id, machine_id, slot_id, new_bottle_id, performed_by,
                                    status, checklist_completed, started_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, 'COMPLETED', true, now() - interval '40 days',
               now() - interval '40 days')`,
      [fx.brandA, fx.machineId, slotId, fx.bottles[1], fx.superAdminId],
    );
    expect(await lockReason()).toBeNull();
  });

  it('test_FR_SLT_28_renewal_inherits_install_lock', async () => {
    // AC3: hóa đơn gia hạn không lắp lại chai — chai lắp từ hóa đơn gốc của chuỗi vẫn khóa slot.
    // Chuỗi: gốc (thanh toán 130 ngày trước) → gia hạn 1 (70 ngày) → hóa đơn đang xét (10 ngày).
    // Phiếu nạp hoàn tất 100 ngày trước: sau gốc, trước gia hạn 1 — chỉ tính khi đi hết chuỗi.
    await raw.query(
      `INSERT INTO refill_sessions (brand_id, machine_id, slot_id, new_bottle_id, performed_by,
                                    status, checklist_completed, started_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, 'COMPLETED', true, now() - interval '100 days',
               now() - interval '100 days')`,
      [fx.brandA, fx.machineId, slotId, fx.bottles[1], fx.superAdminId],
    );
    const firstRenewal = await pastRental(70, null);
    await raw.query(`UPDATE slot_rentals SET previous_rental_id = $2 WHERE id = $1`, [
      rentalId,
      firstRenewal,
    ]);
    // Chuỗi mới có một mắt xích, bắt đầu sau lúc lắp — chưa khóa.
    expect(await lockReason()).toBeNull();

    const root = await pastRental(130, null);
    await raw.query(`UPDATE slot_rentals SET previous_rental_id = $2 WHERE id = $1`, [
      firstRenewal,
      root,
    ]);
    expect(await lockReason()).toBe('INSTALLED');
    const res = await changeProduct(otherProductId);
    expect(res.statusCode).toBe(409);
    expect(res.json<{ code: string }>().code).toBe('SLOT_PRODUCT_LOCKED');
    expect(await currentProduct()).toBe(productId);
  });

  it('test_FR_SLT_28_reject_change_with_stock_in_warehouse', async () => {
    // AC4: hàng đã về kho — kể cả khi giấy tờ lô chưa nộp hoặc chờ duyệt.
    for (const authenticity of ['NOT_SUBMITTED', 'PENDING', 'APPROVED'] as const) {
      await raw.query(`DELETE FROM bottles WHERE identifier LIKE 'LOCK-%'`);
      await raw.query(`DELETE FROM inventory_batches WHERE batch_number LIKE 'LOCK-%'`);
      await stockBottle({ authenticity });
      expect(await lockReason()).toBe('STOCK_IN_WAREHOUSE');
      const res = await changeProduct(otherProductId);
      expect(res.statusCode).toBe(409);
      expect(res.json<{ code: string }>().code).toBe('SLOT_PRODUCT_LOCKED');
    }
    expect(await currentProduct()).toBe(productId);
  });

  it('test_FR_SLT_28_rejected_or_expired_stock_does_not_lock', async () => {
    // AC5: lô bị từ chối giấy tờ và chai hết hạn không lắp được — không khóa slot vào sản phẩm đó.
    await stockBottle({ authenticity: 'REJECTED' });
    await stockBottle({
      authenticity: 'APPROVED',
      expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
    });
    expect(await lockReason()).toBeNull();
    expect((await changeProduct(otherProductId)).statusCode).toBe(200);
  });

  it('test_FR_SLT_28_reject_change_while_refilling', async () => {
    // AC7: phiếu nạp đang mở.
    await raw.query(
      `INSERT INTO refill_sessions (brand_id, machine_id, slot_id, performed_by, status)
       VALUES ($1, $2, $3, $4, 'STARTED')`,
      [fx.brandA, fx.machineId, slotId, fx.superAdminId],
    );
    expect(await lockReason()).toBe('REFILL_IN_PROGRESS');
    let res = await changeProduct(otherProductId);
    expect(res.statusCode).toBe(409);
    expect(res.json<{ code: string }>().code).toBe('REFILL_SESSION_OPEN');

    // AC7: yêu cầu bổ sung chưa kết thúc.
    await raw.query(`DELETE FROM refill_sessions WHERE slot_id = $1`, [slotId]);
    await raw.query(
      `INSERT INTO refill_requests (brand_id, slot_rental_id, slot_id, fragrance_product_id, reason,
                                    status, requested_by)
       VALUES ($1, $2, $3, $4, 'LOW_STOCK', 'ACCEPTED', $5)`,
      [fx.brandA, rentalId, slotId, productId, fx.superAdminId],
    );
    expect(await lockReason()).toBe('REFILL_IN_PROGRESS');
    res = await changeProduct(otherProductId);
    expect(res.statusCode).toBe(409);
    expect(res.json<{ code: string }>().code).toBe('REFILL_REQUEST_PENDING');
    expect(await currentProduct()).toBe(productId);
  });

  it('test_FR_SLT_28_resave_same_product_ignores_lock', async () => {
    // AC8: lưu lại đúng sản phẩm đang gán không bị chặn và không báo kho.
    await raw.query(`UPDATE machine_slots SET active_bottle_id = $1 WHERE id = $2`, [
      fx.bottles[1],
      slotId,
    ]);
    expect((await changeProduct(productId)).statusCode).toBe(200);
    const sent = await raw.query(
      `SELECT 1 FROM notifications WHERE type = 'SLOT_PRODUCT_CHANGED' AND reference_id = $1`,
      [rentalId],
    );
    expect(sent.rowCount).toBe(0);
  });

  it('test_FR_SLT_28_change_keeps_stocking_deadline', async () => {
    // AC10: hạn lắp chai tính từ paid_at — đổi sản phẩm không chạm tới paid_at.
    const before = await raw.query<{ paid_at: Date }>(
      'SELECT paid_at FROM slot_rentals WHERE id = $1',
      [rentalId],
    );
    expect((await changeProduct(otherProductId)).statusCode).toBe(200);
    const after = await raw.query<{ paid_at: Date; product_assigned_at: Date }>(
      'SELECT paid_at, product_assigned_at FROM slot_rentals WHERE id = $1',
      [rentalId],
    );
    expect(after.rows[0]!.paid_at.getTime()).toBe(before.rows[0]!.paid_at.getTime());
    expect(after.rows[0]!.product_assigned_at.getTime()).toBeGreaterThan(
      after.rows[0]!.paid_at.getTime(),
    );
  });
});
