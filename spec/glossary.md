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
2. Một thương hiệu có thể thuê **nhiều slot trên cùng một máy**. Mỗi slot một hóa đơn riêng.
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

---

## State machine

### Order

```
CREATED ──> PENDING_PAYMENT ──> PAID ──> DISPENSE_REQUESTED ──> DISPENSED
                │                                    │
                ├──> EXPIRED                         ├──> FAILED
                └──> FAILED                          └──> REFUND_PENDING ──> REFUNDED
```

Chỉ chuyển sang `DISPENSED` khi thiết bị trả kết quả thành công (FR-DSP-17).
Lệnh ở trạng thái UNKNOWN **không** tự sinh lệnh mới (FR-DSP-19).

### SlotRental

```
DRAFT ──> ACTIVE ──> EXPIRING ──> GRACE ──> RENEWED
  │                     │            │
  │                     │            └──> LIQUIDATED ──> CLOSED
  │                     └──> RENEWED        (gia hạn trước khi hết hạn)
  └──> CANCELLED   (hết giờ giữ chỗ, chưa thanh toán)
ACTIVE ──> TERMINATED
```

| Trạng thái | Slot bán được? | Doanh thu thuộc |
|---|---|---|
| `DRAFT` | Không — chờ thanh toán hoặc chờ nạp hàng | — |
| `ACTIVE` | Có | BRAND |
| `EXPIRING` | Có | BRAND |
| `GRACE` | Có | BRAND |
| `LIQUIDATED` | Có | **PLATFORM** |
| `RENEWED`, `CLOSED`, `TERMINATED`, `CANCELLED` | Không | — |

Slot chỉ được cho thuê lại sau khi hóa đơn cũ về `CLOSED`, `TERMINATED` hoặc `CANCELLED`.

**Mua gói trả trước** (ADR-0006, **đề xuất**). Brand Admin tự tạo hóa đơn `DRAFT` khi chọn slot, gói
thuê và gói bảo quản; hóa đơn `DRAFT` giữ chỗ slot trong `RENTAL_CHECKOUT_HOLD_MIN` phút. Hai trạng thái con
của `DRAFT`, phân biệt bằng `paid_at`:

| `DRAFT` | Nghĩa | Rời khỏi bằng |
|---|---|---|
| `paid_at` NULL — **chờ thanh toán** | Đang giữ chỗ | Thanh toán thành công, hoặc hết giờ giữ chỗ → `CANCELLED` |
| `paid_at` khác NULL — **chờ nạp hàng** | Slot đã thuộc thương hiệu, cấu hình được, chưa bán | Lắp chai đầu tiên, hoặc quá `RENTAL_MAX_STOCKING_DAYS` → `ACTIVE` |

Thời hạn hóa đơn tính từ lúc `ACTIVE`: `ends_at = starts_at + số tháng của gói`. Hóa đơn gia hạn không chờ
lắp chai: nó kích hoạt nối tiếp đúng `ends_at` của hóa đơn cũ (hoặc ngay khi thanh toán nếu hóa đơn cũ đã
`GRACE`), và hóa đơn cũ chuyển `RENEWED` trong cùng transaction.

### DispenseCommand

```
CREATED ──> SENT ──> ACKNOWLEDGED ──> SUCCEEDED
              │             │
              │             ├──> FAILED     (đã kích hoạt cơ cấu nhưng hỏng)
              │             └──> UNKNOWN    (quá DISPENSE_RESULT_TIMEOUT_SEC)
              └──> REJECTED               (thiết bị từ chối trước khi kích hoạt)
CREATED ──> EXPIRED                        (quá DISPENSE_CMD_TTL_SEC, chưa gửi được)
```

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
```

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

### Machine — hai trục độc lập

| Trục | Giá trị |
|---|---|
| Kết nối | `ONLINE`, `UNSTABLE`, `OFFLINE` |
| Chế độ | `NORMAL`, `MAINTENANCE`, `DISABLED` |

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
