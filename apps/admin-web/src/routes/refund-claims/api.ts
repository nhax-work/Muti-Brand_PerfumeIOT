import type { components } from '@scentstation/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';
import { useReauth } from '@/shared/auth';

export type RefundClaim = components['schemas']['RefundClaim'];
export type RefundClaimStatus = components['schemas']['RefundClaimStatus'];
export type RefundAccountView = components['schemas']['RefundAccountView'];

export interface RefundClaimsParams {
  readonly page?: number;
  readonly pageSize?: number;
  readonly status?: RefundClaimStatus;
  readonly assignedToMe?: boolean;
}

/** Hàng phiếu khiếu nại, cũ nhất trước (FR-ORD-20, FR-ORD-32). */
export function useRefundClaims(params: RefundClaimsParams = {}) {
  const { page = 1, pageSize = 20, status, assignedToMe } = params;
  return useQuery({
    queryKey: ['refund-claims', { page, pageSize, status, assignedToMe }],
    queryFn: () =>
      unwrap(
        api.GET('/refund-claims', {
          params: { query: { page, pageSize, status, assignedToMe } },
        }),
      ),
  });
}

/** Operations Staff đang hoạt động — Super Admin chọn người nhận phiếu. */
export function useOperationsStaff(enabled: boolean) {
  return useQuery({
    queryKey: ['users', 'OPERATIONS_STAFF'],
    queryFn: () =>
      unwrap(api.GET('/users', { params: { query: { role: 'OPERATIONS_STAFF', pageSize: 200 } } })),
    enabled,
  });
}

function useInvalidateClaims() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ['refund-claims'] });
}

export function useAssignClaim() {
  const invalidate = useInvalidateClaims();
  return useMutation({
    mutationFn: ({ id, assigneeId }: { id: string; assigneeId: string }) =>
      unwrap(
        api.POST('/refund-claims/{id}/assign', {
          params: { path: { id } },
          body: { assigneeId },
        }),
      ),
    onSuccess: invalidate,
  });
}

/**
 * Xem tài khoản nhận hoàn tiền — chỉ người được phân công, cần xác thực lại (FR-ORD-30). Dùng
 * mutation để chỉ gọi khi người dùng chủ động bấm, và không giữ dữ liệu trong bộ đệm truy vấn.
 */
export function useRevealAccount() {
  const requestReauth = useReauth();
  return useMutation({
    mutationFn: async (id: string) => {
      const reauthToken = await requestReauth();
      return unwrap(
        api.GET('/refund-claims/{id}/refund-account', {
          params: { path: { id }, header: { 'X-Reauth-Token': reauthToken } },
        }),
      );
    },
  });
}

/** Ghi nhận đã chuyển khoản hoàn tiền (FR-ORD-20) — cần xác thực lại. */
export function useRecordPayout() {
  const requestReauth = useReauth();
  const invalidate = useInvalidateClaims();
  return useMutation({
    mutationFn: async ({ id, payoutReference }: { id: string; payoutReference: string }) => {
      const reauthToken = await requestReauth();
      return unwrap(
        api.POST('/refund-claims/{id}/refund', {
          params: { path: { id }, header: { 'X-Reauth-Token': reauthToken } },
          body: { payoutReference },
        }),
      );
    },
    onSuccess: invalidate,
  });
}

export function useRejectClaim() {
  const invalidate = useInvalidateClaims();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      unwrap(
        api.POST('/refund-claims/{id}/reject', {
          params: { path: { id } },
          body: { reason },
        }),
      ),
    onSuccess: invalidate,
  });
}
