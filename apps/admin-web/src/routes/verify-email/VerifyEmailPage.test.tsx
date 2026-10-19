import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/shared/i18n';
import VerifyEmailPage from './VerifyEmailPage';

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
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <MemoryRouter initialEntries={[url]}>
          <VerifyEmailPage />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe('Màn hình xác minh email (FR-USR-07)', () => {
  it('test_FR_USR_07_verify_email_page_warns_when_token_missing', () => {
    renderPage('/verify-email');
    expect(screen.getByText('Đường dẫn xác minh thiếu mã token hợp lệ.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('test_FR_USR_07_verify_email_page_calls_api_and_shows_success', async () => {
    mockPost.mockResolvedValue({
      data: undefined,
      response: new Response(null, { status: 204 }),
    });

    renderPage('/verify-email?token=valid-token-123456');

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost).toHaveBeenCalledWith('/auth/verify-email', {
      body: { token: 'valid-token-123456' },
    });

    expect(await screen.findByText('Xác minh email thành công!')).toBeTruthy();
    expect(
      screen.getByText('Email đã được xác minh. Bạn có thể tạo phiên thuê slot.'),
    ).toBeTruthy();
  });

  it('test_FR_USR_07_verify_email_page_handles_failure', async () => {
    mockPost.mockResolvedValue({
      error: { code: 'VALIDATION_ERROR', message: 'Mã xác minh email đã hết hạn' },
      response: new Response(null, { status: 400 }),
    });

    renderPage('/verify-email?token=expired-token-123456');

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Xác minh email thất bại')).toBeTruthy();
  });
});
