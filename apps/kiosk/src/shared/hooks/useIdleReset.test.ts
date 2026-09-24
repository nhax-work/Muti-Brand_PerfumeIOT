import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIdleReset } from './useIdleReset';

const TIMEOUT_MS = 1_000;

describe('useIdleReset', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('gọi onIdle khi hết thời gian không thao tác', () => {
    const onIdle = vi.fn();
    renderHook(() => useIdleReset(onIdle, TIMEOUT_MS));

    vi.advanceTimersByTime(TIMEOUT_MS - 1);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledOnce();
  });

  it('mỗi lần chạm màn hình thì đếm lại từ đầu', () => {
    const onIdle = vi.fn();
    renderHook(() => useIdleReset(onIdle, TIMEOUT_MS));

    vi.advanceTimersByTime(TIMEOUT_MS - 1);
    window.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(TIMEOUT_MS - 1);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledOnce();
  });

  it('enabled = false thì không bao giờ gọi', () => {
    const onIdle = vi.fn();
    renderHook(() => useIdleReset(onIdle, TIMEOUT_MS, false));

    vi.advanceTimersByTime(TIMEOUT_MS * 10);
    expect(onIdle).not.toHaveBeenCalled();
  });
});
