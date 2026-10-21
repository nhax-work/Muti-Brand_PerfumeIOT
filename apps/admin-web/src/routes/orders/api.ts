import type { components } from '@scentstation/contracts';
import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

export type Order = components['schemas']['Order'];
export type OrderStatus = components['schemas']['OrderStatus'];
export type OrderStatusHistoryEntry = components['schemas']['OrderStatusHistoryEntry'];

export interface OrderSearch {
  readonly page: number;
  readonly pageSize: number;
  readonly status?: OrderStatus;
  readonly paymentReference?: string;
  readonly from?: string;
  readonly to?: string;
}

/**
 * Tra cứu đơn (FR-ORD-22). Brand Admin chỉ nhận đơn BRAND của slot mình, trong kỳ hạn hóa đơn —
 * máy chủ lọc, màn hình không lọc thêm (FE5).
 */
export function useOrders(search: OrderSearch) {
  return useQuery({
    queryKey: ['orders', search],
    queryFn: () => unwrap(api.GET('/orders', { params: { query: search } })),
  });
}

/** Đơn đã trả tiền mà lượt xịt thất bại hoặc không xác định, cũ nhất trước (FR-ORD-19). */
export function useManualReviewOrders(page: number, enabled: boolean) {
  return useQuery({
    queryKey: ['orders', 'manual-review', page],
    queryFn: () =>
      unwrap(api.GET('/orders/manual-review', { params: { query: { page, pageSize: 20 } } })),
    enabled,
  });
}

/** Lịch sử chuyển trạng thái kèm lý do (FR-ORD-18). */
export function useOrderHistory(orderId: string | undefined) {
  return useQuery({
    queryKey: ['orders', orderId, 'history'],
    queryFn: () => unwrap(api.GET('/orders/{id}/history', { params: { path: { id: orderId! } } })),
    enabled: Boolean(orderId),
  });
}

/**
 * Lệnh xịt của đơn kèm kết quả từ thiết bị (FR-DSP-16, FR-DSP-20). Đơn chưa từng được ghi lệnh thì
 * máy chủ trả NOT_FOUND — không thử lại.
 */
export function useOrderDispenseCommand(orderId: string | undefined) {
  return useQuery({
    queryKey: ['orders', orderId, 'dispense-command'],
    queryFn: () =>
      unwrap(api.GET('/orders/{id}/dispense-command', { params: { path: { id: orderId! } } })),
    enabled: Boolean(orderId),
    retry: false,
  });
}
