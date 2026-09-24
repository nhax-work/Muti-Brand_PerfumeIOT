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
    ],
  },
]);
