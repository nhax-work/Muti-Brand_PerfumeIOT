/**
 * Guard toàn cục duy nhất, chạy trước mọi controller. Ba bước theo đúng thứ tự:
 *
 *   1. Xác thực   — Bearer token hợp lệ, tài khoản còn ACTIVE, phiên chưa thu hồi
 *                   (FR-AUTH-02, FR-AUTH-04, FR-AUTH-10). Tài khoản INVITED chỉ qua được các
 *                   endpoint gắn @AllowPendingPasswordChange (ADR-0004).
 *   2. Phân quyền — có đủ quyền mà @RequirePermissions đòi (FR-AUTH-06, FR-AUTH-08)
 *   3. Xác thực lại — có X-Reauth-Token hợp lệ nếu endpoint gắn @RequireReauth (FR-AUTH-09)
 *
 * Gộp ba bước vào một guard thay vì ba guard riêng để thứ tự không phụ thuộc vào thứ tự đăng ký
 * provider — phân quyền trước xác thực là lỗi bảo mật, và không nên để nó xảy ra do sắp xếp nhầm.
 *
 * Cô lập dữ liệu mức slot (FR-AUTH-07) KHÔNG nằm ở đây: guard chỉ biết người dùng là ai, không
 * biết tài nguyên thuộc thương hiệu nào. Việc đó thuộc về truy vấn, qua chốt chặn shared/scoping.
 */

import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../../shared/errors/index.js';
import { hasPermission } from '../../shared/scoping/index.js';
import { TOKEN_SERVICE } from './auth.tokens.provider.js';
import {
  ALLOWS_PENDING_PASSWORD,
  IS_PUBLIC,
  REQUIRED_PERMISSIONS,
  REQUIRES_REAUTH,
} from './decorators.js';
import { PrincipalLoader, type AuthenticatedUser } from './principal.loader.js';
import type { TokenService } from './tokens.js';

interface GuardedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
}

const BEARER = /^Bearer\s+(.+)$/i;

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(PrincipalLoader) private readonly loader: PrincipalLoader,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const request = context.switchToHttp().getRequest<GuardedRequest>();

    // 1. Xác thực
    const token = BEARER.exec(header(request, 'authorization') ?? '')?.[1];
    if (!token) throw new AppError('UNAUTHENTICATED', 'auth.missingAccessToken');
    const user = await this.loader.load(this.tokens.verifyAccess(token));
    request.user = user;

    if (
      user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(ALLOWS_PENDING_PASSWORD, targets)
    ) {
      throw new AppError('FORBIDDEN_SCOPE', 'auth.mustChangePassword');
    }

    // 2. Phân quyền
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, targets);
    if (required?.some((code) => !hasPermission(user, code))) {
      throw new AppError('FORBIDDEN_SCOPE', 'auth.missingPermission');
    }

    // 3. Xác thực lại
    if (this.reflector.getAllAndOverride<boolean>(REQUIRES_REAUTH, targets)) {
      const reauthToken = header(request, 'x-reauth-token');
      if (!reauthToken)
        throw new AppError('REAUTH_REQUIRED', 'auth.reauthRequired');
      this.tokens.verifyReauth(reauthToken, user.userId);
    }

    return true;
  }
}

function header(request: GuardedRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
