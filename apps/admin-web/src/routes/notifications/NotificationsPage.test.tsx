import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import NotificationsPage from './NotificationsPage';
import type { NotificationItem } from './api';

let mockUser: { id: string; brandId: string | null; roles: string[] } = {
  id: 'u-admin',
  brandId: null,
  roles: ['PLATFORM_SUPER_ADMIN'],
};

vi.mock('@/shared/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/auth')>()),
  useAuth: () => ({ user: mockUser }),
}));

const mockNotifications: NotificationItem[] = [
  {
    id: 'notif-1111-2222-3333-4444',
    brandId: 'b-1',
    brandName: 'Maison De L\'Amour',
    recipientUserId: 'u-brand-1',
    recipientName: 'Quản Lý Thương Hiệu 1',
    recipientEmail: 'contact@maison.vn',
    type: 'RENTAL_CHECKOUT_PAID',
    channel: 'EMAIL',
    subject: '[ScentStation] Xác nhận thanh toán thuê slot thành công (INV-2026-001)',
    content: 'Kính gửi Quý đối tác,\nPhiên thanh toán thuê slot của quý thương hiệu đã được xác nhận.',
    status: 'SENT',
    sentAt: '2026-10-21T10:05:00Z',
    readAt: null,
    createdAt: '2026-10-21T10:00:00Z',
  },
  {
    id: 'notif-9999-8888-7777-6666',
    brandId: 'b-1',
    brandName: 'Maison De L\'Amour',
    recipientUserId: 'u-brand-1',
    recipientName: 'Quản Lý Thương Hiệu 1',
    recipientEmail: 'contact@maison.vn',
    type: 'RENTAL_CHECKOUT_PAID',
    channel: 'EMAIL',
    subject: '[ScentStation] Xác nhận thanh toán thuê slot thành công (INV-2026-002)',
    content: 'Nội dung email bị lỗi kết nối mail server',
    status: 'FAILED',
    sentAt: null,
    readAt: null,
    createdAt: '2026-10-21T10:10:00Z',
  },
];

let selectedItem: NotificationItem | null = null;
const mockRetry = vi.fn().mockResolvedValue({ ...mockNotifications[1], status: 'SENT' });

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  useNotifications: () => ({
    data: {
      items: mockNotifications,
      meta: { page: 1, pageSize: 20, total: 2 },
    },
    isLoading: false,
    refetch: vi.fn(),
    isFetching: false,
  }),
  useNotification: (id: string | null) => ({
    data: id ? mockNotifications.find((n) => n.id === id) ?? null : null,
    isLoading: false,
  }),
  useRetryNotification: () => ({
    mutateAsync: mockRetry,
    isPending: false,
    variables: null,
  }),
}));

beforeAll(() => {
  installDomStubs();
});

afterEach(() => {
  cleanup();
});

describe('Màn hình Lịch sử thông báo & Bằng chứng gửi (FR-ALR-16, FR-SLT-43)', () => {
  it('hiển thị danh sách thông báo và bằng chứng gửi với đầy đủ thông tin', () => {
    mockUser = { id: 'u-admin', brandId: null, roles: ['PLATFORM_SUPER_ADMIN'] };
    renderScreen(<NotificationsPage />);

    // Kiểm tra tiêu đề trang
    expect(screen.getByText('Lịch sử thông báo & Bằng chứng gửi')).toBeTruthy();
    expect(
      screen.getByText('Lưu trữ toàn bộ bằng chứng gửi email và thông báo giao dịch làm căn cứ đối soát pháp lý.'),
    ).toBeTruthy();

    // Kiểm tra các item xuất hiện trong bảng
    expect(screen.getByText(/INV-2026-001/)).toBeTruthy();
    expect(screen.getAllByText('contact@maison.vn').length).toBe(2);
    expect(screen.getAllByText('Maison De L\'Amour').length).toBe(2);

    // Trạng thái hiển thị
    expect(screen.getAllByText('Đã gửi thành công').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Gửi thất bại').length).toBeGreaterThan(0);
  });

  it('mở drawer xem chi tiết bằng chứng gửi đối soát pháp lý khi nhấn Xem bằng chứng', async () => {
    mockUser = { id: 'u-admin', brandId: null, roles: ['PLATFORM_SUPER_ADMIN'] };
    renderScreen(<NotificationsPage />);

    const viewButtons = screen.getAllByRole('button', { name: /Xem bằng chứng gửi/i });
    expect(viewButtons.length).toBeGreaterThan(0);

    // Click xem bằng chứng của item đầu tiên
    fireEvent.click(viewButtons[0]!);

    // Drawer hiển thị tiêu đề và nội dung bằng chứng
    expect(screen.getByText('Bằng chứng thông báo đối soát pháp lý')).toBeTruthy();
    expect(screen.getByText('notif-1111-2222-3333-4444')).toBeTruthy();
    expect(screen.getByText(/Phiên thanh toán thuê slot của quý thương hiệu đã được xác nhận/)).toBeTruthy();
  });

  it('hiển thị nút Thử gửi lại cho thông báo có trạng thái FAILED qua kênh EMAIL', () => {
    mockUser = { id: 'u-admin', brandId: null, roles: ['PLATFORM_SUPER_ADMIN'] };
    renderScreen(<NotificationsPage />);

    // Nút Gửi lại chỉ xuất hiện cho dòng FAILED
    const retryButtons = screen.getAllByRole('button', { name: /Gửi lại email/i });
    expect(retryButtons.length).toBe(1);
  });
});
