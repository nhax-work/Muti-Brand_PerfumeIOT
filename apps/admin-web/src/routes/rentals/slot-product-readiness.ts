import type { InventoryBatch, ShipmentDeclaration } from '@/routes/shipments/api';

/**
 * Mức sẵn sàng của một sản phẩm để lắp vào slot, hiện cạnh từng sản phẩm trong pop-up Cấu hình slot
 * (ADR-0035 mục 6). Chỉ để gợi ý: tính từ khai báo gửi hàng và lô của thương hiệu — lô không có số chai
 * còn trong kho — nên máy chủ (`SlotRental.productLockReason`) vẫn là nguồn quyết định khóa.
 *
 * - `READY`: có lô còn hạn đã duyệt giấy tờ.
 * - `DOCS`: hàng đã về kho (lô còn hạn, chưa nộp hoặc chờ duyệt giấy tờ).
 * - `SHIPPING`: đã khai báo gửi hàng, kho chưa nhận.
 * - `NONE`: chưa gửi hàng.
 *
 * Lô bị từ chối giấy tờ hoặc đã hết hạn không tính — cùng quy tắc khóa ở máy chủ.
 */
export type ProductReadiness = 'READY' | 'DOCS' | 'SHIPPING' | 'NONE';

const RANK: Record<ProductReadiness, number> = { NONE: 0, SHIPPING: 1, DOCS: 2, READY: 3 };

export function productReadiness(
  productId: string,
  batches: readonly InventoryBatch[],
  declarations: readonly ShipmentDeclaration[],
  now: Date = new Date(),
): ProductReadiness {
  const usable = batches.filter(
    (b) =>
      b.fragranceProductId === productId &&
      b.authenticityStatus !== 'REJECTED' &&
      (b.expiresAt === null || b.expiresAt === undefined || new Date(b.expiresAt) > now),
  );
  if (usable.some((b) => b.authenticityStatus === 'APPROVED')) return 'READY';
  if (usable.length > 0) return 'DOCS';
  if (hasPendingShipment(productId, declarations)) return 'SHIPPING';
  return 'NONE';
}

/** Hàng của sản phẩm đã về kho — đổi sang sản phẩm này thì slot sẽ bị khóa (ADR-0035 mục 1). */
export function inWarehouse(readiness: ProductReadiness): boolean {
  return readiness === 'READY' || readiness === 'DOCS';
}

export function lessReady(next: ProductReadiness, current: ProductReadiness): boolean {
  return RANK[next] < RANK[current];
}

/** Có khai báo gửi hàng của sản phẩm mà kho chưa nhận. */
export function hasPendingShipment(
  productId: string,
  declarations: readonly ShipmentDeclaration[],
): boolean {
  return declarations.some((d) => d.fragranceProductId === productId && d.status === 'DECLARED');
}
