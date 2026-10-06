/**
 * Kiểm chữ ký lệnh xịt phía thiết bị — bước 1 của spec/contracts/mqtt.md §5.1 (FR-DSP-07).
 *
 * Thiết bị chỉ giữ khóa CÔNG KHAI Ed25519. Chuỗi ký dựng bằng đúng `canonicalJson` mà backend dùng
 * để ký (apps/api/src/adapters/mqtt/command-signature.ts), nên simulator và backend không thể lệch
 * nhau về cách chuẩn hóa.
 */

import { readFileSync } from 'node:fs';
import { createPrivateKey, createPublicKey, verify, type KeyObject } from 'node:crypto';
import { canonicalJson } from '../../apps/api/src/adapters/mqtt/command-signature.js';

type Json = Parameters<typeof canonicalJson>[0];

/** Giá trị mẫu trong .env.example — coi như chưa cấu hình khóa (khớp loadConfig của backend). */
const PLACEHOLDER_SECRET = 'doi_gia_tri_nay';

export type SignatureCheck =
  { readonly ok: true } | { readonly ok: false; readonly reason: 'MISSING' | 'INVALID' };

export interface CommandVerifier {
  /** `true` khi có khóa công khai và kiểm chữ ký thật; `false` là chế độ dev bỏ qua chữ ký. */
  readonly strict: boolean;
  check(command: Record<string, unknown>): SignatureCheck;
}

/** Khóa PEM trong .env thường viết trên một dòng với `\n` thoát — giống cách backend đọc. */
function unescapePem(pem: string): string {
  return pem.replace(/\\n/g, '\n');
}

/**
 * Tìm khóa công khai cho thiết bị:
 *   1. `publicKeyPath` — file PEM khóa công khai (như khóa nạp vào ESP32 lúc đăng ký máy);
 *   2. suy ra từ khóa riêng `DISPENSE_SIGNING_KEY` của backend (cùng .env khi chạy dev).
 * Không có cả hai → `null`.
 */
export function loadDevicePublicKey(
  publicKeyPath: string | undefined,
  signingKeyPem: string | undefined,
): KeyObject | null {
  let key: KeyObject;
  if (publicKeyPath) {
    key = createPublicKey(unescapePem(readFileSync(publicKeyPath, 'utf8')));
  } else if (signingKeyPem && signingKeyPem !== PLACEHOLDER_SECRET) {
    key = createPublicKey(createPrivateKey(unescapePem(signingKeyPem)));
  } else {
    return null;
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error('Khóa kiểm lệnh xịt phải là Ed25519 (spec/contracts/mqtt.md §5.1).');
  }
  return key;
}

/**
 * @param publicKey `null` → chế độ dev như firmware bật DEV_ALLOW_UNSIGNED_COMMANDS: vẫn đòi có trường
 *   `signature` nhưng không xác minh giá trị.
 */
export function createCommandVerifier(publicKey: KeyObject | null): CommandVerifier {
  return {
    strict: publicKey !== null,
    check(command) {
      const signature = command['signature'];
      if (typeof signature !== 'string' || signature === '')
        return { ok: false, reason: 'MISSING' };
      if (!publicKey) return { ok: true };

      const { signature: _omit, ...payload } = command;
      const message = Buffer.from(canonicalJson(payload as Json), 'utf8');
      let valid = false;
      try {
        valid = verify(null, message, publicKey, Buffer.from(signature, 'base64url'));
      } catch {
        valid = false;
      }
      return valid ? { ok: true } : { ok: false, reason: 'INVALID' };
    },
  };
}
