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
        lazy: () => import('@/screens/home/HomeScreen').then((m) => ({ Component: m.default })),
      },
      {
        path: 'products/:slotNumber',
        handle: {} satisfies KioskRouteHandle,
        lazy: () => import('@/screens/home/HomeScreen').then((m) => ({ Component: m.default })),
      },
      {
        // Cố ý dùng HomeScreen (= CatalogScreen), không dùng CheckoutScreen: mã QR và hướng dẫn bấm
        // nút là modal của CatalogScreen. Cùng component ở cả bốn route nên đổi URL
        // /products/:slot → /checkout/:slot không dựng lại màn, modal giữ nguyên đơn đang thanh toán.
        // Trỏ sang CheckoutScreen là khách bấm "Đồng ý và thanh toán" xong lại gặp màn điều khoản.
        path: 'checkout/:slotNumber',
        handle: { keepAwake: true } satisfies KioskRouteHandle,
        lazy: () => import('@/screens/home/HomeScreen').then((m) => ({ Component: m.default })),
      },
      {
        path: '*',
        handle: {} satisfies KioskRouteHandle,
        lazy: () => import('@/screens/home/HomeScreen').then((m) => ({ Component: m.default })),
      },
    ],
  },
]);
