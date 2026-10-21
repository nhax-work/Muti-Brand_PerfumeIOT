import type { components } from '@scentstation/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';
import { useReauth } from '@/shared/auth';

export type BrandPayout = components['schemas']['BrandPayout'];
export type BrandPayoutStatus = components['schemas']['BrandPayoutStatus'];

export interface PayoutSearch {
  readonly page: number;
  readonly pageSize: number;
  readonly status?: BrandPayoutStatus;
  /** Chỉ Super Admin — máy chủ bỏ qua với Brand Admin. */
  readonly brandId?: string;
}

/** FR-SLT-52: kỳ mới nhất trước. Brand Admin chỉ nhận kỳ của thương hiệu mình (máy chủ lọc). */
export function useBrandPayouts(search: PayoutSearch) {
  return useQuery({
    queryKey: ['brand-payouts', search],
    queryFn: () => unwrap(api.GET('/brand-payouts', { params: { query: search } })),
  });
}

/** Tên thương hiệu cho cột và bộ lọc của Super Admin; Brand Admin không gọi. */
export function useBrandNames(enabled: boolean) {
  return useQuery({
    queryKey: ['brands', 'names'],
    queryFn: () => unwrap(api.GET('/brands', { params: { query: { page: 1, pageSize: 200 } } })),
    enabled,
  });
}

function useInvalidatePayouts() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ['brand-payouts'] });
}

/** FR-SLT-53: ghi nhận đã chuyển khoản — cần xác thực lại. */
export function usePayBrandPayout() {
  const requestReauth = useReauth();
  const invalidate = useInvalidatePayouts();
  return useMutation({
    mutationFn: async (input: { id: string; transferReference: string }) => {
      const reauthToken = await requestReauth();
      return unwrap(
        api.POST('/brand-payouts/{id}/pay', {
          params: { path: { id: input.id }, header: { 'X-Reauth-Token': reauthToken } },
          body: { transferReference: input.transferReference },
        }),
      );
    },
    onSuccess: invalidate,
  });
}

/** FR-SLT-54 AC1: Brand Admin khiếu nại kỳ CONFIRMED. */
export function useDisputeBrandPayout() {
  const invalidate = useInvalidatePayouts();
  return useMutation({
    mutationFn: (input: { id: string; note: string }) =>
      unwrap(
        api.POST('/brand-payouts/{id}/dispute', {
          params: { path: { id: input.id } },
          body: { note: input.note },
        }),
      ),
    onSuccess: invalidate,
  });
}

/** FR-SLT-54 AC3: Super Admin trả lời khiếu nại. */
export function useRespondBrandPayoutDispute() {
  const invalidate = useInvalidatePayouts();
  return useMutation({
    mutationFn: (input: { id: string; response: string }) =>
      unwrap(
        api.POST('/brand-payouts/{id}/dispute-response', {
          params: { path: { id: input.id } },
          body: { response: input.response },
        }),
      ),
    onSuccess: invalidate,
  });
}
