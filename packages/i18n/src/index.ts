/**
 * Mặt tiền song ngữ Việt - Anh cho mọi chuỗi hướng người dùng (spec/PROJECT.md Mục 3 và Mục 9).
 *
 * Gói này CHỈ CHỨA DỮ LIỆU và một hàm tra bảng — không phụ thuộc framework, không phụ thuộc thư
 * viện i18n nào. Nhờ vậy `apps/api`, `apps/admin-web` và `apps/kiosk` dùng chung qua path mapping,
 * giống cách `@scentstation/contracts` đang được dùng (ADR-0003).
 *
 * VÌ SAO KHÔNG DÙNG i18next Ở ĐÂY: backend chỉ cần tra một bảng phẳng để dựng chuỗi dự phòng.
 * Frontend sau này muốn dùng i18next vẫn nạp được chính catalog này làm resource, nên thêm phụ
 * thuộc lúc này chỉ tốn mà không mua thêm gì.
 *
 * Quy ước: KHÓA viết tiếng Anh không dấu (định danh kỹ thuật), GIÁ TRỊ viết theo từng ngôn ngữ.
 */

import { en } from './en/index.js';
import { vi } from './vi/index.js';

export const catalogs = { vi, en } as const;

export type Locale = keyof typeof catalogs;
export const LOCALES = ['vi', 'en'] as const satisfies readonly Locale[];

/** Ngôn ngữ dùng khi không có thông tin gì khác — cũng là ngôn ngữ của `Error.message` từ API. */
export const DEFAULT_LOCALE: Locale = 'vi';

type Catalog = typeof vi;

/**
 * Khóa dạng `<vùng>.<tên>`, ví dụ `mch.machineNotFound`.
 *
 * Cố ý dừng ở hai tầng: kiểu suy ra được trong một dòng, thông báo lỗi của TypeScript còn đọc
 * được, và khóa đủ ngắn để gõ tay. Lồng sâu hơn thì cả hai thứ đó mất.
 */
export type MessageKey = {
  [Namespace in keyof Catalog]: `${Namespace & string}.${keyof Catalog[Namespace] & string}`;
}[keyof Catalog];

export type MessageParams = Readonly<Record<string, string | number>>;

/** Mọi khóa hợp lệ, dựng sẵn để `isMessageKey` và test tra cho nhanh. */
export const MESSAGE_KEYS: readonly MessageKey[] = Object.entries(vi).flatMap(
  ([namespace, entries]) =>
    Object.keys(entries as Record<string, string>).map(
      (name) => `${namespace}.${name}` as MessageKey,
    ),
);

const KEY_SET: ReadonlySet<string> = new Set(MESSAGE_KEYS);

export function isMessageKey(value: unknown): value is MessageKey {
  return typeof value === 'string' && KEY_SET.has(value);
}

/**
 * Thay chỗ giữ `{ten}` bằng tham số.
 *
 * Tham số thiếu thì giữ nguyên chỗ giữ thay vì in "undefined": chuỗi lỗi nhưng còn đọc được vẫn
 * hơn chuỗi lỗi mà không hiểu nó định nói gì. `tests/contract/i18n-parity.test.ts` bắt lệch bộ
 * tham số giữa hai ngôn ngữ nên trường hợp này không nên xảy ra ở bản phát hành.
 */
export function format(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = params[name];
    return value === undefined ? placeholder : String(value);
  });
}

export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const [namespace, name] = key.split('.') as [keyof Catalog, string];
  const entries = catalogs[locale][namespace] as Record<string, string>;
  // Rơi về tiếng Việt khi bản dịch thiếu. Kiểu dữ liệu đã chặn trường hợp này ở thời điểm biên
  // dịch, nhưng client có thể nạp catalog cũ hơn.
  const template = entries[name] ?? (vi[namespace] as Record<string, string>)[name] ?? key;
  return format(template, params);
}

export { en } from './en/index.js';
export { vi } from './vi/index.js';
