/**
 * Integration test cho lượt xịt chẩn đoán và tra cứu lệnh xịt (FR-MNT-09, FR-DSP-20, tuần 7) trên
 * PostgreSQL thật, qua HTTP thật: xác thực lại thật (`POST /auth/reauth`), phạm vi thương hiệu thật
 * (đăng nhập qua PrincipalLoader). Phần thiết bị gọi thẳng `DspService` như test_dsp_dispatch.
 */

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DspService } from '../../apps/api/src/modules/dsp/index.js';
import { asUser, createTestApp, login, reauth } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import { kioskFlow, useTestSigningKey } from './helpers/kiosk-flow.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
  TEST_PASSWORD,
  type IsolationFixture,
} from './helpers/seed-isolation.js';

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let dsp: DspService;
let flow: ReturnType<typeof kioskFlow>;
let superToken: string;
let brandAToken: string;
let brandBToken: string;

interface CommandBody {
  id: string;
  orderId: string | null;
  brandId: string | null;
  slotId: string;
  commandType: string;
  commandToken: string;
  status: string;
  result: { success: boolean } | null;
}

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  useTestSigningKey();
  app = await createTestApp();
  dsp = app.get(DspService);
  flow = kioskFlow(app, client, fx);
  superToken = (await login(app, fx.superAdminEmail, TEST_PASSWORD)).accessToken;
  brandAToken = (await login(app, fx.brandAdminAEmail, TEST_PASSWORD)).accessToken;
  brandBToken = (await login(app, fx.brandAdminBEmail, TEST_PASSWORD)).accessToken;
}, 60_000);

afterEach(async () => {
  // Như test_dsp_dispatch: để máy rảnh cho test sau, xóa hẳn lệnh để không cộng chuỗi lỗi.
  await client.query(
    `DELETE FROM dispense_results WHERE command_id IN
       (SELECT id FROM dispense_commands WHERE machine_id = $1)`,
    [fx.machineId],
  );
  await client.query(`DELETE FROM dispense_commands WHERE machine_id = $1`, [fx.machineId]);
  await client.query(
    `UPDATE orders SET status = 'FAILED'
      WHERE machine_id = $1 AND status IN ('CREATED', 'PENDING_PAYMENT', 'PAID', 'DISPENSE_REQUESTED')`,
    [fx.machineId],
  );
});

afterAll(async () => {
  await flow.cleanup();
  await cleanupIsolationFixture(client, fx);
  await app.close();
  await client.end();
});

async function diagnose(slotIndex: number, withReauth = true) {
  const headers: Record<string, string> = withReauth
    ? { 'x-reauth-token': await reauth(app, superToken, TEST_PASSWORD) }
    : {};
  return asUser(app, superToken)('POST', `/machines/${fx.machineId}/diagnostic-dispense`, {
    payload: { slotId: fx.slots[slotIndex]!, note: 'Kiểm tra sau bảo trì' },
    headers,
  });
}

async function orderCount(): Promise<number> {
  const { rows } = await client.query<{ n: string }>(
    `SELECT count(*) AS n FROM orders WHERE machine_id = $1`,
    [fx.machineId],
  );
  return Number(rows[0]!.n);
}

describe('FR-MNT-09 — xịt chẩn đoán', () => {
  it('test_FR_MNT_09_diagnostic_dispense', async () => {
    const before = await orderCount();
    const res = await diagnose(0);
    expect(res.statusCode).toBe(202);
    const body = res.json<CommandBody>();
    expect(body).toMatchObject({
      orderId: null,
      brandId: fx.brandA,
      slotId: fx.slots[0],
      commandType: 'DIAGNOSTIC',
      status: 'CREATED',
      result: null,
    });

    // Vòng publish gửi lệnh đi như mọi lệnh CREATED, đúng slot, đánh dấu chẩn đoán.
    const outgoing = (await dsp.listOutgoing()).find(
      (m) => m.payload.command_token === body.commandToken,
    );
    expect(outgoing?.payload).toMatchObject({ dispense_type: 'DIAGNOSTIC', slot_number: 1 });
    expect(outgoing?.payload.signature).toBeTruthy();

    // Thiết bị xịt ngay rồi báo kết quả (FR-DSP-27) — lệnh khép, không có đơn nào được tạo.
    await dsp.markSent(outgoing!);
    await dsp.handleDeviceResult(fx.machineSerial, {
      commandToken: body.commandToken,
      stage: 'RESULT',
      success: true,
      raw: { command_token: body.commandToken, stage: 'RESULT' },
    });
    const { rows } = await client.query<{ status: string }>(
      `SELECT status FROM dispense_commands WHERE id = $1`,
      [body.id],
    );
    expect(rows[0]!.status).toBe('SUCCEEDED');
    expect(await orderCount()).toBe(before);

    const audit = await client.query(
      `SELECT 1 FROM audit_logs WHERE action = 'dsp.diagnostic.created' AND target_id = $1`,
      [body.id],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('test_FR_MNT_09_requires_reauth', async () => {
    const res = await diagnose(0, false);
    expect(res.statusCode).toBe(403);
    expect(res.json<{ code: string }>().code).toBe('REAUTH_REQUIRED');
    const { rows } = await client.query(
      `SELECT 1 FROM dispense_commands WHERE machine_id = $1 AND command_type = 'DIAGNOSTIC'`,
      [fx.machineId],
    );
    expect(rows).toHaveLength(0);
  });

  it('test_FR_MNT_09_brand_admin_cannot_diagnose', async () => {
    const res = await asUser(app, brandAToken)(
      'POST',
      `/machines/${fx.machineId}/diagnostic-dispense`,
      {
        payload: { slotId: fx.slots[0]! },
        headers: { 'x-reauth-token': await reauth(app, brandAToken, TEST_PASSWORD) },
      },
    );
    expect(res.statusCode).toBe(403);
  });

  it('test_FR_MNT_09_busy_when_customer_order_queued', async () => {
    const order = await flow.paidOrder(2);
    expect((await flow.orderRow(order.id))?.status).toBe('PAID');
    const res = await diagnose(0);
    expect(res.statusCode).toBe(409);
    expect(res.json<{ code: string }>().code).toBe('MACHINE_BUSY');
  });

  it('test_FR_MNT_09_busy_when_diagnostic_active', async () => {
    expect((await diagnose(0)).statusCode).toBe(202);
    const second = await diagnose(1);
    expect(second.statusCode).toBe(409);
    expect(second.json<{ code: string }>().code).toBe('MACHINE_BUSY');
  });

  it('test_FR_MNT_09_slot_of_other_machine_not_found', async () => {
    const res = await asUser(app, superToken)(
      'POST',
      `/machines/${fx.machineId}/diagnostic-dispense`,
      {
        payload: { slotId: '00000000-0000-4000-8000-000000000000' },
        headers: { 'x-reauth-token': await reauth(app, superToken, TEST_PASSWORD) },
      },
    );
    expect(res.statusCode).toBe(404);
  });
});

describe('FR-DSP-20 — ghi nhận riêng và tra cứu lệnh', () => {
  it('test_FR_DSP_20_diagnostic_not_counted_as_order', async () => {
    const paymentCount = async () =>
      Number(
        (
          await client.query<{ n: string }>(
            `SELECT count(*) AS n FROM payments p JOIN orders o ON o.id = p.order_id
              WHERE o.machine_id = $1`,
            [fx.machineId],
          )
        ).rows[0]!.n,
      );
    const ordersBefore = await orderCount();
    const paymentsBefore = await paymentCount();
    const res = await diagnose(2);
    expect(res.statusCode).toBe(202);
    expect(await orderCount()).toBe(ordersBefore);
    expect(await paymentCount()).toBe(paymentsBefore);
  });

  it('test_FR_DSP_20_list_filters_by_command_type', async () => {
    const order = await flow.paidOrder(0);
    await dsp.armQueuedOrders();
    const customer = await flow.commandOf(order.id);
    // Khép lệnh khách để máy rảnh rồi mới chẩn đoán được.
    await client.query(`UPDATE dispense_commands SET status = 'SUCCEEDED' WHERE id = $1`, [
      customer.id,
    ]);
    const diagnostic = (await diagnose(1)).json<CommandBody>();

    const call = asUser(app, superToken);
    const onlyDiag = await call(
      'GET',
      `/dispense-commands?machineId=${fx.machineId}&commandType=DIAGNOSTIC`,
    );
    expect(onlyDiag.statusCode).toBe(200);
    const diagItems = onlyDiag.json<{ items: CommandBody[] }>().items;
    expect(diagItems.map((c) => c.id)).toEqual([diagnostic.id]);

    const onlyCustomer = await call(
      'GET',
      `/dispense-commands?machineId=${fx.machineId}&commandType=CUSTOMER`,
    );
    const customerIds = onlyCustomer.json<{ items: CommandBody[] }>().items.map((c) => c.id);
    expect(customerIds).toContain(customer.id);
    expect(customerIds).not.toContain(diagnostic.id);
  });

  it('test_FR_DSP_20_brand_sees_only_own_commands', async () => {
    const orderA = await flow.paidOrder(0);
    await dsp.armQueuedOrders();
    const commandA = await flow.commandOf(orderA.id);
    await client.query(`UPDATE dispense_commands SET status = 'SUCCEEDED' WHERE id = $1`, [
      commandA.id,
    ]);
    // Slot 3 thuộc B — lệnh chẩn đoán mang brand_id của B.
    const diagnosticB = (await diagnose(2)).json<CommandBody>();
    expect(diagnosticB.brandId).toBe(fx.brandB);

    const asA = await asUser(app, brandAToken)('GET', `/dispense-commands?pageSize=200`);
    expect(asA.statusCode).toBe(200);
    const idsA = asA.json<{ items: CommandBody[] }>().items.map((c) => c.id);
    expect(idsA).toContain(commandA.id);
    expect(idsA).not.toContain(diagnosticB.id);

    const asB = await asUser(app, brandBToken)('GET', `/dispense-commands?pageSize=200`);
    const idsB = asB.json<{ items: CommandBody[] }>().items.map((c) => c.id);
    expect(idsB).toContain(diagnosticB.id);
    expect(idsB).not.toContain(commandA.id);
  });

  it('test_FR_DSP_20_order_dispense_command_scoped', async () => {
    const order = await flow.paidOrder(0);
    await dsp.armQueuedOrders();
    const command = await flow.commandOf(order.id);

    const own = await asUser(app, brandAToken)('GET', `/orders/${order.id}/dispense-command`);
    expect(own.statusCode).toBe(200);
    expect(own.json<CommandBody>()).toMatchObject({
      id: command.id,
      orderId: order.id,
      commandType: 'CUSTOMER',
    });

    const other = await asUser(app, brandBToken)('GET', `/orders/${order.id}/dispense-command`);
    expect(other.statusCode).toBe(403);
    expect(other.json<{ code: string }>().code).toBe('FORBIDDEN_SCOPE');
  });

  it('test_FR_DSP_20_order_without_command_not_found', async () => {
    const order = await flow.paidOrder(0);
    const res = await asUser(app, superToken)('GET', `/orders/${order.id}/dispense-command`);
    expect(res.statusCode).toBe(404);
  });
});
