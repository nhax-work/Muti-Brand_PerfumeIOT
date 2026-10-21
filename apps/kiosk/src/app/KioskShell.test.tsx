import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIdleReset } from '@/shared/hooks/useIdleReset';
import { I18nProvider } from '@/shared/i18n';
import { KioskSessionProvider, useKioskSession } from '@/shared/session';
import { KioskShell } from './KioskShell';

const mockNavigate = vi.fn();
let mockPathname = '/';
let mockOutOfService = false;

const mockCancelKioskOrder = vi.fn().mockResolvedValue({});

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return {
    ...actual,
    cancelKioskOrder: (...args: unknown[]) => mockCancelKioskOrder(...args),
  };
});

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: mockPathname }),
  useMatches: () => [],
  Outlet: () => <div data-testid="outlet-content">Outlet Content</div>,
}));

vi.mock('@/shared/hooks/useOutOfService', () => ({
  useOutOfService: () => mockOutOfService,
}));

vi.mock('@/screens/out-of-service/OutOfServiceScreen', () => ({
  default: () => <div data-testid="out-of-service">Out of service</div>,
}));

/** Giả lập màn thanh toán đã tạo đơn cho phiên này. */
function WithActiveOrder() {
  const { setActiveOrder } = useKioskSession();
  useEffect(() => {
    setActiveOrder({ id: 'order-1', paymentReference: 'ORD-1' });
  }, [setActiveOrder]);
  return null;
}

vi.mock('@/shared/hooks/useIdleReset', () => ({
  useIdleReset: vi.fn(),
}));

describe('KioskShell Header Navigation & Language Dropdown', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockCancelKioskOrder.mockReset().mockResolvedValue({});
    mockPathname = '/';
    mockOutOfService = false;
  });

  afterEach(() => {
    cleanup();
  });

  const renderShell = (withActiveOrder = false) =>
    render(
      <I18nProvider>
        <KioskSessionProvider>
          {withActiveOrder && <WithActiveOrder />}
          <KioskShell />
        </KioskSessionProvider>
      </I18nProvider>,
    );

  it('ở màn thanh toán chưa có đơn thì header vẫn giữ khách trong luồng thanh toán', () => {
    mockPathname = '/checkout/2';
    renderShell();

    expect(screen.queryByRole('button', { name: /Quay lại danh mục/i })).toBeNull();
  });

  it('đã có đơn thì ẩn nút Quay lại danh mục ở header — lỡ chạm là mất màn đếm ngược (FR-ORD-26)', () => {
    mockPathname = '/checkout/2';
    renderShell(true);

    expect(screen.queryByRole('button', { name: /Quay lại danh mục/i })).toBeNull();
  });

  it('mất kết nối khi chưa có đơn thì hiện màn tạm ngưng (FR-IOT-13)', () => {
    mockOutOfService = true;
    renderShell();

    expect(screen.getByTestId('out-of-service')).toBeTruthy();
    expect(screen.queryByTestId('outlet-content')).toBeNull();
  });

  it('mất kết nối khi đang có đơn thì giữ màn thanh toán và chỉ báo mất kết nối (FR-IOT-13, FR-ORD-21)', () => {
    mockPathname = '/checkout/2';
    mockOutOfService = true;
    renderShell(true);

    expect(screen.queryByTestId('out-of-service')).toBeNull();
    expect(screen.getByTestId('outlet-content')).toBeTruthy();
    expect(screen.getByText(/Mất kết nối với hệ thống/)).toBeTruthy();
  });

  it('ADR-0015: resetSession khi có activeOrder thì gọi cancelKioskOrder (Exit 2)', () => {
    let capturedReset: (() => void) | undefined;
    vi.mocked(useIdleReset).mockImplementation((onReset) => {
      capturedReset = onReset;
    });

    renderShell(true);
    expect(capturedReset).toBeDefined();

    capturedReset?.();
    expect(mockCancelKioskOrder).toHaveBeenCalledWith('order-1');
  });

  it('ở màn hình Home (/) hiển thị logo ScentStation và không hiện nút back', () => {
    mockPathname = '/';
    renderShell();

    expect(screen.getByText('ScentStation')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Trang chủ/i })).toBeNull();
  });

  it('ở màn hình danh mục (/catalog) hiển thị nút Trang chủ và điều hướng sang / khi bấm', () => {
    mockPathname = '/catalog';
    renderShell();

    const homeBtn = screen.getByRole('button', { name: /Trang chủ/i });
    expect(homeBtn).toBeTruthy();

    fireEvent.click(homeBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('ở trang chi tiết (/products/1) header không có nút quay lại — trang tự có, đi qua đường đóng bỏ đơn', () => {
    mockPathname = '/products/1';
    renderShell();

    expect(screen.queryByRole('button', { name: /Quay lại danh mục/i })).toBeNull();
  });

  it('nút gạt VI | EN: chạm một lần là đổi ngôn ngữ, không qua dropdown (NFR-USA-07)', () => {
    mockPathname = '/catalog';
    renderShell();

    const group = screen.getByRole('group', { name: 'Ngôn ngữ' });
    const vi = within(group).getByRole('button', { name: 'Tiếng Việt' });
    const en = within(group).getByRole('button', { name: 'English' });
    expect(vi.getAttribute('aria-pressed')).toBe('true');
    expect(en.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(en);

    expect(en.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('group', { name: 'Language' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Home/ })).toBeTruthy();
  });

  it('giữ màn giao dịch khi máy mất kết nối và không cho rời checkout bằng header', () => {
    mockPathname = '/checkout/2';
    mockOutOfService = true;
    renderShell();
    expect(screen.getByTestId('outlet-content')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Quay lại danh mục/i })).toBeNull();
  });
});
