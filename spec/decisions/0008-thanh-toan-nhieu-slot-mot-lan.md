# ADR-0008 — Thanh toán một lần cho nhiều slot bằng phiên thanh toán

**Ngày:** 2026-09-30 · **Trạng thái:** đã duyệt (TV1, 2026-09-30) — contract áp cùng ngày (xem
"Nhật ký áp dụng") · **Người quyết:** TV1

Bổ sung cho `spec/decisions/0006-mua-goi-thue-slot-tu-phuc-vu-va-hoa-don.md`, gỡ bỏ "giới hạn đã
biết" *"mỗi lần thanh toán chỉ mua một slot (không có giỏ hàng)"* của ADR đó.

## Bối cảnh

Theo ADR-0006, một hóa đơn thuê slot (`slot_rentals`) ứng với đúng một slot, và thanh toán trỏ thẳng
vào hóa đơn (`payments.slot_rental_id`, mỗi hóa đơn tối đa một thanh toán `PENDING`). Hệ quả: thương
hiệu muốn thuê 3 slot phải chọn dịch vụ 3 lần, quét QR 3 lần, và 3 lần giữ chỗ hết hạn lệch nhau.
Đây là trải nghiệm kém đúng ở luồng tạo ra doanh thu của nền tảng (BR-009, BR-011).

Gộp nhiều slot vào **một** hàng `slot_rentals` thì không được: mỗi slot có vòng đời riêng — kích hoạt
khi lắp chai đầu tiên vào **slot đó** (FR-SLT-24), hết hạn, ân hạn, gia hạn và thanh lý theo từng slot
(FR-EXP), hạn mức bồi thường tính trên từng hóa đơn (FR-SLT-44), và `orders.slot_rental_id`,
`excl_slot_rental_overlap`, bộ lọc cô lập dữ liệu đều lấy một slot làm đơn vị.

## Phương án đã cân nhắc

1. **Giữ nguyên** — mỗi lần thanh toán một slot. Không đổi gì; trải nghiệm kém như trên.
2. **Thêm bảng đầu phiếu làm "hóa đơn" mới** (`rental_invoices` 1 ── * `slot_rentals`). Một lần trả,
   một số hóa đơn — đúng thói quen kế toán hơn. Nhưng `slot_rentals` phải đổi nghĩa thành "lượt thuê
   slot", kéo theo đổi thuật ngữ ở ~300 chỗ trong SLT, EXP, INV, glossary, PROJECT và viết lại nhiều
   AC đã duyệt ở ADR-0006.
3. **Thêm phiên thanh toán, mỗi slot vẫn là một hóa đơn** (`rental_checkouts` 1 ── * `slot_rentals`).
   Phiên gom giữ chỗ, tổng tiền và thanh toán; hóa đơn giữ nguyên nghĩa, số hóa đơn, ảnh chụp giá
   và vòng đời. Thương hiệu trả một lần, nhận N hóa đơn gom theo phiên.
4. **Bảng phân bổ thanh toán** (`payment_allocations` nối một payment với nhiều hóa đơn). Giữ được
   `slot_rentals` nguyên vẹn nhưng giờ giữ chỗ, tổng tiền và việc hủy đồng loạt vẫn rải trên từng hóa
   đơn — không có chỗ nào cưỡng chế "cả giỏ cùng hết hạn, cùng hủy, tổng khớp số đã trả".

## Quyết định

Chọn **phương án 3**, theo lựa chọn của TV1 ngày 2026-09-30:

| Câu hỏi | Chọn |
|---|---|
| Số hóa đơn đặt ở đâu | Mỗi slot một số hóa đơn, như ADR-0006. Phiên thanh toán không có số hóa đơn |
| Giới hạn số slot mỗi phiên | **Không giới hạn** — không thêm hằng ngưỡng mới vào `spec/constraints.md` |
| Gói trong giỏ | Mỗi slot chọn gói thuê và gói bảo quản riêng; giao diện có thể mặc định cùng gói cho cả giỏ |
| Một slot trong giỏ bị giữ chỗ | **Tất cả hoặc không có gì**: cả phiên bị từ chối `SLOT_OCCUPIED`, không hóa đơn nào được tạo |
| Gia hạn (FR-SLT-12) | Đi qua phiên thanh toán gồm đúng một hóa đơn — một đường thanh toán duy nhất |

Thuật ngữ tiếng Việt: **"phiên thanh toán"** (thuê slot); định danh kỹ thuật `RentalCheckout` /
`rental_checkouts`. "Hóa đơn thuê slot" vẫn là `SlotRental`.

### Luồng mới của Brand Admin

```
Xem slot trống ─> Chọn một hoặc nhiều slot, mỗi slot 1 gói thuê + 1 gói bảo quản
   ─> Hệ thống tạo 1 phiên thanh toán + 1 hóa đơn DRAFT mỗi slot, giữ chỗ mọi slot
      RENTAL_CHECKOUT_HOLD_MIN phút (cùng một mốc)
   ─> Thanh toán tổng tiền phiên một lần ─> webhook xác nhận
   ─> Mỗi hóa đơn nhận số hóa đơn riêng ─> cấu hình từng slot
```

Từ đây trở đi mỗi hóa đơn đi riêng: slot nào lắp chai trước thì hóa đơn đó `ACTIVE` trước.

### Luật nghiệp vụ

**Phiên thanh toán** có `total_amount`, `hold_expires_at`, `paid_at`, `cancelled_at`. Trạng thái suy ra,
không có cột: chờ thanh toán (cả hai NULL), đã thanh toán, đã hủy.

**Tạo phiên** (FR-SLT-35): phiên và mọi hóa đơn tạo trong **một** transaction. Mỗi hóa đơn chụp giá
riêng (FR-SLT-33) và tính tiền riêng (FR-SLT-36); tổng phiên = tổng các hóa đơn. Một slot lặp trong
giỏ trả `VALIDATION_ERROR`. Một slot đang bị giữ chỗ hoặc đã có hóa đơn làm
`excl_slot_rental_overlap` từ chối, transaction rollback — không có giỏ "thành công một nửa".

**Thanh toán** (FR-SLT-37): payment trỏ tới phiên, số tiền = tổng phiên. Mỗi phiên tối đa một
payment `PENDING`.

**Webhook thành công** (FR-SLT-38): cùng transaction — payment `SUCCEEDED`, `paid_at` của phiên và
của **mọi** hóa đơn, mỗi hóa đơn một số hóa đơn riêng. Số tiền lệch tổng phiên → `AMOUNT_MISMATCH`.
Tiền về sau khi phiên đã hủy → payment `REFUND_PENDING`, không khôi phục phiên hay hóa đơn nào.

**Hết giờ giữ chỗ** (FR-SLT-39): job quét **phiên**, không quét hóa đơn. Cùng transaction: phiên
`cancelled_at`, mọi hóa đơn → `CANCELLED`, payment `PENDING` → `EXPIRED`. Mọi slot trong giỏ cùng được
giải phóng.

**Thông báo** (FR-SLT-43): một thông báo cho mỗi phiên đã thanh toán, liệt kê mọi số hóa đơn — không
bắn N thông báo.

**Không đổi:** vòng đời từng hóa đơn (glossary), kích hoạt khi lắp chai, gia hạn nối tiếp, ân hạn,
thanh lý, bồi thường, doanh thu bán gói (FR-SLT-47 vẫn đếm theo hóa đơn), cô lập dữ liệu mức slot.

### Không thêm mã lỗi, không thêm hằng ngưỡng

| Tình huống | Mã |
|---|---|
| Một slot trong giỏ đang bị giữ chỗ hoặc đã có hóa đơn | `SLOT_OCCUPIED` (409) — cả phiên |
| Slot lặp trong giỏ; giỏ rỗng; gói ngừng mở bán; thiếu gói bảo quản; slot chưa có giá niêm yết | `VALIDATION_ERROR` (400) |
| Thanh toán phiên đã thanh toán, đã hủy hoặc quá `hold_expires_at` | `RENTAL_NOT_ACTIVE` (409) |
| Xem hoặc thanh toán phiên của thương hiệu khác | `FORBIDDEN_SCOPE` (403) |

`RENTAL_CHECKOUT_HOLD_MIN` giữ nguyên nghĩa, chỉ đổi chỗ áp: từ từng hóa đơn sang phiên.

### Thay đổi contract

**`schema.sql`** — qua migration mới `1790757100000_rental-checkouts.sql`:

| Thay đổi | Chi tiết |
|---|---|
| Bảng mới `rental_checkouts` | `id, brand_id, currency, total_amount, hold_expires_at, paid_at, cancelled_at, created_by, created_at, updated_at`; `chk_checkout_amount_nonnegative`, `chk_checkout_paid_or_cancelled`, `uq_checkout_id_brand (id, brand_id)`; `idx_checkouts_unpaid_hold` cho job FR-SLT-39 |
| `slot_rentals` | Thêm `checkout_id` + FK kép `fk_rental_checkout_same_brand (checkout_id, brand_id)`. **Bỏ** `hold_expires_at` và `idx_rentals_draft_unpaid_hold` — giờ giữ chỗ là của phiên. `chk_rental_package_snapshot_complete` đổi `hold_expires_at` thành `checkout_id`: hóa đơn theo gói bắt buộc thuộc một phiên |
| `payments` | **Thay** `slot_rental_id` bằng `rental_checkout_id` + FK kép `fk_payment_checkout_same_brand`; `chk_payment_single_target` = `num_nonnulls(order_id, rental_checkout_id) = 1`; `uq_rental_payment_pending` → `uq_checkout_payment_pending` |
| Constraint trigger `trg_rental_checkouts_consistency`, `trg_slot_rentals_checkout_consistency` (§10d) | Hoãn tới COMMIT: phiên có ≥ 1 hóa đơn; tổng phiên = tổng hóa đơn; phiên và hóa đơn cùng đã/chưa thanh toán, cùng đã/chưa hủy. Lỗi mang `check_violation` + tên `chk_checkout_*` |
| Dữ liệu cũ | Mỗi hóa đơn theo gói đã có thành một phiên một hóa đơn, dùng lại id hóa đơn làm id phiên; payment chuyển theo. Hóa đơn mô hình cũ (không gói) giữ `checkout_id` NULL |

Bỏ cột thay vì để `DEPRECATED` như ADR-0006 làm với `slot_rental_requests`: `payments.slot_rental_id`
và `slot_rentals.hold_expires_at` mới có một ngày, chưa có dòng code nào dùng (đã kiểm `apps/`,
`packages/`, `scripts/`, `tests/` sau khi lấy `origin/dev` ngày 2026-09-30), và dữ liệu được chuyển
chứ không mất.

**`openapi.yaml`:**

| Thay đổi | Chi tiết |
|---|---|
| Mới: `POST /rental-checkouts` (`createRentalCheckout`) | Thay `POST /slot-rentals/checkout`. Body `RentalCheckoutCreate { items: [{ slotId, rentalPackageId, storagePlanId }] }`, trả `RentalCheckout` |
| Mới: `GET /rental-checkouts/{id}` (`getRentalCheckout`) | Phiên kèm các hóa đơn, để quay lại thanh toán |
| Mới: `POST /rental-checkouts/{id}/payments` (`payRentalCheckout`) | Thay `POST /slot-rentals/{id}/payments` |
| Xóa | `POST /slot-rentals/checkout`, `POST /slot-rentals/{id}/payments` — mới có một ngày, chưa hiện thực, nên xóa thay vì đánh dấu `deprecated` |
| `POST /slot-rentals/{id}/renew` | Trả `RentalCheckout` gồm một hóa đơn gia hạn |
| Schema mới | `RentalCheckoutCreate`, `RentalCheckout`, `RentalCheckoutStage` (nhãn suy ra, không phải enum CSDL) |
| Schema sửa | `SlotRental` và `RentalInvoice` thêm `checkoutId` (`holdExpiresAt` giữ nguyên, lấy từ phiên); `RentalPaymentIntent.rentalId` → `checkoutId`; `Payment.slotRentalId` → `rentalCheckoutId` |
| Webhook | Mô tả: phân nhánh theo `orderId` / `rentalCheckoutId`; ghi nhận cả phiên |

**`erd.md`, `README.md`, `data-dictionary.md`** cập nhật cùng đợt; `data-dictionary.md` sinh lại.

## Hệ quả

**Đặc tả:**
- `spec/modules/SLT.md`: viết lại FR-SLT-35, 36, 37, 38, 39, 43; chỉnh FR-SLT-12, 40.
- `docs/FR_NFR_SCENTSTATION.md`: câu phát biểu FR-SLT-35, 37, 38, 39, 43; quyết định nghiệp vụ #6.
- `spec/glossary.md`, `spec/PROJECT.md`, `docs/LO_TRINH_AI_HARNESS_13_TUAN.md`.
- `seed_document/DB_DIAGRAM_MERMAID.md` (nguồn thiết kế của `schema.sql`).

Không có FR mới: "thanh toán nhiều slot một lần" là phạm vi mở rộng của FR-SLT-35 và FR-SLT-37, số
hiệu và truy vết giữ nguyên.

**Test người tự viết bị ảnh hưởng** (`spec/testing.md`) — các ca này là của người, agent không sinh:
- *Unique constraint slot* — thêm ca giỏ nhiều slot có một slot đã bị giữ chỗ: cả phiên bị từ chối,
  không sót hóa đơn nào; hai thương hiệu checkout hai giỏ chồng nhau một slot đồng thời.
- *Idempotency webhook* — webhook trùng cho phiên nhiều hóa đơn: chỉ một lần cấp số, không cấp số
  thứ hai cho hóa đơn nào.
- *Job chuyển trạng thái hóa đơn* — job hủy theo phiên: mọi hóa đơn của phiên cùng `CANCELLED`, kể cả
  bù sau downtime.

Test hiện có (`test_slot_constraint`, `test_slot_isolation`) không phải sửa: chúng ghi thẳng vào
`slot_rentals` theo mô hình cũ (không gói), vốn không cần phiên.

**Mã nguồn:** module `slt` (trên `dev`) chưa hiện thực checkout, thanh toán hay webhook, nên không có
code nghiệp vụ phải sửa. TV1 (webhook, T4) phân nhánh theo `payments.rental_checkout_id` thay vì
`slot_rental_id`. TV3 (checkout, T4; thanh toán, T5) hiện thực theo `/rental-checkouts`. Màn hình
Brand Admin (T5) thêm bước giỏ: chọn nhiều slot trống, chọn gói cho từng slot, xem tổng, thanh toán.

**Giới hạn đã biết:** không bớt được một slot khỏi phiên đang giữ chỗ — muốn đổi giỏ thì để phiên hết
giờ (hoặc chờ job hủy) rồi tạo phiên mới; chưa có endpoint hủy phiên chủ động. Giữ chỗ nhiều slot
không giới hạn nghĩa là một thương hiệu có thể giữ mọi slot trống trong `RENTAL_CHECKOUT_HOLD_MIN`
phút mà không trả tiền; chấp nhận ở quy mô pilot (2 thương hiệu), xem lại nếu mở rộng.

## Nhật ký áp dụng — 2026-09-30

Áp theo yêu cầu của TV1, **trước** khi review. **TV1 đã duyệt ngày 2026-09-30.**

| Hạng mục | Đã làm |
|---|---|
| Migration | `1790757100000_rental-checkouts.sql` (một file — không thêm giá trị enum nào) |
| `schema.sql` | Mô tả trạng thái sau file trên; §10d mới cho constraint trigger; §13 mục 12 |
| `openapi.yaml` | 3 operation mới, 2 path xóa, 3 schema mới, 4 schema sửa; `redocly lint` sạch |
| `erd.md`, `README.md` | Bảng mới, quan hệ thanh toán qua phiên, index bắt buộc đổi tên |
| Sinh lại | `data-dictionary.md`, `packages/contracts/src/openapi.ts`, `apps/api/src/shared/db/types.generated.ts` |
| `scripts/gen-data-dictionary.ts` | Xếp `rental_checkouts` vào nhóm Catalog; tiện thể xếp 3 bảng của ADR-0006 (`rental_packages`, `storage_plans`, `storage_compensations`) vốn đang nằm ở mục "Bảng chưa xếp nhóm" |

**Đã kiểm trên PostgreSQL 16** (container riêng `scent-db-adr0008`, không đụng `scent-db` hay
`scent-db-test`):
- DB có lược đồ cũ + seed + hai hóa đơn theo gói kiểu ADR-0006 (một đang giữ chỗ có payment `PENDING`,
  một đã thanh toán có số hóa đơn và payment `SUCCEEDED`): migration chạy trọn, mỗi hóa đơn thành một
  phiên cùng id, payment trỏ đúng phiên, giờ giữ chỗ chuyển sang phiên.
- DB trống: chạy trọn 6 migration. Down 1 rồi Up lại trên DB có phiên 2 hóa đơn: chạy trọn (Down xóa
  thanh toán của phiên nhiều hóa đơn, như đã ghi trong file).
- `pg_dump --schema-only` của DB nạp `schema.sql` trùng khít DB chạy hết migration, kể cả COMMENT,
  trigger và function; quyền `scent_app` trên `rental_checkouts` khớp.
- 19 ca ràng buộc chạy mỗi ca một transaction, đều đúng kỳ vọng: phiên 2 slot hợp lệ; tổng lệch, phiên
  rỗng, hóa đơn theo gói không phiên, hóa đơn khác thương hiệu trong phiên, payment `PENDING` thứ hai,
  payment lệch thương hiệu, payment không đích, webhook sót một hóa đơn, hủy phiên đã trả, chuyển hóa
  đơn làm phiên cũ rỗng, xóa hóa đơn khỏi phiên đã trả — đều bị CSDL từ chối; giỏ có một slot đang bị
  giữ bị từ chối cả phiên và không sót hóa đơn; hủy phiên giải phóng slot cho thương hiệu khác; hóa
  đơn mô hình cũ vẫn ghi được.
- `npm run lint` sạch; test contract 38/38, unit 118/118, integration 35/35.
