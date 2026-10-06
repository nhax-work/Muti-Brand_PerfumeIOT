/**
 * Thiết bị giả lập chạy bằng Node — đóng vai ESP32 theo spec/contracts/mqtt.md, để chạy hết chuỗi
 * thanh toán → lệnh → ACK → bấm nút → RESULT mà không cần phần cứng.
 *
 *   npm run sim                                  # M001, tự "bấm nút" sau 2 giây
 *   npm run sim -- --serial M001 --press-after 5
 *   npm run sim -- --no-press                    # không bấm → PRESS_TIMEOUT → đơn FORFEITED
 *   npm run sim -- --wrong-slot 3                # bấm nhầm nút slot 3 (bị bỏ qua) rồi bấm đúng nút
 *   npm run sim -- --wrong-slot 3 --no-press     # chỉ bấm nhầm → PRESS_TIMEOUT → đơn FORFEITED
 *   npm run sim -- --reject DOOR_OPEN            # từ chối ngay khi nhận lệnh
 *   npm run sim -- --fail ACTUATOR_FAULT         # bấm rồi nhưng cơ cấu hỏng → đơn FAILED
 *   npm run sim -- --public-key device.pub.pem   # kiểm chữ ký bằng khóa công khai chỉ định
 *   npm run sim:many                             # 50 máy SIM-001..SIM-050 chỉ gửi heartbeat
 *
 * Kiểm lệnh theo đủ thứ tự §5.1, bắt đầu bằng chữ ký (FR-DSP-07). Khóa công khai lấy từ --public-key,
 * không có thì suy ra từ DISPENSE_SIGNING_KEY trong .env; không có cả hai thì chạy chế độ dev như
 * firmware bật DEV_ALLOW_UNSIGNED_COMMANDS (đòi có trường `signature`, không xác minh giá trị).
 *
 * Mỗi máy chỉ giữ một lệnh chờ bấm (FR-DSP-26); nút của slot khác bị bỏ qua (FR-DSP-22). Broker lấy
 * từ --broker, rồi MQTT_URL trong .env.
 *
 * KHÔNG chạy cùng lúc với ESP32 thật mang cùng serial — cả hai sẽ cùng trả lời một lệnh.
 */

import 'dotenv/config';
import { parseArgs } from 'node:util';
import { connect, type MqttClient } from 'mqtt';
import { SPEC_CONSTRAINTS } from '../apps/api/src/shared/config/constraints.generated.js';
import {
  createCommandVerifier,
  loadDevicePublicKey,
  type CommandVerifier,
} from './lib/command-verifier.js';

const { values } = parseArgs({
  options: {
    serial: { type: 'string', default: 'M001' },
    machines: { type: 'string' },
    broker: { type: 'string' },
    'press-after': { type: 'string', default: '2' },
    'no-press': { type: 'boolean', default: false },
    'wrong-slot': { type: 'string' },
    'public-key': { type: 'string' },
    reject: { type: 'string' },
    fail: { type: 'string' },
  },
});

const broker = values.broker ?? process.env['MQTT_URL'] ?? 'mqtt://localhost:1883';
const pressWindowSec = SPEC_CONSTRAINTS.DISPENSE_PRESS_WINDOW_SEC;
const pressAfterMs = Math.max(0, Number(values['press-after'])) * 1000;
const wrongSlot = values['wrong-slot'] === undefined ? null : Number(values['wrong-slot']);
if (wrongSlot !== null && (!Number.isInteger(wrongSlot) || wrongSlot < 1)) {
  console.error(`--wrong-slot phải là số slot nguyên dương, nhận được: ${values['wrong-slot']}`);
  process.exit(1);
}

interface Command {
  machine_serial?: string;
  command_token?: string;
  command_type?: string;
  dispense_type?: string;
  slot_number?: number;
  expires_at?: string;
}

class SimulatedMachine {
  private readonly executed = new Set<string>();
  private pending: { token: string; slot: number; timers: NodeJS.Timeout[] } | null = null;
  private eventSeq = 0;
  private readonly startedAt = Date.now();

  constructor(
    private readonly client: MqttClient,
    readonly serial: string,
    private readonly handlesCommands: boolean,
    private readonly verifier: CommandVerifier,
  ) {}

  topic(suffix: string): string {
    return `scentstation/${this.serial}/${suffix}`;
  }

  start(): void {
    if (this.handlesCommands) {
      this.client.subscribe(this.topic('command'), { qos: 1 });
    }
    this.heartbeat();
    setInterval(() => this.heartbeat(), SPEC_CONSTRAINTS.HEARTBEAT_INTERVAL_SEC * 1000);
  }

  onCommand(raw: Buffer): void {
    let message: unknown;
    try {
      message = JSON.parse(raw.toString('utf8'));
    } catch {
      return;
    }
    if (message === null || typeof message !== 'object' || Array.isArray(message)) return;
    const command = message as Command;
    const token = command.command_token ?? '';
    const slot = command.slot_number ?? 0;
    console.log(`[${this.serial}] ← lệnh ${token} slot ${slot}`);

    const reason = this.validate(message as Record<string, unknown>, command, token);
    if (reason) return this.reject(token, reason);
    if (values.reject) return this.reject(token, values.reject);

    if (command.dispense_type === 'DIAGNOSTIC') {
      this.executed.add(token);
      this.ack(token);
      return this.result(token, new Date());
    }

    // FR-DSP-21: sáng đèn, gửi ACK, chưa kích hoạt.
    this.ack(token);
    console.log(`[${this.serial}] 💡 đèn nút slot ${slot} sáng — chờ bấm ${pressWindowSec}s`);
    const windowMs = pressWindowSec * 1000;
    const timers: NodeJS.Timeout[] = [];
    let correctPressAt = pressAfterMs;
    if (wrongSlot !== null) {
      // Bấm nhầm trước, rồi (nếu không --no-press) thêm một nhịp --press-after mới bấm đúng nút.
      const other = wrongSlot === slot ? (slot === 1 ? 2 : 1) : wrongSlot;
      timers.push(setTimeout(() => this.pressButton(other), Math.min(pressAfterMs, windowMs - 2)));
      correctPressAt += pressAfterMs;
    }
    timers.push(
      values['no-press']
        ? setTimeout(() => this.pressTimeout(), windowMs)
        : setTimeout(() => this.pressButton(slot), Math.min(correctPressAt, windowMs - 1)),
    );
    this.pending = { token, slot, timers };
  }

  /** Đúng thứ tự §5.1, dừng ở lỗi đầu tiên. Bước 5–7 (cửa, bảo trì, slot rỗng) giả lập bằng --reject. */
  private validate(
    message: Record<string, unknown>,
    command: Command,
    token: string,
  ): string | null {
    const signature = this.verifier.check(message);
    if (!signature.ok) {
      console.warn(
        `[${this.serial}] ⚠ chữ ký ${signature.reason === 'MISSING' ? 'thiếu' : 'không hợp lệ'}`,
      );
      return 'CMD_INVALID_SIGNATURE';
    }
    if (command.machine_serial !== this.serial) return 'CMD_WRONG_MACHINE';
    const expiresAt = Date.parse(command.expires_at ?? '');
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) return 'CMD_EXPIRED';
    if (!token || this.executed.has(token) || this.pending?.token === token) return 'CMD_DUPLICATE';
    if (this.pending) {
      // Nền tảng không được gửi lệnh CUSTOMER thứ hai khi đèn còn sáng (FR-DSP-26).
      console.warn(`[${this.serial}] ⚠ nhận lệnh mới khi đang chờ bấm ${this.pending.token}`);
      return 'CMD_DUPLICATE';
    }
    return null;
  }

  /** Tắt đèn, hủy mọi hẹn giờ còn lại và ghi mã lệnh vào danh sách đã xử lý (FR-DSP-10). */
  private finishPending(): { token: string; slot: number } | null {
    if (!this.pending) return null;
    const { token, slot, timers } = this.pending;
    for (const timer of timers) clearTimeout(timer);
    this.pending = null;
    this.executed.add(token);
    return { token, slot };
  }

  /** Khách bấm nút vật lý của `buttonSlot`. Chỉ nút của slot đang sáng đèn mới có tác dụng. */
  private pressButton(buttonSlot: number): void {
    if (!this.pending) return;
    if (buttonSlot !== this.pending.slot) {
      console.log(
        `[${this.serial}] 👆 khách bấm nhầm nút slot ${buttonSlot} → bỏ qua, ` +
          `đèn slot ${this.pending.slot} vẫn sáng (FR-DSP-22)`,
      );
      return;
    }
    const { token, slot } = this.finishPending()!;
    const pressedAt = new Date();
    console.log(`[${this.serial}] 👆 khách bấm nút slot ${slot} → bơm chạy`);
    if (values.fail) return this.result(token, pressedAt, values.fail);
    this.result(token, pressedAt);
  }

  private pressTimeout(): void {
    const finished = this.finishPending();
    if (!finished) return;
    console.log(`[${this.serial}] ⌛ hết giờ chờ bấm slot ${finished.slot}`);
    this.reject(finished.token, 'PRESS_TIMEOUT');
  }

  private base(): Record<string, unknown> {
    return { schema_version: 1, machine_serial: this.serial, ts: new Date().toISOString() };
  }

  private ack(token: string): void {
    this.publish('command/result', { ...this.base(), command_token: token, stage: 'ACK' });
  }

  private reject(token: string, failureCode: string): void {
    console.log(`[${this.serial}] ✖ REJECT ${failureCode}`);
    this.publish('command/result', {
      ...this.base(),
      command_token: token,
      stage: 'REJECT',
      failure_code: failureCode,
    });
  }

  private result(token: string, pressedAt: Date, failureCode?: string): void {
    const executedAt = new Date(pressedAt.getTime() + 50);
    const success = failureCode === undefined;
    console.log(`[${this.serial}] ${success ? '✔' : '✖'} RESULT ${success ? 'OK' : failureCode}`);
    this.publish('command/result', {
      ...this.base(),
      command_token: token,
      stage: 'RESULT',
      device_event_id: `${this.serial}-${Math.floor(Date.now() / 1000)}-${++this.eventSeq}`,
      success,
      pressed_at: pressedAt.toISOString(),
      executed_at: executedAt.toISOString(),
      result_code: success ? 'OK' : null,
      failure_code: success ? null : failureCode,
    });
  }

  private heartbeat(): void {
    this.client.publish(
      this.topic('heartbeat'),
      JSON.stringify({
        ...this.base(),
        firmware_version: 'node-simulator-0.1.0',
        configuration_version: 0,
        operating_mode: 'NORMAL',
        uptime_sec: Math.floor((Date.now() - this.startedAt) / 1000),
      }),
      { qos: 0 },
    );
  }

  private publish(suffix: string, message: Record<string, unknown>): void {
    this.client.publish(this.topic(suffix), JSON.stringify(message), { qos: 1 });
  }
}

function loadVerifier(): CommandVerifier {
  try {
    const key = loadDevicePublicKey(values['public-key'], process.env['DISPENSE_SIGNING_KEY']);
    return createCommandVerifier(key);
  } catch (error) {
    console.error(`Không đọc được khóa kiểm chữ ký: ${(error as Error).message}`);
    process.exit(1);
  }
}

function main(): void {
  const count = values.machines ? Math.max(1, Number(values.machines)) : 0;
  const serials =
    count > 0
      ? Array.from({ length: count }, (_, i) => `SIM-${String(i + 1).padStart(3, '0')}`)
      : [values.serial];

  const verifier = loadVerifier();
  console.log(
    verifier.strict
      ? `Kiểm chữ ký Ed25519: BẬT (khóa từ ${values['public-key'] ? '--public-key' : 'DISPENSE_SIGNING_KEY'})`
      : 'Kiểm chữ ký: TẮT — chế độ dev, chỉ đòi có trường signature (như DEV_ALLOW_UNSIGNED_COMMANDS)',
  );

  const client = connect(broker, { clientId: `scentstation-sim-${process.pid}`, clean: true });
  const machines = new Map<string, SimulatedMachine>();
  client.on('connect', () => {
    console.log(
      `Đã kết nối ${broker} — giả lập ${serials.length} máy: ${serials.slice(0, 5).join(', ')}${serials.length > 5 ? '…' : ''}`,
    );
    for (const serial of serials) {
      if (machines.has(serial)) continue;
      // Chế độ nhiều máy chỉ gửi heartbeat (test tải); một máy thì nhận lệnh.
      const machine = new SimulatedMachine(client, serial, count === 0, verifier);
      machines.set(serial, machine);
      machine.start();
    }
  });
  client.on('message', (topic, payload) => {
    const serial = topic.split('/')[1] ?? '';
    if (topic.endsWith('/command')) machines.get(serial)?.onCommand(payload);
  });
  client.on('error', (error) => console.error(`MQTT lỗi: ${error.message}`));
  client.on('offline', () => console.warn(`Mất kết nối ${broker}, đang thử lại…`));
}

main();
