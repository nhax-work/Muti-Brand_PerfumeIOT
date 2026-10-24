import { describe, expect, it } from 'vitest';
import { formatPrice } from './price';

describe('formatPrice', () => {
  it('định dạng theo ngôn ngữ đang chọn, không có phần thập phân với VND', () => {
    expect(formatPrice('35000.0000', 'VND', 'vi')).toMatch(/^35\.000\s₫$/);
    expect(formatPrice('35000.0000', 'VND', 'en')).toBe('₫35,000');
  });

  it('không có giá thì để trống, chuỗi hỏng thì in nguyên văn', () => {
    expect(formatPrice(null, 'VND', 'vi')).toBe('');
    expect(formatPrice('abc', 'VND', 'vi')).toBe('abc VND');
  });

  it('mã tiền tệ Intl không biết thì vẫn hiện số kèm mã', () => {
    expect(formatPrice('1000', 'ZZZ', 'vi')).toMatch(/1\.000/);
  });
});
