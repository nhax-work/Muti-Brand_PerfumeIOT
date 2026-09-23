/**
 * CHỐT CHẶN CÔ LẬP DỮ LIỆU MỨC SLOT — QT4 của ADR-0003.
 *
 * Mọi truy vấn trả dữ liệu thuộc thương hiệu PHẢI lấy điều kiện lọc từ đây. Handler và service
 * không được tự viết `WHERE brand_id = ...`.
 *
 * Vì sao phải là một chốt: NFR-SEC-04 đòi 100% endpoint có dữ liệu thương hiệu vượt được test truy
 * cập chéo, mà Row-Level Security chưa bật ở tầng CSDL (ADR-0002, schema.sql §12). Không có lưới
 * đỡ phía dưới — một truy vấn quên điều kiện là rò rỉ ngay. Một chốt thì test kiểm một hàm; rải
 * rác thì phải kiểm từng endpoint và sẽ sót.
 *
 * Ba quy tắc mã hóa trong file này (FR-AUTH-07, FR-BND-05, BR-003, BR-012):
 *
 *   1. Lọc qua `orders`/`slot_rentals`, KHÔNG BAO GIỜ qua `machines`.
 *      `machines` không có cột `brand_id` — một máy chứa slot của nhiều thương hiệu.
 *
 *   2. Với `orders`, lọc kèm `revenue_owner = 'BRAND'`.
 *      Đơn phát sinh sau khi hợp đồng bị thanh lý vẫn giữ `orders.brand_id` của thương hiệu cũ
 *      nhưng doanh thu thuộc nền tảng, và thương hiệu KHÔNG được thấy (FR-EXP-20, FR-REV-06).
 *      Lọc chỉ bằng `brand_id` là rò rỉ.
 *
 *   3. Phạm vi bị chặn cả theo thời gian, không chỉ theo tập slot (FR-AUTH-07 AC3).
 *      Xem ghi chú "Hai loại bảng" bên dưới.
 */

import { sql, type Expression, type SqlBool } from 'kysely';
import { isBrandScoped, type Principal } from './principal.js';

/**
 * Phạm vi đã giải ra từ chủ thể.
 *
 * `UNRESTRICTED` dành cho tài khoản mức nền tảng (Platform Super Admin, Operations Staff,
 * Inventory Staff) — họ nhìn thấy dữ liệu của mọi thương hiệu (FR-BND-07).
 */
export type BrandScope =
  { readonly kind: 'UNRESTRICTED' } | { readonly kind: 'BRAND'; readonly brandId: string };

/**
 * Hàm DUY NHẤT được phép quyết định phạm vi thương hiệu của một chủ thể.
 *
 * Quyết định theo `brandId` chứ không theo vai trò: một tài khoản có thể mang nhiều vai trò, nhưng
 * chỉ tài khoản gắn thương hiệu mới bị giới hạn (FR-AUTH-05).
 */
export function resolveBrandScope(principal: Principal): BrandScope {
  if (!isBrandScoped(principal)) {
    return { kind: 'UNRESTRICTED' };
  }
  // isBrandScoped đã bảo đảm khác null; ép kiểu ở đúng một chỗ thay vì rải khắp nơi.
  return { kind: 'BRAND', brandId: principal.brandId as string };
}

/**
 * HAI LOẠI BẢNG, HAI CÁCH LỌC
 *
 * Loại A — bảng có cột `brand_id` chụp tại thời điểm tạo:
 *   orders, kiosk_interaction_events, refill_requests, payments, order_status_histories,
 *   payment_events, dispense_commands, dispense_results, bottles, inventory_batches,
 *   brand_shipment_declarations, inventory_adjustments, refill_sessions, notifications,
 *   fragrance_products, slot_rentals, slot_rental_requests.
 *
 *   Với nhóm này, ràng buộc thời gian ĐÃ TỰ THỎA: ảnh chụp `brand_id` được ghi tại thời điểm tạo
 *   bản ghi và bất biến sau đó (NFR-DAT-06). Một đơn phát sinh trước khi thương hiệu thuê slot,
 *   hoặc sau khi hợp đồng kết thúc, thuộc một hợp đồng khác nên mang `brand_id` khác. Không cần
 *   thêm điều kiện khoảng thời gian.
 *
 * Loại B — bảng KHÔNG có `brand_id`, gắn với máy hoặc slot:
 *   sensor_readings, device_events, machine_status_histories, machines, machine_slots,
 *   và `alerts` khi `brand_id` là NULL (cảnh báo mức máy — FR-ALR-09).
 *
 *   Với nhóm này phải nối qua `slot_rentals` VÀ so khoảng thời gian, vì cùng một slot phục vụ
 *   nhiều thương hiệu ở các kỳ hạn khác nhau. Dùng `brandScopedBySlotAndTime`.
 */

/**
 * Điều kiện cho bảng LOẠI A (có cột `brand_id`).
 *
 * @param column tên cột brand_id đã đủ định danh, ví dụ `'o.brand_id'`
 */
export function brandScopedByColumn(scope: BrandScope, column: string): Expression<SqlBool> {
  if (scope.kind === 'UNRESTRICTED') {
    return sql<SqlBool>`true`;
  }
  return sql<SqlBool>`${sql.ref(column)} = ${scope.brandId}`;
}

/**
 * Điều kiện cho bảng `orders` — loại A nhưng BẮT BUỘC kèm `revenue_owner`.
 *
 * Tách thành hàm riêng thay vì để người gọi tự nhớ thêm điều kiện: quên `revenue_owner` là lỗi
 * rò rỉ dữ liệu im lặng, và nó sẽ không bị phát hiện cho tới khi có hợp đồng đầu tiên bị thanh lý.
 *
 * @param alias bí danh bảng orders trong truy vấn, mặc định `'orders'`
 */
export function brandScopedOrders(scope: BrandScope, alias = 'orders'): Expression<SqlBool> {
  if (scope.kind === 'UNRESTRICTED') {
    return sql<SqlBool>`true`;
  }
  return sql<SqlBool>`${sql.ref(`${alias}.brand_id`)} = ${scope.brandId}
      and ${sql.ref(`${alias}.revenue_owner`)} = 'BRAND'`;
}

/** Trạng thái hợp đồng được coi là đang chiếm dụng slot (spec/glossary.md). */
export const OCCUPYING_RENTAL_STATUSES = ['ACTIVE', 'EXPIRING', 'GRACE', 'LIQUIDATED'] as const;

/**
 * Điều kiện cho bảng LOẠI B (gắn slot/máy, không có `brand_id`).
 *
 * Sinh mệnh đề EXISTS nối qua `slot_rentals`: bản ghi chỉ thuộc phạm vi của thương hiệu nếu slot
 * của nó từng được thương hiệu thuê VÀ mốc thời gian của bản ghi rơi vào đúng kỳ hạn hợp đồng
 * (FR-AUTH-07 AC2, AC3).
 *
 * @param slotColumn cột slot_id của bảng đang truy vấn, ví dụ `'sr.slot_id'`
 * @param timeColumn cột mốc thời gian của bản ghi, ví dụ `'sr.measured_at'`
 */
export function brandScopedBySlotAndTime(
  scope: BrandScope,
  slotColumn: string,
  timeColumn: string,
): Expression<SqlBool> {
  if (scope.kind === 'UNRESTRICTED') {
    return sql<SqlBool>`true`;
  }
  return sql<SqlBool>`exists (
    select 1
      from slot_rentals sr_scope
     where sr_scope.slot_id = ${sql.ref(slotColumn)}
       and sr_scope.brand_id = ${scope.brandId}
       and ${sql.ref(timeColumn)} >= sr_scope.starts_at
       and ${sql.ref(timeColumn)} < coalesce(sr_scope.grace_ends_at, sr_scope.ends_at)
  )`;
}

/**
 * Tập slot mà thương hiệu ĐANG có hợp đồng chiếm dụng, KỂ CẢ hợp đồng đã thanh lý — dùng để suy
 * danh sách thương hiệu bị ảnh hưởng bởi cảnh báo mức máy (FR-ALR-09).
 *
 * Khác `brandScopedBySlotAndTime` ở chỗ chỉ xét hiện tại, không xét lịch sử.
 *
 * KHÔNG dùng cho sơ đồ máy — xem `brandHoldsSlotNow` bên dưới.
 */
export function brandOccupiesSlotNow(scope: BrandScope, slotColumn: string): Expression<SqlBool> {
  if (scope.kind === 'UNRESTRICTED') {
    return sql<SqlBool>`true`;
  }
  return sql<SqlBool>`exists (
    select 1
      from slot_rentals sr_now
     where sr_now.slot_id = ${sql.ref(slotColumn)}
       and sr_now.brand_id = ${scope.brandId}
       and sr_now.status = any(${sql.val(OCCUPYING_RENTAL_STATUSES)}::slot_rental_status[])
  )`;
}

/** Trạng thái hợp đồng mà thương hiệu còn quyền khai thác thương mại trên slot. */
export const HOLDING_RENTAL_STATUSES = ['ACTIVE', 'EXPIRING', 'GRACE'] as const;

/**
 * Tập slot mà thương hiệu còn KHAI THÁC — dùng cho màn hình sơ đồ máy (FR-RPT-12).
 *
 * Khác `brandOccupiesSlotNow` đúng một điểm: **loại `LIQUIDATED`**.
 *
 * Hợp đồng bị thanh lý vẫn chiếm slot về mặt vận hành — slot tiếp tục bán hàng tồn — nhưng hàng và
 * doanh thu đã thuộc nền tảng (FR-EXP-17, FR-REV-02). Để sơ đồ máy hiện `mine = true` cho slot đó là
 * đưa tên sản phẩm và lượng tồn của **nền tảng** cho thương hiệu cũ xem, đúng thứ FR-EXP-20 chặn.
 *
 * Lưu ý cho người review: đây là một **diễn giải đặc tả**. FR-RPT-12 chỉ nói "slot thuộc hợp đồng
 * của thương hiệu mình" mà không nói rõ hợp đồng đã thanh lý có tính hay không; chọn loại nó ra là
 * bám FR-EXP-20 chặt hơn. Nếu hội đồng chốt ngược lại thì đổi đúng hàm này, không rải điều kiện ra
 * ngoài.
 */
export function brandHoldsSlotNow(scope: BrandScope, slotColumn: string): Expression<SqlBool> {
  if (scope.kind === 'UNRESTRICTED') {
    return sql<SqlBool>`true`;
  }
  return sql<SqlBool>`exists (
    select 1
      from slot_rentals sr_hold
     where sr_hold.slot_id = ${sql.ref(slotColumn)}
       and sr_hold.brand_id = ${scope.brandId}
       and sr_hold.status = any(${sql.val(HOLDING_RENTAL_STATUSES)}::slot_rental_status[])
  )`;
}
