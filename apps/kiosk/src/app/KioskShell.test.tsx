import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/shared/i18n';
import { KioskSessionProvider, useKioskSession } from '@/shared/session';
import { KioskShell } from './KioskShell';

const mockNavigate = vi.fn();
let mockPathname = '/';

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: mockPathname }),
  useMatches: () => [],
  Outlet: () => <div data-testid="outlet-content">Outlet Content</div>,
}));

let mockOutOfService = false;

vi.mock('@/shared/hooks/useOutOfService', () => ({
  useOutOfService: () => mockOutOfService,
}));

vi.mock('@/screens/out-of-service/OutOfServiceScreen', () => ({
  default: () => <div data-testid="out-of-service">Out of service</div>,
}));

/** Giả lập CheckoutScreen đã tạo đơn cho phiên này. */
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

  it('ở màn thanh toán chưa có đơn thì vẫn có nút Quay lại danh mục', () => {
    mockPathname = '/checkout/2';
    renderShell();

    expect(screen.getByRole('button', { name: /Quay lại danh mục/i })).toBeTruthy();
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

  it('ở màn hình Home (/) hiển thị logo ScentStation và không hiện nút back', () => {
    mockPathname = '/';
    renderShell();

    expect(screen.getByText(/ScentStation/i)).toBeTruthy();
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

  it('ở màn hình chi tiết sản phẩm (/products/1) hiển thị nút Quay lại danh mục và điều hướng sang /catalog', () => {
    mockPathname = '/products/1';
    renderShell();

    const backBtn = screen.getByRole('button', { name: /Quay lại danh mục/i });
    expect(backBtn).toBeTruthy();

    fireEvent.click(backBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/catalog');
  });

  it('dropdown ngôn ngữ: bấm mở menu dropdown và chuyển đổi sang Tiếng Anh', () => {
    renderShell();

    const trigger = screen.getByRole('button', { name: /Chọn ngôn ngữ/i });
    expect(trigger).toBeTruthy();
    expect(screen.getByText('Tiếng Việt')).toBeTruthy();

    // Mở dropdown
    fireEvent.click(trigger);

    // Tìm và chọn Tiếng Anh trong dropdown
    const englishOption = screen.getByRole('option', { name: /Tiếng Anh/i });
    expect(englishOption).toBeTruthy();
    fireEvent.click(englishOption);

    // Dropdown đóng lại và ngôn ngữ đổi sang Tiếng Anh
    expect(screen.getByText('Tiếng Anh')).toBeTruthy();
  });
});
