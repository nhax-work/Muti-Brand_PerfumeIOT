/**
 * State machine của đơn hàng (FR-ORD-10, spec/glossary.md "Order").
 *
 * Logic thuần, không đụng CSDL: mọi chỗ đổi `orders.status` — tạo đơn, webhook, job hết hạn, và từ
 * tuần 5 là luồng lệnh xịt (DSP) — đều hỏi bảng này trước. Cột `status` không có ràng buộc chuyển
 * trạng thái ở tầng CSDL (schema.sql §13 mục 1), nên đây là lớp bảo vệ duy nhất.
 */

import type { OrderStatus } from '../../shared/db/types.generated.js';

/**
 * Chuyển trạng thái hợp lệ. Nguồn: sơ đồ `Order` trong spec/glossary.md, cộng hai cạnh mà sơ đồ
 * chưa vẽ nhưng AC đã yêu cầu:
 *   - EXPIRED → REFUND_PENDING: tiền về sau khi đơn đã hết hạn (FR-ORD-16 AC3).
 *   - FAILED → REFUND_PENDING, REFUNDED: đơn cần kiểm tra thủ công được hoàn tiền (FR-ORD-19, 20).
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  CREATED: ['PENDING_PAYMENT', 'FAILED'],
  PENDING_PAYMENT: ['PAID', 'EXPIRED', 'FAILED'],
  // FAILED: không tạo được lệnh xịt (ví dụ slot hỏng giữa lúc thanh toán và lúc sáng đèn).
  PAID: ['DISPENSE_REQUESTED', 'FAILED', 'REFUND_PENDING'],
  DISPENSE_REQUESTED: ['DISPENSED', 'FAILED', 'FORFEITED', 'REFUND_PENDING'],
  EXPIRED: ['REFUND_PENDING'],
  FAILED: ['REFUND_PENDING', 'REFUNDED'],
  REFUND_PENDING: ['REFUNDED'],
  DISPENSED: [],
  FORFEITED: [],
  REFUNDED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/**
 * FR-ORD-17: chỉ đơn đã thanh toán và chưa có lệnh mới được tạo lệnh xịt. Mọi trạng thái khác —
 * kể cả DISPENSED (chống xịt trùng, BR-002) — bị từ chối.
 *
 * Tuần 5 (DSP): gọi hàm này TRƯỚC khi ghi `dispense_commands`. `uq_order_active_command` chặn lệnh
 * thứ hai cùng lúc, còn hàm này chặn lệnh cho đơn đã đóng.
 */
export function canCreateDispenseCommand(status: OrderStatus): boolean {
  return status === 'PAID';
}

/** Trạng thái cuối: đơn không bao giờ rời khỏi đây. */
export function isTerminal(status: OrderStatus): boolean {
  return ORDER_TRANSITIONS[status].length === 0;
}
