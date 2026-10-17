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
      {
        path: '/register',
        lazy: () =>
          import('@/routes/register/RegisterPage').then((m) => ({ Component: m.default })),
      },
      {
        path: '/verify-email',
        lazy: () =>
          import('@/routes/verify-email/VerifyEmailPage').then((m) => ({ Component: m.default })),
      },
      {
        // Công khai: khách mở từ QR sự cố trên kiosk, không đăng nhập (ADR-0012).
        path: '/claim',
        lazy: () => import('@/routes/claim/ClaimPage').then((m) => ({ Component: m.default })),
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
      {
        path: '/machines',
        lazy: () =>
          import('@/routes/machines/MachinesPage').then((m) => ({ Component: m.default })),
      },
      {
        path: '/machines/:id',
        lazy: () =>
          import('@/routes/machines/MachineDetailPage').then((m) => ({ Component: m.default })),
      },
      {
        path: '/rentals',
        lazy: () => import('@/routes/rentals/RentalsPage').then((m) => ({ Component: m.default })),
      },
      {
        path: '/rentals/available',
        lazy: () =>
          import('@/routes/rentals/AvailableSlotsPage').then((m) => ({ Component: m.default })),
      },
      {
        path: '/rentals/checkouts/:id',
        lazy: () =>
          import('@/routes/rentals/CheckoutDetailPage').then((m) => ({ Component: m.default })),
      },
      {
        path: '/refund-claims',
        lazy: () =>
          import('@/routes/refund-claims/RefundClaimsPage').then((m) => ({ Component: m.default })),
      },
      {
        path: '/rentals/:id',
        lazy: () =>
          import('@/routes/rentals/RentalDetailPage').then((m) => ({ Component: m.default })),
      },
    ],
  },
  {
    path: '*',
    lazy: () => import('@/routes/not-found/NotFoundPage').then((m) => ({ Component: m.default })),
  },
]);
