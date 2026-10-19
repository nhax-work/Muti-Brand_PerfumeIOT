/**
 * Truy vấn của module auth. Chỉ module auth được import file này (QT3, ADR-0003) — module khác gọi
 * qua `AuthService` hoặc các hàm xuất ở `index.ts`.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { RoleCode } from '@scentstation/contracts';
import { DATABASE, type Database } from '../../shared/db/index.js';

export const LOGIN_SUCCEEDED = 'auth.login.succeeded';
export const LOGIN_FAILED = 'auth.login.failed';
/** Lần thử trong lúc đang bị khóa. KHÔNG tính vào chuỗi sai liên tiếp — xem AuthService.login. */
export const LOGIN_REJECTED_LOCKED = 'auth.login.locked';

export type UserStatus = 'INVITED' | 'ACTIVE' | 'LOCKED' | 'DISABLED';

export interface LoginUserRow {
  readonly id: string;
  readonly brandId: string | null;
  readonly email: string;
  readonly fullName: string;
  readonly passwordHash: string;
  readonly status: UserStatus;
  readonly permissionVersion: number;
}

export interface PrincipalScopeRow {
  readonly type: string;
  readonly id: string | null;
}

export interface PrincipalRow {
  readonly id: string;
  readonly brandId: string | null;
  readonly email: string;
  readonly fullName: string;
  readonly status: UserStatus;
  readonly permissionVersion: number;
  readonly roles: RoleCode[];
  readonly permissions: string[];
  readonly scopes: PrincipalScopeRow[];
}

export interface SessionRow {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

@Injectable()
export class AuthQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findUserForLogin(email: string): Promise<LoginUserRow | undefined> {
    // users.email là citext nên so sánh không phân biệt hoa thường ngay trong CSDL.
    const row = await this.db
      .selectFrom('users')
      .select([
        'id',
        'brand_id',
        'email',
        'full_name',
        'password_hash',
        'status',
        'permission_version',
      ])
      .where('email', '=', email)
      .executeTakeFirst();
    if (!row) return undefined;
    return {
      id: row.id,
      brandId: row.brand_id,
      email: row.email,
      fullName: row.full_name,
      passwordHash: row.password_hash,
      status: row.status,
      permissionVersion: row.permission_version,
    };
  }

  /** Băm mật khẩu hiện tại — dùng khi xác thực lại (FR-AUTH-09). */
  async findPasswordHash(userId: string): Promise<string | undefined> {
    const row = await this.db
      .selectFrom('users')
      .select('password_hash')
      .where('id', '=', userId)
      .executeTakeFirst();
    return row?.password_hash;
  }

  /**
   * Các kết quả đăng nhập gần nhất của một tài khoản, mới nhất trước.
   *
   * Chỉ lấy thành công và thất bại; bỏ qua các lần bị từ chối vì đang khóa, để lần thử trong lúc
   * khóa không kéo dài thời gian khóa.
   */
  async recentLoginOutcomes(
    userId: string,
    limit: number,
  ): Promise<{ action: string; at: Date }[]> {
    const rows = await this.db
      .selectFrom('audit_logs')
      .select(['action', 'occurred_at'])
      .where('target_type', '=', 'user')
      .where('target_id', '=', userId)
      .where('action', 'in', [LOGIN_SUCCEEDED, LOGIN_FAILED])
      .orderBy('occurred_at', 'desc')
      .limit(limit)
      .execute();
    return rows.map((r) => ({ action: r.action, at: new Date(r.occurred_at) }));
  }

  async loadPrincipal(userId: string): Promise<PrincipalRow | undefined> {
    const rows = await this.db
      .selectFrom('users as u')
      .leftJoin('user_roles as ur', 'ur.user_id', 'u.id')
      .leftJoin('roles as r', 'r.id', 'ur.role_id')
      .leftJoin('role_permissions as rp', 'rp.role_id', 'r.id')
      .leftJoin('permissions as p', 'p.id', 'rp.permission_id')
      .select([
        'u.id',
        'u.brand_id',
        'u.email',
        'u.full_name',
        'u.status',
        'u.permission_version',
        'r.code as role_code',
        'p.code as permission_code',
        'ur.scope_type',
        'ur.scope_id',
      ])
      .where('u.id', '=', userId)
      .execute();

    const first = rows[0];
    if (!first) return undefined;

    const roles = new Set<RoleCode>();
    const permissions = new Set<string>();
    const scopes = new Map<string, PrincipalScopeRow>();
    for (const row of rows) {
      if (row.role_code) roles.add(row.role_code as RoleCode);
      if (row.permission_code) permissions.add(row.permission_code);
      if (row.scope_type) {
        const key = `${row.scope_type}:${row.scope_id ?? '-'}`;
        scopes.set(key, { type: row.scope_type, id: row.scope_id });
      }
    }

    return {
      id: first.id,
      brandId: first.brand_id,
      email: first.email,
      fullName: first.full_name,
      status: first.status,
      permissionVersion: first.permission_version,
      roles: [...roles],
      permissions: [...permissions],
      scopes: [...scopes.values()],
    };
  }

  async createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
  }): Promise<string> {
    const row = await this.db
      .insertInto('refresh_sessions')
      .values({
        user_id: input.userId,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt,
        ip_address: input.ipAddress,
        user_agent: input.userAgent,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionRow | undefined> {
    const row = await this.db
      .selectFrom('refresh_sessions')
      .select(['id', 'user_id', 'expires_at', 'revoked_at'])
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();
    if (!row) return undefined;
    return {
      id: row.id,
      userId: row.user_id,
      expiresAt: new Date(row.expires_at),
      revokedAt: row.revoked_at === null ? null : new Date(row.revoked_at),
    };
  }

  /** Đổi token của phiên (xoay vòng). Giữ nguyên expires_at: phiên có hạn tuyệt đối, không trượt. */
  async rotateSession(sessionId: string, newTokenHash: string, now: Date): Promise<void> {
    await this.db
      .updateTable('refresh_sessions')
      .set({ token_hash: newTokenHash, last_used_at: now })
      .where('id', '=', sessionId)
      .execute();
  }

  async isSessionActive(sessionId: string, now: Date): Promise<boolean> {
    const row = await this.db
      .selectFrom('refresh_sessions')
      .select('id')
      .where('id', '=', sessionId)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', now)
      .executeTakeFirst();
    return row !== undefined;
  }

  async revokeSession(sessionId: string, now: Date): Promise<void> {
    await this.db
      .updateTable('refresh_sessions')
      .set({ revoked_at: now })
      .where('id', '=', sessionId)
      .where('revoked_at', 'is', null)
      .execute();
  }

  async revokeAllSessions(userId: string, now: Date): Promise<number> {
    const result = await this.db
      .updateTable('refresh_sessions')
      .set({ revoked_at: now })
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  /**
   * Tăng permission_version: mọi access token đang lưu hành của người dùng mất hiệu lực trong tối đa
   * SESSION_REVOKE_MAX_SEC (FR-AUTH-10 AC2).
   */
  async bumpPermissionVersion(userId: string): Promise<void> {
    await this.db
      .updateTable('users')
      .set((eb) => ({ permission_version: eb('permission_version', '+', 1) }))
      .where('id', '=', userId)
      .execute();
  }

  /** Ghi băm mật khẩu mới kèm trạng thái đi cùng (INVITED khi cấp tạm, ACTIVE khi tự đổi). */
  async setPassword(userId: string, passwordHash: string, status: UserStatus): Promise<void> {
    await this.db
      .updateTable('users')
      .set({ password_hash: passwordHash, status })
      .where('id', '=', userId)
      .execute();
  }

  async touchLastLogin(userId: string, now: Date): Promise<void> {
    await this.db
      .updateTable('users')
      .set({ last_login_at: now })
      .where('id', '=', userId)
      .execute();
  }

  async emailExists(email: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('users')
      .select('id')
      .where('email', '=', email)
      .executeTakeFirst();
    return row !== undefined;
  }

  async brandCodeExists(code: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('brands')
      .select('id')
      .where('code', '=', code)
      .executeTakeFirst();
    return row !== undefined;
  }

  /**
   * FR-USR-06 (ADR-0013): trong một transaction tạo Brand ACTIVE, tài khoản Brand Admin ACTIVE và
   * dòng `email_verifications` duy nhất của tài khoản đó (FR-USR-07).
   */
  async registerBrandAndAdmin(params: {
    brandName: string;
    brandCode: string;
    email: string;
    fullName: string;
    passwordHash: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<{ brandId: string; userId: string; email: string }> {
    return this.db.transaction().execute(async (tx) => {
      const brand = await tx
        .insertInto('brands')
        .values({
          code: params.brandCode,
          name: params.brandName,
          status: 'ACTIVE',
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      const user = await tx
        .insertInto('users')
        .values({
          brand_id: brand.id,
          email: params.email,
          full_name: params.fullName,
          password_hash: params.passwordHash,
          status: 'ACTIVE',
        })
        .returning(['id', 'email'])
        .executeTakeFirstOrThrow();

      const role = await tx
        .selectFrom('roles')
        .select('id')
        .where('code', '=', 'BRAND_ADMIN')
        .executeTakeFirst();

      if (role) {
        await tx
          .insertInto('user_roles')
          .values({
            user_id: user.id,
            role_id: role.id,
            scope_type: 'BRAND',
            scope_id: brand.id,
          })
          .execute();
      }

      await tx
        .insertInto('email_verifications')
        .values({
          user_id: user.id,
          email: user.email,
          token_hash: params.tokenHash,
          expires_at: params.expiresAt,
        })
        .execute();

      return { brandId: brand.id, userId: user.id, email: user.email };
    });
  }

  async findEmailVerificationByTokenHash(tokenHash: string): Promise<EmailVerificationRow | null> {
    const row = await this.db
      .selectFrom('email_verifications')
      .select(['id', 'user_id', 'email', 'expires_at', 'verified_at'])
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();
    return row ? toEmailVerification(row) : null;
  }

  /** Không có dòng = tài khoản do Super Admin tạo, không cần xác minh (FR-USR-07). */
  async findEmailVerificationByUser(userId: string): Promise<EmailVerificationRow | null> {
    const row = await this.db
      .selectFrom('email_verifications')
      .select(['id', 'user_id', 'email', 'expires_at', 'verified_at'])
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return row ? toEmailVerification(row) : null;
  }

  async markEmailVerified(verificationId: string, verifiedAt: Date): Promise<void> {
    await this.db
      .updateTable('email_verifications')
      .set({ verified_at: verifiedAt, updated_at: verifiedAt })
      .where('id', '=', verificationId)
      .execute();
  }

  /** Gửi lại mã: ghi đè mã cũ trên dòng duy nhất của tài khoản — mã cũ mất hiệu lực ngay. */
  async replaceEmailVerificationToken(
    verificationId: string,
    tokenHash: string,
    expiresAt: Date,
    now: Date,
  ): Promise<void> {
    await this.db
      .updateTable('email_verifications')
      .set({ token_hash: tokenHash, expires_at: expiresAt, updated_at: now })
      .where('id', '=', verificationId)
      .where('verified_at', 'is', null)
      .execute();
  }
}

export interface EmailVerificationRow {
  readonly id: string;
  readonly userId: string;
  readonly email: string;
  readonly expiresAt: Date;
  readonly verifiedAt: Date | null;
}

function toEmailVerification(row: {
  id: string;
  user_id: string;
  email: string;
  expires_at: Date;
  verified_at: Date | null;
}): EmailVerificationRow {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    expiresAt: row.expires_at,
    verifiedAt: row.verified_at,
  };
}
