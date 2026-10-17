import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { RequireAuth } from '@/app/guards/RequireAuth';
import { I18nProvider } from '@/shared/i18n';
import { installDomStubs } from '@/test-utils';
import ChangePasswordPage from './ChangePasswordPage';

const mockLogout = vi.fn().mockResolvedValue(undefined);
let mockUser = { id: 'u-1', mustChangePassword: true, roles: ['BRAND_ADMIN'] };
vi.mock('@/shared/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/auth')>()),
  useAuth: () => ({ status: 'authenticated', user: mockUser, logout: mockLogout }),
}));

const mockPost = vi
  .fn()
  .mockResolvedValue({ data: undefined, response: new Response(null, { status: 204 }) });
vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, api: { ...actual.api, POST: (...args: unknown[]) => mockPost(...args) } };
});

beforeAll(installDomStubs);
afterEach(() => {
  cleanup();
  mockPost.mockClear();
  mockLogout.mockClear();
  mockUser = { id: 'u-1', mustChangePassword: true, roles: ['BRAND_ADMIN'] };
});

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/change-password"
              element={
                <RequireAuth>
                  <ChangePasswordPage />
                </RequireAuth>
              }
            />
            <Route
              path="/products"
              element={
                <RequireAuth>
                  <div>trang sản phẩm</div>
                </RequireAuth>
              }
            />
            <Route path="/login" element={<div>trang đăng nhập</div>} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe('Đổi mật khẩu (ADR-0004)', () => {
  it('tài khoản INVITED vào trang khác bị đưa tới đổi mật khẩu', () => {
    renderAt('/products');
    expect(screen.queryByText('trang sản phẩm')).toBeNull();
    expect(screen.getByText(/mật khẩu tạm/)).toBeTruthy();
  });

  it('tài khoản đã đổi mật khẩu vào trang bình thường', () => {
    mockUser = { ...mockUser, mustChangePassword: false };
    renderAt('/products');
    expect(screen.getByText('trang sản phẩm')).toBeTruthy();
  });

  it('nhập lại không khớp thì không gửi; khớp thì đổi, xóa phiên và về đăng nhập', async () => {
    renderAt('/change-password');
    const [current, next, confirm] = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="password"]'),
    );
    fireEvent.change(current!, { target: { value: 'TamThoi-123456' } });
    fireEvent.change(next!, { target: { value: 'MatKhauMoi-2026' } });
    fireEvent.change(confirm!, { target: { value: 'KhacNhau-2026' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Đổi mật khẩu/ })[0]!);
    expect(await screen.findByText('Hai mật khẩu không khớp')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();

    fireEvent.change(confirm!, { target: { value: 'MatKhauMoi-2026' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Đổi mật khẩu/ })[0]!);
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/auth/change-password', {
        body: { currentPassword: 'TamThoi-123456', newPassword: 'MatKhauMoi-2026' },
      }),
    );
    // Máy chủ đã thu hồi mọi phiên: client xóa phiên của mình rồi về trang đăng nhập.
    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
    expect(await screen.findByText('trang đăng nhập')).toBeTruthy();
  });
});
