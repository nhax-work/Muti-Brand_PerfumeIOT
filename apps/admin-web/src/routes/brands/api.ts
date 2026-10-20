import type { components } from '@scentstation/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';
import { useReauth } from '@/shared/auth';

export type Brand = components['schemas']['Brand'];
export type BrandCreate = components['schemas']['BrandCreate'];
export type BrandStatus = components['schemas']['BrandStatus'];

/** Chỉ Platform Super Admin (FR-BND-07); Brand Admin gọi luôn nhận FORBIDDEN_SCOPE. */
export function useBrands(params: { page: number; pageSize: number; status?: BrandStatus }) {
  return useQuery({
    queryKey: ['brands', params],
    queryFn: () => unwrap(api.GET('/brands', { params: { query: params } })),
  });
}

function useInvalidateBrands() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ['brands'] });
}

/** Tạo (FR-BND-01) hoặc sửa (FR-BND-02). */
export function useSaveBrand() {
  const invalidate = useInvalidateBrands();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: BrandCreate }) =>
      id
        ? unwrap(api.PATCH('/brands/{id}', { params: { path: { id } }, body }))
        : unwrap(api.POST('/brands', { body })),
    onSuccess: invalidate,
  });
}

/** ACTIVE ↔ SUSPENDED (FR-BND-03); slot của thương hiệu bị đình chỉ không nhận đơn (FR-BND-04). */
export function useSetBrandStatus() {
  const invalidate = useInvalidateBrands();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: BrandStatus }) =>
      unwrap(api.PUT('/brands/{id}/status', { params: { path: { id } }, body: { status } })),
    onSuccess: invalidate,
  });
}

/** Platform Super Admin ghi nhận đã xác minh pháp nhân (FR-BND-10) — yêu cầu xác thực lại (x-reauth-token). */
export function useVerifyBrandLegal() {
  const requestReauth = useReauth();
  const invalidate = useInvalidateBrands();
  return useMutation({
    mutationFn: async (id: string) => {
      const reauthToken = await requestReauth();
      return unwrap(
        api.POST('/brands/{id}/legal-verification', {
          params: { path: { id }, header: { 'X-Reauth-Token': reauthToken } },
        }),
      );
    },
    onSuccess: invalidate,
  });
}

