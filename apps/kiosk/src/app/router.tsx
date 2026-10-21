import { createBrowserRouter } from 'react-router';
import { KioskShell } from './KioskShell';
import type { KioskRouteHandle } from './route-handle';

const catalogScreen = () =>
  import('@/screens/catalog/CatalogScreen').then((m) => ({ Component: m.default }));

/**
 * Luồng kiosk là tuyến tính: màn chờ → danh mục → chi tiết → thanh toán → nhận lượt xịt → kết quả.
 * Thêm màn hình: tạo `screens/<màn-hình>/`, khai báo ở đây; màn hình không được bị đá về màn chờ
 * giữa chừng thì gắn `handle: { keepAwake: true } satisfies KioskRouteHandle`.
 */
export const router = createBrowserRouter([
  {
    element: <KioskShell />,
    children: [
      {
        // Màn chờ: kiosk tự về đây khi không ai dùng (NFR-USA-02).
        index: true,
        handle: {} satisfies KioskRouteHandle,
        lazy: () =>
          import('@/screens/attract/AttractScreen').then((m) => ({ Component: m.default })),
      },
      { path: 'catalog', handle: {} satisfies KioskRouteHandle, lazy: catalogScreen },
      { path: 'products/:slotNumber', handle: {} satisfies KioskRouteHandle, lazy: catalogScreen },
      {
        // Cùng CatalogScreen với danh mục và chi tiết: đổi URL /products/:slot → /checkout/:slot
        // không dựng lại màn, đơn đang thanh toán được giữ nguyên. keepAwake chỉ có hiệu lực khi
        // đã có đơn (KioskShell) — tạo đơn lỗi thì kiosk vẫn tự về màn chờ.
        path: 'checkout/:slotNumber',
        handle: { keepAwake: true } satisfies KioskRouteHandle,
        lazy: catalogScreen,
      },
      {
        path: '*',
        handle: {} satisfies KioskRouteHandle,
        lazy: () =>
          import('@/screens/attract/AttractScreen').then((m) => ({ Component: m.default })),
      },
    ],
  },
]);
