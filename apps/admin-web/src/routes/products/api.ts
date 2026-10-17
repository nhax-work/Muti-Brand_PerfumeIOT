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

function useInvalidateProducts() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ['products'] });
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
