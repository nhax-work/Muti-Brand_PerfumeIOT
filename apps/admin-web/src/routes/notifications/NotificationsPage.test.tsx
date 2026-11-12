import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import NotificationsPage from './NotificationsPage';
import type { Notification } from './api';

interface MockUser {
  id: string;
  brandId: string | null;
  roles: string[];
  permissions: string[];
}

const SUPER_ADMIN: MockUser = {
  id: 'u-admin',
  brandId: null,
  roles: ['PLATFORM_SUPER_ADMIN'],
  permissions: ['notification.manage'],
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

const sent: Notification = {
  id: 'notif-sent',
  brandId: 'b-1',
  recipientUserId: 'u-brand',
  type: 'RENTAL_CHECKOUT_PAID',
  channel: 'EMAIL',
  subject: 'Xác nhận thanh toán thuê slot (HD-001)',
  content: 'Phiên thanh toán đã được xác nhận.',
  status: 'SENT',
  sentAt: '2026-10-21T10:05:00Z',
  readAt: null,
  createdAt: '2026-10-21T10:00:00Z',
  recipientAddress: 'admin@maison.vn',
  referenceId: 'checkout-1',
  providerMessageId: '<smtp-123@mail>',
  deliveryAttempts: 1,
  lastAttemptAt: '2026-10-21T10:05:00Z',
  lastError: null,
};

const failed: Notification = {
  ...sent,
  id: 'notif-failed',
  subject: 'Xác nhận thanh toán thuê slot (HD-002)',
  status: 'FAILED',
  sentAt: null,
  providerMessageId: null,
  deliveryAttempts: 5,
  lastError: 'SMTP 550: hộp thư không tồn tại',
};

const retry = vi.fn();
let detail: Notification | undefined;

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  useNotifications: () => ({
    data: { items: [sent, failed], meta: { total: 2, page: 1, pageSize: 20 } },
    isLoading: false,
  }),
  useNotification: () => ({ data: detail, isLoading: false }),
  useRetryNotification: () => ({ mutateAsync: retry, isPending: false }),
}));

describe('NotificationsPage', () => {
  beforeAll(() => {
    installDomStubs();
  });

  afterEach(() => {
    cleanup();
    mockUser = SUPER_ADMIN;
    detail = undefined;
    retry.mockReset();
  });

  it('Super Admin thấy hòm thư nhận và nút gửi lại chỉ ở email FAILED', () => {
    renderScreen(<NotificationsPage />);
    expect(screen.getAllByText('admin@maison.vn')).toHaveLength(2);
    expect(screen.getAllByText('Gửi lại email')).toHaveLength(1);
  });

  it('Brand Admin không thấy cột hòm thư và không gửi lại được', () => {
    mockUser = BRAND_ADMIN;
    renderScreen(<NotificationsPage />);
    expect(screen.getByText('Xác nhận thanh toán thuê slot (HD-001)')).toBeTruthy();
    expect(screen.queryByText('admin@maison.vn')).toBeNull();
    expect(screen.queryByText('Gửi lại email')).toBeNull();
  });

  it('Xem bằng chứng gửi: mã thư, số lần thử, phản hồi lỗi', () => {
    detail = failed;
    renderScreen(<NotificationsPage />);
    fireEvent.click(screen.getAllByText('Xem bằng chứng gửi')[1]!);
    expect(screen.getByText('SMTP 550: hộp thư không tồn tại')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('checkout-1')).toBeTruthy();
  });

  it('Gửi lại đưa email vào hàng đợi', async () => {
    retry.mockResolvedValue({ ...failed, status: 'PENDING' });
    renderScreen(<NotificationsPage />);
    fireEvent.click(screen.getByText('Gửi lại email'));
    fireEvent.click(await screen.findByText('Xác nhận'));
    expect(retry).toHaveBeenCalledWith('notif-failed');
  });
});
