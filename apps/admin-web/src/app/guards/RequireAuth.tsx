import { Spin } from 'antd';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '@/shared/auth';

/**
 * Chưa đăng nhập thì về `/login`, nhớ trang định vào để quay lại sau khi đăng nhập. Tài khoản INVITED
 * (mới tạo hoặc vừa đặt lại mật khẩu) bị đưa tới `/change-password`: máy chủ trả FORBIDDEN_SCOPE cho
 * mọi endpoint khác tới khi đổi xong (ADR-0004).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'restoring') return <Spin fullscreen />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location }} />;
  if (user?.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return children;
}
