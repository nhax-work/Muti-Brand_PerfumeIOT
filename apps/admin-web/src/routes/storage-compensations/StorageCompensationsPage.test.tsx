import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import StorageCompensationsPage from './StorageCompensationsPage';

const SUPER_ADMIN = {
  id: 'sa',
  brandId: null as string | null,
  roles: ['PLATFORM_SUPER_ADMIN'],
  permissions: ['report.brand', 'revenue.manage', 'inventory.adjust'],
};
let mockUser = SUPER_ADMIN;
vi.mock('@/shared/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/auth')>()),
  useAuth: () => ({ user: mockUser }),
}));
vi.mock('@/app/guards/RequireRole', () => ({
  RequireRole: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const PENDING = {
  id: 'c-1',
  brandId: 'b-1',
  brandName: 'Maison Aurore',
  bottleId: 'bt-1',
  bottleIdentifier: 'BTL-001',
  productName: 'Aurore No.5',
  slotRentalId: 'r-1',
  invoiceNumber: 'HD-2026-0001',
  storagePlanName: 'Bảo quản tiêu chuẩn',
  damagedAt: '2026-10-26T03:00:00Z',
  bottleRetailPrice: '2400000.0000',
  coveragePercent: 60,
  amount: '1440000.0000',
  currency: 'VND',
  status: 'PENDING',
  payoutReference: null,
  paidAt: null,
  createdAt: '2026-10-26T03:00:00Z',
};
const BOTTLE = {
  id: 'bt-2',
  brandId: 'b-1',
  owner: 'BRAND',
  batchId: 'batch-1',
  identifier: 'BTL-002',
  status: 'IN_STOCK',
  currentEstimatedMl: 50,
  installedSlotId: null,
  expiresAt: null,
};

const mockPayout = vi
  .fn()
  .mockResolvedValue({ ...PENDING, status: 'PAID', payoutReference: 'FT1' });
const mockMark = vi.fn().mockResolvedValue({
  bottle: { ...BOTTLE, status: 'DAMAGED' },
  compensation: { ...PENDING, id: 'c-2', amount: '600000.0000' },
});
vi.mock('./api', async () => ({
  ...(await vi.importActual<typeof import('./api')>('./api')),
  useStorageCompensations: () => ({
    isLoading: false,
    data: { items: [PENDING], meta: { page: 1, pageSize: 20, total: 1 } },
  }),
  useBrandNames: () => ({ data: { items: [{ id: 'b-1', name: 'Maison Aurore' }] } }),
  useBottles: () => ({
    isLoading: false,
    data: { items: [BOTTLE], meta: { page: 1, pageSize: 20, total: 1 } },
  }),
  usePayoutCompensation: () => ({ mutateAsync: mockPayout, isPending: false }),
  useMarkBottleDamaged: () => ({ mutateAsync: mockMark, isPending: false }),
}));

beforeAll(installDomStubs);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockUser = SUPER_ADMIN;
});

describe('StorageCompensationsPage (FR-SLT-44 ÷ 46)', () => {
  it('Super Admin: thấy khoản bồi thường, thương hiệu, công thức; ghi nhận chi trả kèm mã giao dịch', async () => {
    renderScreen(<StorageCompensationsPage />);
    expect(screen.getByText('BTL-001')).toBeTruthy();
    expect(screen.getAllByText('Maison Aurore').length).toBeGreaterThan(0);
    expect(screen.getByText('HD-2026-0001')).toBeTruthy();
    expect(screen.getByText('Chờ chi trả')).toBeTruthy();

    fireEvent.click(screen.getByText('Chi tiết'));
    const reference = await screen.findByPlaceholderText('Mã giao dịch');
    fireEvent.change(reference, { target: { value: ' FT26300123 ' } });
    fireEvent.click(screen.getAllByText('Ghi nhận đã chi trả').at(-1)!.closest('button')!);
    await waitFor(() =>
      expect(mockPayout).toHaveBeenCalledWith({ id: 'c-1', payoutReference: 'FT26300123' }),
    );
  });

  it('Brand Admin: chỉ có tab khoản bồi thường, không có nút chi trả hay ghi nhận hư hỏng', async () => {
    mockUser = { id: 'ba', brandId: 'b-1', roles: ['BRAND_ADMIN'], permissions: ['report.brand'] };
    renderScreen(<StorageCompensationsPage />);
    expect(screen.getByText('BTL-001')).toBeTruthy();
    expect(screen.queryByText('Ghi nhận chai hư hỏng')).toBeNull();
    fireEvent.click(screen.getByText('Chi tiết'));
    // Ngăn chi tiết đã mở (tên gói bảo quản chỉ có trong ngăn) mà không có ô nhập mã giao dịch.
    await screen.findByText('Bảo quản tiêu chuẩn');
    expect(screen.queryByPlaceholderText('Mã giao dịch')).toBeNull();
  });

  it('Inventory Staff: ghi nhận chai hư hỏng kèm lý do, báo khoản bồi thường máy chủ trả về', async () => {
    mockUser = {
      id: 'inv',
      brandId: null,
      roles: ['INVENTORY_STAFF'],
      permissions: ['inventory.adjust'],
    };
    renderScreen(<StorageCompensationsPage />);
    expect(screen.queryByText('Khoản bồi thường')).toBeNull();
    expect(screen.getByText('BTL-002')).toBeTruthy();

    fireEvent.click(screen.getByText('Ghi nhận hư hỏng'));
    const reason = await screen.findByPlaceholderText('Mô tả tình trạng hư hỏng');
    fireEvent.change(reason, { target: { value: 'Nứt thân chai' } });
    fireEvent.click(screen.getAllByText('Ghi nhận hư hỏng').at(-1)!.closest('button')!);
    await waitFor(() =>
      expect(mockMark).toHaveBeenCalledWith({ id: 'bt-2', reason: 'Nứt thân chai' }),
    );
  });
});
