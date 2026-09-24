import { DashboardOutlined } from '@ant-design/icons';
import type { RoleCode } from '@scentstation/contracts';
import type { MessageKey } from '@scentstation/i18n';
import type { ReactNode } from 'react';

export interface NavItem {
  path: string;
  label: MessageKey;
  icon: ReactNode;
  /** Bỏ trống = mọi vai trò đã đăng nhập. */
  roles?: readonly RoleCode[];
}

/**
 * Menu bên trái. Thêm màn hình mới: tạo `routes/<màn-hình>/`, khai báo route trong `router.tsx`,
 * rồi thêm một dòng ở đây với `roles` khớp `RequireRole` của màn hình đó.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/', label: 'ui.dashboard', icon: <DashboardOutlined /> },
];
