import { act, cleanup, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderStatusView } from '@/shared/api';
import { I18nProvider } from '@/shared/i18n';
import { phaseOf, type CheckoutPhase } from './checkout-phase';
import DispenseSuccessGuide, { SUCCESS_SPLASH_MS, TIMEOUT_NOTICE_MS } from './DispenseSuccessGuide';

let mockClaimPageUrl: string | null = null;

vi.mock('@/shared/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/config')>();
  return {
    ...actual,
    config: {
      ...actual.config,
      get claimPageUrl() {
        return mockClaimPageUrl;
      },
    },
  };
});

const order = { id: 'order-1', paymentReference: 'ORD-20261004-ABC123' };

function view(overrides: Partial<OrderStatusView>): OrderStatusView {
  return {
    orderId: 'order-1',
    status: 'PAID',
    revenueOwner: 'BRAND',
    dispenseStatus: null,
    failureCode: null,
    slotNumber: 2,
    pressDeadline: null,
    supportReference: null,
    ...overrides,
  } as OrderStatusView;
}

/** Đóng vai CatalogScreen: tự tính phase từ trạng thái máy chủ và nhích đồng hồ mỗi 500ms. */
function Harness(props: { view: OrderStatusView; phase?: CheckoutPhase; goHome: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  return (
    <DispenseSuccessGuide
      slot={2}
      order={order}
      view={props.view}
      phase={props.phase ?? phaseOf(props.view)}
      now={now}
      pressWindowSec={60}
      goHome={props.goHome}
    />
  );
}

const goHome = vi.fn();

function renderGuide(v: OrderStatusView, phase?: CheckoutPhase) {
  const ui = (next: OrderStatusView) => (
    <I18nProvider>
      <Harness view={next} phase={phase} goHome={goHome} />
    </I18nProvider>
  );
  const result = render(ui(v));
  return { ...result, update: (next: OrderStatusView) => result.rerender(ui(next)) };
}

/** Qua màn chúc mừng "Thanh toán thành công" để tới modal hướng dẫn (cần vi.useFakeTimers()). */
function skipSplash() {
  act(() => {
    vi.advanceTimersByTime(SUCCESS_SPLASH_MS);
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('DispenseSuccessGuide (FR-ORD-21, FR-ORD-26, FR-ORD-27)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    mockClaimPageUrl = null;
  });

  it('test_FR_ORD_26_success_splash_then_press_guide — chúc mừng ~2 giây rồi mới hiện hướng dẫn bấm nút', () => {
    vi.useFakeTimers();
    renderGuide(view({ status: 'PAID' }));

    expect(screen.getByText('Thanh toán thành công')).toBeTruthy();
    expect(screen.queryByTestId('dispense-guide')).toBeNull();

    skipSplash();

    expect(screen.queryByText('Thanh toán thành công')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Nhấn nút ở ô số' })).toBeTruthy();
    expect(screen.getByText('Đèn nút sắp sáng…')).toBeTruthy();
    expect(screen.getByText('Nhấn nút ô số 2 khi đèn sáng')).toBeTruthy();
    // Chỉ hướng dẫn nhận lượt xịt — không lặp lại mã giao dịch.
    expect(screen.queryByText(/ORD-20261004-ABC123/)).toBeNull();
  });

  it('đèn đã sáng thì mời bấm đúng nút và đếm ngược (FR-ORD-26)', () => {
    vi.useFakeTimers();
    renderGuide(
      view({
        status: 'DISPENSE_REQUESTED',
        dispenseStatus: 'ACKNOWLEDGED',
        pressDeadline: new Date(Date.now() + 45_000).toISOString(),
      }),
    );
    skipSplash();

    expect(screen.getByText('Đèn đã sáng — bấm ngay')).toBeTruthy();
    expect(screen.getByText(/Còn 4[23] giây/)).toBeTruthy();
  });

  it('test_FR_ORD_26_press_countdown_starts_when_guide_shows — đếm 60 giây từ lúc modal hướng dẫn hiện', () => {
    vi.useFakeTimers();
    renderGuide(view({ status: 'DISPENSE_REQUESTED', dispenseStatus: 'SENT' }));
    expect(screen.queryByText(/Còn \d+ giây/)).toBeNull();

    skipSplash();
    expect(screen.getByText('Còn 60 giây')).toBeTruthy();

    advance(30_000);
    expect(screen.getByText('Còn 30 giây')).toBeTruthy();
  });

  it('khi đang chờ lượt (WAITING_TURN) thì báo máy đang phục vụ khách trước (FR-DSP-26)', () => {
    vi.useFakeTimers();
    renderGuide(view({ status: 'PAID' }), 'WAITING_TURN');
    skipSplash();

    expect(screen.getByText('Máy đang phục vụ khách trước, chờ giây lát…')).toBeTruthy();
    // Chưa tới lượt thì chưa đếm giờ bấm nút.
    expect(screen.queryByText(/Còn \d+ giây/)).toBeNull();
  });

  it('test_FR_ORD_27_press_timeout_returns_home — đèn sáng mà không bấm sau 60 giây thì báo rồi về trang chủ', () => {
    vi.useFakeTimers();
    renderGuide(
      view({
        status: 'DISPENSE_REQUESTED',
        dispenseStatus: 'ACKNOWLEDGED',
        pressDeadline: new Date(Date.now() + 120_000).toISOString(),
      }),
    );
    skipSplash();

    advance(59_000);
    expect(screen.getByRole('heading', { name: 'Nhấn nút ở ô số' })).toBeTruthy();

    advance(1_000);
    expect(screen.getByText('Đã hết thời gian bấm nút')).toBeTruthy();
    expect(goHome).not.toHaveBeenCalled();

    advance(TIMEOUT_NOTICE_MS);
    expect(goHome).toHaveBeenCalled();
  });

  it('test_FR_ORD_21_light_never_on_shows_support_not_timeout — đèn chưa từng sáng thì báo sự cố, không đổ lỗi khách', () => {
    vi.useFakeTimers();
    renderGuide(view({ status: 'DISPENSE_REQUESTED', dispenseStatus: 'SENT' }));
    skipSplash();

    advance(60_000);
    expect(screen.getByText('Lượt xịt gặp sự cố')).toBeTruthy();
    expect(screen.getByText(/ORD-20261004-ABC123/)).toBeTruthy();
    expect(screen.queryByText('Đã hết thời gian bấm nút')).toBeNull();
  });

  it('test_FR_ORD_26_server_result_wins_over_local_timeout — khách bấm sát giờ, máy báo đã xịt thì cảm ơn', () => {
    vi.useFakeTimers();
    const { update } = renderGuide(
      view({
        status: 'DISPENSE_REQUESTED',
        dispenseStatus: 'ACKNOWLEDGED',
        pressDeadline: new Date(Date.now() + 120_000).toISOString(),
      }),
    );
    skipSplash();
    advance(60_000);
    expect(screen.getByText('Đã hết thời gian bấm nút')).toBeTruthy();

    update(view({ status: 'DISPENSED' }));
    expect(screen.getByText('Cảm ơn bạn!')).toBeTruthy();
  });

  it('khách không bấm thì báo hết thời gian, không hiện mã hỗ trợ (FR-ORD-27)', () => {
    renderGuide(view({ status: 'FORFEITED', failureCode: 'PRESS_TIMEOUT' }));

    expect(screen.getByText('Đã hết thời gian bấm nút')).toBeTruthy();
    expect(screen.getByText(/Đã hết 60 giây chờ bấm nút/)).toBeTruthy();
    expect(screen.queryByText(/ORD-20261004-ABC123/)).toBeNull();
  });

  it('khi đã xịt xong (DISPENSED), hiển thị thông điệp cảm ơn và nút quay về trang chủ', () => {
    renderGuide(view({ status: 'DISPENSED' }));

    expect(screen.getByText('Cảm ơn bạn!')).toBeTruthy();
    expect(screen.getByText('Chúc bạn một ngày thơm tho.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Trang chủ' })).toBeTruthy();
  });

  it('sự cố sau thanh toán thì hiện mã hỗ trợ, không nhắc tới nhân viên tại máy (FR-ORD-21, BR-001)', () => {
    renderGuide(view({ status: 'FAILED', supportReference: 'SUP-123' }));

    expect(screen.getByText('Lượt xịt gặp sự cố')).toBeTruthy();
    expect(screen.getByText(/SUP-123/)).toBeTruthy();
    expect(screen.queryByText(/nhân viên/)).toBeNull();
  });

  it('test_FR_ORD_21_no_success_splash_for_problem — tiền về muộn/sự cố thì không chúc mừng thanh toán', () => {
    renderGuide(view({ status: 'REFUND_PENDING', supportReference: 'SUP-9' }));

    expect(screen.queryByText('Thanh toán thành công')).toBeNull();
    // Đơn chưa từng có lệnh xịt: tiền về sau hạn — nói rõ là được hoàn tiền, không phải lỗi máy.
    expect(screen.getByText('Tiền về sau khi mã đã hết hạn')).toBeTruthy();
  });

  it('test_FR_ORD_21_problem_screen_shows_claim_qr_with_order_and_token', () => {
    mockClaimPageUrl = 'https://admin.scentstation.test/claim';
    renderGuide(view({ status: 'FAILED', supportReference: 'SUP-1', claimToken: 'tok123' }));

    const qr = screen.getByRole('img', { name: 'Quét mã để yêu cầu hoàn tiền' });
    expect(qr.tagName.toLowerCase()).toBe('svg');
    expect(screen.getByText(/trong vòng 24 giờ/)).toBeTruthy();
  });

  it('test_FR_ORD_21_no_claim_qr_without_token_or_claim_page', () => {
    mockClaimPageUrl = 'https://admin.scentstation.test/claim';
    const { unmount } = renderGuide(
      view({ status: 'FAILED', supportReference: 'SUP-1', claimToken: null }),
    );
    expect(screen.queryByRole('img', { name: 'Quét mã để yêu cầu hoàn tiền' })).toBeNull();
    unmount();

    mockClaimPageUrl = null;
    renderGuide(view({ status: 'FAILED', supportReference: 'SUP-1', claimToken: 'tok123' }));
    expect(screen.queryByRole('img', { name: 'Quét mã để yêu cầu hoàn tiền' })).toBeNull();
  });
});
