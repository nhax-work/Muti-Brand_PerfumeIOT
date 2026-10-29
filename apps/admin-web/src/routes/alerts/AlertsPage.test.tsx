import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import AlertsPage from './AlertsPage';
import type { Alert } from './api';

interface MockUser {
  id: string;
  brandId: string | null;
  roles: string[];
  permissions: string[];
}

const SUPER_ADMIN: MockUser = {
  id: 'u-ops',
  brandId: null,
  roles: ['OPERATIONS_STAFF'],
  permissions: ['alert.handle'],
};

const BRAND_ADMIN: MockUser = {
  id: 'u-brand',
  brandId: 'b-1',
  roles: ['BRAND_ADMIN'],
  permissions: ['product.manage'],
};

let mockUser: MockUser = SUPER_ADMIN;

vi.mock('@/shared/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/auth')>()),
  useAuth: () => ({ user: mockUser }),
}));

const openAlert: Alert = {
  id: 'alr-open-1',
  brandId: 'b-1',
  machineId: 'm-01',
  slotId: 's-01',
  locationId: 'loc-01',
  type: 'SLOT_LOW_STOCK',
  severity: 'WARNING',
  status: 'OPEN',
  title: 'Hết nước hoa tại slot',
  description: 'Dung tích còn dưới 10%',
  firstOccurredAt: '2026-10-25T10:00:00Z',
  lastOccurredAt: '2026-10-25T10:05:00Z',
  occurrenceCount: 2,
  acknowledgedBy: null,
  acknowledgedAt: null,
  assignedTo: null,
  resolvedBy: null,
  resolvedAt: null,
  resolution: null,
  affectedBrandIds: ['b-1', 'b-2'],
};

const resolvedAlert: Alert = {
  ...openAlert,
  id: 'alr-resolved-2',
  status: 'RESOLVED',
  title: 'Cửa mở quá hạn',
  type: 'DOOR_OPEN_TIMEOUT',
  severity: 'CRITICAL',
  acknowledgedBy: 'u-ops',
  acknowledgedAt: '2026-10-25T10:10:00Z',
  resolvedBy: 'u-ops',
  resolvedAt: '2026-10-25T10:20:00Z',
  resolution: 'Đã kiểm tra và đóng cửa an toàn',
};

const acknowledgeMock = vi.fn();
const assignMock = vi.fn();
const resolveMock = vi.fn();
const closeMock = vi.fn();
let detailData: Alert | undefined;

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  useAlerts: () => ({
    data: { items: [openAlert, resolvedAlert], meta: { total: 2, page: 1, pageSize: 20 } },
    isLoading: false,
  }),
  useAlert: () => ({ data: detailData, isLoading: false }),
  useAcknowledgeAlert: () => ({ mutateAsync: acknowledgeMock, isPending: false }),
  useAssignAlert: () => ({ mutateAsync: assignMock, isPending: false }),
  useResolveAlert: () => ({ mutateAsync: resolveMock, isPending: false }),
  useCloseAlert: () => ({ mutateAsync: closeMock, isPending: false }),
}));

describe('AlertsPage', () => {
  beforeAll(() => {
    installDomStubs();
  });

  afterEach(() => {
    cleanup();
    mockUser = SUPER_ADMIN;
    detailData = undefined;
    acknowledgeMock.mockReset();
    assignMock.mockReset();
    resolveMock.mockReset();
    closeMock.mockReset();
  });

  it('Operations Staff thấy danh sách cảnh báo và các nút xử lý', () => {
    renderScreen(<AlertsPage />);
    expect(screen.getByText('Hết nước hoa tại slot')).toBeTruthy();
    expect(screen.getByText('Cửa mở quá hạn')).toBeTruthy();
    expect(screen.getByText('Tiếp nhận')).toBeTruthy();
    expect(screen.getAllByText('Phân công')).toHaveLength(2);
    expect(screen.getByText('Xử lý')).toBeTruthy();
    expect(screen.getByText('Đóng cảnh báo')).toBeTruthy();
  });

  it('Brand Admin chỉ xem danh sách cảnh báo, không có các nút xử lý vận hành', () => {
    mockUser = BRAND_ADMIN;
    renderScreen(<AlertsPage />);
    expect(screen.getByText('Hết nước hoa tại slot')).toBeTruthy();
    expect(screen.queryByText('Tiếp nhận')).toBeNull();
    expect(screen.queryByText('Phân công')).toBeNull();
    expect(screen.queryByText('Xử lý')).toBeNull();
    expect(screen.queryByText('Đóng cảnh báo')).toBeNull();
  });

  it('Bấm Tiếp nhận cảnh báo gọi acknowledge API', async () => {
    acknowledgeMock.mockResolvedValue({ ...openAlert, status: 'ACKNOWLEDGED' });
    renderScreen(<AlertsPage />);
    fireEvent.click(screen.getByText('Tiếp nhận'));
    expect(acknowledgeMock).toHaveBeenCalledWith('alr-open-1');
  });

  it('Xem chi tiết cảnh báo mở Drawer hiển thị nội dung và thương hiệu bị ảnh hưởng', () => {
    detailData = openAlert;
    renderScreen(<AlertsPage />);
    fireEvent.click(screen.getAllByText('Xem chi tiết')[0]!);
    expect(screen.getByText('Dung tích còn dưới 10%')).toBeTruthy();
    expect(screen.getByText('b-1')).toBeTruthy();
    expect(screen.getByText('b-2')).toBeTruthy();
  });

  it('Đóng cảnh báo đã giải quyết gọi close API', async () => {
    closeMock.mockResolvedValue({ ...resolvedAlert, status: 'CLOSED' });
    renderScreen(<AlertsPage />);
    fireEvent.click(screen.getByText('Đóng cảnh báo'));
    fireEvent.click(await screen.findByText('Xác nhận'));
    expect(closeMock).toHaveBeenCalledWith('alr-resolved-2');
  });
});
