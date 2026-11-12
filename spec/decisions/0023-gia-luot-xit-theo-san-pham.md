# ADR-0023 — Giá mỗi lượt xịt đặt theo sản phẩm, slot lấy theo

**Ngày:** 2026-11-12 · **Trạng thái:** đề xuất · **Người quyết:** TV1

## Bối cảnh

Hiện có hai chỗ nhập giá cho cùng một thứ:

| Chỗ | FR | Ý nghĩa hiện tại |
|---|---|---|
| `fragrance_products.default_price` | FR-PRD-04 (mức S) | "Giá tham chiếu mặc định", chỉ để gợi ý khi đặt giá slot |
| `slot_rentals.price_per_spray` | FR-SLT-08 (mức M) | Giá bán thật, đặt riêng cho từng slot |

Khi thử luồng Brand Admin trên staging (2026-11-12), có ba vấn đề:

1. **Cùng một sản phẩm bán hai giá.** Thương hiệu thuê slot 1 và slot 2 trên cùng một máy, gán cùng
   một sản phẩm, rồi đặt 25.000 ₫ cho slot này và 10.000 ₫ cho slot kia. Khách đứng trước kiosk thấy
   cùng một chai nước hoa với hai giá. Hệ thống không chặn trường hợp này, và rất khó giải thích trước
   hội đồng.
2. **Nhập giá hai lần.** Thương hiệu nhập "giá gợi ý" khi tạo sản phẩm, rồi lại nhập giá cho từng slot.
   Người dùng thấy ô giá gợi ý là thừa.
3. **Đổi giá phải sửa từng slot.** Muốn tăng giá một sản phẩm đang bán ở nhiều slot thì phải mở từng
   slot ra sửa, và dễ bỏ sót.

## Phương án đã cân nhắc

1. **Giữ giá theo slot, chỉ cấm cùng sản phẩm khác giá trên cùng một máy.** Vẫn nhập giá hai lần, và
   luật "cùng máy" khó giải thích hơn luật "cùng sản phẩm".
2. **Giá đặt ở slot nhưng đồng bộ theo sản phẩm, bỏ giá ở sản phẩm.** Phải đổi `default_price` thành
   không bắt buộc (migration lược đồ), và sửa giá một slot lại âm thầm đổi giá các slot khác — khó
   đoán.
3. **Giá đặt một lần ở sản phẩm, mọi slot bán sản phẩm đó lấy theo.** **Chọn.** Một sản phẩm có đúng
   một giá ở mọi slot. Không đổi lược đồ: `default_price` đã bắt buộc, `price_per_spray` vẫn là giá
   chụp lại trên slot mà đơn hàng và kiosk đang đọc.

## Quyết định

### 1. Quy tắc

- `fragrance_products.default_price` là **giá mỗi lượt xịt** của sản phẩm (không còn là giá gợi ý).
  Vẫn tự do, không có giá sàn hay giá trần; phải lớn hơn 0 khi tạo hoặc sửa.
- **Gán sản phẩm vào slot** (`PUT /slot-rentals/{id}/product`, FR-SLT-27): trong cùng câu lệnh ghi,
  hệ thống đặt `price_per_spray = default_price` của sản phẩm.
- **Sửa giá sản phẩm** (`PATCH /products/{id}` có `defaultPrice`): trong cùng giao dịch, hệ thống cập
  nhật `price_per_spray` của mọi hóa đơn đang giữ slot với sản phẩm đó (trạng thái `DRAFT`, `ACTIVE`,
  `EXPIRING`, `GRACE`). Hóa đơn `LIQUIDATED` không đổi: hàng thanh lý đã thuộc nền tảng (BR-013).
- `PUT /slot-rentals/{id}/price` chỉ còn một việc: Platform Super Admin đặt giá cho slot đang bán
  hàng thanh lý (FR-EXP-18) — hàng đó đã thuộc nền tảng nên không theo giá sản phẩm của thương hiệu.
  Gọi cho hóa đơn ở trạng thái khác thì trả `VALIDATION_ERROR` (câu lỗi chỉ sang trang Sản phẩm);
  thương hiệu gọi cho hóa đơn `LIQUIDATED` vẫn nhận `FORBIDDEN_SCOPE` như FR-EXP-18 AC2.
- FR-SLT-09 không đổi: đơn hàng chụp giá lúc tạo, nên đổi giá sản phẩm chỉ ảnh hưởng đơn tạo sau đó.

### 2. Dữ liệu đang có

Migration dữ liệu (không đổi lược đồ) đặt `price_per_spray = default_price` cho mọi hóa đơn đang giữ
slot đã gán sản phẩm, để dữ liệu staging và demo khớp quy tắc ngay. Down migration không khôi phục giá
cũ (không còn lưu).

### 3. Câu chữ FR

| FR | Câu mới |
|---|---|
| FR-SLT-08 | Hệ thống phải cho phép Brand Admin tự do đặt giá mỗi lượt xịt cho từng sản phẩm của thương hiệu mình, không bị giới hạn bởi giá sàn hay giá trần; mọi slot bán sản phẩm đó áp dụng cùng một giá |
| FR-PRD-04 | Hệ thống phải lưu giá mỗi lượt xịt của sản phẩm và áp dụng cho slot khi gán sản phẩm (gộp vào FR-SLT-08) |

### 4. Không đổi

`schema.sql`, `erd.md`, `data-dictionary.md` (ngoài lời chú thích cột), `mqtt.md`, kiosk, đơn hàng,
đối soát chi trả.

## Hệ quả

- **Contract:** `openapi.yaml` sửa mô tả `Product.defaultPrice`, `SlotRental.pricePerSpray` và
  `PUT /slot-rentals/{id}/price` (chỉ còn cho FR-EXP-18). Không đổi kiểu dữ liệu. Thêm message key
  `slt.pricePerSprayFollowsProduct`, không thêm mã lỗi.
- **API:** SLT gán sản phẩm kèm giá; PRD cập nhật giá slot khi sửa giá sản phẩm, trong một giao dịch.
- **Web quản trị:** ô "Giá gợi ý mỗi lượt xịt" ở form sản phẩm đổi thành "Giá mỗi lượt xịt", kèm câu
  "áp dụng cho mọi slot đang bán sản phẩm này". Modal cấu hình slot bỏ bước đặt giá, chỉ hiện giá của
  sản phẩm đã chọn.
- **Tài liệu:** `docs/FR_NFR_SCENTSTATION.md`, `spec/modules/SLT.md` (FR-SLT-08), `spec/modules/PRD.md`.
- **Test:** `test_FR_SLT_08_*` viết lại theo quy tắc mới (gán sản phẩm lấy giá sản phẩm, sửa giá sản
  phẩm đổi giá mọi slot đang giữ, thương hiệu không đặt giá slot được), thêm
  `test_FR_EXP_18_platform_admin_sets_liquidation_price`.
