import {
  AppstoreOutlined,
  BankOutlined,
  DashboardOutlined,
  DollarOutlined,
  EnvironmentOutlined,
  ExperimentOutlined,
  FundOutlined,
  IdcardOutlined,
  InboxOutlined,
  InteractionOutlined,
  MailOutlined,
  RollbackOutlined,
  SafetyOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  SkinOutlined,
  TagsOutlined,
  TeamOutlined,
  ThunderboltOutlined,
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
    path: '/dispense-commands',
    label: 'ui.dispenseCommands',
    icon: <ThunderboltOutlined />,
    roles: ['PLATFORM_SUPER_ADMIN', 'OPERATIONS_STAFF'],
  },
  {
    path: '/brand-payouts',
    label: 'ui.brandPayouts',
    icon: <BankOutlined />,
    roles: ['PLATFORM_SUPER_ADMIN', 'BRAND_ADMIN'],
  },
  {
    path: '/storage-compensations',
    label: 'ui.storageCompensations',
    icon: <SafetyOutlined />,
    roles: ['PLATFORM_SUPER_ADMIN', 'BRAND_ADMIN', 'INVENTORY_STAFF'],
  },
  {
    path: '/revenue',
    label: 'ui.revenueSplit',
    icon: <FundOutlined />,
    roles: ['PLATFORM_SUPER_ADMIN'],
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
    roles: ['PLATFORM_SUPER_ADMIN', 'OPERATIONS_STAFF', 'BRAND_ADMIN', 'INVENTORY_STAFF'],
  },
  {
    path: '/refill-requests',
    label: 'ui.refillRequests',
    icon: <InteractionOutlined />,
    roles: ['PLATFORM_SUPER_ADMIN', 'INVENTORY_STAFF', 'BRAND_ADMIN'],
  },
  {
    path: '/shipments',
    label: 'ui.shipments',
    icon: <InboxOutlined />,
    roles: ['PLATFORM_SUPER_ADMIN', 'OPERATIONS_STAFF', 'BRAND_ADMIN', 'INVENTORY_STAFF'],
  },
];
