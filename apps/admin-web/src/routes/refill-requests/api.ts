import type { components } from '@scentstation/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

export type RefillRequest = components['schemas']['RefillRequest'];
export type RefillRequestStatus = components['schemas']['RefillRequestStatus'];
export type RefillRequestReason = components['schemas']['RefillRequestReason'];
export type SlotRental = components['schemas']['SlotRental'];

export interface RefillRequestSearch {
  readonly page: number;
  readonly pageSize: number;
  readonly status?: RefillRequestStatus;
}

/** FR-RFQ-04, 10: Brand Admin chỉ nhận yêu cầu của thương hiệu mình (máy chủ lọc), mới nhất trước. */
export function useRefillRequests(search: RefillRequestSearch) {
  return useQuery({
    queryKey: ['refill-requests', search],
    queryFn: () => unwrap(api.GET('/refill-requests', { params: { query: search } })),
  });
}

/** Hóa đơn của thương hiệu để chọn slot cần bổ sung (FR-SLT-40) — chỉ Brand Admin gọi. */
export function useMyRentals(enabled: boolean) {
  return useQuery({
    queryKey: ['slot-rentals', { page: 1, pageSize: 100 }],
    queryFn: () =>
      unwrap(api.GET('/slot-rentals', { params: { query: { page: 1, pageSize: 100 } } })),
    enabled,
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ['refill-requests'] });
}

/** FR-RFQ-01, 02. */
export function useCreateRefillRequest() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { slotRentalId: string; reason: RefillRequestReason; note?: string }) =>
      unwrap(api.POST('/refill-requests', { body })),
    onSuccess: invalidate,
  });
}

export type ReviewAction =
  | { readonly kind: 'accept' }
  | { readonly kind: 'reject'; readonly reason: string }
  | { readonly kind: 'schedule'; readonly scheduledAt: string }
  | { readonly kind: 'cancel' };

/** FR-RFQ-04, 06, 07: nhân sự nền tảng chuyển trạng thái — máy chủ kiểm chuyển hợp lệ. */
export function useReviewRefillRequest() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: ReviewAction }) => {
      const path = { params: { path: { id } } };
      switch (action.kind) {
        case 'accept':
          return unwrap(api.POST('/refill-requests/{id}/accept', path));
        case 'reject':
          return unwrap(
            api.POST('/refill-requests/{id}/reject', { ...path, body: { reason: action.reason } }),
          );
        case 'schedule':
          return unwrap(
            api.POST('/refill-requests/{id}/schedule', {
              ...path,
              body: { scheduledAt: action.scheduledAt },
            }),
          );
        case 'cancel':
          return unwrap(api.POST('/refill-requests/{id}/cancel', path));
      }
    },
    onSuccess: invalidate,
  });
}

/** FR-RFQ-08: Inventory Staff mở phiếu nạp xử lý yêu cầu — phiếu và yêu cầu liên kết ở máy chủ. */
export function useOpenRefillForRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: RefillRequest) =>
      unwrap(
        api.POST('/refill-sessions', {
          body: { slotId: request.slotId, refillRequestId: request.id },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['refill-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['refill-sessions'] });
    },
  });
}
