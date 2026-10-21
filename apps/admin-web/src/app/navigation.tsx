import {
  AppstoreOutlined,
  DashboardOutlined,
  DollarOutlined,
  EnvironmentOutlined,
  ExperimentOutlined,
  IdcardOutlined,
  MailOutlined,
  RollbackOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  SkinOutlined,
  TagsOutlined,
  TeamOutlined,
} from '@ant-design/icons';
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
  {
    path: '/machines',
    label: 'ui.machines',
    icon: <AppstoreOutlined />,
    roles: ['PLATFORM_SUPER_ADMIN', 'OPERATIONS_STAFF'],
  },
  {
    path: '/locations',
    label: 'ui.locations',
    icon: <EnvironmentOutlined />,
    roles: ['PLATFORM_SUPER_ADMIN'],
  },
  {
    path: '/orders',
    label: 'ui.orders',
    icon: <ShoppingCartOutlined />,
    roles: ['PLATFORM_SUPER_ADMIN', 'OPERATIONS_STAFF', 'BRAND_ADMIN'],
  },
  {
    path: '/refund-claims',
    label: 'ui.refundClaims',
    icon: <RollbackOutlined />,
    roles: ['PLATFORM_SUPER_ADMIN', 'OPERATIONS_STAFF'],
  },
  {
    path: '/brands',
    label: 'ui.brands',
    icon: <SkinOutlined />,
    roles: ['PLATFORM_SUPER_ADMIN'],
  },
  {
    path: '/users',
    label: 'ui.users',
    icon: <TeamOutlined />,
    roles: ['PLATFORM_SUPER_ADMIN'],
  },
  {
    path: '/pricing',
    label: 'ui.pricing',
    icon: <DollarOutlined />,
    roles: ['PLATFORM_SUPER_ADMIN'],
  },
  {
    path: '/my-slots',
    label: 'ui.mySlots',
    icon: <ExperimentOutlined />,
    roles: ['BRAND_ADMIN'],
  },
  {
    path: '/rentals',
    label: 'ui.rentals',
    icon: <ShopOutlined />,
    roles: ['BRAND_ADMIN'],
  },
  {
    path: '/products',
    label: 'ui.products',
    icon: <TagsOutlined />,
    roles: ['BRAND_ADMIN', 'PLATFORM_SUPER_ADMIN'],
  },
  {
    path: '/brand-profile',
    label: 'ui.brandProfile',
    icon: <IdcardOutlined />,
    roles: ['BRAND_ADMIN'],
  },
  {
    path: '/notifications',
    label: 'ui.notifications',
    icon: <MailOutlined />,
    roles: ['PLATFORM_SUPER_ADMIN', 'OPERATIONS_STAFF', 'BRAND_ADMIN'],
  },
];
