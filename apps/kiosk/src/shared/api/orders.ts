import { useMutation, useQuery } from '@tanstack/react-query';
import type { components } from '@scentstation/contracts';
import { config } from '@/shared/config';
import { api } from './client';
import { unwrap } from './errors';

export type OrderCreated = components['schemas']['OrderCreated'];
export type OrderStatusView = components['schemas']['OrderStatusView'];

/** Đơn không còn đổi trạng thái — ngừng poll (FR-ORD-10). */
const SETTLED_STATUSES = new Set([
  'DISPENSED',
  'FORFEITED',
  'EXPIRED',
  'FAILED',
  'REFUND_PENDING',
  'REFUNDED',
]);

export function isSettled(status: OrderStatusView['status'] | undefined): boolean {
  return status !== undefined && SETTLED_STATUSES.has(status);
}

export interface CreateOrderParams {
  readonly slotId: string;
  readonly kioskSessionId: string;
  /** Sinh một lần cho mỗi ý định mua — bấm lại hay mạng chập chờn không tạo đơn thứ hai. */
  readonly idempotencyKey: string;
}

/** FR-ORD-04..09: tạo đơn và nhận mã thanh toán. */
export function useCreateOrder() {
  return useMutation({
    mutationFn: (params: CreateOrderParams) =>
      unwrap(
        api.POST('/kiosk/orders', {
          params: { header: { 'Idempotency-Key': params.idempotencyKey } },
          body: {
            machineSerial: config.machineSerial,
            slotId: params.slotId,
            kioskSessionId: params.kioskSessionId,
          },
        }),
      ),
  });
}

/** FR-ORD-11: poll trạng thái đơn tới khi đơn kết thúc. */
export function useOrderStatus(orderId: string | null) {
  return useQuery({
    queryKey: ['kiosk', 'order-status', orderId],
    queryFn: () =>
      unwrap(
        api.GET('/kiosk/orders/{id}/status', {
          params: { path: { id: orderId as string } },
        }),
      ),
    enabled: orderId !== null,
    refetchInterval: (query) =>
      isSettled(query.state.data?.status) ? false : config.orderStatusPollMs,
    retry: true,
  });
}
