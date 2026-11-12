import type { components } from '@scentstation/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

export type Product = components['schemas']['Product'];
export type ProductCreate = components['schemas']['ProductCreate'];
export type ProductStatus = Product['status'];

/** Brand Admin chỉ thấy sản phẩm thương hiệu mình; Super Admin thấy tất cả (FR-PRD-03). */
export function useProducts(params: { page: number; pageSize: number; status?: ProductStatus }) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: () => unwrap(api.GET('/products', { params: { query: params } })),
  });
}

/**
 * Sản phẩm đổi thì danh mục chọn ở modal cấu hình slot cũng đổi; giá đổi thì giá trên mọi slot bán
 * sản phẩm đó đổi theo (ADR-0023) — làm mới cả các màn slot.
 */
function useInvalidateProducts() {
  const queryClient = useQueryClient();
  return () => {
    for (const queryKey of [
      ['products'],
      ['brand-products'],
      ['slot-rentals'],
      ['slot-rental'],
      ['rental-invoice'],
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };
}

/** Tạo (FR-PRD-01) hoặc sửa (FR-PRD-02). SKU chỉ đặt lúc tạo — máy chủ bỏ qua khi sửa. */
export function useSaveProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: ProductCreate }) =>
      id
        ? unwrap(api.PATCH('/products/{id}', { params: { path: { id } }, body }))
        : unwrap(api.POST('/products', { body })),
    onSuccess: invalidate,
  });
}

/** Ngừng kinh doanh: không gán được vào slot mới; hóa đơn đang chạy không đổi (FR-PRD-02). */
export function useDiscontinueProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST('/products/{id}/discontinue', { params: { path: { id } } })),
    onSuccess: invalidate,
  });
}

/**
 * Upload ảnh sản phẩm (FR-PRD-01, ADR-0020). Gửi FormData nguyên trạng — openapi-fetch để trình duyệt
 * tự đặt Content-Type kèm boundary.
 */
export function useUploadProductImage() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      return unwrap(
        api.POST('/products/{id}/image', {
          params: { path: { id } },
          body: form as unknown as { file: string },
        }),
      );
    },
    onSuccess: invalidate,
  });
}

/** Xóa ảnh sản phẩm (ADR-0020). */
export function useDeleteProductImage() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE('/products/{id}/image', { params: { path: { id } } })),
    onSuccess: invalidate,
  });
}
