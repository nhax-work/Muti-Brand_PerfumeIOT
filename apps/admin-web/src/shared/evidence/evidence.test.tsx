import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/shared/i18n';
import { EvidencePanel } from './EvidencePanel';
import { RefillEvidenceDrawer } from './RefillEvidenceDrawer';

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return {
    ...actual,
    api: {
      GET: (...args: unknown[]) => mockGet(...args),
      POST: (...args: unknown[]) => mockPost(...args),
    },
  };
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
  mockPost.mockReset();
});

function wrap(children: ReactNode) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider>{children}</I18nProvider>
    </QueryClientProvider>,
  );
}

const ok = (data: unknown) => ({ data, response: new Response(null, { status: 200 }) });

const VIDEO = {
  id: 'ev-1',
  kind: 'VIDEO',
  contentType: 'video/mp4',
  sizeBytes: 1000,
  sha256: 'a'.repeat(64),
  cameraLabel: 'Cam-03',
  recordedFrom: '2026-11-17T03:00:00Z',
  recordedTo: '2026-11-17T03:02:00Z',
  clockOffsetSec: 0,
  note: 'Đèn nút 1 sáng rồi tắt',
  uploadedBy: 'user-ops',
  uploadedAt: '2026-11-17T05:00:00Z',
  removedAt: null,
  removedReason: null,
  purgedAt: null,
  url: '/evidence-files/ev-1?exp=1&sig=x',
  urlExpiresAt: '2026-11-17T05:05:00Z',
};

const WINDOW = {
  machineId: 'm-1',
  machineName: 'Máy Vincom',
  cameraLabel: 'Cam-03',
  from: '2026-11-17T02:59:00Z',
  to: '2026-11-17T03:03:00Z',
};

function routeGet(path: string) {
  if (path.endsWith('/evidence-window')) return Promise.resolve(ok(WINDOW));
  if (path.endsWith('/evidence')) return Promise.resolve(ok({ items: [VIDEO], maxItems: 5 }));
  if (path === '/footage-requests')
    return Promise.resolve(ok({ items: [], meta: { page: 1, pageSize: 20, total: 0 } }));
  return Promise.reject(new Error(`GET lạ: ${path}`));
}

describe('Bằng chứng camera — giao diện (ADR-0032)', () => {
  it('test_FR_ORD_38_assignee_sees_window_and_upload_form', async () => {
    mockGet.mockImplementation(routeGet);
    wrap(
      <EvidencePanel
        target={{ kind: 'claim', id: 'claim-1' }}
        canUpload
        closed={false}
        currentUserId="user-ops"
      />,
    );
    expect(await screen.findByText('Máy Vincom')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tải bằng chứng lên' })).toBeTruthy();
    // Video phát qua đường dẫn ký, ghép với gốc API.
    const video = await screen.findByLabelText(/Cam-03 ·/);
    expect(video.getAttribute('src')).toBe('/api/v1/evidence-files/ev-1?exp=1&sig=x');
    // Người tải thấy nút gỡ khi hồ sơ còn mở.
    expect(screen.getByRole('button', { name: 'Gỡ' })).toBeTruthy();
    expect(screen.getByText('1/5 tệp')).toBeTruthy();
  });

  it('test_FR_ORD_38_closed_claim_is_read_only', async () => {
    mockGet.mockImplementation(routeGet);
    wrap(
      <EvidencePanel
        target={{ kind: 'claim', id: 'claim-1' }}
        canUpload
        closed
        currentUserId="user-ops"
      />,
    );
    expect(await screen.findByLabelText(/Cam-03 ·/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Tải bằng chứng lên' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Gỡ' })).toBeNull();
    // Không hỏi khung giờ khi không tải lên được.
    expect(mockGet).not.toHaveBeenCalledWith(
      '/refund-claims/{id}/evidence-window',
      expect.anything(),
    );
  });

  it('test_FR_INV_39_brand_admin_requests_footage', async () => {
    mockGet.mockImplementation((path: string) => routeGet(path.replace('{id}', 'x')));
    mockPost.mockResolvedValue({
      data: { id: 'fr-1', status: 'OPEN' },
      response: new Response(null, { status: 201 }),
    });
    wrap(
      <RefillEvidenceDrawer
        session={{
          id: 'rs-1',
          performedBy: 'user-inv',
          startedAt: new Date().toISOString(),
          slotNumber: 2,
          brandName: 'Thương hiệu A',
        }}
        canOperate={false}
        isBrand
        currentUserId="user-brand"
        onClose={() => {}}
      />,
    );
    fireEvent.change(await screen.findByLabelText('Lý do yêu cầu'), {
      target: { value: 'Mùi khác mẫu' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Yêu cầu trích hình' }));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/refill-sessions/{id}/footage-requests', {
        params: { path: { id: 'rs-1' } },
        body: { reason: 'Mùi khác mẫu' },
      }),
    );
    // Brand Admin không có biểu mẫu tải lên.
    expect(screen.queryByRole('button', { name: 'Tải bằng chứng lên' })).toBeNull();
  });

  it('test_FR_INV_38_performer_cannot_upload_own_refill_evidence', async () => {
    mockGet.mockImplementation((path: string) => routeGet(path));
    wrap(
      <RefillEvidenceDrawer
        session={{ id: 'rs-1', performedBy: 'user-ops', startedAt: new Date().toISOString() }}
        canOperate
        isBrand={false}
        currentUserId="user-ops"
        onClose={() => {}}
      />,
    );
    expect(await screen.findByLabelText(/Cam-03 ·/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Tải bằng chứng lên' })).toBeNull();
  });
});
