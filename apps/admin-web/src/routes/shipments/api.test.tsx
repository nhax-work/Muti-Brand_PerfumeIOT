import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useApproveAuthenticity, useReceiveShipment, useRegisterBottle } from './api';

const postMock = vi.fn();

vi.mock('@/shared/auth', () => ({ useReauth: () => async () => 'token' }));
vi.mock('@/shared/api', () => ({
  api: { POST: (path: string, init: unknown) => postMock(path, init) },
  unwrap: async (p: Promise<unknown>) => p,
}));

/** Các màn đọc kho chai — tab trong trang kho giữ nguyên khi chuyển tab nên chỉ tải lại khi bị đánh dấu cũ. */
const STOCK_KEYS = [
  ['bottles', 'IN_STOCK', 'p-1'],
  ['refill-worklist'],
  ['inventory-report', undefined],
] as const;

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const isStale = (key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated;

beforeEach(() => {
  postMock.mockReset();
  postMock.mockResolvedValue({});
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Kho chưa có chai: dữ liệu cũ đã nằm trong cache trước khi tiếp nhận lô.
  for (const key of STOCK_KEYS) client.setQueryData(key, { items: [], total: 0 });
});

describe('Làm mới kho chai sau khi đổi tồn kho', () => {
  it('test_FR_INV_26_receive_refreshes_bottles_and_refill_worklist — chai tự đăng ký khi tiếp nhận hiện ngay ở phiếu nạp', async () => {
    const { result } = renderHook(() => useReceiveShipment(), { wrapper });

    await act(() =>
      result.current.mutateAsync({ id: 'd-1', receivedQuantity: 10, batchNumber: 'L01' }),
    );

    for (const key of STOCK_KEYS) expect(isStale(key), JSON.stringify(key)).toBe(true);
  });

  it('test_FR_INV_02_register_bottle_refreshes_refill_worklist', async () => {
    const { result } = renderHook(() => useRegisterBottle(), { wrapper });

    await act(() =>
      result.current.mutateAsync({ batchId: 'b-1', identifier: 'X-001', initialVolumeMl: 100 }),
    );

    for (const key of STOCK_KEYS) expect(isStale(key), JSON.stringify(key)).toBe(true);
  });

  it('test_FR_INV_35_approve_authenticity_refreshes_refill_worklist — lô được duyệt thì chai lắp được', async () => {
    const { result } = renderHook(() => useApproveAuthenticity(), { wrapper });

    await act(() => result.current.mutateAsync('b-1'));

    expect(isStale(['refill-worklist'])).toBe(true);
  });
});
