import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import RefillRequestsPage from './RefillRequestsPage';

const STAFF = {
  id: 'inv',
  brandId: null as string | null,
  roles: ['INVENTORY_STAFF'],
  permissions: ['refill.fulfill', 'inventory.manage'],
};
let mockUser = STAFF;
vi.mock('@/shared/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/auth')>()),
  useAuth: () => ({ user: mockUser }),
}));
vi.mock('@/app/guards/RequireRole', () => ({
  RequireRole: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const BASE = {
  brandId: 'b-1',
  brandName: 'Maison Aurore',
  slotRentalId: 'r-1',
  slotId: 's-1',
  slotNumber: 1,
  machineId: 'm-1',
  machineSerial: 'M001',
  fragranceProductId: 'p-1',
  productName: 'Aurore No.5',
  reason: 'LOW_STOCK',
  requestedBy: 'u-1',
  reviewedBy: null,
  rejectionReason: null,
  scheduledAt: null,
  refillSessionId: null,
  note: 'Còn 10%',
  createdAt: '2026-10-26T03:00:00Z',
  updatedAt: '2026-10-26T03:00:00Z',
};
const SUBMITTED = { ...BASE, id: 'q-1', status: 'SUBMITTED' };
const ACCEPTED = { ...BASE, id: 'q-2', status: 'ACCEPTED', slotNumber: 2 };

const mockReview = vi.fn().mockResolvedValue({});
const mockCreate = vi.fn().mockResolvedValue({});
const mockOpen = vi.fn().mockResolvedValue({});
vi.mock('./api', async () => ({
  ...(await vi.importActual<typeof import('./api')>('./api')),
  useRefillRequests: () => ({
    isLoading: false,
    data: { items: [SUBMITTED, ACCEPTED], meta: { page: 1, pageSize: 20, total: 2 } },
  }),
  useMyRentals: () => ({
    isLoading: false,
    data: { items: [{ id: 'r-1', stage: 'ACTIVE', invoiceNumber: 'HD-2026-0001' }] },
  }),
  useReviewRefillRequest: () => ({ mutateAsync: mockReview, isPending: false }),
  useCreateRefillRequest: () => ({ mutateAsync: mockCreate, isPending: false }),
  useOpenRefillForRequest: () => ({ mutateAsync: mockOpen, isPending: false }),
}));

beforeAll(installDomStubs);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockUser = STAFF;
});

describe('RefillRequestsPage (FR-RFQ-01 ÷ 10)', () => {
  it('nhân sự kho: thấy thương hiệu, lý do, ghi chú; chấp nhận yêu cầu SUBMITTED, mở phiếu nạp cho yêu cầu ACCEPTED', async () => {
    renderScreen(<RefillRequestsPage />);
    expect(screen.getAllByText('Maison Aurore').length).toBe(2);
    expect(screen.getAllByText('Sắp hết hàng').length).toBe(2);
    expect(screen.getByText('M001 · Slot #1')).toBeTruthy();

    fireEvent.click(screen.getByText('Chấp nhận'));
    await waitFor(() =>
      expect(mockReview).toHaveBeenCalledWith({ id: 'q-1', action: { kind: 'accept' } }),
    );

    fireEvent.click(screen.getByText('Mở phiếu nạp'));
    await waitFor(() => expect(mockOpen).toHaveBeenCalledWith(ACCEPTED));
  });

  it('từ chối cần lý do', async () => {
    renderScreen(<RefillRequestsPage />);
    fireEvent.click(screen.getByText('Từ chối'));
    const reason = await screen.findByPlaceholderText('Lý do từ chối (bắt buộc)');
    fireEvent.change(reason, { target: { value: ' Hết chai dự phòng ' } });
    fireEvent.click(screen.getAllByText('Từ chối').at(-1)!.closest('button')!);
    await waitFor(() =>
      expect(mockReview).toHaveBeenCalledWith({
        id: 'q-1',
        action: { kind: 'reject', reason: 'Hết chai dự phòng' },
      }),
    );
  });

  it('Brand Admin: tạo yêu cầu cho hóa đơn của mình, không có nút duyệt', async () => {
    mockUser = {
      id: 'ba',
      brandId: 'b-1',
      roles: ['BRAND_ADMIN'],
      permissions: ['refill.request'],
    };
    renderScreen(<RefillRequestsPage />);
    expect(screen.queryByText('Chấp nhận')).toBeNull();
    expect(screen.queryByText('Mở phiếu nạp')).toBeNull();

    fireEvent.click(screen.getByText('Tạo yêu cầu bổ sung'));
    fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Hóa đơn (slot)' }));
    fireEvent.click(await screen.findByText('HD-2026-0001'));
    fireEvent.click(screen.getByText('Gửi yêu cầu').closest('button')!);
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({ slotRentalId: 'r-1', reason: 'LOW_STOCK' }),
    );
  });
});
