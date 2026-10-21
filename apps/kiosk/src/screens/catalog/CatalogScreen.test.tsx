import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, recordKioskInteraction, useKioskCatalog } from '@/shared/api';
import { I18nProvider } from '@/shared/i18n';
import { KioskSessionProvider } from '@/shared/session';
import CatalogScreen from './CatalogScreen';

const mockNavigate = vi.fn();
const mockMutate = vi.fn();
const mockReset = vi.fn();
let mockCreated: unknown = undefined;
type CancelCallbacks = { onSuccess?: () => void; onError?: (error: unknown) => void };
let mockCancelError: unknown = null;
let mockStatus: unknown = undefined;
let mockCreateError: unknown = null;
const mockRemember = vi.fn();
const mockForget = vi.fn();
const mockCancelOrphaned = vi.fn();
/** Mặc định máy chủ hủy thành công; test đổi bằng `mockCancelError`. */
const mockCancel = vi.fn((_orderId: string, callbacks?: CancelCallbacks) => {
  if (mockCancelError) callbacks?.onError?.(mockCancelError);
  else callbacks?.onSuccess?.();
});
let mockShowDevTools = true;

vi.mock('@/shared/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/config')>();
  return {
    ...actual,
    config: {
      ...actual.config,
      get showDevTools() {
        return mockShowDevTools;
      },
    },
  };
});

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({}),
  useLocation: () => ({ pathname: '/' }),
}));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return {
    ...actual,
    useKioskCatalog: vi.fn(),
    recordKioskInteraction: vi.fn(),
    useCreateOrder: () => ({
      mutate: mockMutate,
      reset: mockReset,
      data: mockCreated,
      isPending: false,
      isError: mockCreateError !== null,
      error: mockCreateError,
    }),
    rememberPendingOrder: (id: string) => mockRemember(id),
    forgetPendingOrder: () => mockForget(),
    cancelOrphanedOrder: () => mockCancelOrphaned(),
    useOrderStatus: () => ({ data: mockStatus }),
    useCancelOrder: () => ({
      mutate: mockCancel,
      reset: vi.fn(),
      isPending: false,
      error: mockCancelError,
    }),
  };
});

const mockCatalogData = {
  machineSerial: 'SS-HCM-001',
  machineStatus: 'ONLINE' as const,
  operatingMode: 'NORMAL' as const,
  items: [
    {
      slotId: 'slot-1',
      slotNumber: 1,
      available: true,
      brandName: 'Chanel',
      product: {
        id: 'prod-1',
        name: 'Chanel No 5',
        description: 'Hương thơm quyến rũ vượt thời gian',
        imageUrl: 'https://example.com/no5.png',
        fragranceNotes: {
          top: ['Aldehydes', 'Ylang-Ylang'],
          heart: ['Rose', 'Jasmine'],
          base: ['Vanilla', 'Sandalwood'],
        },
      },
      pricePerSpray: '35000',
      currency: 'VND' as const,
    },
    {
      slotId: 'slot-2',
      slotNumber: 2,
      available: true,
      brandName: 'Dior',
      product: {
        id: 'prod-2',
        name: 'Sauvage',
        description: 'Mạnh mẽ và tươi mát',
        imageUrl: 'https://example.com/sauvage.png',
        fragranceNotes: {
          top: ['Bergamot', 'Pepper'],
          heart: ['Lavender', 'Sichuan Pepper'],
          base: ['Ambroxan', 'Cedar'],
        },
      },
      pricePerSpray: '40000',
      currency: 'VND' as const,
    },
    {
      slotId: 'slot-3',
      slotNumber: 3,
      available: false,
      brandName: null,
      product: null,
      pricePerSpray: null,
      currency: 'VND' as const,
    },
  ],
};

function renderCatalog() {
  return render(
    <I18nProvider>
      <KioskSessionProvider>
        <CatalogScreen />
      </KioskSessionProvider>
    </I18nProvider>,
  );
}

describe('CatalogScreen (FR-ORD-01, FR-ORD-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreated = undefined;
    mockCancelError = null;
    mockStatus = undefined;
    mockCreateError = null;
    vi.mocked(useKioskCatalog).mockReturnValue({
      data: mockCatalogData,
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useKioskCatalog>);
  });

  afterEach(() => {
    cleanup();
  });

  it('test_FR_ORD_01_kiosk_display_available_products — hiển thị sản phẩm khả dụng kèm thương hiệu và làm mờ slot tạm ngừng', () => {
    renderCatalog();

    expect(screen.getByRole('heading', { level: 2, name: 'Chanel No 5' })).toBeTruthy();
    expect(screen.getByText('Chanel')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Sauvage' })).toBeTruthy();
    expect(screen.getByText('Dior')).toBeTruthy();
    expect(screen.getByText('Tạm ngừng')).toBeTruthy();
  });

  it('test_FR_ORD_01_unavailable_slot_cannot_be_selected — slot không khả dụng không chạm được', () => {
    renderCatalog();

    const unavailable = screen.getByText('Tạm ngừng').closest('button')!;
    expect(unavailable.disabled).toBe(true);
    fireEvent.click(unavailable);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('test_FR_ORD_01_cards_follow_button_order — thẻ xếp theo số nút trên máy, không bịa dữ liệu', () => {
    vi.mocked(useKioskCatalog).mockReturnValue({
      data: { ...mockCatalogData, items: [...mockCatalogData.items].reverse() },
    } as unknown as ReturnType<typeof useKioskCatalog>);
    const { container } = renderCatalog();

    const numbers = screen.getAllByLabelText(/^Nút số \d$/).map((el) => el.textContent);
    expect(numbers).toEqual(['1', '2', '3']);
    // Slot tạm ngừng không mang thương hiệu/ảnh bịa; không còn nhãn trang trí cũ.
    expect(container.textContent).not.toMatch(/HAUTE SILLAGE|100 ML|ScentStation PARIS/);
    expect(container.querySelectorAll('img')).toHaveLength(2);
  });

  it('test_FR_RPT_06_record_interactions — ghi nhận impression và chuyển hướng khi chọn sản phẩm khả dụng', () => {
    renderCatalog();

    // Kiểm tra impression được ghi cho các slot khả dụng
    expect(recordKioskInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PRODUCT_IMPRESSION',
        slotId: 'slot-1',
      }),
    );
    expect(recordKioskInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PRODUCT_IMPRESSION',
        slotId: 'slot-2',
      }),
    );

    // Bấm vào thẻ sản phẩm slot 1
    const chanelCard = screen.getByText('Chanel No 5').closest('button');
    expect(chanelCard).not.toBeNull();
    fireEvent.click(chanelCard!);

    // Ghi nhận PRODUCT_SELECTED và điều hướng sang /products/1
    expect(recordKioskInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PRODUCT_SELECTED',
        slotId: 'slot-1',
      }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('/products/1');
  });

  function openDetail(name: string) {
    fireEvent.click(screen.getByText(name).closest('button')!);
  }

  it('test_FR_ORD_25_show_press_terms_before_qr — điều khoản bấm nút hiện ở modal chi tiết, chưa tạo đơn', () => {
    renderCatalog();
    openDetail('Chanel No 5');

    expect(screen.getByText(/nhấn nút số 1 trên máy/)).toBeTruthy();
    expect(screen.getByText(/60 giây/)).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Quét mã để thanh toán' })).toBeNull();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('test_FR_ORD_08_agree_goes_straight_to_qr — đồng ý là vào thẳng mã QR, không có bước chọn phương thức', () => {
    renderCatalog();
    openDetail('Chanel No 5');
    fireEvent.click(screen.getByRole('button', { name: /^Thanh toán 35\.000/ }));

    expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({ slotId: 'slot-1' }));
    expect(screen.getByRole('heading', { name: 'Quét mã để thanh toán' })).toBeTruthy();
    expect(screen.queryByText(/phương thức thanh toán/i)).toBeNull();
    expect(screen.queryByText(/Visa|NFC/)).toBeNull();
  });

  it('test_FR_ORD_08_qr_countdown_follows_order_expiry — đồng hồ đếm theo hạn của đơn, không đếm cục bộ', () => {
    mockCreated = {
      order: {
        id: 'order-1',
        paymentReference: 'ORD-20261014-ABC123',
        amount: '35000.0000',
        currency: 'VND',
        expiresAt: new Date(Date.now() + 90_000).toISOString(),
      },
      qrPayload: '00020101021238570010A000000727',
    };
    renderCatalog();
    openDetail('Chanel No 5');
    fireEvent.click(screen.getByRole('button', { name: /^Thanh toán 35\.000/ }));

    expect(screen.getByRole('img', { name: 'Quét mã để thanh toán' })).toBeTruthy();
    expect(screen.getByText(/^01:(30|29)$/)).toBeTruthy();
    // Chỉ một phương thức đang có (ADR-0016) và lời báo trước nút sẽ sáng.
    expect(screen.getByText('VietQR · App ngân hàng')).toBeTruthy();
    expect(screen.queryByText(/MOMO|ZALOPAY|VNPAY|NAPAS/)).toBeNull();
    expect(screen.getByText(/nút số 1 sẽ sáng/)).toBeTruthy();
    expect(screen.getByText('ORD-20261014-ABC123')).toBeTruthy();
  });

  it('test_FR_ORD_08_cancel_with_qr_asks_for_confirmation — đã có mã QR thì hủy phải xác nhận lại', () => {
    mockCreated = {
      order: {
        id: 'order-1',
        paymentReference: 'ORD-20261014-ABC123',
        amount: '35000.0000',
        currency: 'VND',
        expiresAt: new Date(Date.now() + 90_000).toISOString(),
      },
      qrPayload: '00020101021238570010A000000727',
    };
    renderCatalog();
    openDetail('Chanel No 5');
    fireEvent.click(screen.getByRole('button', { name: /^Thanh toán 35\.000/ }));
    mockReset.mockClear();

    // Nút Hủy — lối thoát duy nhất — chỉ mở hộp xác nhận, không bỏ đơn.
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText(/đã quét mã và chuyển khoản/)).toBeTruthy();
    expect(mockReset).not.toHaveBeenCalled();

    // Ở lại: mã QR vẫn còn, hộp xác nhận đóng.
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục thanh toán' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('img', { name: 'Quét mã để thanh toán' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Vẫn hủy' }));
    // FR-ORD-33: hủy đơn ở máy chủ rồi mới đóng.
    expect(mockCancel).toHaveBeenCalledWith('order-1', expect.any(Object));
    expect(mockReset).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenLastCalledWith('/');
  });

  it('test_FR_ORD_16_expired_qr_is_hidden — hết hạn thì ẩn mã QR, tự hủy đơn, về trang chủ không hỏi lại', () => {
    mockCreated = {
      order: {
        id: 'order-1',
        paymentReference: 'ORD-20261021-SAG9YC',
        amount: '10000.0000',
        currency: 'VND',
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      },
      qrPayload: '00020101021238570010A000000727',
    };
    renderCatalog();
    openDetail('Chanel No 5');
    fireEvent.click(screen.getByRole('button', { name: /^Thanh toán 35\.000/ }));

    // Đồng hồ đã về 0: không còn mã để quét, kiosk tự hủy đơn ở máy chủ (FR-ORD-33).
    expect(screen.queryByRole('img', { name: 'Quét mã để thanh toán' })).toBeNull();
    expect(screen.getByText('Mã thanh toán đã hết hạn')).toBeTruthy();
    expect(screen.getByText(/Hãy lưu lại mã ORD-20261021-SAG9YC/)).toBeTruthy();
    expect(mockCancel).toHaveBeenCalledWith('order-1');

    mockNavigate.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Trang chủ' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(mockNavigate).toHaveBeenLastCalledWith('/');
  });

  it('test_FR_ORD_16_server_expired_hides_qr — máy chủ báo EXPIRED thì ẩn mã dù đồng hồ kiosk còn giờ', () => {
    mockCreated = {
      order: {
        id: 'order-1',
        paymentReference: 'ORD-20261021-SAG9YC',
        amount: '10000.0000',
        currency: 'VND',
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
      },
      qrPayload: '00020101021238570010A000000727',
    };
    mockStatus = { orderId: 'order-1', status: 'EXPIRED', revenueOwner: 'BRAND' };
    renderCatalog();
    openDetail('Chanel No 5');
    fireEvent.click(screen.getByRole('button', { name: /^Thanh toán 35\.000/ }));

    expect(screen.queryByRole('img', { name: 'Quét mã để thanh toán' })).toBeNull();
    expect(screen.getByText('Mã thanh toán đã hết hạn')).toBeTruthy();
  });

  it('test_FR_ORD_16_late_payment_shows_refund_screen — tiền về sau hạn thì sang màn hoàn tiền, không xịt', () => {
    const view = renderCatalog();
    openDetail('Chanel No 5');
    fireEvent.click(screen.getByRole('button', { name: /^Thanh toán 35\.000/ }));

    // Mã đã hết hạn, rồi máy chủ báo tiền vẫn về: đơn REFUND_PENDING, chưa từng có lệnh xịt.
    mockCreated = {
      order: {
        id: 'order-1',
        paymentReference: 'ORD-20261021-SAG9YC',
        amount: '10000.0000',
        currency: 'VND',
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      },
      qrPayload: '00020101021238570010A000000727',
    };
    mockStatus = {
      orderId: 'order-1',
      status: 'REFUND_PENDING',
      revenueOwner: 'BRAND',
      claimToken: null,
    };
    view.rerender(
      <I18nProvider>
        <KioskSessionProvider>
          <CatalogScreen />
        </KioskSessionProvider>
      </I18nProvider>,
    );

    expect(screen.queryByRole('img', { name: 'Quét mã để thanh toán' })).toBeNull();
    expect(screen.getByText('Tiền về sau khi mã đã hết hạn')).toBeTruthy();
    expect(screen.getByText(/Máy không xịt cho giao dịch này/)).toBeTruthy();
  });

  it('test_FR_ORD_35_create_error_does_not_retry_in_loop — MACHINE_BUSY thì dừng, hiện lỗi và nút thử lại', () => {
    mockCreateError = new ApiRequestError(409, {
      code: 'MACHINE_BUSY',
      message: 'Máy đang phục vụ khách khác. Vui lòng chờ trong giây lát.',
      details: { messageKey: 'ord.machineBusy' },
    });
    const view = renderCatalog();
    openDetail('Chanel No 5');
    fireEvent.click(screen.getByRole('button', { name: /^Thanh toán 35\.000/ }));
    view.rerender(
      <I18nProvider>
        <KioskSessionProvider>
          <CatalogScreen />
        </KioskSessionProvider>
      </I18nProvider>,
    );

    // Không gọi tạo đơn lại sau lỗi — trước đây mỗi lần render là một lần 409 nữa.
    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/đang phục vụ khách khác/);

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(mockReset).toHaveBeenCalled();
  });

  it('test_FR_ORD_33_orphaned_order_cancelled_after_reload — khởi động lại thì hủy đơn của phiên trước', () => {
    renderCatalog();
    expect(mockCancelOrphaned).toHaveBeenCalledTimes(1);
  });

  it('test_FR_ORD_33_remember_order_while_paying — ghi nhớ đơn khi đang hiện mã QR', () => {
    mockCreated = {
      order: {
        id: 'order-9',
        paymentReference: 'ORD-20261021-9897TZ',
        amount: '10000.0000',
        currency: 'VND',
        expiresAt: new Date(Date.now() + 90_000).toISOString(),
      },
      qrPayload: '00020101021238570010A000000727',
    };
    renderCatalog();
    openDetail('Chanel No 5');
    fireEvent.click(screen.getByRole('button', { name: /^Thanh toán 35\.000/ }));
    expect(mockRemember).toHaveBeenCalledWith('order-9');
  });

  it('test_FR_ORD_33_stay_on_qr_when_payment_already_received — tiền đã về thì ở lại màn QR', () => {
    mockCreated = {
      order: {
        id: 'order-1',
        paymentReference: 'ORD-20261014-ABC123',
        amount: '35000.0000',
        currency: 'VND',
        expiresAt: new Date(Date.now() + 90_000).toISOString(),
      },
      qrPayload: '00020101021238570010A000000727',
    };
    mockCancelError = new ApiRequestError(409, {
      code: 'ORDER_NOT_CANCELLABLE',
      message: 'Hệ thống đã nhận được tiền của bạn nên không hủy đơn được nữa.',
      details: { messageKey: 'ord.orderNotCancellable' },
    });
    renderCatalog();
    openDetail('Chanel No 5');
    fireEvent.click(screen.getByRole('button', { name: /^Thanh toán 35\.000/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    mockReset.mockClear();
    mockNavigate.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Vẫn hủy' }));

    expect(mockReset).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('img', { name: 'Quét mã để thanh toán' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/đã nhận được tiền/);
  });

  it('test_FR_ORD_02_kiosk_display_product_details — chi tiết có tên, thương hiệu, mô tả, tầng hương và giá', () => {
    renderCatalog();
    openDetail('Chanel No 5');

    const page = screen.getByRole('article', { name: 'Chanel No 5' });
    expect(within(page).getByText('Chanel')).toBeTruthy();
    expect(within(page).getByRole('heading', { level: 1, name: 'Chanel No 5' })).toBeTruthy();
    expect(within(page).getByText('Hương thơm quyến rũ vượt thời gian')).toBeTruthy();
    expect(within(page).getByText('/ lượt xịt')).toBeTruthy();
    expect(within(page).getByText('Aldehydes, Ylang-Ylang')).toBeTruthy();
    expect(within(page).getByText('Rose, Jasmine')).toBeTruthy();
    expect(within(page).getByText('Vanilla, Sandalwood')).toBeTruthy();
    // FR-ORD-25: nút thanh toán ghi rõ số tiền, chỉ dẫn nút bấm nằm ngay trên.
    expect(within(page).getByRole('button', { name: /^Thanh toán 35\.000\s₫$/ })).toBeTruthy();
  });

  it('trang chi tiết có nút quay lại về danh mục, không tạo đơn', () => {
    renderCatalog();
    openDetail('Chanel No 5');
    mockReset.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Quay lại danh mục' }));

    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Sauvage' })).toBeTruthy();
    expect(mockNavigate).toHaveBeenLastCalledWith('/');
    expect(mockReset).toHaveBeenCalled();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('máy bảo trì lúc tạo đơn (MACHINE_IN_MAINTENANCE) thì hiện màn tạm ngưng (ADR-0015)', () => {
    mockCreateError = new ApiRequestError(503, {
      code: 'MACHINE_IN_MAINTENANCE',
      message: 'Thiết bị đang bảo trì',
    });
    renderCatalog();

    expect(screen.getByText('Máy đang tạm ngưng phục vụ')).toBeTruthy();
  });

  it('bản build thật: có QR quét được, không lộ lệnh thanh toán giả lập (FR-ORD-08)', () => {
    mockShowDevTools = false;
    mockCreated = {
      order: {
        id: 'order-1',
        paymentReference: 'ORD-20261014-ABC123',
        amount: '35000.0000',
        currency: 'VND',
        expiresAt: new Date(Date.now() + 90_000).toISOString(),
      },
      qrPayload: '00020101021238570010A000000727',
    };
    try {
      const { container } = renderCatalog();
      openDetail('Chanel No 5');
      fireEvent.click(screen.getByRole('button', { name: /^Thanh toán 35\.000/ }));

      const qr = screen.getByRole('img', { name: 'Quét mã để thanh toán' });
      expect(qr.querySelector('path')).not.toBeNull();
      expect(screen.queryByText(/npm run pay:mock/)).toBeNull();
      expect(container.textContent).not.toContain('00020101021238570010A000000727');
    } finally {
      mockShowDevTools = true;
    }
  });

  it('test_FR_ORD_08_switching_product_discards_previous_order — đổi sản phẩm/hủy là bỏ đơn cũ', () => {
    renderCatalog();
    openDetail('Chanel No 5');
    fireEvent.click(screen.getByRole('button', { name: /^Thanh toán 35\.000/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(mockReset).toHaveBeenCalled();

    mockReset.mockClear();
    openDetail('Sauvage');
    expect(mockReset).toHaveBeenCalled();
    expect(screen.getByText(/nhấn nút số 2 trên máy/)).toBeTruthy();
  });
});
