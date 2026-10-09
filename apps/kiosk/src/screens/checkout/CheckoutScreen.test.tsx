import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCreateOrder,
  useKioskCatalog,
  useOrderStatus,
  type OrderStatusView,
} from '@/shared/api';
import { I18nProvider } from '@/shared/i18n';
import { phaseOf, secondsUntil, WAITING_TURN_AFTER_MS } from './checkout-phase';
import CheckoutScreen from './CheckoutScreen';

const mockNavigate = vi.fn();
const mockMutate = vi.fn();

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ slotNumber: '2' }),
}));

vi.mock('@/shared/session', () => ({
  useKioskSession: () => ({ kioskSessionId: 'session-1', startNewSession: vi.fn() }),
}));

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return {
    ...actual,
    useKioskCatalog: vi.fn(),
    useCreateOrder: vi.fn(),
    useOrderStatus: vi.fn(),
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

function mockOrder(data: typeof created | undefined, status?: OrderStatusView) {
  vi.mocked(useCreateOrder).mockReturnValue({
    data,
    mutate: mockMutate,
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useCreateOrder>);
  vi.mocked(useOrderStatus).mockReturnValue({
    data: status,
  } as unknown as ReturnType<typeof useOrderStatus>);
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

  afterEach(() => cleanup());

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

  it('chưa thanh toán thì hiện mã thanh toán và số tiền (FR-ORD-08)', () => {
    mockOrder(created, view({ status: 'PENDING_PAYMENT' }));
    renderScreen();

    expect(screen.getByText('ORD-20261004-ABC123')).toBeTruthy();
    expect(screen.getByText(/42\.000 VND/)).toBeTruthy();
  });

  it('đèn đã sáng thì mời bấm đúng nút và đếm ngược (FR-ORD-26)', () => {
    mockOrder(
      created,
      view({
        status: 'DISPENSE_REQUESTED',
        dispenseStatus: 'ACKNOWLEDGED',
        pressDeadline: new Date(Date.now() + 45_000).toISOString(),
      }),
    );
    renderScreen();

    expect(screen.getByText('Mời bấm nút số 2')).toBeTruthy();
    expect(screen.getByText(/Còn 4[45] giây/)).toBeTruthy();
  });

  it('khách không bấm thì báo hết thời gian, không hiện mã hỗ trợ (FR-ORD-27)', () => {
    mockOrder(created, view({ status: 'FORFEITED', failureCode: 'PRESS_TIMEOUT' }));
    renderScreen();

    expect(screen.getByText('Đã hết thời gian bấm nút')).toBeTruthy();
    expect(screen.queryByText(/báo mã/)).toBeNull();
  });

  it('sau khi thanh toán thành công, hiển thị giao diện hướng dẫn nhận lượt xịt (Stitch UI)', () => {
    mockOrder(
      created,
      view({
        status: 'DISPENSE_REQUESTED',
        dispenseStatus: 'ACKNOWLEDGED',
        pressDeadline: new Date(Date.now() + 45_000).toISOString(),
      }),
    );
    renderScreen();

    expect(screen.getByText('Thanh toán thành công')).toBeTruthy();
    expect(screen.getByText('Hướng dẫn nhận lượt xịt')).toBeTruthy();
    expect(screen.getByText('1. Đưa cổ tay lại gần vòi')).toBeTruthy();
    expect(screen.getByText('3. Thưởng thức hương thơm')).toBeTruthy();
    expect(screen.getByText(/10–15 cm/)).toBeTruthy();
  });

  it('khi đã xịt xong (DISPENSED), hiển thị thông điệp cảm ơn và nút quay về trang chủ', () => {
    mockOrder(created, view({ status: 'DISPENSED' }));
    renderScreen();

    expect(screen.getByText('Cảm ơn bạn!')).toBeTruthy();
    expect(screen.getByText('Chúc bạn một ngày thơm tho.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Trang chủ' })).toBeTruthy();
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

  it('secondsUntil không âm và bỏ qua mốc hỏng', () => {
    expect(secondsUntil(new Date(10_000).toISOString(), 0)).toBe(10);
    expect(secondsUntil(new Date(0).toISOString(), 5_000)).toBe(0);
    expect(secondsUntil('not-a-date', 0)).toBeNull();
    expect(secondsUntil(null, 0)).toBeNull();
  });
});
