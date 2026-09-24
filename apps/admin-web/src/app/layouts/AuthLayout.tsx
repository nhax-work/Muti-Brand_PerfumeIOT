import { Outlet } from 'react-router';

export function AuthLayout() {
  return (
    <div className="auth-layout">
      <Outlet />
    </div>
  );
}
