# ADR-0005 — Thanh toán cọc và phí kỳ đầu trước khi kích hoạt hợp đồng thuê slot

**Ngày:** 2026-09-25 · **Trạng thái:** bị thay thế bởi ADR-0006 (chưa từng được duyệt) · **Người quyết:** TV1

> Nhóm đổi hướng sang mua gói thuê trả trước tự phục vụ ngay trong ngày đề xuất — xem
> `spec/decisions/0006-mua-goi-thue-slot-tu-phuc-vu-va-hoa-don.md`. Giữ file này làm lịch sử phương
> án đã cân nhắc; các FR-SLT-30 ÷ 41 mô tả bên dưới đã bị rút lại.

## Bối cảnh

Luồng "đưa slot vào kinh doanh" (FR-SLT-19 ÷ FR-SLT-29) hiện đi thẳng từ duyệt yêu cầu thuê tới
kích hoạt hợp đồng mà **không có bước thương hiệu trả tiền nào**:

| Chỗ | Đặc tả đang ghi | Hệ quả |
|---|---|---|
| FR-SLT-23, FR-SLT-24 | Duyệt → tự tạo `DRAFT` → tự `ACTIVE` đúng ngày bắt đầu | Thương hiệu được khai thác slot mà chưa cam kết tài chính nào |
| FR-SLT-18 AC2 | Tổng phí lớn hơn doanh thu thì "ghi nhận số tiền âm (công nợ)" | Công nợ không có tài sản bảo đảm; thương hiệu bỏ đi là nền tảng mất khoản đó |
| `excl_slot_rental_overlap` | Ràng buộc chồng lấn tính cả `DRAFT` | Hợp đồng `DRAFT` đã giữ slot, nhưng không có đường nào hủy `DRAFT` |
| `payments.order_id` | `NOT NULL` | Bảng thanh toán chỉ phục vụ đơn kiosk, không ghi nhận được tiền thương hiệu trả |

BR-013 (thanh lý hàng tồn) chỉ thu hồi được giá trị **chai**, không thu hồi được phí thuê và phí
ân hạn chưa trả.

## Phương án đã cân nhắc

1. **Trả hết một lần khi ký.** Thương hiệu trả toàn bộ phí cố định của cả kỳ hạn trước khi kích
   hoạt. Không còn rủi ro nợ phí thuê, nhưng rào cản vào cao — đi ngược BR-011 ("thử nghiệm với chi
   phí và rủi ro thấp"). Phải bỏ phí cố định khỏi quyết toán (FR-SLT-18) và thêm luật hoàn tiền theo
   tỷ lệ khi chấm dứt sớm (FR-SLT-13).
2. **Chỉ đặt cọc.** Cọc trả trước khi kích hoạt, phí cố định vẫn trừ theo kỳ trong quyết toán, cọc
   dùng cấn trừ công nợ lúc kết thúc. Rào cản thấp, khớp quyết toán hiện tại; nhưng kỳ đầu nền tảng
   chưa thu được đồng nào nếu slot bán kém.
3. **Cọc + trả trước phí kỳ đầu.** Như phương án 2, cộng thêm phí cố định của kỳ đầu tiên trả cùng
   lúc với cọc. Giống mô hình thuê mặt bằng thông thường; nền tảng có dòng tiền ngay từ kỳ đầu.

Về kênh thanh toán, cân nhắc (a) thương hiệu chuyển khoản ngoài hệ thống và Super Admin xác nhận
tay, hoặc (b) thương hiệu bấm thanh toán ngay trong web quản trị qua cổng thanh toán.

## Quyết định

Chọn **phương án 3** và **kênh (b)** — theo lựa chọn của nhóm ngày 2026-09-25.

### Luồng mới

```
Brand gửi yêu cầu ──> Super Admin duyệt kèm điều khoản + tiền cọc
                         │
                         ▼
               Hợp đồng DRAFT (chờ thanh toán, hạn = lúc tạo + RENTAL_PAYMENT_DUE_HOURS)
                         │
      Brand xem hợp đồng, bấm "Thanh toán" (cọc + phí kỳ đầu)
                         │
             ┌───────────┴────────────┐
   webhook xác nhận thành công    quá hạn chưa trả
             │                        │
   yêu cầu gốc → CONVERTED        hợp đồng → CANCELLED
   cọc → HELD                     yêu cầu gốc → CANCELLED
             │                     slot được giải phóng
   tới starts_at → ACTIVE
   (trả sau starts_at → ACTIVE ngay, ends_at giữ nguyên)
```

### Luật nghiệp vụ

**Khoản thanh toán ban đầu = tiền cọc + phí cố định của kỳ đầu.** Tiền cọc do Super Admin nhập khi
duyệt yêu cầu (FR-SLT-22) hoặc khi tạo hợp đồng trực tiếp (FR-SLT-01), cấu hình theo từng hợp đồng
như `fixed_fee` và `revenue_share_percent`. Số tiền được chụp vào hợp đồng lúc tạo và không đổi sau
đó (cùng tinh thần NFR-DAT-06 với `orders.amount`).

**Mọi hợp đồng mới đều bắt đầu ở `DRAFT` và phải thanh toán mới kích hoạt được** — kể cả hợp đồng
Super Admin tạo trực tiếp có ngày bắt đầu là hôm nay. FR-SLT-01 AC1 bỏ nhánh "tạo thẳng `ACTIVE`".

**Xem hợp đồng và bấm thanh toán là chấp nhận điều khoản.** Không thêm bước "ký"/"chấp nhận" riêng.
Thương hiệu không đồng ý điều khoản thì không thanh toán; hợp đồng tự hủy khi quá hạn.

**Mỗi hợp đồng có tối đa một thanh toán `PENDING`.** Bấm "Thanh toán" lần nữa trả lại chính thanh
toán đang chờ, không tạo mới — cưỡng chế bằng partial unique index, không chỉ bằng code.

**Webhook dùng chung với đơn kiosk.** `POST /webhooks/payments/{provider}` nhận cả hai loại; phân
biệt bằng việc `payments` trỏ tới `order_id` hay `slot_rental_id`. Toàn bộ quy tắc FR-ORD-13 ÷ 15
(chữ ký, đối chiếu số tiền, xử lý đúng một lần) áp dụng nguyên vẹn.

**Trả muộn sau ngày bắt đầu:** hợp đồng kích hoạt ngay khi thanh toán được xác nhận, `ends_at` giữ
nguyên, phí kỳ đầu **không** chia theo ngày. Bấm thanh toán sau hạn: bị từ chối, hợp đồng về
`CANCELLED`. Nếu tiền vẫn về qua webhook sau khi hợp đồng đã hủy, thanh toán chuyển
`REFUND_PENDING` (giá trị đã có trong `payment_status`) và hợp đồng **không** được khôi phục — slot
có thể đã được thương hiệu khác xin thuê.

**Quyết toán kỳ đầu** vẫn hiện dòng phí cố định, kèm dòng "đã trả trước" bằng đúng số đó, để số
phải thanh toán của kỳ đầu không thu phí thuê lần hai (sửa FR-SLT-18).

**Tiền cọc** được giữ (`HELD`) suốt vòng đời hợp đồng. Khi hợp đồng về `CLOSED` hoặc `TERMINATED`,
hệ thống cấn trừ cọc vào công nợ còn lại của hợp đồng đó (số phải thanh toán âm của các kỳ chưa
quyết toán xong, phí ân hạn), phần dư là số hoàn cho thương hiệu. Super Admin ghi nhận đã hoàn kèm
mã giao dịch, sau khi xác thực lại mật khẩu (FR-AUTH-09 — thuộc nhóm "hoàn tiền"). Việc chuyển tiền
hoàn diễn ra ngoài hệ thống; hệ thống không lưu tài khoản ngân hàng (NFR-DAT-04).

**Gia hạn (FR-SLT-12).** Cọc của hợp đồng cũ `H1` chuyển sang hợp đồng gia hạn `H2`
(`H1` cọc → `CARRIED_OVER`). Khoản ban đầu của `H2` = phí kỳ đầu của `H2` + phần cọc còn thiếu
`max(0, cọc H2 − cọc H1)`. **`H1` chỉ chuyển `RENEWED` khi thanh toán của `H2` được xác nhận**, không
phải lúc tạo `H2` — nếu không, `H2` quá hạn chưa trả sẽ để `H1` kẹt ở `RENEWED` mà slot không ai
khai thác. `H2` bị hủy do quá hạn thì `H1` tiếp tục đi theo nhánh ân hạn/thanh lý bình thường.

**Chấm dứt sớm (FR-SLT-13):** phí kỳ đầu đã trả không hoàn; cọc xử lý theo luật cấn trừ ở trên.

### Hằng ngưỡng mới — cần duyệt để thêm vào `spec/constraints.md`

| Hằng | Giá trị đề xuất | FR |
|---|---|---|
| `RENTAL_PAYMENT_DUE_HOURS` | 72 | FR-SLT-31, FR-SLT-36 |
| `RENTAL_BILLING_PERIOD_MONTHS` | 1 | FR-SLT-31, FR-SLT-37 |

`RENTAL_BILLING_PERIOD_MONTHS` cần có vì đặc tả hiện nói "phí cố định **theo kỳ**" mà chưa định nghĩa
kỳ dài bao lâu; "phí kỳ đầu" không tính được nếu thiếu nó. Đề xuất: kỳ 1 = `[starts_at, starts_at + 1
tháng)`, các kỳ sau nối tiếp.

### Không thêm mã lỗi mới

Tái dùng mã đã có trong `spec/errors.md`, theo tiền lệ ADR-0004:

| Tình huống | Mã |
|---|---|
| Thanh toán hợp đồng không ở `DRAFT`, hoặc đã quá hạn thanh toán | `RENTAL_NOT_ACTIVE` (409) |
| Brand Admin thanh toán hợp đồng của thương hiệu khác | `FORBIDDEN_SCOPE` (403) |
| Webhook chữ ký sai / số tiền lệch / trùng | `INVALID_WEBHOOK_SIGNATURE` / `AMOUNT_MISMATCH` / `WEBHOOK_ALREADY_PROCESSED` |
| Ghi nhận hoàn cọc khi hợp đồng chưa `CLOSED`/`TERMINATED` | `RENTAL_NOT_ACTIVE` (409) |
| Số hoàn vượt số được hoàn | `VALIDATION_ERROR` (400) |
| Ghi nhận hoàn cọc chưa xác thực lại | `REAUTH_REQUIRED` (403) |

### Thay đổi contract — chỉ áp dụng sau khi ADR này được duyệt

**`schema.sql` (qua một migration mới, không sửa `1789516800000_initial-schema.sql`):**

| Thay đổi | Chi tiết |
|---|---|
| Enum `slot_rental_status` | Thêm `CANCELLED`. Không cần sửa `uq_slot_active_rental` hay `excl_slot_rental_overlap`: cả hai liệt kê trạng thái tường minh nên `CANCELLED` tự động không chiếm slot |
| Enum mới `rental_deposit_status` | `UNPAID`, `HELD`, `CARRIED_OVER`, `SETTLED` |
| `slot_rentals` thêm cột | `deposit_amount numeric(19,4) NOT NULL DEFAULT 0 CHECK (>= 0)`, `initial_payment_amount numeric(19,4) NOT NULL DEFAULT 0 CHECK (>= 0)`, `payment_due_at timestamptz`, `paid_at timestamptz`, `cancelled_at timestamptz`, `deposit_status rental_deposit_status NOT NULL DEFAULT 'UNPAID'`, `deposit_applied_amount numeric(19,4)`, `deposit_refunded_amount numeric(19,4)`, `deposit_refund_reference varchar(200)`, `deposit_settled_at timestamptz` |
| `payments.order_id` | Bỏ `NOT NULL` |
| `payments` thêm cột | `slot_rental_id uuid REFERENCES slot_rentals (id)` + FK kép `(slot_rental_id, brand_id)` cùng mẫu `fk_*_same_brand` đang dùng |
| `payments` thêm ràng buộc | `CHECK (num_nonnulls(order_id, slot_rental_id) = 1)` — mỗi thanh toán thuộc đúng một đơn **hoặc** một hợp đồng |
| Index mới | `uq_rental_payment_pending ON payments (slot_rental_id) WHERE status = 'PENDING' AND slot_rental_id IS NOT NULL` |
| §13 ghi chú | Chuyển trạng thái hợp lệ mới: `DRAFT → CANCELLED`; `DRAFT → ACTIVE` chỉ khi `paid_at IS NOT NULL` |

**`openapi.yaml`:**

| Thay đổi | Chi tiết |
|---|---|
| `SlotRentalStatus` | Thêm `CANCELLED` |
| `SlotRentalRequestApprove`, `SlotRentalCreate` | Thêm `depositAmount` (bắt buộc, `>= 0`) |
| `SlotRental` | Thêm `depositAmount`, `firstPeriodFee`, `initialPaymentAmount`, `paymentDueAt`, `paidAt`, `depositStatus`, `depositAppliedAmount`, `depositRefundedAmount` |
| Endpoint mới `POST /slot-rentals/{id}/payments` | Brand Admin khởi tạo (hoặc lấy lại) thanh toán đang chờ; trả `RentalPayment { paymentId, amount, currency, status, checkoutUrl, qrPayload, expiresAt }` |
| Endpoint mới `POST /slot-rentals/{id}/deposit-refund` | Super Admin, cần xác thực lại; body `{ refundedAmount, reference }` |
| `POST /webhooks/payments/{provider}` | Sửa `description`: nhận cả thanh toán đơn và thanh toán hợp đồng |
| `SettlementLine`, `SettlementTotals` | Thêm `prepaidFixedFee`; `amountDue` trừ khoản này |

**`erd.md`:** thêm quan hệ `SlotRental 1 ── * Payment`. **`data-dictionary.md`:** sinh lại bằng
`scripts/gen-data-dictionary.ts`, không sửa tay.

## Hệ quả

**FR mới:** FR-SLT-30 ÷ FR-SLT-41 (12 FR, đều mức M). Tổng FR 264 → 276; SLT 29 → 41.

**FR sửa:** FR-SLT-01 (luôn tạo `DRAFT`), FR-SLT-06 (thêm `CANCELLED`), FR-SLT-12 (`H1` → `RENEWED`
khi `H2` đã thanh toán), FR-SLT-18 (dòng phí trả trước), FR-SLT-22 (nhập tiền cọc), FR-SLT-24 (chỉ
kích hoạt khi đã thanh toán), FR-EXP-13 (cùng luật với FR-SLT-12).

**Test người tự viết bị ảnh hưởng:** FR-SLT-24 thuộc nhóm "job chuyển trạng thái hợp đồng"
(`spec/testing.md`) — người phụ trách phải bổ sung ca "chưa thanh toán thì không kích hoạt" và ca
"quá hạn thanh toán thì hủy", kể cả khi job bù sau downtime. Webhook dùng chung nên nhóm "idempotency
webhook" cần thêm ca webhook trùng cho thanh toán hợp đồng.

**Mã nguồn:** chưa có module SLT trong `apps/api` nên không có code phải sửa. Sau khi contract đổi:
`npm run contracts:generate`, `npm run db:types`; web quản trị thêm màn hình "Hợp đồng chờ thanh
toán" cho Brand Admin.

**Giới hạn đã biết:** tiền hoàn cọc do Super Admin tự chuyển ngoài hệ thống; hệ thống chỉ ghi nhận.
Không nhắc thanh toán trước khi hết hạn (có thể thêm sau như một FR mức S).
