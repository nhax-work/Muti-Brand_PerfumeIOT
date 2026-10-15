/**
 * Logic thuần của phiếu khiếu nại hoàn tiền (ADR-0012): đơn nào được khiếu nại, phải hoàn bao nhiêu,
 * và mã khiếu nại dùng một lần trên QR sự cố.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { OrderStatus } from '../../../shared/db/types.generated.js';

export interface ClaimableOrderFacts {
  readonly status: OrderStatus;
  readonly paidAt: Date | null;
  readonly needsManualReview: boolean;
  readonly amount: string;
}

export interface RefundableParts {
  /** Khách không nhận được lượt xịt — hoàn cả tiền đơn, đơn chuyển REFUNDED. */
  readonly refundOrder: boolean;
  /** Số lần khách chuyển khoản thừa cùng mã QR (EXTRA_TRANSFER_REFUND_PENDING). */
  readonly extraTransfers: number;
  /** Tổng phải hoàn, numeric(19,4) dạng chuỗi. */
  readonly amount: string;
}

/**
 * `null` nếu đơn không có gì để hoàn. Đơn DISPENSED hay FORFEITED (khách không bấm, ADR-0007) chỉ
 * được khiếu nại phần chuyển khoản thừa.
 */
export function refundablePartsOf(
  order: ClaimableOrderFacts,
  extraTransfers: number,
): RefundableParts | null {
  const notServed =
    order.status === 'REFUND_PENDING' ||
    (order.status === 'FAILED' && order.paidAt !== null) ||
    (order.status === 'DISPENSE_REQUESTED' && order.needsManualReview);
  if (!notServed && extraTransfers === 0) return null;

  // Mỗi lần chuyển thừa đúng bằng tiền đơn: QR điền sẵn số tiền, lệch thì webhook đã dừng ở
  // AMOUNT_MISMATCH trước khi tới nhánh chuyển thừa.
  const units = (notServed ? 1 : 0) + extraTransfers;
  return { refundOrder: notServed, extraTransfers, amount: multiplyMoney(order.amount, units) };
}

/** numeric(19,4) × số nguyên, làm trên đơn vị 1/10000 để không dính sai số dấu phẩy động. */
function multiplyMoney(amount: string, factor: number): string {
  const [whole = '0', fraction = ''] = amount.split('.');
  const minor = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0').slice(0, 4));
  const total = minor * BigInt(factor);
  const fractionPart = (total % 10000n).toString().padStart(4, '0');
  return `${total / 10000n}.${fractionPart}`;
}

/**
 * Mã khiếu nại = HMAC(bí mật, mã đơn). Không lưu ở CSDL: kiosk cần hiện lại mã mỗi lần poll trạng
 * thái, và kiểm chỉ cần tính lại. Dùng một lần nhờ mỗi đơn tối đa một phiếu (uq_refund_claim_order).
 */
export function claimTokenFor(secret: string, orderId: string): string {
  return createHmac('sha256', secret)
    .update(`refund-claim:${orderId}`)
    .digest('base64url')
    .slice(0, 32);
}

export function isValidClaimToken(secret: string, orderId: string, token: string): boolean {
  const expected = Buffer.from(claimTokenFor(secret, orderId));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
