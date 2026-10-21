import { useMutation, useQuery } from '@tanstack/react-query';
import type { components } from '@scentstation/contracts';
import { config } from '@/shared/config';
import { api } from './client';
import { ApiRequestError, unwrap } from './errors';

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

export function cancelKioskOrder(orderId: string) {
  return unwrap(
    api.POST('/kiosk/orders/{id}/cancel', {
      params: { path: { id: orderId } },
      body: { machineSerial: config.machineSerial },
    }),
  );
}

/**
 * ADR-0015 mục 3: kiosk phải hủy đơn chờ thanh toán khi phiên kiosk bị reset. Trạng thái React mất
 * theo mỗi lần tải lại trang (mất điện, kiosk tự khởi động lại, cập nhật bản mới), nên id đơn đang
 * hiện mã QR được ghi vào bộ nhớ trình duyệt. Không có nó, đơn mồ côi chặn máy bằng MACHINE_BUSY
 * (`uq_machine_open_order`) cho tới khi hết ORDER_PAYMENT_TTL_SEC.
 *
 * Bộ nhớ trình duyệt có thể bị chặn (chế độ riêng tư) — mọi lỗi đều bỏ qua, kiosk vẫn chạy như cũ.
 */
const PENDING_ORDER_KEY = 'scentstation.kiosk.pendingOrderId';

export function rememberPendingOrder(orderId: string): void {
  try {
    localStorage.setItem(PENDING_ORDER_KEY, orderId);
  } catch {
    // Bộ nhớ trình duyệt không dùng được — chấp nhận đơn mồ côi tự hết hạn.
  }
}

export function forgetPendingOrder(): void {
  try {
    localStorage.removeItem(PENDING_ORDER_KEY);
  } catch {
    // như trên
  }
}

/**
 * Gọi một lần khi kiosk khởi động: còn đơn của phiên trước thì hủy (FR-ORD-33). Đơn đã trả tiền thì
 * máy chủ trả ORDER_NOT_CANCELLABLE và vẫn phục vụ đơn đó — kiosk không cần làm gì thêm.
 */
export async function cancelOrphanedOrder(): Promise<void> {
  let orderId: string | null = null;
  try {
    orderId = localStorage.getItem(PENDING_ORDER_KEY);
  } catch {
    return;
  }
  if (!orderId) return;
  try {
    await cancelKioskOrder(orderId);
  } catch {
    // Đã hết hạn, đã trả tiền, hay mất mạng — đều không còn gì để kiosk làm.
  } finally {
    forgetPendingOrder();
  }
}

/**
 * FR-ORD-33 (ADR-0015): khách xác nhận rời màn QR — hủy đơn đang chờ thanh toán, máy chủ hủy luôn
 * link ở cổng để khách không trả được nữa.
 */
export function useCancelOrder() {
  return useMutation({
    mutationFn: (orderId: string) => cancelKioskOrder(orderId),
  });
}

/** Cổng đã/đang nhận tiền nên đơn không hủy được — kiosk phải ở lại chờ kết quả thanh toán. */
export function isNotCancellable(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === 'ORDER_NOT_CANCELLABLE';
}

/**
 * FR-ORD-11: poll trạng thái đơn tới khi đơn kết thúc.
 *
 * `followLatePayment`: tiếp tục poll cả khi đơn đã EXPIRED. Khách có thể đã quét mã trước khi hết hạn
 * và tiền về sau đó — máy chủ chuyển đơn sang REFUND_PENDING (FR-ORD-16 AC3, FR-ORD-33) và kiosk phải
 * đổi sang màn hoàn tiền kèm QR khiếu nại, thay vì đứng yên ở màn "hết hạn".
 */
export function useOrderStatus(
  orderId: string | null,
  options: { readonly followLatePayment?: boolean } = {},
) {
  return useQuery({
    queryKey: ['kiosk', 'order-status', orderId],
    queryFn: () =>
      unwrap(
        api.GET('/kiosk/orders/{id}/status', {
          params: { path: { id: orderId as string } },
        }),
      ),
    enabled: orderId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (options.followLatePayment && status === 'EXPIRED') return config.orderStatusPollMs;
      return isSettled(status) ? false : config.orderStatusPollMs;
    },
    retry: true,
  });
}
