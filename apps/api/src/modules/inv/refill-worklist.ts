/**
 * Việc cần nạp (ADR-0026): xếp loại từng slot từ dữ kiện `InvQueries.refillWorklist` — hàm thuần,
 * không đọc CSDL, để luật xếp loại kiểm được bằng unit test.
 *
 *   hóa đơn DRAFT đã trả tiền          → FIRST_INSTALL
 *   còn yêu cầu bổ sung đang mở         → REFILL_REQUEST
 *   đang bán mà sắp hết / không có chai → LOW_STOCK
 *   còn lại (đang bán bình thường)      → không phải việc
 *
 * Lý do chưa làm được xét theo thứ tự người cần xử lý trước: thương hiệu gán sản phẩm → Super Admin
 * duyệt yêu cầu → hàng về kho → giấy tờ lô được duyệt.
 */

import type { Schema } from '@scentstation/contracts';
import type { RefillWorklistRow } from './inv.queries.js';

export type RefillWorkItem = Schema<'RefillWorkItem'>;
type Kind = Schema<'RefillWorkKind'>;
type Blocker = Schema<'RefillWorkBlocker'>;

/** Hóa đơn đã thanh toán nhưng chưa lắp chai đầu tiên (ADR-0006: DRAFT + paid_at). */
const AWAITING_STOCK_STATUS = 'DRAFT';

function kindOf(row: RefillWorklistRow): Kind | null {
  if (row.rental_status === AWAITING_STOCK_STATUS) return 'FIRST_INSTALL';
  if (row.refill_request_id !== null) return 'REFILL_REQUEST';
  if (row.low_stock || row.active_bottle_id === null) return 'LOW_STOCK';
  return null;
}

function blockerOf(row: RefillWorklistRow, kind: Kind): Blocker | null {
  if (row.fragrance_product_id === null) return 'PRODUCT_NOT_ASSIGNED';
  if (kind === 'REFILL_REQUEST' && row.refill_request_status === 'SUBMITTED') {
    return 'REQUEST_NOT_APPROVED';
  }
  if (row.suggested_bottle_id === null) {
    return row.unexpired_bottle_count > 0 ? 'DOCS_NOT_APPROVED' : 'NO_STOCK';
  }
  return null;
}

/** Yêu cầu bổ sung có lịch đi trước, rồi lắp chai đầu tiên, rồi sắp hết. */
const KIND_ORDER: Record<Kind, number> = { REFILL_REQUEST: 0, FIRST_INSTALL: 1, LOW_STOCK: 2 };

/**
 * Thứ tự: phiếu đang mở (việc dở) → việc làm được → việc bị chặn; trong mỗi nhóm theo loại, lịch hẹn
 * sớm trước, rồi máy và số slot.
 */
function compare(a: RefillWorkItem, b: RefillWorkItem): number {
  const group = (i: RefillWorkItem) => (i.openRefillSessionId ? 0 : i.blocker === null ? 1 : 2);
  return (
    group(a) - group(b) ||
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    (a.scheduledAt ?? '￿').localeCompare(b.scheduledAt ?? '￿') ||
    a.machineName.localeCompare(b.machineName) ||
    a.slotNumber - b.slotNumber
  );
}

export function buildRefillWorklist(rows: readonly RefillWorklistRow[]): RefillWorkItem[] {
  const items: RefillWorkItem[] = [];
  for (const row of rows) {
    const kind = kindOf(row);
    if (kind === null) continue;
    items.push({
      slotId: row.slot_id,
      slotNumber: row.slot_number,
      machineId: row.machine_id,
      machineName: row.machine_name,
      machineSerial: row.machine_serial,
      locationName: row.location_name,
      slotRentalId: row.slot_rental_id,
      brandId: row.brand_id,
      brandName: row.brand_name,
      fragranceProductId: row.fragrance_product_id,
      productName: row.product_name,
      kind,
      blocker: blockerOf(row, kind),
      pendingShipment: row.pending_shipment,
      estimatedRemainingSprays:
        row.active_bottle_id === null ? null : row.estimated_remaining_sprays,
      refillRequestId: row.refill_request_id,
      refillRequestReason: row.refill_request_reason,
      refillRequestStatus: row.refill_request_status,
      scheduledAt: row.scheduled_at?.toISOString() ?? null,
      openRefillSessionId: row.open_refill_session_id,
      suggestedBottle:
        row.suggested_bottle_id === null
          ? null
          : {
              id: row.suggested_bottle_id,
              identifier: row.suggested_bottle_identifier!,
              currentEstimatedMl: Number(row.suggested_bottle_ml),
              expiresAt: row.suggested_bottle_expires_at?.toISOString() ?? null,
            },
      availableBottleCount: row.available_bottle_count,
    });
  }
  return items.sort(compare);
}
