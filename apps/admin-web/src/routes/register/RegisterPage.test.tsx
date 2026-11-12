import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/shared/i18n';
import RegisterPage from './RegisterPage';

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
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <MemoryRouter initialEntries={['/register']}>
          <RegisterPage />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe('Màn hình đăng ký thương hiệu (FR-USR-06)', () => {
  it('test_FR_USR_06_register_page_validates_required_fields', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));

    expect(await screen.findAllByText('Bắt buộc nhập')).toHaveLength(5);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('test_FR_USR_06_register_page_validates_password_confirmation', async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Tên thương hiệu'), {
      target: { value: 'Maison De Parfum' },
    });
    fireEvent.change(screen.getByLabelText('Họ tên'), {
      target: { value: 'Nguyễn Văn A' },
    });
    fireEvent.change(screen.getByPlaceholderText('contact@example.com'), {
      target: { value: 'contact@parfum.vn' },
    });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), {
      target: { value: 'Password123!' },
    });
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), {
      target: { value: 'PasswordMismatch!' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));

    expect(await screen.findByText('Hai mật khẩu không khớp')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('test_FR_USR_06_register_page_submits_successfully_and_shows_instructions', async () => {
    mockPost.mockResolvedValue({
      data: {
        brandId: 'brand-uuid-123',
        userId: 'user-uuid-456',
        email: 'contact@parfum.vn',
      },
      response: new Response(null, { status: 201 }),
    });

    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Tên thương hiệu'), {
      target: { value: 'Maison De Parfum' },
    });
    fireEvent.change(screen.getByLabelText('Họ tên'), {
      target: { value: 'Nguyễn Văn A' },
    });
    fireEvent.change(screen.getByPlaceholderText('contact@example.com'), {
      target: { value: 'contact@parfum.vn' },
    });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), {
      target: { value: 'Password123!' },
    });
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), {
      target: { value: 'Password123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost).toHaveBeenCalledWith('/auth/register-brand', {
      body: {
        brandName: 'Maison De Parfum',
        fullName: 'Nguyễn Văn A',
        email: 'contact@parfum.vn',
        password: 'Password123!',
      },
    });

    expect(await screen.findByText('Đăng ký thành công!')).toBeTruthy();
    expect(screen.getByText(/contact@parfum.vn/)).toBeTruthy();
  });
});
