/**
 * Giới hạn tần suất theo khóa (địa chỉ IP, mã máy…) trong cửa sổ cố định một phút.
 *
 * Giữ trong bộ nhớ của tiến trình: đủ cho một instance API ở giai đoạn pilot. Chạy nhiều instance thì
 * mỗi instance đếm riêng — khi đó chuyển sang Redis (đã có trong docker-compose).
 */

import type { Clock } from '../clock.js';

const WINDOW_MS = 60_000;

export class PerMinuteRateLimiter {
  private readonly windows = new Map<string, { startedAt: number; count: number }>();

  constructor(
    private readonly clock: Clock,
    private readonly limitPerMinute: () => number,
  ) {}

  /** Ghi nhận một lần gọi; trả `false` nếu khóa đã vượt giới hạn trong phút hiện tại. */
  tryAcquire(key: string): boolean {
    const now = this.clock.now().getTime();
    this.evictExpired(now);
    const window = this.windows.get(key);
    if (!window || now - window.startedAt >= WINDOW_MS) {
      this.windows.set(key, { startedAt: now, count: 1 });
      return true;
    }
    if (window.count >= this.limitPerMinute()) return false;
    window.count += 1;
    return true;
  }

  private evictExpired(now: number): void {
    if (this.windows.size < 1000) return;
    for (const [key, window] of this.windows) {
      if (now - window.startedAt >= WINDOW_MS) this.windows.delete(key);
    }
  }
}
