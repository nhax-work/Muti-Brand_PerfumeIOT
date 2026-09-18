/**
 * Decorator cho controller của MỌI module. Đây là bề mặt mà các thành viên khác dùng hằng ngày.
 *
 * Mặc định mọi endpoint đều YÊU CẦU đăng nhập — guard được đăng ký toàn cục. Muốn mở endpoint cho
 * khách (kiosk, webhook) phải đánh dấu @Public() tường minh. Quên đánh dấu thì endpoint bị khóa,
 * chứ không bị mở: sai theo hướng an toàn.
 *
 *   @Get('orders')
 *   @RequirePermissions('report.brand')
 *   list(@CurrentUser() user: AuthenticatedUser, @CurrentBrandScope() scope: BrandScope) { ... }
 *
 *   @Post('orders/:id/refund')
 *   @RequirePermissions('order.refund')
 *   @RequireReauth()                       // FR-AUTH-09
 *   refund(...) { ... }
 */

import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import { resolveBrandScope, type BrandScope } from '../../shared/scoping/index.js';
import type { AuthenticatedUser } from './principal.loader.js';

export const IS_PUBLIC = 'scentstation:isPublic';
export const REQUIRED_PERMISSIONS = 'scentstation:requiredPermissions';
export const REQUIRES_REAUTH = 'scentstation:requiresReauth';
export const ALLOWS_PENDING_PASSWORD = 'scentstation:allowsPendingPassword';

/** Endpoint không cần đăng nhập: kiosk, webhook thanh toán, đăng nhập, làm mới token. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Yêu cầu người dùng có ĐỦ mọi quyền liệt kê. Quyền là mã trong bảng `permissions`, không phải tên
 * vai trò — vai trò là dữ liệu, có thể đổi mà không đổi code (FR-AUTH-06).
 * Thiếu quyền trả 403 FORBIDDEN_SCOPE (FR-AUTH-08 AC3).
 */
export const RequirePermissions = (...codes: string[]) => SetMetadata(REQUIRED_PERMISSIONS, codes);

/**
 * Thao tác nhạy cảm cần header X-Reauth-Token lấy từ POST /auth/reauth (FR-AUTH-09).
 * Thiếu, sai hoặc hết hạn trả 403 REAUTH_REQUIRED.
 */
export const RequireReauth = () => SetMetadata(REQUIRES_REAUTH, true);

/**
 * Endpoint mà tài khoản INVITED (đang phải đổi mật khẩu tạm) vẫn được gọi.
 * CHỈ dùng cho /auth/me, /auth/logout, /auth/change-password (ADR-0004). Module nghiệp vụ không
 * bao giờ cần decorator này.
 */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOWS_PENDING_PASSWORD, true);

/** Người dùng đã xác thực của yêu cầu hiện tại. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!request.user) {
      // Chỉ xảy ra khi dùng decorator trên endpoint @Public() — lỗi lập trình, không phải lỗi người dùng.
      throw new Error('@CurrentUser() dùng trên endpoint không yêu cầu đăng nhập');
    }
    return request.user;
  },
);

/**
 * Phạm vi thương hiệu của người dùng hiện tại, đã giải qua chốt chặn duy nhất (QT4, ADR-0003).
 *
 * Truyền thẳng giá trị này xuống service rồi xuống query, và dùng các hàm `brandScoped*` trong
 * `shared/scoping` để dựng điều kiện WHERE. Không tự viết `where brand_id = ...`.
 */
export const CurrentBrandScope = createParamDecorator(
  (_data: unknown, context: ExecutionContext): BrandScope => {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!request.user) {
      throw new Error('@CurrentBrandScope() dùng trên endpoint không yêu cầu đăng nhập');
    }
    return resolveBrandScope(request.user);
  },
);
