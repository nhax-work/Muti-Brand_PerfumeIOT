/**
 * Phát hành và kiểm token.
 *
 *   access  — JWT, sống ACCESS_TOKEN_TTL_MIN (FR-AUTH-02)
 *   refresh — chuỗi ngẫu nhiên; CSDL chỉ lưu băm SHA-256 (FR-AUTH-02 AC5, NFR-SEC-05)
 *   reauth  — JWT ngắn hạn, sống REAUTH_TOKEN_TTL_SEC (FR-AUTH-09)
 *
 * Access token mang `pv` (permission_version) và `sid` (id phiên). Hai trường này là cách thu hồi
 * được một JWT vốn tự chứa: tăng pv là vô hiệu mọi token của người dùng (FR-AUTH-10), thu hồi sid
 * là vô hiệu token của đúng một phiên (FR-AUTH-04).
 */

import { createHash, randomBytes } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { AppError } from '../../shared/errors/index.js';

export interface AccessClaims {
  readonly sub: string;
  readonly sid: string;
  readonly pv: number;
}

interface AccessPayload extends AccessClaims {
  readonly typ: 'access';
}

interface ReauthPayload {
  readonly sub: string;
  readonly typ: 'reauth';
}

export class TokenService {
  private readonly jwt: JwtService;

  constructor(
    secret: string,
    private readonly accessTtlSec: number,
    private readonly reauthTtlSec: number,
  ) {
    this.jwt = new JwtService({ secret, signOptions: { algorithm: 'HS256' } });
  }

  get accessTokenTtlSec(): number {
    return this.accessTtlSec;
  }

  get reauthTokenTtlSec(): number {
    return this.reauthTtlSec;
  }

  signAccess(claims: AccessClaims): string {
    const payload: AccessPayload = { ...claims, typ: 'access' };
    return this.jwt.sign(payload, { expiresIn: this.accessTtlSec });
  }

  /** Ném TOKEN_EXPIRED nếu hết hạn, UNAUTHENTICATED cho mọi lỗi khác (FR-AUTH-02 AC2). */
  verifyAccess(token: string): AccessClaims {
    const payload = this.verify<AccessPayload>(token, 'UNAUTHENTICATED');
    if (payload.typ !== 'access') {
      // Chặn dùng reauth token thay access token và ngược lại.
      throw new AppError('UNAUTHENTICATED', 'Access token không hợp lệ');
    }
    return { sub: payload.sub, sid: payload.sid, pv: payload.pv };
  }

  signReauth(userId: string): string {
    const payload: ReauthPayload = { sub: userId, typ: 'reauth' };
    return this.jwt.sign(payload, { expiresIn: this.reauthTtlSec });
  }

  /** Mọi lỗi của reauth token — thiếu, sai, hết hạn — đều trả REAUTH_REQUIRED (FR-AUTH-09 AC5). */
  verifyReauth(token: string, expectedUserId: string): void {
    const payload = this.verify<ReauthPayload>(token, 'REAUTH_REQUIRED');
    if (payload.typ !== 'reauth' || payload.sub !== expectedUserId) {
      throw new AppError('REAUTH_REQUIRED', 'Thao tác này cần xác thực lại mật khẩu');
    }
  }

  private verify<T extends object>(
    token: string,
    fallback: 'UNAUTHENTICATED' | 'REAUTH_REQUIRED',
  ): T {
    try {
      return this.jwt.verify<T>(token);
    } catch (error) {
      if (fallback === 'UNAUTHENTICATED' && (error as Error).name === 'TokenExpiredError') {
        throw new AppError('TOKEN_EXPIRED', 'Access token đã hết hạn');
      }
      throw fallback === 'UNAUTHENTICATED'
        ? new AppError('UNAUTHENTICATED', 'Access token không hợp lệ')
        : new AppError('REAUTH_REQUIRED', 'Thao tác này cần xác thực lại mật khẩu');
    }
  }
}

/** Refresh token mới: 32 byte ngẫu nhiên, mã hóa base64url. */
export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Băm refresh token để lưu và tra cứu. Không bao giờ lưu token gốc. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
