import type { RoleCode } from '@scentstation/contracts';
import type { ReactNode } from 'react';
import NotFoundPage from '@/routes/not-found/NotFoundPage';
import { useAuth } from '@/shared/auth';

/**
 * Ẩn màn hình với vai trò không được phép. Đây CHỈ là trải nghiệm — máy chủ mới là nơi chặn quyền
 * và cô lập dữ liệu (QT4, QT5 của ADR-0003). Trả trang 404 thay vì 403 để không lộ màn hình có tồn
 * tại.
 */
export function RequireRole({
  allow,
  children,
}: {
  allow: readonly RoleCode[];
  children: ReactNode;
}) {
  const { user } = useAuth();
  const permitted = user?.roles.some((role) => allow.includes(role)) ?? false;
  return permitted ? children : <NotFoundPage />;
}
