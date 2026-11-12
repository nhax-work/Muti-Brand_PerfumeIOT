/**
 * Chốt chặn "máy dừng nhận đơn" dùng chung cho ORD và DSP (ADR-0015 mục 6, 7).
 *
 * Hai câu hỏi khác nhau, hai câu trả lời khác nhau — đừng gộp:
 *
 *   | Tình trạng máy                 | Nhận đơn MỚI? | Ghi lệnh cho đơn đã trả tiền chờ lượt? |
 *   |--------------------------------|---------------|----------------------------------------|
 *   | NORMAL, không có phiếu nạp mở  | có            | có                                     |
 *   | DRAINING                       | không         | có — phục vụ nốt rồi mới bảo trì (§7)  |
 *   | MAINTENANCE, DISABLED          | không         | không                                  |
 *   | có phiếu nạp STARTED           | không         | không — cửa đang mở (§6)               |
 *
 * Đơn chờ lượt bị giữ lại vì phiếu nạp hay bảo trì đi theo job chờ lượt (FR-ORD-34): quá
 * PAID_QUEUE_MAX_SEC thì FAILED + kiểm tra thủ công, khách khiếu nại qua QR sự cố.
 */

import { sql, type RawBuilder, type SqlBool } from 'kysely';
import type { MachineOperatingMode } from '../../shared/db/types.generated.js';
import { AppError } from '../../shared/errors/index.js';

/** Chế độ mà máy vẫn được ghi lệnh cho đơn đã trả tiền (mục 7: DRAINING phục vụ nốt). */
export const MODES_SERVING_PAID_QUEUE = [
  'NORMAL',
  'DRAINING',
] as const satisfies readonly MachineOperatingMode[];

/** Phiếu nạp đang mở trên máy (FR-INV-29, 30) — cả máy dừng bán, không chỉ slot đang nạp. */
export function openRefillSessionOn(machineIdColumn: string): RawBuilder<SqlBool> {
  return sql<SqlBool>`exists (
    select 1
      from refill_sessions rs_stop
     where rs_stop.machine_id = ${sql.ref(machineIdColumn)}
       and rs_stop.status = 'STARTED'
  )`;
}

/**
 * FR-ORD-04, FR-MNT-06, FR-INV-30: máy có nhận đơn mới không. Mất kết nối → MACHINE_OFFLINE; mọi chế
 * độ khác NORMAL (gồm DRAINING) hoặc có phiếu nạp mở → MACHINE_IN_MAINTENANCE (kiosk hiện màn tạm
 * ngưng).
 */
export function assertMachineAcceptsOrders(machine: SalesStopInput): void {
  const reason = salesStopReason(machine);
  if (reason === 'OFFLINE') throw new AppError('MACHINE_OFFLINE', 'ord.machineOffline');
  if (reason !== null) throw new AppError('MACHINE_IN_MAINTENANCE', 'ord.machineInMaintenance');
}

export interface SalesStopInput {
  readonly status: string;
  readonly operatingMode: MachineOperatingMode;
  readonly hasOpenRefillSession: boolean;
}

/** Lý do máy dừng nhận đơn mới (openapi `SalesStopReason`). */
export type SalesStopReason =
  'OFFLINE' | Exclude<MachineOperatingMode, 'NORMAL'> | 'REFILL_SESSION';

/**
 * Máy có nhận đơn mới không, và nếu không thì vì sao — MỘT luật cho cả kiosk (tạo đơn) lẫn banner
 * "máy dừng bán" của web quản trị (ADR-0028), để banner báo dừng bán khi và chỉ khi kiosk từ chối.
 * Thứ tự: mất kết nối → chế độ khác NORMAL → phiếu nạp đang mở. `null` = đang nhận đơn.
 */
export function salesStopReason(machine: SalesStopInput): SalesStopReason | null {
  if (machine.status !== 'ONLINE') return 'OFFLINE';
  if (machine.operatingMode !== 'NORMAL') return machine.operatingMode;
  if (machine.hasOpenRefillSession) return 'REFILL_SESSION';
  return null;
}
