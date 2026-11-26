import { describe, expect, it } from 'vitest';
import type { InventoryBatch, ShipmentDeclaration } from '@/routes/shipments/api';
import { inWarehouse, lessReady, productReadiness } from './slot-product-readiness';

const NOW = new Date('2026-11-26T00:00:00Z');

const batch = (extra: Partial<InventoryBatch>) =>
  ({
    id: 'b',
    fragranceProductId: 'p-1',
    authenticityStatus: 'APPROVED',
    expiresAt: null,
    ...extra,
  }) as InventoryBatch;

const declaration = (extra: Partial<ShipmentDeclaration>) =>
  ({ id: 'd', fragranceProductId: 'p-1', status: 'DECLARED', ...extra }) as ShipmentDeclaration;

describe('productReadiness — mức sẵn sàng của sản phẩm cho slot (ADR-0035)', () => {
  it('lô còn hạn đã duyệt là sẵn sàng lắp; chưa duyệt là có hàng chờ giấy tờ', () => {
    expect(productReadiness('p-1', [batch({})], [], NOW)).toBe('READY');
    expect(productReadiness('p-1', [batch({ authenticityStatus: 'PENDING' })], [], NOW)).toBe(
      'DOCS',
    );
    expect(productReadiness('p-1', [batch({ authenticityStatus: 'NOT_SUBMITTED' })], [], NOW)).toBe(
      'DOCS',
    );
  });

  it('lô bị từ chối hoặc hết hạn không tính là có hàng — cùng quy tắc khóa ở máy chủ', () => {
    const unusable = [
      batch({ authenticityStatus: 'REJECTED' }),
      batch({ expiresAt: '2026-11-01T00:00:00Z' }),
    ];
    expect(productReadiness('p-1', unusable, [], NOW)).toBe('NONE');
    expect(productReadiness('p-1', unusable, [declaration({})], NOW)).toBe('SHIPPING');
  });

  it('chỉ xét lô và khai báo của đúng sản phẩm; khai báo đã nhận không tính là đang gửi', () => {
    expect(productReadiness('p-2', [batch({})], [declaration({})], NOW)).toBe('NONE');
    expect(productReadiness('p-1', [], [declaration({ status: 'RECEIVED' })], NOW)).toBe('NONE');
  });

  it('so mức sẵn sàng', () => {
    expect(inWarehouse('READY')).toBe(true);
    expect(inWarehouse('DOCS')).toBe(true);
    expect(inWarehouse('SHIPPING')).toBe(false);
    expect(lessReady('NONE', 'READY')).toBe(true);
    expect(lessReady('SHIPPING', 'NONE')).toBe(false);
  });
});
