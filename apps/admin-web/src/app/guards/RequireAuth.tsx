import { Spin } from 'antd';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '@/shared/auth';

/** Chưa đăng nhập thì về `/login`, nhớ trang định vào để quay lại sau khi đăng nhập. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'restoring') return <Spin fullscreen />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}
