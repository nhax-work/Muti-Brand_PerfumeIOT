import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/shared/i18n';
import { KioskSessionProvider } from '@/shared/session';
import { KioskShell } from './KioskShell';

const mockNavigate = vi.fn();
let mockPathname = '/';

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: mockPathname }),
  useMatches: () => [],
  Outlet: () => <div data-testid="outlet-content">Outlet Content</div>,
}));

vi.mock('@/shared/hooks/useOutOfService', () => ({
  useOutOfService: () => false,
}));

vi.mock('@/shared/hooks/useIdleReset', () => ({
  useIdleReset: vi.fn(),
}));

describe('KioskShell Header Navigation & Language Dropdown', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockPathname = '/';
  });

  afterEach(() => {
    cleanup();
  });

  const renderShell = () =>
    render(
      <I18nProvider>
        <KioskSessionProvider>
          <KioskShell />
        </KioskSessionProvider>
      </I18nProvider>,
    );

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
