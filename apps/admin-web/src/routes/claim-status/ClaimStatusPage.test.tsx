import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/shared/i18n';
import ClaimStatusPage from './ClaimStatusPage';
import { looksLikeClaimCode } from './claim-code';

const mockGet = vi.fn();

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, api: { GET: (...args: unknown[]) => mockGet(...args) } };
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
  mockGet.mockReset();
});

function renderAt(url: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <MemoryRouter initialEntries={[url]}>
          <ClaimStatusPage />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

function ok(data: Record<string, unknown>) {
  return { data, response: new Response(null, { status: 200 }) };
}

const BASE = {
  code: 'KN-7F3K9-2QDXA',
  amount: '42000.0000',
  currency: 'VND',
  createdAt: '2026-11-17T03:00:00Z',
  dueAt: null,
  closedAt: null,
  payoutReference: null,
  resolutionNote: null,
};

describe('Trang tra cứu khiếu nại (FR-ORD-36)', () => {
  it('test_FR_ORD_36_code_from_email_link_looks_up_immediately', async () => {
    mockGet.mockResolvedValue(
      ok({ ...BASE, status: 'OPEN', stage: 'PROCESSING', dueAt: '2026-11-18T03:00:00Z' }),
    );
    renderAt('/claim/status?code=KN-7F3K9-2QDXA&key=abc');

    expect(await screen.findByText('KN-7F3K9-2QDXA')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/public/refund-claims/{code}', {
      params: { path: { code: 'KN-7F3K9-2QDXA' } },
    });
    expect(screen.getByText('Đang xử lý')).toBeTruthy();
    expect(screen.getByText('Hạn xử lý dự kiến')).toBeTruthy();
    expect(screen.getByText(/42\.000 VND/)).toBeTruthy();
  });

  it('test_FR_ORD_36_refunded_claim_shows_transaction_code', async () => {
    mockGet.mockResolvedValue(
      ok({
        ...BASE,
        status: 'REFUNDED',
        stage: 'REFUNDED',
        closedAt: '2026-11-17T09:00:00Z',
        payoutReference: 'FT26111700001',
      }),
    );
    renderAt('/claim/status?code=KN-7F3K9-2QDXA');
    expect(await screen.findByText('FT26111700001')).toBeTruthy();
    expect(screen.getByText('Đã hoàn tiền')).toBeTruthy();
    expect(screen.getByText(/Đối chiếu mã giao dịch/)).toBeTruthy();
  });

  it('test_FR_ORD_36_rejected_claim_shows_reason', async () => {
    mockGet.mockResolvedValue(
      ok({
        ...BASE,
        status: 'REJECTED',
        stage: 'REJECTED',
        closedAt: '2026-11-17T09:00:00Z',
        resolutionNote: 'Hình camera cho thấy đã nhận lượt xịt',
      }),
    );
    renderAt('/claim/status?code=KN-7F3K9-2QDXA');
    expect(await screen.findByText('Hình camera cho thấy đã nhận lượt xịt')).toBeTruthy();
    expect(screen.getByText('Không được chấp nhận')).toBeTruthy();
  });

  it('test_FR_ORD_36_invalid_code_is_caught_before_calling_api', async () => {
    renderAt('/claim/status');
    fireEvent.change(screen.getByLabelText('Mã khiếu nại'), { target: { value: 'KN-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tra cứu' }));
    expect(await screen.findByText(/Mã khiếu nại gồm 10 chữ và số/)).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('test_FR_ORD_36_unknown_code_shows_server_message', async () => {
    mockGet.mockResolvedValue({
      error: { code: 'NOT_FOUND', message: 'Không tìm thấy khiếu nại.' },
      response: new Response(null, { status: 404 }),
    });
    renderAt('/claim/status');
    fireEvent.change(screen.getByLabelText('Mã khiếu nại'), {
      target: { value: 'kn 00000 00000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tra cứu' }));
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('test_FR_ORD_39_rejected_claim_shows_footage_with_email_key', async () => {
    mockGet.mockImplementation((path: string) =>
      Promise.resolve(
        path === '/public/refund-claims/{code}'
          ? ok({
              ...BASE,
              status: 'REJECTED',
              stage: 'REJECTED',
              closedAt: '2026-11-17T09:00:00Z',
              resolutionNote: 'Hình camera cho thấy đã nhận lượt xịt',
              hasEvidence: true,
            })
          : ok({
              items: [
                {
                  id: 'ev-1',
                  kind: 'VIDEO',
                  contentType: 'video/mp4',
                  recordedFrom: '2026-11-17T03:00:00Z',
                  recordedTo: '2026-11-17T03:02:00Z',
                  url: '/evidence-files/ev-1?exp=1&sig=x',
                  urlExpiresAt: '2026-11-17T09:05:00Z',
                },
              ],
            }),
      ),
    );
    renderAt('/claim/status?code=KN-7F3K9-2QDXA&key=khoa-email');
    expect(await screen.findByText('Hình ảnh đối chiếu')).toBeTruthy();
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith('/public/refund-claims/{code}/evidence', {
        params: { path: { code: 'KN-7F3K9-2QDXA' }, query: { key: 'khoa-email' } },
      }),
    );
    const video = await screen.findByLabelText('Hình ảnh đối chiếu');
    expect(video.getAttribute('src')).toBe('/api/v1/evidence-files/ev-1?exp=1&sig=x');
  });

  it('test_FR_ORD_39_code_only_lookup_asks_for_email_link', async () => {
    mockGet.mockResolvedValue(
      ok({
        ...BASE,
        status: 'REJECTED',
        stage: 'REJECTED',
        resolutionNote: 'x',
        hasEvidence: true,
      }),
    );
    renderAt('/claim/status?code=KN-7F3K9-2QDXA');
    expect(await screen.findByText(/mở đường dẫn trong email để xem/)).toBeTruthy();
    // Không có khóa thì không gọi API bằng chứng.
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('test_FR_ORD_36_client_code_check_matches_server_rules', () => {
    for (const ok of ['KN-7F3K9-2QDXA', 'kn7f3k92qdxa', ' 7f3k9 2qdxa ', 'KN-IL0O0-00000']) {
      expect(looksLikeClaimCode(ok)).toBe(true);
    }
    for (const bad of ['', 'KN-7F3K9', 'U000000000', '7F3K92QDXAB']) {
      expect(looksLikeClaimCode(bad)).toBe(false);
    }
  });
});
