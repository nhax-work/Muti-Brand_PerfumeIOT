/**
 * Nạp chủ thể (Principal) từ access token đã kiểm chữ ký.
 *
 * Đây là nơi FR-AUTH-10 được thực thi. Access token là JWT tự chứa, không thu hồi trực tiếp được;
 * nên mỗi yêu cầu đối chiếu token với trạng thái hiện tại trong CSDL:
 *   - tài khoản còn ACTIVE,
 *   - `pv` trong token bằng `users.permission_version` hiện tại,
 *   - phiên `sid` chưa bị thu hồi (đăng xuất — FR-AUTH-04).
 *
 * Kết quả được nhớ đệm tối đa SESSION_REVOKE_MAX_SEC. Đây chính là ý nghĩa của hằng đó: thời gian
 * tối đa từ lúc vô hiệu hóa tài khoản tới lúc mọi token của nó ngừng hoạt động. Không nhớ đệm thì
 * mỗi yêu cầu tốn thêm một truy vấn nhiều bảng; nhớ đệm lâu hơn thì vi phạm FR-AUTH-10.
 *
 * Nhớ đệm nằm trong bộ nhớ của từng tiến trình. Chạy nhiều tiến trình thì mỗi tiến trình có bộ nhớ
 * riêng, nhưng mỗi mục vẫn hết hạn sau SESSION_REVOKE_MAX_SEC nên cam kết vẫn giữ nguyên.
 */

import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import { AppError } from '../../shared/errors/index.js';
import { CLOCK, type Clock } from '../../shared/clock.js';
import type { Principal, PrincipalScope } from '../../shared/scoping/index.js';
import { AuthQueries, type PrincipalRow } from './auth.queries.js';
import type { AccessClaims } from './tokens.js';

const MS_PER_SECOND = 1000;

/** Chủ thể kèm thông tin hồ sơ cần cho `GET /auth/me`. */
export interface AuthenticatedUser extends Principal {
  readonly email: string;
  readonly fullName: string;
  /** Id phiên hiện tại — cần để đăng xuất đúng phiên (FR-AUTH-04 AC2). */
  readonly sessionId: string;
}

type PrincipalQueries = Pick<AuthQueries, 'loadPrincipal' | 'isSessionActive'>;

@Injectable()
export class PrincipalLoader {
  private readonly cache = new Map<string, { value: AuthenticatedUser; expiresAt: number }>();

  constructor(
    @Inject(AuthQueries) private readonly queries: PrincipalQueries,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async load(claims: AccessClaims): Promise<AuthenticatedUser> {
    const key = cacheKey(claims.sub, claims.sid);
    const nowMs = this.clock.now().getTime();

    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > nowMs) {
      // So pv cả với mục đã nhớ đệm: token cũ không được dùng ké kết quả của token mới.
      if (cached.value.permissionVersion !== claims.pv)
        throw new AppError('UNAUTHENTICATED', 'Phiên đăng nhập không còn hiệu lực');
      return cached.value;
    }

    const row = await this.queries.loadPrincipal(claims.sub);
    if (!row || row.status !== 'ACTIVE' || row.permissionVersion !== claims.pv) {
      throw new AppError('UNAUTHENTICATED', 'Phiên đăng nhập không còn hiệu lực');
    }
    if (!(await this.queries.isSessionActive(claims.sid, this.clock.now()))) {
      throw new AppError('UNAUTHENTICATED', 'Phiên đăng nhập không còn hiệu lực');
    }

    const value = toAuthenticatedUser(row, claims.sid);
    const ttlMs = this.config.constraint('SESSION_REVOKE_MAX_SEC') * MS_PER_SECOND;
    this.cache.set(key, { value, expiresAt: nowMs + ttlMs });
    return value;
  }

  /** Xóa ngay mọi mục nhớ đệm của một người dùng trên tiến trình này. */
  invalidateUser(userId: string): void {
    const prefix = `${userId}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  invalidateSession(userId: string, sessionId: string): void {
    this.cache.delete(cacheKey(userId, sessionId));
  }
}

function cacheKey(userId: string, sessionId: string): string {
  return `${userId}:${sessionId}`;
}

export function toAuthenticatedUser(row: PrincipalRow, sessionId: string): AuthenticatedUser {
  return {
    userId: row.id,
    brandId: row.brandId,
    roles: row.roles,
    permissions: new Set(row.permissions),
    permissionVersion: row.permissionVersion,
    scope: resolveScope(row),
    email: row.email,
    fullName: row.fullName,
    sessionId,
  };
}

/**
 * Suy phạm vi từ hồ sơ người dùng.
 *
 * Tài khoản gắn thương hiệu luôn có phạm vi BRAND, bất kể bảng user_roles ghi gì — brand_id trên
 * users là nguồn quyết định (FR-AUTH-05). Tài khoản nền tảng mặc định PLATFORM; chỉ bị thu hẹp khi
 * có dòng user_roles phạm vi LOCATION hoặc MACHINE (FR-AUTH-12, ưu tiên S).
 */
function resolveScope(row: PrincipalRow): PrincipalScope {
  if (row.brandId !== null) return { type: 'BRAND', brandId: row.brandId };
  if (row.scopes.some((s) => s.type === 'PLATFORM')) return { type: 'PLATFORM' };
  const narrowed = row.scopes.find((s) => s.id !== null);
  if (narrowed?.type === 'LOCATION' && narrowed.id) {
    return { type: 'LOCATION', locationId: narrowed.id };
  }
  if (narrowed?.type === 'MACHINE' && narrowed.id) {
    return { type: 'MACHINE', machineId: narrowed.id };
  }
  return { type: 'PLATFORM' };
}
