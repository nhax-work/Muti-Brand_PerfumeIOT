/**
 * Cửa sổ một phút của `PerMinuteRateLimiter` — dùng chung cho đăng ký thương hiệu, gửi khiếu nại và
 * tạo đơn kiosk (NFR-SEC-06, ADR-0012, ADR-0013).
 */

import { describe, expect, it } from 'vitest';
import { PerMinuteRateLimiter } from '../../apps/api/src/shared/http/rate-limiter.js';

function fakeClock(start: number) {
  let now = start;
  return {
    clock: { now: () => new Date(now) },
    advance(ms: number) {
      now += ms;
    },
  };
}

describe('PerMinuteRateLimiter (NFR-SEC-06)', () => {
  it('test_NFR_SEC_06_kiosk_order_rate_limit — mỗi khóa đếm riêng, quá ngưỡng thì chặn tới hết phút', () => {
    const time = fakeClock(Date.UTC(2026, 9, 26, 3, 0, 0));
    const limiter = new PerMinuteRateLimiter(time.clock, () => 2);

    expect(limiter.tryAcquire('M001')).toBe(true);
    expect(limiter.tryAcquire('M001')).toBe(true);
    expect(limiter.tryAcquire('M001')).toBe(false);
    // Máy khác không bị máy kia làm nghẽn.
    expect(limiter.tryAcquire('M002')).toBe(true);

    time.advance(59_000);
    expect(limiter.tryAcquire('M001')).toBe(false);
    time.advance(1_000);
    expect(limiter.tryAcquire('M001')).toBe(true);
  });

  it('ngưỡng đọc lại mỗi lần — đổi cấu hình có hiệu lực ngay', () => {
    const time = fakeClock(0);
    let limit = 1;
    const limiter = new PerMinuteRateLimiter(time.clock, () => limit);
    expect(limiter.tryAcquire('k')).toBe(true);
    expect(limiter.tryAcquire('k')).toBe(false);
    limit = 3;
    expect(limiter.tryAcquire('k')).toBe(true);
  });
});
