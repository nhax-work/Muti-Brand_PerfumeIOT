/**
 * Integration test cho điều phối lệnh xịt (DSP, tuần 5): đơn PAID → ghi lệnh có chữ ký và TTL → ACK
 * (đèn sáng) → RESULT / REJECT / quá hạn, trên PostgreSQL thật. Gọi thẳng `DspService` — đúng những
 * gì `DspJobs.tick()` và cửa vào MQTT gọi — để không cần broker; luồng qua MQTT với simulator nằm ở
 * tests/e2e/test_command_ttl.test.ts.
 *
 * `armQueuedOrders` và `sweepTimeouts` quét MỌI máy trong CSDL, nên test tích hợp chạy tuần tự từng
 * file (`--no-file-parallelism` trong `npm run test:integration`).
 */

import { randomUUID, type KeyObject } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DspService, type DeviceResultInput } from '../../apps/api/src/modules/dsp/index.js';
import { SPEC_CONSTRAINTS } from '../../apps/api/src/shared/config/constraints.generated.js';
import { createCommandVerifier } from '../../scripts/lib/command-verifier.js';
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
let publicKey: KeyObject;
let flow: ReturnType<typeof kioskFlow>;

const TTL_SEC = SPEC_CONSTRAINTS.DISPENSE_CMD_TTL_SEC;
const PRESS_WINDOW_SEC = SPEC_CONSTRAINTS.DISPENSE_PRESS_WINDOW_SEC;
const RESULT_TIMEOUT_SEC = SPEC_CONSTRAINTS.DISPENSE_RESULT_TIMEOUT_SEC;

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  publicKey = useTestSigningKey();
  app = await createTestApp();
  dsp = app.get(DspService);
  flow = kioskFlow(app, client, fx);
}, 60_000);

afterEach(async () => {
  // Mỗi test để máy rảnh: lệnh còn hiệu lực hay đơn dở dang sẽ bị test sau ghi lệnh nhầm.
  await client.query(
    `UPDATE dispense_commands SET status = 'FAILED'
      WHERE machine_id = $1 AND status IN ('CREATED', 'SENT', 'ACKNOWLEDGED')`,
    [fx.machineId],
  );
  await client.query(
    `UPDATE orders SET status = 'FAILED'
      WHERE machine_id = $1 AND status IN ('PENDING_PAYMENT', 'PAID', 'DISPENSE_REQUESTED')`,
    [fx.machineId],
  );
});

afterAll(async () => {
  await flow.cleanup();
  await cleanupIsolationFixture(client, fx);
  await app.close();
  await client.end();
});

/** Bản tin `command/result` mà cửa vào MQTT đã kiểm hình dạng. */
function report(
  commandToken: string,
  stage: DeviceResultInput['stage'],
  extra: Partial<DeviceResultInput> = {},
): DeviceResultInput {
  return {
    commandToken,
    stage,
    raw: { command_token: commandToken, stage },
    ...extra,
  };
}

function deliver(input: DeviceResultInput, serial = fx.machineSerial) {
  return dsp.handleDeviceResult(serial, input);
}

/** Ghi lệnh rồi "publish" — lệnh của đơn ở SENT, trả về token. */
async function armAndSend(orderId: string): Promise<string> {
  await dsp.armQueuedOrders();
  const { command_token: token } = await flow.commandOf(orderId);
  const message = (await dsp.listOutgoing()).find((m) => m.payload.command_token === token);
  expect(message).toBeDefined();
  await dsp.markSent(message!);
  expect((await flow.commandOf(orderId)).status).toBe('SENT');
  return token;
}

async function setCommandTimes(
  token: string,
  times: { sentAgoSec?: number; ackedAgoSec?: number; expiresAgoSec?: number },
): Promise<void> {
  await client.query(
    `UPDATE dispense_commands
        SET sent_at = COALESCE(now() - make_interval(secs => $2), sent_at),
            acknowledged_at = COALESCE(now() - make_interval(secs => $3), acknowledged_at),
            expires_at = COALESCE(now() - make_interval(secs => $4), expires_at)
      WHERE command_token = $1`,
    [token, times.sentAgoSec ?? null, times.ackedAgoSec ?? null, times.expiresAgoSec ?? null],
  );
}

// -------------------------------------------------------------------------------------
// Ghi lệnh: chữ ký, TTL, một lệnh mỗi máy
// -------------------------------------------------------------------------------------

describe('DSP — ghi lệnh xịt cho đơn đã thanh toán', () => {
  it('test_FR_DSP_01_create_signed_command_for_paid_order', async () => {
    const order = await flow.paidOrder(0);
    expect((await flow.orderRow(order.id))?.status).toBe('PAID');

    await dsp.armQueuedOrders();

    // Đơn PAID → DISPENSE_REQUESTED, đúng một lệnh CUSTOMER ở CREATED.
    expect((await flow.orderRow(order.id))?.status).toBe('DISPENSE_REQUESTED');
    const command = await flow.commandOf(order.id);
    expect(command).toMatchObject({ status: 'CREATED', command_type: 'CUSTOMER' });
    expect(command.command_token).toMatch(/^cmd_/);

    // FR-DSP-06: expires_at = created_at + DISPENSE_CMD_TTL_SEC.
    expect(command.expires_at.getTime() - command.created_at.getTime()).toBe(TTL_SEC * 1000);

    // FR-DSP-04: bản tin publish mang chữ ký Ed25519 mà thiết bị kiểm được bằng khóa công khai.
    const message = (await dsp.listOutgoing()).find(
      (m) => m.payload.command_token === command.command_token,
    );
    expect(message?.payload).toMatchObject({
      machine_serial: fx.machineSerial,
      dispense_type: 'CUSTOMER',
      slot_number: 1,
      dosage_ml: 0.12,
      expires_at: command.expires_at.toISOString(),
    });
    const verifier = createCommandVerifier(publicKey);
    expect(verifier.check({ ...message!.payload })).toEqual({ ok: true });
    // Sửa một trường sau khi ký (ví dụ đổi slot) → chữ ký không còn khớp.
    expect(verifier.check({ ...message!.payload, slot_number: 2 })).toEqual({
      ok: false,
      reason: 'INVALID',
    });

    // Lệnh không mang thông tin thương hiệu hay giá (mqtt.md §5, BR-012).
    for (const leaked of ['order_id', 'brand_id', 'price', 'amount', 'product_name']) {
      expect(message!.payload).not.toHaveProperty(leaked);
    }

    await dsp.markSent(message!);
    expect((await flow.commandOf(order.id)).status).toBe('SENT');
  });

  it('test_FR_DSP_17_order_waits_while_machine_offline', async () => {
    const order = await flow.paidOrder(0);
    await client.query(`UPDATE machines SET status = 'OFFLINE' WHERE id = $1`, [fx.machineId]);
    try {
      await dsp.armQueuedOrders();
      // Máy mất kết nối: đơn giữ PAID chờ lượt, không sinh lệnh để rồi EXPIRED.
      expect((await flow.orderRow(order.id))?.status).toBe('PAID');
      expect(await flow.commandsOf(order.id)).toHaveLength(0);
    } finally {
      await client.query(`UPDATE machines SET status = 'ONLINE' WHERE id = $1`, [fx.machineId]);
    }
    await dsp.armQueuedOrders();
    expect((await flow.orderRow(order.id))?.status).toBe('DISPENSE_REQUESTED');
  });

  it('test_FR_DSP_26_one_active_customer_command_per_machine', async () => {
    // Hai đơn ở hai slot khác nhau cùng được thanh toán khi máy rảnh.
    const first = await flow.createOrder(0);
    const second = await flow.createOrder(2);
    await flow.pay(first);
    await flow.pay(second);

    await dsp.armQueuedOrders();
    // AC2: chỉ đơn trả tiền trước có lệnh; đơn sau giữ PAID "chờ lượt".
    expect((await flow.orderRow(first.id))?.status).toBe('DISPENSE_REQUESTED');
    expect((await flow.orderRow(second.id))?.status).toBe('PAID');
    expect(await flow.commandsOf(second.id)).toHaveLength(0);

    // Gọi lại khi lệnh đầu còn chờ bấm vẫn không ghi thêm.
    const firstToken = await armAndSend(first.id);
    await deliver(report(firstToken, 'ACK'));
    await dsp.armQueuedOrders();
    expect(await flow.commandsOf(second.id)).toHaveLength(0);

    // AC1: chính CSDL từ chối lệnh CUSTOMER thứ hai trên cùng máy, kể cả khi code bỏ sót.
    const secondSlot = fx.slots[2];
    await expect(
      client.query(
        `INSERT INTO dispense_commands (brand_id, order_id, machine_id, slot_id, command_type,
                                        command_token, signature, status, expires_at)
         VALUES ($1, $2, $3, $4, 'CUSTOMER', $5, 'x', 'CREATED', now() + interval '1 minute')`,
        [fx.brandB, second.id, fx.machineId, secondSlot, `tok-${randomUUID()}`],
      ),
    ).rejects.toMatchObject({ constraint: 'uq_machine_active_customer_command' });

    // AC3: lệnh DIAGNOSTIC không bị chặn.
    await client.query(
      `INSERT INTO dispense_commands (machine_id, slot_id, command_type, command_token, signature,
                                      status, expires_at)
       VALUES ($1, $2, 'DIAGNOSTIC', $3, 'x', 'SENT', now() + interval '1 minute')`,
      [fx.machineId, secondSlot, `diag-${randomUUID()}`],
    );

    // Lệnh đầu kết thúc → vòng sau ghi lệnh cho đơn chờ lượt.
    await deliver(report(firstToken, 'RESULT', { success: true, executedAt: new Date() }));
    await dsp.armQueuedOrders();
    expect((await flow.orderRow(second.id))?.status).toBe('DISPENSE_REQUESTED');
    expect((await flow.commandOf(second.id)).status).toBe('CREATED');
  });

  it('test_FR_DSP_01_paid_order_on_uncalibrated_slot_fails_for_refund', async () => {
    const order = await flow.paidOrder(1);
    // Slot mất hiệu chuẩn giữa lúc thanh toán và lúc ghi lệnh.
    await client.query(`UPDATE machine_slots SET calibrated_dosage_ml = NULL WHERE id = $1`, [
      fx.slots[1],
    ]);
    try {
      await dsp.armQueuedOrders();
      // Không gửi lệnh thiếu liều; khách đã trả tiền nên đơn vào kiểm tra thủ công để hoàn.
      expect(await flow.commandsOf(order.id)).toHaveLength(0);
      expect(await flow.orderRow(order.id)).toMatchObject({
        status: 'FAILED',
        failure_code: 'SLOT_UNAVAILABLE',
        needs_manual_review: true,
      });
      // Và kiosk không bán slot đó nữa.
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/kiosk/orders',
        headers: { 'idempotency-key': randomUUID() },
        payload: { machineSerial: fx.machineSerial, slotId: fx.slots[1] },
      });
      expect(res.json()).toMatchObject({ code: 'SLOT_UNAVAILABLE' });
    } finally {
      await client.query(`UPDATE machine_slots SET calibrated_dosage_ml = 0.1200 WHERE id = $1`, [
        fx.slots[1],
      ]);
    }
  });
});

// -------------------------------------------------------------------------------------
// Kết quả thiết bị: ACK = đèn sáng, RESULT, REJECT, PRESS_TIMEOUT
// -------------------------------------------------------------------------------------

describe('DSP — kết quả từ thiết bị (mqtt.md §6)', () => {
  it('test_FR_DSP_21_arm_button_instead_of_dispensing', async () => {
    const order = await flow.paidOrder(0);
    const token = await armAndSend(order.id);

    expect(await deliver(report(token, 'ACK'))).toBe('APPLIED');
    const command = await flow.commandOf(order.id);
    expect(command.status).toBe('ACKNOWLEDGED');
    // FR-DSP-17: ACK không bao giờ là DISPENSED.
    expect((await flow.orderRow(order.id))?.status).toBe('DISPENSE_REQUESTED');

    // ACK gửi lại không đổi gì.
    expect(await deliver(report(token, 'ACK'))).toBe('IGNORED');
  });

  it('test_FR_ORD_26_prompt_press_with_countdown', async () => {
    const kioskStatus = async (orderId: string) =>
      (await app.inject({ method: 'GET', url: `/api/v1/kiosk/orders/${orderId}/status` })).json<{
        status: string;
        dispenseStatus: string | null;
        slotNumber: number;
        pressDeadline: string | null;
      }>();

    const order = await flow.createOrder(0);
    const queued = await flow.createOrder(2);
    await flow.pay(order);
    await flow.pay(queued);
    const token = await armAndSend(order.id);

    // Lệnh đã gửi nhưng đèn chưa sáng: chưa mời bấm.
    expect(await kioskStatus(order.id)).toMatchObject({
      dispenseStatus: 'SENT',
      pressDeadline: null,
    });

    // ACK = đèn sáng: kiosk hiện "Mời bấm nút số N" và đếm ngược tới acknowledged_at + cửa sổ bấm.
    await deliver(report(token, 'ACK'));
    const command = await flow.commandOf(order.id);
    const view = await kioskStatus(order.id);
    expect(view).toMatchObject({ dispenseStatus: 'ACKNOWLEDGED', slotNumber: 1 });
    expect(Date.parse(view.pressDeadline!) - command.acknowledged_at!.getTime()).toBe(
      PRESS_WINDOW_SEC * 1000,
    );

    // Đơn trả tiền sau đang chờ lượt: không có đèn của nó, không đếm ngược (FR-DSP-26).
    expect(await kioskStatus(queued.id)).toMatchObject({
      status: 'PAID',
      dispenseStatus: null,
      slotNumber: 3,
      pressDeadline: null,
    });
  });

  it('test_FR_DSP_17_dispensed_only_after_device_success', async () => {
    const order = await flow.paidOrder(0);
    const token = await armAndSend(order.id);
    await deliver(report(token, 'ACK'));

    const executedAt = new Date();
    const success = report(token, 'RESULT', {
      success: true,
      resultCode: 'OK',
      executedAt,
      deviceEventId: `${fx.machineSerial}-1-1`,
    });
    expect(await deliver(success)).toBe('APPLIED');
    expect((await flow.commandOf(order.id)).status).toBe('SUCCEEDED');
    expect((await flow.orderRow(order.id))?.status).toBe('DISPENSED');

    // FR-IOT-07: RESULT gửi lại không tạo hàng kết quả thứ hai, không đổi đơn.
    expect(await deliver(success)).toBe('IGNORED');
    const results = await client.query(
      `SELECT r.success FROM dispense_results r
         JOIN dispense_commands c ON c.id = r.command_id WHERE c.order_id = $1`,
      [order.id],
    );
    expect(results.rows).toEqual([{ success: true }]);
  });

  it('test_FR_ORD_27_forfeit_order_on_press_timeout', async () => {
    const order = await flow.paidOrder(0);
    const token = await armAndSend(order.id);
    await deliver(report(token, 'ACK'));

    await deliver(report(token, 'REJECT', { failureCode: 'PRESS_TIMEOUT' }));
    expect((await flow.commandOf(order.id)).status).toBe('REJECTED');
    // FR-ORD-27: mất lượt, không hoàn tiền, không vào kiểm tra thủ công.
    expect(await flow.orderRow(order.id)).toMatchObject({
      status: 'FORFEITED',
      failure_code: 'PRESS_TIMEOUT',
      needs_manual_review: false,
    });

    // Máy rảnh lại: đơn tiếp theo được ghi lệnh.
    const next = await flow.paidOrder(1);
    await dsp.armQueuedOrders();
    expect((await flow.orderRow(next.id))?.status).toBe('DISPENSE_REQUESTED');
  });

  it('test_FR_ORD_19_flag_order_for_manual_review_on_dispense_failure', async () => {
    // Sau ACK: khách đã trả tiền và đã bấm mà máy từ chối (kiểm an toàn lần hai) → cần người xem.
    const pressed = await flow.paidOrder(0);
    const pressedToken = await armAndSend(pressed.id);
    await deliver(report(pressedToken, 'ACK'));
    await deliver(report(pressedToken, 'REJECT', { failureCode: 'DOOR_OPEN' }));
    expect(await flow.orderRow(pressed.id)).toMatchObject({
      status: 'FAILED',
      failure_code: 'DOOR_OPEN',
      needs_manual_review: true,
    });

    // Trước ACK: thiết bị từ chối ngay khi nhận lệnh, đèn chưa từng sáng → FAILED (mqtt.md §6).
    const early = await flow.paidOrder(1);
    const earlyToken = await armAndSend(early.id);
    await deliver(report(earlyToken, 'REJECT', { failureCode: 'CMD_EXPIRED' }));
    expect((await flow.commandOf(early.id)).status).toBe('REJECTED');
    expect(await flow.orderRow(early.id)).toMatchObject({
      status: 'FAILED',
      failure_code: 'CMD_EXPIRED',
      needs_manual_review: false,
    });
  });

  it('test_FR_DSP_09_result_from_other_machine_is_ignored', async () => {
    const order = await flow.paidOrder(0);
    const token = await armAndSend(order.id);
    // Máy khác báo thay cho lệnh của máy này → không tìm thấy lệnh, không đổi gì.
    expect(await deliver(report(token, 'ACK'), 'OTHER-MACHINE')).toBe('UNKNOWN_COMMAND');
    expect((await flow.commandOf(order.id)).status).toBe('SENT');
  });
});

// -------------------------------------------------------------------------------------
// Quá hạn: UNKNOWN, EXPIRED, kết quả đến trễ
// -------------------------------------------------------------------------------------

describe('DSP — lệnh quá hạn (FR-DSP-18, FR-DSP-19)', () => {
  it('test_FR_DSP_18_sent_without_ack_becomes_unknown', async () => {
    const order = await flow.paidOrder(0);
    const token = await armAndSend(order.id);

    // Còn trong hạn chờ ACK: chưa đụng tới.
    await setCommandTimes(token, { sentAgoSec: RESULT_TIMEOUT_SEC - 5 });
    await dsp.sweepTimeouts();
    expect((await flow.commandOf(order.id)).status).toBe('SENT');

    await setCommandTimes(token, { sentAgoSec: RESULT_TIMEOUT_SEC + 1 });
    await dsp.sweepTimeouts();
    expect((await flow.commandOf(order.id)).status).toBe('UNKNOWN');
    // Không suy ra DISPENSED từ timeout; đơn vào kiểm tra thủ công.
    expect(await flow.orderRow(order.id)).toMatchObject({
      status: 'DISPENSE_REQUESTED',
      needs_manual_review: true,
    });
  });

  it('test_FR_DSP_18_acknowledged_without_result_becomes_unknown_after_press_window', async () => {
    const order = await flow.paidOrder(0);
    const token = await armAndSend(order.id);
    await deliver(report(token, 'ACK'));

    // Mốc UNKNOWN sau ACK là PRESS_WINDOW + RESULT_TIMEOUT, không phải RESULT_TIMEOUT.
    await setCommandTimes(token, { ackedAgoSec: RESULT_TIMEOUT_SEC + 1 });
    await dsp.sweepTimeouts();
    expect((await flow.commandOf(order.id)).status).toBe('ACKNOWLEDGED');

    await setCommandTimes(token, { ackedAgoSec: PRESS_WINDOW_SEC + RESULT_TIMEOUT_SEC + 1 });
    await dsp.sweepTimeouts();
    expect((await flow.commandOf(order.id)).status).toBe('UNKNOWN');
    expect(await flow.orderRow(order.id)).toMatchObject({
      status: 'DISPENSE_REQUESTED',
      needs_manual_review: true,
    });
  });

  it('test_FR_DSP_19_unknown_command_never_triggers_new_command', async () => {
    const order = await flow.paidOrder(0);
    const token = await armAndSend(order.id);
    await setCommandTimes(token, { sentAgoSec: RESULT_TIMEOUT_SEC + 1 });
    await dsp.sweepTimeouts();

    // Lệnh UNKNOWN không còn hiệu lực nên máy nhận đơn khác...
    const next = await flow.paidOrder(2);
    await dsp.armQueuedOrders();
    expect((await flow.orderRow(next.id))?.status).toBe('DISPENSE_REQUESTED');
    // ...nhưng đơn của lệnh UNKNOWN không bao giờ có lệnh thứ hai (chống xịt hai lần, BR-002).
    const commands = await flow.commandsOf(order.id);
    expect(commands.map((c) => c.status)).toEqual(['UNKNOWN']);
  });

  it('test_FR_DSP_06_unsent_command_past_ttl_expires', async () => {
    const order = await flow.paidOrder(0);
    await dsp.armQueuedOrders();
    const command = await flow.commandOf(order.id);

    // Broker mất kết nối tới khi lệnh quá TTL: không publish lệnh đã hết hạn...
    await setCommandTimes(command.command_token, { expiresAgoSec: 1 });
    const outgoing = await dsp.listOutgoing();
    expect(outgoing.map((m) => m.payload.command_token)).not.toContain(command.command_token);

    // ...mà chuyển EXPIRED; thiết bị chắc chắn chưa nhận nên đơn FAILED để hoàn tiền.
    await dsp.sweepTimeouts();
    expect((await flow.commandOf(order.id)).status).toBe('EXPIRED');
    expect(await flow.orderRow(order.id)).toMatchObject({
      status: 'FAILED',
      failure_code: 'CMD_EXPIRED',
      needs_manual_review: true,
    });
  });

  it('test_FR_DSP_24_late_press_timeout_after_unknown_forfeits_and_clears_review', async () => {
    const order = await flow.paidOrder(0);
    const token = await armAndSend(order.id);
    await deliver(report(token, 'ACK'));
    await setCommandTimes(token, { ackedAgoSec: PRESS_WINDOW_SEC + RESULT_TIMEOUT_SEC + 1 });
    await dsp.sweepTimeouts();
    expect((await flow.orderRow(order.id))?.needs_manual_review).toBe(true);

    // PRESS_TIMEOUT đến trễ (QoS 1 gửi lại sau khi thiết bị nối lại mạng): sự thật là khách không
    // bấm → FORFEITED, và cờ do UNKNOWN cắm được gỡ (FR-ORD-27).
    expect(await deliver(report(token, 'REJECT', { failureCode: 'PRESS_TIMEOUT' }))).toBe(
      'APPLIED',
    );
    expect(await flow.orderRow(order.id)).toMatchObject({
      status: 'FORFEITED',
      needs_manual_review: false,
    });
  });

  it('test_FR_DSP_17_late_success_after_unknown_closes_order', async () => {
    const order = await flow.paidOrder(0);
    const token = await armAndSend(order.id);
    await deliver(report(token, 'ACK'));
    await setCommandTimes(token, { ackedAgoSec: PRESS_WINDOW_SEC + RESULT_TIMEOUT_SEC + 1 });
    await dsp.sweepTimeouts();

    await deliver(report(token, 'RESULT', { success: true, executedAt: new Date() }));
    expect((await flow.commandOf(order.id)).status).toBe('SUCCEEDED');
    expect((await flow.orderRow(order.id))?.status).toBe('DISPENSED');
  });
});
