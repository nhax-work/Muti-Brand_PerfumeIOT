import { createBrowserRouter } from 'react-router';
import { KioskShell } from './KioskShell';
import type { KioskRouteHandle } from './route-handle';

/**
 * Luồng kiosk là tuyến tính: home → catalog → product → payment → dispensing → result.
 * Thêm màn hình: tạo `screens/<màn-hình>/`, khai báo ở đây; màn hình không được bị đá về trang chủ
 * giữa chừng thì gắn `handle: { keepAwake: true } satisfies KioskRouteHandle`.
 */
export const router = createBrowserRouter([
  {
    element: <KioskShell />,
    children: [
      {
        index: true,
        handle: {} satisfies KioskRouteHandle,
        lazy: () => import('@/screens/home/HomeScreen').then((m) => ({ Component: m.default })),
      },
      {
        path: 'catalog',
        handle: {} satisfies KioskRouteHandle,
        lazy: () =>
          import('@/screens/catalog/CatalogScreen').then((m) => ({ Component: m.default })),
      },
      {
        path: 'products/:slotNumber',
        handle: {} satisfies KioskRouteHandle,
        lazy: () =>
          import('@/screens/product-detail/ProductDetailScreen').then((m) => ({
            Component: m.default,
          })),
      },
      {
        // Khách đang quét QR hoặc chờ bấm nút — không được bị đá về trang chủ giữa chừng.
        path: 'checkout/:slotNumber',
        handle: { keepAwake: true } satisfies KioskRouteHandle,
        lazy: () =>
          import('@/screens/checkout/CheckoutScreen').then((m) => ({ Component: m.default })),
      },
    ],
  },
]);
