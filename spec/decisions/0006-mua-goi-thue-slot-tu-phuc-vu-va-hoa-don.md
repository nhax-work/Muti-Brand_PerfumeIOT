# ADR-0006 — Thuê slot tự phục vụ theo gói trả trước, gói bảo quản và hóa đơn

**Ngày:** 2026-09-25 · **Trạng thái:** đã duyệt (TV1, 2026-09-29) — contract áp dụng cùng ngày (xem "Nhật ký áp dụng" cuối
file) · **Người quyết:** TV1

Thay thế `spec/decisions/0005-thanh-toan-coc-va-phi-ky-dau-hop-dong-thue-slot.md` (chưa từng được
duyệt).

## Bối cảnh

Mô hình thuê slot đang ghi trong đặc tả là mô hình **đàm phán hợp đồng**:

| Bước | Đặc tả đang ghi |
|---|---|
| Thuê | Brand Admin gửi yêu cầu thuê (FR-SLT-20) → Super Admin duyệt kèm điều khoản (FR-SLT-22) → hệ thống tạo hợp đồng `DRAFT` (FR-SLT-23) → tự `ACTIVE` đúng ngày bắt đầu (FR-SLT-24) |
| Thu tiền | Phí cố định theo kỳ + tỷ lệ ăn chia doanh thu, cấu hình riêng từng hợp đồng, trừ vào doanh thu lượt xịt trong bảng quyết toán (BR-009, FR-SLT-17, 18) |
| Rủi ro | Thương hiệu chưa trả đồng nào vẫn khai thác được slot; quyết toán âm là công nợ không có bảo đảm |

ADR-0005 vá chỗ hở thu tiền bằng tiền cọc cộng phí kỳ đầu, nhưng vẫn giữ nguyên bước đàm phán và
duyệt tay. Nhóm quyết định (2026-09-25) đổi hẳn sang mô hình **mua gói tự phục vụ**: thương hiệu tự
chọn slot và gói, trả hết một lần, không cần Super Admin duyệt từng lượt thuê.

## Phương án đã cân nhắc

1. **Giữ đàm phán, thêm cọc + phí kỳ đầu** (ADR-0005). Vá được rủi ro công nợ, nhưng mỗi lượt thuê
   vẫn cần Super Admin duyệt tay và nhập điều khoản riêng; quyết toán vẫn phức tạp (phí, ăn chia, trả
   trước, cấn trừ cọc).
2. **Mua gói trả trước tự phục vụ.** Super Admin chỉ cấu hình bảng giá một lần; thương hiệu tự mua.
   Không còn công nợ phí thuê vì tiền thu trước toàn bộ. Mất tính linh hoạt điều khoản riêng từng
   thương hiệu.

## Quyết định

Chọn **phương án 2**, với các lựa chọn của nhóm ngày 2026-09-25:

| Câu hỏi | Chọn |
|---|---|
| Thời hạn thuê | Gói 3, 6, 12 tháng; gói dài hơn có ưu đãi |
| Thanh toán | Trả hết một lần qua cổng thanh toán, ngay trong web quản trị |
| Ăn chia doanh thu lượt xịt | **Bỏ.** Nền tảng chỉ thu tiền gói thuê và gói bảo quản; doanh thu lượt xịt của thương hiệu về thương hiệu 100% |
| Gói bảo quản (bảo hiểm hàng hóa) | **Bắt buộc** chọn đúng một gói mỗi lượt thuê |
| Ngày bắt đầu tính thời hạn | Lúc Inventory Staff lắp chai đầu tiên vào slot |
| Thuật ngữ | Tài liệu tiếng Việt gọi là **"hóa đơn thuê slot"**; định danh kỹ thuật giữ nguyên `SlotRental` / `slot_rentals` |

### Luồng mới của Brand Admin

```
Đăng nhập ─> Xem slot trống (kèm giá niêm yết) ─> Chọn slot
   ─> Chọn dịch vụ: 1 gói thuê (3/6/12 tháng) + 1 gói bảo quản
   ─> Hệ thống tạo hóa đơn DRAFT, giữ chỗ slot RENTAL_CHECKOUT_HOLD_MIN phút
   ─> Thanh toán ─> webhook xác nhận ─> cấp số hóa đơn
   ─> Nhận hóa đơn ─> Cấu hình slot (gán sản phẩm, đặt giá lượt xịt)
```

**Luồng cung ứng giữ nguyên** (FR-INV-22 ÷ 31): khai báo gửi hàng → kho đối chiếu và nhận → mở phiếu
nạp → lắp chai. **Lần lắp chai đầu tiên** vào slot của hóa đơn đã thanh toán sẽ kích hoạt hóa đơn:
`starts_at` = thời điểm lắp, `ends_at` = `starts_at` + số tháng của gói.

### Luật nghiệp vụ

**Thuật ngữ.** "Hợp đồng thuê slot" đổi thành "hóa đơn thuê slot" trong mọi tài liệu tiếng Việt.
Một hóa đơn ứng với đúng một slot và một lần mua — thương hiệu thuê 3 slot có 3 hóa đơn. Hóa đơn
vừa là chứng từ thanh toán vừa là đơn vị cô lập dữ liệu, nên **không** tách thành một thực thể
`RentalInvoice` riêng: mọi lần mua sinh đúng một `SlotRental` và ngược lại, một bảng thứ hai chỉ là
bản sao 1–1. Định danh kỹ thuật (`slot_rentals`, `orders.slot_rental_id`, `brandOccupiesSlotNow`…)
không đổi — đổi tên sẽ chạm toàn bộ contract, test cô lập dữ liệu và code scoping đã có.

**Danh mục do Platform Super Admin cấu hình:**

| Danh mục | Trường | Ghi chú |
|---|---|---|
| Giá thuê niêm yết của slot | `monthly_rent_price` trên từng slot | Slot chưa có giá thì không hiện trong danh sách slot trống |
| Gói thuê | tên, `duration_months` (3, 6, 12), `discount_percent`, đang mở bán | Dữ liệu seed đề xuất: 0%, 5%, 10% |
| Gói bảo quản | tên, mô tả quyền lợi, `monthly_price`, `coverage_percent` (tỷ lệ bồi thường theo giá bán lẻ chai), `coverage_cap` (hạn mức bồi thường tối đa cho một hóa đơn), đang mở bán | Dữ liệu seed đề xuất: Cơ bản 30%, Tiêu chuẩn 60%, Toàn diện 100% |

**Công thức tiền** — chụp vào hóa đơn lúc tạo, không đổi khi bảng giá đổi sau đó:

```
phí thuê      = giá niêm yết tháng × số tháng × (1 − ưu đãi gói thuê)
phí bảo quản  = giá gói bảo quản tháng × số tháng          (ưu đãi không áp cho phí bảo quản)
phí ân hạn    = phí ân hạn đã phát sinh của hóa đơn cũ     (chỉ có trên hóa đơn gia hạn)
tổng          = phí thuê + phí bảo quản + phí ân hạn
```

**Giữ chỗ khi thanh toán.** Tạo hóa đơn `DRAFT` là giữ slot cho thương hiệu trong
`RENTAL_CHECKOUT_HOLD_MIN` phút. Hai thương hiệu cùng chọn một slot thì người tạo hóa đơn sau nhận
`SLOT_OCCUPIED` — cưỡng chế bằng `excl_slot_rental_overlap` (vốn đã tính `DRAFT`), không bằng code.
Hết giờ giữ chỗ mà chưa thanh toán thì hóa đơn chuyển sang trạng thái mới `CANCELLED` và slot được giải
phóng. Tiền về sau khi đã hủy thì thanh toán chuyển `REFUND_PENDING`, hóa đơn không được khôi phục.

**Đã thanh toán thì không hủy, không hoàn tiền** ở phía thương hiệu. Super Admin chấm dứt trước hạn
(FR-SLT-13, mức S) cũng không tự động hoàn tiền; hoàn hay không là quyết định ngoài hệ thống.

**Chờ nạp hàng.** Hóa đơn đã thanh toán nhưng chưa lắp chai vẫn ở `DRAFT` (phân biệt bằng
`paid_at`): slot đã thuộc thương hiệu, thương hiệu cấu hình được slot, nhưng chưa bán. Để thương hiệu
trả tiền rồi không gửi hàng không giữ slot vô hạn: quá `RENTAL_MAX_STOCKING_DAYS` ngày kể từ lúc
thanh toán mà chưa lắp chai thì hệ thống tự kích hoạt, `starts_at` = thời điểm đó.

**Cấu hình slot** (FR-SLT-08, 27) mở ngay sau khi thanh toán. Slot chỉ bán được khi đã có sản phẩm
**và** giá lượt xịt; `price_per_spray` vì thế thành nullable (thương hiệu chưa đặt giá lúc mua).

**Gia hạn** do Brand Admin tự làm: mua gói thuê mới cho chính slot đang thuê khi hóa đơn cũ ở
`EXPIRING` hoặc `GRACE`. Hóa đơn gia hạn bắt đầu từ `max(ends_at cũ, lúc thanh toán)` — chai đã nằm
sẵn trong slot nên không chờ lắp chai. Phí ân hạn đã phát sinh được cộng vào hóa đơn gia hạn. Hóa đơn
cũ về `RENEWED` **đúng lúc** hóa đơn gia hạn đã thanh toán bắt đầu hiệu lực, trong cùng transaction
— không phải lúc thanh toán. Nếu chuyển `RENEWED` ngay khi trả tiền trong lúc hóa đơn cũ còn
`EXPIRING`, slot sẽ không có hóa đơn hiệu lực nào tới ngày nối tiếp (`uq_slot_active_rental` không
tính `RENEWED` và `DRAFT`) và ngừng bán oan. Kỳ hạn tạm của hóa đơn gia hạn là
`[max(ends_at cũ, now), + số tháng)` để không chồng lấn hóa đơn cũ. Không gia hạn thì đi tiếp nhánh ân hạn → thanh
lý như cũ (BR-013); giá trị hàng tồn thanh lý thay cho phí ân hạn chưa thu.

**Đối soát doanh thu.** Không còn phí cố định và ăn chia, nên bảng quyết toán (FR-SLT-17, 18) chỉ còn
là bảng đối soát doanh thu lượt xịt `BRAND` theo kỳ, dòng theo từng slot — đó là số nền tảng phải
chuyển trả cho thương hiệu. Doanh thu của nền tảng gồm tiền bán gói (FR-SLT-47) và doanh thu hàng
thanh lý (`revenue_owner = PLATFORM`, FR-REV-02 không đổi).

**Bảo hiểm hàng hóa.** Khi một chai của thương hiệu chuyển `DAMAGED` lúc đang do nền tảng giữ (trong
kho hoặc trong máy), hệ thống tính bồi thường
`min(coverage_percent × giá bán lẻ chai (FR-PRD-05), hạn mức còn lại của hóa đơn)`:

- Chai **đang lắp** trong slot: dùng gói bảo quản của hóa đơn của slot đó.
- Chai **trong kho** (chưa gắn slot): dùng gói có `coverage_percent` cao nhất trong các hóa đơn đang
  hiệu lực của thương hiệu. Thương hiệu không có hóa đơn hiệu lực nào thì không được bồi thường.
- Không bồi thường chai `EXPIRED` (rủi ro hạn dùng là của thương hiệu) hay chai đã `LIQUIDATED`.

Super Admin ghi nhận đã chi trả bồi thường kèm mã giao dịch, sau khi xác thực lại (FR-AUTH-09 —
nhóm "hoàn tiền"). Việc chuyển tiền diễn ra ngoài hệ thống.

### Ánh xạ FR

| Loại | FR |
|---|---|
| **Bãi bỏ** (giữ dòng, mức ưu tiên đổi thành `X` để số hiệu và truy vết không đứt) | FR-SLT-01, 20, 21, 22, 23, 25, 26 |
| **Viết lại** | FR-SLT-06, 12, 13, 17, 18, 19, 24, 27, 29; FR-EXP-12, 13; FR-MCH-16; BR-009 |
| **Mới** | FR-SLT-30 ÷ 47 (18 FR) |
| **Rút lại** | FR-SLT-30 ÷ 41 của ADR-0005 — chưa từng được duyệt, số hiệu dùng lại cho FR mới ở trên |

Mức `X` là mức mới, nghĩa là "đã bãi bỏ". `scripts/check-traceability.mjs` chỉ đọc `M`/`S`/`W` nên
tự động bỏ qua các dòng này.

### Hằng ngưỡng mới — cần duyệt để thêm vào `spec/constraints.md`

| Hằng | Giá trị đề xuất | FR |
|---|---|---|
| `RENTAL_CHECKOUT_HOLD_MIN` | 15 | FR-SLT-35, FR-SLT-39 |
| `RENTAL_MAX_STOCKING_DAYS` | 30 | FR-SLT-42 |

Thời hạn gói (3/6/12), tỷ lệ ưu đãi và mức bồi thường là **dữ liệu danh mục** do Super Admin cấu
hình, không phải hằng ngưỡng.

### Không thêm mã lỗi mới

| Tình huống | Mã |
|---|---|
| Chọn slot đang bị giữ chỗ hoặc đã có hóa đơn khác | `SLOT_OCCUPIED` (409) |
| Gói thuê hoặc gói bảo quản không tồn tại/ngừng mở bán; thiếu gói bảo quản; slot chưa có giá niêm yết | `VALIDATION_ERROR` (400) |
| Thanh toán hóa đơn đã hết giờ giữ chỗ hoặc không ở `DRAFT` chưa thanh toán | `RENTAL_NOT_ACTIVE` (409) |
| Cấu hình slot khi hóa đơn chưa thanh toán; gia hạn khi hóa đơn không ở `EXPIRING`/`GRACE` | `RENTAL_NOT_ACTIVE` (409) |
| Thao tác trên hóa đơn của thương hiệu khác | `FORBIDDEN_SCOPE` (403) |
| Webhook chữ ký sai / số tiền lệch / trùng | `INVALID_WEBHOOK_SIGNATURE` / `AMOUNT_MISMATCH` / `WEBHOOK_ALREADY_PROCESSED` |
| Ghi nhận chi trả bồi thường vượt số được bồi thường | `VALIDATION_ERROR` (400) |
| Ghi nhận chi trả bồi thường chưa xác thực lại | `REAUTH_REQUIRED` (403) |

### Thay đổi contract — chỉ áp dụng sau khi ADR này được duyệt

**`schema.sql`** — qua một migration mới, không sửa `1789516800000_initial-schema.sql`:

| Thay đổi | Chi tiết |
|---|---|
| Enum `slot_rental_status` | Thêm `CANCELLED`. `uq_slot_active_rental` và `excl_slot_rental_overlap` liệt kê trạng thái tường minh nên `CANCELLED` tự động không chiếm slot |
| Bảng mới `rental_packages` | `id, name, duration_months smallint CHECK (> 0), discount_percent numeric(5,2) CHECK (0..100), is_active, created_at, updated_at` |
| Bảng mới `storage_plans` | `id, name, description, monthly_price numeric(19,4) CHECK (>= 0), coverage_percent numeric(5,2) CHECK (0..100), coverage_cap numeric(19,4) CHECK (>= 0), is_active, created_at, updated_at` |
| `machine_slots` thêm cột | `monthly_rent_price numeric(19,4) CHECK (>= 0)` — NULL = chưa mở cho thuê |
| `slot_rentals` thêm cột | `invoice_number varchar(30) UNIQUE`, `rental_package_id`, `storage_plan_id` (FK), bộ chụp giá `duration_months, monthly_rent_price, discount_percent, storage_monthly_price, storage_coverage_percent, storage_coverage_cap, rent_amount, storage_amount, grace_fee_amount, total_amount`, `hold_expires_at, paid_at, cancelled_at` |
| `slot_rentals.price_per_spray` | Bỏ `NOT NULL` — đặt ở bước cấu hình slot |
| `slot_rentals.starts_at/ends_at` | Giữ `NOT NULL`. Lúc tạo hóa đơn điền khoảng **tạm** `[now, now + RENTAL_MAX_STOCKING_DAYS + số tháng)` để ràng buộc chồng lấn giữ được slot; ghi đè bằng khoảng thật khi kích hoạt |
| `slot_rentals.fixed_fee`, `revenue_share_percent` | Không dùng nữa; giữ cột (mặc định 0) để không phá migration và test hiện có, ghi chú `DEPRECATED` |
| `slot_rental_requests`, `slot_rentals.request_id` | Không dùng nữa; giữ bảng, ghi chú `DEPRECATED` — xóa bảng là thay đổi phá hủy, để sau |
| `payments` | Bỏ `NOT NULL` ở `order_id`; thêm `slot_rental_id` + FK kép `(slot_rental_id, brand_id)`; `CHECK (num_nonnulls(order_id, slot_rental_id) = 1)`; `uq_rental_payment_pending ON payments (slot_rental_id) WHERE status = 'PENDING' AND slot_rental_id IS NOT NULL` |
| Bảng mới `storage_compensations` | `id, brand_id, bottle_id, slot_rental_id, amount, status (PENDING, PAID), payout_reference, paid_by, paid_at, created_at` + FK kép `(slot_rental_id, brand_id)` |

**`openapi.yaml`:**

| Thay đổi | Chi tiết |
|---|---|
| Mới: danh mục | `GET/POST/PATCH /rental-packages`, `GET/POST/PATCH /storage-plans`, `PUT /slots/{id}/rent-price` (Super Admin; `GET` mở cho Brand Admin) |
| `GET /slots/available` | `AvailableSlot` thêm `monthlyRentPrice`; ẩn slot chưa có giá |
| Mới: `POST /slot-rentals/checkout` | Brand Admin gửi `{ slotId, rentalPackageId, storagePlanId }` → hóa đơn `DRAFT` kèm bảng tính tiền |
| Mới: `POST /slot-rentals/{id}/payments` | Khởi tạo hoặc lấy lại thanh toán đang chờ |
| Mới: `GET /slot-rentals/{id}/invoice` | Nội dung hóa đơn để xem/tải |
| `GET /slot-rentals` | Brand Admin xem danh sách hóa đơn của mình |
| `POST /slot-rentals/{id}/renew` | Chuyển từ Super Admin sang Brand Admin; body `{ rentalPackageId, storagePlanId }` |
| Mới: `GET /reports/rental-sales`, `GET/POST /storage-compensations/...` | FR-SLT-47, 45, 46 |
| `SlotRentalStatus` | Thêm `CANCELLED` |
| `POST /slot-rentals`, `/slot-rental-requests*` | Đánh dấu `deprecated: true` |
| `Settlement*` | `fixedFee`, `revenueShareAmount`, `graceFee` đánh dấu `deprecated`; `amountDue` = doanh thu `BRAND` |
| `POST /webhooks/payments/{provider}` | Sửa `description`: nhận cả thanh toán đơn kiosk và thanh toán hóa đơn thuê slot |

**`erd.md`:** thêm `RentalPackage`, `StoragePlan`, `StorageCompensation`, quan hệ `SlotRental 1 ── *
Payment`. **`data-dictionary.md`:** sinh lại, không sửa tay. Các `COMMENT ON` có chữ "hợp đồng" trong
`schema.sql` đổi sang "hóa đơn" trong cùng migration.

## Hệ quả

**Đặc tả:** `docs/FR_NFR_SCENTSTATION.md` (BR-009, quyết định nghiệp vụ #3, #5, #6, #7, mục A6),
`spec/modules/SLT.md`, `EXP.md`, `MCH.md`, `spec/glossary.md`, `spec/PROJECT.md`, tài liệu epic. Thuật
ngữ "hợp đồng" → "hóa đơn" trong mọi tài liệu không đóng băng; file đóng băng đổi sau khi duyệt.

**Test người tự viết bị ảnh hưởng** (`spec/testing.md`):
- *Job chuyển trạng thái hợp đồng* — thêm hủy hóa đơn hết giờ giữ chỗ (FR-SLT-39) và tự kích hoạt
  sau `RENTAL_MAX_STOCKING_DAYS` (FR-SLT-42), kể cả bù sau downtime.
- *Unique constraint slot* — thêm ca hai thương hiệu cùng giữ chỗ một slot đồng thời (FR-SLT-35).
- *Idempotency webhook* — thêm ca webhook trùng cho thanh toán hóa đơn (FR-SLT-38).

Test hiện có (`test_slot_constraint`, `test_slot_isolation`) không phải sửa: chúng ghi thẳng vào
`slot_rentals` và các cột cũ vẫn giữ.

**Mã nguồn:** chưa có module SLT nên không có code nghiệp vụ phải sửa. Sau khi contract đổi:
`npm run contracts:generate`, `npm run db:types`; web quản trị thêm các màn hình: slot trống kèm giá,
chọn dịch vụ, thanh toán, hóa đơn, cấu hình slot (Brand Admin); bảng giá gói thuê/gói bảo quản/giá
slot, báo cáo bán gói, bồi thường (Super Admin).

**Giới hạn đã biết:** mỗi lần thanh toán chỉ mua một slot (không có giỏ hàng). Không có nhắc thanh toán
hay hoàn tiền tự động. Chai bị mất (không phải hư hỏng) chưa có trạng thái riêng trong enum
`bottle_status`, nên chưa bồi thường tự động được — Inventory Staff ghi `DAMAGED` kèm lý do.

## Nhật ký áp dụng — 2026-09-29

Áp theo yêu cầu của nhóm, **trước** khi TV1 duyệt — review PR này chính là bước duyệt. Không đổi
trạng thái ADR thành "đã duyệt" cho tới khi TV1 xác nhận. **TV1 đã duyệt ngày 2026-09-29.**

| Hạng mục | Đã làm |
|---|---|
| `spec/constraints.md` | Thêm `RENTAL_CHECKOUT_HOLD_MIN = 15`, `RENTAL_MAX_STOCKING_DAYS = 30`; chạy `npm run spec:generate` |
| Migration | `1790665900000_slot-rental-status-cancelled.sql` (chỉ `ADD VALUE 'CANCELLED'`), `1790665960000_prepaid-rental-packages.sql` (mọi thứ còn lại) |
| `schema.sql` | Mô tả trạng thái sau hai migration; cột thêm bằng `ALTER TABLE` đặt cuối bảng cho khớp thứ tự thật |
| `openapi.yaml` | 12 path mới (14 operation), 17 schema mới, DEPRECATED cho luồng yêu cầu thuê và cột phí cũ |
| `erd.md`, `README.md` | Thêm 3 bảng, quan hệ thanh toán hóa đơn, index bắt buộc mới, cột ảnh chụp chỉ ghi một lần |
| `seed_document/DB_DIAGRAM_MERMAID.md` | Nguồn thiết kế của `schema.sql` (ngoại lệ đang dùng trong `seed_document/README.md`) — cập nhật cùng đợt: 38 bảng, 25 enum, ghi chú triển khai 17 ÷ 21. Đã đối chiếu: 472/472 cột trùng CSDL đã migrate |
| Sinh lại | `data-dictionary.md`, `packages/contracts/src/openapi.ts`, `apps/api/src/shared/db/types.generated.ts` |
| `tests/contract/enum-parity.test.ts` | 24 → 25 enum, thêm `StorageCompensationStatus` |

**Đã kiểm trên PostgreSQL 16 (container `db-test`, không đụng CSDL dev):**
- DB trống: chạy trọn 3 migration. DB đã có lược đồ ban đầu + dữ liệu seed: chạy trọn 2 migration mới,
  4 hóa đơn ACTIVE kiểu cũ vẫn hợp lệ. Down 2 rồi Up lại: chạy trọn.
- `pg_dump --schema-only` của DB nạp `schema.sql` trùng khít DB chạy hết migration (kể cả COMMENT).
- 23 ca vi phạm ràng buộc mới đều bị CSDL từ chối đúng tên ràng buộc (giữ chỗ trùng, tổng tiền lệch,
  thiếu ảnh chụp, thanh toán PENDING thứ hai, thanh toán lệch thương hiệu, hủy hóa đơn đã trả, số hóa
  đơn trùng, bồi thường lệch thương hiệu, bồi thường hai lần…).
- `npm run lint`, test unit 111/111, contract 38/38, integration 35/35, `redocly lint` sạch.

**Lệch so với đề xuất ở trên:**

| Chỗ | Đề xuất | Đã làm | Vì sao |
|---|---|---|---|
| Ràng buộc có `CANCELLED` | `status <> 'CANCELLED'` | `status::text <> 'CANCELLED'` | node-pg-migrate 9 mặc định `--single-transaction`; trên DB đã có lược đồ, hai migration chạy chung transaction và cách viết thường lỗi `unsafe use of new value` (đã tái hiện). `docs/MIGRATIONS.md` sửa theo |
| `AvailableSlot.monthlyRentPrice` | bắt buộc | có trong schema nhưng **chưa** nằm trong `required` | Hiện thực `listAvailableSlots` và test `test_FR_AUTH_07_available_slots_expose_only_location_data` (nhóm "cô lập mức slot" — người tự viết) khẳng định đúng 6 trường; agent không được sửa test đó |
| `storage_compensations` | `amount` | thêm `bottle_retail_price`, `coverage_percent`, `currency`, `updated_at` | Chụp số liệu dùng để tính, để kiểm toán lại được khi giá sản phẩm hoặc gói đổi |
| `slot_rentals` | — | thêm `chk_rental_total_amount`, `chk_rental_invoice_on_payment`, `chk_rental_cancelled_unpaid`, `chk_rental_cancelled_at` | Đưa bất biến FR-SLT-06 AC4, FR-SLT-36, FR-SLT-38 xuống tầng CSDL |
| OpenAPI | — | thêm `GET /slots/{id}/rental-quote` | FR-SLT-34 cần một endpoint trả bảng giá cho slot đã chọn |
| `Settlement*` | đánh dấu deprecated | thêm `orderCount`, `amountDue` bắt buộc ở dòng và tổng; bỏ `fixedFee`, `revenueShareAmount` khỏi `required` | Bảng đối soát mới chỉ còn doanh thu chuyển trả |

**Việc còn lại, cần người:**
1. ~~TV1 duyệt ADR này.~~ Đã duyệt 2026-09-29.
2. Chủ nhóm test "cô lập mức slot" cập nhật `test_FR_AUTH_07_available_slots_expose_only_location_data`
   (7 trường, slot phải có giá niêm yết) — sau đó mới sửa `listAvailableSlots` và đưa
   `monthlyRentPrice` vào `required`. Cùng lúc sửa lỗi có sẵn: truy vấn lọc `machine_slots.status =
   'AVAILABLE'` trong khi slot chỉ AVAILABLE khi đã có hóa đơn hiệu lực (FR-MCH-16), nên trên dữ liệu
   thật danh sách luôn rỗng; fixture của test đang đặt tay `status = 'AVAILABLE'` nên không lộ.
3. Chủ các nhóm test "job chuyển trạng thái", "unique constraint slot", "idempotency webhook" bổ sung ca
   ở mục "Hệ quả".
