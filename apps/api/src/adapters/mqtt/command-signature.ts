/**
 * Ký lệnh xịt theo spec/contracts/mqtt.md §5.1 (FR-DSP-04).
 *
 * Chuỗi ký là payload chuẩn hóa: JSON của bản tin sau khi bỏ `signature`, khóa sắp xếp tăng dần theo
 * mã Unicode, không khoảng trắng thừa, UTF-8. Chữ ký Ed25519 mã hóa base64url không đệm.
 */

import { createPrivateKey, sign, type KeyObject } from 'node:crypto';

/** Chữ ký giả ở máy dev chưa cấu hình khóa — firmware chỉ chấp nhận khi bật DEV_ALLOW_UNSIGNED_COMMANDS. */
export const DEV_UNSIGNED_SIGNATURE = 'dev-unsigned';

type Json = string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json };

export function canonicalJson(value: Json): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v as Json)).join(',')}]`;
  const entries = Object.entries(value as { readonly [key: string]: Json })
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export interface CommandSigner {
  /** Chữ ký cho payload (chưa có trường `signature`). */
  sign(payload: { readonly [key: string]: Json }): string;
}

/**
 * @param privateKeyPem khóa riêng Ed25519 dạng PEM; `null` → ký giả `dev-unsigned` (chỉ dev —
 *   `loadConfig` đã chặn production thiếu khóa).
 */
export function createCommandSigner(privateKeyPem: string | null): CommandSigner {
  if (!privateKeyPem) return { sign: () => DEV_UNSIGNED_SIGNATURE };
  const key: KeyObject = createPrivateKey(privateKeyPem.replace(/\\n/g, '\n'));
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error(
      'DISPENSE_SIGNING_KEY phải là khóa riêng Ed25519 (spec/contracts/mqtt.md §5.1).',
    );
  }
  return {
    sign: (payload) =>
      sign(null, Buffer.from(canonicalJson(payload), 'utf8'), key).toString('base64url'),
  };
}
