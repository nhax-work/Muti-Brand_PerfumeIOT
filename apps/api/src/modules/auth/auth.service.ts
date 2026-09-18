/**
 * Nghiệp vụ xác thực: đăng nhập, làm mới, đăng xuất, xác thực lại, thu hồi quyền truy cập.
 *
 * KHÔNG biết gì về HTTP (QT2, ADR-0003): nhận dữ liệu thuần, trả dữ liệu thuần, báo lỗi bằng
 * AppError. Địa chỉ IP và user-agent được tầng HTTP trích ra rồi truyền vào như tham số thường.
 * Nhờ vậy unit test khởi tạo service trực tiếp với các phụ thuộc giả, không cần dựng server.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { CurrentUser, TokenPair } from '@scentstation/contracts';
import { AuditService } from '../../shared/audit/index.js';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import { AppError } from '../../shared/errors/index.js';
import { CLOCK, type Clock } from '../../shared/clock.js';
import type { RequestOrigin } from '../../shared/http/request-origin.js';
import {
  AuthQueries,
  LOGIN_FAILED,
  LOGIN_REJECTED_LOCKED,
  LOGIN_SUCCEEDED,
  type PrincipalRow,
} from './auth.queries.js';
import {
  burnPasswordCheck,
  generateTemporaryPassword,
  hashPassword,
  verifyPassword,
} from './password.js';
import {
  canHoldSession,
  PrincipalLoader,
  toAuthenticatedUser,
  type AuthenticatedUser,
} from './principal.loader.js';
import { TOKEN_SERVICE } from './auth.tokens.provider.js';
import { hashRefreshToken, newRefreshToken, type TokenService } from './tokens.js';

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

type Queries = Pick<
  AuthQueries,
  | 'findUserForLogin'
  | 'findPasswordHash'
  | 'recentLoginOutcomes'
  | 'loadPrincipal'
  | 'createSession'
  | 'findSessionByTokenHash'
  | 'rotateSession'
  | 'revokeSession'
  | 'revokeAllSessions'
  | 'bumpPermissionVersion'
  | 'touchLastLogin'
  | 'setPassword'
>;

type Loader = Pick<PrincipalLoader, 'invalidateUser' | 'invalidateSession'>;
type Audit = Pick<AuditService, 'log'>;

@Injectable()
export class AuthService {
  constructor(
    @Inject(AuthQueries) private readonly queries: Queries,
    @Inject(AuditService) private readonly audit: Audit,
    @Inject(PrincipalLoader) private readonly loader: Loader,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * FR-AUTH-01, FR-AUTH-02, FR-AUTH-03, FR-AUD-01.
   *
   * Thứ tự kiểm tra có chủ ý:
   *   1. Tìm tài khoản. Không có thì VẪN chạy argon2 (burnPasswordCheck) rồi mới báo lỗi, để thời
   *      gian phản hồi không tiết lộ email nào tồn tại (AC2).
   *   2. Kiểm khóa TRƯỚC khi kiểm mật khẩu — tài khoản đang khóa bị từ chối kể cả khi nhập đúng
   *      mật khẩu (FR-AUTH-03 AC1).
   *   3. Kiểm mật khẩu.
   *   4. Kiểm trạng thái sau cùng, và trả cùng INVALID_CREDENTIALS như sai mật khẩu, để không lộ
   *      tài khoản nào bị vô hiệu hóa.
   *
   * Tài khoản INVITED đăng nhập được — mật khẩu tạm là cách duy nhất để vào đổi mật khẩu — nhưng
   * CurrentUser trả về có mustChangePassword = true và AccessGuard chặn mọi thao tác khác (ADR-0004).
   */
  async login(email: string, password: string, origin: RequestOrigin): Promise<TokenPair> {
    const user = await this.queries.findUserForLogin(email);

    if (!user) {
      await burnPasswordCheck(password);
      await this.audit.log({
        actorType: 'ANONYMOUS',
        action: LOGIN_FAILED,
        targetType: 'user',
        sourceIp: origin.ip,
        userAgent: origin.userAgent,
        metadata: { email, reason: 'unknown_email' },
      });
      throw new AppError('INVALID_CREDENTIALS', 'Sai email hoặc mật khẩu');
    }

    const base = {
      actorType: 'ANONYMOUS' as const,
      brandId: user.brandId,
      targetType: 'user',
      targetId: user.id,
      sourceIp: origin.ip,
      userAgent: origin.userAgent,
    };

    if (user.status === 'LOCKED' || (await this.isTemporarilyLocked(user.id))) {
      await this.audit.log({ ...base, action: LOGIN_REJECTED_LOCKED, severity: 'WARNING' });
      throw new AppError('ACCOUNT_LOCKED', 'Tài khoản đang bị khóa tạm thời');
    }

    if (!(await verifyPassword(user.passwordHash, password))) {
      await this.audit.log({
        ...base,
        action: LOGIN_FAILED,
        metadata: { reason: 'wrong_password' },
      });
      throw new AppError('INVALID_CREDENTIALS', 'Sai email hoặc mật khẩu');
    }

    if (!canHoldSession(user.status)) {
      await this.audit.log({
        ...base,
        action: LOGIN_FAILED,
        metadata: { reason: `status_${user.status.toLowerCase()}` },
      });
      throw new AppError('INVALID_CREDENTIALS', 'Sai email hoặc mật khẩu');
    }

    const now = this.clock.now();
    const refreshToken = newRefreshToken();
    const sessionId = await this.queries.createSession({
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(now.getTime() + this.refreshTtlMs()),
      ipAddress: origin.ip,
      userAgent: origin.userAgent,
    });
    await this.queries.touchLastLogin(user.id, now);
    await this.audit.log({ ...base, actorType: 'USER', actorId: user.id, action: LOGIN_SUCCEEDED });

    const row = await this.queries.loadPrincipal(user.id);
    if (!row) throw new AppError('UNAUTHENTICATED');
    return this.tokenPair(row, sessionId, refreshToken);
  }

  /** FR-AUTH-02 AC3/AC4. Xoay vòng refresh token: token cũ mất hiệu lực ngay khi dùng. */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const now = this.clock.now();
    const session = await this.queries.findSessionByTokenHash(hashRefreshToken(refreshToken));
    if (!session || session.revokedAt !== null || session.expiresAt <= now) {
      throw new AppError('UNAUTHENTICATED', 'Refresh token không hợp lệ hoặc đã hết hạn');
    }

    // Kiểm trạng thái tài khoản TRƯỚC khi xoay vòng: yêu cầu bị từ chối thì không được làm thay
    // đổi gì trên phiên.
    const row = await this.queries.loadPrincipal(session.userId);
    if (!row || !canHoldSession(row.status)) {
      throw new AppError('UNAUTHENTICATED', 'Refresh token không hợp lệ hoặc đã hết hạn');
    }

    const nextToken = newRefreshToken();
    await this.queries.rotateSession(session.id, hashRefreshToken(nextToken), now);
    return this.tokenPair(row, session.id, nextToken);
  }

  /** FR-AUTH-04: thu hồi đúng phiên hiện tại, các phiên khác của cùng người dùng không bị ảnh hưởng. */
  async logout(user: AuthenticatedUser, origin: RequestOrigin): Promise<void> {
    await this.queries.revokeSession(user.sessionId, this.clock.now());
    this.loader.invalidateSession(user.userId, user.sessionId);
    await this.audit.log({
      actorType: 'USER',
      actorId: user.userId,
      brandId: user.brandId,
      action: 'auth.logout',
      targetType: 'user',
      targetId: user.userId,
      sourceIp: origin.ip,
      userAgent: origin.userAgent,
    });
  }

  /** FR-AUTH-09: đổi mật khẩu nhập lại lấy một reauth token sống REAUTH_TOKEN_TTL_SEC. */
  async reauthenticate(
    user: AuthenticatedUser,
    password: string,
    origin: RequestOrigin,
  ): Promise<{ reauthToken: string; expiresIn: number }> {
    const passwordHash = await this.queries.findPasswordHash(user.userId);
    const ok = passwordHash !== undefined && (await verifyPassword(passwordHash, password));
    await this.audit.log({
      actorType: 'USER',
      actorId: user.userId,
      brandId: user.brandId,
      action: ok ? 'auth.reauth.succeeded' : 'auth.reauth.failed',
      targetType: 'user',
      targetId: user.userId,
      sourceIp: origin.ip,
      userAgent: origin.userAgent,
      severity: ok ? 'INFO' : 'WARNING',
    });
    if (!ok) throw new AppError('INVALID_CREDENTIALS', 'Mật khẩu không đúng');
    return {
      reauthToken: this.tokens.signReauth(user.userId),
      expiresIn: this.tokens.reauthTokenTtlSec,
    };
  }

  /**
   * ADR-0004: người dùng tự đổi mật khẩu. INVITED chuyển thành ACTIVE.
   *
   * Đổi xong thì thu hồi MỌI phiên, kể cả phiên đang gọi: ai đó biết mật khẩu cũ và đang giữ một
   * phiên khác thì phải bị đẩy ra. Người dùng đăng nhập lại bằng mật khẩu mới.
   */
  async changePassword(
    user: AuthenticatedUser,
    currentPassword: string,
    newPassword: string,
    origin: RequestOrigin,
  ): Promise<void> {
    const passwordHash = await this.queries.findPasswordHash(user.userId);
    const ok = passwordHash !== undefined && (await verifyPassword(passwordHash, currentPassword));
    if (!ok) {
      await this.audit.log({
        actorType: 'USER',
        actorId: user.userId,
        brandId: user.brandId,
        action: 'auth.password.change_failed',
        targetType: 'user',
        targetId: user.userId,
        sourceIp: origin.ip,
        userAgent: origin.userAgent,
        severity: 'WARNING',
      });
      throw new AppError('INVALID_CREDENTIALS', 'Mật khẩu hiện tại không đúng');
    }
    if (currentPassword === newPassword) {
      throw new AppError('VALIDATION_ERROR', 'Mật khẩu mới phải khác mật khẩu hiện tại', {
        fields: [{ path: 'newPassword', message: 'Trùng mật khẩu hiện tại' }],
      });
    }

    await this.queries.setPassword(user.userId, await hashPassword(newPassword), 'ACTIVE');
    await this.revokeAllAccess(user.userId);
    await this.audit.log({
      actorType: 'USER',
      actorId: user.userId,
      brandId: user.brandId,
      action: 'auth.password.changed',
      targetType: 'user',
      targetId: user.userId,
      sourceIp: origin.ip,
      userAgent: origin.userAgent,
    });
  }

  /**
   * FR-USR-04 + ADR-0004: cấp mật khẩu tạm mới, đưa tài khoản về INVITED, thu hồi mọi phiên.
   *
   * Trả mật khẩu tạm dạng gốc để gọi viên trả về cho Super Admin ĐÚNG MỘT LẦN. Hàm này không ghi
   * audit — người gọi ghi, và KHÔNG được đưa mật khẩu tạm vào bản ghi audit.
   */
  async resetToTemporaryPassword(userId: string): Promise<string> {
    const temporaryPassword = generateTemporaryPassword();
    await this.queries.setPassword(userId, await hashPassword(temporaryPassword), 'INVITED');
    await this.revokeAllAccess(userId);
    return temporaryPassword;
  }

  /**
   * FR-AUTH-10, FR-AUTH-11: cắt mọi quyền truy cập đang có của một người dùng.
   *
   * Hai việc, đều cần: thu hồi mọi refresh session (không làm mới được nữa) VÀ tăng
   * permission_version (access token đang lưu hành chết trong tối đa SESSION_REVOKE_MAX_SEC).
   * Chỉ làm việc thứ nhất thì access token còn sống thêm tới ACCESS_TOKEN_TTL_MIN.
   */
  async revokeAllAccess(userId: string): Promise<void> {
    await this.queries.bumpPermissionVersion(userId);
    await this.queries.revokeAllSessions(userId, this.clock.now());
    this.loader.invalidateUser(userId);
  }

  toCurrentUser(user: AuthenticatedUser): CurrentUser {
    return {
      id: user.userId,
      email: user.email,
      fullName: user.fullName,
      brandId: user.brandId,
      roles: [...user.roles],
      permissions: [...user.permissions].sort(),
      mustChangePassword: user.mustChangePassword,
    };
  }

  /**
   * FR-AUTH-03: khóa khi LOGIN_LOCKOUT_ATTEMPTS lần gần nhất đều sai VÀ lần sai gần nhất còn trong
   * LOGIN_LOCKOUT_MIN.
   *
   * Đếm từ audit_logs thay vì thêm cột bộ đếm vào bảng users: FR-AUD-01 vốn đã bắt ghi mọi lần
   * đăng nhập, nên dữ liệu có sẵn, không phải đổi lược đồ đã đóng băng, và sống qua lần khởi động
   * lại mà không cần Redis.
   *
   * "Liên tiếp" được bảo đảm tự nhiên: chỉ cần một lần thành công lọt vào cửa sổ là không khóa
   * (AC3). Đếm theo tài khoản chứ không theo IP (AC4).
   */
  private async isTemporarilyLocked(userId: string): Promise<boolean> {
    const attempts = this.config.constraint('LOGIN_LOCKOUT_ATTEMPTS');
    const windowMs = this.config.constraint('LOGIN_LOCKOUT_MIN') * MS_PER_MINUTE;
    const outcomes = await this.queries.recentLoginOutcomes(userId, attempts);
    const newest = outcomes[0];
    if (!newest || outcomes.length < attempts) return false;
    if (!outcomes.every((o) => o.action === LOGIN_FAILED)) return false;
    return this.clock.now().getTime() - newest.at.getTime() < windowMs;
  }

  private tokenPair(row: PrincipalRow, sessionId: string, refreshToken: string): TokenPair {
    return {
      accessToken: this.tokens.signAccess({
        sub: row.id,
        sid: sessionId,
        pv: row.permissionVersion,
      }),
      refreshToken,
      expiresIn: this.tokens.accessTokenTtlSec,
      user: this.toCurrentUser(toAuthenticatedUser(row, sessionId)),
    };
  }

  private refreshTtlMs(): number {
    return this.config.constraint('REFRESH_TOKEN_TTL_DAYS') * MS_PER_DAY;
  }
}
