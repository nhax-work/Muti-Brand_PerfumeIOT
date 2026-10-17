# ADR-0014 — Ân hạn mặc định, chủ động không gia hạn, đổi slot khi mua nhầm và giới hạn giữ chỗ

**Ngày:** 2026-10-13 · **Trạng thái:** đã duyệt (2026-10-13) · **Người quyết:** TV1

## Bối cảnh

Bản rà soát nghiệp vụ ngày 2026-10-13 chỉ ra các chỗ hở ở cuối vòng đời hóa đơn thuê slot:

| # | Chỗ hở | Hệ quả |
|---|---|---|
| P0-14 | FR-EXP-07 để Super Admin tự đặt ngày hết ân hạn cho từng hóa đơn; không có giá trị mặc định | Quên đặt thì ân hạn kéo dài vô hạn, hoặc job không biết khi nào thanh lý |
| P1-15 | Thương hiệu không muốn gia hạn chỉ có một đường: rơi vào ân hạn, chịu phí, rồi bị thanh lý | Thương hiệu mất hàng dù đã nói rõ là muốn lấy hàng về |
| P1-17 | Đã thanh toán thì không hủy, không đổi (ADR-0006) | Bấm nhầm slot trên một luồng tự phục vụ không có người tư vấn là mắc kẹt 3–12 tháng |
| P1-18 | Không giới hạn số slot một thương hiệu giữ chỗ chưa thanh toán | Một thương hiệu giữ liên tục mọi slot trống, chặn đối thủ |

## Phương án đã cân nhắc

| Vấn đề | Phương án | Chọn |
|---|---|---|
| Độ dài ân hạn mặc định | **7** · 14 · 30 ngày | **7 ngày** |
| Báo không gia hạn trước bao lâu | **bất cứ lúc nào trước hạn** · ≥ 3 ngày · ≥ 7 ngày | **bất cứ lúc nào** |
| Nhận hàng trả về | tự đến kho · nền tảng gửi, thương hiệu chịu phí · **thương hiệu chọn một trong hai** | **thương hiệu chọn** |
| Quá hạn nhận hàng | **14 ngày rồi thanh lý** · 30 ngày · tính phí lưu kho theo ngày | **14 ngày rồi thanh lý** |
| Mua nhầm slot | **chỉ đổi slot trong 48 giờ, không hoàn tiền** · hủy có hoàn, trừ phí · không hủy không đổi | **chỉ đổi slot** — tránh phải chuyển khoản hoàn tay |
| Giới hạn giữ chỗ | số phiên chưa thanh toán · **số slot chưa thanh toán** | **tối đa 5 slot** mỗi thương hiệu |

## Quyết định

### 1. Hai luồng kết thúc hóa đơn

| | **Ân hạn** — thương hiệu không làm gì | **Chủ động không gia hạn** — thương hiệu báo trước |
|---|---|---|
| Khi nào | Tới `ends_at` mà chưa có hóa đơn gia hạn và chưa báo không gia hạn | Bất cứ lúc nào trước `ends_at`, Brand Admin bấm "Không gia hạn, lấy hàng về" |
| Trạng thái hóa đơn | `GRACE` (FR-EXP-06) | Giữ `ACTIVE`/`EXPIRING` tới `ends_at`, không vào `GRACE` |
| Slot | Vẫn bán, doanh thu thuộc thương hiệu (FR-EXP-08, 09) | Bán tới khi Inventory Staff tháo chai thực tế; doanh thu tới lúc đó vẫn thuộc thương hiệu |
| Phí | Phí ân hạn (FR-EXP-10) | Không phí ân hạn |
| Thời hạn | `GRACE_PERIOD_DEFAULT_DAYS` = 7 ngày; Super Admin vẫn sửa được cho từng hóa đơn (FR-EXP-07) | — |
| Kết thúc | Gia hạn trong ân hạn → `RENEWED`. Không gia hạn → `LIQUIDATED` (FR-EXP-14, 15) | Tháo chai → chai `RETURNED_TO_BRAND` chờ nhận → hóa đơn `CLOSED` |
| Đổi ý | — | Rút lại được trước `ends_at`; sau đó muốn tiếp tục thì thuê lại slot như mới (nếu còn trống) |

**Báo sát ngày hết hạn.** Thương hiệu báo bất cứ lúc nào, nên kho có thể không kịp tháo chai đúng
`ends_at`. Khi đó slot tiếp tục bán tới lúc tháo chai thực tế, doanh thu những ngày đó vẫn thuộc thương
hiệu, không tính phí ân hạn.

### 2. Nhận hàng trả về

| Hạng mục | Quyết định |
|---|---|
| Cách nhận | Lúc báo không gia hạn, thương hiệu chọn: **tự đến kho lấy**, hoặc **nền tảng gửi về địa chỉ thương hiệu, thương hiệu chịu phí vận chuyển** (thu ngoài hệ thống, ghi nhận trên phiếu trả hàng) |
| Khi tháo chai | Inventory Staff cân khối lượng còn lại (FR-INV-15), ghi vào phiếu trả hàng, thông báo cho thương hiệu kèm danh sách chai |
| Bàn giao | Ghi người nhận, thời điểm, mã vận đơn nếu gửi; chai chuyển trạng thái `RETURNED_TO_BRAND` |
| Quá hạn nhận | Quá `RETURN_PICKUP_MAX_DAYS` = 14 ngày kể từ lúc hàng sẵn sàng mà thương hiệu chưa nhận → chuyển quyền sở hữu về nền tảng như thanh lý (FR-EXP-15, 16), có thông báo trước hạn 3 ngày |
| Bồi thường | Chai hỏng trong lúc chờ nhận vẫn được bồi thường theo gói bảo quản của hóa đơn vừa kết thúc |

### 3. Đổi slot khi mua nhầm

- Trong `SLOT_SWAP_WINDOW_HOURS` = 48 giờ kể từ lúc thanh toán, **và** chưa lắp chai đầu tiên, Brand
  Admin được đổi hóa đơn sang một slot trống khác có **cùng giá thuê niêm yết**.
- Không hoàn tiền, không bù chênh lệch. Đổi tối đa một lần cho mỗi hóa đơn.
- Hóa đơn giữ nguyên số hóa đơn, gói thuê, gói bảo quản; chỉ đổi slot. Ghi AuditLog (FR-AUD-03).
- Slot cũ được giải phóng ngay trong cùng transaction; ràng buộc `excl_slot_rental_overlap` vẫn chặn
  slot mới nếu vừa bị người khác giữ.

### 4. Giới hạn giữ chỗ

Một thương hiệu giữ chỗ tối đa `BRAND_MAX_HELD_SLOTS` = 5 slot **chưa thanh toán** cùng lúc, cộng dồn
trên mọi phiên thanh toán đang mở. Vượt thì `POST /rental-checkouts` bị từ chối. Slot đã thanh toán
không tính vào giới hạn.

### Thay đổi đặc tả và contract — viết ở PR riêng

| Chỗ | Thay đổi |
|---|---|
| `spec/constraints.md` | `GRACE_PERIOD_DEFAULT_DAYS = 7`, `RETURN_PICKUP_MAX_DAYS = 14`, `SLOT_SWAP_WINDOW_HOURS = 48`, `BRAND_MAX_HELD_SLOTS = 5` |
| `spec/errors.md` | `HOLD_LIMIT_REACHED` (409), `SLOT_SWAP_NOT_ALLOWED` (409: quá 48 giờ, đã lắp chai, đã đổi một lần, khác giá) |
| `schema.sql` | Enum `bottle_status` thêm `RETURNED_TO_BRAND` (migration riêng). `slot_rentals`: `non_renewal_requested_at`, `return_method`, `swapped_from_slot_id`, `swapped_at`. Bảng mới `bottle_returns` (phiếu trả hàng: hóa đơn, phương thức, sẵn sàng lúc, hạn nhận, người nhận, mã vận đơn) |
| `openapi.yaml` | `POST /slot-rentals/{id}/non-renewal` (+ `DELETE` để rút lại), `POST /slot-rentals/{id}/swap-slot`, `GET/POST /bottle-returns…` cho Inventory Staff |
| `docs/FR_NFR_SCENTSTATION.md` | Sửa FR-EXP-06, 07 (mặc định 7 ngày); sửa ADR-0006 "không hủy" thành "không hủy, được đổi slot trong 48 giờ"; sửa FR-INV-04 (thêm `RETURNED_TO_BRAND`); FR mới cho chủ động không gia hạn, trả hàng, đổi slot, giới hạn giữ chỗ |
| `spec/glossary.md` | State machine `SlotRental` và `Bottle` thêm nhánh mới |

## Hệ quả

- **Module:** SLT (không gia hạn, đổi slot, giới hạn giữ chỗ), EXP (ân hạn mặc định, job thanh lý hàng
  quá hạn nhận), INV (phiếu trả hàng).
- **Test:** job ân hạn và job quá hạn nhận hàng có bù sau downtime (nhóm trọng yếu "Job chuyển trạng
  thái"); đổi slot đồng thời với thương hiệu khác giữ slot đích (nhóm "Giữ chỗ slot đồng thời"); giỏ
  thứ hai vượt 5 slot bị từ chối.
- **Kiosk:** không đổi — slot đã tháo chai tự `UNAVAILABLE` theo FR-MCH-17.

---

## Nhật ký áp dụng

**2026-10-14:** áp đặc tả — FR mới và FR viết lại, `spec/constraints.md` (4 hằng), `spec/errors.md`
(`HOLD_LIMIT_REACHED`, `SLOT_SWAP_NOT_ALLOWED`), glossary.

**2026-10-16 — PR contract chung ADR-0013/0014/0015** (nhánh `feat/business-gap-review`):

| Hạng mục | Đã làm |
|---|---|
| Migration | `1791100000000_adr-0014-0015-enum-values.sql` — `bottle_status` thêm `RETURNED_TO_BRAND` (file riêng); `1791100060000_*` — enum `bottle_return_method`, cột `slot_rentals.non_renewal_requested_at/by`, `return_method`, `swapped_from_slot_id`, `swapped_at`; bảng `bottle_returns`; `bottles.bottle_return_id` |
| `schema.sql`, `erd.md` | Cột mới cuối bảng, §10g; nhóm Catalog và Inventory |
| `openapi.yaml` | `POST/DELETE /slot-rentals/{id}/non-renewal`, `POST /slot-rentals/{id}/swap-slot`, `GET/POST /bottle-returns`, `GET /bottle-returns/{id}`, `POST /bottle-returns/{id}/handover`; enum `BottleStatus`, `BottleReturnMethod` |

**Lệch:** thêm `non_renewal_requested_by` (ai báo — FR-AUD-03), `shipping_address` và `reminder_sent_at` trên
`bottle_returns` (ảnh chụp địa chỉ lúc lập phiếu; chống gửi trùng thông báo trước hạn 3 ngày của FR-EXP-28).
Khóa ngoại kép `(slot_rental_id, brand_id)` và `(bottle_return_id, brand_id)` chặn phiếu gom chai của thương
hiệu khác. Ràng buộc kiểm có chai ở `RETURNED_TO_BRAND` thì phải có phiếu so sánh qua `::text` vì giá trị enum
mới có thể chạy chung transaction (`docs/MIGRATIONS.md`).
