import type { components } from '@scentstation/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

export type Brand = components['schemas']['Brand'];
export type BrandSelfUpdate = components['schemas']['BrandSelfUpdate'];
export type BrandLegalProfileUpdate = components['schemas']['BrandLegalProfileUpdate'];

/** Thương hiệu của người dùng hiện tại (FR-BND-06). */
export function useMyBrand() {
  return useQuery({
    queryKey: ['brands', 'me'],
    queryFn: () => unwrap(api.GET('/brands/me')),
  });
}

/** Brand Admin sửa tên hiển thị, logo, mô tả, liên hệ — không sửa mã hay trạng thái (FR-BND-06). */
export function useUpdateMyBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BrandSelfUpdate) => unwrap(api.PATCH('/brands/me', { body })),
    onSuccess: (brand) => queryClient.setQueryData(['brands', 'me'], brand),
  });
}

/** Brand Admin khai hồ sơ pháp nhân và tài khoản nhận doanh thu (FR-BND-09). */
export function useUpdateMyBrandLegalProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BrandLegalProfileUpdate) =>
      unwrap(api.PUT('/brands/me/legal-profile', { body })),
    onSuccess: (brand) => queryClient.setQueryData(['brands', 'me'], brand),
  });
}
