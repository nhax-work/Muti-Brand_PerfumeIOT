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
2. Một thương hiệu có thể thuê **nhiều slot trên cùng một máy**. Mỗi slot một hợp đồng riêng.
3. `Order` chụp `brand_id`, `slot_rental_id`, `revenue_owner` **tại thời điểm tạo đơn**. Không
   suy ra từ slot khi truy vấn.

## Thực thể

| Thực thể | Vai trò |
|---|---|
| `Brand` | Thương hiệu nước hoa thuê slot |
| `Location` | Địa điểm đặt máy, thuộc nền tảng |
| `Machine` | Máy trải nghiệm, thuộc nền tảng |
| `MachineSlot` | Ngăn chứa độc lập trên máy |
| `SlotRental` | Hợp đồng thuê một slot của một thương hiệu trong một kỳ hạn |
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
                                     │
                                     └──> LIQUIDATED ──> CLOSED
ACTIVE ──> TERMINATED
```

| Trạng thái | Slot bán được? | Doanh thu thuộc |
|---|---|---|
| `ACTIVE` | Có | BRAND |
| `EXPIRING` | Có | BRAND |
| `GRACE` | Có | BRAND |
| `LIQUIDATED` | Có | **PLATFORM** |
| `RENEWED`, `CLOSED`, `TERMINATED` | Không | — |

Slot chỉ được cho thuê lại sau khi hợp đồng cũ về `CLOSED` hoặc `TERMINATED`.

### DispenseCommand

```
CREATED ──> SENT ──> ACKED ──> SUCCESS
                        │
                        ├──> FAILED
                        └──> UNKNOWN   (quá DISPENSE_RESULT_TIMEOUT_SEC)
CREATED ──> EXPIRED                    (quá DISPENSE_CMD_TTL_SEC, chưa gửi được)
```

### Bottle

```
IN_STOCK ──> INSTALLED ──> LOW ──> EMPTY
                 │                   │
                 ├──> DAMAGED        └──> IN_STOCK (tháo về kho)
                 └──> EXPIRED
INSTALLED ──> LIQUIDATED   (hợp đồng chuyển LIQUIDATED, chủ sở hữu -> PLATFORM)
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
có hợp đồng, và chỉ trong kỳ hạn hợp đồng tương ứng.

```sql
-- ĐÚNG
WHERE o.brand_id = :current_brand_id

-- SAI: cột này không tồn tại
WHERE m.brand_id = :current_brand_id
```

Thương hiệu **không** được thấy danh tính, sản phẩm hay sự tồn tại của thương hiệu khác trên
cùng máy (BR-012). Khi xem sơ đồ máy, slot của bên khác hiển thị là không khả dụng, không kèm
thông tin.
