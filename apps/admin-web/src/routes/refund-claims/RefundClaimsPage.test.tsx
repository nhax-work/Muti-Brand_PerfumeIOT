import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/shared/i18n';
import RefundClaimsPage from './RefundClaimsPage';

const mockAssign = vi.fn();
let mockRoles = ['OPERATIONS_STAFF'];

vi.mock('@/shared/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/auth')>();
  return {
    ...actual,
    useAuth: () => ({ user: { id: 'ops-1', roles: mockRoles } }),
    useReauth: () => async () => 'reauth-token',
  };
});

vi.mock('@/app/guards/RequireRole', () => ({
  RequireRole: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const OVERDUE = {
  id: 'claim-1',
  orderId: 'order-1',
  paymentReference: 'ORD-20261014-ABC123',
  status: 'OPEN',
  refundOrder: true,
  amount: '42000.0000',
  currency: 'VND',
  hasRefundAccount: true,
  assignedTo: null,
  assignedAt: null,
  payoutReference: null,
  resolutionNote: null,
  createdAt: '2026-10-12T03:00:00Z',
  closedAt: null,
  slaDueAt: '2026-10-13T03:00:00Z',
};

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    useRefundClaims: () => ({
      data: { items: [OVERDUE], meta: { page: 1, pageSize: 20, total: 1 } },
      isLoading: false,
    }),
    useOperationsStaff: () => ({ data: { items: [] }, isLoading: false }),
    useAssignClaim: () => ({ mutate: mockAssign, isPending: false }),
  };
});

const mockCommandFor = vi.fn();

vi.mock('@/routes/orders/api', () => ({
  useOrderDispenseCommand: (orderId: string | undefined) => {
    mockCommandFor(orderId);
    return {
      isLoading: false,
      data: {
        status: 'FAILED',
        commandToken: 'cmd_2f8921c7',
        sentAt: '2026-10-12T02:58:00Z',
        acknowledgedAt: '2026-10-12T02:58:01Z',
        result: { success: false, failureCode: 'ACTUATOR_FAULT' },
      },
    };
  },
}));

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  mockAssign.mockReset();
  mockRoles = ['OPERATIONS_STAFF'];
});

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <MemoryRouter>
          <RefundClaimsPage />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe('Màn xử lý khiếu nại hoàn tiền (FR-ORD-20, FR-ORD-32)', () => {
  it('test_FR_ORD_32_claim_list_flags_overdue_without_exposing_account', () => {
    renderPage();
    expect(screen.getByText('ORD-20261014-ABC123')).toBeTruthy();
    expect(screen.getByText('42.000 VND')).toBeTruthy();
    expect(screen.getByText('Quá hạn xử lý')).toBeTruthy();
    expect(screen.getByText('Chưa phân công')).toBeTruthy();
  });

  it('test_FR_ORD_20_operations_staff_takes_over_unassigned_claim', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Chi tiết phiếu' }));
    // Chưa được phân công thì không có nút xem tài khoản hay ghi nhận hoàn tiền.
    expect(screen.queryByRole('button', { name: 'Xem tài khoản nhận tiền' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Nhận xử lý' }));
    expect(mockAssign).toHaveBeenCalledWith(
      { id: 'claim-1', assigneeId: 'ops-1' },
      expect.any(Object),
    );
  });

  it('test_FR_ORD_30_super_admin_assigns_but_cannot_take_over', () => {
    mockRoles = ['PLATFORM_SUPER_ADMIN'];
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Chi tiết phiếu' }));
    expect(screen.queryByRole('button', { name: 'Nhận xử lý' })).toBeNull();
    expect(screen.getByText('Phân công cho')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xem tài khoản nhận tiền' })).toBeNull();
  });

  it('test_FR_ORD_20_claim_detail_shows_dispense_command_of_order', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Chi tiết phiếu' }));
    // Người xử lý đối chiếu kết quả máy báo về của đúng đơn bị khiếu nại.
    expect(mockCommandFor).toHaveBeenCalledWith('order-1');
    expect(screen.getByText('(Dữ liệu từ máy)')).toBeTruthy();
    expect(screen.getByText('cmd_2f8921c7')).toBeTruthy();
    expect(screen.getByText('Thất bại: Bơm xịt gặp sự cố')).toBeTruthy();
  });
});
