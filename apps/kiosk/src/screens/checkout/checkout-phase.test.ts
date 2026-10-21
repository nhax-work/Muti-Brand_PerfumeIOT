import { describe, expect, it } from 'vitest';
import type { OrderStatusView } from '@/shared/api';
import { phaseOf, pressDeadlineMs, secondsUntil, WAITING_TURN_AFTER_MS } from './checkout-phase';

function view(overrides: Partial<OrderStatusView>): OrderStatusView {
  return {
    orderId: 'order-1',
    status: 'PENDING_PAYMENT',
    revenueOwner: 'BRAND',
    dispenseStatus: null,
    failureCode: null,
    slotNumber: 2,
    pressDeadline: null,
    supportReference: null,
    ...overrides,
  } as OrderStatusView;
}

describe('phaseOf', () => {
  it('ánh xạ trạng thái đơn + lệnh sang màn hình', () => {
    expect(phaseOf(undefined)).toBe('PAYING');
    expect(phaseOf(view({ status: 'PAID' }))).toBe('PREPARING');
    expect(phaseOf(view({ status: 'PAID' }), WAITING_TURN_AFTER_MS)).toBe('WAITING_TURN');
    expect(phaseOf(view({ status: 'DISPENSE_REQUESTED', dispenseStatus: 'SENT' }))).toBe(
      'PREPARING',
    );
    expect(phaseOf(view({ status: 'DISPENSE_REQUESTED', dispenseStatus: 'UNKNOWN' }))).toBe(
      'CHECKING',
    );
    expect(phaseOf(view({ status: 'DISPENSED' }))).toBe('DISPENSED');
    expect(phaseOf(view({ status: 'REFUND_PENDING' }))).toBe('PROBLEM');
  });

  it('pressDeadlineMs đếm từ lúc modal hiện, nhưng không muộn hơn hạn của thiết bị', () => {
    expect(pressDeadlineMs(null, 60, null)).toBeNull();
    expect(pressDeadlineMs(1_000, 60, null)).toBe(61_000);
    expect(pressDeadlineMs(1_000, 60, new Date(30_000).toISOString())).toBe(30_000);
    expect(pressDeadlineMs(1_000, 60, new Date(90_000).toISOString())).toBe(61_000);
    expect(pressDeadlineMs(1_000, 60, 'not-a-date')).toBe(61_000);
  });

  it('secondsUntil không âm và bỏ qua mốc hỏng', () => {
    expect(secondsUntil(new Date(10_000).toISOString(), 0)).toBe(10);
    expect(secondsUntil(new Date(0).toISOString(), 5_000)).toBe(0);
    expect(secondsUntil('not-a-date', 0)).toBeNull();
    expect(secondsUntil(null, 0)).toBeNull();
  });
});
