/**
 * Mã tham chiếu thanh toán `<TIỀN TỐ>-YYYYMMDD-XXXXXX`.
 *
 *   ORD — đơn kiosk, lưu ở `orders.payment_reference` (FR-ORD-07).
 *   CHK — mỗi payment của phiên thuê slot (ADR-0008): phiên thanh toán lại sau khi payment trước
 *         FAILED thì cần mã MỚI, vì `uq_payment_provider_reference` (ADR-0009).
 *
 * Tính duy nhất do CSDL bảo đảm, không do hàm này: phần ngẫu nhiên chỉ làm va chạm hiếm tới mức
 * người gọi thử lại vài lần là đủ.
 */

import { randomInt } from 'node:crypto';

export type PaymentReferencePrefix = 'ORD' | 'CHK';

/** Bỏ 0/O, 1/I/L để khách đọc mã cho tổng đài không nhầm (FR-ORD-21). */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const RANDOM_LENGTH = 6;

/**
 * @param at thời điểm tạo
 * @param timeZone múi giờ dùng cho phần ngày — múi giờ địa điểm đặt máy, để ngày trên mã khớp ngày
 *   khách thấy trên sao kê ngân hàng thay vì lệch sang hôm trước vì UTC
 * @param random nguồn ngẫu nhiên, thay được trong test
 */
export function newPaymentReference(
  prefix: PaymentReferencePrefix,
  at: Date,
  timeZone: string,
  random: (max: number) => number = randomInt,
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  let suffix = '';
  for (let i = 0; i < RANDOM_LENGTH; i++) {
    suffix += ALPHABET[random(ALPHABET.length)];
  }
  return `${prefix}-${part('year')}${part('month')}${part('day')}-${suffix}`;
}

export const PAYMENT_REFERENCE_PATTERN = /^(ORD|CHK)-\d{8}-[23456789A-HJKMNP-Z]{6}$/;
