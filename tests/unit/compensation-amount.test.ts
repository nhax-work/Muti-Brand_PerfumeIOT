/**
 * Công thức bồi thường hàng hóa (FR-SLT-44 AC1, AC3) — số học trên chuỗi `numeric`, không qua số thực.
 */

import { describe, expect, it } from 'vitest';
import {
  compensationAmount,
  fromUnits,
  toUnits,
} from '../../apps/api/src/modules/slt/compensation-amount.js';

describe('compensationAmount (FR-SLT-44)', () => {
  it('test_FR_SLT_44_compensation_formula — tỷ lệ × giá bán lẻ khi còn đủ hạn mức (AC1)', () => {
    expect(
      compensationAmount({
        coveragePercent: '60.00',
        retailPrice: '2000000.0000',
        coverageCap: '5000000.0000',
        usedCoverage: '0',
      }),
    ).toBe('1200000.0000');
  });

  it('test_FR_SLT_44_compensation_formula — chạm hạn mức thì trả phần còn lại (AC3)', () => {
    expect(
      compensationAmount({
        coveragePercent: '60.00',
        retailPrice: '2000000.0000',
        coverageCap: '5000000.0000',
        usedCoverage: '4500000.0000',
      }),
    ).toBe('500000.0000');
  });

  it('test_FR_SLT_44_compensation_formula — hạn mức đã hết hoặc âm thì 0, không bao giờ âm', () => {
    const base = { coveragePercent: '60.00', retailPrice: '2000000', coverageCap: '1000000' };
    expect(compensationAmount({ ...base, usedCoverage: '1000000' })).toBe('0.0000');
    expect(compensationAmount({ ...base, usedCoverage: '1200000' })).toBe('0.0000');
  });

  it('test_FR_SLT_44_compensation_formula — làm tròn nửa lên tới đồng, tỷ lệ lẻ hai chữ số', () => {
    // 33.33% × 1.000.001 = 333.300,3333 → 333.300
    expect(
      compensationAmount({
        coveragePercent: '33.33',
        retailPrice: '1000001',
        coverageCap: '99999999',
        usedCoverage: '0',
      }),
    ).toBe('333300.0000');
    // 50% × 3 = 1,5 → 2
    expect(
      compensationAmount({
        coveragePercent: '50',
        retailPrice: '3',
        coverageCap: '10',
        usedCoverage: '0',
      }),
    ).toBe('2.0000');
  });

  it('đổi qua lại phần vạn đồng không mất chính xác', () => {
    expect(toUnits('1234567890123.4567')).toBe(12345678901234567n);
    expect(fromUnits(12345678901234567n)).toBe('1234567890123.4567');
    expect(fromUnits(5n)).toBe('0.0005');
    expect(toUnits('7')).toBe(70000n);
  });
});
