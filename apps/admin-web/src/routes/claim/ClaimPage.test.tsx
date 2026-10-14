import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/shared/i18n';
import ClaimPage from './ClaimPage';

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

function renderAt(url: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <MemoryRouter initialEntries={[url]}>
          <ClaimPage />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe('Trang khiếu nại hoàn tiền (FR-ORD-29)', () => {
  it('test_FR_ORD_29_claim_page_rejects_link_without_codes', () => {
    renderAt('/claim?o=only-order');
    expect(screen.getByText(/Đường dẫn không hợp lệ/)).toBeTruthy();
  });

  it('test_FR_ORD_29_claim_page_requires_consent_before_submit', async () => {
    renderAt('/claim?o=order-1&t=tok-1');
    fireEvent.change(screen.getByLabelText('Số điện thoại hoặc email'), {
      target: { value: '0909123456' },
    });
    fireEvent.change(screen.getByLabelText('Số tài khoản'), { target: { value: '0123456789' } });
    fireEvent.change(screen.getByLabelText('Tên chủ tài khoản'), {
      target: { value: 'nguyen van a' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }));
    expect(await screen.findByText('Vui lòng đồng ý để chúng tôi có thể hoàn tiền')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('test_FR_ORD_29_claim_page_submits_and_shows_receipt', async () => {
    mockPost.mockResolvedValue({
      data: {
        id: 'abcdef12-0000-4000-8000-000000000000',
        status: 'OPEN',
        amount: '42000.0000',
        currency: 'VND',
        createdAt: '2026-10-14T03:00:00Z',
      },
      response: new Response(null, { status: 201 }),
    });
    renderAt('/claim?o=order-1&t=tok-1');

    fireEvent.change(screen.getByLabelText('Số điện thoại hoặc email'), {
      target: { value: '0909123456' },
    });
    fireEvent.mouseDown(screen.getByLabelText('Ngân hàng nhận tiền'));
    fireEvent.click(await screen.findByText('MB Bank'));
    fireEvent.change(screen.getByLabelText('Số tài khoản'), { target: { value: '0123456789' } });
    fireEvent.change(screen.getByLabelText('Tên chủ tài khoản'), {
      target: { value: 'nguyen van a' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost).toHaveBeenCalledWith('/public/refund-claims', {
      body: {
        orderId: 'order-1',
        claimToken: 'tok-1',
        contact: '0909123456',
        refundAccount: {
          bankBin: '970422',
          accountNumber: '0123456789',
          accountName: 'NGUYEN VAN A',
        },
        consent: true,
      },
    });
    expect(await screen.findByText('Đã nhận yêu cầu hoàn tiền')).toBeTruthy();
    expect(screen.getByText(/42\.000 VND/)).toBeTruthy();
  });
});
