/**
 * Máy giả lập đóng vai ESP32 theo spec/contracts/mqtt.md — phần logic thiết bị của
 * `scripts/device-simulator.ts`, tách ra để test e2e dựng được máy với đồng hồ và đường truyền giả.
 *
 * Kiểm lệnh theo đủ thứ tự §5.1, bắt đầu bằng chữ ký (FR-DSP-07). Mỗi máy chỉ giữ một lệnh chờ bấm
 * (FR-DSP-26); nút của slot khác bị bỏ qua (FR-DSP-22). Danh sách lệnh đã xử lý chỉ nằm trong RAM —
 * firmware thật phải giữ nó qua khởi động lại (§5.1), simulator thì không cần.
 */

import type { CommandVerifier } from './command-verifier.js';

/** Cách máy gửi bản tin — client MQTT thật, hoặc đường vòng trong test. */
export type DevicePublish = (topic: string, payload: string, qos: 0 | 1) => void;

/** Đồng hồ và hẹn giờ của thiết bị — test thay bằng bản điều khiển tay. */
export interface DeviceClock {
  now(): number;
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const REAL_CLOCK: DeviceClock = {
  now: () => Date.now(),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

/** Kịch bản khách và phần cứng — khớp các cờ dòng lệnh của device-simulator. */
export interface MachineBehavior {
  /** Thời gian chờ bấm (`press_window_sec`, = DISPENSE_PRESS_WINDOW_SEC). */
  readonly pressWindowSec: number;
  /** Khách tự bấm sau bao lâu; `null` = không ai bấm, chỉ bấm qua `press()` (test). */
  readonly pressAfterMs: number | null;
  /** Bấm nhầm nút slot này trước khi bấm đúng (FR-DSP-22). */
  readonly wrongSlot?: number | null;
  /** Từ chối ngay khi nhận lệnh với mã này (bước 5–7 của §5.1). */
  readonly reject?: string | null;
  /** Bấm rồi nhưng kiểm an toàn lần hai không đạt → REJECT sau ACK (FR-DSP-23). */
  readonly failOnPress?: string | null;
  /** Bấm rồi, cơ cấu chạy nhưng hỏng → RESULT success=false. */
  readonly fail?: string | null;
}

export interface SimulatedMachineOptions {
  readonly serial: string;
  readonly verifier: CommandVerifier;
  readonly publish: DevicePublish;
  readonly behavior: MachineBehavior;
  readonly clock?: DeviceClock;
  /** Ghi nhật ký người đọc được; mặc định `console.log`. */
  readonly log?: (line: string) => void;
}

interface Command {
  machine_serial?: string;
  command_token?: string;
  command_type?: string;
  dispense_type?: string;
  slot_number?: number;
  expires_at?: string;
}

interface Pending {
  readonly token: string;
  readonly slot: number;
  readonly timers: unknown[];
}

export class SimulatedMachine {
  readonly serial: string;
  /** Số lần cơ cấu đã kích hoạt, theo slot — test dùng để chứng minh "không xịt". */
  readonly actuations = new Map<number, number>();
  private readonly executed = new Set<string>();
  private pending: Pending | null = null;
  private eventSeq = 0;
  private readonly clock: DeviceClock;
  private readonly startedAt: number;
  private readonly log: (line: string) => void;

  constructor(private readonly options: SimulatedMachineOptions) {
    this.serial = options.serial;
    this.clock = options.clock ?? REAL_CLOCK;
    this.log = options.log ?? ((line) => console.log(line));
    this.startedAt = this.clock.now();
  }

  topic(suffix: string): string {
    return `scentstation/${this.serial}/${suffix}`;
  }

  /** Slot đang sáng đèn chờ bấm, nếu có. */
  get litSlot(): number | null {
    return this.pending?.slot ?? null;
  }

  onCommand(raw: Buffer | string): void {
    let message: unknown;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (message === null || typeof message !== 'object' || Array.isArray(message)) return;
    const command = message as Command;
    const token = command.command_token ?? '';
    const slot = command.slot_number ?? 0;
    this.log(`[${this.serial}] ← lệnh ${token} slot ${slot}`);

    const reason = this.validate(message as Record<string, unknown>, command, token);
    if (reason) return this.reject(token, reason);
    const { behavior } = this.options;
    if (behavior.reject) {
      this.executed.add(token);
      return this.reject(token, behavior.reject);
    }

    if (command.dispense_type === 'DIAGNOSTIC') {
      // FR-DSP-27: chẩn đoán xịt ngay, không chờ bấm.
      this.executed.add(token);
      this.ack(token);
      return this.actuate(token, slot, null);
    }

    // FR-DSP-21: sáng đèn, gửi ACK, chưa kích hoạt.
    this.ack(token);
    this.log(`[${this.serial}] 💡 đèn nút slot ${slot} sáng — chờ bấm ${behavior.pressWindowSec}s`);
    const windowMs = behavior.pressWindowSec * 1000;
    const timers: unknown[] = [this.clock.setTimeout(() => this.pressTimeout(), windowMs)];
    if (behavior.pressAfterMs !== null) {
      let correctPressAt = behavior.pressAfterMs;
      if (behavior.wrongSlot != null) {
        // Bấm nhầm trước, rồi thêm một nhịp pressAfterMs mới bấm đúng nút.
        const other = behavior.wrongSlot === slot ? (slot === 1 ? 2 : 1) : behavior.wrongSlot;
        timers.push(
          this.clock.setTimeout(
            () => this.press(other),
            Math.min(behavior.pressAfterMs, windowMs - 2),
          ),
        );
        correctPressAt += behavior.pressAfterMs;
      }
      timers.push(
        this.clock.setTimeout(() => this.press(slot), Math.min(correctPressAt, windowMs - 1)),
      );
    }
    this.pending = { token, slot, timers };
  }

  /**
   * Khách bấm nút vật lý của `buttonSlot`. Chỉ nút của slot đang sáng đèn mới có tác dụng; không
   * đèn nào sáng thì không gì xảy ra (FR-DSP-22 AC4).
   */
  press(buttonSlot: number): void {
    if (!this.pending) {
      this.log(`[${this.serial}] 👆 bấm nút slot ${buttonSlot} khi không đèn nào sáng → bỏ qua`);
      return;
    }
    if (buttonSlot !== this.pending.slot) {
      this.log(
        `[${this.serial}] 👆 khách bấm nhầm nút slot ${buttonSlot} → bỏ qua, ` +
          `đèn slot ${this.pending.slot} vẫn sáng (FR-DSP-22)`,
      );
      return;
    }
    const { token, slot } = this.finishPending();
    const pressedAt = this.clock.now();
    const { behavior } = this.options;
    if (behavior.failOnPress) {
      // FR-DSP-23: kiểm lần hai lúc bấm không đạt — không kích hoạt.
      this.log(
        `[${this.serial}] 👆 khách bấm nút slot ${slot} nhưng kiểm an toàn lần hai không đạt`,
      );
      return this.reject(token, behavior.failOnPress);
    }
    this.log(`[${this.serial}] 👆 khách bấm nút slot ${slot} → bơm chạy`);
    this.actuate(token, slot, pressedAt);
  }

  /** Đúng thứ tự §5.1, dừng ở lỗi đầu tiên. Bước 5–7 (cửa, bảo trì, slot rỗng) giả lập bằng `reject`. */
  private validate(
    message: Record<string, unknown>,
    command: Command,
    token: string,
  ): string | null {
    const signature = this.options.verifier.check(message);
    if (!signature.ok) {
      this.log(
        `[${this.serial}] ⚠ chữ ký ${signature.reason === 'MISSING' ? 'thiếu' : 'không hợp lệ'}`,
      );
      return 'CMD_INVALID_SIGNATURE';
    }
    if (command.machine_serial !== this.serial) return 'CMD_WRONG_MACHINE';
    const expiresAt = Date.parse(command.expires_at ?? '');
    if (Number.isNaN(expiresAt) || expiresAt <= this.clock.now()) return 'CMD_EXPIRED';
    if (!token || this.executed.has(token) || this.pending?.token === token) return 'CMD_DUPLICATE';
    if (this.pending) {
      // Nền tảng không được gửi lệnh CUSTOMER thứ hai khi đèn còn sáng (FR-DSP-26). mqtt.md không
      // có mã riêng cho ca này; CMD_DUPLICATE giữ lệnh mới khỏi bị thực hiện.
      this.log(`[${this.serial}] ⚠ nhận lệnh mới khi đang chờ bấm ${this.pending.token}`);
      return 'CMD_DUPLICATE';
    }
    return null;
  }

  /** Tắt đèn, hủy mọi hẹn giờ còn lại và ghi mã lệnh vào danh sách đã xử lý (FR-DSP-10). */
  private finishPending(): { token: string; slot: number } {
    const { token, slot, timers } = this.pending as Pending;
    for (const timer of timers) this.clock.clearTimeout(timer);
    this.pending = null;
    this.executed.add(token);
    return { token, slot };
  }

  private pressTimeout(): void {
    if (!this.pending) return;
    const { token, slot } = this.finishPending();
    this.log(`[${this.serial}] ⌛ hết giờ chờ bấm slot ${slot}`);
    this.reject(token, 'PRESS_TIMEOUT');
  }

  private actuate(token: string, slot: number, pressedAt: number | null): void {
    this.actuations.set(slot, (this.actuations.get(slot) ?? 0) + 1);
    const executedAt = this.clock.now();
    const failureCode = this.options.behavior.fail ?? undefined;
    const success = failureCode === undefined;
    this.log(`[${this.serial}] ${success ? '✔' : '✖'} RESULT ${success ? 'OK' : failureCode}`);
    this.publish('command/result', {
      ...this.base(),
      command_token: token,
      stage: 'RESULT',
      device_event_id: `${this.serial}-${Math.floor(executedAt / 1000)}-${++this.eventSeq}`,
      success,
      ...(pressedAt !== null ? { pressed_at: new Date(pressedAt).toISOString() } : {}),
      executed_at: new Date(executedAt).toISOString(),
      result_code: success ? 'OK' : null,
      failure_code: success ? null : failureCode,
    });
  }

  private base(): Record<string, unknown> {
    return {
      schema_version: 1,
      machine_serial: this.serial,
      ts: new Date(this.clock.now()).toISOString(),
    };
  }

  private ack(token: string): void {
    this.publish('command/result', { ...this.base(), command_token: token, stage: 'ACK' });
  }

  private reject(token: string, failureCode: string): void {
    this.log(`[${this.serial}] ✖ REJECT ${failureCode}`);
    this.publish('command/result', {
      ...this.base(),
      command_token: token,
      stage: 'REJECT',
      failure_code: failureCode,
    });
  }

  heartbeat(): void {
    this.options.publish(
      this.topic('heartbeat'),
      JSON.stringify({
        ...this.base(),
        firmware_version: 'node-simulator-0.1.0',
        configuration_version: 0,
        operating_mode: 'NORMAL',
        uptime_sec: Math.floor((this.clock.now() - this.startedAt) / 1000),
      }),
      0,
    );
  }

  private publish(suffix: string, message: Record<string, unknown>): void {
    this.options.publish(this.topic(suffix), JSON.stringify(message), 1);
  }
}
