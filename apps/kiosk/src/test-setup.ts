/**
 * Cấu hình chung cho test giao diện kiosk (vitest `setupFiles`).
 *
 * Commit nào của React xảy ra ngoài `act` (timer, promise resolve muộn) đều hẹn một callback qua
 * scheduler, và callback đó đọc `window.event`. Nếu nó chạy sau khi vitest gỡ jsdom ở cuối file thì
 * báo "window is not defined" — unhandled error làm bước test thoát mã 1 dù mọi test đạt; runner CI
 * chậm gặp ngẫu nhiên. Chờ một nhịp trong `act` trước khi rời file để các việc đó được xả hết.
 */

import { act } from '@testing-library/react';
import { afterAll, vi } from 'vitest';

const SETTLE_MS = 300;

afterAll(async () => {
  vi.useRealTimers();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  });
});
