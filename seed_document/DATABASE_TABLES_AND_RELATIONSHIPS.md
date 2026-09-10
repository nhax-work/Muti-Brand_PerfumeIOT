# ScentStation — Chức năng bảng và mối quan hệ

Tài liệu này giải thích chức năng và quan hệ của 30 bảng trong `DATABASE_DESIGN_SCENTSTATION.md` và `SCENTSTATION_DATABASE.dbml`.

## 1. Quy ước

- `1 — N`: một bản ghi cha có nhiều bản ghi con.
- `1 — 0..1`: một bản ghi cha có tối đa một bản ghi con.
- `N — N`: quan hệ nhiều-nhiều thông qua bảng trung gian.
- `FK`: khóa ngoại.
- `Tenant-owned`: dữ liệu thuộc một thương hiệu và phải có `tenant_id`.

## 2. Tenant và phân quyền

| Bảng | Chức năng | Mối quan hệ |
|---|---|---|
| `tenants` | Lưu không gian dữ liệu độc lập của từng thương hiệu. | Một tenant có nhiều user, role, location, product, machine và dữ liệu nghiệp vụ. |
| `users` | Lưu tài khoản nhân viên, mật khẩu đã băm, trạng thái và phiên bản quyền. | Thuộc một tenant, trừ platform user; có nhiều role và refresh session. |
| `roles` | Định nghĩa vai trò như Brand Admin, Operations, Technician hoặc Inventory Staff. | Thuộc tenant hoặc cấp nền tảng; liên kết user và permission qua bảng trung gian. |
| `permissions` | Định nghĩa quyền thao tác cụ thể như `product.update` hoặc `refund.create`. | Quan hệ N—N với role qua `role_permissions`. |
| `user_roles` | Gán role cho user theo phạm vi tenant, location hoặc machine. | Bảng trung gian giữa `users` và `roles`; `assigned_by` tham chiếu user thực hiện việc gán. |
| `role_permissions` | Gán các permission vào một role. | Bảng trung gian giữa `roles` và `permissions`. |
| `refresh_sessions` | Quản lý refresh token, phiên đăng nhập, thời hạn và trạng thái thu hồi. | N session thuộc một `user`. |

```text
Tenant
 ├─ User
 │   ├─ RefreshSession
 │   └─ UserRole ─ Role ─ RolePermission ─ Permission
 └─ Tenant Role
```

## 3. Sản phẩm, địa điểm và máy

| Bảng | Chức năng | Mối quan hệ |
|---|---|---|
| `locations` | Lưu địa điểm đặt máy, địa chỉ, múi giờ và trạng thái. | Thuộc tenant; một location có nhiều machine. |
| `fragrance_products` | Lưu thông tin loại nước hoa, SKU, tầng hương, ảnh và giá mặc định. | Thuộc tenant; có nhiều batch, bottle, slot và order. |
| `machines` | Lưu thông tin máy/kiosk, serial, địa điểm, trạng thái và phiên bản cấu hình. | Thuộc tenant và location; có nhiều slot, order, alert, ticket và dữ liệu thiết bị. |
| `machine_slots` | Lưu từng ngăn độc lập, sản phẩm, chai đang lắp, giá, liều lượng và tồn ước tính. | Thuộc machine; tham chiếu product và tối đa một active bottle. |
| `machine_status_histories` | Lưu lịch sử chuyển trạng thái máy và nguyên nhân. | N lịch sử thuộc một machine; có thể tham chiếu user thực hiện. |

```text
Tenant
 ├─ Location
 │   └─ Machine
 │       ├─ MachineSlot
 │       └─ MachineStatusHistory
 └─ FragranceProduct
     └─ MachineSlot
```

Phân biệt:

- `FragranceProduct` là thông tin loại nước hoa.
- `Bottle` là chai vật lý cụ thể.
- `MachineSlot` là ngăn vật lý dùng để lắp một bottle.

## 4. Tồn kho và refill

| Bảng | Chức năng | Mối quan hệ |
|---|---|---|
| `inventory_batches` | Quản lý lô nhập, số lô, ngày nhận, hạn dùng và số lượng. | Thuộc tenant và product; một batch có nhiều bottle. |
| `bottles` | Quản lý từng chai/cartridge bằng mã duy nhất, dung lượng, khối lượng và trạng thái. | Thuộc batch và product; có thể được lắp vào một slot. |
| `refill_sessions` | Lưu một lần refill hoặc thay chai tại một ngăn. | Tham chiếu machine, slot, chai cũ, chai mới và user thực hiện. |
| `inventory_adjustments` | Lưu điều chỉnh tồn kho thủ công với lượng trước/sau và lý do. | Thuộc bottle; có thể liên quan slot; tham chiếu user thực hiện. |

```text
FragranceProduct
 └─ InventoryBatch
     └─ Bottle
         ├─ MachineSlot đang lắp
         ├─ RefillSession
         └─ InventoryAdjustment
```

Quy tắc:

- Một bottle chỉ được lắp vào tối đa một slot.
- Một slot chỉ có tối đa một active bottle.
- Refill cập nhật chai cũ, chai mới và slot trong cùng transaction.
- Adjustment không được sửa/xóa; sửa sai bằng adjustment đảo.

## 5. Đơn hàng và thanh toán

| Bảng | Chức năng | Mối quan hệ |
|---|---|---|
| `orders` | Lưu yêu cầu mua một lượt trải nghiệm, snapshot sản phẩm, giá và trạng thái. | Thuộc tenant, machine, slot và product; có nhiều payment/history và tối đa một customer dispense command. |
| `order_status_histories` | Lưu lịch sử chuyển trạng thái order. | N history thuộc một order. |
| `payments` | Lưu giao dịch thanh toán và trạng thái đối soát với provider. | N payment thuộc một order; có nhiều payment event. |
| `payment_events` | Lưu webhook nguyên bản từ provider để xác minh và chống xử lý trùng. | Có thể liên kết payment; duy nhất theo provider và event ID. |

```text
MachineSlot
 └─ Order
     ├─ OrderStatusHistory
     ├─ Payment
     │   └─ PaymentEvent
     └─ DispenseCommand
```

Một order có thể có nhiều payment attempt để lưu đầy đủ lịch sử thử lại, thất bại, thành công và hoàn tiền.

## 6. Quản lý lượt xịt

| Bảng | Chức năng | Mối quan hệ |
|---|---|---|
| `dispense_commands` | Lưu lệnh yêu cầu đúng machine/slot thực hiện một lượt xịt. | Customer command thuộc một order; diagnostic command không cần order; tham chiếu machine, slot và user tạo nếu có. |
| `dispense_results` | Lưu kết quả cuối, mã lỗi, lượng đo và dữ liệu cảm biến của command. | Quan hệ 1—0..1 với `dispense_commands`. |

```text
Order
 └─ DispenseCommand
     └─ DispenseResult
```

Quy tắc:

- Một customer order có tối đa một dispense command.
- Một command có tối đa một dispense result.
- Retry sử dụng lại command ID.
- Chỉ result thành công chuyển order sang `DISPENSED` và tự động trừ tồn kho.
- Diagnostic command không có `order_id` vì không phải giao dịch khách hàng.

## 7. Cảnh báo và bảo trì

| Bảng | Chức năng | Mối quan hệ |
|---|---|---|
| `alerts` | Lưu cảnh báo như offline, tồn thấp, cửa mở, rò rỉ hoặc xịt lỗi. | Thuộc machine; có thể liên quan slot và các user xử lý; có thể tạo ticket. |
| `maintenance_tickets` | Quản lý vòng đời phiếu bảo trì, người phụ trách, chẩn đoán, chi phí và post-test. | Thuộc machine; có thể được tạo từ alert; có nhiều activity. |
| `maintenance_activities` | Lưu timeline hoạt động và thay đổi trạng thái ticket. | N activity thuộc một ticket; mỗi activity do một user thực hiện. |
| `notifications` | Lưu thông báo trong hệ thống hoặc trạng thái gửi qua kênh ngoài. | Thuộc tenant và user nhận thông báo. |

```text
Machine/Slot
 └─ Alert
     └─ MaintenanceTicket
         └─ MaintenanceActivity

Alert hoặc sự kiện hệ thống
 └─ Notification
     └─ User nhận
```

## 8. IoT triển khai sau

| Bảng | Chức năng | Mối quan hệ |
|---|---|---|
| `device_credentials` | Lưu định danh và thông tin xác thực riêng của thiết bị. | Quan hệ 1—0..1 với machine. |
| `device_events` | Lưu sự kiện như khởi động, mất kết nối, cửa mở hoặc lỗi. | N event thuộc một machine và tenant. |
| `sensor_readings` | Lưu telemetry và số đo cảm biến theo thời gian. | Thuộc machine; có thể liên quan một slot cụ thể. |

```text
Machine
 ├─ DeviceCredential
 ├─ DeviceEvent
 └─ SensorReading
     └─ MachineSlot (nếu số đo thuộc một ngăn)
```

`device_events.device_event_id` dùng để loại bỏ dữ liệu trùng khi thiết bị đồng bộ lại sau mất mạng.

## 9. Audit

| Bảng | Chức năng | Mối quan hệ |
|---|---|---|
| `audit_logs` | Lưu bất biến các hành động nhạy cảm và dữ liệu trước/sau thay đổi. | Có thể thuộc tenant; `actor_type + actor_id` đại diện user, device hoặc system. |

Audit cần ghi nhận:

- Đăng nhập và thay đổi quyền.
- Thay đổi giá.
- Cấu hình machine/slot.
- Gán hoặc thay bottle.
- Điều chỉnh tồn kho.
- Xử lý payment/refund.
- Tạo và xử lý command.
- Thay đổi trạng thái bảo trì.

## 10. Quan hệ tổng thể

```text
Tenant
 ├─ Users ─ Roles ─ Permissions
 ├─ Locations
 │   └─ Machines
 │       ├─ MachineSlots
 │       │   ├─ FragranceProduct
 │       │   └─ Active Bottle
 │       │       └─ InventoryBatch
 │       ├─ Orders
 │       │   ├─ Payments ─ PaymentEvents
 │       │   ├─ OrderStatusHistories
 │       │   └─ DispenseCommand ─ DispenseResult
 │       ├─ Alerts ─ MaintenanceTicket ─ MaintenanceActivities
 │       ├─ DeviceCredential
 │       ├─ DeviceEvents
 │       └─ SensorReadings
 ├─ Notifications
 └─ AuditLogs
```

## 11. Các điểm cần điều chỉnh

### 11.1. Cardinality giữa MachineSlot và Bottle

ERD hiện mô tả một slot có nhiều bottle:

```mermaid
MACHINE_SLOT ||--o{ BOTTLE : active_assignment
```

Quan hệ active bottle đúng phải là tối đa một-một:

```mermaid
MACHINE_SLOT o|--o| BOTTLE : active_assignment
```

Lịch sử nhiều bottle từng được lắp vào một slot được lưu bằng `refill_sessions`.

### 11.2. AuditLog và User

`audit_logs.actor_id` là polymorphic reference vì actor có thể là user, device hoặc system. Do đó quan hệ `USER — AUDIT_LOG` chỉ là quan hệ khái niệm, không phải foreign key trực tiếp.

### 11.3. Notification chưa có trên ERD

Cần bổ sung:

```mermaid
TENANT ||--o{ NOTIFICATION : owns
USER ||--o{ NOTIFICATION : receives
```

### 11.4. Tenant relation được lược bớt

Tất cả bảng tenant-owned đều cần `tenant_id`. Một số đường nối tenant có thể được lược khỏi ERD để sơ đồ dễ đọc nhưng phải được thực thi trong schema.

### 11.5. Scope của UserRole

`user_roles.scope_id` có thể đại diện location hoặc machine nên không thể có một FK thông thường. Có hai lựa chọn:

1. Giữ polymorphic scope và kiểm tra bằng service/trigger.
2. Tách thành `user_location_scopes` và `user_machine_scopes`.

Phương án tách bảng an toàn và dễ kiểm tra hơn cho Web MVP.

### 11.6. Refund

Nếu cần nhiều lần refund, partial refund hoặc lưu provider refund ID, nên thêm bảng:

```text
refunds
- id
- tenant_id
- payment_id
- amount
- currency
- provider_refund_id
- idempotency_key
- status
- reason
- requested_by
- created_at
- completed_at
```

### 11.7. Campaign và promotion

Functional Requirements có promotion, free trial và temporary price nhưng schema chưa có bảng tương ứng. Nếu giữ trong MVP, cần bổ sung `campaigns` và các bảng phạm vi campaign; nếu không, phải đánh dấu rõ là future scope.

