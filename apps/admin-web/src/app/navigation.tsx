import {
  AlertOutlined,
  AppstoreOutlined,
  AuditOutlined,
  BankOutlined,
  BarChartOutlined,
  CarOutlined,
  ControlOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DesktopOutlined,
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
  ShoppingOutlined,
  SkinOutlined,
  TagsOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  WalletOutlined,
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

/** Nhóm các màn hình cùng chức năng thành một mục mở ra được trên menu. */
export interface NavGroup {
  key: string;
  label: MessageKey;
  icon: ReactNode;
  children: readonly NavItem[];
}

export type NavEntry = NavItem | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry;
}

const PLATFORM_OPS: readonly RoleCode[] = ['PLATFORM_SUPER_ADMIN', 'OPERATIONS_STAFF'];

/**
 * Menu bên trái. Thêm màn hình mới: tạo `routes/<màn-hình>/`, khai báo route trong `router.tsx`,
 * rồi thêm một dòng vào nhóm cùng chức năng ở đây với `roles` khớp `RequireRole` của màn hình đó.
 */
export const NAV_ENTRIES: readonly NavEntry[] = [
  { path: '/', label: 'ui.dashboard', icon: <DashboardOutlined /> },
  {
    key: 'operations',
    label: 'ui.navGroupOperations',
    icon: <ControlOutlined />,
    children: [
      { path: '/machines', label: 'ui.machines', icon: <AppstoreOutlined />, roles: PLATFORM_OPS },
      {
        path: '/locations',
        label: 'ui.locations',
        icon: <EnvironmentOutlined />,
        roles: ['PLATFORM_SUPER_ADMIN'],
      },
      {
        path: '/dispense-commands',
        label: 'ui.dispenseCommands',
        icon: <ThunderboltOutlined />,
        roles: PLATFORM_OPS,
      },
      {
        path: '/alerts',
        label: 'ui.alerts',
        icon: <AlertOutlined />,
        roles: ['PLATFORM_SUPER_ADMIN', 'OPERATIONS_STAFF', 'BRAND_ADMIN'],
      },
      {
        path: '/maintenance-tickets',
        label: 'ui.maintenanceTickets',
        icon: <ToolOutlined />,
        roles: PLATFORM_OPS,
      },
    ],
  },
  {
    key: 'sales',
    label: 'ui.navGroupSales',
    icon: <ShoppingOutlined />,
    children: [
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
        roles: PLATFORM_OPS,
      },
    ],
  },
  {
    key: 'rental',
    label: 'ui.navGroupRental',
    icon: <DesktopOutlined />,
    children: [
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
        // Super Admin vào đây để tới Chi tiết hóa đơn (sửa ân hạn, thanh lý, đóng hóa đơn — bảng 3.1.3).
        roles: ['BRAND_ADMIN', 'PLATFORM_SUPER_ADMIN'],
      },
      {
        path: '/products',
        label: 'ui.products',
        icon: <TagsOutlined />,
        roles: ['BRAND_ADMIN', 'PLATFORM_SUPER_ADMIN'],
      },
      {
        path: '/pricing',
        label: 'ui.pricing',
        icon: <DollarOutlined />,
        roles: ['PLATFORM_SUPER_ADMIN'],
      },
    ],
  },
  {
    key: 'inventory',
    label: 'ui.navGroupInventory',
    icon: <DatabaseOutlined />,
    children: [
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
      {
        path: '/bottle-returns',
        label: 'ui.bottleReturns',
        icon: <CarOutlined />,
        roles: ['PLATFORM_SUPER_ADMIN', 'INVENTORY_STAFF', 'BRAND_ADMIN'],
      },
    ],
  },
  {
    key: 'finance',
    label: 'ui.navGroupFinance',
    icon: <WalletOutlined />,
    children: [
      {
        path: '/revenue',
        label: 'ui.revenueSplit',
        icon: <FundOutlined />,
        roles: ['PLATFORM_SUPER_ADMIN'],
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
        path: '/reports',
        label: 'ui.reports',
        icon: <BarChartOutlined />,
        roles: ['PLATFORM_SUPER_ADMIN', 'BRAND_ADMIN'],
      },
    ],
  },
  {
    key: 'administration',
    label: 'ui.navGroupAdministration',
    icon: <TeamOutlined />,
    children: [
      {
        path: '/brands',
        label: 'ui.brands',
        icon: <SkinOutlined />,
        roles: ['PLATFORM_SUPER_ADMIN'],
      },
      {
        path: '/brand-profile',
        label: 'ui.brandProfile',
        icon: <IdcardOutlined />,
        roles: ['BRAND_ADMIN'],
      },
      {
        path: '/users',
        label: 'ui.users',
        icon: <TeamOutlined />,
        roles: ['PLATFORM_SUPER_ADMIN'],
      },
      {
        path: '/audit-logs',
        label: 'ui.auditLogs',
        icon: <AuditOutlined />,
        roles: ['PLATFORM_SUPER_ADMIN'],
      },
    ],
  },
  {
    path: '/notifications',
    label: 'ui.notifications',
    icon: <MailOutlined />,
    roles: ['PLATFORM_SUPER_ADMIN', 'OPERATIONS_STAFF', 'BRAND_ADMIN', 'INVENTORY_STAFF'],
  },
];

function canSee(item: NavItem, roles: readonly RoleCode[]): boolean {
  return !item.roles || roles.some((role) => item.roles?.includes(role));
}

/**
 * Menu mà các vai trò này được thấy: bỏ mục không có quyền, bỏ nhóm rỗng, và nhóm chỉ còn một mục
 * thì hiện thẳng mục đó cho đỡ một lần bấm.
 */
export function visibleNav(roles: readonly RoleCode[]): NavEntry[] {
  const result: NavEntry[] = [];
  for (const entry of NAV_ENTRIES) {
    if (!isNavGroup(entry)) {
      if (canSee(entry, roles)) result.push(entry);
      continue;
    }
    const children = entry.children.filter((item) => canSee(item, roles));
    const [only] = children;
    if (children.length === 1 && only) result.push(only);
    else if (children.length > 1) result.push({ ...entry, children });
  }
  return result;
}

/** Mục menu ứng với trang đang mở, kể cả trang con như `/machines/:id`. */
export function activeNavPath(entries: readonly NavEntry[], pathname: string): string | undefined {
  return entries
    .flatMap((entry) => (isNavGroup(entry) ? entry.children : [entry]))
    .map((item) => item.path)
    .filter((path) => pathname === path || (path !== '/' && pathname.startsWith(`${path}/`)))
    .sort((a, b) => b.length - a.length)[0];
}

/** Nhóm chứa mục đang mở, để nhóm đó tự mở ra khi tải trang. */
export function groupOfPath(
  entries: readonly NavEntry[],
  path: string | undefined,
): string | undefined {
  const group = entries.find(
    (entry) => isNavGroup(entry) && entry.children.some((item) => item.path === path),
  );
  return group && isNavGroup(group) ? group.key : undefined;
}
