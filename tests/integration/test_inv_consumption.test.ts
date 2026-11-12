/**
 * Integration test cho việc trừ lượng còn lại sau lượt xịt (FR-INV-09 ÷ 12, FR-ALR-02, ADR-0019) trên
 * PostgreSQL thật. Máy không có load cell: lượng còn lại = lượng ban đầu − Σ liều hiệu chuẩn của các
 * lượt thành công. Phần thiết bị gọi thẳng `DspService.handleDeviceResult` như test_dsp_dispatch.
 */

import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DspService, type DeviceResultInput } from '../../apps/api/src/modules/dsp/index.js';
import { createTestApp } from './helpers/app.js';
import { openRawClient } from './helpers/db.js';
import { kioskFlow, useTestSigningKey } from './helpers/kiosk-flow.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
  type IsolationFixture,
} from './helpers/seed-isolation.js';

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let dsp: DspService;
let flow: ReturnType<typeof kioskFlow>;

// Fixture: mọi slot hiệu chuẩn 0,12 ml/lượt, ngưỡng sắp hết 5 ml.
const DOSAGE = 0.12;

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  useTestSigningKey();
  app = await createTestApp();
  dsp = app.get(DspService);
  flow = kioskFlow(app, client, fx);
}, 60_000);

afterEach(async () => {
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

function report(
  commandToken: string,
  stage: DeviceResultInput['stage'],
  extra: Partial<DeviceResultInput> = {},
): DeviceResultInput {
  return { commandToken, stage, raw: { command_token: commandToken, stage }, ...extra };
}

/** Đặt lượng còn lại của chai và slot, slot về AVAILABLE, xóa cảnh báo cũ của slot. */
async function setStock(slotIndex: number, ml: string): Promise<void> {
  await client.query(
    `UPDATE bottles SET current_estimated_ml = $1, status = 'INSTALLED' WHERE id = $2`,
    [ml, fx.bottles[slotIndex]],
  );
  await client.query(
    `UPDATE machine_slots SET estimated_remaining_ml = $1, status = 'AVAILABLE' WHERE id = $2`,
    [ml, fx.slots[slotIndex]],
  );
  await client.query(`DELETE FROM alerts WHERE slot_id = $1`, [fx.slots[slotIndex]]);
}

async function stockOf(slotIndex: number) {
  const { rows } = await client.query<{
    bottle_ml: string;
    bottle_status: string;
    slot_ml: string;
    sprays: number;
    slot_status: string;
  }>(
    `SELECT b.current_estimated_ml AS bottle_ml, b.status AS bottle_status,
            s.estimated_remaining_ml AS slot_ml, s.estimated_remaining_sprays AS sprays,
            s.status AS slot_status
       FROM machine_slots s JOIN bottles b ON b.id = s.active_bottle_id
      WHERE s.id = $1`,
    [fx.slots[slotIndex]],
  );
  const r = rows[0]!;
  return {
    bottleMl: Number(r.bottle_ml),
    bottleStatus: r.bottle_status,
    slotMl: Number(r.slot_ml),
    sprays: r.sprays,
    slotStatus: r.slot_status,
  };
}

async function alertsOf(slotIndex: number) {
  const { rows } = await client.query<{ type: string; severity: string; status: string }>(
    `SELECT type, severity, status FROM alerts WHERE slot_id = $1 ORDER BY type`,
    [fx.slots[slotIndex]],
  );
  return rows;
}

/** Lượt xịt chẩn đoán đã gửi xuống máy, rồi máy báo kết quả. */
async function diagnosticSpray(slotIndex: number, success = true): Promise<DeviceResultInput> {
  const token = `diag-${randomUUID()}`;
  await client.query(
    `INSERT INTO dispense_commands (machine_id, slot_id, command_type, command_token, signature,
                                    status, expires_at)
     VALUES ($1, $2, 'DIAGNOSTIC', $3, 'x', 'SENT', now() + interval '1 minute')`,
    [fx.machineId, fx.slots[slotIndex], token],
  );
  const result = report(token, 'RESULT', {
    success,
    executedAt: new Date(),
    ...(success ? {} : { failureCode: 'ACTUATOR_FAULT' }),
  });
  expect(await dsp.handleDeviceResult(fx.machineSerial, result)).toBe('APPLIED');
  return result;
}

describe('FR-INV-09, FR-INV-10 — trừ lượng sau lượt xịt thành công', () => {
  it('test_FR_INV_10_update_after_dispense — lượt khách thành công trừ đúng một liều', async () => {
    await setStock(0, '10.0000');
    const order = await flow.paidOrder(0);
    await dsp.armQueuedOrders();
    const { command_token: token } = await flow.commandOf(order.id);
    const message = (await dsp.listOutgoing()).find((m) => m.payload.command_token === token);
    await dsp.markSent(message!);
    await dsp.handleDeviceResult(fx.machineSerial, report(token, 'ACK'));
    const success = report(token, 'RESULT', { success: true, executedAt: new Date() });
    expect(await dsp.handleDeviceResult(fx.machineSerial, success)).toBe('APPLIED');

    expect(await stockOf(0)).toEqual({
      bottleMl: 9.88,
      bottleStatus: 'INSTALLED',
      slotMl: 9.88,
      sprays: Math.floor(9.88 / DOSAGE),
      slotStatus: 'AVAILABLE',
    });

    // RESULT gửi lại bị bỏ qua — không trừ lần hai.
    expect(await dsp.handleDeviceResult(fx.machineSerial, success)).toBe('IGNORED');
    expect((await stockOf(0)).bottleMl).toBe(9.88);
    // Còn trên ngưỡng 5 ml: không cảnh báo (FR-INV-11 AC2).
    expect(await alertsOf(0)).toEqual([]);
  });

  it('test_FR_INV_10_update_after_dispense — lượt chẩn đoán thành công cũng trừ', async () => {
    await setStock(1, '10.0000');
    await diagnosticSpray(1);
    expect((await stockOf(1)).bottleMl).toBe(9.88);
    expect((await stockOf(1)).slotMl).toBe(9.88);
  });

  it('test_FR_INV_09_estimated_remaining — lượt thất bại không trừ', async () => {
    await setStock(1, '10.0000');
    await diagnosticSpray(1, false);
    expect((await stockOf(1)).bottleMl).toBe(10);
    expect((await stockOf(1)).slotMl).toBe(10);
  });

  it('test_FR_INV_09_estimated_remaining — nhiều lượt cộng dồn không lệch số', async () => {
    await setStock(1, '10.0000');
    for (let i = 0; i < 25; i++) await diagnosticSpray(1);
    // 10 − 25 × 0,12 = 7 — số nguyên phần vạn ml, không sai số dấu phẩy động.
    expect(await stockOf(1)).toMatchObject({ bottleMl: 7, slotMl: 7, sprays: 58 });
  });
});

describe('FR-INV-11, FR-INV-12, FR-ALR-02 — ngưỡng sắp hết và hết hàng', () => {
  it('test_FR_INV_11_low_stock_alert — vượt xuống dưới ngưỡng sinh đúng một cảnh báo', async () => {
    await setStock(2, '5.0500');
    await diagnosticSpray(2);
    expect(await stockOf(2)).toMatchObject({ bottleMl: 4.93, bottleStatus: 'LOW' });
    expect(await alertsOf(2)).toEqual([{ type: 'LOW_STOCK', severity: 'WARNING', status: 'OPEN' }]);

    // Lượt sau vẫn dưới ngưỡng: không sinh thêm cảnh báo.
    await diagnosticSpray(2);
    expect(await alertsOf(2)).toHaveLength(1);
    expect((await stockOf(2)).slotStatus).toBe('AVAILABLE');
  });

  it('test_FR_INV_12_slot_unavailable — không đủ một liều thì slot UNAVAILABLE, chai EMPTY', async () => {
    await setStock(3, '0.2000');
    await diagnosticSpray(3);
    expect(await stockOf(3)).toEqual({
      bottleMl: 0.08,
      bottleStatus: 'EMPTY',
      slotMl: 0.08,
      sprays: 0,
      slotStatus: 'UNAVAILABLE',
    });
  });

  it('test_FR_ALR_02_slot_stock_alert — cảnh báo sắp hết rồi cảnh báo slot rỗng', async () => {
    await setStock(3, '5.0500');
    await diagnosticSpray(3);
    expect((await alertsOf(3)).map((a) => a.type)).toEqual(['LOW_STOCK']);

    await client.query(`UPDATE bottles SET current_estimated_ml = 0.2000 WHERE id = $1`, [
      fx.bottles[3],
    ]);
    await diagnosticSpray(3);
    expect(await alertsOf(3)).toEqual([
      { type: 'LOW_STOCK', severity: 'WARNING', status: 'OPEN' },
      { type: 'SLOT_EMPTY', severity: 'HIGH', status: 'OPEN' },
    ]);
  });
});
