import { describe, expect, it } from 'vitest';
import {
  NAV_ENTRIES,
  activeNavPath,
  groupOfPath,
  isNavGroup,
  visibleNav,
  type NavEntry,
} from './navigation';

/** Cấp đầu của menu: đường dẫn của mục lẻ, khóa của nhóm. */
const topLevel = (entries: NavEntry[]) => entries.map((e) => (isNavGroup(e) ? e.key : e.path));
const allPaths = (entries: readonly NavEntry[]) =>
  entries.flatMap((e) => (isNavGroup(e) ? e.children.map((c) => c.path) : [e.path]));

describe('navigation', () => {
  it('Super Admin thấy mọi màn hình nhưng cấp đầu chỉ còn các nhóm', () => {
    const entries = visibleNav(['PLATFORM_SUPER_ADMIN']);
    expect(topLevel(entries)).toEqual([
      '/',
      'operations',
      'sales',
      'rental',
      'inventory',
      'finance',
      'administration',
      '/notifications',
    ]);
    // Không mất màn hình nào so với danh sách gốc, trừ hai màn chỉ dành cho Brand Admin.
    const expected = allPaths(NAV_ENTRIES).filter(
      (p) => p !== '/my-slots' && p !== '/brand-profile',
    );
    expect(allPaths(entries)).toEqual(expected);
  });

  it('nhóm chỉ còn một mục với vai trò đó thì hiện thẳng mục, không lồng', () => {
    const entries = visibleNav(['BRAND_ADMIN']);
    // Bán hàng chỉ còn Đơn hàng, Vận hành máy chỉ còn Cảnh báo, Quản trị chỉ còn Hồ sơ thương hiệu.
    expect(topLevel(entries)).toEqual([
      '/',
      '/alerts',
      '/orders',
      'rental',
      'inventory',
      'finance',
      '/brand-profile',
      '/notifications',
    ]);
    expect(allPaths(entries)).not.toContain('/users');
    expect(allPaths(entries)).not.toContain('/machines');
  });

  it('bỏ hẳn nhóm không có mục nào vai trò được thấy', () => {
    const entries = visibleNav(['INVENTORY_STAFF']);
    expect(topLevel(entries)).not.toContain('administration');
    expect(topLevel(entries)).not.toContain('operations');
  });

  it('trang con chọn đúng mục cha và mở đúng nhóm', () => {
    const entries = visibleNav(['PLATFORM_SUPER_ADMIN']);
    expect(activeNavPath(entries, '/machines/abc-123')).toBe('/machines');
    expect(activeNavPath(entries, '/')).toBe('/');
    expect(activeNavPath(entries, '/change-password')).toBeUndefined();
    expect(groupOfPath(entries, '/machines')).toBe('operations');
    expect(groupOfPath(entries, '/')).toBeUndefined();
  });
});
