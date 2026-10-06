/**
 * Sinh số hóa đơn thuê slot `HD-YYYYMMDD-XXXXXX` (FR-SLT-38, ADR-0008).
 *
 *   HD — tiền tố hóa đơn thuê slot.
 *   YYYYMMDD — ngày thanh toán theo múi giờ địa phương (Asia/Ho_Chi_Minh).
 *   XXXXXX — 6 ký tự ngẫu nhiên trong bảng ALPHABET (bỏ 0/O, 1/I/L để tránh nhầm lẫn).
 *
 * Tính duy nhất toàn hệ thống do CSDL bảo đảm qua ràng buộc `uq_rental_invoice_number`.
 */

import { randomInt } from 'node:crypto';

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const RANDOM_LENGTH = 6;

export function newInvoiceNumber(
  at: Date,
  timeZone = 'Asia/Ho_Chi_Minh',
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
  return `HD-${part('year')}${part('month')}${part('day')}-${suffix}`;
}

export const INVOICE_NUMBER_PATTERN = /^HD-\d{8}-[23456789A-HJKMNP-Z]{6}$/;
