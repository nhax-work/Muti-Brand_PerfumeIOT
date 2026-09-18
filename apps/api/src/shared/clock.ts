/**
 * Nguồn thời gian duy nhất của apps/api.
 *
 * Tầng nghiệp vụ không gọi `new Date()` trực tiếp — gọi `clock.now()`. Nhờ vậy test kiểm được các
 * luật phụ thuộc thời gian (khóa tài khoản LOGIN_LOCKOUT_MIN, hết hạn token, chuyển trạng thái
 * hợp đồng theo ngày) mà không phải chờ thật.
 */

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Token DI để inject Clock trong Nest. */
export const CLOCK = Symbol('CLOCK');
