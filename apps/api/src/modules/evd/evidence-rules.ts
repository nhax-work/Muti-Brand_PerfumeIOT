/**
 * Logic thuần của bằng chứng camera (ADR-0032): nhận diện tệp, khung giờ, đường dẫn ký có hạn, Range.
 * Không đụng CSDL hay kho tệp để unit test được trực tiếp.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * MP4 (ISO BMFF): hộp đầu tiên là `ftyp` — byte 4..7. Kiểm theo nội dung, không theo đuôi tên hay
 * `Content-Type`. Không chuyển mã (chưa có worker, ADR-0020): tệp được lưu nguyên trạng.
 */
export function isMp4(data: Buffer): boolean {
  return data.length >= 12 && data.toString('ascii', 4, 8) === 'ftyp';
}

export interface TimeWindow {
  readonly from: Date;
  readonly to: Date;
}

/** Nới hai đầu khung giờ thêm `paddingSec` (CAMERA_WINDOW_PADDING_SEC). */
export function padWindow(from: Date, to: Date, paddingSec: number): TimeWindow {
  const pad = paddingSec * 1000;
  return { from: new Date(from.getTime() - pad), to: new Date(to.getTime() + pad) };
}

/**
 * Khoảng ghi theo giờ trên hình → giờ thật: trừ độ lệch đồng hồ camera (giờ trên hình − giờ thật).
 */
export function toRealTime(window: TimeWindow, clockOffsetSec: number): TimeWindow {
  const offset = clockOffsetSec * 1000;
  return {
    from: new Date(window.from.getTime() - offset),
    to: new Date(window.to.getTime() - offset),
  };
}

/** Hai khoảng có giao nhau (chạm mép cũng tính). */
export function overlaps(a: TimeWindow, b: TimeWindow): boolean {
  return a.from.getTime() <= b.to.getTime() && b.from.getTime() <= a.to.getTime();
}

// -------------------------------------------------------------------------------------
// Đường dẫn ký có hạn tới tệp riêng tư (ADR-0032 mục 8)
// -------------------------------------------------------------------------------------

/** Khóa ký riêng cho đường dẫn tệp, dẫn xuất từ bí mật gốc — không dùng chung khóa với JWT. */
export function fileUrlKey(rootSecret: string): Buffer {
  return createHmac('sha256', rootSecret).update('evd:evidence-file-url').digest();
}

function signature(key: Buffer, evidenceId: string, exp: number): string {
  return createHmac('sha256', key).update(`${evidenceId}:${exp}`).digest('base64url');
}

/** Đường dẫn tương đối với gốc API, hết hạn sau `ttlSec`. */
export function signFileUrl(
  key: Buffer,
  evidenceId: string,
  now: Date,
  ttlSec: number,
): { url: string; expiresAt: Date } {
  const exp = Math.floor(now.getTime() / 1000) + ttlSec;
  const sig = signature(key, evidenceId, exp);
  return {
    url: `/evidence-files/${evidenceId}?exp=${exp}&sig=${sig}`,
    expiresAt: new Date(exp * 1000),
  };
}

export function verifyFileUrl(
  key: Buffer,
  evidenceId: string,
  exp: number,
  sig: string,
  now: Date,
): boolean {
  if (!Number.isInteger(exp) || exp * 1000 < now.getTime()) return false;
  const expected = Buffer.from(signature(key, evidenceId, exp));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// -------------------------------------------------------------------------------------
// HTTP Range — trình duyệt tua video MP4 (Safari bắt buộc có)
// -------------------------------------------------------------------------------------

/**
 * Một đoạn `bytes=start-end` trên tệp `size` byte. `null` = không có header (trả cả tệp);
 * `'unsatisfiable'` = header sai hoặc ngoài tệp (416). Nhiều đoạn thì chỉ phục vụ đoạn đầu.
 */
export function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null | 'unsatisfiable' {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) return 'unsatisfiable';
  let start: number;
  let end: number;
  if (match[1] === '') {
    // bytes=-N: N byte cuối.
    const suffix = Number(match[2]);
    if (suffix === 0) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || start > end) return 'unsatisfiable';
  return { start, end };
}
