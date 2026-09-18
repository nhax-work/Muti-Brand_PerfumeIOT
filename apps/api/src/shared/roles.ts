/**
 * Bốn vai trò hệ thống của MVP (FR-AUTH-06 AC2). Giá trị kiểm kiểu với `RoleCode` sinh từ
 * openapi.yaml, nên không lệch được với contract.
 *
 * Vai trò là DỮ LIỆU trong bảng `roles`. Hằng này chỉ dùng để kiểm đầu vào (ví dụ vai trò khi tạo
 * tài khoản). Đừng dùng nó để quyết định phân quyền — phân quyền đọc từ bảng `permissions` qua
 * @RequirePermissions.
 */

import type { RoleCode } from '@scentstation/contracts';

export const ROLE_CODES = [
  'PLATFORM_SUPER_ADMIN',
  'OPERATIONS_STAFF',
  'INVENTORY_STAFF',
  'BRAND_ADMIN',
] as const satisfies readonly RoleCode[];
