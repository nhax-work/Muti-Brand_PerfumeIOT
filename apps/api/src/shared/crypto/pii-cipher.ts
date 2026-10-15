/**
 * Mã hóa dữ liệu cá nhân của khách ở tầng ứng dụng (ADR-0012, NFR-DAT-04): tài khoản nhận hoàn tiền
 * và thông tin liên hệ trong phiếu khiếu nại.
 *
 * Mã hóa ở ứng dụng chứ không bằng `pgcrypto`: khóa không bao giờ đi qua câu SQL hay log của CSDL, và
 * bản sao lưu hằng ngày (NFR-DAT-05) chỉ chứa dữ liệu đã mã hóa.
 *
 * Định dạng khối: IV (12 byte) ‖ tag GCM (16 byte) ‖ bản mã. Phiên bản khóa lưu ở cột riêng
 * (`pii_key_version`) để xoay khóa mà vẫn đọc được bản ghi cũ.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Phiên bản khóa hiện tại. Xoay khóa: tăng số này và giữ khóa cũ cho tới khi mọi bản ghi cũ đã xóa. */
export const PII_KEY_VERSION = 1;

const IV_BYTES = 12;
const TAG_BYTES = 16;

export function encryptJson(key: Buffer, value: unknown): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

/** Ném lỗi nếu khối bị sửa hoặc sai khóa — GCM kiểm toàn vẹn trước khi trả dữ liệu. */
export function decryptJson<T>(key: Buffer, blob: Buffer): T {
  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const body = blob.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  return JSON.parse(plain) as T;
}
