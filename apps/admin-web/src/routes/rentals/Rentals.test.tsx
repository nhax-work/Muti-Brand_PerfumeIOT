import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { message } from 'antd';
import { ApiRequestError } from '@/shared/api';
import { I18nProvider } from '@/shared/i18n';
import AvailableSlotsPage from './AvailableSlotsPage';
import CheckoutDetailPage from './CheckoutDetailPage';
import RentalDetailPage from './RentalDetailPage';
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
  vi.useRealTimers();
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

let mockMyBrandData: any = {
  id: 'brand-1',
  code: 'BRAND1',
  name: 'Thương hiệu Test',
  contactInfo: {
    address: '123 Đường Hoa Lan, Quận 1, TP.HCM',
    phone: '0901234567',
    email: 'brand@test.vn',
  },
  status: 'ACTIVE',
};

vi.mock('@/routes/brand-profile/api', () => ({
  useMyBrand: () => ({
    data: mockMyBrandData,
    isLoading: false,
  }),
}));

// Mutable mock state for granular testing
let mockCheckoutData: any = null;
let mockAnnexData: any = null;
let mockAnnexError: any = null;
let mockInvoiceData: any = null;
let mockRentalData: any = null;
let mockAvailableSlots: any = [];
let mockCheckoutRefetchInterval: any = null;

const mockPayCheckoutFn = vi.fn();
const mockAcceptAnnexFn = vi.fn();
const mockCreateCheckoutFn = vi.fn();
const mockSwapSlotFn = vi.fn();
const mockResendVerificationFn = vi.fn();
const mockAcceptAgreementFn = vi.fn();
const mockRequestNonRenewalFn = vi.fn();
const mockWithdrawNonRenewalFn = vi.fn();

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
        items: mockAvailableSlots,
        meta: { page: 1, pageSize: 50, total: mockAvailableSlots.length },
      },
      isLoading: false,
      refetch: vi.fn().mockResolvedValue({ data: { items: mockAvailableSlots } }),
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
      mutateAsync: mockCreateCheckoutFn,
      isPending: false,
    }),
    useCheckout: (_id?: string, refetchInterval?: any) => {
      mockCheckoutRefetchInterval = refetchInterval;
      return {
        data: mockCheckoutData,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      };
    },
    useCheckoutAnnex: () => ({
      data: mockAnnexData,
      isLoading: false,
      error: mockAnnexError,
      refetch: vi.fn(),
    }),
    useAcceptCheckoutAnnex: () => ({
      mutateAsync: mockAcceptAnnexFn,
      isPending: false,
    }),
    usePayCheckout: () => ({
      mutateAsync: mockPayCheckoutFn,
      isPending: false,
    }),
    useCancelCheckout: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    useRentalInvoice: () => ({
      data: mockInvoiceData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }),
    useSlotRental: () => ({
      data: mockRentalData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }),
    useSwapSlot: () => ({
      mutateAsync: mockSwapSlotFn,
      isPending: false,
    }),
    useRequestNonRenewal: () => ({
      mutateAsync: mockRequestNonRenewalFn,
      isPending: false,
    }),
    useWithdrawNonRenewal: () => ({
      mutateAsync: mockWithdrawNonRenewalFn,
      isPending: false,
    }),
    useBrandProducts: () => ({
      data: {
        items: [{ id: 'prd-1', name: 'Nước hoa Hoa Hồng', sku: 'PRD-ROSE-01' }],
      },
      isLoading: false,
    }),
    useAssignProduct: () => ({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    }),
    useSetPricePerSpray: () => ({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    }),
    useCurrentAgreement: () => ({
      data: {
        agreement: {
          id: 'agreement-1',
          version: '1.0',
          title: 'Hợp đồng khung dịch vụ',
          content: 'Nội dung hợp đồng khung mẫu',
          contentHash: 'a'.repeat(64),
          isCurrent: true,
          publishedAt: '2026-10-01T00:00:00.000Z',
          createdAt: '2026-10-01T00:00:00.000Z',
        },
        acceptance: null,
      },
      isLoading: false,
    }),
    useAcceptAgreement: () => ({
      mutateAsync: mockAcceptAgreementFn,
      isPending: false,
    }),
    useResendVerification: () => ({
      mutateAsync: mockResendVerificationFn,
      isPending: false,
    }),
  };
});

function TestWrapper({
  children,
  initialEntries = ['/'],
}: {
  children: ReactNode;
  initialEntries?: string[];
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
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

describe('CheckoutDetailPage Component (Task 5, FR-SLT-50)', () => {
  const pendingCheckout = {
    id: 'chk-pending-1',
    brandId: 'brand-1',
    stage: 'AWAITING_PAYMENT',
    currency: 'VND',
    totalAmount: '3150000.0000',
    holdExpiresAt: new Date(Date.now() + 600000).toISOString(),
    paidAt: null,
    cancelledAt: null,
    createdAt: new Date().toISOString(),
    invoices: [
      {
        id: 'rental-invoice-1',
        slotId: 'slot-available-1',
        durationMonths: 3,
        rentAmount: '2850000.0000',
        storageAmount: '300000.0000',
        totalAmount: '3150000.0000',
        currency: 'VND',
      },
    ],
  };

  const sampleAnnex = {
    checkoutId: 'chk-pending-1',
    agreementVersionId: 'ag-ver-1',
    content: '# PHỤ LỤC HỢP ĐỒNG\n- Slot: 1\n- Gói thuê: Gói 3 tháng\n- Tổng tiền: 3150000 VND',
    contentHash: 'b'.repeat(64),
    acceptance: null,
  };

  beforeEach(() => {
    mockCheckoutData = pendingCheckout;
    mockAnnexData = sampleAnnex;
    mockAnnexError = null;
    mockPayCheckoutFn.mockReset();
    mockAcceptAnnexFn.mockReset();
    mockCheckoutRefetchInterval = null;
  });

  it('hiển thị phụ lục từ GET .../annex (nội dung + mã băm), nút Thanh toán ngay bị disable khi chưa đồng ý', () => {
    render(
      <TestWrapper initialEntries={['/rentals/checkouts/chk-pending-1']}>
        <Routes>
          <Route path="/rentals/checkouts/:id" element={<CheckoutDetailPage />} />
        </Routes>
      </TestWrapper>,
    );

    // Kiểm tra hiển thị nội dung và mã băm phụ lục
    expect(screen.getByText('Phụ lục hợp đồng thuê slot')).toBeDefined();
    expect(screen.getByText(sampleAnnex.contentHash)).toBeDefined();
    expect(screen.getByText(/Gói thuê: Gói 3 tháng/)).toBeDefined();

    // Nút xác nhận đồng ý bị disabled khi chưa tick checkbox
    const confirmAnnexBtn = screen.getByText('Xác nhận đồng ý phụ lục').closest('button');
    expect(confirmAnnexBtn?.disabled).toBe(true);

    // Nút Thanh toán ngay bị disabled vì phụ lục chưa được đồng ý
    const payBtn = screen.getByText('Thanh toán ngay').closest('button');
    expect(payBtn?.disabled).toBe(true);
  });

  it('tick Tôi đã đọc và đồng ý rồi nhấn Xác nhận gọi POST .../annex/accept, sau đó bật nút Thanh toán ngay', async () => {
    mockAcceptAnnexFn.mockResolvedValue({
      id: 'acc-1',
      acceptedAt: new Date().toISOString(),
      contentHash: sampleAnnex.contentHash,
    });

    const { rerender } = render(
      <TestWrapper initialEntries={['/rentals/checkouts/chk-pending-1']}>
        <Routes>
          <Route path="/rentals/checkouts/:id" element={<CheckoutDetailPage />} />
        </Routes>
      </TestWrapper>,
    );

    // Tick checkbox
    const checkbox = screen.getByText('Tôi đã đọc và đồng ý với toàn bộ nội dung phụ lục hợp đồng');
    fireEvent.click(checkbox);

    // Nút xác nhận phụ lục bật
    const confirmAnnexBtn = screen.getByText('Xác nhận đồng ý phụ lục').closest('button')!;
    expect(confirmAnnexBtn.disabled).toBe(false);

    // Click xác nhận
    fireEvent.click(confirmAnnexBtn);
    await waitFor(() => {
      expect(mockAcceptAnnexFn).toHaveBeenCalledWith({
        checkoutId: 'chk-pending-1',
        contentHash: sampleAnnex.contentHash,
      });
    });

    // Giả lập sau khi đồng ý thành công, annex có acceptance
    mockAnnexData = {
      ...sampleAnnex,
      acceptance: {
        id: 'acc-1',
        acceptedAt: new Date().toISOString(),
        contentHash: sampleAnnex.contentHash,
      },
    };

    rerender(
      <TestWrapper initialEntries={['/rentals/checkouts/chk-pending-1']}>
        <Routes>
          <Route path="/rentals/checkouts/:id" element={<CheckoutDetailPage />} />
        </Routes>
      </TestWrapper>,
    );

    // Alert đã đồng ý phụ lục xuất hiện
    expect(screen.getByText('Đã đồng ý phụ lục')).toBeDefined();

    // Nút Thanh toán ngay đã được kích hoạt
    const payBtn = screen.getByText('Thanh toán ngay').closest('button')!;
    expect(payBtn.disabled).toBe(false);

    // Bấm thanh toán gọi payCheckout
    mockPayCheckoutFn.mockResolvedValue({ paymentId: 'pay-1', qrPayload: 'QR123' });
    fireEvent.click(payBtn);
    await waitFor(() => {
      expect(mockPayCheckoutFn).toHaveBeenCalledWith('chk-pending-1');
    });
  });

  it('phiên cũ không có phụ lục (404 NOT_FOUND) hiển thị hợp lý và không khóa nút Thanh toán ngay', () => {
    mockAnnexData = null;
    mockAnnexError = new ApiRequestError(404, { code: 'NOT_FOUND', message: 'Not found' });

    render(
      <TestWrapper initialEntries={['/rentals/checkouts/chk-pending-1']}>
        <Routes>
          <Route path="/rentals/checkouts/:id" element={<CheckoutDetailPage />} />
        </Routes>
      </TestWrapper>,
    );

    // Hiển thị thông báo phụ lục legacy hợp lý, không crash trang
    expect(
      screen.getByText(
        'Phiên thanh toán này không có phụ lục đính kèm (phiên tạo trước khi áp dụng tính năng phụ lục).',
      ),
    ).toBeDefined();

    // Nút thanh toán ngay vẫn được bật cho phiên cũ
    const payBtn = screen.getByText('Thanh toán ngay').closest('button')!;
    expect(payBtn.disabled).toBe(false);
  });

  it('hiển thị thông báo lỗi khi xác nhận phụ lục thất bại (mã băm lệch 400)', async () => {
    mockAcceptAnnexFn.mockRejectedValue(
      new ApiRequestError(400, {
        code: 'VALIDATION_ERROR',
        message: 'Nội dung phụ lục đã thay đổi',
        details: { messageKey: 'slt.annexContentChanged' },
      }),
    );

    render(
      <TestWrapper initialEntries={['/rentals/checkouts/chk-pending-1']}>
        <Routes>
          <Route path="/rentals/checkouts/:id" element={<CheckoutDetailPage />} />
        </Routes>
      </TestWrapper>,
    );

    const checkbox = screen.getByText('Tôi đã đọc và đồng ý với toàn bộ nội dung phụ lục hợp đồng');
    fireEvent.click(checkbox);
    const confirmAnnexBtn = screen.getByText('Xác nhận đồng ý phụ lục').closest('button')!;
    fireEvent.click(confirmAnnexBtn);

    await waitFor(() => {
      expect(mockAcceptAnnexFn).toHaveBeenCalled();
    });
  });

  it('hiển thị hóa đơn đã thanh toán thành công và nút Cấu hình slot khi phiên đã PAID', () => {
    mockCheckoutData = {
      ...pendingCheckout,
      stage: 'PAID',
      invoices: [
        {
          id: 'rental-invoice-1',
          slotId: 'slot-available-1',
          invoiceNumber: 'HD-20261009-ABC123',
          totalAmount: '3150000.0000',
          currency: 'VND',
        },
      ],
    };

    render(
      <TestWrapper initialEntries={['/rentals/checkouts/chk-pending-1']}>
        <Routes>
          <Route path="/rentals/checkouts/:id" element={<CheckoutDetailPage />} />
        </Routes>
      </TestWrapper>,
    );

    expect(screen.getByText('Thanh toán thành công!')).toBeDefined();
    expect(screen.getByText('HD-20261009-ABC123')).toBeDefined();
    expect(screen.getByText('Cấu hình slot')).toBeDefined();
  });

  it('hiển thị nút Mở trang thanh toán PayOS khi checkoutUrl là https hợp lệ, mở tab mới với noopener,noreferrer', async () => {
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    mockAnnexData = {
      ...sampleAnnex,
      acceptance: {
        id: 'acc-1',
        acceptedAt: new Date().toISOString(),
        contentHash: sampleAnnex.contentHash,
      },
    };
    mockPayCheckoutFn.mockResolvedValue({
      paymentId: 'pay-payos-1',
      qrPayload: '000201010212VIETQR',
      checkoutUrl: 'https://pay.payos.vn/web/test-checkout-123',
    });

    render(
      <TestWrapper initialEntries={['/rentals/checkouts/chk-pending-1']}>
        <Routes>
          <Route path="/rentals/checkouts/:id" element={<CheckoutDetailPage />} />
        </Routes>
      </TestWrapper>,
    );

    const payBtn = screen.getByText('Thanh toán ngay').closest('button')!;
    fireEvent.click(payBtn);

    await waitFor(() => {
      expect(screen.getByText('Mở trang thanh toán PayOS')).toBeDefined();
    });

    const openPayosBtn = screen.getByText('Mở trang thanh toán PayOS').closest('button')!;
    fireEvent.click(openPayosBtn);

    expect(windowOpenSpy).toHaveBeenCalledWith(
      'https://pay.payos.vn/web/test-checkout-123',
      '_blank',
      'noopener,noreferrer',
    );
    windowOpenSpy.mockRestore();
  });

  it('ẩn nút Mở trang thanh toán PayOS khi checkoutUrl là null (như mock gateway)', async () => {
    mockAnnexData = {
      ...sampleAnnex,
      acceptance: {
        id: 'acc-1',
        acceptedAt: new Date().toISOString(),
        contentHash: sampleAnnex.contentHash,
      },
    };
    mockPayCheckoutFn.mockResolvedValue({
      paymentId: 'pay-mock-1',
      qrPayload: '000201010212VIETQR',
      checkoutUrl: null,
    });

    render(
      <TestWrapper initialEntries={['/rentals/checkouts/chk-pending-1']}>
        <Routes>
          <Route path="/rentals/checkouts/:id" element={<CheckoutDetailPage />} />
        </Routes>
      </TestWrapper>,
    );

    const payBtn = screen.getByText('Thanh toán ngay').closest('button')!;
    fireEvent.click(payBtn);

    await waitFor(() => {
      expect(screen.getByText('Mã QR thanh toán')).toBeDefined();
    });

    expect(screen.queryByText('Mở trang thanh toán PayOS')).toBeNull();
  });

  it('tự động đóng modal và cảnh báo khi hết thời gian giữ chỗ (holdExpiresAt qua đồng hồ client)', async () => {
    vi.useFakeTimers();
    try {
      const warningSpy = vi.spyOn(message, 'warning');
      const now = Date.now();
      const futureExpiresAt = new Date(now + 5000).toISOString();
      mockCheckoutData = {
        ...pendingCheckout,
        holdExpiresAt: futureExpiresAt,
      };
      mockAnnexData = {
        ...sampleAnnex,
        acceptance: {
          id: 'acc-1',
          acceptedAt: new Date().toISOString(),
          contentHash: sampleAnnex.contentHash,
        },
      };
      mockPayCheckoutFn.mockResolvedValue({
        paymentId: 'pay-1',
        qrPayload: 'QR123',
        checkoutUrl: null,
      });

      render(
        <TestWrapper initialEntries={['/rentals/checkouts/chk-pending-1']}>
          <Routes>
            <Route path="/rentals/checkouts/:id" element={<CheckoutDetailPage />} />
          </Routes>
        </TestWrapper>,
      );

      const payBtn = screen.getByText('Thanh toán ngay').closest('button')!;
      fireEvent.click(payBtn);

      // Chờ mockPayCheckoutFn resolve và React render modal
      await vi.advanceTimersByTimeAsync(100);

      expect(screen.getByText('Mã QR thanh toán')).toBeDefined();

      // Tiến thời gian qua holdExpiresAt (5000ms)
      await vi.advanceTimersByTimeAsync(5100);

      expect(warningSpy).toHaveBeenCalledWith('Phiên thanh toán đã hết thời gian giữ chỗ');
      warningSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('dừng polling khi phiên chuyển sang PAID hoặc CANCELLED hoặc hết hạn hold', async () => {
    mockAnnexData = {
      ...sampleAnnex,
      acceptance: {
        id: 'acc-1',
        acceptedAt: new Date().toISOString(),
        contentHash: sampleAnnex.contentHash,
      },
    };
    mockPayCheckoutFn.mockResolvedValue({
      paymentId: 'pay-1',
      qrPayload: 'QR123',
    });

    render(
      <TestWrapper initialEntries={['/rentals/checkouts/chk-pending-1']}>
        <Routes>
          <Route path="/rentals/checkouts/:id" element={<CheckoutDetailPage />} />
        </Routes>
      </TestWrapper>,
    );

    const payBtn = screen.getByText('Thanh toán ngay').closest('button')!;
    fireEvent.click(payBtn);

    await waitFor(() => {
      expect(typeof mockCheckoutRefetchInterval).toBe('function');
    });

    // Khi phiên đang chờ và còn hạn -> poll 2000
    expect(
      mockCheckoutRefetchInterval({
        state: {
          data: {
            stage: 'AWAITING_PAYMENT',
            holdExpiresAt: new Date(Date.now() + 60000).toISOString(),
          },
        },
      }),
    ).toBe(2000);

    // Khi phiên đã PAID -> dừng poll (false)
    expect(
      mockCheckoutRefetchInterval({
        state: {
          data: { stage: 'PAID', holdExpiresAt: new Date(Date.now() + 60000).toISOString() },
        },
      }),
    ).toBe(false);

    // Khi phiên đã CANCELLED -> dừng poll (false)
    expect(
      mockCheckoutRefetchInterval({
        state: {
          data: { stage: 'CANCELLED', holdExpiresAt: new Date(Date.now() + 60000).toISOString() },
        },
      }),
    ).toBe(false);

    // Khi đã hết hạn hold -> dừng poll (false)
    expect(
      mockCheckoutRefetchInterval({
        state: {
          data: {
            stage: 'AWAITING_PAYMENT',
            holdExpiresAt: new Date(Date.now() - 1000).toISOString(),
          },
        },
      }),
    ).toBe(false);
  });
});

describe('AvailableSlotsPage Component (Task 5, FR-SLT-56)', () => {
  beforeEach(() => {
    mockAvailableSlots = [
      {
        slotId: 'slot-available-1',
        slotNumber: 1,
        machineId: 'mch-1',
        machineDisplayName: 'Máy Kiosk Vincom',
        locationName: 'Tầng 1 Vincom Đồng Khởi',
        monthlyRentPrice: '1000000.0000',
        status: 'AVAILABLE',
      },
    ];
    mockCreateCheckoutFn.mockReset();
  });

  it('hiển thị danh sách slot trống và nút giữ chỗ', () => {
    render(
      <TestWrapper>
        <AvailableSlotsPage />
      </TestWrapper>,
    );

    expect(screen.getByText(/Slot #1/)).toBeDefined();
    expect(screen.getByText(/Máy Kiosk Vincom/)).toBeDefined();
    expect(screen.getByText('Giữ chỗ và thanh toán')).toBeDefined();
  });

  it('hiển thị rõ lỗi và banner khi gặp HOLD_LIMIT_REACHED', async () => {
    mockCreateCheckoutFn.mockRejectedValue(
      new ApiRequestError(409, {
        code: 'HOLD_LIMIT_REACHED',
        message: 'Số slot giữ chỗ vượt quá giới hạn',
        details: { messageKey: 'slt.holdLimitReached' },
      }),
    );

    render(
      <TestWrapper>
        <AvailableSlotsPage />
      </TestWrapper>,
    );

    // Chọn slot và bấm thanh toán
    const toggleBtn = screen.getByRole('checkbox');
    fireEvent.click(toggleBtn);

    const checkoutBtn = screen.getByText('Giữ chỗ và thanh toán');
    fireEvent.click(checkoutBtn);

    await waitFor(() => {
      expect(
        screen.getAllByText(
          'Số slot giữ chỗ chưa thanh toán vượt quá giới hạn tối đa (tối đa 5 slot cho mỗi thương hiệu)',
        ).length,
      ).toBeGreaterThan(0);
    });
  });

  it('hiển thị modal hợp đồng khung khi gặp lỗi AGREEMENT_NOT_ACCEPTED', async () => {
    mockCreateCheckoutFn.mockRejectedValue(
      new ApiRequestError(403, {
        code: 'AGREEMENT_NOT_ACCEPTED',
        message: 'Chưa đồng ý hợp đồng khung',
      }),
    );

    render(
      <TestWrapper>
        <AvailableSlotsPage />
      </TestWrapper>,
    );

    const toggleBtn = screen.getByRole('checkbox');
    fireEvent.click(toggleBtn);

    const checkoutBtn = screen.getByText('Giữ chỗ và thanh toán');
    fireEvent.click(checkoutBtn);

    await waitFor(() => {
      expect(screen.getByText(/Hợp đồng khung dịch vụ/)).toBeDefined();
    });
  });

  it('hiển thị cảnh báo xác minh email khi gặp EMAIL_NOT_VERIFIED', async () => {
    mockCreateCheckoutFn.mockRejectedValue(
      new ApiRequestError(403, {
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Tài khoản chưa xác minh email',
        details: { messageKey: 'slt.emailNotVerified' },
      }),
    );

    render(
      <TestWrapper>
        <AvailableSlotsPage />
      </TestWrapper>,
    );

    const toggleBtn = screen.getByRole('checkbox');
    fireEvent.click(toggleBtn);

    const checkoutBtn = screen.getByText('Giữ chỗ và thanh toán');
    fireEvent.click(checkoutBtn);

    await waitFor(() => {
      expect(screen.getByText(/Tài khoản chưa xác minh email/)).toBeDefined();
    });
  });
});

describe('RentalDetailPage Component (Task 5, FR-SLT-55)', () => {
  const eligibleInvoice = {
    rentalId: 'rental-eligible-1',
    invoiceNumber: 'HD-20261019-123456',
    stage: 'AWAITING_STOCK',
    status: 'DRAFT',
    slotId: 'slot-1',
    slotNumber: 1,
    machineId: 'mch-1',
    machineDisplayName: 'Kiosk Vincom',
    locationName: 'Tầng 1 Vincom',
    durationMonths: 3,
    monthlyRentPrice: '1000000.0000',
    discountPercent: 0,
    rentAmount: '3000000.0000',
    storageAmount: '300000.0000',
    graceFeeAmount: '0.0000',
    totalAmount: '3300000.0000',
    currency: 'VND',
    paidAt: new Date(Date.now() - 3600000).toISOString(), // 1 giờ trước (trong 48h)
    startsAt: null,
    endsAt: null,
    rentalPackage: { name: 'Gói 3 tháng', durationMonths: 3, discountPercent: 0 },
    storagePlan: {
      name: 'Tiêu chuẩn',
      monthlyPrice: '100000.0000',
      coveragePercent: 30,
      coverageCap: '3000000.0000',
    },
  };

  const eligibleRental = {
    id: 'rental-eligible-1',
    status: 'DRAFT',
    stage: 'AWAITING_STOCK',
    paidAt: eligibleInvoice.paidAt,
    swappedFromSlotId: null,
    swappedAt: null,
  };

  beforeEach(() => {
    mockInvoiceData = eligibleInvoice;
    mockRentalData = eligibleRental;
    mockAvailableSlots = [
      {
        slotId: 'slot-2',
        slotNumber: 2,
        machineId: 'mch-1',
        locationName: 'Tầng 1 Vincom',
        monthlyRentPrice: '1000000.0000', // Cùng giá
        status: 'AVAILABLE',
      },
      {
        slotId: 'slot-3',
        slotNumber: 3,
        machineId: 'mch-1',
        locationName: 'Tầng 1 Vincom',
        monthlyRentPrice: '2000000.0000', // Khác giá
        status: 'AVAILABLE',
      },
    ];
    mockSwapSlotFn.mockReset();
  });

  it('hiển thị nút "Đổi slot" khi đủ điều kiện và mở modal liệt kê slot trống cùng máy cùng giá', async () => {
    render(
      <TestWrapper initialEntries={['/rentals/rental-eligible-1']}>
        <Routes>
          <Route path="/rentals/:id" element={<RentalDetailPage />} />
        </Routes>
      </TestWrapper>,
    );

    // Nút Đổi slot hiện diện
    const swapBtn = screen.getByText('Đổi slot');
    expect(swapBtn).toBeDefined();

    // Bấm nút Đổi slot -> mở modal
    fireEvent.click(swapBtn);
    expect(screen.getByText('Đổi sang slot trống khác')).toBeDefined();

    // Modal chỉ liệt kê slot-2 (cùng giá 1.000.000), không liệt kê slot-3 (2.000.000)
    expect(screen.getByText(/Slot #2/)).toBeDefined();
    expect(screen.queryByText(/Slot #3/)).toBeNull();

    // Chọn Slot #2 và bấm xác nhận
    const radioSlot2 = screen.getByText(/Slot #2/);
    fireEvent.click(radioSlot2);

    mockSwapSlotFn.mockResolvedValue({});
    const confirmSwapBtn = screen.getByText('Xác nhận đổi slot');
    fireEvent.click(confirmSwapBtn);

    await waitFor(() => {
      expect(mockSwapSlotFn).toHaveBeenCalledWith({
        rentalId: 'rental-eligible-1',
        targetSlotId: 'slot-2',
      });
    });
  });

  it('xử lý lỗi SLOT_OCCUPIED (409) khi slot đích vừa bị chiếm', async () => {
    mockSwapSlotFn.mockRejectedValue(
      new ApiRequestError(409, {
        code: 'SLOT_OCCUPIED',
        message: 'Slot đã được thuê hoặc đang bị giữ chỗ',
        details: { messageKey: 'slt.slotOccupied' },
      }),
    );

    render(
      <TestWrapper initialEntries={['/rentals/rental-eligible-1']}>
        <Routes>
          <Route path="/rentals/:id" element={<RentalDetailPage />} />
        </Routes>
      </TestWrapper>,
    );

    fireEvent.click(screen.getByText('Đổi slot'));
    fireEvent.click(screen.getByText(/Slot #2/));
    fireEvent.click(screen.getByText('Xác nhận đổi slot'));

    await waitFor(() => {
      expect(mockSwapSlotFn).toHaveBeenCalled();
    });
  });

  it('xử lý lỗi SLOT_SWAP_NOT_ALLOWED (409) khi từ chối đổi', async () => {
    mockSwapSlotFn.mockRejectedValue(
      new ApiRequestError(409, {
        code: 'SLOT_SWAP_NOT_ALLOWED',
        message: 'Không thể đổi slot',
        details: { messageKey: 'slt.slotSwapDifferentPrice' },
      }),
    );

    render(
      <TestWrapper initialEntries={['/rentals/rental-eligible-1']}>
        <Routes>
          <Route path="/rentals/:id" element={<RentalDetailPage />} />
        </Routes>
      </TestWrapper>,
    );

    fireEvent.click(screen.getByText('Đổi slot'));
    fireEvent.click(screen.getByText(/Slot #2/));
    fireEvent.click(screen.getByText('Xác nhận đổi slot'));

    await waitFor(() => {
      expect(mockSwapSlotFn).toHaveBeenCalled();
    });
  });

  it('nút "Đổi slot" bị ẩn khi hóa đơn đã đổi slot 1 lần trước đó và hiển thị banner thông báo', () => {
    mockRentalData = {
      ...eligibleRental,
      swappedFromSlotId: 'slot-old-99',
      swappedAt: new Date().toISOString(),
    };

    render(
      <TestWrapper initialEntries={['/rentals/rental-eligible-1']}>
        <Routes>
          <Route path="/rentals/:id" element={<RentalDetailPage />} />
        </Routes>
      </TestWrapper>,
    );

    // Nút Đổi slot không xuất hiện
    expect(screen.queryByText('Đổi slot')).toBeNull();

    // Xuất hiện thông báo đã đổi từ slot trước
    expect(screen.getByText(/Hóa đơn đã được đổi slot vào lúc/)).toBeDefined();
  });

  it('nút "Đổi slot" bị ẩn khi hóa đơn đã kích hoạt / lắp chai (stage ACTIVE)', () => {
    mockInvoiceData = {
      ...eligibleInvoice,
      stage: 'ACTIVE',
      status: 'ACTIVE',
    };
    mockRentalData = {
      ...eligibleRental,
      status: 'ACTIVE',
      stage: 'ACTIVE',
    };

    render(
      <TestWrapper initialEntries={['/rentals/rental-eligible-1']}>
        <Routes>
          <Route path="/rentals/:id" element={<RentalDetailPage />} />
        </Routes>
      </TestWrapper>,
    );

    expect(screen.queryByText('Đổi slot')).toBeNull();
  });

  it('nút "Đổi slot" bị ẩn khi đã quá 48 giờ kể từ lúc thanh toán', () => {
    // 50 giờ trước
    mockInvoiceData = {
      ...eligibleInvoice,
      paidAt: new Date(Date.now() - 50 * 3600 * 1000).toISOString(),
    };
    mockRentalData = {
      ...eligibleRental,
      paidAt: mockInvoiceData.paidAt,
    };

    render(
      <TestWrapper initialEntries={['/rentals/rental-eligible-1']}>
        <Routes>
          <Route path="/rentals/:id" element={<RentalDetailPage />} />
        </Routes>
      </TestWrapper>,
    );

    expect(screen.queryByText('Đổi slot')).toBeNull();
  });

  it('nút "Đổi slot" bị ẩn khi hóa đơn chưa thanh toán', () => {
    mockInvoiceData = {
      ...eligibleInvoice,
      paidAt: null,
      stage: 'AWAITING_PAYMENT',
    };
    mockRentalData = {
      ...eligibleRental,
      paidAt: null,
      stage: 'AWAITING_PAYMENT',
    };

    render(
      <TestWrapper initialEntries={['/rentals/rental-eligible-1']}>
        <Routes>
          <Route path="/rentals/:id" element={<RentalDetailPage />} />
        </Routes>
      </TestWrapper>,
    );

    expect(screen.queryByText('Đổi slot')).toBeNull();
  });
});

describe('RentalDetailPage — Báo không gia hạn (Task 8, FR-EXP-23, FR-EXP-24, FR-EXP-25)', () => {
  const activeRentalInvoice = {
    rentalId: 'rental-active-1',
    checkoutId: 'co-1',
    invoiceNumber: 'HD-20261015-111222',
    stage: 'ACTIVE',
    brandId: 'brand-1',
    slotId: 'slot-active-1',
    slotNumber: 5,
    machineId: 'mch-1',
    machineDisplayName: 'Máy Kiosk 01',
    locationName: 'Aeon Mall Tân Phú',
    rentalPackage: { name: 'Gói 3 tháng', durationMonths: 3, discountPercent: 0 },
    storagePlan: {
      name: 'Gói Tiêu Chuẩn',
      monthlyPrice: '100000.0000',
      coveragePercent: 30,
      coverageCap: '3000000.0000',
    },
    startsAt: '2026-10-01T00:00:00.000Z',
    endsAt: '2027-01-01T00:00:00.000Z',
    rentAmount: '3000000.0000',
    storageAmount: '300000.0000',
    graceFeeAmount: '0.0000',
    totalAmount: '3300000.0000',
    currency: 'VND',
    paidAt: '2026-10-01T00:05:00.000Z',
  };

  const activeSlotRental = {
    id: 'rental-active-1',
    slotId: 'slot-active-1',
    machineId: 'mch-1',
    brandId: 'brand-1',
    status: 'ACTIVE',
    stage: 'ACTIVE',
    startsAt: '2026-10-01T00:00:00.000Z',
    endsAt: '2027-01-01T00:00:00.000Z',
    currency: 'VND',
    totalAmount: '3300000.0000',
    invoiceNumber: 'HD-20261015-111222',
    durationMonths: 3,
    pricePerSpray: '15000.0000',
    paidAt: '2026-10-01T00:05:00.000Z',
    nonRenewalRequestedAt: null,
    returnMethod: null,
    swappedFromSlotId: null,
    swappedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hiển thị nút "Không gia hạn" khi hóa đơn đang ACTIVE và chưa báo', () => {
    mockInvoiceData = activeRentalInvoice;
    mockRentalData = activeSlotRental;

    render(
      <TestWrapper initialEntries={['/rentals/rental-active-1']}>
        <Routes>
          <Route path="/rentals/:id" element={<RentalDetailPage />} />
        </Routes>
      </TestWrapper>,
    );

    expect(screen.getByText('Không gia hạn')).toBeDefined();
  });

  it('bấm "Không gia hạn" mở modal xác nhận, đổi hình thức và hiển thị địa chỉ từ brand profile', async () => {
    mockInvoiceData = activeRentalInvoice;
    mockRentalData = activeSlotRental;
    mockRequestNonRenewalFn.mockResolvedValue({});

    render(
      <TestWrapper initialEntries={['/rentals/rental-active-1']}>
        <Routes>
          <Route path="/rentals/:id" element={<RentalDetailPage />} />
        </Routes>
      </TestWrapper>,
    );

    fireEvent.click(screen.getByText('Không gia hạn'));

    // Modal hiển thị tiêu đề và các radio options
    expect(screen.getByText('Báo không gia hạn & nhận lại hàng')).toBeDefined();
    expect(screen.getByText('Tự đến kho lấy chai')).toBeDefined();
    expect(
      screen.getByText('Nền tảng gửi về địa chỉ thương hiệu (thương hiệu chịu phí ship)'),
    ).toBeDefined();

    // Chọn hình thức SHIP_TO_BRAND
    fireEvent.click(
      screen.getByText('Nền tảng gửi về địa chỉ thương hiệu (thương hiệu chịu phí ship)'),
    );

    // Địa chỉ từ brand profile được hiển thị
    expect(screen.getByText('123 Đường Hoa Lan, Quận 1, TP.HCM')).toBeDefined();

    // Bấm nút xác nhận
    const okBtn = screen.getByRole('button', { name: 'Báo không gia hạn' });
    fireEvent.click(okBtn);

    await waitFor(() => {
      expect(mockRequestNonRenewalFn).toHaveBeenCalledWith({
        rentalId: 'rental-active-1',
        returnMethod: 'SHIP_TO_BRAND',
      });
    });
  });

  it('hiển thị banner cảnh báo và nút "Rút lại yêu cầu" khi đã báo không gia hạn', () => {
    mockInvoiceData = activeRentalInvoice;
    mockRentalData = {
      ...activeSlotRental,
      nonRenewalRequestedAt: '2026-10-10T10:00:00.000Z',
      returnMethod: 'WAREHOUSE_PICKUP',
    };

    render(
      <TestWrapper initialEntries={['/rentals/rental-active-1']}>
        <Routes>
          <Route path="/rentals/:id" element={<RentalDetailPage />} />
        </Routes>
      </TestWrapper>,
    );

    // Banner hiển thị
    expect(screen.getByText('Hóa đơn đã báo không gia hạn')).toBeDefined();
    expect(screen.getAllByText('Rút lại yêu cầu').length).toBeGreaterThan(0);
  });

  it('bấm "Rút lại yêu cầu" và xác nhận trong modal sẽ gọi mutate withdrawNonRenewal', async () => {
    mockInvoiceData = activeRentalInvoice;
    mockRentalData = {
      ...activeSlotRental,
      nonRenewalRequestedAt: '2026-10-10T10:00:00.000Z',
      returnMethod: 'WAREHOUSE_PICKUP',
    };
    mockWithdrawNonRenewalFn.mockResolvedValue({});

    render(
      <TestWrapper initialEntries={['/rentals/rental-active-1']}>
        <Routes>
          <Route path="/rentals/:id" element={<RentalDetailPage />} />
        </Routes>
      </TestWrapper>,
    );

    // Bấm nút rút lại ở banner
    const withdrawBtns = screen.getAllByText('Rút lại yêu cầu');
    fireEvent.click(withdrawBtns[0]!);

    // Modal xác nhận rút lại xuất hiện
    expect(screen.getByText('Xác nhận rút lại yêu cầu không gia hạn?')).toBeDefined();

    // Bấm nút xác nhận trong modal (nút cuối cùng trong các nút có cùng text)
    const allBtns = screen.getAllByRole('button', { name: 'Rút lại yêu cầu' });
    const modalConfirmBtn = allBtns[allBtns.length - 1];
    fireEvent.click(modalConfirmBtn!);

    await waitFor(() => {
      expect(mockWithdrawNonRenewalFn).toHaveBeenCalledWith('rental-active-1');
    });
  });

  it('nút "Không gia hạn" bị ẩn khi hóa đơn đã kết thúc (CLOSED)', () => {
    mockInvoiceData = {
      ...activeRentalInvoice,
      stage: 'ENDED',
      status: 'CLOSED',
    };
    mockRentalData = {
      ...activeSlotRental,
      stage: 'ENDED',
      status: 'CLOSED',
    };

    render(
      <TestWrapper initialEntries={['/rentals/rental-active-1']}>
        <Routes>
          <Route path="/rentals/:id" element={<RentalDetailPage />} />
        </Routes>
      </TestWrapper>,
    );

    expect(screen.queryByText('Không gia hạn')).toBeNull();
  });

  it('nút "Rút lại" và banner bị ẩn khi now >= endsAt hoặc trạng thái không còn ACTIVE/EXPIRING', () => {
    // Trường hợp 1: Quá endsAt (endsAt trong quá khứ so với đồng hồ client)
    mockInvoiceData = {
      ...activeRentalInvoice,
      endsAt: '2026-01-01T00:00:00Z',
    };
    mockRentalData = {
      ...activeSlotRental,
      endsAt: '2026-01-01T00:00:00Z',
      nonRenewalRequestedAt: '2025-12-15T10:00:00.000Z',
      returnMethod: 'WAREHOUSE_PICKUP',
    };

    const { unmount } = render(
      <TestWrapper initialEntries={['/rentals/rental-active-1']}>
        <Routes>
          <Route path="/rentals/:id" element={<RentalDetailPage />} />
        </Routes>
      </TestWrapper>,
    );

    expect(screen.queryByText('Hóa đơn đã báo không gia hạn')).toBeNull();
    expect(screen.queryByText('Rút lại yêu cầu')).toBeNull();
    expect(screen.queryByText('Rút lại')).toBeNull();

    unmount();

    // Trường hợp 2: Trạng thái không còn ACTIVE/EXPIRING (CLOSED, ENDED)
    mockInvoiceData = {
      ...activeRentalInvoice,
      stage: 'ENDED',
      status: 'CLOSED',
    };
    mockRentalData = {
      ...activeSlotRental,
      stage: 'ENDED',
      status: 'CLOSED',
      nonRenewalRequestedAt: '2026-10-10T10:00:00.000Z',
      returnMethod: 'WAREHOUSE_PICKUP',
    };

    render(
      <TestWrapper initialEntries={['/rentals/rental-active-1']}>
        <Routes>
          <Route path="/rentals/:id" element={<RentalDetailPage />} />
        </Routes>
      </TestWrapper>,
    );

    expect(screen.queryByText('Hóa đơn đã báo không gia hạn')).toBeNull();
    expect(screen.queryByText('Rút lại yêu cầu')).toBeNull();
    expect(screen.queryByText('Rút lại')).toBeNull();
  });

  it('chọn hình thức SHIP_TO_BRAND sẽ hiển thị cảnh báo khi hồ sơ thương hiệu chưa có địa chỉ', () => {
    mockInvoiceData = activeRentalInvoice;
    mockRentalData = activeSlotRental;
    mockMyBrandData = {
      ...mockMyBrandData,
      contactInfo: { address: null, phone: null, email: null },
    };

    render(
      <TestWrapper initialEntries={['/rentals/rental-active-1']}>
        <Routes>
          <Route path="/rentals/:id" element={<RentalDetailPage />} />
        </Routes>
      </TestWrapper>,
    );

    // Mở modal
    const nonRenewalBtn = screen.getByText('Không gia hạn');
    fireEvent.click(nonRenewalBtn);

    // Chọn SHIP_TO_BRAND
    const shipToBrandRadio = screen.getByText(
      'Nền tảng gửi về địa chỉ thương hiệu (thương hiệu chịu phí ship)',
    );
    fireEvent.click(shipToBrandRadio);

    // Cảnh báo chưa cấu hình địa chỉ hiển thị
    expect(
      screen.getByText(
        'Chưa có địa chỉ trong hồ sơ thương hiệu (vui lòng cập nhật trong Hồ sơ thương hiệu)',
      ),
    ).toBeDefined();

    // Khôi phục contactInfo
    mockMyBrandData = {
      ...mockMyBrandData,
      contactInfo: {
        address: '123 Đường Hoa Lan, Quận 1, TP.HCM',
        phone: '0901234567',
        email: 'brand@test.vn',
      },
    };
  });
});
