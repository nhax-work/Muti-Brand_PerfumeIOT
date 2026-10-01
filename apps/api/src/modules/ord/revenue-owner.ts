/**
 * Chủ sở hữu doanh thu của một đơn, quyết định đúng một lần lúc tạo đơn (FR-REV-01, FR-REV-02).
 *
 * Giá trị được CHỤP vào `orders.revenue_owner` và không bao giờ đổi (FR-REV-03) — trigger
 * `trg_orders_snapshot_immutable` chặn cả UPDATE viết tay (ADR-0009).
 */

import type { RevenueOwnerType, SlotRentalStatus } from '../../shared/db/types.generated.js';

/**
 * @returns `null` khi hóa đơn ở trạng thái không bán được (spec/glossary.md, bảng SlotRental) — người
 *   gọi phải từ chối tạo đơn, không được đoán một chủ sở hữu.
 */
export function revenueOwnerFor(rentalStatus: SlotRentalStatus): RevenueOwnerType | null {
  switch (rentalStatus) {
    case 'ACTIVE':
    case 'EXPIRING':
    case 'GRACE':
      return 'BRAND';
    case 'LIQUIDATED':
      // Slot đang bán hàng thanh lý: hàng đã thuộc nền tảng (FR-EXP-15), tiền cũng vậy.
      return 'PLATFORM';
    default:
      return null;
  }
}
