/**
 * Ánh xạ bản tin `command/result` của thiết bị sang trạng thái lệnh và đơn — đúng bảng "Ánh xạ sang
 * `dispense_commands.status`" ở spec/contracts/mqtt.md §6 (ADR-0007).
 *
 * Logic thuần, không đụng CSDL — unit test kiểm trực tiếp.
 */

import type { CommandStatus } from '../../shared/db/types.generated.js';

export type DeviceStage = 'ACK' | 'REJECT' | 'RESULT';

export interface DeviceReport {
  readonly stage: DeviceStage;
  readonly success?: boolean | undefined;
  readonly failureCode?: string | null | undefined;
}

export interface OrderOutcome {
  readonly to: 'DISPENSED' | 'FAILED' | 'FORFEITED';
  readonly failureCode: string | null;
  readonly manualReview: boolean;
}

export type CommandOutcome =
  /** Đèn nút đã sáng, chờ khách bấm — đơn giữ nguyên DISPENSE_REQUESTED. */
  | { readonly kind: 'ACKNOWLEDGED' }
  /** Bản tin nói về một bản sao của lệnh, không về chính lệnh — không đổi gì. */
  | { readonly kind: 'IGNORED' }
  /** Lệnh kết thúc; đơn chuyển theo `order`. */
  | {
      readonly kind: 'CLOSED';
      readonly commandStatus: Extract<CommandStatus, 'SUCCEEDED' | 'FAILED' | 'REJECTED'>;
      readonly order: OrderOutcome;
    };

/** Lệnh còn hiệu lực — trùng tập trạng thái của `uq_machine_active_customer_command`. */
export const ACTIVE_COMMAND_STATUSES = ['CREATED', 'SENT', 'ACKNOWLEDGED'] as const;

/** Trạng thái lệnh còn nhận ACK. */
export const ACKNOWLEDGEABLE_STATUSES = ['CREATED', 'SENT'] as const;

/**
 * Trạng thái lệnh còn nhận REJECT/RESULT. Gồm `UNKNOWN`: kết quả đến trễ sau timeout vẫn được ghi để
 * khép đơn đúng sự thật, thay vì để người kiểm tra thủ công đoán.
 */
export const CLOSABLE_STATUSES = ['CREATED', 'SENT', 'ACKNOWLEDGED', 'UNKNOWN'] as const;

export const PRESS_TIMEOUT = 'PRESS_TIMEOUT';
export const CMD_DUPLICATE = 'CMD_DUPLICATE';

/**
 * @param acknowledged lệnh đã có ACK trước bản tin này chưa (đèn đã sáng, khách có thể đã bấm)
 */
export function outcomeOf(report: DeviceReport, acknowledged: boolean): CommandOutcome {
  if (report.stage === 'ACK') return { kind: 'ACKNOWLEDGED' };

  if (report.stage === 'RESULT') {
    return report.success === true
      ? {
          kind: 'CLOSED',
          commandStatus: 'SUCCEEDED',
          order: { to: 'DISPENSED', failureCode: null, manualReview: false },
        }
      : {
          // Đã kích hoạt mà hỏng, khách đã trả tiền (FR-ORD-19).
          kind: 'CLOSED',
          commandStatus: 'FAILED',
          order: {
            to: 'FAILED',
            failureCode: report.failureCode ?? 'ACTUATOR_FAULT',
            manualReview: true,
          },
        };
  }

  const failureCode = report.failureCode ?? 'UNKNOWN';
  if (failureCode === CMD_DUPLICATE) {
    // Thiết bị từ chối một BẢN SAO (broker gửi lại QoS 1) của lệnh nó đã nhận — lệnh gốc vẫn đang
    // chờ bấm hoặc đã có kết quả riêng. Khép đơn theo bản tin này sẽ đánh FAILED một lượt khách vẫn
    // bấm được. Kết quả gốc bị mất thì mốc UNKNOWN (FR-DSP-18) đưa đơn vào kiểm tra thủ công.
    return { kind: 'IGNORED' };
  }
  if (failureCode === PRESS_TIMEOUT && acknowledged) {
    // Khách không bấm: mất lượt, không hoàn tiền, không kiểm tra thủ công (FR-ORD-27).
    return {
      kind: 'CLOSED',
      commandStatus: 'REJECTED',
      order: { to: 'FORFEITED', failureCode, manualReview: false },
    };
  }
  return {
    kind: 'CLOSED',
    commandStatus: 'REJECTED',
    // Sau ACK: khách đã trả tiền và đã bấm mà máy từ chối → cần người xem. Trước ACK: chưa sáng đèn.
    order: { to: 'FAILED', failureCode, manualReview: acknowledged },
  };
}
