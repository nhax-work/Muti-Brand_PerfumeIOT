import { describe, expect, it } from 'vitest';
import CatalogScreen from '@/screens/catalog/CatalogScreen';
import { router } from './router';

async function componentOf(path: string): Promise<unknown> {
  const route = router.routes[0]?.children?.find((r) => r.path === path);
  if (typeof route?.lazy !== 'function') throw new Error(`Không có route lazy ${path}`);
  return ((await route.lazy()) as { Component?: unknown }).Component;
}

describe('router kiosk', () => {
  it('/checkout/:slot dùng chung CatalogScreen với /products/:slot — mã QR là modal, không có màn điều khoản thứ hai (FR-ORD-08, FR-ORD-25)', async () => {
    expect(await componentOf('products/:slotNumber')).toBe(CatalogScreen);
    expect(await componentOf('checkout/:slotNumber')).toBe(CatalogScreen);
  });
});
