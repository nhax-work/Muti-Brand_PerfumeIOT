import type { components } from '@scentstation/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

export type AgreementVersion = components['schemas']['AgreementVersion'] & {
  acceptedBrandCount?: number;
};
export type AgreementVersionCreate = components['schemas']['AgreementVersionCreate'];

/** Danh sách mọi phiên bản hợp đồng khung (nháp + đã công bố) — Super Admin (FR-SLT-48). */
export function useAgreementVersions() {
  return useQuery({
    queryKey: ['agreements'],
    queryFn: () => unwrap(api.GET('/agreements')) as Promise<AgreementVersion[]>,
  });
}

/** Soạn phiên bản hợp đồng khung mới ở trạng thái nháp — Super Admin (FR-SLT-48). */
export function useCreateAgreementVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AgreementVersionCreate) => unwrap(api.POST('/agreements', { body })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agreements'] });
    },
  });
}

/**
 * Công bố phiên bản hợp đồng khung làm bản hiện hành duy nhất — Super Admin (FR-SLT-48).
 * Yêu cầu xác thực lại mật khẩu qua header `X-Reauth-Token` (FR-AUTH-09 AC4).
 */
export function usePublishAgreementVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ version, reauthToken }: { version: string; reauthToken: string }) =>
      unwrap(
        api.POST('/agreements/{version}/publish', {
          params: {
            path: { version },
            header: { 'X-Reauth-Token': reauthToken },
          },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agreements'] });
      void queryClient.invalidateQueries({ queryKey: ['current-agreement'] });
    },
  });
}
