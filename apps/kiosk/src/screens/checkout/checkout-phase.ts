import type { OrderStatusView } from '@/shared/api';

/**
 * Màn hình khách thấy ứng với trạng thái đơn + lệnh xịt (FR-ORD-11, FR-ORD-21, FR-ORD-26, FR-ORD-27).
 * Kiosk không tự suy nghiệp vụ — chỉ đọc `status`/`dispenseStatus` máy chủ trả (QT5, ADR-0003).
 */
export type CheckoutPhase =
  | 'PAYING'
  | 'PREPARING'
  | 'WAITING_TURN'
  | 'PRESS'
  | 'CHECKING'
  | 'DISPENSED'
  | 'FORFEITED'
  | 'EXPIRED'
  | 'PROBLEM';

/** Đơn PAID lâu hơn chừng này mà chưa có lệnh → máy đang phục vụ khách trước (FR-DSP-26). */
export const WAITING_TURN_AFTER_MS = 3000;

/**
 * @param paidForMs đơn đã ở PAID bao lâu (đo phía kiosk) — chỉ dùng để phân biệt "đang chuẩn bị" với
 *   "đang chờ lượt"
 */
export function phaseOf(view: OrderStatusView | undefined, paidForMs = 0): CheckoutPhase {
  if (!view) return 'PAYING';
  switch (view.status) {
    case 'CREATED':
    case 'PENDING_PAYMENT':
      return 'PAYING';
    case 'PAID':
      return paidForMs >= WAITING_TURN_AFTER_MS ? 'WAITING_TURN' : 'PREPARING';
    case 'DISPENSE_REQUESTED':
      if (view.dispenseStatus === 'ACKNOWLEDGED') return 'PRESS';
      if (view.dispenseStatus === 'UNKNOWN') return 'CHECKING';
      return 'PREPARING';
    case 'DISPENSED':
      return 'DISPENSED';
    case 'FORFEITED':
      return 'FORFEITED';
    case 'EXPIRED':
      return 'EXPIRED';
    default:
      return 'PROBLEM';
  }
}

/**
 * Hạn bấm nút khách thấy trên kiosk (FR-ORD-26, FR-ORD-27): `pressWindowSec` tính từ lúc modal
 * hướng dẫn hiện ra (`turnStartedAt`), nhưng không muộn hơn hạn máy chủ trả (đèn sáng +
 * `DISPENSE_PRESS_WINDOW_SEC`) — thiết bị hết giờ trước thì kiosk theo thiết bị.
 *
 * Đây chỉ là mốc giao diện. Ghi nhận khách bỏ lượt là việc của thiết bị và máy chủ: thiết bị báo
 * `PRESS_TIMEOUT` → đơn `FORFEITED`; thiết bị im lặng → job quét lệnh quá hạn đưa đơn vào kiểm tra
 * thủ công (ADR-0007, FR-DSP-18). Kiosk không gửi gì khi hết giờ.
 *
 * @returns mốc epoch ms, hoặc `null` khi chưa tới lượt khách (chưa bắt đầu đếm)
 */
export function pressDeadlineMs(
  turnStartedAt: number | null,
  pressWindowSec: number,
  serverDeadline: string | null | undefined,
): number | null {
  if (turnStartedAt === null) return null;
  const local = turnStartedAt + pressWindowSec * 1000;
  const server = serverDeadline ? Date.parse(serverDeadline) : Number.NaN;
  return Number.isNaN(server) ? local : Math.min(local, server);
}

/** Số giây còn lại tới `deadline`, không âm. */
export function secondsUntil(deadline: string | null | undefined, now: number): number | null {
  if (!deadline) return null;
  const at = Date.parse(deadline);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - now) / 1000));
}
