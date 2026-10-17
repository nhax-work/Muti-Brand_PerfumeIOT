import type { components } from '@scentstation/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

export type User = components['schemas']['User'];
export type UserCreate = components['schemas']['UserCreate'];
export type RoleCode = components['schemas']['RoleCode'];

/** Chỉ Platform Super Admin (FR-USR-05). */
export function useUsers(params: {
  page: number;
  pageSize: number;
  role?: RoleCode;
  brandId?: string;
}) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => unwrap(api.GET('/users', { params: { query: params } })),
  });
}

/** Thương hiệu để chọn khi tạo Brand Admin và hiển thị tên trong bảng. */
export function useBrandOptions() {
  return useQuery({
    queryKey: ['brands', { page: 1, pageSize: 200 }],
    queryFn: () => unwrap(api.GET('/brands', { params: { query: { page: 1, pageSize: 200 } } })),
    staleTime: 5 * 60 * 1000,
  });
}

function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ['users'] });
}

/** FR-USR-01, 02 — phản hồi chứa mật khẩu tạm, chỉ một lần (ADR-0004). */
export function useCreateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (body: UserCreate) => unwrap(api.POST('/users', { body })),
    onSuccess: invalidate,
  });
}

/** FR-USR-03: vô hiệu hóa và thu hồi mọi phiên đang hoạt động. */
export function useDisableUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST('/users/{id}/disable', { params: { path: { id } } })),
    onSuccess: invalidate,
  });
}

/** FR-USR-04: mật khẩu tạm mới, tài khoản về INVITED, thu hồi mọi phiên. */
export function useResetPassword() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST('/users/{id}/reset-password', { params: { path: { id } } })),
    onSuccess: invalidate,
  });
}
