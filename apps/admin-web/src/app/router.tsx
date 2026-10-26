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
    // Đổi mật khẩu cần đăng nhập nhưng không có menu — tài khoản INVITED chưa dùng được màn nào khác.
    element: (
      <RequireAuth>
        <AuthLayout />
      </RequireAuth>
    ),
    children: [
      {
        path: '/change-password',
        lazy: () =>
          import('@/routes/change-password/ChangePasswordPage').then((m) => ({
            Component: m.default,
          })),
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
        path: '/dispense-commands',
        lazy: () =>
          import('@/routes/dispense-commands/DispenseCommandsPage').then((m) => ({
            Component: m.default,
          })),
      },
      {
        path: '/brand-payouts',
        lazy: () =>
          import('@/routes/brand-payouts/BrandPayoutsPage').then((m) => ({ Component: m.default })),
      },
      {
        path: '/revenue',
        lazy: () => import('@/routes/revenue/RevenuePage').then((m) => ({ Component: m.default })),
      },
      {
        path: '/refund-claims',
        lazy: () =>
          import('@/routes/refund-claims/RefundClaimsPage').then((m) => ({ Component: m.default })),
      },
      {
        path: '/products',
        lazy: () =>
          import('@/routes/products/ProductsPage').then((m) => ({ Component: m.default })),
      },
      {
        path: '/brands',
        lazy: () => import('@/routes/brands/BrandsPage').then((m) => ({ Component: m.default })),
      },
      {
        path: '/users',
        lazy: () => import('@/routes/users/UsersPage').then((m) => ({ Component: m.default })),
      },
      {
        path: '/brand-profile',
        lazy: () =>
          import('@/routes/brand-profile/BrandProfilePage').then((m) => ({ Component: m.default })),
      },
      {
        path: '/orders',
        lazy: () => import('@/routes/orders/OrdersPage').then((m) => ({ Component: m.default })),
      },
      {
        path: '/locations',
        lazy: () =>
          import('@/routes/locations/LocationsPage').then((m) => ({ Component: m.default })),
      },
      {
        path: '/pricing',
        lazy: () => import('@/routes/pricing/PricingPage').then((m) => ({ Component: m.default })),
      },
      {
        path: '/my-slots',
        lazy: () => import('@/routes/my-slots/MySlotsPage').then((m) => ({ Component: m.default })),
      },
      {
        path: '/rentals/:id',
        lazy: () =>
          import('@/routes/rentals/RentalDetailPage').then((m) => ({ Component: m.default })),
      },
      {
        path: '/notifications',
        lazy: () =>
          import('@/routes/notifications/NotificationsPage').then((m) => ({
            Component: m.default,
          })),
      },
      {
        path: '/alerts',
        lazy: () => import('@/routes/alerts/AlertsPage').then((m) => ({ Component: m.default })),
      },
      {
        path: '/shipments',
        lazy: () =>
          import('@/routes/shipments/ShipmentsPage').then((m) => ({ Component: m.default })),
      },
      {
        path: '/maintenance-tickets',
        lazy: () =>
          import('@/routes/maintenance-tickets/MaintenanceTicketsPage').then((m) => ({
            Component: m.default,
          })),
      },
      {
        path: '/audit-logs',
        lazy: () =>
          import('@/routes/audit-logs/AuditLogsPage').then((m) => ({ Component: m.default })),
      },
      {
        path: '/bottle-returns',
        lazy: () =>
          import('@/routes/bottle-returns/BottleReturnsPage').then((m) => ({
            Component: m.default,
          })),
      },
    ],
  },

  {
    path: '*',
    lazy: () => import('@/routes/not-found/NotFoundPage').then((m) => ({ Component: m.default })),
  },
]);
