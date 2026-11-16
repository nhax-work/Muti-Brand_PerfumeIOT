import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/shared/i18n';
import ForgotPasswordPage from './ForgotPasswordPage';

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

function renderPage() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/forgot-password']}>
        <ForgotPasswordPage />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('Màn hình quên mật khẩu (FR-AUTH-13)', () => {
  it('test_FR_AUTH_13_forgot_password_page_sends_request_and_shows_generic_notice', async () => {
    mockPost.mockResolvedValue({ data: undefined, response: new Response(null, { status: 204 }) });
    renderPage();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ops@scentstation.vn' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi liên kết đặt lại' }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost).toHaveBeenCalledWith('/auth/forgot-password', {
      body: { email: 'ops@scentstation.vn' },
    });
    // Câu trả lời chung — không khẳng định email có tài khoản.
    expect(await screen.findByText('Kiểm tra hộp thư của bạn')).toBeTruthy();
    expect(screen.getByText(/Nếu ops@scentstation\.vn có tài khoản ScentStation/)).toBeTruthy();
  });

  it('test_FR_AUTH_13_forgot_password_page_shows_rate_limit_error', async () => {
    mockPost.mockResolvedValue({
      error: {
        code: 'RATE_LIMITED',
        message: 'Bạn yêu cầu quá nhiều lần. Vui lòng thử lại sau một phút.',
        messageKey: 'auth.passwordResetRateLimited',
      },
      response: new Response(null, { status: 429 }),
    });
    renderPage();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ops@scentstation.vn' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi liên kết đặt lại' }));

    expect(
      await screen.findByText('Bạn yêu cầu quá nhiều lần. Vui lòng thử lại sau một phút.'),
    ).toBeTruthy();
    expect(screen.queryByText('Kiểm tra hộp thư của bạn')).toBeNull();
  });
});
