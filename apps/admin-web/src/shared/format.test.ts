import { describe, expect, it } from 'vitest';
import { formatDateTime, formatVnd, formatVndInput, parseVndInput } from './format';

describe('formatDateTime', () => {
  it('định dạng thời điểm ISO-8601 sang giờ địa phương', () => {
    expect(formatDateTime('2026-11-16T04:00:00.000Z')).toBeTruthy();
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
  });
});

describe('formatVnd', () => {
  it('định dạng số tiền VND chuẩn kèm hậu tố VND', () => {
    expect(formatVnd('25000')).toBe('25.000 VND');
    expect(formatVnd('1000000')).toBe('1.000.000 VND');
    expect(formatVnd('0')).toBe('0 VND');
  });

  it('xử lý giá trị rỗng/null/undefined', () => {
    expect(formatVnd(null)).toBe('—');
    expect(formatVnd(undefined)).toBe('—');
  });
});

describe('formatVndInput & parseVndInput', () => {
  it('formatVndInput định dạng phân cách hàng nghìn bằng dấu chấm cho InputNumber', () => {
    expect(formatVndInput(25000)).toBe('25.000');
    expect(formatVndInput('25000')).toBe('25.000');
    expect(formatVndInput(1000000)).toBe('1.000.000');
    expect(formatVndInput('1000')).toBe('1.000');
    expect(formatVndInput(500)).toBe('500');
    expect(formatVndInput(0)).toBe('0');
    expect(formatVndInput('')).toBe('');
    expect(formatVndInput(undefined)).toBe('');
  });

  it('parseVndInput lọc sạch ký tự không phải số thành chuỗi số nguyên', () => {
    expect(parseVndInput('25.000')).toBe('25000');
    expect(parseVndInput('1.000.000')).toBe('1000000');
    expect(parseVndInput('25,000 VND')).toBe('25000');
    expect(parseVndInput('25 000')).toBe('25000');
    expect(parseVndInput('0')).toBe('0');
    expect(parseVndInput('')).toBe('');
    expect(parseVndInput(undefined)).toBe('');
  });
});
