import type { RoleCode } from '@scentstation/contracts';
import type { ReactNode } from 'react';
import NotFoundPage from '@/routes/not-found/NotFoundPage';
import { useAuth } from '@/shared/auth';

/**
 * Ẩn màn hình với vai trò không được phép. Đây CHỈ là trải nghiệm — máy chủ mới là nơi chặn quyền
 * và cô lập dữ liệu (QT4, QT5 của ADR-0003). Trả trang 404 thay vì 403 để không lộ màn hình có tồn
 * tại.
 *
 * Bọc một NÚT hay một phần trang (không phải cả trang) thì truyền `fallback={null}`: mặc định là trang
 * 404, chèn vào giữa màn hình sẽ thành một hình 404 lạc lõng cạnh nội dung thật.
 */
export function RequireRole({
  allow,
  children,
  fallback = <NotFoundPage />,
}: {
  allow: readonly RoleCode[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { user } = useAuth();
  const permitted = user?.roles.some((role) => allow.includes(role)) ?? false;
  return permitted ? children : fallback;
}
