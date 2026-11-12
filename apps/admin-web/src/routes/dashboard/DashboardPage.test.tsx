import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import DashboardPage from './DashboardPage';
import type { PlatformDashboard, TimeSeriesPoint } from './api';

const mockDashboard: PlatformDashboard = {
  machinesByConnectionStatus: {
    ONLINE: 9,
    OFFLINE: 1,
  },
  machinesByOperatingMode: {
    NORMAL: 9,
    MAINTENANCE: 1,
  },
  orders: {
    total: 1200,
    byStatus: {
      PAID: 1180,
      DISPENSED: 1100,
      FORFEITED: 50,
      FAILED: 30,
    },
    revenue: '50000000',
    currency: 'VND',
  },
  dispense: {
    successCount: 1100,
    failureCount: 30,
    unknownCount: 0,
    successRate: 0.973,
  },
  openAlerts: 3,
  openTickets: 3,
  machineBreakdown: [
    {
      machineId: 'm-1',
      serialNumber: 'SN-001',
      displayName: 'Kiosk Vincom',
      locationName: 'Tầng 1 TTTM Vincom',
      connectionStatus: 'ONLINE',
      operatingMode: 'NORMAL',
      totalPaidOrders: 500,
      successCount: 480,
      forfeitedCount: 15,
      failureCount: 5,
      successRate: 0.99,
      forfeitedRate: 0.03,
      failureRate: 0.01,
      forfeitedAlert: false,
    },
    {
      machineId: 'm-2',
      serialNumber: 'SN-002',
      displayName: 'Kiosk Crescent',
      locationName: 'Sảnh Crescent Mall',
      connectionStatus: 'ONLINE',
      operatingMode: 'NORMAL',
      totalPaidOrders: 100,
      successCount: 80,
      forfeitedCount: 18,
      failureCount: 2,
      successRate: 0.975,
      forfeitedRate: 0.18,
      failureRate: 0.025,
      forfeitedAlert: true,
    },
  ],
};

const mockTimeseries: TimeSeriesPoint[] = [
  {
    bucket: '2026-10-25',
    orderCount: 120,
    revenue: '5000000',
  },
  {
    bucket: '2026-10-26',
    orderCount: 95,
    revenue: '4200000',
  },
];

const SUPER_ADMIN = {
  id: 'admin-1',
  fullName: 'Super Admin Test',
  roles: ['PLATFORM_SUPER_ADMIN'],
  permissions: ['report.platform', 'report.brand', 'maintenance.handle', 'inventory.manage'],
};
let mockUser: Record<string, unknown> = SUPER_ADMIN;

vi.mock('@/shared/auth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock('@/routes/shipments/InventoryReportTab', () => ({
  InventoryReportTab: () => <div>inventory-report-tab</div>,
}));

vi.mock('./api', () => ({
  usePlatformDashboard: () => ({
    data: mockDashboard,
    isLoading: false,
    refetch: vi.fn(),
  }),
  useOrdersTimeseries: () => ({
    data: mockTimeseries,
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

beforeAll(installDomStubs);
afterEach(() => {
  cleanup();
  mockUser = SUPER_ADMIN;
});

describe('DashboardPage (FR-RPT-01, 02, 04, ADR-0015)', () => {
  it('hiển thị đầy đủ KPI, tỉ lệ xịt và cảnh báo bảo trì', () => {
    renderScreen(<DashboardPage />);

    expect(screen.getByText('Tổng quan nền tảng')).toBeTruthy();
    expect(screen.getByText('1,200')).toBeTruthy();
    expect(screen.getByText('Kiosk Vincom')).toBeTruthy();
    expect(screen.getByText('Kiosk Crescent')).toBeTruthy();
    expect(screen.getByText('>10%')).toBeTruthy(); // Cảnh báo forfeited rate > 10%
  });

  it('hiển thị bảng diễn biến doanh thu theo thời gian', () => {
    renderScreen(<DashboardPage />);

    expect(screen.getByText('25/10/2026')).toBeTruthy();
    expect(screen.getByText('26/10/2026')).toBeTruthy();
    expect(screen.getByText('120')).toBeTruthy();
  });

  it('test_FR_RPT_01_dashboard_revenue_formats_money_string', () => {
    renderScreen(<DashboardPage />);

    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it('test_FR_RPT_07_inventory_staff_dashboard_shows_inventory_report', () => {
    mockUser = {
      id: 'inv-1',
      fullName: 'Inventory Test',
      roles: ['INVENTORY_STAFF'],
      permissions: ['inventory.manage', 'machine.view'],
    };
    renderScreen(<DashboardPage />);

    expect(screen.getByText('Tổng quan tồn kho')).toBeTruthy();
    expect(screen.getByText('inventory-report-tab')).toBeTruthy();
    expect(screen.queryByText('Tổng quan thương hiệu')).toBeNull();
    expect(screen.queryByText('Tổng quan nền tảng')).toBeNull();
  });

  it('test_FR_RPT_02_brand_admin_dashboard_shows_timeseries_only', () => {
    mockUser = {
      id: 'brand-1',
      fullName: 'Brand Test',
      roles: ['BRAND_ADMIN'],
      permissions: ['report.brand'],
    };
    renderScreen(<DashboardPage />);

    expect(screen.getByText('Tổng quan thương hiệu')).toBeTruthy();
    expect(screen.getByText('25/10/2026')).toBeTruthy();
    expect(screen.queryByText('Kiosk Vincom')).toBeNull();
  });
});
