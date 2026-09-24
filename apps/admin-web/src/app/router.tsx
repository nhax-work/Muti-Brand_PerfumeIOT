import { createBrowserRouter } from 'react-router';
import { RequireAuth } from './guards/RequireAuth';
import { AdminLayout } from './layouts/AdminLayout';
import { AuthLayout } from './layouts/AuthLayout';

/**
 * Mọi route khai báo tập trung ở đây; mỗi màn hình nạp lười (`lazy`) để bundle ban đầu nhỏ.
 * Màn hình giới hạn vai trò tự bọc `<RequireRole allow={[...]}>` trong component trang.
 */
export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [
      {
        path: '/login',
        lazy: () => import('@/routes/login/LoginPage').then((m) => ({ Component: m.default })),
      },
    ],
  },
  {
    element: (
      <RequireAuth>
        <AdminLayout />
      </RequireAuth>
    ),
    children: [
      {
        index: true,
        lazy: () =>
          import('@/routes/dashboard/DashboardPage').then((m) => ({ Component: m.default })),
      },
    ],
  },
  {
    path: '*',
    lazy: () => import('@/routes/not-found/NotFoundPage').then((m) => ({ Component: m.default })),
  },
]);
