# Sơ đồ thực thể quan hệ (ERD)

> **CONTRACT ĐÓNG BĂNG.** Không sửa trực tiếp. Muốn đổi: viết ADR trong `spec/decisions/`, TV1 duyệt
> (`spec/contracts/README.md`).

Nguồn: `seed_document/DB_DIAGRAM_MERMAID.md` · Chuẩn đặt tên: `spec/decisions/0002-chuan-dat-ten-va-kieu-du-lieu-csdl.md`
Lược đồ thi hành: `spec/contracts/schema.sql` · Mô tả từng cột: `spec/contracts/data-dictionary.md`

35 bảng, chia theo 6 nhóm. Vẽ tất cả vào một hình thì không đọc được, nên tài liệu này có một sơ đồ
tổng quan các quan hệ cốt lõi, rồi 6 sơ đồ chi tiết theo nhóm.

---

## 1. Tổng quan — trục xương sống

Đây là phần cần hiểu trước mọi thứ khác. Ba điểm dễ hiểu sai được đánh dấu bằng ghi chú bên dưới.

```mermaid
erDiagram
    LOCATIONS          ||--o{ MACHINES : "đặt tại"
    MACHINES           ||--o{ MACHINE_SLOTS : "chứa"
    MACHINE_SLOTS      ||--o{ SLOT_RENTALS : "được thuê qua"
    BRANDS             ||--o{ SLOT_RENTALS : "thuê"
    BRANDS             ||--o{ FRAGRANCE_PRODUCTS : "sở hữu"
    FRAGRANCE_PRODUCTS ||--o{ SLOT_RENTALS : "được gán vào"
    SLOT_RENTALS       ||--o{ ORDERS : "phát sinh"
    ORDERS             ||--|| DISPENSE_COMMANDS : "sinh 1 lệnh hiệu lực"
    DISPENSE_COMMANDS  ||--|| DISPENSE_RESULTS : "nhận kết quả"
    ORDERS             ||--o{ PAYMENTS : "được thanh toán bởi"
    BRANDS             ||--o{ INVENTORY_BATCHES : "gửi lô"
    INVENTORY_BATCHES  ||--o{ BOTTLES : "gồm"
    MACHINE_SLOTS      ||--o| BOTTLES : "đang lắp 1 chai"
```

**Ba điều dễ hiểu sai** (`spec/glossary.md`):

1. **`machines` KHÔNG có `brand_id`.** Máy thuộc nền tảng. Một máy chứa slot của nhiều thương hiệu.
   Đường duy nhất nối thương hiệu với máy là `slot_rentals`. Truy vấn dữ liệu của thương hiệu phải
   lọc qua `orders`/`slot_rentals`, không bao giờ qua `machines` (BR-003, BR-012).

2. **Một hợp đồng ứng với đúng một slot.** Thương hiệu thuê 3 slot có 3 hàng `slot_rentals` độc lập,
   mỗi hàng có kỳ hạn, sản phẩm và giá riêng, và có thể ở trạng thái khác nhau (BR-009).

3. **`orders` chụp `brand_id`, `slot_rental_id`, `revenue_owner`, `amount` tại thời điểm tạo đơn.**
   Không suy ra từ slot khi truy vấn. `orders.brand_id` luôn có giá trị kể cả với đơn sau thanh lý;
   quyền sở hữu tiền nằm ở `revenue_owner` (FR-REV-01/02/03).

### Quan hệ chai ↔ slot đi theo chiều nào

`machine_slots.active_bottle_id → bottles.id`, **không phải** `bottles.installed_slot_id`. Đặt ở
chiều này thì "một slot tối đa một chai" được bảo đảm bởi chính cardinality của cột; partial unique
index `uq_slot_active_bottle` chỉ cần lo chiều còn lại — một chai không lắp ở hai slot (FR-MCH-07,
ADR-0002).

Hệ quả: hai bảng phụ thuộc vòng (`machine_slots` → `bottles` → `inventory_batches`, và
`bottles` → `slot_rentals` → `machine_slots`), nên khóa ngoại `fk_slot_active_bottle` được tách ra
`ALTER TABLE` ở §9 của `schema.sql`.

---

## 2. Nhóm Identity và Brands

```mermaid
erDiagram
    BRANDS {
        uuid id PK
        varchar code UK
        varchar name
        brand_status status
    }
    USERS {
        uuid id PK
        uuid brand_id FK "NULL với tài khoản nền tảng"
        citext email UK
        text password_hash
        user_status status
        int permission_version
    }
    ROLES {
        uuid id PK
        uuid brand_id FK "NULL với vai trò nền tảng"
        varchar code
        boolean is_system
    }
    PERMISSIONS {
        uuid id PK
        varchar code UK
    }
    USER_ROLES {
        uuid id PK
        uuid user_id FK
        uuid role_id FK
        varchar scope_type
        uuid scope_id "địa điểm hoặc máy"
    }
    ROLE_PERMISSIONS {
        uuid role_id PK,FK
        uuid permission_id PK,FK
    }
    REFRESH_SESSIONS {
        uuid id PK
        uuid user_id FK
        text token_hash UK
        timestamptz expires_at
    }

    BRANDS ||--o{ USERS : "có"
    BRANDS ||--o{ ROLES : "có vai trò riêng"
    USERS  ||--o{ USER_ROLES : "được gán"
    ROLES  ||--o{ USER_ROLES : "gán cho"
    ROLES  ||--o{ ROLE_PERMISSIONS : "gồm"
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : "thuộc"
    USERS  ||--o{ REFRESH_SESSIONS : "mở phiên"
```

Vai trò là **dữ liệu**, không phải enum: đổi tập vai trò chỉ cần sửa dữ liệu seed, không cần
migration. MVP có 4 vai trò hệ thống — Platform Super Admin, Operations Staff, Inventory Staff,
Brand Admin (`docs/FR_NFR_SCENTSTATION.md` Phần D).

`users.brand_id` NULL với tài khoản mức nền tảng, bắt buộc có giá trị với Brand Admin (FR-AUTH-05).

---

## 3. Nhóm Catalog và Machines

```mermaid
erDiagram
    LOCATIONS {
        uuid id PK
        varchar code UK
        varchar timezone
    }
    MACHINES {
        uuid id PK
        uuid location_id FK
        varchar serial_number UK
        machine_connection_status status "trục kết nối"
        machine_operating_mode operating_mode "trục chế độ"
        timestamptz last_seen_at
    }
    MACHINE_SLOTS {
        uuid id PK
        uuid machine_id FK
        int slot_number
        uuid active_bottle_id FK
        numeric calibrated_dosage_ml
        slot_status status
    }
    MACHINE_STATUS_HISTORIES {
        uuid id PK
        uuid machine_id FK
        varchar source
        timestamptz occurred_at
    }
    FRAGRANCE_PRODUCTS {
        uuid id PK
        uuid brand_id FK
        varchar sku
        numeric default_price
        numeric full_bottle_retail_price
    }
    SLOT_RENTALS {
        uuid id PK
        uuid slot_id FK
        uuid brand_id FK
        uuid fragrance_product_id FK "NULL chỉ trong cửa sổ DRAFT"
        uuid request_id FK
        uuid previous_rental_id FK
        slot_rental_status status
        timestamptz starts_at
        timestamptz ends_at
        numeric price_per_spray
        numeric revenue_share_percent
    }
    SLOT_RENTAL_REQUESTS {
        uuid id PK
        uuid slot_id FK
        uuid brand_id FK
        slot_rental_request_status status
        uuid resulting_rental_id FK
    }

    LOCATIONS ||--o{ MACHINES : "chứa"
    MACHINES  ||--o{ MACHINE_SLOTS : "gồm"
    MACHINES  ||--o{ MACHINE_STATUS_HISTORIES : "ghi lịch sử"
    MACHINE_SLOTS ||--o{ SLOT_RENTALS : "được thuê"
    MACHINE_SLOTS ||--o{ SLOT_RENTAL_REQUESTS : "được yêu cầu thuê"
    FRAGRANCE_PRODUCTS ||--o{ SLOT_RENTALS : "gán vào"
    SLOT_RENTAL_REQUESTS ||--o| SLOT_RENTALS : "sinh hợp đồng DRAFT"
    SLOT_RENTALS ||--o| SLOT_RENTALS : "gia hạn từ"
```

**`machines` có hai trục trạng thái độc lập.** `status` là kết nối, suy ra từ heartbeat (FR-MCH-08,
FR-IOT-01..03). `operating_mode` là chế độ do người vận hành đặt (FR-MCH-09, FR-MNT-05/12). Một máy
có thể vừa `ONLINE` vừa `MAINTENANCE`. `machine_status_histories` ghi cả hai trục vào cùng một bảng
nhưng mỗi hàng chỉ điền một cặp.

**Luồng tự phục vụ của Brand Admin** (FR-SLT-19..29): `slot_rental_requests` (REQUESTED) → duyệt →
`slot_rentals` (DRAFT, chưa có sản phẩm) → Brand Admin gán sản phẩm (FR-SLT-27) → đến ngày bắt đầu
chuyển ACTIVE (FR-SLT-24). Hai bảng trỏ vào nhau (`request_id` ↔ `resulting_rental_id`), nên
`fk_request_resulting_rental` cũng phải tách ra `ALTER TABLE`.

---

## 4. Nhóm Inventory

```mermaid
erDiagram
    BRAND_SHIPMENT_DECLARATIONS {
        uuid id PK
        uuid brand_id FK
        uuid fragrance_product_id FK
        int declared_quantity
        int received_quantity
        shipment_declaration_status status
    }
    INVENTORY_BATCHES {
        uuid id PK
        uuid brand_id FK
        uuid fragrance_product_id FK
        uuid source_declaration_id FK
        varchar batch_number
        timestamptz expires_at
        int quantity_received
    }
    BOTTLES {
        uuid id PK
        uuid brand_id FK "thương hiệu gốc, bất biến"
        revenue_owner_type owner "chủ sở hữu hiện tại"
        uuid batch_id FK
        varchar identifier
        bottle_status status
        numeric current_estimated_ml
        uuid source_rental_id FK
        timestamptz liquidated_at
    }
    REFILL_SESSIONS {
        uuid id PK
        uuid machine_id FK
        uuid slot_id FK
        uuid old_bottle_id FK
        uuid new_bottle_id FK "NULL khi mới mở phiếu"
        refill_status status
        boolean checklist_completed
    }
    INVENTORY_ADJUSTMENTS {
        uuid id PK
        uuid bottle_id FK
        numeric difference_ml
        text reason "bắt buộc"
    }

    BRAND_SHIPMENT_DECLARATIONS ||--o| INVENTORY_BATCHES : "sinh lô khi nhận"
    INVENTORY_BATCHES ||--o{ BOTTLES : "gồm"
    BOTTLES ||--o{ REFILL_SESSIONS : "được tháo/lắp qua"
    BOTTLES ||--o{ INVENTORY_ADJUSTMENTS : "được điều chỉnh"
```

**`bottles` có hai cột chủ sở hữu, đừng nhầm.** `brand_id` là thương hiệu gốc, bất biến để phục vụ
kiểm toán. `owner` là chủ sở hữu hiện tại, lật sang `PLATFORM` khi thanh lý (FR-EXP-15). Câu hỏi
"chai này của ai" phải đọc `owner`.

**`refill_sessions` chính là phiếu nạp** (FR-INV-29..31), không phải một bảng riêng: `status=STARTED`
là phiếu đang mở, `status=COMPLETED` là phiếu đã đóng. Trong lúc phiếu mở, cảnh báo cửa mở quá hạn
(FR-ALR-03) bị tạm ngưng cho máy/slot đó.

---

## 5. Nhóm Orders và Payments

```mermaid
erDiagram
    ORDERS {
        uuid id PK
        uuid brand_id FK "luôn có giá trị"
        uuid slot_rental_id FK
        revenue_owner_type revenue_owner "BRAND hoặc PLATFORM"
        uuid machine_id FK
        uuid slot_id FK
        numeric amount "ảnh chụp"
        order_status status
        varchar payment_reference UK
        varchar idempotency_key UK
        timestamptz expires_at
        boolean needs_manual_review
    }
    ORDER_STATUS_HISTORIES {
        uuid id PK
        uuid order_id FK
        order_status from_status
        order_status to_status
    }
    PAYMENTS {
        uuid id PK
        uuid order_id FK
        varchar provider
        varchar provider_transaction_id
        payment_status status
    }
    PAYMENT_EVENTS {
        uuid id PK
        uuid payment_id FK "NULL khi không khớp được"
        varchar provider_event_id
        boolean signature_valid
    }
    DISPENSE_COMMANDS {
        uuid id PK
        uuid order_id FK "NULL với lệnh DIAGNOSTIC"
        uuid machine_id FK
        uuid slot_id FK
        dispense_type command_type
        varchar command_token UK
        command_status status
        timestamptz expires_at
    }
    DISPENSE_RESULTS {
        uuid id PK
        uuid command_id FK,UK
        boolean success
        varchar failure_code
    }
    KIOSK_INTERACTION_EVENTS {
        uuid id PK
        varchar event_id UK
        kiosk_interaction_type event_type
        uuid kiosk_session_id "ẩn danh"
    }

    ORDERS ||--o{ ORDER_STATUS_HISTORIES : "ghi lịch sử"
    ORDERS ||--o{ PAYMENTS : "thanh toán"
    PAYMENTS ||--o{ PAYMENT_EVENTS : "nhận webhook"
    ORDERS ||--o{ DISPENSE_COMMANDS : "sinh lệnh"
    DISPENSE_COMMANDS ||--|| DISPENSE_RESULTS : "trả kết quả"
```

**Ba ràng buộc duy nhất giữ cho BR-002 đúng:**

| Ràng buộc | Chặn điều gì |
|---|---|
| `uq_payment_event (provider, provider_event_id)` | Cổng thanh toán gửi lại webhook → xử lý hai lần (FR-ORD-15) |
| `uq_order_active_command (order_id)` partial | Một đơn có hai lệnh xịt cùng hiệu lực → xịt hai lần (FR-DSP-05) |
| `dispense_results.command_id` UNIQUE | Một lệnh ghi hai kết quả khác nhau (FR-IOT-07) |

`payment_events.brand_id`/`payment_id` NULL khi webhook không khớp được với đơn nào (chữ ký sai, mã
tham chiếu lạ) — vẫn ghi lại để rà soát bảo mật (FR-ORD-13/14).

`kiosk_interaction_events` tách khỏi `orders` vì ghi cả lượt xem và lượt chọn không dẫn tới đơn hàng
— đây là nguồn dữ liệu cho xếp hạng sản phẩm (FR-RPT-06, BR-007). `kiosk_session_id` là phiên ẩn
danh xoay vòng, không chứa định danh khách hàng.

---

## 6. Nhóm Operations

```mermaid
erDiagram
    ALERTS {
        uuid id PK
        uuid brand_id FK "NULL với cảnh báo mức máy"
        uuid machine_id FK
        uuid slot_id FK
        varchar type
        alert_severity severity
        alert_status status
        varchar deduplication_key
    }
    MAINTENANCE_TICKETS {
        uuid id PK
        uuid machine_id FK
        uuid source_alert_id FK
        varchar ticket_number UK
        ticket_status status
        ticket_priority priority
        varchar post_test_result
    }
    MAINTENANCE_ACTIVITIES {
        uuid id PK
        uuid ticket_id FK
        uuid actor_id FK
        ticket_status from_status
        ticket_status to_status
    }
    REFILL_REQUESTS {
        uuid id PK
        uuid brand_id FK
        uuid slot_rental_id FK
        refill_request_reason reason
        refill_request_status status
        uuid refill_session_id FK
    }
    NOTIFICATIONS {
        uuid id PK
        uuid recipient_user_id FK
        varchar type
        notification_status status
    }
    AUDIT_LOGS {
        uuid id PK
        uuid brand_id FK "NULL với sự kiện nền tảng"
        varchar action
        varchar target_type
        jsonb before_data
        jsonb after_data
    }

    ALERTS ||--o| MAINTENANCE_TICKETS : "sinh phiếu"
    MAINTENANCE_TICKETS ||--o{ MAINTENANCE_ACTIVITIES : "ghi hoạt động"
    REFILL_REQUESTS ||--o| REFILL_SESSIONS : "hoàn tất bằng"
```

**`alerts.brand_id` và `maintenance_tickets.brand_id` gần như luôn NULL.** Cảnh báo mức máy
(FR-ALR-01/03/05) và phiếu bảo trì ảnh hưởng nhiều thương hiệu cùng lúc; danh sách thương hiệu bị
ảnh hưởng được **suy ra lúc đọc** bằng cách join `slot_rentals` đang hiệu lực của máy (FR-ALR-09,
FR-MNT-07), không lưu ở cột này. Chỉ cảnh báo mức slot mới điền `brand_id`.

**`audit_logs` chỉ thêm mới.** Cưỡng chế bằng cả `REVOKE UPDATE, DELETE, TRUNCATE` cho role ứng dụng
lẫn trigger `trg_audit_logs_append_only` (FR-AUD-09, NFR-SEC-08).

---

## 7. Nhóm Device và IoT

```mermaid
erDiagram
    MACHINES {
        uuid id PK
        varchar serial_number UK
    }
    DEVICE_CREDENTIALS {
        uuid id PK
        uuid machine_id FK,UK
        varchar credential_identifier UK
        credential_status status
    }
    DEVICE_EVENTS {
        uuid id PK
        uuid machine_id FK
        varchar device_event_id "khử trùng khi gửi lại"
        varchar event_type
    }
    SENSOR_READINGS {
        uuid id PK
        uuid machine_id FK
        uuid slot_id FK
        varchar reading_type
        numeric numeric_value
    }

    MACHINES ||--|| DEVICE_CREDENTIALS : "có 1 bộ riêng"
    MACHINES ||--o{ DEVICE_EVENTS : "gửi sự kiện"
    MACHINES ||--o{ SENSOR_READINGS : "gửi telemetry"
```

Quan hệ `machines ↔ device_credentials` là **1-1**, cưỡng chế bằng `UNIQUE` trên `machine_id`: mỗi
máy một bộ thông tin xác thực riêng, không dùng chung (FR-MCH-02, NFR-SEC-07).

`uq_device_event (machine_id, device_event_id)` là cơ chế khử trùng khi thiết bị gửi lại sự kiện đã
lưu tạm sau lúc mất kết nối (FR-IOT-10, FR-IOT-11). Cấu trúc bản tin ở `spec/contracts/mqtt.md`.

---

## 8. Điều ERD không thể hiện được

Sơ đồ chỉ vẽ bảng và khóa ngoại. Những ràng buộc sau quan trọng ngang khóa ngoại nhưng không nhìn
thấy trên hình — đọc §10 và §13 của `spec/contracts/schema.sql`:

- 4 partial unique index bắt buộc + exclusion constraint chống chồng lấn kỳ hạn thuê.
- Trigger append-only cho `audit_logs`.
- Các ràng buộc thuộc tầng domain service: chuyển trạng thái hợp lệ, ràng buộc same-brand
  (sản phẩm/chai phải thuộc thương hiệu đang thuê slot), tính bất biến của các cột ảnh chụp trên
  `orders`.
