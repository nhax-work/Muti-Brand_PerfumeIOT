import type { components } from '@scentstation/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

export type Brand = components['schemas']['Brand'];
export type BrandSelfUpdate = components['schemas']['BrandSelfUpdate'];
export type BrandLegalProfileUpdate = components['schemas']['BrandLegalProfileUpdate'];

/** Thương hiệu của người dùng hiện tại (FR-BND-06). */
/** Chỉ tài khoản thuộc thương hiệu có hồ sơ riêng; màn dùng chung truyền `enabled = false` cho nhân sự nền tảng. */
export function useMyBrand(enabled = true) {
  return useQuery({
    queryKey: ['brands', 'me'],
    enabled,
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

/**
 * Upload logo thương hiệu (FR-BND-06, ADR-0022). Gửi FormData nguyên trạng — openapi-fetch để trình
 * duyệt tự đặt Content-Type kèm boundary.
 */
export function useUploadMyBrandLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return unwrap(api.POST('/brands/me/logo', { body: form as unknown as { file: string } }));
    },
    onSuccess: (brand) => queryClient.setQueryData(['brands', 'me'], brand),
  });
}

/** Xóa logo thương hiệu (ADR-0022). */
export function useDeleteMyBrandLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.DELETE('/brands/me/logo')),
    onSuccess: (brand) => queryClient.setQueryData(['brands', 'me'], brand),
  });
}
