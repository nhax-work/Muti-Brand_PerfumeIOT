import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import BrandPayoutsPage from './BrandPayoutsPage';

let mockUser = { id: 'sa', brandId: null as string | null, roles: ['PLATFORM_SUPER_ADMIN'] };
vi.mock('@/shared/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/auth')>()),
  useAuth: () => ({ user: mockUser }),
}));
vi.mock('@/app/guards/RequireRole', () => ({
  RequireRole: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const BASE = {
  brandId: 'b-1',
  currency: 'VND',
  confirmedAt: '2026-10-01T00:05:00Z',
  paidAt: null,
  transferReference: null,
  disputeNote: null,
  disputedAt: null,
  disputeResponse: null,
  disputeResolvedAt: null,
  createdAt: '2026-09-01T00:00:00Z',
};
const CONFIRMED = {
  ...BASE,
  id: 'p-1',
  periodMonth: '2026-09-01',
  status: 'CONFIRMED',
  orderCount: 400,
  amount: '10000000.0000',
};
const DISPUTED = {
  ...BASE,
  id: 'p-2',
  periodMonth: '2026-08-01',
  status: 'CONFIRMED',
  orderCount: 12,
  amount: '420000.0000',
  disputeNote: 'Thiếu đơn',
  disputedAt: '2026-09-02T00:00:00Z',
};

const mockPay = vi
  .fn()
  .mockResolvedValue({ ...CONFIRMED, status: 'PAID', transferReference: 'FT1' });
const mockDispute = vi
  .fn()
  .mockResolvedValue({ ...CONFIRMED, disputedAt: '2026-10-02T00:00:00Z', disputeNote: 'x' });
const mockRespond = vi.fn();
vi.mock('./api', async () => ({
  ...(await vi.importActual<typeof import('./api')>('./api')),
  useBrandPayouts: () => ({
    isLoading: false,
    data: { items: [CONFIRMED, DISPUTED], meta: { page: 1, pageSize: 20, total: 2 } },
  }),
  useBrandNames: () => ({ data: { items: [{ id: 'b-1', name: 'Maison Aurore' }] } }),
  usePayBrandPayout: () => ({ mutateAsync: mockPay, isPending: false }),
  useDisputeBrandPayout: () => ({ mutateAsync: mockDispute, isPending: false }),
  useRespondBrandPayoutDispute: () => ({ mutateAsync: mockRespond, isPending: false }),
}));

beforeAll(installDomStubs);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockUser = { id: 'sa', brandId: null, roles: ['PLATFORM_SUPER_ADMIN'] };
});

describe('BrandPayoutsPage (FR-SLT-52..54)', () => {
  it('Super Admin: thấy tên thương hiệu, kỳ có khiếu nại được đánh dấu, ghi nhận chuyển khoản', async () => {
    renderScreen(<BrandPayoutsPage />);
    expect(screen.getAllByText('Maison Aurore').length).toBeGreaterThan(0);
    expect(screen.getByText('09/2026')).toBeTruthy();
    expect(screen.getByText('Có khiếu nại')).toBeTruthy();

    fireEvent.click(screen.getAllByText('Chi tiết')[0]!);
    fireEvent.change(await screen.findByPlaceholderText('Mã giao dịch'), {
      target: { value: 'FT1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận đã chuyển khoản' }));
    await waitFor(() =>
      expect(mockPay).toHaveBeenCalledWith({ id: 'p-1', transferReference: 'FT1' }),
    );
  });

  it('Super Admin: kỳ còn khiếu nại chỉ cho trả lời, không cho chuyển khoản', async () => {
    renderScreen(<BrandPayoutsPage />);
    fireEvent.click(screen.getAllByText('Chi tiết')[1]!);
    expect(await screen.findByText('Thiếu đơn')).toBeTruthy();
    expect(screen.getAllByText('Trả lời khiếu nại').length).toBeGreaterThan(0);
    expect(screen.queryByText('Ghi nhận đã chuyển khoản')).toBeNull();
  });

  it('Brand Admin: không có cột thương hiệu, khiếu nại được kỳ đã chốt', async () => {
    mockUser = { id: 'ba', brandId: 'b-1', roles: ['BRAND_ADMIN'] };
    renderScreen(<BrandPayoutsPage />);
    expect(screen.queryByText('Maison Aurore')).toBeNull();

    fireEvent.click(screen.getAllByText('Chi tiết')[0]!);
    fireEvent.change(await screen.findByPlaceholderText('Mô tả số liệu bạn cho là chưa đúng'), {
      target: { value: 'Thiếu 2 đơn ngày 30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Khiếu nại số liệu' }));
    await waitFor(() =>
      expect(mockDispute).toHaveBeenCalledWith({ id: 'p-1', note: 'Thiếu 2 đơn ngày 30' }),
    );
    expect(screen.queryByText('Ghi nhận đã chuyển khoản')).toBeNull();
  });
});
