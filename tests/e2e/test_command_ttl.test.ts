/**
 * E2E TTL lệnh xịt và chờ bấm nút (nhóm test trọng yếu "TTL lệnh xịt", spec/testing.md; ADR-0007).
 *
 * Chạy đủ chuỗi thật: kiosk tạo đơn → webhook mock → `DspJobs.tick()` ghi lệnh, ký, publish → Device
 * Simulator (`scripts/lib/simulated-machine.ts`) kiểm chữ ký/máy/TTL/trùng → ACK, bấm nút, RESULT
 * → cửa vào MQTT của backend (`DspMqttGateway`) → CSDL thật.
 *
 * Hai chỗ thay thế, có chủ đích:
 *   - Broker: `MqttClientAdapter` được nối vòng trong tiến trình — topic, JSON và đường phân phối
 *     theo mẫu `+` vẫn là mã thật; chỉ bỏ mạng để test tất định.
 *   - Đồng hồ của thiết bị: điều khiển bằng tay, nên "hết 60 giây chờ bấm" và "lệnh tới trễ quá TTL"
 *     chạy ngay mà không phải chờ thật.
 */

import type { KeyObject } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MqttClientAdapter } from '../../apps/api/src/adapters/mqtt/index.js';
import { DspJobs, DspMqttGateway, DspService } from '../../apps/api/src/modules/dsp/index.js';
import { SPEC_CONSTRAINTS } from '../../apps/api/src/shared/config/constraints.generated.js';
import { createCommandVerifier } from '../../scripts/lib/command-verifier.js';
import {
  SimulatedMachine,
  type DeviceClock,
  type MachineBehavior,
} from '../../scripts/lib/simulated-machine.js';
import { createTestApp } from '../integration/helpers/app.js';
import { openRawClient } from '../integration/helpers/db.js';
import { kioskFlow, useTestSigningKey, type OrderBody } from '../integration/helpers/kiosk-flow.js';
import {
  cleanupIsolationFixture,
  seedIsolationFixture,
  type IsolationFixture,
} from '../integration/helpers/seed-isolation.js';

const TTL_SEC = SPEC_CONSTRAINTS.DISPENSE_CMD_TTL_SEC;
const PRESS_WINDOW_MS = SPEC_CONSTRAINTS.DISPENSE_PRESS_WINDOW_SEC * 1000;
const RESULT_TIMEOUT_SEC = SPEC_CONSTRAINTS.DISPENSE_RESULT_TIMEOUT_SEC;

/** Đồng hồ thiết bị chỉ chạy khi test gọi `advance`. */
class ManualClock implements DeviceClock {
  private current: number;
  private seq = 0;
  private readonly timers = new Map<number, { at: number; run: () => void }>();

  constructor(start: number) {
    this.current = start;
  }

  now(): number {
    return this.current;
  }

  setTimeout(run: () => void, ms: number): number {
    const id = ++this.seq;
    this.timers.set(id, { at: this.current + ms, run });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  /** Tiến `ms`, chạy lần lượt mọi hẹn giờ tới hạn theo đúng thứ tự thời gian. */
  advance(ms: number): void {
    const target = this.current + ms;
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, t]) => t.at <= target)
        .sort(([, a], [, b]) => a.at - b.at)[0];
      if (!due) break;
      this.timers.delete(due[0]);
      this.current = due[1].at;
      due[1].run();
    }
    this.current = target;
  }
}

let app: NestFastifyApplication;
let client: pg.Client;
let fx: IsolationFixture;
let flow: ReturnType<typeof kioskFlow>;
let jobs: DspJobs;
let publicKey: KeyObject;

/** Bản tin backend đã publish xuống `command`, theo thứ tự. */
const commandsSent: Record<string, unknown>[] = [];
/** Bản tin thiết bị gửi lên đang được backend xử lý. */
const inFlight: Promise<void>[] = [];
let machine: SimulatedMachine;
let clock: ManualClock;

/** Máy mới (hoặc máy vừa khởi động lại) gắn vào đường vòng. */
function bootMachine(behavior: Partial<MachineBehavior> = {}, skewMs = 0): SimulatedMachine {
  const adapter = app.get(MqttClientAdapter);
  const dispatch = (
    adapter as unknown as { dispatch(topic: string, payload: Buffer): Promise<void> }
  ).dispatch.bind(adapter);
  clock = new ManualClock(Date.now() + skewMs);
  machine = new SimulatedMachine({
    serial: fx.machineSerial,
    verifier: createCommandVerifier(publicKey),
    clock,
    log: () => {},
    behavior: { pressWindowSec: PRESS_WINDOW_MS / 1000, pressAfterMs: null, ...behavior },
    publish: (topic, payload) => {
      inFlight.push(dispatch(topic, Buffer.from(payload)));
    },
  });
  return machine;
}

/** Chờ backend xử lý xong mọi bản tin thiết bị đã gửi. */
async function settle(): Promise<void> {
  while (inFlight.length > 0) await inFlight.shift();
}

/** Một nhịp điều phối thật: ghi lệnh → publish → (thiết bị ACK) → backend xử lý ACK. */
async function tick(): Promise<void> {
  await jobs.tick();
  await settle();
}

async function lastCommand(order: OrderBody) {
  const commands = await flow.commandsOf(order.id);
  return commands[commands.length - 1];
}

beforeAll(async () => {
  client = await openRawClient();
  fx = await seedIsolationFixture(client);
  publicKey = useTestSigningKey();
  app = await createTestApp();
  flow = kioskFlow(app, client, fx);
  jobs = app.get(DspJobs);

  // Đường vòng thay broker: backend publish `command` → thiết bị; thiết bị publish → dispatch.
  const adapter = app.get(MqttClientAdapter);
  Object.defineProperty(adapter, 'connected', { get: () => true, configurable: true });
  adapter.publish = async (topic: string, message: unknown) => {
    commandsSent.push(message as Record<string, unknown>);
    if (topic === machine.topic('command')) machine.onCommand(JSON.stringify(message));
  };
  app.get(DspMqttGateway).start();
}, 60_000);

afterEach(async () => {
  await settle();
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

describe('E2E — TTL lệnh xịt (FR-DSP-06, FR-DSP-08)', () => {
  it('test_FR_DSP_08_device_rejects_command_delivered_after_ttl', async () => {
    // Lệnh tới thiết bị trễ hơn DISPENSE_CMD_TTL_SEC (broker giữ lại, mạng nghẽn): thiết bị từ chối.
    bootMachine({}, (TTL_SEC + 1) * 1000);
    const order = await flow.paidOrder(0);
    await tick();

    expect(machine.litSlot).toBeNull();
    expect(machine.actuations.size).toBe(0);
    expect((await lastCommand(order))?.status).toBe('REJECTED');
    // Đèn chưa từng sáng → đơn FAILED, không phải FORFEITED (mqtt.md §6).
    expect(await flow.orderRow(order.id)).toMatchObject({
      status: 'FAILED',
      failure_code: 'CMD_EXPIRED',
    });
  });

  it('test_FR_DSP_06_command_within_ttl_lights_button', async () => {
    // Trễ nhưng vẫn trong TTL: thiết bị nhận lệnh, sáng đèn, chưa xịt.
    bootMachine({}, (TTL_SEC - 5) * 1000);
    const order = await flow.paidOrder(0);
    await tick();

    expect(machine.litSlot).toBe(1);
    expect(machine.actuations.size).toBe(0);
    expect((await lastCommand(order))?.status).toBe('ACKNOWLEDGED');
    expect((await flow.orderRow(order.id))?.status).toBe('DISPENSE_REQUESTED');
  });

  it('test_FR_DSP_06_expired_command_is_never_published', async () => {
    bootMachine();
    const order = await flow.paidOrder(0);
    // Ghi lệnh khi broker còn mất kết nối, tới lúc nối lại thì lệnh đã quá TTL.
    await app.get(DspService).armQueuedOrders();
    await client.query(
      `UPDATE dispense_commands SET expires_at = now() - interval '1 second' WHERE order_id = $1`,
      [order.id],
    );
    const before = commandsSent.length;
    await tick();

    expect(commandsSent.length).toBe(before);
    expect(machine.litSlot).toBeNull();
    expect((await lastCommand(order))?.status).toBe('EXPIRED');
    expect(await flow.orderRow(order.id)).toMatchObject({
      status: 'FAILED',
      needs_manual_review: true,
    });
  });
});

describe('E2E — chờ bấm nút (FR-DSP-21..25)', () => {
  it('test_FR_DSP_24_press_timeout_rejects_command', async () => {
    bootMachine();
    const order = await flow.paidOrder(0);
    await tick();
    expect(machine.litSlot).toBe(1);

    // Gate 3: đơn thứ hai trong lúc chờ bấm bị MACHINE_BUSY.
    const busy = await app.inject({
      method: 'POST',
      url: '/api/v1/kiosk/orders',
      headers: { 'idempotency-key': `busy-${order.id}` },
      payload: { machineSerial: fx.machineSerial, slotId: fx.slots[2] },
    });
    expect(busy.json()).toMatchObject({ code: 'MACHINE_BUSY' });

    // Hết DISPENSE_PRESS_WINDOW_SEC: đèn tắt, PRESS_TIMEOUT, đơn FORFEITED.
    clock.advance(PRESS_WINDOW_MS);
    await settle();
    expect(machine.litSlot).toBeNull();
    expect(await flow.orderRow(order.id)).toMatchObject({
      status: 'FORFEITED',
      failure_code: 'PRESS_TIMEOUT',
      needs_manual_review: false,
    });

    // Khách bấm sau khi hết giờ: không xịt, thiết bị không gửi gì, đơn giữ nguyên.
    machine.press(1);
    await settle();
    expect(machine.actuations.size).toBe(0);
    expect((await flow.orderRow(order.id))?.status).toBe('FORFEITED');

    // Lệnh cũ phát lại (broker gửi lại) cũng không thể kích hoạt lại (FR-DSP-10).
    machine.onCommand(JSON.stringify(commandsSent[commandsSent.length - 1]));
    await settle();
    expect(machine.litSlot).toBeNull();
    expect(machine.actuations.size).toBe(0);
  });

  it('test_FR_DSP_22_dispense_only_on_target_button_press', async () => {
    bootMachine();
    const order = await flow.paidOrder(0);
    await tick();

    // Bấm nhầm nút slot khác: bỏ qua, đèn đúng slot vẫn sáng.
    machine.press(3);
    expect(machine.litSlot).toBe(1);

    // Bấm đúng nút ngay trước khi hết giờ: xịt đúng slot, đúng một lần.
    clock.advance(PRESS_WINDOW_MS - 1);
    machine.press(1);
    machine.press(1);
    await settle();
    expect([...machine.actuations]).toEqual([[1, 1]]);
    expect((await lastCommand(order))?.status).toBe('SUCCEEDED');
    expect((await flow.orderRow(order.id))?.status).toBe('DISPENSED');

    // Hẹn giờ PRESS_TIMEOUT đã hủy: tiến thêm không sinh REJECT nào đè lên kết quả.
    clock.advance(PRESS_WINDOW_MS);
    await settle();
    expect((await flow.orderRow(order.id))?.status).toBe('DISPENSED');
  });

  it('test_FR_DSP_10_device_rejects_replayed_command', async () => {
    bootMachine();
    const order = await flow.paidOrder(0);
    await tick();
    const original = commandsSent[commandsSent.length - 1];

    // Broker gửi lại lệnh (QoS 1) khi đèn còn sáng: không sáng lại, không mở cửa sổ bấm thứ hai.
    machine.onCommand(JSON.stringify(original));
    await settle();
    expect(machine.litSlot).toBe(1);
    expect((await lastCommand(order))?.status).toBe('ACKNOWLEDGED');

    machine.press(1);
    await settle();
    expect((await flow.orderRow(order.id))?.status).toBe('DISPENSED');

    // Phát lại đúng lệnh đã thực hiện → CMD_DUPLICATE, không xịt lần hai (BR-002); backend bỏ qua
    // REJECT đến sau khi lệnh đã SUCCEEDED.
    machine.onCommand(JSON.stringify(original));
    await settle();
    expect(machine.litSlot).toBeNull();
    expect([...machine.actuations]).toEqual([[1, 1]]);
    expect((await lastCommand(order))?.status).toBe('SUCCEEDED');
    expect((await flow.orderRow(order.id))?.status).toBe('DISPENSED');
  });

  it('test_FR_DSP_07_tampered_command_is_rejected_before_lighting', async () => {
    bootMachine();
    const order = await flow.paidOrder(0);
    await tick();
    machine.press(1);
    await settle();
    expect((await flow.orderRow(order.id))?.status).toBe('DISPENSED');

    // Kẻ chen giữa sửa slot và mã lệnh của một lệnh hợp lệ: chữ ký không còn khớp.
    const forged = {
      ...commandsSent[commandsSent.length - 1],
      command_token: 'cmd_forged',
      slot_number: 2,
    };
    machine.onCommand(JSON.stringify(forged));
    await settle();
    expect(machine.litSlot).toBeNull();
    expect([...machine.actuations]).toEqual([[1, 1]]);
  });

  it('test_FR_DSP_23_recheck_safety_on_press', async () => {
    bootMachine({ failOnPress: 'DOOR_OPEN' });
    const order = await flow.paidOrder(0);
    await tick();
    machine.press(1);
    await settle();

    expect(machine.actuations.size).toBe(0);
    expect(await flow.orderRow(order.id)).toMatchObject({
      status: 'FAILED',
      failure_code: 'DOOR_OPEN',
      needs_manual_review: true,
    });
  });

  it('test_FR_DSP_25_no_armed_state_after_reboot', async () => {
    bootMachine();
    const order = await flow.paidOrder(0);
    await tick();
    expect(machine.litSlot).toBe(1);

    // Mất điện khi đèn đang sáng: trạng thái chờ bấm chỉ nằm trong RAM nên mất theo.
    bootMachine();
    machine.press(1);
    await settle();
    expect(machine.litSlot).toBeNull();
    expect(machine.actuations.size).toBe(0);

    // Thiết bị không gửi gì cho lệnh đó; quá PRESS_WINDOW + RESULT_TIMEOUT kể từ ACK → UNKNOWN.
    await client.query(
      `UPDATE dispense_commands SET acknowledged_at = now() - make_interval(secs => $2)
        WHERE order_id = $1`,
      [order.id, PRESS_WINDOW_MS / 1000 + RESULT_TIMEOUT_SEC + 1],
    );
    await tick();
    expect((await lastCommand(order))?.status).toBe('UNKNOWN');
    // Không phải FORFEITED: khách có thể đã bấm mà máy không xịt — cần người xem (FR-DSP-25 AC2).
    expect(await flow.orderRow(order.id)).toMatchObject({
      status: 'DISPENSE_REQUESTED',
      needs_manual_review: true,
    });
  });
});
