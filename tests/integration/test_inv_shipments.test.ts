/**
 * INV trên PostgreSQL thật: khai báo gửi hàng, tiếp nhận, lô tự tạo (FR-INV-22 ÷ 28) và giấy tờ chính
 * hãng của lô (FR-INV-33, 34) — theo openapi.yaml và ADR-0017.
 *
 * Đi qua HTTP thật (AccessGuard → phạm vi thương hiệu → service → CSDL), vì phần lớn lỗi cần chứng
 * minh nằm ở phân quyền, cô lập dữ liệu và transaction — mock queries thì không thấy được.
 */

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestApp, login } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
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
let inventoryStaff: PlatformStaff;
let brandA: ReturnType<typeof asUser>;
let brandB: ReturnType<typeof asUser>;
let superAdmin: ReturnType<typeof asUser>;
let staff: ReturnType<typeof asUser>;

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  inventoryStaff = await seedPlatformStaff(client, fx, 'INVENTORY_STAFF', [
    'inventory.manage',
    'inventory.adjust',
  ]);
  app = await createTestApp();
  brandA = asUser(app, (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken);
  brandB = asUser(app, (await login(app, fx.brandAdminBEmail, TEST_PASSWORD)).accessToken);
  superAdmin = asUser(app, (await login(app, fx.superAdminEmail, TEST_PASSWORD)).accessToken);
  staff = asUser(app, (await login(app, inventoryStaff.email, TEST_PASSWORD)).accessToken);
}, 60_000);

afterAll(async () => {
  await cleanupIsolationFixture(client, fx);
  await inventoryStaff.cleanup();
  await app.close();
  await client.end();
});

interface Declaration {
  id: string;
  brandId: string;
  status: string;
  receivedQuantity: number | null;
  discrepancyNotes: string | null;
  receivedBy: string | null;
  receivedAt: string | null;
  resultingBatchId: string | null;
  productName: string;
}

interface Batch {
  id: string;
  brandId: string;
  fragranceProductId: string;
  sourceDeclarationId: string | null;
  quantityReceived: number;
  authenticityStatus: string;
  authenticityRejectionReason: string | null;
  authenticityVerifiedAt: string | null;
}

/** Brand A khai báo sản phẩm thứ `product` của fixture (0, 1: của A). */
async function declare(quantity = 10, product = 0): Promise<Declaration> {
  const res = await brandA('POST', '/shipment-declarations', {
    payload: {
      fragranceProductId: fx.products[product],
      declaredQuantity: quantity,
      declaredBottleVolumeMl: 50,
      expectedShipDate: '2026-11-01',
    },
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json<Declaration>();
}

let batchSeq = 0;
function receive(id: string, receivedQuantity: number, discrepancyNotes?: string) {
  batchSeq += 1;
  return staff('POST', `/shipment-declarations/${id}/receive`, {
    payload: {
      receivedQuantity,
      batchNumber: `LOT-${fx.runId}-R${batchSeq}`,
      ...(discrepancyNotes ? { discrepancyNotes } : {}),
    },
  });
}

async function receivedBatch(): Promise<Batch> {
  const declaration = await declare(6);
  const res = await receive(declaration.id, 6);
  expect(res.statusCode, res.body).toBe(200);
  return res.json<{ batch: Batch }>().batch;
}

describe('Khai báo gửi hàng (FR-INV-22, 23, 27, 28)', () => {
  it('test_FR_INV_22_declare_shipment — Brand Admin khai báo, bản ghi DECLARED gắn đúng thương hiệu', async () => {
    const declaration = await declare(12);
    expect(declaration).toMatchObject({
      brandId: fx.brandA,
      status: 'DECLARED',
      receivedQuantity: null,
      resultingBatchId: null,
    });
    const audit = await client.query(
      `SELECT 1 FROM audit_logs WHERE action = 'inv.shipment.declared' AND target_id = $1`,
      [declaration.id],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('test_FR_INV_22_reject_other_brand_product — sản phẩm của thương hiệu khác trả PRODUCT_NOT_OWNED', async () => {
    const res = await brandA('POST', '/shipment-declarations', {
      payload: {
        fragranceProductId: fx.products[2],
        declaredQuantity: 5,
        declaredBottleVolumeMl: 50,
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'PRODUCT_NOT_OWNED' });
  });

  it('test_FR_INV_22_reject_non_positive_quantity — số lượng 0 bị từ chối, CSDL cũng chặn', async () => {
    const res = await brandA('POST', '/shipment-declarations', {
      payload: {
        fragranceProductId: fx.products[0],
        declaredQuantity: 0,
        declaredBottleVolumeMl: 50,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      client.query(
        `INSERT INTO brand_shipment_declarations (brand_id, fragrance_product_id, declared_quantity,
                                                  declared_bottle_volume_ml, declared_by)
         SELECT $1, $2, 0, 50, id FROM users WHERE email = $3`,
        [fx.brandA, fx.products[0], fx.brandAdminAEmail],
      ),
    ).rejects.toThrow(/chk_declared_quantity_positive/);
  });

  it('test_FR_INV_22_product_brand_fk — CSDL chặn khai báo sản phẩm khác thương hiệu (ADR-0017)', async () => {
    await expect(
      client.query(
        `INSERT INTO brand_shipment_declarations (brand_id, fragrance_product_id, declared_quantity,
                                                  declared_bottle_volume_ml, declared_by)
         SELECT $1, $2, 3, 50, id FROM users WHERE email = $3`,
        [fx.brandA, fx.products[2], fx.brandAdminAEmail],
      ),
    ).rejects.toThrow(/fk_shipment_product_same_brand/);
  });

  it('tài khoản nền tảng không khai báo thay thương hiệu', async () => {
    const res = await superAdmin('POST', '/shipment-declarations', {
      payload: {
        fragranceProductId: fx.products[0],
        declaredQuantity: 1,
        declaredBottleVolumeMl: 50,
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'FORBIDDEN_SCOPE' });
  });

  it('test_FR_INV_23_declaration_status_set — trạng thái ngoài tập bị CSDL từ chối', async () => {
    const declaration = await declare(2);
    await expect(
      client.query(`UPDATE brand_shipment_declarations SET status = 'LOST' WHERE id = $1`, [
        declaration.id,
      ]),
    ).rejects.toThrow(/shipment_declaration_status/);
  });

  it('test_FR_INV_27_list_own_shipments — Brand A thấy khai báo của mình, Brand B không thấy của A', async () => {
    const declaration = await declare(3);
    const mine = (await brandA('GET', '/shipment-declarations?pageSize=200')).json<{
      items: Declaration[];
    }>().items;
    expect(mine.some((d) => d.id === declaration.id)).toBe(true);
    expect(mine.every((d) => d.brandId === fx.brandA)).toBe(true);

    const other = (await brandB('GET', '/shipment-declarations?pageSize=200')).json<{
      items: Declaration[];
    }>().items;
    expect(other.some((d) => d.brandId === fx.brandA)).toBe(false);
  });

  it('test_FR_INV_28_notify_new_shipment — Inventory Staff nhận thông báo khi có khai báo mới', async () => {
    const declaration = await declare(4);
    const res = await client.query(
      `SELECT channel, status FROM notifications
        WHERE recipient_user_id = $1 AND type = 'SHIPMENT_DECLARED' AND reference_id = $2`,
      [inventoryStaff.userId, declaration.id],
    );
    expect(res.rows).toEqual([{ channel: 'IN_APP', status: 'SENT' }]);
  });
});

describe('Tiếp nhận và đối chiếu (FR-INV-24, 25, 26)', () => {
  it('test_FR_INV_24_reconcile_shipment — nhận đủ thì RECEIVED, ghi người và thời điểm nhận', async () => {
    const declaration = await declare(8);
    const res = await receive(declaration.id, 8);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json<{ declaration: Declaration }>().declaration).toMatchObject({
      status: 'RECEIVED',
      receivedQuantity: 8,
      receivedBy: inventoryStaff.userId,
      discrepancyNotes: null,
    });
    expect(res.json<{ declaration: Declaration }>().declaration.receivedAt).not.toBeNull();

    const again = await receive(declaration.id, 8);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ code: 'SHIPMENT_ALREADY_PROCESSED' });
  });

  it('test_FR_INV_24_forbid_non_inventory_staff — Brand Admin không tiếp nhận được', async () => {
    const declaration = await declare(2);
    const res = await brandA('POST', `/shipment-declarations/${declaration.id}/receive`, {
      payload: { receivedQuantity: 2, batchNumber: `LOT-${fx.runId}-X` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'FORBIDDEN_SCOPE' });
  });

  it('test_FR_INV_24_concurrent_receive — hai lần tiếp nhận cùng lúc chỉ tạo đúng một lô', async () => {
    const declaration = await declare(5);
    const results = await Promise.all([receive(declaration.id, 5), receive(declaration.id, 5)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const batches = await client.query(
      `SELECT id FROM inventory_batches WHERE source_declaration_id = $1`,
      [declaration.id],
    );
    expect(batches.rowCount).toBe(1);
  });

  it('test_FR_INV_25_shipment_discrepancy — lệch số mà thiếu ghi chú bị từ chối, trạng thái giữ nguyên', async () => {
    const declaration = await declare(10);
    const missing = await receive(declaration.id, 9);
    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    const row = await client.query(`SELECT status FROM brand_shipment_declarations WHERE id = $1`, [
      declaration.id,
    ]);
    expect(row.rows[0]).toEqual({ status: 'DECLARED' });

    const res = await receive(declaration.id, 9, 'Vỡ 1 chai khi vận chuyển');
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json<{ declaration: Declaration; batch: Batch }>()).toMatchObject({
      declaration: { status: 'DISCREPANCY', discrepancyNotes: 'Vỡ 1 chai khi vận chuyển' },
      batch: { quantityReceived: 9 },
    });
  });

  it('test_FR_INV_25_receive_zero_creates_no_batch — nhận 0 chai: DISCREPANCY, batch null, không tạo lô', async () => {
    const declaration = await declare(4);
    const res = await receive(declaration.id, 0, 'Không nhận được kiện hàng');
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ declaration: { status: 'DISCREPANCY' }, batch: null });
    const batches = await client.query(
      `SELECT 1 FROM inventory_batches WHERE source_declaration_id = $1`,
      [declaration.id],
    );
    expect(batches.rowCount).toBe(0);
  });

  it('test_FR_INV_26_auto_create_batch_on_receive — lô lấy thương hiệu, sản phẩm từ khai báo và trỏ ngược về nó', async () => {
    const declaration = await declare(7, 1);
    const res = await receive(declaration.id, 7);
    const { batch, declaration: after } = res.json<{ batch: Batch; declaration: Declaration }>();
    expect(batch).toMatchObject({
      brandId: fx.brandA,
      fragranceProductId: fx.products[1],
      sourceDeclarationId: declaration.id,
      quantityReceived: 7,
      authenticityStatus: 'NOT_SUBMITTED',
    });
    expect(after.resultingBatchId).toBe(batch.id);
  });

  it('test_FR_INV_26_duplicate_batch_number_rolls_back — trùng số lô thì cả lần tiếp nhận bị hủy', async () => {
    const first = await declare(3);
    batchSeq += 1;
    const batchNumber = `LOT-${fx.runId}-DUP`;
    const ok = await staff('POST', `/shipment-declarations/${first.id}/receive`, {
      payload: { receivedQuantity: 3, batchNumber },
    });
    expect(ok.statusCode, ok.body).toBe(200);

    const second = await declare(3);
    const dup = await staff('POST', `/shipment-declarations/${second.id}/receive`, {
      payload: { receivedQuantity: 3, batchNumber },
    });
    expect(dup.statusCode).toBe(400);
    expect(dup.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    const row = await client.query(`SELECT status FROM brand_shipment_declarations WHERE id = $1`, [
      second.id,
    ]);
    expect(row.rows[0]).toEqual({ status: 'DECLARED' });
  });
});

describe('Giấy tờ chính hãng của lô (FR-INV-33, 34)', () => {
  it('test_FR_INV_33_submit_authenticity_documents — Brand Admin nộp, lô chuyển PENDING và ghi nhật ký', async () => {
    const batch = await receivedBatch();
    const res = await brandA('POST', `/inventory-batches/${batch.id}/authenticity-documents`, {
      payload: { documentUrl: 'https://docs.test/hoa-don.pdf', documentType: 'PURCHASE_INVOICE' },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      authenticityStatus: 'PENDING',
      authenticityDocumentUrl: 'https://docs.test/hoa-don.pdf',
    });
    const audit = await client.query(
      `SELECT 1 FROM audit_logs WHERE action = 'inv.batch.authenticity_submitted' AND target_id = $1`,
      [batch.id],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('test_FR_INV_33_forbid_other_brand — Brand B nộp giấy tờ cho lô của A trả FORBIDDEN_SCOPE', async () => {
    const batch = await receivedBatch();
    const res = await brandB('POST', `/inventory-batches/${batch.id}/authenticity-documents`, {
      payload: { documentUrl: 'https://docs.test/gia.pdf' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'FORBIDDEN_SCOPE' });
  });

  it('test_FR_INV_33_submission_expired — không còn hóa đơn hiệu lực hay chờ nạp hàng thì quá hạn nộp', async () => {
    const batch = await receivedBatch();
    const rentals = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM slot_rentals WHERE brand_id = $1 AND status IN ('ACTIVE', 'EXPIRING', 'GRACE')`,
      [fx.brandA],
    );
    await client.query(`UPDATE slot_rentals SET status = 'TERMINATED' WHERE id = ANY($1::uuid[])`, [
      rentals.rows.map((r) => r.id),
    ]);
    try {
      const res = await brandA('POST', `/inventory-batches/${batch.id}/authenticity-documents`, {
        payload: { documentUrl: 'https://docs.test/tre.pdf' },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: 'DOCUMENT_SUBMISSION_EXPIRED' });
    } finally {
      for (const r of rentals.rows) {
        await client.query(`UPDATE slot_rentals SET status = $2 WHERE id = $1`, [r.id, r.status]);
      }
    }
  });

  it('test_FR_INV_34_review_authenticity_documents — chỉ duyệt lô PENDING, từ chối cần lý do, thông báo thương hiệu', async () => {
    const batch = await receivedBatch();
    const approve = (as: ReturnType<typeof asUser>) =>
      as('POST', `/inventory-batches/${batch.id}/approve-authenticity`);
    const reject = (reason?: string) =>
      superAdmin('POST', `/inventory-batches/${batch.id}/reject-authenticity`, {
        payload: reason === undefined ? {} : { reason },
      });

    // Chưa nộp giấy tờ thì không duyệt được — chặn lỗ "duyệt lô trống" làm vô hiệu FR-INV-35.
    const early = await approve(superAdmin);
    expect(early.statusCode).toBe(409);
    expect(early.json()).toMatchObject({ code: 'AUTHENTICITY_NOT_PENDING' });

    await brandA('POST', `/inventory-batches/${batch.id}/authenticity-documents`, {
      payload: { documentUrl: 'https://docs.test/co.pdf', documentType: 'CERTIFICATE_OF_ORIGIN' },
    });

    // AC4: chỉ Super Admin.
    for (const as of [brandA, staff]) {
      const res = await approve(as);
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: 'FORBIDDEN_SCOPE' });
    }

    // AC3: thiếu lý do.
    for (const reason of [undefined, '   ']) {
      const res = await reject(reason);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'REASON_REQUIRED' });
    }

    // AC2: từ chối có lý do, thông báo Brand Admin.
    const rejected = await reject('Chứng từ mờ không hợp lệ');
    expect(rejected.statusCode, rejected.body).toBe(200);
    expect(rejected.json()).toMatchObject({
      authenticityStatus: 'REJECTED',
      authenticityRejectionReason: 'Chứng từ mờ không hợp lệ',
    });
    expect((await reject('lần hai')).statusCode).toBe(409);

    // Nộp lại sau khi bị từ chối rồi duyệt (AC1).
    await brandA('POST', `/inventory-batches/${batch.id}/authenticity-documents`, {
      payload: { documentUrl: 'https://docs.test/co-ban-ro.pdf' },
    });
    const approved = await approve(superAdmin);
    expect(approved.statusCode, approved.body).toBe(200);
    expect(approved.json<Batch>()).toMatchObject({
      authenticityStatus: 'APPROVED',
      authenticityRejectionReason: null,
    });
    expect(approved.json<Batch>().authenticityVerifiedAt).not.toBeNull();

    // Kết quả duyệt gửi Brand Admin trong ứng dụng và qua email (FR-INV-34, FR-ALR-16).
    const notices = await client.query<{ type: string; channel: string; status: string }>(
      `SELECT type, channel, status FROM notifications WHERE reference_id = $1 AND brand_id = $2
        ORDER BY created_at, channel DESC`,
      [batch.id, fx.brandA],
    );
    expect(notices.rows).toEqual([
      { type: 'BATCH_AUTHENTICITY_REJECTED', channel: 'IN_APP', status: 'SENT' },
      { type: 'BATCH_AUTHENTICITY_REJECTED', channel: 'EMAIL', status: 'PENDING' },
      { type: 'BATCH_AUTHENTICITY_APPROVED', channel: 'IN_APP', status: 'SENT' },
      { type: 'BATCH_AUTHENTICITY_APPROVED', channel: 'EMAIL', status: 'PENDING' },
    ]);

    // Đã duyệt thì không nộp lại được.
    const resubmit = await brandA('POST', `/inventory-batches/${batch.id}/authenticity-documents`, {
      payload: { documentUrl: 'https://docs.test/khac.pdf' },
    });
    expect(resubmit.statusCode).toBe(409);
    expect(resubmit.json()).toMatchObject({ code: 'AUTHENTICITY_NOT_PENDING' });
  });

  it('test_FR_INV_34_pending_queue_scoped — Super Admin lọc lô chờ duyệt; Brand B không thấy lô của A', async () => {
    const batch = await receivedBatch();
    await brandA('POST', `/inventory-batches/${batch.id}/authenticity-documents`, {
      payload: { documentUrl: 'https://docs.test/cho-duyet.pdf' },
    });
    const queue = (
      await superAdmin('GET', '/inventory-batches?authenticityStatus=PENDING&pageSize=200')
    ).json<{ items: Batch[] }>().items;
    expect(queue.some((b) => b.id === batch.id)).toBe(true);
    expect(queue.every((b) => b.authenticityStatus === 'PENDING')).toBe(true);

    const other = (await brandB('GET', '/inventory-batches?pageSize=200')).json<{
      items: Batch[];
    }>().items;
    expect(other.some((b) => b.brandId === fx.brandA)).toBe(false);
  });

  it('CSDL chặn trạng thái chính hãng thiếu dấu vết (CHECK của ADR-0017)', async () => {
    const batch = await receivedBatch();
    await expect(
      client.query(`UPDATE inventory_batches SET authenticity_status = 'APPROVED' WHERE id = $1`, [
        batch.id,
      ]),
    ).rejects.toThrow(/chk_batch_authenticity/);
  });
});
