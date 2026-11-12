import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import { NotificationBell } from './NotificationBell';
import { SalesStopBanner } from './SalesStopBanner';
import type { BellNotification, MachineSalesStop } from './status-api';

let mockUser = {
  id: 'u-staff',
  roles: ['INVENTORY_STAFF'],
  permissions: ['inventory.manage'],
};
vi.mock('@/shared/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/auth')>()),
  useAuth: () => ({ user: mockUser }),
}));

let mockStops: MachineSalesStop[] = [];
let mockUnread = 0;
const mockMarkRead = vi.fn();
const mockMarkAll = vi.fn();
const notifications: BellNotification[] = [
  {
    id: 'n-1',
    recipientUserId: 'u-staff',
    type: 'SHIPMENT_DECLARED',
    channel: 'IN_APP',
    subject: 'Khai báo gửi hàng mới',
    content: 'test brand gửi 20 chai test2',
    status: 'SENT',
    readAt: null,
    createdAt: '2026-11-12T08:00:00Z',
  },
  {
    id: 'n-2',
    recipientUserId: 'u-staff',
    type: 'REFILL_REQUESTED',
    channel: 'IN_APP',
    subject: 'Yêu cầu bổ sung',
    content: 'Slot 1 sắp hết',
    status: 'READ',
    readAt: '2026-11-12T07:00:00Z',
    createdAt: '2026-11-12T06:00:00Z',
  },
];

vi.mock('./status-api', () => ({
  useMachineSalesStops: () => ({ data: { items: mockStops } }),
  useUnreadCount: () => ({ data: { unread: mockUnread } }),
  useMyLatestNotifications: () => ({ data: { items: notifications }, isLoading: false }),
  useMarkNotificationRead: () => ({ mutate: mockMarkRead }),
  useMarkAllNotificationsRead: () => ({ mutate: mockMarkAll, isPending: false }),
}));

const REFILL_STOP: MachineSalesStop = {
  machineId: 'm-2',
  machineName: 'Máy Landmark 81 #1',
  serialNumber: 'M002',
  locationName: 'Landmark 81',
  reason: 'REFILL_SESSION',
  since: '2026-11-12T08:01:25Z',
  refillSession: {
    id: 'rs-1',
    slotNumber: 1,
    performedByName: 'Lê Thủ Kho',
    startedAt: '2026-11-12T08:01:25Z',
  },
};

describe('Banner máy dừng bán (FR-MCH-19, ADR-0028)', () => {
  beforeAll(installDomStubs);
  afterEach(() => {
    cleanup();
    mockStops = [];
  });

  it('test_FR_MCH_19_banner_hidden_when_all_selling — không máy nào dừng thì không có banner', () => {
    renderScreen(<SalesStopBanner />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('test_FR_MCH_19_banner_shows_refill_detail — Thủ Kho thấy phiếu nào chặn máy và nút tới phiếu nạp', () => {
    mockStops = [REFILL_STOP];
    renderScreen(<SalesStopBanner />);
    expect(screen.getByText(/1 máy đang dừng bán/)).toBeTruthy();
    expect(screen.getByText('Máy Landmark 81 #1')).toBeTruthy();
    expect(screen.getByText(/phiếu nạp slot 1 mở từ .* bởi Lê Thủ Kho/)).toBeTruthy();
    expect(screen.getByText('Xem phiếu nạp')).toBeTruthy();
  });

  it('test_FR_MCH_19_banner_brand_generic_reason — Brand Admin thấy lý do chung, không có nút phiếu nạp', () => {
    mockUser = { id: 'u-brand', roles: ['BRAND_ADMIN'], permissions: [] };
    const { refillSession: _hidden, ...brandView } = REFILL_STOP;
    mockStops = [brandView];
    renderScreen(<SalesStopBanner />);
    expect(screen.getByText(/đang nạp hàng/)).toBeTruthy();
    expect(screen.queryByText('Xem phiếu nạp')).toBeNull();
    mockUser = { id: 'u-staff', roles: ['INVENTORY_STAFF'], permissions: ['inventory.manage'] };
  });
});

describe('Chuông thông báo (FR-ALR-17, ADR-0028)', () => {
  beforeAll(installDomStubs);
  afterEach(() => {
    cleanup();
    mockUnread = 0;
    mockMarkRead.mockClear();
    mockMarkAll.mockClear();
  });

  it('test_FR_ALR_17_bell_badge_and_mark_read — số chưa đọc, bấm thông báo chưa đọc là đánh dấu đã đọc', async () => {
    mockUnread = 3;
    renderScreen(<NotificationBell />);
    expect(screen.getByLabelText('3 thông báo chưa đọc')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('3 thông báo chưa đọc'));
    await waitFor(() => expect(screen.getByText('Khai báo gửi hàng mới')).toBeTruthy());

    fireEvent.click(screen.getByText('Khai báo gửi hàng mới'));
    expect(mockMarkRead).toHaveBeenCalledWith('n-1');
    // Thông báo đã đọc thì bấm không gọi lại máy chủ.
    fireEvent.click(screen.getByText('Yêu cầu bổ sung'));
    expect(mockMarkRead).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Đánh dấu đã đọc tất cả'));
    expect(mockMarkAll).toHaveBeenCalled();
  });

  it('test_FR_ALR_17_bell_without_unread — không có thông báo mới thì không hiện số', () => {
    renderScreen(<NotificationBell />);
    expect(screen.getByLabelText('Thông báo')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });
});
