import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/shared/i18n';
import ResetPasswordPage from './ResetPasswordPage';

const mockPost = vi.fn();

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, api: { POST: (...args: unknown[]) => mockPost(...args) } };
});

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
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
  mockPost.mockReset();
});

function renderPage(url: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[url]}>
        <ResetPasswordPage />
      </MemoryRouter>
    </I18nProvider>,
  );
}

function fillPasswords(password: string, confirm = password) {
  fireEvent.change(screen.getByLabelText('Mật khẩu mới'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu mới'), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: 'Đặt mật khẩu mới' }));
}

describe('Màn hình đặt mật khẩu mới (FR-AUTH-13)', () => {
  it('test_FR_AUTH_13_reset_page_warns_when_token_missing', () => {
    renderPage('/reset-password');
    expect(
      screen.getByText(
        'Đường dẫn đặt lại mật khẩu thiếu mã hợp lệ. Vui lòng yêu cầu liên kết mới.',
      ),
    ).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('test_FR_AUTH_13_reset_page_submits_token_and_new_password', async () => {
    mockPost.mockResolvedValue({ data: undefined, response: new Response(null, { status: 204 }) });
    renderPage('/reset-password?token=reset-token-1234567890');

    fillPasswords('MatKhauMoi#2026');

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost).toHaveBeenCalledWith('/auth/reset-password', {
      body: { token: 'reset-token-1234567890', newPassword: 'MatKhauMoi#2026' },
    });
    expect(await screen.findByText('Đã đặt mật khẩu mới')).toBeTruthy();
  });

  it('test_FR_AUTH_13_reset_page_blocks_mismatched_confirmation', async () => {
    renderPage('/reset-password?token=reset-token-1234567890');

    fillPasswords('MatKhauMoi#2026', 'MatKhauKhac#2026');

    expect(await screen.findByText('Hai mật khẩu không khớp')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('test_FR_AUTH_13_reset_page_shows_invalid_token_error', async () => {
    mockPost.mockResolvedValue({
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Liên kết đặt lại mật khẩu không hợp lệ, đã hết hạn hoặc đã được dùng. Vui lòng yêu cầu liên kết mới.',
        messageKey: 'auth.invalidResetToken',
      },
      response: new Response(null, { status: 400 }),
    });
    renderPage('/reset-password?token=used-token-1234567890');

    fillPasswords('MatKhauMoi#2026');

    expect(
      await screen.findByText(
        'Liên kết đặt lại mật khẩu không hợp lệ, đã hết hạn hoặc đã được dùng. Vui lòng yêu cầu liên kết mới.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Yêu cầu liên kết mới' })).toBeTruthy();
  });
});
