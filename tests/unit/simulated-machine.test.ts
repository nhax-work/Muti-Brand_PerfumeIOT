/**
 * Unit test cho kịch bản lỗi của Device Simulator (scripts/lib/simulated-machine.ts) dùng để diễn lại
 * dừng bán an toàn (ADR-0015): từ chối trước ACK, và chuỗi lỗi liên tiếp có giới hạn (--fail-count).
 * Chữ ký và TTL đã có test e2e riêng (tests/e2e/test_command_ttl.test.ts) — ở đây bỏ qua chữ ký.
 */

import { describe, expect, it } from 'vitest';
import type { CommandVerifier } from '../../scripts/lib/command-verifier.js';
import {
  SimulatedMachine,
  type DeviceClock,
  type MachineBehavior,
} from '../../scripts/lib/simulated-machine.js';

/** Đồng hồ chạy tay: hẹn giờ chỉ chạy khi gọi `advance`. */
class ManualClock implements DeviceClock {
  private current = Date.parse('2026-10-16T08:00:00Z');
  private timers: { at: number; run: () => void }[] = [];
  now(): number {
    return this.current;
  }
  setTimeout(run: () => void, ms: number): unknown {
    const timer = { at: this.current + ms, run };
    this.timers.push(timer);
    return timer;
  }
  clearTimeout(handle: unknown): void {
    this.timers = this.timers.filter((t) => t !== handle);
  }
  advance(ms: number): void {
    this.current += ms;
    const due = this.timers.filter((t) => t.at <= this.current);
    this.timers = this.timers.filter((t) => t.at > this.current);
    for (const t of due) t.run();
  }
}

const ANY_SIGNATURE: CommandVerifier = { strict: false, check: () => ({ ok: true }) };

function machineWith(behavior: Partial<MachineBehavior>) {
  const clock = new ManualClock();
  const results: { stage: string; success?: boolean; failure_code?: string | null }[] = [];
  const machine = new SimulatedMachine({
    serial: 'M001',
    verifier: ANY_SIGNATURE,
    clock,
    log: () => undefined,
    behavior: { pressWindowSec: 60, pressAfterMs: 1000, ...behavior },
    publish: (topic, payload) => {
      if (topic.endsWith('/command/result')) results.push(JSON.parse(payload) as never);
    },
  });
  let seq = 0;
  /** Gửi một lệnh CUSTOMER, cho khách bấm, trả kết cục cuối cùng của lệnh đó. */
  const dispense = () => {
    results.length = 0;
    machine.onCommand(
      JSON.stringify({
        machine_serial: 'M001',
        command_token: `cmd_${++seq}`,
        dispense_type: 'CUSTOMER',
        slot_number: 1,
        expires_at: new Date(clock.now() + 60_000).toISOString(),
        signature: 'x',
      }),
    );
    clock.advance(1000);
    return results.at(-1);
  };
  return { dispense };
}

describe('Device Simulator — kịch bản lỗi (ADR-0015)', () => {
  it('--reject từ chối ngay khi nhận lệnh, không ACK — đèn chưa từng sáng', () => {
    const { dispense } = machineWith({ reject: 'DOOR_OPEN' });
    expect(dispense()).toMatchObject({ stage: 'REJECT', failure_code: 'DOOR_OPEN' });
  });

  it('--fail kèm --fail-count 3: ba lệnh đầu hỏng, lệnh thứ tư xịt thành công', () => {
    const { dispense } = machineWith({ fail: 'ACTUATOR_FAULT', failCount: 3 });
    for (let i = 0; i < 3; i++) {
      expect(dispense()).toMatchObject({
        stage: 'RESULT',
        success: false,
        failure_code: 'ACTUATOR_FAULT',
      });
    }
    expect(dispense()).toMatchObject({ stage: 'RESULT', success: true });
  });

  it('--reject kèm --fail-count 2: hết lượt lỗi thì sáng đèn và chờ bấm như thường', () => {
    const { dispense } = machineWith({ reject: 'SLOT_EMPTY', failCount: 2 });
    expect(dispense()).toMatchObject({ stage: 'REJECT', failure_code: 'SLOT_EMPTY' });
    expect(dispense()).toMatchObject({ stage: 'REJECT', failure_code: 'SLOT_EMPTY' });
    expect(dispense()).toMatchObject({ stage: 'RESULT', success: true });
  });

  it('không có --fail-count thì lỗi áp cho mọi lệnh', () => {
    const { dispense } = machineWith({ fail: 'ACTUATOR_FAULT' });
    for (let i = 0; i < 5; i++) expect(dispense()).toMatchObject({ success: false });
  });
});
