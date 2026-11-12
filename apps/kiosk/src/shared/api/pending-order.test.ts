import { afterEach, describe, expect, it, vi } from 'vitest';

const mockPost = vi.fn();
vi.mock('./client', () => ({ api: { POST: (...args: unknown[]) => mockPost(...args) } }));

const { cancelOrphanedOrder, forgetPendingOrder, rememberPendingOrder } = await import('./orders');

afterEach(() => {
  mockPost.mockReset();
  localStorage.clear();
});

describe('Đơn chờ thanh toán của phiên trước (ADR-0015 mục 3)', () => {
  it('còn đơn đã ghi nhớ thì hủy đúng đơn đó rồi quên đi', async () => {
    mockPost.mockResolvedValue({ data: {}, response: new Response(null, { status: 200 }) });
    rememberPendingOrder('order-orphan');
    await cancelOrphanedOrder();
    expect(mockPost).toHaveBeenCalledWith(
      '/kiosk/orders/{id}/cancel',
      expect.objectContaining({ params: { path: { id: 'order-orphan' } } }),
    );
    await cancelOrphanedOrder();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('máy chủ từ chối hủy (đơn đã trả tiền) thì vẫn quên, không ném lỗi', async () => {
    mockPost.mockResolvedValue({
      error: { code: 'ORDER_NOT_CANCELLABLE', message: 'x' },
      response: new Response(null, { status: 409 }),
    });
    rememberPendingOrder('order-paid');
    await expect(cancelOrphanedOrder()).resolves.toBeUndefined();
    expect(localStorage.length).toBe(0);
  });

  it('không có đơn ghi nhớ thì không gọi máy chủ', async () => {
    forgetPendingOrder();
    await cancelOrphanedOrder();
    expect(mockPost).not.toHaveBeenCalled();
  });
});
