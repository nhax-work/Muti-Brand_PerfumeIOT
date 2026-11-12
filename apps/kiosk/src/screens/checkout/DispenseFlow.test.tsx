import { act, cleanup, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderStatusView } from '@/shared/api';
import { playChime } from '@/shared/audio/chime';
import { I18nProvider } from '@/shared/i18n';
import { ShellChromeContext } from '@/shared/shell/chrome';
import { phaseOf, type CheckoutPhase } from './checkout-phase';
import DispenseFlow from './DispenseFlow';

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

vi.mock('@/shared/audio/chime', () => ({ playChime: vi.fn(), unlockAudio: vi.fn() }));

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

/** Đóng vai CatalogScreen: tính phase từ trạng thái máy chủ và nhích đồng hồ mỗi 500ms. */
function Harness(props: { view: OrderStatusView; phase?: CheckoutPhase; goHome: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  return (
    <DispenseFlow
      slot={2}
      productName="Matinale"
      order={order}
      view={props.view}
      phase={props.phase ?? phaseOf(props.view)}
      now={now}
      goHome={props.goHome}
    />
  );
}

const goHome = vi.fn();

const setDarkHeader = vi.fn();

function renderFlow(v: OrderStatusView, phase?: CheckoutPhase) {
  const ui = (next: OrderStatusView) => (
    <I18nProvider>
      <ShellChromeContext.Provider value={setDarkHeader}>
        <Harness view={next} phase={phase} goHome={goHome} />
      </ShellChromeContext.Provider>
    </I18nProvider>
  );
  const result = render(ui(v));
  return { ...result, update: (next: OrderStatusView) => result.rerender(ui(next)) };
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const lit = (secondsFromNow: number) =>
  view({
    status: 'DISPENSE_REQUESTED',
    dispenseStatus: 'ACKNOWLEDGED',
    pressDeadline: new Date(Date.now() + secondsFromNow * 1000).toISOString(),
  });

describe('DispenseFlow — ánh xạ trạng thái máy chủ sang màn (FR-ORD-21, 26, 27, 28)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    mockClaimPageUrl = null;
  });

  it('test_FR_ORD_26_paid_shows_preparing_without_countdown — vừa trả tiền: chuẩn bị máy, chưa đếm giờ', () => {
    vi.useFakeTimers();
    renderFlow(view({ status: 'PAID' }));

    expect(screen.getByRole('heading', { name: 'Đã nhận thanh toán' })).toBeTruthy();
    expect(screen.getByText('Đang chuẩn bị máy…')).toBeTruthy();
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.queryByText(/ORD-20261004-ABC123/)).toBeNull();
  });

  it('test_FR_ORD_26_waiting_turn_reassures_without_error — đã trả tiền, chờ lượt (FR-DSP-26): lượt tiếp theo, tên hương, số nút, không nút thử lại', () => {
    renderFlow(view({ status: 'PAID' }), 'WAITING_TURN');

    expect(screen.getByRole('heading', { name: 'Đã nhận thanh toán' })).toBeTruthy();
    expect(screen.getByText(/Bạn là lượt tiếp theo/)).toBeTruthy();
    expect(screen.getByText('Matinale')).toBeTruthy();
    expect(screen.getByLabelText('Nút số 2').textContent).toBe('2');
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.queryByText(/sự cố|Xin lỗi/)).toBeNull();
  });

  it('test_FR_ORD_26_command_sent_is_not_lit — lệnh mới tới máy, đèn chưa sáng: không đếm, không tự báo sự cố', () => {
    vi.useFakeTimers();
    renderFlow(view({ status: 'DISPENSE_REQUESTED', dispenseStatus: 'SENT' }));

    advance(120_000);
    expect(screen.getByText('Đang chuẩn bị máy…')).toBeTruthy();
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.queryByText(/Xin lỗi/)).toBeNull();
  });

  it('test_FR_ORD_26_prompt_press_with_countdown — đèn sáng: số nút lớn, "Nhấn nút số N", đếm theo pressDeadline máy chủ', () => {
    vi.useFakeTimers();
    renderFlow(lit(45));

    expect(screen.getByRole('heading', { name: 'Nhấn nút số 2' })).toBeTruthy();
    expect(screen.getByLabelText('Nút số 2').textContent).toBe('2');
    expect(screen.getByRole('timer').textContent).toMatch(/Còn 4[45] giây/);
    expect(playChime).toHaveBeenCalledOnce();
    // Header chuyển nền tối cùng màn, ẩn đổi ngôn ngữ.
    expect(setDarkHeader).toHaveBeenLastCalledWith(true);

    advance(10_000);
    expect(screen.getByRole('timer').textContent).toMatch(/Còn 3[45] giây/);
  });

  it('test_FR_ORD_26_press_steps_light_in_turn — ba bước sáng lần lượt 01 → 02 → 03', () => {
    vi.useFakeTimers();
    renderFlow(lit(45));
    const active = () =>
      screen.getAllByRole('listitem').findIndex((li) => li.getAttribute('data-active') === 'true');

    expect(screen.getByText('Đưa cổ tay cách vòi 10–15 cm')).toBeTruthy();
    expect(screen.getByText('Nhấn nút số 2 đang sáng')).toBeTruthy();
    expect(active()).toBe(0);
    advance(2500);
    expect(active()).toBe(1);
    advance(2500);
    expect(active()).toBe(2);
    advance(2500);
    expect(active()).toBe(0);
  });

  it('test_FR_ORD_26_deadline_passed_waits_for_server — quá hạn mà máy chủ chưa báo: chỉ "đang xác nhận", không tự kết luận', () => {
    vi.useFakeTimers();
    renderFlow(lit(5));

    advance(6_000);
    expect(screen.getByRole('heading', { name: 'Đang xác nhận kết quả với máy…' })).toBeTruthy();
    expect(screen.queryByText('Đã hết thời gian bấm nút')).toBeNull();
    expect(goHome).not.toHaveBeenCalled();
  });

  it('test_FR_ORD_26_server_result_wins — khách bấm sát giờ, máy chủ báo đã xịt thì cảm ơn kèm tên hương', () => {
    vi.useFakeTimers();
    const { update } = renderFlow(lit(1));
    advance(2_000);

    update(view({ status: 'DISPENSED' }));
    expect(screen.getByRole('heading', { name: 'Cảm ơn bạn!' })).toBeTruthy();
    expect(screen.getByText('Matinale')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Trang chủ' })).toBeTruthy();
  });

  it('test_FR_ORD_27_forfeit_order_on_press_timeout — bỏ lượt: báo nhã nhặn, không hiện mã hỗ trợ', () => {
    renderFlow(view({ status: 'FORFEITED', failureCode: 'PRESS_TIMEOUT' }));

    expect(screen.getByRole('heading', { name: 'Đã hết thời gian bấm nút' })).toBeTruthy();
    expect(screen.getByText(/qua 60 giây để nhấn nút/)).toBeTruthy();
    expect(screen.queryByText(/ORD-20261004-ABC123/)).toBeNull();
  });

  it('test_FR_ORD_21_kiosk_error_guidance_display — sự cố sau thanh toán: xin lỗi, mã tham chiếu, không nhắc nhân viên', () => {
    renderFlow(view({ status: 'FAILED', supportReference: 'SUP-123' }));

    expect(screen.getByRole('heading', { name: /Xin lỗi/ })).toBeTruthy();
    expect(screen.getAllByText(/SUP-123/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/nhân viên tại máy/)).toBeNull();
  });

  it('test_FR_ORD_21_late_payment_is_refund_not_machine_fault — tiền về sau hạn: nói rõ được hoàn tiền', () => {
    renderFlow(view({ status: 'REFUND_PENDING', supportReference: 'SUP-9' }));

    expect(screen.getByText('Tiền về sau khi mã đã hết hạn')).toBeTruthy();
    expect(screen.queryByText('Đã nhận thanh toán')).toBeNull();
  });

  it('test_FR_ORD_28_kiosk_shows_claim_qr_only_for_unserved_paid_orders — QR khiếu nại chỉ khi máy chủ trả claimToken', () => {
    mockClaimPageUrl = 'https://admin.scentstation.test/claim';
    const { unmount } = renderFlow(
      view({ status: 'FAILED', supportReference: 'SUP-1', claimToken: 'tok123' }),
    );
    const qr = screen.getByRole('img', { name: 'Quét mã để yêu cầu hoàn tiền' });
    expect(qr.tagName.toLowerCase()).toBe('svg');
    expect(screen.getByText(/trong vòng 24 giờ/)).toBeTruthy();
    unmount();

    renderFlow(view({ status: 'FAILED', supportReference: 'SUP-1', claimToken: null }));
    expect(screen.queryByRole('img', { name: 'Quét mã để yêu cầu hoàn tiền' })).toBeNull();
    cleanup();

    mockClaimPageUrl = null;
    renderFlow(view({ status: 'FAILED', supportReference: 'SUP-1', claimToken: 'tok123' }));
    expect(screen.queryByRole('img', { name: 'Quét mã để yêu cầu hoàn tiền' })).toBeNull();
  });
});
