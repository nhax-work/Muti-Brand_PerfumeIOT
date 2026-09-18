/**
 * Chủ thể đang thực hiện yêu cầu, đã được xác thực.
 *
 * Đây là đầu vào duy nhất của chốt chặn phạm vi ở `brand-scope.ts`. Cố ý KHÔNG chứa gì liên quan
 * tới HTTP — không header, không request — để tầng nghiệp vụ dùng được cho cả ba cửa vào
 * (HTTP, MQTT, scheduler) theo QT2 của ADR-0003.
 */

import type { RoleCode } from '@scentstation/contracts';

export interface Principal {
  readonly userId: string;
  /** NULL với tài khoản mức nền tảng; bắt buộc có với Brand Admin (FR-AUTH-05). */
  readonly brandId: string | null;
  readonly roles: readonly RoleCode[];
  readonly permissions: ReadonlySet<string>;
  /** Dùng để vô hiệu hóa token cũ khi quyền đổi (FR-AUTH-10). */
  readonly permissionVersion: number;
  /** Giới hạn phạm vi Operations Staff theo địa điểm/máy (FR-AUTH-12, ưu tiên S). */
  readonly scope: PrincipalScope;
}

export type PrincipalScope =
  | { readonly type: 'PLATFORM' }
  | { readonly type: 'BRAND'; readonly brandId: string }
  | { readonly type: 'LOCATION'; readonly locationId: string }
  | { readonly type: 'MACHINE'; readonly machineId: string };

/**
 * Người dùng có bị giới hạn theo thương hiệu hay không.
 *
 * Quyết định dựa trên `brandId`, KHÔNG dựa trên vai trò: một tài khoản có thể mang nhiều vai trò,
 * nhưng chỉ tài khoản gắn thương hiệu mới bị giới hạn phạm vi dữ liệu (FR-AUTH-05, FR-AUTH-07).
 */
export function isBrandScoped(principal: Principal): boolean {
  return principal.brandId !== null;
}

export function hasPermission(principal: Principal, code: string): boolean {
  return principal.permissions.has(code);
}
