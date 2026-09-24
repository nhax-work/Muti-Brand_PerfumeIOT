import { useEffect, useRef } from 'react';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown'] as const;

/**
 * Gọi `onIdle` khi không có thao tác nào trong `timeoutMs` (NFR-USA-02). Mỗi lần chạm hay bấm
 * phím thì đếm lại từ đầu. `enabled = false` để tạm dừng — màn hình thanh toán và đang xịt không
 * được bị đá về trang chủ giữa chừng.
 */
export function useIdleReset(onIdle: () => void, timeoutMs: number, enabled = true): void {
  const callback = useRef(onIdle);
  useEffect(() => {
    callback.current = onIdle;
  }, [onIdle]);

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const restart = () => {
      clearTimeout(timer);
      timer = setTimeout(() => callback.current(), timeoutMs);
    };

    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, restart, { passive: true });
    restart();

    return () => {
      clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, restart);
    };
  }, [timeoutMs, enabled]);
}
