import { describe, expect, it, vi } from 'vitest';
import AttractScreen from '@/screens/attract/AttractScreen';
import CatalogScreen from '@/screens/catalog/CatalogScreen';
import { router } from './router';

async function componentOf(path: string): Promise<unknown> {
  const route = router.routes[0]?.children?.find((r) =>
    path === '' ? r.index === true : r.path === path,
  );
  if (!route) throw new Error(`Không có route ${path}`);
  if (typeof route.lazy === 'function') {
    return ((await route.lazy()) as { Component?: unknown }).Component;
  }
  // Route khớp URL lúc khởi tạo (jsdom đứng ở "/") được router tự nạp: lazy đã thành element.
  const loaded = () => route.Component ?? (route.element as { type?: unknown } | null)?.type;
  await vi.waitFor(() => expect(loaded()).toBeDefined());
  return loaded();
}

describe('router kiosk', () => {
  it('/ là màn chờ, /catalog là danh mục (NFR-USA-02)', async () => {
    expect(await componentOf('')).toBe(AttractScreen);
    expect(await componentOf('catalog')).toBe(CatalogScreen);
  });

  it('/checkout/:slot dùng chung CatalogScreen với /products/:slot — đổi URL không mất đơn đang thanh toán (FR-ORD-08, FR-ORD-25)', async () => {
    expect(await componentOf('products/:slotNumber')).toBe(CatalogScreen);
    expect(await componentOf('checkout/:slotNumber')).toBe(CatalogScreen);
  });
});
