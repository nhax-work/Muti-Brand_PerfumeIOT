import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '@/shared/i18n';
import RentalsPage from './RentalsPage';

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
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
});

// Mock Auth context cho BRAND_ADMIN
vi.mock('@/shared/auth', () => ({
  useAuth: () => ({
    user: {
      userId: 'user-1',
      brandId: 'brand-1',
      roles: ['BRAND_ADMIN'],
    },
    hasRole: (role: string) => role === 'BRAND_ADMIN',
    isAuthenticated: true,
  }),
  useReauth: () => ({
    withReauth: async (fn: () => Promise<unknown>) => fn(),
  }),
}));

vi.mock('@/app/guards/RequireRole', () => ({
  RequireRole: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    useSlotRentals: () => ({
      data: {
        items: [
          {
            id: 'rental-1',
            slotId: 'slot-1',
            machineId: 'machine-1',
            brandId: 'brand-1',
            status: 'ACTIVE',
            stage: 'ACTIVE',
            startsAt: '2026-10-01T00:00:00Z',
            endsAt: '2027-01-01T00:00:00Z',
            currency: 'VND',
            totalAmount: '3300000.0000',
            invoiceNumber: 'HD-20261001-234567',
            durationMonths: 3,
            pricePerSpray: '15000.0000',
          },
        ],
        total: 1,
      },
      isLoading: false,
      refetch: vi.fn(),
    }),
    useAvailableSlots: () => ({
      data: {
        items: [
          {
            slotId: 'slot-available-1',
            slotNumber: 1,
            machineId: 'mch-1',
            machineDisplayName: 'Máy Kiosk Vincom',
            locationName: 'Tầng 1 Vincom Đồng Khởi',
            monthlyRentPrice: '1000000.0000',
            status: 'AVAILABLE',
          },
        ],
        meta: { page: 1, pageSize: 50, total: 1 },
      },
      isLoading: false,
      refetch: vi.fn(),
    }),
    useRentalQuote: () => ({
      data: {
        slotId: 'slot-available-1',
        monthlyRentPrice: '1000000.0000',
        currency: 'VND',
        packages: [
          {
            rentalPackageId: 'pkg-1',
            name: 'Gói 3 tháng',
            durationMonths: 3,
            discountPercent: 5,
            listAmount: '3000000.0000',
            rentAmount: '2850000.0000',
          },
        ],
        storagePlans: [
          {
            id: 'plan-1',
            name: 'Bảo quản tiêu chuẩn',
            monthlyPrice: '100000.0000',
            coveragePercent: 30,
            coverageCap: '3000000.0000',
            isActive: true,
          },
        ],
      },
      isLoading: false,
    }),
    useCreateCheckout: () => ({
      mutateAsync: vi.fn().mockResolvedValue({ id: 'chk-1' }),
      isPending: false,
    }),
    useCheckout: () => ({
      data: {
        id: 'chk-paid-1',
        brandId: 'brand-1',
        stage: 'PAID',
        currency: 'VND',
        totalAmount: '3150000.0000',
        holdExpiresAt: '2026-10-09T15:30:00Z',
        paidAt: '2026-10-09T15:15:00Z',
        cancelledAt: null,
        createdAt: '2026-10-09T15:00:00Z',
        invoices: [
          {
            id: 'rental-invoice-1',
            slotId: 'slot-available-1',
            machineId: 'mch-1',
            brandId: 'brand-1',
            status: 'DRAFT',
            stage: 'AWAITING_STOCK',
            startsAt: '2026-10-09T15:15:00Z',
            endsAt: '2027-01-09T15:15:00Z',
            currency: 'VND',
            totalAmount: '3150000.0000',
            invoiceNumber: 'HD-20261009-ABC123',
            durationMonths: 3,
            paidAt: '2026-10-09T15:15:00Z',
          },
        ],
      },
      isLoading: false,
      refetch: vi.fn(),
    }),
    usePayCheckout: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    useCancelCheckout: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
  };
});

function TestWrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <MemoryRouter>{children}</MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>
  );
}

describe('RentalsPage Component', () => {
  it('hiển thị danh sách hóa đơn và mã HD của thương hiệu', () => {
    render(
      <TestWrapper>
        <RentalsPage />
      </TestWrapper>,
    );

    expect(screen.getByText('HD-20261001-234567')).toBeDefined();
    expect(screen.getByText(/3[.,]300[.,]000/)).toBeDefined();
    expect(screen.getByText('Đang hiệu lực')).toBeDefined();
  });
});

describe('CheckoutDetailPage Component (Task 3)', () => {
  it('hiển thị hóa đơn đã thanh toán thành công và nút Cấu hình slot', async () => {
    const { default: CheckoutDetailPage } = await import('./CheckoutDetailPage');
    render(
      <TestWrapper>
        <CheckoutDetailPage />
      </TestWrapper>,
    );

    // Kiểm tra trạng thái thanh toán thành công
    expect(screen.getByText('Thanh toán thành công!')).toBeDefined();
    // Kiểm tra số hóa đơn được hiển thị
    expect(screen.getByText('HD-20261009-ABC123')).toBeDefined();
    // Kiểm tra nút "Cấu hình slot" hiện diện để Brand Admin bấm chuyển sang cấu hình
    expect(screen.getByText('Cấu hình slot')).toBeDefined();
  });
});

describe('AvailableSlotsPage Component (Task 3)', () => {
  it('hiển thị danh sách slot trống và nút giữ chỗ', async () => {
    const { default: AvailableSlotsPage } = await import('./AvailableSlotsPage');
    render(
      <TestWrapper>
        <AvailableSlotsPage />
      </TestWrapper>,
    );

    expect(screen.getByText(/Slot #1/)).toBeDefined();
    expect(screen.getByText(/Máy Kiosk Vincom/)).toBeDefined();
    expect(screen.getByText('Giữ chỗ và thanh toán')).toBeDefined();
  });
});
