/**
 * Cấu hình chung cho test giao diện (vitest `setupFiles`).
 *
 * `findBy*`/`waitFor` mặc định chỉ chờ 1 giây. Thông báo validate và dropdown của antd hiện sau một
 * nhịp render; trên runner CI chậm nhịp đó vượt 1 giây (ClaimPage, UsersPage). Chờ tới 5 giây không
 * làm chậm test đạt — `findBy*` trả về ngay khi phần tử xuất hiện.
 */

import { act, configure } from '@testing-library/react';
import { ConfigProvider, message, Modal, notification } from 'antd';
import { afterAll, vi } from 'vitest';

configure({ asyncUtilTimeout: 5000 });

// Chỉ áp cho message/notification/Modal.confirm tĩnh. jsdom có TransitionEvent nhưng không bao giờ
// bắn transitionend, nên toast đã destroy kẹt ở pha "rời đi" và bộ đếm giờ của nó chạy mãi.
ConfigProvider.config({ theme: { token: { motion: false } } });

/**
 * Dọn việc React còn treo trước khi vitest gỡ jsdom ở cuối mỗi file test.
 *
 * `cleanup()` chỉ unmount cây do `render()` dựng. Còn sót hai loại việc chạy tiếp ngoài `act`:
 * - `message`/`notification`/`Modal.confirm` tĩnh của antd tự dựng root React riêng không bao giờ
 *   unmount; toast đếm giờ từng frame rồi tự đóng sau vài giây.
 * - Timer trễ của rc-component (`useDelayState`, motion) của popup vừa đóng vẫn gọi setState.
 * Việc nào rơi sau lúc jsdom bị gỡ thì React đọc `window.event` → "window is not defined", vitest
 * báo unhandled error và thoát mã 1 dù mọi test đạt. Máy nhanh hiếm khi gặp; runner CI chậm thì gặp
 * ngẫu nhiên ở file bất kỳ (ProductsPage, Rentals...).
 *
 * Gỡ hết thông báo tĩnh rồi chờ các timer ngắn đó chạy xong trong `act`: cập nhật nào phát sinh lúc
 * này vào hàng đợi của `act` và được xả ngay, không còn gì hẹn giờ ra sau teardown.
 */
const SETTLE_MS = 300;

afterAll(async () => {
  vi.useRealTimers();
  await act(async () => {
    message.destroy();
    notification.destroy();
    Modal.destroyAll();
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  });
});
