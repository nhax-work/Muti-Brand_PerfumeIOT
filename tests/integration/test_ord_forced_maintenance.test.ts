/**
 * Phần ORD của ép bảo trì (FR-MNT-17, ADR-0017 mục 6) trên PostgreSQL thật — MCH gọi hai hàm này,
 * không tự ghi bảng `orders`:
 *   - `failQueuedOrdersOnMachine`: đơn PAID chờ lượt → FAILED `FORCED_MAINTENANCE` + kiểm tra thủ
 *     công; đơn đã có lệnh xịt để DSP xử lý (FR-ORD-19).
 *   - `cancelUnpaidOrdersOnMachine`: đơn chờ thanh toán → hủy link ở cổng rồi EXPIRED, như khách hủy
 *     trên kiosk (FR-ORD-33).
 *
 * Cổng mock; nhánh cổng báo "đã nhận tiền" giả lập bằng cách thay `MockPaymentGateway.cancelPayment`
 * như test_ord_cancel.
 */

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DspService } from '../../apps/api/src/modules/dsp/index.js';
import { OrdService } from '../../apps/api/src/modules/ord/index.js';
import { MockPaymentGateway } from '../../apps/api/src/modules/ord/payment/mock-gateway.js';
import { DATABASE, type Database } from '../../apps/api/src/shared/db/index.js';
import { createTestApp } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import { kioskFlow, useTestSigningKey } from './helpers/kiosk-flow.js';
import {
  cleanupIsolationFixture,
  releaseOpenOrders,
  seedIsolationFixture,
  type IsolationFixture,
} from './helpers/seed-isolation.js';

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let flow: ReturnType<typeof kioskFlow>;
let ord: OrdService;
let dsp: DspService;
let db: Database;

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  useTestSigningKey();
  app = await createTestApp();
  flow = kioskFlow(app, client, fx);
  ord = app.get(OrdService);
  dsp = app.get(DspService);
  db = app.get(DATABASE);
}, 60_000);

afterEach(async () => {
  vi.restoreAllMocks();
  await client.query(
    `DELETE FROM dispense_results WHERE command_id IN
       (SELECT id FROM dispense_commands WHERE machine_id = $1)`,
    [fx.machineId],
  );
  await client.query(`DELETE FROM dispense_commands WHERE machine_id = $1`, [fx.machineId]);
  await releaseOpenOrders(client, fx.machineId);
  await client.query(
    `UPDATE orders SET status = 'FAILED' WHERE machine_id = $1 AND status IN ('PAID', 'DISPENSE_REQUESTED')`,
    [fx.machineId],
  );
  await client.query(`UPDATE machines SET operating_mode = 'NORMAL' WHERE id = $1`, [fx.machineId]);
});

afterAll(async () => {
  await flow.cleanup();
  await cleanupIsolationFixture(client, fx);
  await app.close();
  await client.end();
});

/** Như MCH vừa commit chế độ MAINTENANCE khi ép bảo trì. */
async function forceMaintenanceMode(): Promise<void> {
  await client.query(`UPDATE machines SET operating_mode = 'MAINTENANCE' WHERE id = $1`, [
    fx.machineId,
  ]);
}

async function history(orderId: string, to: string) {
  const res = await client.query<{ reason: string; actor_type: string; actor_id: string | null }>(
    `SELECT reason, actor_type, actor_id FROM order_status_histories
      WHERE order_id = $1 AND to_status = $2`,
    [orderId, to],
  );
  return res.rows;
}

describe('ORD cho máy bị ép bảo trì (FR-MNT-17, ADR-0017)', () => {
  it('test_FR_ORD_19_forced_maintenance_fails_queued_orders — đơn chờ lượt FAILED kiểm tra thủ công, đơn đang có lệnh giữ nguyên', async () => {
    const inFlight = await flow.paidOrder(0);
    const queued = await flow.paidOrder(1);
    // Mỗi máy một lệnh CUSTOMER hiệu lực: đơn đầu có lệnh, đơn sau chờ lượt.
    await dsp.armQueuedOrders();
    expect((await flow.orderRow(inFlight.id))?.status).toBe('DISPENSE_REQUESTED');
    expect((await flow.orderRow(queued.id))?.status).toBe('PAID');

    await forceMaintenanceMode();
    const failed = await db
      .transaction()
      .execute((tx) => ord.failQueuedOrdersOnMachine(tx, fx.machineId));

    expect(failed).toBe(1);
    expect(await flow.orderRow(queued.id)).toEqual({
      status: 'FAILED',
      needs_manual_review: true,
      failure_code: 'FORCED_MAINTENANCE',
    });
    expect(await history(queued.id, 'FAILED')).toEqual([
      { reason: 'FORCED_MAINTENANCE', actor_type: 'SYSTEM', actor_id: null },
    ]);
    // Thiết bị có thể vẫn đang xịt — không đóng đơn thay thiết bị.
    expect((await flow.orderRow(inFlight.id))?.status).toBe('DISPENSE_REQUESTED');
    expect((await flow.commandOf(inFlight.id)).status).not.toBe('FAILED');
  });

  it('test_FR_ORD_19_forced_maintenance_rolls_back_with_caller — lỗi trong transaction của MCH thì đơn giữ nguyên', async () => {
    const queued = await flow.paidOrder(1);
    await forceMaintenanceMode();
    await expect(
      db.transaction().execute(async (tx) => {
        await ord.failQueuedOrdersOnMachine(tx, fx.machineId);
        throw new Error('MCH lỗi sau khi gọi ORD');
      }),
    ).rejects.toThrow('MCH lỗi sau khi gọi ORD');
    expect((await flow.orderRow(queued.id))?.status).toBe('PAID');
  });

  it('test_FR_ORD_33_forced_maintenance_cancels_unpaid_orders — hủy link ở cổng, đơn EXPIRED, ghi người ép', async () => {
    const gatewayCancel = vi.spyOn(MockPaymentGateway.prototype, 'cancelPayment');
    const pending = await flow.createOrder(2);
    await forceMaintenanceMode();

    expect(await ord.cancelUnpaidOrdersOnMachine(fx.machineId, fx.superAdminId)).toBe(1);

    expect(gatewayCancel).toHaveBeenCalledTimes(1);
    expect((await flow.orderRow(pending.id))?.status).toBe('EXPIRED');
    expect(await history(pending.id, 'EXPIRED')).toEqual([
      { reason: 'MACHINE_FORCED_MAINTENANCE', actor_type: 'USER', actor_id: fx.superAdminId },
    ]);
    const open = await client.query(
      `SELECT 1 FROM payments WHERE order_id = $1 AND status = 'PENDING'`,
      [pending.id],
    );
    expect(open.rowCount).toBe(0);
  });

  it('test_FR_ORD_33_forced_maintenance_keeps_paid_at_gateway — cổng báo đã nhận tiền thì để webhook xử lý', async () => {
    vi.spyOn(MockPaymentGateway.prototype, 'cancelPayment').mockResolvedValue({
      kind: 'ALREADY_PAID',
    });
    const pending = await flow.createOrder(2);
    await forceMaintenanceMode();

    expect(await ord.cancelUnpaidOrdersOnMachine(fx.machineId, fx.superAdminId)).toBe(0);
    expect((await flow.orderRow(pending.id))?.status).toBe('PENDING_PAYMENT');
  });
});
