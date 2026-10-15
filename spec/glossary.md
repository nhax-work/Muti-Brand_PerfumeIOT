# Mô hình miền và state machine

## Quan hệ cốt lõi

```
Location 1 ──── * Machine 1 ──── * MachineSlot
                                      │
                                      * SlotRental * ──── 1 Brand
                                                            │
Brand 1 ──── * Product 1 ──── * Batch 1 ──── * Bottle       │
                                                  │         │
MachineSlot 1 ──── * Order ──── 1 DispenseCommand │         │
                                                  └─ INSTALLED vào slot
```

**Ba điều dễ hiểu sai:**

1. `Machine` **không** có `brand_id`. Máy thuộc nền tảng. Một máy chứa slot của nhiều thương
   hiệu. Quan hệ thương hiệu ↔ máy đi qua `SlotRental`.
2. Một thương hiệu có thể thuê **nhiều slot trên cùng một máy**. Mỗi slot một hóa đơn riêng; nhiều
   hóa đơn có thể được thanh toán một lần trong cùng một phiên thanh toán (ADR-0008).
3. `Order` chụp `brand_id`, `slot_rental_id`, `revenue_owner` **tại thời điểm tạo đơn**. Không
   suy ra từ slot khi truy vấn.

## Thực thể

| Thực thể | Vai trò |
|---|---|
| `Brand` | Thương hiệu nước hoa thuê slot |
| `Location` | Địa điểm đặt máy, thuộc nền tảng |
| `Machine` | Máy trải nghiệm, thuộc nền tảng |
| `MachineSlot` | Ngăn chứa độc lập trên máy |
| `SlotRental` | **Hóa đơn thuê slot**: một lần thương hiệu mua gói thuê một slot, kèm gói bảo quản. Vừa là chứng từ thanh toán vừa là đơn vị cô lập dữ liệu |
| `RentalCheckout` | **Phiên thanh toán** thuê slot: một lần Brand Admin chọn một hoặc nhiều slot và trả tiền một lần. Gom giữ chỗ, tổng tiền và thanh toán của các hóa đơn tạo cùng lúc; không có số hóa đơn riêng (ADR-0008) |
| `RentalPackage` | Gói thuê do nền tảng niêm yết: thời hạn (3, 6, 12 tháng) và tỷ lệ ưu đãi |
| `StoragePlan` | Gói bảo quản (bảo hiểm hàng hóa): giá mỗi tháng, tỷ lệ và hạn mức bồi thường. Mỗi hóa đơn bắt buộc chọn đúng một gói |
| `StorageCompensation` | Khoản bồi thường khi chai của thương hiệu hư hỏng lúc nền tảng đang giữ |
| `Product` | Sản phẩm nước hoa, thuộc một thương hiệu |
| `Batch` | Lô nhập, thuộc một thương hiệu |
| `Bottle` | Chai cụ thể, có chủ sở hữu là thương hiệu hoặc nền tảng |
| `RefillSession` | Phiên nạp thực tế do Inventory Staff thực hiện |
| `RefillRequest` | Yêu cầu bổ sung do thương hiệu gửi |
| `Order` | Đơn hàng một lượt xịt |
| `DispenseCommand` | Lệnh xịt gửi tới thiết bị, có chữ ký và TTL |
| `Alert` | Cảnh báo vận hành |
| `MaintenanceTicket` | Phiếu bảo trì |
| `AuditLog` | Nhật ký kiểm toán, chỉ thêm mới |
| `RefundClaim` | **Phiếu khiếu nại hoàn tiền**: khách gửi qua QR sự cố trên kiosk, Operations Staff chuyển khoản hoàn tay (ADR-0012). Chỗ duy nhất được lưu tài khoản ngân hàng của khách — mã hóa, xóa khi phiếu đóng |
| `AgreementVersion` | **Hợp đồng khung** do nền tảng soạn, có phiên bản; mỗi thời điểm một phiên bản hiện hành (ADR-0013) |
| `AgreementAcceptance` | Một lần thương hiệu đồng ý hợp đồng khung hoặc **phụ lục** của một phiên thanh toán: phiên bản, người đồng ý, thời điểm, IP, mã băm nội dung (ADR-0013) |
| `BrandPayout` | **Kỳ chi trả doanh thu** hằng tháng của một thương hiệu: số tiền, trạng thái, mã giao dịch chuyển khoản (ADR-0013) |
| `BottleReturn` | **Phiếu trả hàng** khi thương hiệu chủ động không gia hạn: hóa đơn, cách nhận, thời điểm sẵn sàng, hạn nhận, người nhận, mã vận đơn (ADR-0014) |

---

## State machine

### Order

```
CREATED ──> PENDING_PAYMENT ──> PAID ──> DISPENSE_REQUESTED ──> DISPENSED
                │                 │                  │
                ├──> EXPIRED      └──> FAILED        ├──> FAILED
                └──> FAILED      (QUEUE_TIMEOUT)     ├──> FORFEITED   (khách không bấm nút, PRESS_TIMEOUT)
                                                     └──> REFUND_PENDING ──> REFUNDED
```

Chỉ chuyển sang `DISPENSED` khi thiết bị trả kết quả thành công (FR-DSP-17).

`PAID ──> FAILED` với mã `QUEUE_TIMEOUT`: đơn chờ lượt quá `PAID_QUEUE_MAX_SEC` mà chưa tạo được lệnh
xịt, đặt `needs_manual_review` (FR-ORD-34, ADR-0015). Mỗi máy tối đa một đơn ở `CREATED`/`PENDING_PAYMENT`
(FR-ORD-35).

`EXPIRED` có hai lý do trong lịch sử trạng thái: `ORDER_PAYMENT_TTL` (quá hạn thanh toán) và
`CUSTOMER_CANCELLED` (khách hủy trên kiosk, FR-ORD-33, ADR-0015) — không có trạng thái riêng cho đơn bị
hủy. Tiền về sau đó thì đơn sang `REFUND_PENDING` như tiền về sau hạn.

**Khách bấm nút vật lý** (ADR-0007). `DISPENSE_REQUESTED` là lúc đèn nút của slot đã sáng và đang chờ
khách bấm. Đơn đã `PAID` mà máy còn một lệnh khác chờ bấm thì giữ ở `PAID` — **chờ lượt** — cho tới
khi lệnh trước kết thúc (FR-DSP-26). `FORFEITED`: khách không bấm trong `DISPENSE_PRESS_WINDOW_SEC`;
không hoàn tiền, không kiểm tra thủ công, doanh thu vẫn ghi nhận (FR-ORD-27). Mọi lý do khác sau khi đèn
đã sáng (cửa mở, bảo trì, slot rỗng lúc bấm, mất điện) **không** phải `FORFEITED` mà đi theo FR-ORD-19.
Lệnh ở trạng thái UNKNOWN **không** tự sinh lệnh mới (FR-DSP-19).

### SlotRental

```
DRAFT ──> ACTIVE ──> EXPIRING ──> GRACE ──> RENEWED
  │         │           │            │
  │         │           │            └──> LIQUIDATED ──> CLOSED
  │         │           ├──> RENEWED        (gia hạn trước khi hết hạn)
  │         └───────────┴──> CLOSED         (đã báo không gia hạn, Inventory Staff tháo chai — ADR-0014)
  └──> CANCELLED   (hết giờ giữ chỗ, chưa thanh toán)
ACTIVE ──> TERMINATED
```

**Hai luồng kết thúc** (ADR-0014). Thương hiệu **không làm gì** → tới `ends_at` vào `GRACE`, ân hạn dài
mặc định `GRACE_PERIOD_DEFAULT_DAYS` ngày (Super Admin sửa được), có phí, hết ân hạn mà không gia hạn thì
`LIQUIDATED`. Thương hiệu **báo không gia hạn** trước `ends_at` → hóa đơn **không** vào `GRACE`, giữ
`ACTIVE`/`EXPIRING` (kể cả quá `ends_at`) tới khi Inventory Staff tháo chai thực tế, không tính phí ân hạn,
doanh thu tới lúc đó vẫn thuộc thương hiệu; tháo chai thì hóa đơn `CLOSED` và chai `RETURNED_TO_BRAND`.
Rút lại việc báo không gia hạn được trước `ends_at`.

**Đổi slot khi mua nhầm** (ADR-0014): hóa đơn `DRAFT` đã thanh toán, chưa lắp chai, trong
`SLOT_SWAP_WINDOW_HOURS` giờ kể từ lúc thanh toán, đổi được sang slot trống cùng giá niêm yết một lần.
Trạng thái không đổi; chỉ `slot_id` đổi và slot cũ được giải phóng.

| Trạng thái | Slot bán được? | Doanh thu thuộc |
|---|---|---|
| `DRAFT` | Không — chờ thanh toán hoặc chờ nạp hàng | — |
| `ACTIVE` | Có | BRAND |
| `EXPIRING` | Có | BRAND |
| `GRACE` | Có | BRAND |
| `LIQUIDATED` | Có | **PLATFORM** |
| `RENEWED`, `CLOSED`, `TERMINATED`, `CANCELLED` | Không | — |

Slot chỉ được cho thuê lại sau khi hóa đơn cũ về `CLOSED`, `TERMINATED` hoặc `CANCELLED`.

**Mua gói trả trước** (ADR-0006, đã duyệt 2026-09-29). Brand Admin chọn một hoặc nhiều slot, mỗi slot một
gói thuê và một gói bảo quản; hệ thống tạo một **phiên thanh toán** (`RentalCheckout`, ADR-0008) và một hóa
đơn `DRAFT` cho mỗi slot, giữ chỗ mọi slot trong `RENTAL_CHECKOUT_HOLD_MIN` phút. Phiên được trả tiền một
lần; thanh toán thành công hay hết giờ giữ chỗ đều áp cho **mọi** hóa đơn của phiên cùng lúc. Sau đó mỗi hóa
đơn đi vòng đời riêng. Hai trạng thái con của `DRAFT`, phân biệt bằng `paid_at`:

| `DRAFT` | Nghĩa | Rời khỏi bằng |
|---|---|---|
| `paid_at` NULL — **chờ thanh toán** | Đang giữ chỗ | Phiên thanh toán thành công, hoặc phiên hết giờ giữ chỗ → `CANCELLED` |
| `paid_at` khác NULL — **chờ nạp hàng** | Slot đã thuộc thương hiệu, cấu hình được, chưa bán | Lắp chai đầu tiên, hoặc quá `RENTAL_MAX_STOCKING_DAYS` → `ACTIVE` |

Thời hạn hóa đơn tính từ lúc `ACTIVE`: `ends_at = starts_at + số tháng của gói`. Hóa đơn gia hạn không chờ
lắp chai: nó kích hoạt nối tiếp đúng `ends_at` của hóa đơn cũ (hoặc ngay khi thanh toán nếu hóa đơn cũ đã
`GRACE`), và hóa đơn cũ chuyển `RENEWED` trong cùng transaction.

### DispenseCommand

```
CREATED ──> SENT ──> ACKNOWLEDGED ──> SUCCEEDED   (khách đã bấm, xịt thành công)
              │             │
              │             ├──> FAILED     (đã kích hoạt cơ cấu nhưng hỏng)
              │             ├──> REJECTED   (PRESS_TIMEOUT, hoặc kiểm tra an toàn lúc bấm không đạt)
              │             └──> UNKNOWN    (quá DISPENSE_PRESS_WINDOW_SEC + DISPENSE_RESULT_TIMEOUT_SEC)
              ├──> REJECTED               (thiết bị từ chối ngay khi nhận lệnh)
              └──> UNKNOWN                (không có ACK trong DISPENSE_RESULT_TIMEOUT_SEC)
CREATED ──> EXPIRED                        (quá DISPENSE_CMD_TTL_SEC, chưa gửi được)
```

`ACKNOWLEDGED` nghĩa là **đèn nút của slot đích đã sáng, đang chờ khách bấm** (ADR-0007). Lệnh chẩn đoán
(`DIAGNOSTIC`) không chờ bấm: `ACKNOWLEDGED` rồi kích hoạt ngay (FR-DSP-27). Mỗi máy tối đa một lệnh
`CUSTOMER` ở `CREATED`/`SENT`/`ACKNOWLEDGED` (`uq_machine_active_customer_command`, FR-DSP-26).

`REJECTED` và `FAILED` là hai kết cục khác nhau: `REJECTED` là thiết bị từ chối **trước khi** kích
hoạt cơ cấu (FR-DSP-07 đến FR-DSP-14 — chữ ký sai, quá hạn, sai máy, trùng mã, cửa mở, đang bảo trì,
slot rỗng), khách chưa mất lượt xịt; `FAILED` là đã kích hoạt nhưng không thành công. FR-ORD-19 và
FR-ALR-04 phân biệt hai trường hợp này (`spec/decisions/0002-chuan-dat-ten-va-kieu-du-lieu-csdl.md`).

### Bottle

```
IN_STOCK ──> INSTALLED ──> LOW ──> EMPTY
                 │                   │
                 ├──> DAMAGED        └──> IN_STOCK (tháo về kho)
                 └──> EXPIRED
INSTALLED ──> LIQUIDATED   (hóa đơn chuyển LIQUIDATED, chủ sở hữu -> PLATFORM)
INSTALLED / LOW / EMPTY ──> RETURNED_TO_BRAND ──> LIQUIDATED
                            (tháo chai của hóa đơn     (quá RETURN_PICKUP_MAX_DAYS
                             báo không gia hạn)          chưa nhận hàng)
```

`RETURNED_TO_BRAND` (ADR-0014): chai đã tháo, nằm trên phiếu trả hàng chờ thương hiệu nhận. Bàn giao ghi
người nhận, thời điểm, mã vận đơn; quá `RETURN_PICKUP_MAX_DAYS` ngày kể từ lúc sẵn sàng mà chưa nhận thì
chuyển sở hữu về nền tảng như thanh lý. Chai hỏng trong lúc chờ nhận vẫn được bồi thường theo gói bảo
quản của hóa đơn vừa kết thúc.

### RefillRequest

```
SUBMITTED ──> ACCEPTED ──> SCHEDULED ──> COMPLETED
     │            │
     │            └──> CANCELLED
     └──> REJECTED
```

`COMPLETED` chỉ đặt được khi có `refill_session_id` liên kết.

### Alert

```
OPEN ──> ACKNOWLEDGED ──> RESOLVED ──> CLOSED
```

### MaintenanceTicket

```
OPEN ──> ASSIGNED ──> IN_PROGRESS ──> RESOLVED ──> CLOSED
```

Máy chỉ về `NORMAL` sau khi checklist kiểm tra sau bảo trì hoàn tất (FR-MNT-12).

### RefundClaim

```
OPEN ──> REFUNDED   (đã chuyển khoản, có payout_reference)
  ├────> REJECTED   (lý do bắt buộc)
  └────> EXPIRED    (mở quá REFUND_CLAIM_MAX_OPEN_DAYS)
```

Ba trạng thái sau đều là đã đóng: tài khoản nhận hoàn tiền bị xóa ngay trong cùng transaction
(`chk_refund_claim_account_purged_on_close`); thông tin liên hệ được giữ thêm
`REFUND_CLAIM_CONTACT_RETENTION_DAYS` ngày rồi xóa. Mỗi đơn tối đa một phiếu. `refund_order = true` thì
ghi nhận hoàn đưa đơn sang `REFUNDED`; `false` (chỉ hoàn tiền chuyển thừa) thì trạng thái đơn giữ nguyên.

### Machine — hai trục độc lập

| Trục | Giá trị |
|---|---|
| Kết nối | `ONLINE`, `UNSTABLE`, `OFFLINE` |
| Chế độ | `NORMAL`, `DRAINING`, `MAINTENANCE`, `DISABLED` |

```
NORMAL ──> DRAINING ──> MAINTENANCE ──> NORMAL   (sau checklist, FR-MNT-12)
   └──────────────────────> MAINTENANCE           (ép chuyển khẩn cấp, lý do bắt buộc — FR-MNT-17)
```

`DRAINING` (ADR-0015): Operations Staff đã yêu cầu bảo trì; máy không nhận đơn mới nhưng phục vụ nốt đơn đã
trả tiền và lệnh đang chạy, rồi tự sang `MAINTENANCE` khi hết. Chỉ tồn tại ở backend — thiết bị vẫn thấy
`NORMAL` tới khi máy thật sự vào `MAINTENANCE`. Máy có phiếu nạp đang mở cũng không nhận đơn mới
(FR-INV-30), nhưng đó không phải một chế độ riêng.

Slot có thêm luật tự tắt: `CONSECUTIVE_FAIL_ALERT` lệnh khách hàng liên tiếp lỗi → slot `MAINTENANCE`, chỉ
Operations Staff bật lại (FR-MCH-18).

### BrandPayout

```
DRAFT ──> CONFIRMED ──> PAID
(cộng dồn   (khóa số liệu    (đã chuyển khoản, có mã giao dịch; cần thương hiệu
 trong tháng) sau khi hết tháng)  đã xác minh pháp nhân và Super Admin xác thực lại)
```

Đơn được tính: `revenue_owner = BRAND` và `DISPENSED` hoặc `FORFEITED`. Không tính `FAILED`,
`REFUND_PENDING`, `REFUNDED`. Thương hiệu khiếu nại số liệu trên kỳ `CONFIRMED`; Super Admin trả lời trước
khi chuyển `PAID` (ADR-0013).

---

## Quy tắc cô lập dữ liệu

Người dùng thuộc thương hiệu chỉ thấy dữ liệu của slot mà thương hiệu đó **đang hoặc đã từng**
có hóa đơn, và chỉ trong kỳ hạn hóa đơn tương ứng.

```sql
-- ĐÚNG
WHERE o.brand_id = :current_brand_id

-- SAI: cột này không tồn tại
WHERE m.brand_id = :current_brand_id
```

Thương hiệu **không** được thấy danh tính, sản phẩm hay sự tồn tại của thương hiệu khác trên
cùng máy (BR-012). Khi xem sơ đồ máy, slot của bên khác hiển thị là không khả dụng, không kèm
thông tin.
