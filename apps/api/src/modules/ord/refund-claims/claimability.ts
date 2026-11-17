/**
 * Logic thuần của phiếu khiếu nại hoàn tiền (ADR-0012): đơn nào được khiếu nại, phải hoàn bao nhiêu,
 * và mã khiếu nại dùng một lần trên QR sự cố.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
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
  return safeEqual(claimTokenFor(secret, orderId), token);
}

// -------------------------------------------------------------------------------------
// Mã khiếu nại cho khách tra cứu (ADR-0031)
// -------------------------------------------------------------------------------------

/** Crockford Base32: không có I, L, O, U — không nhầm với 1, 0 và không thành từ tục. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 10;
const CODE_PREFIX = 'KN';
const RAW_CODE = /^[0-9A-HJKMNP-TV-Z]{10}$/;

/** 10 ký tự ngẫu nhiên từ bộ sinh số mật mã — 50 bit, không đoán được mã phiếu kế bên. */
export function generateClaimCode(): string {
  // 32 giá trị chia hết 256 nên lấy 5 bit thấp của mỗi byte không lệch phân phối.
  return Array.from(randomBytes(CODE_LENGTH), (b) => CROCKFORD[b & 31]).join('');
}

/** `KN-XXXXX-XXXXX` — dạng khách đọc, chép và dán. */
export function formatClaimCode(raw: string): string {
  return `${CODE_PREFIX}-${raw.slice(0, 5)}-${raw.slice(5)}`;
}

/**
 * Mã khách nhập → dạng lưu (10 ký tự), `null` nếu không phải mã hợp lệ. Bỏ dấu gạch, khoảng trắng,
 * tiền tố `KN`; không phân biệt hoa thường; I/L đọc thành 1, O đọc thành 0 (quy ước Crockford).
 */
export function normalizeClaimCode(input: string): string | null {
  let code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.length === CODE_LENGTH + CODE_PREFIX.length && code.startsWith(CODE_PREFIX)) {
    code = code.slice(CODE_PREFIX.length);
  }
  code = code.replace(/[IL]/g, '1').replace(/O/g, '0');
  return RAW_CODE.test(code) ? code : null;
}

/**
 * Khóa xem bằng chứng trong liên kết email (ADR-0031 mục 4, dùng ở ADR-0032). Như mã khiếu nại trong
 * QR: HMAC tính lại khi kiểm, không lưu. Tiền tố khác để hai loại mã không thay được cho nhau.
 */
export function claimViewKeyFor(secret: string, claimId: string): string {
  return createHmac('sha256', secret)
    .update(`refund-claim-view:${claimId}`)
    .digest('base64url')
    .slice(0, 32);
}

export function isValidClaimViewKey(secret: string, claimId: string, key: string): boolean {
  return safeEqual(claimViewKeyFor(secret, claimId), key);
}

function safeEqual(expectedText: string, givenText: string): boolean {
  const expected = Buffer.from(expectedText);
  const given = Buffer.from(givenText);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
