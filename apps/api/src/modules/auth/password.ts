/**
 * Băm và kiểm mật khẩu bằng argon2 (NFR-SEC-03).
 */

import { randomBytes } from 'node:crypto';
import { hash, verify } from 'argon2';

export function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    // Băm hỏng định dạng: coi như sai mật khẩu, không để lọt lỗi thư viện ra ngoài.
    return false;
  }
}

/**
 * Mật khẩu tạm cấp khi tạo tài khoản hoặc đặt lại (ADR-0004). 12 byte ngẫu nhiên -> 16 ký tự
 * base64url, đủ dài để không đoán được trong khoảng thời gian trước khi người dùng đổi.
 */
export function generateTemporaryPassword(): string {
  return randomBytes(12).toString('base64url');
}

let dummyHash: Promise<string> | undefined;

/**
 * Kiểm mật khẩu với một băm giả khi email không tồn tại.
 *
 * FR-AUTH-01 AC2 đòi email không tồn tại và mật khẩu sai trả CÙNG một phản hồi. Cùng thông báo
 * là chưa đủ: nếu email lạ trả về ngay còn email thật phải chạy argon2 (vài chục ms), kẻ tấn công
 * đo thời gian phản hồi là biết email nào có thật. Luôn chạy argon2 cho cả hai nhánh.
 */
export async function burnPasswordCheck(plain: string): Promise<void> {
  dummyHash ??= hash('scentstation-timing-equalizer');
  await verifyPassword(await dummyHash, plain);
}
