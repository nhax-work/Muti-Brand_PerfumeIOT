import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import OrdersPage from './OrdersPage';

const OPS = {
  id: 'ops',
  brandId: null as string | null,
  roles: ['OPERATIONS_STAFF'],
  permissions: ['order.view', 'order.refund'],
};
let mockUser = OPS;
vi.mock('@/shared/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/auth')>()),
  useAuth: () => ({ user: mockUser }),
}));
vi.mock('@/app/guards/RequireRole', () => ({
  RequireRole: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const ORDER = {
  id: 'o-1',
  brandId: 'b-1',
  slotRentalId: 'r-1',
  revenueOwner: 'BRAND',
  machineId: 'm-1',
  slotId: 's-1',
  productNameSnapshot: 'Aurore Matinale',
  amount: '35000.0000',
  currency: 'VND',
  status: 'FAILED',
  paymentReference: 'ORD-20261016-QUEUE1',
  expiresAt: '2026-10-16T08:05:00Z',
  paidAt: '2026-10-16T08:01:00Z',
  dispensedAt: null,
  failureCode: 'QUEUE_TIMEOUT',
  needsManualReview: true,
  createdAt: '2026-10-16T08:00:00Z',
};

const reviewQuery = vi.fn();
vi.mock('./api', async () => ({
  ...(await vi.importActual<typeof import('./api')>('./api')),
  useOrders: () => ({
    data: { items: [ORDER], meta: { page: 1, pageSize: 20, total: 1 } },
    isLoading: false,
  }),
  useManualReviewOrders: (_page: number, enabled: boolean) => {
    reviewQuery(enabled);
    return {
      data: { items: [ORDER], meta: { page: 1, pageSize: 20, total: 1 } },
      isLoading: false,
    };
  },
  useOrderDispenseCommand: () => ({
    data: {
      id: 'c-1',
      orderId: 'o-1',
      brandId: 'b-1',
      machineId: 'm-1',
      slotId: 's-1',
      commandType: 'CUSTOMER',
      commandToken: 'cmd_test_unknown',
      status: 'UNKNOWN',
      expiresAt: '2026-10-16T08:02:00Z',
      sentAt: '2026-10-16T08:01:01Z',
      acknowledgedAt: null,
      completedAt: null,
      retryCount: 0,
      createdAt: '2026-10-16T08:01:00Z',
      result: null,
    },
    isLoading: false,
  }),
  useOrderTrace: (orderId: string | undefined) => ({
    isLoading: false,
    data: orderId
      ? {
          order: ORDER,
          slotRental: { id: 'r-1', invoiceNumber: 'HD-20261016-ABCDEF' },
          statusHistory: [],
          payments: [
            {
              id: 'pay-1',
              orderId: 'o-1',
              provider: 'payos',
              amount: '35000.0000',
              currency: 'VND',
              status: 'SUCCEEDED',
              paidAt: '2026-10-16T08:01:00Z',
            },
          ],
          dispenseCommands: [],
          inventoryAdjustments: [],
          auditLogs: [
            {
              id: 'a-1',
              actorType: 'PAYMENT_PROVIDER',
              action: 'ord.payment.succeeded',
              targetType: 'payment',
              occurredAt: '2026-10-16T08:01:00Z',
            },
          ],
        }
      : undefined,
  }),
  useOrderHistory: () => ({
    data: [
      {
        id: 'h1',
        toStatus: 'PAID',
        actorType: 'PAYMENT_PROVIDER',
        occurredAt: '2026-10-16T08:01:00Z',
      },
      {
        id: 'h2',
        fromStatus: 'PAID',
        toStatus: 'FAILED',
        reason: 'QUEUE_TIMEOUT',
        actorType: 'SYSTEM',
        occurredAt: '2026-10-16T08:04:00Z',
      },
    ],
  }),
}));

beforeAll(installDomStubs);
afterEach(() => {
  cleanup();
  reviewQuery.mockClear();
  mockUser = OPS;
});

describe('OrdersPage (FR-ORD-18, 19, 22)', () => {
  it('Operations Staff có tab cần kiểm tra thủ công; chi tiết hiện lịch sử kèm lý do', async () => {
    renderScreen(<OrdersPage />);
    expect(screen.getByText('Cần kiểm tra thủ công')).toBeTruthy();
    expect(reviewQuery).toHaveBeenCalledWith(true);
    expect(screen.getAllByText('Doanh thu của').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByText('Chi tiết')[0]!);
    expect(await screen.findByText(/đã trả tiền nhưng không nhận được lượt xịt/)).toBeTruthy();
    expect(screen.getByText(/Hệ thống · Chờ lượt quá lâu/)).toBeTruthy();
    // FR-DSP-20: ngăn chi tiết hiện lệnh xịt của đơn và trạng thái của lệnh.
    expect(screen.getByText('cmd_test_unknown')).toBeTruthy();
    expect(screen.getByText('Không rõ kết quả')).toBeTruthy();
  });

  it('Brand Admin không có tab kiểm tra thủ công, không thấy cột chủ sở hữu doanh thu', () => {
    mockUser = { id: 'ba', brandId: 'b-1', roles: ['BRAND_ADMIN'], permissions: ['order.view'] };
    renderScreen(<OrdersPage />);
    expect(screen.queryByText('Cần kiểm tra thủ công')).toBeNull();
    expect(reviewQuery).toHaveBeenCalledWith(false);
    expect(screen.queryByText('Doanh thu của')).toBeNull();
    expect(screen.getByText('ORD-20261016-QUEUE1')).toBeTruthy();
  });

  it('test_FR_AUD_11_order_trace — người có audit.read mở truy vết từ ngăn chi tiết; người khác không thấy nút', async () => {
    renderScreen(<OrdersPage />);
    fireEvent.click(screen.getAllByText('Chi tiết')[0]!);
    await screen.findByText('cmd_test_unknown');
    expect(screen.queryByText('Truy vết')).toBeNull();
    cleanup();

    mockUser = {
      id: 'sa',
      brandId: null,
      roles: ['PLATFORM_SUPER_ADMIN'],
      permissions: ['order.view', 'audit.read'],
    };
    renderScreen(<OrdersPage />);
    fireEvent.click(screen.getAllByText('Chi tiết')[0]!);
    fireEvent.click((await screen.findByText('Truy vết')).closest('button')!);
    expect(await screen.findByText('HD-20261016-ABCDEF')).toBeTruthy();
    expect(screen.getByText('ord.payment.succeeded')).toBeTruthy();
    expect(screen.getByText('payos')).toBeTruthy();
  });
});
