import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiRequestError,
  useCreateOrder,
  useKioskCatalog,
  useOrderStatus,
  type OrderStatusView,
} from '@/shared/api';
import { I18nProvider } from '@/shared/i18n';
import { phaseOf, pressDeadlineMs, secondsUntil, WAITING_TURN_AFTER_MS } from './checkout-phase';
import CheckoutScreen from './CheckoutScreen';
import DispenseSuccessGuide, { SUCCESS_SPLASH_MS, TIMEOUT_NOTICE_MS } from './DispenseSuccessGuide';

const mockNavigate = vi.fn();
const mockMutate = vi.fn();
const mockSetActiveOrder = vi.fn();
type CancelCallbacks = { onSuccess?: () => void; onError?: (error: unknown) => void };
/** Mặc định máy chủ hủy thành công; từng test đổi hành vi khi cần. */
const mockCancel = vi.fn((_orderId: string, callbacks?: CancelCallbacks) => {
  callbacks?.onSuccess?.();
});
let mockShowDevTools = true;
let mockClaimPageUrl: string | null = null;

vi.mock('@/shared/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/config')>();
  return {
    ...actual,
    config: {
      ...actual.config,
      get showDevTools() {
        return mockShowDevTools;
      },
      get claimPageUrl() {
        return mockClaimPageUrl;
      },
    },
  };
});

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ slotNumber: '2' }),
}));

vi.mock('@/shared/session', () => ({
  useKioskSession: () => ({
    kioskSessionId: 'session-1',
    startNewSession: vi.fn(),
    activeOrder: null,
    setActiveOrder: mockSetActiveOrder,
  }),
}));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return {
    ...actual,
    useKioskCatalog: vi.fn(),
    useCreateOrder: vi.fn(),
    useOrderStatus: vi.fn(),
    useCancelOrder: () => ({ mutate: mockCancel, isPending: false, error: null, reset: vi.fn() }),
  };
});

const catalog = {
  machineSerial: 'M001',
  machineStatus: 'ONLINE' as const,
  operatingMode: 'NORMAL' as const,
  items: [
    {
      slotId: 'slot-2',
      slotNumber: 2,
      available: true,
      brandName: 'Maison',
      product: {
        id: 'p2',
        name: 'Matinale',
        description: null,
        imageUrl: null,
        fragranceNotes: null,
      },
      pricePerSpray: '42000.0000',
      currency: 'VND' as const,
    },
  ],
};

const created = {
  order: {
    id: 'order-1',
    paymentReference: 'ORD-20261004-ABC123',
    amount: '42000.0000',
    currency: 'VND',
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
  },
  qrPayload: 'MOCKPAY|ORD-20261004-ABC123|42000',
};

function view(overrides: Partial<OrderStatusView>): OrderStatusView {
  return {
    orderId: 'order-1',
    status: 'PENDING_PAYMENT',
    revenueOwner: 'BRAND',
    dispenseStatus: null,
    failureCode: null,
    slotNumber: 2,
    pressDeadline: null,
    supportReference: null,
    ...overrides,
  } as OrderStatusView;
}

function mockOrder(data: typeof created | undefined, status?: OrderStatusView, failureCount = 0) {
  vi.mocked(useCreateOrder).mockReturnValue({
    data,
    mutate: mockMutate,
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useCreateOrder>);
  vi.mocked(useOrderStatus).mockReturnValue({
    data: status,
    failureCount,
  } as unknown as ReturnType<typeof useOrderStatus>);
}

function mockOrderError(error: unknown) {
  vi.mocked(useCreateOrder).mockReturnValue({
    data: undefined,
    mutate: mockMutate,
    isPending: false,
    isError: true,
    error,
  } as unknown as ReturnType<typeof useCreateOrder>);
  vi.mocked(useOrderStatus).mockReturnValue({
    data: undefined,
  } as unknown as ReturnType<typeof useOrderStatus>);
}

/** Qua màn chúc mừng "Thanh toán thành công" để tới modal hướng dẫn (cần vi.useFakeTimers()). */
function skipSplash() {
  act(() => {
    vi.advanceTimersByTime(SUCCESS_SPLASH_MS);
  });
}

function renderScreen() {
  return render(
    <I18nProvider>
      <CheckoutScreen />
    </I18nProvider>,
  );
}

describe('CheckoutScreen (FR-ORD-08, FR-ORD-25, FR-ORD-26)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useKioskCatalog).mockReturnValue({
      data: catalog,
    } as unknown as ReturnType<typeof useKioskCatalog>);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('hiện điều khoản bấm nút TRƯỚC khi tạo đơn, đồng ý mới tạo đơn (FR-ORD-25)', () => {
    mockOrder(undefined);
    renderScreen();

    expect(screen.getByText(/đèn nút số 2/)).toBeTruthy();
    expect(screen.getByText(/60 giây/)).toBeTruthy();
    expect(mockMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Đồng ý và thanh toán' }));
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ slotId: 'slot-2', kioskSessionId: 'session-1' }),
    );
  });

  it('màn điều khoản hiện số tiền trước khi khách bấm đồng ý (FR-ORD-25)', () => {
    mockOrder(undefined);
    renderScreen();

    expect(screen.getByText(/42\.000 VND/)).toBeTruthy();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('đã có đơn thì báo cho phiên kiosk để giữ khách trong luồng thanh toán (FR-IOT-13)', () => {
    mockOrder(created, view({ status: 'PENDING_PAYMENT' }));
    renderScreen();

    expect(mockSetActiveOrder).toHaveBeenLastCalledWith({
      id: 'order-1',
      paymentReference: 'ORD-20261004-ABC123',
    });
  });

  it('muốn rời màn mã thanh toán thì phải xác nhận trước (FR-ORD-08)', () => {
    mockOrder(created, view({ status: 'PENDING_PAYMENT' }));
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByText(/xin đừng rời màn hình này/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Ở lại' }));
    expect(screen.queryByText(/xin đừng rời màn hình này/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vẫn quay lại' }));
    // FR-ORD-33: hủy đơn ở máy chủ trước khi rời.
    expect(mockCancel).toHaveBeenCalledWith('order-1', expect.any(Object));
    expect(mockNavigate).toHaveBeenCalledWith('/products/2');
  });

  it('test_FR_ORD_33_stay_when_payment_already_received — tiền đã về thì không rời màn hình', () => {
    mockCancel.mockImplementationOnce((_orderId: string, callbacks?: CancelCallbacks) => {
      callbacks?.onError?.(
        new ApiRequestError(409, {
          code: 'ORDER_NOT_CANCELLABLE',
          message: 'Hệ thống đã nhận được tiền của bạn nên không hủy đơn được nữa.',
          details: { messageKey: 'ord.orderNotCancellable' },
        }),
      );
    });
    mockOrder(created, view({ status: 'PENDING_PAYMENT' }));
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vẫn quay lại' }));
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.queryByText(/xin đừng rời màn hình này/)).toBeNull();
    expect(screen.getByRole('img', { name: 'Quét mã để thanh toán' })).toBeTruthy();
  });

  it('test_ADR_0015_cancel_order_on_qr_countdown_timeout — hết hạn QR thì gọi hủy đơn tại máy chủ', () => {
    vi.useFakeTimers();
    const shortLivedCreated = {
      ...created,
      order: {
        ...created.order,
        expiresAt: new Date(Date.now() + 2_000).toISOString(),
      },
    };
    mockOrder(shortLivedCreated, view({ status: 'PENDING_PAYMENT' }));
    renderScreen();

    act(() => {
      vi.advanceTimersByTime(3_000);
    });

    expect(mockCancel).toHaveBeenCalledWith('order-1');
  });

  it('test_ADR_0015_maintenance_screen_when_machine_in_maintenance — hiện màn hình bảo trì khi lỗi MACHINE_IN_MAINTENANCE', () => {
    mockOrderError(
      new ApiRequestError(503, {
        code: 'MACHINE_IN_MAINTENANCE',
        message: 'Thiết bị đang bảo trì',
      }),
    );
    renderScreen();

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Máy đang tạm ngưng phục vụ')).toBeTruthy();
  });

  it('mất liên lạc khi đang chờ bấm nút thì vẫn giữ mã đơn trên màn hình (FR-ORD-21)', () => {
    vi.useFakeTimers();
    mockOrder(
      created,
      view({
        status: 'DISPENSE_REQUESTED',
        dispenseStatus: 'ACKNOWLEDGED',
        pressDeadline: new Date(Date.now() + 45_000).toISOString(),
      }),
      2,
    );
    renderScreen();
    skipSplash();

    expect(screen.getByRole('heading', { name: 'Nhấn nút ở ô số' })).toBeTruthy();
    expect(screen.getByText(/Mất kết nối.*ORD-20261004-ABC123/)).toBeTruthy();
  });

  it('chưa thanh toán thì hiện mã thanh toán, số tiền và lệnh thanh toán giả lập (FR-ORD-08)', () => {
    mockOrder(created, view({ status: 'PENDING_PAYMENT' }));
    renderScreen();

    expect(screen.getByText('ORD-20261004-ABC123')).toBeTruthy();
    expect(screen.getByText(/42\.000 VND/)).toBeTruthy();
    expect(screen.getByText(/npm run pay:mock -- ORD-20261004-ABC123/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sao chép lệnh test' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sao chép mã' })).toBeTruthy();
  });

  it('bản build thật: có QR quét được, không lộ lệnh thanh toán giả lập cho khách (FR-ORD-08)', () => {
    mockShowDevTools = false;
    try {
      mockOrder(created, view({ status: 'PENDING_PAYMENT' }));
      const { container } = renderScreen();

      // QR thật do thư viện vẽ (SVG có đường path), không phải hình trang trí.
      const qr = screen.getByRole('img', { name: 'Quét mã để thanh toán' });
      expect(qr.tagName.toLowerCase()).toBe('svg');
      expect(qr.querySelector('path')).not.toBeNull();

      expect(screen.queryByText(/npm run pay:mock/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Sao chép lệnh test' })).toBeNull();
      expect(container.textContent).not.toContain(created.qrPayload);
    } finally {
      mockShowDevTools = true;
    }
  });

  it('đèn đã sáng thì mời bấm đúng nút và đếm ngược (FR-ORD-26)', () => {
    vi.useFakeTimers();
    mockOrder(
      created,
      view({
        status: 'DISPENSE_REQUESTED',
        dispenseStatus: 'ACKNOWLEDGED',
        pressDeadline: new Date(Date.now() + 45_000).toISOString(),
      }),
    );
    renderScreen();
    skipSplash();

    expect(screen.getByRole('heading', { name: 'Nhấn nút ở ô số' })).toBeTruthy();
    expect(screen.getByText('Đèn đã sáng — bấm ngay')).toBeTruthy();
    expect(screen.getByText('Nhấn nút ô số 2 khi đèn sáng')).toBeTruthy();
    expect(screen.getByText(/Còn 4[23] giây/)).toBeTruthy();
  });

  it('khách không bấm thì báo hết thời gian, không hiện mã hỗ trợ (FR-ORD-27)', () => {
    mockOrder(created, view({ status: 'FORFEITED', failureCode: 'PRESS_TIMEOUT' }));
    renderScreen();

    expect(screen.getByText('Đã hết thời gian bấm nút')).toBeTruthy();
    expect(screen.getByText(/Đã hết 60 giây chờ bấm nút/)).toBeTruthy();
    expect(screen.queryByText(/ORD-20261004-ABC123/)).toBeNull();
  });

  it('mã hết hạn thì không khẳng định "chưa bị trừ tiền" và hiện mã để hoàn tiền nếu tiền về muộn (FR-ORD-16)', () => {
    mockOrder(created, view({ status: 'EXPIRED' }));
    renderScreen();

    expect(screen.getByText('Mã thanh toán đã hết hạn')).toBeTruthy();
    expect(screen.queryByText(/chưa bị trừ tiền/)).toBeNull();
    expect(screen.getByText(/đã chuyển khoản.*ORD-20261004-ABC123/)).toBeTruthy();
  });

  it('sự cố sau thanh toán thì hiện mã hỗ trợ, không nhắc tới nhân viên tại máy (FR-ORD-21, BR-001)', () => {
    mockOrder(created, view({ status: 'FAILED', supportReference: 'SUP-123' }));
    renderScreen();

    expect(screen.getByText('Lượt xịt gặp sự cố')).toBeTruthy();
    expect(screen.getByText(/SUP-123/)).toBeTruthy();
    expect(screen.queryByText(/nhân viên/)).toBeNull();
  });

  it('test_FR_ORD_26_success_splash_then_press_guide — chúc mừng ~2 giây rồi mới hiện hướng dẫn bấm nút', () => {
    vi.useFakeTimers();
    mockOrder(created, view({ status: 'PAID' }));
    renderScreen();

    expect(screen.getByText('Thanh toán thành công')).toBeTruthy();
    expect(screen.queryByTestId('dispense-guide')).toBeNull();

    skipSplash();

    expect(screen.queryByText('Thanh toán thành công')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Nhấn nút ở ô số' })).toBeTruthy();
    expect(screen.getByText('Đèn nút sắp sáng…')).toBeTruthy();
    expect(screen.getByText('Đưa cổ tay hoặc cổ cách vòi 10–15 cm')).toBeTruthy();
    expect(screen.getByText('Nhấn nút ô số 2 khi đèn sáng')).toBeTruthy();
    expect(screen.getByText('Giữ yên 2–3 giây')).toBeTruthy();
    // Chỉ hướng dẫn nhận lượt xịt — không lặp lại mã giao dịch hay tên sản phẩm.
    expect(screen.queryByText(/ORD-20261004-ABC123/)).toBeNull();
    expect(screen.queryByText(/Matinale/)).toBeNull();
  });

  it('test_FR_ORD_26_press_countdown_starts_when_guide_shows — đếm 60 giây từ lúc modal hướng dẫn hiện', () => {
    vi.useFakeTimers();
    mockOrder(created, view({ status: 'DISPENSE_REQUESTED', dispenseStatus: 'SENT' }));
    renderScreen();
    expect(screen.queryByText(/Còn \d+ giây/)).toBeNull();

    skipSplash();
    expect(screen.getByText('Còn 60 giây')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText('Còn 30 giây')).toBeTruthy();
  });

  it('test_FR_ORD_27_press_timeout_returns_home — đèn sáng mà không bấm sau 60 giây thì báo rồi về trang chủ', () => {
    vi.useFakeTimers();
    // Hạn máy chủ muộn hơn: kiosk vẫn đếm đúng 60 giây từ lúc modal hiện.
    mockOrder(
      created,
      view({
        status: 'DISPENSE_REQUESTED',
        dispenseStatus: 'ACKNOWLEDGED',
        pressDeadline: new Date(Date.now() + 120_000).toISOString(),
      }),
    );
    renderScreen();
    skipSplash();

    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    expect(screen.getByRole('heading', { name: 'Nhấn nút ở ô số' })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByText('Đã hết thời gian bấm nút')).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(TIMEOUT_NOTICE_MS);
    });
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('test_FR_ORD_21_light_never_on_shows_support_not_timeout — đèn chưa từng sáng thì báo sự cố, không đổ lỗi khách', () => {
    vi.useFakeTimers();
    mockOrder(created, view({ status: 'DISPENSE_REQUESTED', dispenseStatus: 'SENT' }));
    renderScreen();
    skipSplash();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Lượt xịt gặp sự cố')).toBeTruthy();
    expect(screen.getByText(/ORD-20261004-ABC123/)).toBeTruthy();
    expect(screen.queryByText('Đã hết thời gian bấm nút')).toBeNull();
  });

  it('test_FR_ORD_26_server_result_wins_over_local_timeout — khách bấm sát giờ, máy báo đã xịt thì cảm ơn', () => {
    vi.useFakeTimers();
    mockOrder(
      created,
      view({
        status: 'DISPENSE_REQUESTED',
        dispenseStatus: 'ACKNOWLEDGED',
        pressDeadline: new Date(Date.now() + 120_000).toISOString(),
      }),
    );
    const { rerender } = renderScreen();
    skipSplash();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Đã hết thời gian bấm nút')).toBeTruthy();

    mockOrder(created, view({ status: 'DISPENSED' }));
    rerender(
      <I18nProvider>
        <CheckoutScreen />
      </I18nProvider>,
    );
    expect(screen.getByText('Cảm ơn bạn!')).toBeTruthy();
  });

  it('test_FR_ORD_21_no_success_splash_for_problem — tiền về muộn/sự cố thì không chúc mừng thanh toán', () => {
    mockOrder(created, view({ status: 'REFUND_PENDING', supportReference: 'SUP-9' }));
    renderScreen();

    expect(screen.queryByText('Thanh toán thành công')).toBeNull();
    expect(screen.getByText('Lượt xịt gặp sự cố')).toBeTruthy();
  });

  it('khi đã xịt xong (DISPENSED), hiển thị thông điệp cảm ơn và nút quay về trang chủ', () => {
    mockOrder(created, view({ status: 'DISPENSED' }));
    renderScreen();

    expect(screen.getByText('Cảm ơn bạn!')).toBeTruthy();
    expect(screen.getByText('Chúc bạn một ngày thơm tho.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Trang chủ' })).toBeTruthy();
  });

  it('tạo đơn bị MACHINE_BUSY thì hiện thông báo máy đang phục vụ khách khác (FR-ORD-24)', () => {
    mockOrderError(
      new ApiRequestError(409, {
        code: 'MACHINE_BUSY',
        message: 'Máy đang chờ khách trước bấm nút',
      }),
    );
    renderScreen();

    expect(
      screen.getByText('Máy đang phục vụ khách khác. Vui lòng chờ trong giây lát.'),
    ).toBeTruthy();
  });

  it('khi đang chờ lượt (WAITING_TURN) thì báo máy đang phục vụ khách trước (FR-DSP-26)', () => {
    vi.useFakeTimers();
    render(
      <I18nProvider>
        <DispenseSuccessGuide
          slot={2}
          order={created.order}
          view={view({ status: 'PAID' })}
          phase="WAITING_TURN"
          now={Date.now()}
          pressWindowSec={60}
          goHome={vi.fn()}
        />
      </I18nProvider>,
    );

    skipSplash();

    expect(screen.getByRole('heading', { name: 'Nhấn nút ở ô số' })).toBeTruthy();
    expect(screen.getByText('Máy đang phục vụ khách trước, chờ giây lát…')).toBeTruthy();
    // Chưa tới lượt thì chưa đếm giờ bấm nút.
    expect(screen.queryByText(/Còn \d+ giây/)).toBeNull();
  });
});

describe('QR sự cố (FR-ORD-21, FR-ORD-28)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useKioskCatalog).mockReturnValue({
      data: catalog,
    } as unknown as ReturnType<typeof useKioskCatalog>);
  });
  afterEach(() => {
    cleanup();
    mockClaimPageUrl = null;
  });

  it('test_FR_ORD_21_problem_screen_shows_claim_qr_with_order_and_token', () => {
    mockClaimPageUrl = 'https://admin.scentstation.test/claim';
    mockOrder(created, view({ status: 'FAILED', supportReference: 'SUP-1', claimToken: 'tok123' }));
    renderScreen();

    const qr = screen.getByRole('img', { name: 'Quét mã để yêu cầu hoàn tiền' });
    expect(qr.tagName.toLowerCase()).toBe('svg');
    expect(screen.getByText(/trong vòng 24 giờ/)).toBeTruthy();
  });

  it('test_FR_ORD_21_no_claim_qr_without_token_or_claim_page', () => {
    mockClaimPageUrl = 'https://admin.scentstation.test/claim';
    mockOrder(created, view({ status: 'FAILED', supportReference: 'SUP-1', claimToken: null }));
    const { unmount } = renderScreen();
    expect(screen.queryByRole('img', { name: 'Quét mã để yêu cầu hoàn tiền' })).toBeNull();
    unmount();

    mockClaimPageUrl = null;
    mockOrder(created, view({ status: 'FAILED', supportReference: 'SUP-1', claimToken: 'tok123' }));
    renderScreen();
    expect(screen.queryByRole('img', { name: 'Quét mã để yêu cầu hoàn tiền' })).toBeNull();
  });
});

describe('phaseOf', () => {
  it('ánh xạ trạng thái đơn + lệnh sang màn hình', () => {
    expect(phaseOf(undefined)).toBe('PAYING');
    expect(phaseOf(view({ status: 'PAID' }))).toBe('PREPARING');
    expect(phaseOf(view({ status: 'PAID' }), WAITING_TURN_AFTER_MS)).toBe('WAITING_TURN');
    expect(phaseOf(view({ status: 'DISPENSE_REQUESTED', dispenseStatus: 'SENT' }))).toBe(
      'PREPARING',
    );
    expect(phaseOf(view({ status: 'DISPENSE_REQUESTED', dispenseStatus: 'UNKNOWN' }))).toBe(
      'CHECKING',
    );
    expect(phaseOf(view({ status: 'DISPENSED' }))).toBe('DISPENSED');
    expect(phaseOf(view({ status: 'REFUND_PENDING' }))).toBe('PROBLEM');
  });

  it('pressDeadlineMs đếm từ lúc modal hiện, nhưng không muộn hơn hạn của thiết bị', () => {
    expect(pressDeadlineMs(null, 60, null)).toBeNull();
    expect(pressDeadlineMs(1_000, 60, null)).toBe(61_000);
    expect(pressDeadlineMs(1_000, 60, new Date(30_000).toISOString())).toBe(30_000);
    expect(pressDeadlineMs(1_000, 60, new Date(90_000).toISOString())).toBe(61_000);
    expect(pressDeadlineMs(1_000, 60, 'not-a-date')).toBe(61_000);
  });

  it('secondsUntil không âm và bỏ qua mốc hỏng', () => {
    expect(secondsUntil(new Date(10_000).toISOString(), 0)).toBe(10);
    expect(secondsUntil(new Date(0).toISOString(), 5_000)).toBe(0);
    expect(secondsUntil('not-a-date', 0)).toBeNull();
    expect(secondsUntil(null, 0)).toBeNull();
  });
});
