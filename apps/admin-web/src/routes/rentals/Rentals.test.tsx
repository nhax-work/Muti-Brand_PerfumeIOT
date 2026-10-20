import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

// Mutable mock state for granular testing
let mockCheckoutData: any = null;
let mockAnnexData: any = null;
let mockAnnexError: any = null;
let mockInvoiceData: any = null;
let mockRentalData: any = null;
let mockAvailableSlots: any = [];

const mockPayCheckoutFn = vi.fn();
const mockAcceptAnnexFn = vi.fn();
const mockCreateCheckoutFn = vi.fn();
const mockSwapSlotFn = vi.fn();
const mockResendVerificationFn = vi.fn();
const mockAcceptAgreementFn = vi.fn();

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
    useCheckout: () => ({
      data: mockCheckoutData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }),
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
    expect(screen.getByText(/Hóa đơn đã được đổi từ Slot/)).toBeDefined();
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
