import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

/**
 * Hợp đồng khung hiện hành kèm lần đồng ý của thương hiệu (FR-SLT-48, FR-SLT-49, ADR-0013).
 * Chưa có phiên bản nào được công bố thì máy chủ trả NOT_FOUND — không thử lại.
 */
export function useCurrentAgreement({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['current-agreement'],
    queryFn: () => unwrap(api.GET('/agreements/current')),
    retry: false,
    enabled,
  });
}

/** Đồng ý phiên bản hợp đồng khung (FR-SLT-49, ADR-0013). */
export function useAcceptAgreement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ version, contentHash }: { version: string; contentHash: string }) =>
      unwrap(
        api.POST('/agreements/{version}/accept', {
          params: { path: { version } },
          body: { contentHash },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['current-agreement'] });
    },
  });
}
