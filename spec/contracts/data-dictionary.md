# Từ điển dữ liệu

> **CONTRACT ĐÓNG BĂNG — SINH TỰ ĐỘNG. Không sửa file này bằng tay.**
>
> Sinh bằng `npx tsx scripts/gen-data-dictionary.ts` từ CSDL đã áp migration. Muốn đổi mô tả một cột: thêm `COMMENT ON` trong `spec/contracts/schema.sql` rồi chạy lại script. Muốn đổi cấu trúc: viết ADR trong `spec/decisions/`, TV1 duyệt (`spec/contracts/README.md`).

Sơ đồ quan hệ: `spec/contracts/erd.md` · Lược đồ thi hành: `spec/contracts/schema.sql`

## Quy ước chung

| | |
|---|---|
| Khóa chính | `uuid`, mặc định `gen_random_uuid()` |
| Thời điểm | `timestamptz`, lưu ở UTC (NFR-DAT-01) |
| Tiền tệ | `numeric(19,4)`, không dùng dấu phẩy động (NFR-DAT-02, ADR-0002) |
| Thể tích | `numeric(14,4)` mililít |
| Loại tiền | `char(3)` mã ISO-4217, mặc định `VND` |

Tổng: **36 bảng**, **24 kiểu enum**.

---

## Kiểu enum

| Kiểu | Giá trị |
|---|---|
| `alert_severity` | `INFO` · `WARNING` · `HIGH` · `CRITICAL` |
| `alert_status` | `OPEN` · `ACKNOWLEDGED` · `IN_PROGRESS` · `RESOLVED` · `CLOSED` |
| `bottle_status` | `IN_STOCK` · `INSTALLED` · `LOW` · `EMPTY` · `DAMAGED` · `EXPIRED` · `LIQUIDATED` |
| `brand_status` | `ACTIVE` · `SUSPENDED` · `DISABLED` |
| `command_status` | `CREATED` · `SENT` · `ACKNOWLEDGED` · `SUCCEEDED` · `FAILED` · `REJECTED` · `EXPIRED` · `UNKNOWN` |
| `credential_status` | `ACTIVE` · `REVOKED` · `EXPIRED` |
| `dispense_type` | `CUSTOMER` · `DIAGNOSTIC` |
| `kiosk_interaction_type` | `PRODUCT_IMPRESSION` · `PRODUCT_SELECTED` |
| `machine_connection_status` | `ONLINE` · `UNSTABLE` · `OFFLINE` |
| `machine_operating_mode` | `NORMAL` · `MAINTENANCE` · `DISABLED` |
| `notification_status` | `PENDING` · `SENT` · `FAILED` · `READ` |
| `order_status` | `CREATED` · `PENDING_PAYMENT` · `PAID` · `DISPENSE_REQUESTED` · `DISPENSED` · `FAILED` · `EXPIRED` · `REFUND_PENDING` · `REFUNDED` |
| `payment_status` | `PENDING` · `SUCCEEDED` · `FAILED` · `CANCELLED` · `EXPIRED` · `REFUND_PENDING` · `PARTIALLY_REFUNDED` · `REFUNDED` |
| `refill_request_reason` | `LOW_STOCK` · `EXPIRING` · `PRODUCT_CHANGE` |
| `refill_request_status` | `SUBMITTED` · `ACCEPTED` · `REJECTED` · `SCHEDULED` · `COMPLETED` · `CANCELLED` |
| `refill_status` | `STARTED` · `COMPLETED` · `CANCELLED` |
| `revenue_owner_type` | `BRAND` · `PLATFORM` |
| `shipment_declaration_status` | `DECLARED` · `RECEIVED` · `DISCREPANCY` · `CANCELLED` |
| `slot_rental_request_status` | `REQUESTED` · `APPROVED` · `REJECTED` · `CONVERTED` · `CANCELLED` |
| `slot_rental_status` | `DRAFT` · `ACTIVE` · `EXPIRING` · `GRACE` · `RENEWED` · `LIQUIDATED` · `CLOSED` · `TERMINATED` |
| `slot_status` | `AVAILABLE` · `UNAVAILABLE` · `MAINTENANCE` · `DISABLED` |
| `ticket_priority` | `LOW` · `MEDIUM` · `HIGH` · `CRITICAL` |
| `ticket_status` | `OPEN` · `ASSIGNED` · `IN_PROGRESS` · `WAITING_PART` · `POST_TEST` · `RESOLVED` · `CLOSED` · `REOPENED` |
| `user_status` | `INVITED` · `ACTIVE` · `LOCKED` · `DISABLED` |

---

## Nhóm Identity và Brands

Thương hiệu, tài khoản, vai trò và phiên đăng nhập. Vai trò là dữ liệu chứ không phải enum: đổi tập vai trò chỉ cần sửa dữ liệu seed, không cần migration.

### `brands`

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `code` | `character varying(50)` | — |  |  |
| `name` | `character varying(200)` | — |  |  |
| `logo_url` | `text` | có |  |  |
| `description` | `text` | có |  |  |
| `contact_info` | `jsonb` | có |  |  |
| `kiosk_content` | `jsonb` | có |  |  |
| `status` | `brand_status` | — | `'ACTIVE'::brand_status` |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |

**Index**

- `brands_code_key` (UNIQUE) — `USING btree (code)`
- `brands_pkey` (UNIQUE) — `USING btree (id)`

### `users`

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `brand_id` | `uuid` | có |  | NULL với tài khoản mức nền tảng (Platform Super Admin, Operations Staff, Inventory Staff). Brand Admin bắt buộc có giá trị (FR-AUTH-05). |
| `email` | `citext` | — |  |  |
| `password_hash` | `text` | — |  |  |
| `full_name` | `character varying(200)` | — |  |  |
| `status` | `user_status` | — | `'INVITED'::user_status` |  |
| `permission_version` | `integer` | — | `1` | Tăng lên khi vai trò/quyền đổi, để vô hiệu hóa access token đang lưu hành (FR-AUTH-10). |
| `last_login_at` | `timestamp with time zone` | có |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |

**Khóa ngoại**

- `users_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`

**Index**

- `idx_users_brand_status` — `USING btree (brand_id, status)`
- `users_email_key` (UNIQUE) — `USING btree (email)`
- `users_pkey` (UNIQUE) — `USING btree (id)`

### `roles`

Vai trò là dữ liệu, không phải enum — đổi tập vai trò chỉ cần sửa dữ liệu seed, không cần migration (DB_DIAGRAM implementation note #15). MVP có 4 vai trò hệ thống.

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `brand_id` | `uuid` | có |  | NULL với vai trò mức nền tảng/hệ thống. |
| `code` | `character varying(100)` | — |  |  |
| `name` | `character varying(150)` | — |  |  |
| `description` | `text` | có |  |  |
| `is_system` | `boolean` | — | `false` |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |

**Khóa ngoại**

- `roles_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`

**Index**

- `roles_pkey` (UNIQUE) — `USING btree (id)`
- `uq_roles_brand_code` (UNIQUE) — `USING btree (brand_id, code)`

### `permissions`

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `code` | `character varying(150)` | — |  |  |
| `description` | `text` | có |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |

**Index**

- `permissions_code_key` (UNIQUE) — `USING btree (code)`
- `permissions_pkey` (UNIQUE) — `USING btree (id)`

### `user_roles`

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `user_id` | `uuid` | — |  |  |
| `role_id` | `uuid` | — |  |  |
| `scope_type` | `character varying(30)` | — | `'BRAND'::character varying` |  |
| `scope_id` | `uuid` | có |  | Id địa điểm hoặc máy khi scope_type yêu cầu (FR-AUTH-12). NULL với scope PLATFORM/BRAND. |
| `assigned_by` | `uuid` | có |  |  |
| `assigned_at` | `timestamp with time zone` | — | `now()` |  |

**Ràng buộc kiểm tra**

- `chk_user_role_scope_type` — `CHECK (((scope_type)::text = ANY ((ARRAY['PLATFORM'::character varying, 'BRAND'::character varying, 'LOCATION'::character varying, 'MACHINE'::character varying])::text[])))`

**Khóa ngoại**

- `user_roles_assigned_by_fkey` — `FOREIGN KEY (assigned_by) REFERENCES users(id)`
- `user_roles_role_id_fkey` — `FOREIGN KEY (role_id) REFERENCES roles(id)`
- `user_roles_user_id_fkey` — `FOREIGN KEY (user_id) REFERENCES users(id)`

**Index**

- `uq_user_role_scope` (UNIQUE) — `USING btree (user_id, role_id, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))`
- `user_roles_pkey` (UNIQUE) — `USING btree (id)`

### `role_permissions`

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `role_id` | `uuid` | — |  |  |
| `permission_id` | `uuid` | — |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |

**Khóa ngoại**

- `role_permissions_permission_id_fkey` — `FOREIGN KEY (permission_id) REFERENCES permissions(id)`
- `role_permissions_role_id_fkey` — `FOREIGN KEY (role_id) REFERENCES roles(id)`

**Index**

- `role_permissions_pkey` (UNIQUE) — `USING btree (role_id, permission_id)`

### `refresh_sessions`

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `user_id` | `uuid` | — |  |  |
| `token_hash` | `text` | — |  | Chỉ lưu băm của refresh token, không lưu token gốc (NFR-SEC-05). TTL: REFRESH_TOKEN_TTL_DAYS. |
| `ip_address` | `inet` | có |  |  |
| `user_agent` | `text` | có |  |  |
| `expires_at` | `timestamp with time zone` | — |  |  |
| `revoked_at` | `timestamp with time zone` | có |  |  |
| `last_used_at` | `timestamp with time zone` | có |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |

**Khóa ngoại**

- `refresh_sessions_user_id_fkey` — `FOREIGN KEY (user_id) REFERENCES users(id)`

**Index**

- `idx_refresh_sessions_user_expiry` — `USING btree (user_id, expires_at)`
- `refresh_sessions_pkey` (UNIQUE) — `USING btree (id)`
- `refresh_sessions_token_hash_key` (UNIQUE) — `USING btree (token_hash)`

## Nhóm Catalog và Machines

Địa điểm, máy, slot, danh mục sản phẩm và hợp đồng thuê slot. `machines` KHÔNG có `brand_id` — đường duy nhất nối thương hiệu với máy là `slot_rentals` (BR-003, BR-012).

### `locations`

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `code` | `character varying(50)` | — |  |  |
| `name` | `character varying(200)` | — |  |  |
| `address` | `text` | có |  |  |
| `timezone` | `character varying(50)` | — | `'Asia/Ho_Chi_Minh'::character varying` |  |
| `status` | `character varying(30)` | — | `'ACTIVE'::character varying` |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |

**Index**

- `locations_code_key` (UNIQUE) — `USING btree (code)`
- `locations_pkey` (UNIQUE) — `USING btree (id)`

### `fragrance_products`

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `brand_id` | `uuid` | — |  |  |
| `sku` | `character varying(100)` | — |  |  |
| `name` | `character varying(200)` | — |  |  |
| `description` | `text` | có |  |  |
| `fragrance_notes` | `jsonb` | có |  |  |
| `image_url` | `text` | có |  |  |
| `product_url` | `text` | có |  |  |
| `default_price` | `numeric(19,4)` | — |  | Giá gợi ý mỗi lượt xịt, dùng làm gợi ý khi Brand Admin đặt giá slot (FR-PRD-04). Giá thực tế nằm ở slot_rentals.price_per_spray. |
| `currency` | `character(3)` | — | `'VND'::bpchar` |  |
| `full_bottle_retail_price` | `numeric(19,4)` | có |  | Giá bán lẻ một chai đầy, dùng tính phí lưu kho thời gian ân hạn (FR-PRD-05, FR-EXP-10). |
| `full_bottle_volume_ml` | `numeric(14,4)` | có |  |  |
| `status` | `character varying(30)` | — | `'ACTIVE'::character varying` |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |
| `deleted_at` | `timestamp with time zone` | có |  |  |

**Ràng buộc kiểm tra**

- `chk_product_price_nonnegative` — `CHECK ((default_price >= (0)::numeric))`
- `chk_product_retail_price_nonnegative` — `CHECK (((full_bottle_retail_price IS NULL) OR (full_bottle_retail_price >= (0)::numeric)))`
- `chk_product_volume_nonnegative` — `CHECK (((full_bottle_volume_ml IS NULL) OR (full_bottle_volume_ml >= (0)::numeric)))`

**Khóa ngoại**

- `fragrance_products_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`

**Index**

- `fragrance_products_pkey` (UNIQUE) — `USING btree (id)`
- `uq_product_id_brand` (UNIQUE) — `USING btree (id, brand_id)`
- `uq_products_brand_sku` (UNIQUE) — `USING btree (brand_id, sku)`

### `machines`

Máy thuộc nền tảng, KHÔNG có brand_id. Một máy chứa slot của nhiều thương hiệu; quan hệ thương hiệu ↔ máy đi qua slot_rentals (BR-003, BR-012, spec/PROJECT.md §3).

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `location_id` | `uuid` | — |  |  |
| `serial_number` | `character varying(100)` | — |  |  |
| `display_name` | `character varying(200)` | — |  |  |
| `status` | `machine_connection_status` | — | `'OFFLINE'::machine_connection_status` | Trục kết nối, suy ra từ heartbeat (FR-MCH-08, FR-IOT-01..03). Độc lập với operating_mode. |
| `operating_mode` | `machine_operating_mode` | — | `'NORMAL'::machine_operating_mode` | Trục chế độ, do người vận hành đặt (FR-MCH-09, FR-MNT-05/12). Độc lập với status. |
| `last_seen_at` | `timestamp with time zone` | có |  |  |
| `firmware_version` | `character varying(100)` | có |  |  |
| `configuration_version` | `integer` | — | `1` |  |
| `simulator_enabled` | `boolean` | — | `false` |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |

**Khóa ngoại**

- `machines_location_id_fkey` — `FOREIGN KEY (location_id) REFERENCES locations(id)`

**Index**

- `idx_machines_last_seen` — `USING btree (last_seen_at)`
- `idx_machines_location_status` — `USING btree (location_id, status)`
- `machines_pkey` (UNIQUE) — `USING btree (id)`
- `machines_serial_number_key` (UNIQUE) — `USING btree (serial_number)`

### `machine_slots`

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `machine_id` | `uuid` | — |  |  |
| `slot_number` | `integer` | — |  |  |
| `active_bottle_id` | `uuid` | có |  | Chai đang lắp ở slot. Một slot tối đa một chai do chính cardinality của cột; chiều ngược lại (một chai không lắp ở hai slot) do uq_slot_active_bottle chặn (FR-MCH-07, ADR-0002). |
| `calibrated_dosage_ml` | `numeric(10,4)` | có |  |  |
| `low_stock_threshold_ml` | `numeric(14,4)` | có |  |  |
| `estimated_remaining_ml` | `numeric(14,4)` | — | `0` |  |
| `estimated_remaining_sprays` | `integer` | — | `0` |  |
| `status` | `slot_status` | — | `'DISABLED'::slot_status` |  |
| `version` | `integer` | — | `1` | Optimistic locking cho thao tác đồng thời trên slot. |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |

**Ràng buộc kiểm tra**

- `chk_slot_number_positive` — `CHECK ((slot_number > 0))`
- `chk_slot_remaining_ml_nonnegative` — `CHECK ((estimated_remaining_ml >= (0)::numeric))`
- `chk_slot_remaining_sprays_nonnegative` — `CHECK ((estimated_remaining_sprays >= 0))`

**Khóa ngoại**

- `fk_slot_active_bottle` — `FOREIGN KEY (active_bottle_id) REFERENCES bottles(id)`
- `machine_slots_machine_id_fkey` — `FOREIGN KEY (machine_id) REFERENCES machines(id)`

**Index**

- `idx_slots_machine_status` — `USING btree (machine_id, status)`
- `machine_slots_pkey` (UNIQUE) — `USING btree (id)`
- `uq_slot_active_bottle` (UNIQUE) — `USING btree (active_bottle_id) WHERE (active_bottle_id IS NOT NULL)`
- `uq_slot_machine_number` (UNIQUE) — `USING btree (machine_id, slot_number)`

### `machine_status_histories`

Một hàng cho mỗi lần chuyển. Thay đổi kết nối (FR-MCH-08, FR-IOT-02/03) điền cặp *_connection_status và để trống cặp *_operating_mode; thay đổi chế độ (FR-MCH-09, FR-MNT-05/12) làm ngược lại (FR-MCH-13).

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `machine_id` | `uuid` | — |  |  |
| `from_connection_status` | `machine_connection_status` | có |  |  |
| `to_connection_status` | `machine_connection_status` | có |  |  |
| `from_operating_mode` | `machine_operating_mode` | có |  |  |
| `to_operating_mode` | `machine_operating_mode` | có |  |  |
| `reason` | `text` | có |  |  |
| `source` | `character varying(30)` | — |  |  |
| `changed_by` | `uuid` | có |  |  |
| `occurred_at` | `timestamp with time zone` | — | `now()` |  |

**Khóa ngoại**

- `machine_status_histories_changed_by_fkey` — `FOREIGN KEY (changed_by) REFERENCES users(id)`
- `machine_status_histories_machine_id_fkey` — `FOREIGN KEY (machine_id) REFERENCES machines(id)`

**Index**

- `idx_machine_status_hist` — `USING btree (machine_id, occurred_at)`
- `machine_status_histories_pkey` (UNIQUE) — `USING btree (id)`

### `slot_rental_requests`

Yêu cầu thuê slot do Brand Admin tự gửi (FR-SLT-19 đến FR-SLT-26). Một hàng cho một slot — thương hiệu muốn thuê nhiều slot thì gửi nhiều hàng.

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `slot_id` | `uuid` | — |  |  |
| `brand_id` | `uuid` | — |  |  |
| `requested_by` | `uuid` | — |  |  |
| `desired_starts_at` | `timestamp with time zone` | — |  |  |
| `desired_ends_at` | `timestamp with time zone` | — |  |  |
| `status` | `slot_rental_request_status` | — | `'REQUESTED'::slot_rental_request_status` |  |
| `reviewed_by` | `uuid` | có |  |  |
| `reviewed_at` | `timestamp with time zone` | có |  |  |
| `rejection_reason` | `text` | có |  |  |
| `resulting_rental_id` | `uuid` | có |  | Đặt khi yêu cầu được duyệt và hợp đồng DRAFT được tạo tự động (FR-SLT-23). |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |

**Ràng buộc kiểm tra**

- `chk_request_period` — `CHECK ((desired_ends_at > desired_starts_at))`

**Khóa ngoại**

- `fk_request_resulting_rental` — `FOREIGN KEY (resulting_rental_id) REFERENCES slot_rentals(id)`
- `slot_rental_requests_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `slot_rental_requests_requested_by_fkey` — `FOREIGN KEY (requested_by) REFERENCES users(id)`
- `slot_rental_requests_reviewed_by_fkey` — `FOREIGN KEY (reviewed_by) REFERENCES users(id)`
- `slot_rental_requests_slot_id_fkey` — `FOREIGN KEY (slot_id) REFERENCES machine_slots(id)`

**Index**

- `idx_rental_requests_brand` — `USING btree (brand_id, status, created_at)`
- `idx_rental_requests_slot` — `USING btree (slot_id, status)`
- `slot_rental_requests_pkey` (UNIQUE) — `USING btree (id)`
- `uq_slot_rental_request_open` (UNIQUE) — `USING btree (slot_id) WHERE (status = ANY (ARRAY['REQUESTED'::slot_rental_request_status, 'APPROVED'::slot_rental_request_status]))`

### `slot_rentals`

Một hợp đồng ứng với đúng một slot. Thương hiệu thuê 3 slot có 3 hợp đồng độc lập (BR-009). Đây là đường duy nhất nối thương hiệu với máy.

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `slot_id` | `uuid` | — |  |  |
| `brand_id` | `uuid` | — |  |  |
| `fragrance_product_id` | `uuid` | có |  | Nullable ở tầng CSDL CHỈ để cho phép cửa sổ DRAFT giữa FR-SLT-23 (tạo hợp đồng tự động) và FR-SLT-27 (Brand Admin gán sản phẩm). Domain service phải chặn tạo đơn khi cột này NULL (FR-SLT-29). Xem §13. |
| `product_assigned_at` | `timestamp with time zone` | có |  |  |
| `request_id` | `uuid` | có |  |  |
| `previous_rental_id` | `uuid` | có |  | Hợp đồng liền trước khi đây là hợp đồng gia hạn (FR-SLT-12). |
| `status` | `slot_rental_status` | — | `'DRAFT'::slot_rental_status` |  |
| `starts_at` | `timestamp with time zone` | — |  |  |
| `ends_at` | `timestamp with time zone` | — |  |  |
| `grace_ends_at` | `timestamp with time zone` | có |  | Ngày kết thúc ân hạn do Platform Super Admin ấn định (FR-EXP-07). |
| `price_per_spray` | `numeric(19,4)` | — |  |  |
| `currency` | `character(3)` | — | `'VND'::bpchar` |  |
| `fixed_fee` | `numeric(19,4)` | — | `0` |  |
| `revenue_share_percent` | `numeric(5,2)` | — | `0` |  |
| `terminated_reason` | `text` | có |  |  |
| `created_by` | `uuid` | — |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |

**Ràng buộc kiểm tra**

- `chk_rental_fee_nonnegative` — `CHECK ((fixed_fee >= (0)::numeric))`
- `chk_rental_period` — `CHECK ((ends_at > starts_at))`
- `chk_rental_price_nonnegative` — `CHECK ((price_per_spray >= (0)::numeric))`
- `chk_revenue_share_percent` — `CHECK (((revenue_share_percent >= (0)::numeric) AND (revenue_share_percent <= (100)::numeric)))`
- `excl_slot_rental_overlap` — `EXCLUDE USING gist (slot_id WITH =, tstzrange(starts_at, ends_at, '[)'::text) WITH &&) WHERE ((status = ANY (ARRAY['DRAFT'::slot_rental_status, 'ACTIVE'::slot_rental_status, 'EXPIRING'::slot_rental_status, 'GRACE'::slot_rental_status, 'LIQUIDATED'::slot_rental_status])))`

**Khóa ngoại**

- `fk_rental_product_same_brand` — `FOREIGN KEY (fragrance_product_id, brand_id) REFERENCES fragrance_products(id, brand_id)` — *ràng buộc cùng thương hiệu*
- `slot_rentals_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `slot_rentals_created_by_fkey` — `FOREIGN KEY (created_by) REFERENCES users(id)`
- `slot_rentals_fragrance_product_id_fkey` — `FOREIGN KEY (fragrance_product_id) REFERENCES fragrance_products(id)`
- `slot_rentals_previous_rental_id_fkey` — `FOREIGN KEY (previous_rental_id) REFERENCES slot_rentals(id)`
- `slot_rentals_request_id_fkey` — `FOREIGN KEY (request_id) REFERENCES slot_rental_requests(id)`
- `slot_rentals_slot_id_fkey` — `FOREIGN KEY (slot_id) REFERENCES machine_slots(id)`

**Index**

- `excl_slot_rental_overlap` — `USING gist (slot_id, tstzrange(starts_at, ends_at, '[)'::text)) WHERE (status = ANY (ARRAY['DRAFT'::slot_rental_status, 'ACTIVE'::slot_rental_status, 'EXPIRING'::slot_rental_status, 'GRACE'::slot_rental_status, 'LIQUIDATED'::slot_rental_status]))`
- `idx_rentals_brand` — `USING btree (brand_id, status, starts_at)`
- `idx_rentals_product` — `USING btree (fragrance_product_id, status)`
- `idx_rentals_slot` — `USING btree (slot_id, starts_at, ends_at)`
- `slot_rentals_pkey` (UNIQUE) — `USING btree (id)`
- `uq_rental_id_brand` (UNIQUE) — `USING btree (id, brand_id)`
- `uq_slot_active_rental` (UNIQUE) — `USING btree (slot_id) WHERE (status = ANY (ARRAY['ACTIVE'::slot_rental_status, 'EXPIRING'::slot_rental_status, 'GRACE'::slot_rental_status, 'LIQUIDATED'::slot_rental_status]))`

## Nhóm Inventory

Khai báo gửi hàng, lô nhập, chai, phiên nạp và điều chỉnh tồn kho. `refill_sessions` chính là phiếu nạp của FR-INV-29..31, không phải một bảng riêng.

### `brand_shipment_declarations`

Brand Admin khai báo lô hàng gửi đến kho nền tảng; Inventory Staff đối chiếu khi nhận (FR-INV-22 đến FR-INV-28). Lô sinh ra trỏ ngược về đây qua inventory_batches.source_declaration_id.

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `brand_id` | `uuid` | — |  |  |
| `fragrance_product_id` | `uuid` | — |  |  |
| `declared_quantity` | `integer` | — |  |  |
| `declared_bottle_volume_ml` | `numeric(14,4)` | — |  |  |
| `expected_ship_date` | `date` | có |  |  |
| `status` | `shipment_declaration_status` | — | `'DECLARED'::shipment_declaration_status` |  |
| `received_quantity` | `integer` | có |  |  |
| `discrepancy_notes` | `text` | có |  | Bắt buộc khi received_quantity khác declared_quantity (FR-INV-25). |
| `received_by` | `uuid` | có |  |  |
| `received_at` | `timestamp with time zone` | có |  |  |
| `declared_by` | `uuid` | — |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |

**Ràng buộc kiểm tra**

- `chk_declared_quantity_positive` — `CHECK ((declared_quantity > 0))`

**Khóa ngoại**

- `brand_shipment_declarations_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `brand_shipment_declarations_declared_by_fkey` — `FOREIGN KEY (declared_by) REFERENCES users(id)`
- `brand_shipment_declarations_fragrance_product_id_fkey` — `FOREIGN KEY (fragrance_product_id) REFERENCES fragrance_products(id)`
- `brand_shipment_declarations_received_by_fkey` — `FOREIGN KEY (received_by) REFERENCES users(id)`

**Index**

- `brand_shipment_declarations_pkey` (UNIQUE) — `USING btree (id)`
- `idx_shipment_decl_brand` — `USING btree (brand_id, status, created_at)`

### `inventory_batches`

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `brand_id` | `uuid` | — |  |  |
| `fragrance_product_id` | `uuid` | — |  |  |
| `source_declaration_id` | `uuid` | có |  | Đặt khi lô được tạo tự động từ khai báo gửi hàng đã nhận (FR-INV-26); NULL với lô nhập thủ công. |
| `batch_number` | `character varying(100)` | — |  |  |
| `received_at` | `timestamp with time zone` | — |  |  |
| `expires_at` | `timestamp with time zone` | có |  |  |
| `quantity_received` | `integer` | — |  |  |
| `supplier_info` | `jsonb` | có |  |  |
| `created_by` | `uuid` | — |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |

**Ràng buộc kiểm tra**

- `chk_batch_quantity_positive` — `CHECK ((quantity_received > 0))`

**Khóa ngoại**

- `fk_batch_product_same_brand` — `FOREIGN KEY (fragrance_product_id, brand_id) REFERENCES fragrance_products(id, brand_id)` — *ràng buộc cùng thương hiệu*
- `inventory_batches_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `inventory_batches_created_by_fkey` — `FOREIGN KEY (created_by) REFERENCES users(id)`
- `inventory_batches_fragrance_product_id_fkey` — `FOREIGN KEY (fragrance_product_id) REFERENCES fragrance_products(id)`
- `inventory_batches_source_declaration_id_fkey` — `FOREIGN KEY (source_declaration_id) REFERENCES brand_shipment_declarations(id)`

**Index**

- `inventory_batches_pkey` (UNIQUE) — `USING btree (id)`
- `uq_batch_brand_product_number` (UNIQUE) — `USING btree (brand_id, fragrance_product_id, batch_number)`
- `uq_batch_id_brand` (UNIQUE) — `USING btree (id, brand_id)`

### `bottles`

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `brand_id` | `uuid` | — |  | Thương hiệu gốc, bất biến để phục vụ kiểm toán kể cả sau khi quyền sở hữu chuyển về nền tảng. |
| `owner` | `revenue_owner_type` | — | `'BRAND'::revenue_owner_type` | Chủ sở hữu hiện tại. Lật sang PLATFORM khi thanh lý (FR-EXP-15). Đây mới là cột quyết định quyền sở hữu, không phải brand_id. |
| `batch_id` | `uuid` | — |  |  |
| `fragrance_product_id` | `uuid` | — |  |  |
| `identifier` | `character varying(150)` | — |  |  |
| `status` | `bottle_status` | — | `'IN_STOCK'::bottle_status` |  |
| `initial_volume_ml` | `numeric(14,4)` | — |  |  |
| `current_estimated_ml` | `numeric(14,4)` | — |  |  |
| `empty_weight_g` | `numeric(14,4)` | có |  |  |
| `initial_measured_weight_g` | `numeric(14,4)` | có |  |  |
| `current_measured_weight_g` | `numeric(14,4)` | có |  |  |
| `opened_at` | `timestamp with time zone` | có |  |  |
| `installed_at` | `timestamp with time zone` | có |  |  |
| `removed_at` | `timestamp with time zone` | có |  |  |
| `expires_at` | `timestamp with time zone` | có |  |  |
| `source_rental_id` | `uuid` | có |  | Hợp đồng mà chai đang phục vụ tại thời điểm thanh lý (FR-EXP-16). |
| `liquidated_at` | `timestamp with time zone` | có |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |

**Ràng buộc kiểm tra**

- `chk_bottle_current_nonnegative` — `CHECK ((current_estimated_ml >= (0)::numeric))`
- `chk_bottle_initial_nonnegative` — `CHECK ((initial_volume_ml >= (0)::numeric))`

**Khóa ngoại**

- `bottles_batch_id_fkey` — `FOREIGN KEY (batch_id) REFERENCES inventory_batches(id)`
- `bottles_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `bottles_fragrance_product_id_fkey` — `FOREIGN KEY (fragrance_product_id) REFERENCES fragrance_products(id)`
- `bottles_source_rental_id_fkey` — `FOREIGN KEY (source_rental_id) REFERENCES slot_rentals(id)`
- `fk_bottle_batch_same_brand` — `FOREIGN KEY (batch_id, brand_id) REFERENCES inventory_batches(id, brand_id)` — *ràng buộc cùng thương hiệu*

**Index**

- `bottles_pkey` (UNIQUE) — `USING btree (id)`
- `idx_bottles_batch` — `USING btree (batch_id)`
- `idx_bottles_brand_status_expiry` — `USING btree (brand_id, status, expires_at)`
- `uq_bottle_brand_identifier` (UNIQUE) — `USING btree (brand_id, identifier)`

### `refill_sessions`

Hàng này CHÍNH LÀ phiếu nạp. status=STARTED/started_at = mở phiếu (FR-INV-29); status=COMPLETED/completed_at = đóng phiếu (FR-INV-31). Trong lúc STARTED, cảnh báo cửa mở quá hạn (FR-ALR-03) phải bị tạm ngưng cho máy/slot này (FR-INV-30) — xem §13.

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `brand_id` | `uuid` | — |  |  |
| `machine_id` | `uuid` | — |  |  |
| `slot_id` | `uuid` | — |  |  |
| `old_bottle_id` | `uuid` | có |  |  |
| `new_bottle_id` | `uuid` | có |  | Nullable vì phiếu được mở trước khi chọn chai thay thế (FR-INV-29). Domain service phải bảo đảm NOT NULL trước khi status chuyển COMPLETED — xem §13. |
| `performed_by` | `uuid` | — |  |  |
| `status` | `refill_status` | — | `'STARTED'::refill_status` |  |
| `checklist_completed` | `boolean` | — | `false` | Cổng chặn của FR-INV-14: phải true trước khi đóng phiếu. |
| `before_weight_g` | `numeric(14,4)` | có |  |  |
| `after_weight_g` | `numeric(14,4)` | có |  |  |
| `notes` | `text` | có |  |  |
| `started_at` | `timestamp with time zone` | — | `now()` |  |
| `completed_at` | `timestamp with time zone` | có |  |  |

**Khóa ngoại**

- `refill_sessions_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `refill_sessions_machine_id_fkey` — `FOREIGN KEY (machine_id) REFERENCES machines(id)`
- `refill_sessions_new_bottle_id_fkey` — `FOREIGN KEY (new_bottle_id) REFERENCES bottles(id)`
- `refill_sessions_old_bottle_id_fkey` — `FOREIGN KEY (old_bottle_id) REFERENCES bottles(id)`
- `refill_sessions_performed_by_fkey` — `FOREIGN KEY (performed_by) REFERENCES users(id)`
- `refill_sessions_slot_id_fkey` — `FOREIGN KEY (slot_id) REFERENCES machine_slots(id)`

**Index**

- `idx_refill_sessions_brand_machine` — `USING btree (brand_id, machine_id, started_at)`
- `refill_sessions_pkey` (UNIQUE) — `USING btree (id)`

### `inventory_adjustments`

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `brand_id` | `uuid` | — |  |  |
| `bottle_id` | `uuid` | — |  |  |
| `slot_id` | `uuid` | có |  |  |
| `before_quantity_ml` | `numeric(14,4)` | — |  |  |
| `after_quantity_ml` | `numeric(14,4)` | — |  |  |
| `difference_ml` | `numeric(14,4)` | — |  |  |
| `reason` | `text` | — |  | NOT NULL: lý do là bắt buộc (FR-INV-16, lỗi ADJUSTMENT_REASON_REQUIRED). |
| `adjusted_by` | `uuid` | — |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |

**Ràng buộc kiểm tra**

- `chk_adjust_after_nonnegative` — `CHECK ((after_quantity_ml >= (0)::numeric))`
- `chk_adjust_before_nonnegative` — `CHECK ((before_quantity_ml >= (0)::numeric))`

**Khóa ngoại**

- `inventory_adjustments_adjusted_by_fkey` — `FOREIGN KEY (adjusted_by) REFERENCES users(id)`
- `inventory_adjustments_bottle_id_fkey` — `FOREIGN KEY (bottle_id) REFERENCES bottles(id)`
- `inventory_adjustments_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `inventory_adjustments_slot_id_fkey` — `FOREIGN KEY (slot_id) REFERENCES machine_slots(id)`

**Index**

- `idx_adjustments_brand_bottle` — `USING btree (brand_id, bottle_id, created_at)`
- `inventory_adjustments_pkey` (UNIQUE) — `USING btree (id)`

## Nhóm Orders và Payments

Đơn hàng, thanh toán, lệnh xịt và tương tác kiosk. Ba ràng buộc duy nhất ở nhóm này (`uq_payment_event`, `uq_order_active_command`, `dispense_results.command_id`) là toàn bộ cơ chế giữ cho BR-002 "một giao dịch một lượt xịt" đúng.

### `orders`

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `brand_id` | `uuid` | — |  | Thương hiệu sở hữu sản phẩm trong danh mục tại thời điểm tạo đơn — LUÔN có giá trị, kể cả với đơn phát sinh sau thanh lý (khi đó revenue_owner = PLATFORM). Quyền sở hữu tiền nằm ở revenue_owner, KHÔNG phải cột này. Màn hình của Brand Admin (FR-EXP-20, FR-REV-06) phải lọc theo revenue_owner = BRAND, không bao giờ chỉ theo brand_id. |
| `slot_rental_id` | `uuid` | — |  |  |
| `revenue_owner` | `revenue_owner_type` | — |  | Ảnh chụp bất biến tại thời điểm tạo đơn: BRAND hoặc PLATFORM (FR-REV-01/02/03). Không có đường cập nhật (NFR-DAT-06). |
| `machine_id` | `uuid` | — |  |  |
| `slot_id` | `uuid` | — |  |  |
| `fragrance_product_id` | `uuid` | — |  |  |
| `product_name_snapshot` | `character varying(200)` | — |  |  |
| `amount` | `numeric(19,4)` | — |  | Giá đã chụp tại thời điểm tạo đơn; đổi giá slot sau đó không ảnh hưởng đơn này (FR-ORD-06, FR-SLT-09). Không có đường cập nhật (NFR-DAT-06). |
| `currency` | `character(3)` | — |  |  |
| `status` | `order_status` | — | `'CREATED'::order_status` |  |
| `payment_reference` | `character varying(150)` | — |  |  |
| `idempotency_key` | `character varying(150)` | — |  |  |
| `expires_at` | `timestamp with time zone` | — |  | created_at + ORDER_PAYMENT_TTL_SEC (FR-ORD-09). |
| `paid_at` | `timestamp with time zone` | có |  |  |
| `dispensed_at` | `timestamp with time zone` | có |  |  |
| `failure_code` | `character varying(100)` | có |  |  |
| `needs_manual_review` | `boolean` | — | `false` | Đặt true khi đã thanh toán nhưng lượt xịt thất bại hoặc không xác định (FR-ORD-19). Dẫn vào luồng hoàn tiền và hỗ trợ (FR-ORD-20/21). |
| `manual_review_resolved_by` | `uuid` | có |  |  |
| `manual_review_resolved_at` | `timestamp with time zone` | có |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |

**Ràng buộc kiểm tra**

- `chk_order_amount_nonnegative` — `CHECK ((amount >= (0)::numeric))`

**Khóa ngoại**

- `fk_order_rental_same_brand` — `FOREIGN KEY (slot_rental_id, brand_id) REFERENCES slot_rentals(id, brand_id)` — *ràng buộc cùng thương hiệu*
- `orders_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `orders_fragrance_product_id_fkey` — `FOREIGN KEY (fragrance_product_id) REFERENCES fragrance_products(id)`
- `orders_machine_id_fkey` — `FOREIGN KEY (machine_id) REFERENCES machines(id)`
- `orders_manual_review_resolved_by_fkey` — `FOREIGN KEY (manual_review_resolved_by) REFERENCES users(id)`
- `orders_slot_id_fkey` — `FOREIGN KEY (slot_id) REFERENCES machine_slots(id)`
- `orders_slot_rental_id_fkey` — `FOREIGN KEY (slot_rental_id) REFERENCES slot_rentals(id)`

**Index**

- `idx_orders_brand` — `USING btree (brand_id, created_at)`
- `idx_orders_brand_status` — `USING btree (brand_id, status, created_at)`
- `idx_orders_machine` — `USING btree (machine_id, created_at)`
- `idx_orders_rental` — `USING btree (slot_rental_id)`
- `idx_orders_slot` — `USING btree (slot_id)`
- `orders_idempotency_key_key` (UNIQUE) — `USING btree (idempotency_key)`
- `orders_payment_reference_key` (UNIQUE) — `USING btree (payment_reference)`
- `orders_pkey` (UNIQUE) — `USING btree (id)`

### `order_status_histories`

Toàn bộ lịch sử chuyển trạng thái đơn (FR-ORD-18).

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `brand_id` | `uuid` | — |  |  |
| `order_id` | `uuid` | — |  |  |
| `from_status` | `order_status` | có |  |  |
| `to_status` | `order_status` | — |  |  |
| `reason` | `text` | có |  |  |
| `metadata` | `jsonb` | có |  |  |
| `actor_type` | `character varying(30)` | — |  |  |
| `actor_id` | `uuid` | có |  |  |
| `occurred_at` | `timestamp with time zone` | — | `now()` |  |

**Khóa ngoại**

- `order_status_histories_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `order_status_histories_order_id_fkey` — `FOREIGN KEY (order_id) REFERENCES orders(id)`

**Index**

- `idx_order_status_hist` — `USING btree (order_id, occurred_at)`
- `order_status_histories_pkey` (UNIQUE) — `USING btree (id)`

### `payments`

Không lưu bất kỳ thông tin thẻ hay tài khoản ngân hàng nào của khách (NFR-DAT-04). raw_response chỉ chứa phản hồi của cổng thanh toán đã loại dữ liệu nhạy cảm.

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `brand_id` | `uuid` | — |  |  |
| `order_id` | `uuid` | — |  |  |
| `provider` | `character varying(50)` | — |  |  |
| `provider_transaction_id` | `character varying(200)` | có |  |  |
| `provider_reference` | `character varying(200)` | có |  |  |
| `amount` | `numeric(19,4)` | — |  |  |
| `currency` | `character(3)` | — |  |  |
| `status` | `payment_status` | — | `'PENDING'::payment_status` |  |
| `raw_response` | `jsonb` | có |  |  |
| `paid_at` | `timestamp with time zone` | có |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |

**Ràng buộc kiểm tra**

- `chk_payment_amount_nonnegative` — `CHECK ((amount >= (0)::numeric))`

**Khóa ngoại**

- `payments_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `payments_order_id_fkey` — `FOREIGN KEY (order_id) REFERENCES orders(id)`

**Index**

- `idx_payments_brand_status` — `USING btree (brand_id, status, created_at)`
- `idx_payments_order` — `USING btree (order_id)`
- `payments_pkey` (UNIQUE) — `USING btree (id)`
- `uq_payment_provider_txn` (UNIQUE) — `USING btree (provider, provider_transaction_id) WHERE (provider_transaction_id IS NOT NULL)`

### `payment_events`

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `brand_id` | `uuid` | có |  | NULL khi webhook không khớp được với payment/order nào (chữ ký sai, mã tham chiếu lạ) — vẫn ghi lại để rà soát bảo mật (FR-ORD-13/14). |
| `payment_id` | `uuid` | có |  |  |
| `provider` | `character varying(50)` | — |  |  |
| `provider_event_id` | `character varying(200)` | — |  |  |
| `payload_hash` | `character varying(128)` | — |  |  |
| `signature_valid` | `boolean` | — |  |  |
| `payload` | `jsonb` | — |  |  |
| `processing_result` | `character varying(50)` | có |  |  |
| `received_at` | `timestamp with time zone` | — | `now()` |  |
| `processed_at` | `timestamp with time zone` | có |  |  |

**Khóa ngoại**

- `payment_events_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `payment_events_payment_id_fkey` — `FOREIGN KEY (payment_id) REFERENCES payments(id)`

**Index**

- `idx_payment_events_brand` — `USING btree (brand_id, received_at)`
- `idx_payment_events_payment` — `USING btree (payment_id)`
- `payment_events_pkey` (UNIQUE) — `USING btree (id)`
- `uq_payment_event` (UNIQUE) — `USING btree (provider, provider_event_id)`

### `dispense_commands`

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `brand_id` | `uuid` | có |  | Có giá trị với lệnh CUSTOMER (chép từ đơn). NULL với lệnh DIAGNOSTIC chạy trên slot chưa có hợp đồng nào. |
| `order_id` | `uuid` | có |  |  |
| `machine_id` | `uuid` | — |  |  |
| `slot_id` | `uuid` | — |  |  |
| `command_type` | `dispense_type` | — |  |  |
| `command_token` | `character varying(255)` | — |  | Mã lệnh duy nhất toàn hệ thống (FR-DSP-02). Thiết bị lưu lại để từ chối lệnh trùng (FR-DSP-10, lỗi CMD_DUPLICATE). |
| `signature` | `text` | — |  |  |
| `status` | `command_status` | — | `'CREATED'::command_status` |  |
| `expires_at` | `timestamp with time zone` | — |  | created_at + DISPENSE_CMD_TTL_SEC (FR-DSP-06). |
| `sent_at` | `timestamp with time zone` | có |  |  |
| `acknowledged_at` | `timestamp with time zone` | có |  |  |
| `completed_at` | `timestamp with time zone` | có |  |  |
| `retry_count` | `integer` | — | `0` |  |
| `created_by` | `uuid` | có |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |

**Ràng buộc kiểm tra**

- `chk_command_retry_nonnegative` — `CHECK ((retry_count >= 0))`

**Khóa ngoại**

- `dispense_commands_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `dispense_commands_created_by_fkey` — `FOREIGN KEY (created_by) REFERENCES users(id)`
- `dispense_commands_machine_id_fkey` — `FOREIGN KEY (machine_id) REFERENCES machines(id)`
- `dispense_commands_order_id_fkey` — `FOREIGN KEY (order_id) REFERENCES orders(id)`
- `dispense_commands_slot_id_fkey` — `FOREIGN KEY (slot_id) REFERENCES machine_slots(id)`

**Index**

- `dispense_commands_command_token_key` (UNIQUE) — `USING btree (command_token)`
- `dispense_commands_pkey` (UNIQUE) — `USING btree (id)`
- `idx_commands_machine` — `USING btree (machine_id, created_at)`
- `uq_order_active_command` (UNIQUE) — `USING btree (order_id) WHERE ((order_id IS NOT NULL) AND (command_type = 'CUSTOMER'::dispense_type) AND (status = ANY (ARRAY['CREATED'::command_status, 'SENT'::command_status, 'ACKNOWLEDGED'::command_status])))`

### `dispense_results`

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `brand_id` | `uuid` | có |  |  |
| `command_id` | `uuid` | — |  |  |
| `success` | `boolean` | — |  |  |
| `result_code` | `character varying(100)` | có |  |  |
| `failure_code` | `character varying(100)` | có |  | Chỉ dùng mã trong spec/errors.md §"Lệnh xịt": CMD_INVALID_SIGNATURE, CMD_EXPIRED, CMD_WRONG_MACHINE, CMD_DUPLICATE, DOOR_OPEN, SLOT_EMPTY, ACTUATOR_FAULT, HARD_TIMEOUT, NO_CURRENT. |
| `executed_at` | `timestamp with time zone` | có |  |  |
| `received_at` | `timestamp with time zone` | — | `now()` |  |
| `measured_quantity_ml` | `numeric(10,4)` | có |  |  |
| `sensor_snapshot` | `jsonb` | có |  |  |
| `raw_payload` | `jsonb` | có |  |  |
| `device_event_id` | `character varying(150)` | có |  |  |

**Khóa ngoại**

- `dispense_results_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `dispense_results_command_id_fkey` — `FOREIGN KEY (command_id) REFERENCES dispense_commands(id)`

**Index**

- `dispense_results_command_id_key` (UNIQUE) — `USING btree (command_id)`
- `dispense_results_pkey` (UNIQUE) — `USING btree (id)`
- `idx_results_brand` — `USING btree (brand_id, received_at)`

### `kiosk_interaction_events`

Nguồn dữ liệu cho xếp hạng sản phẩm theo mức độ quan tâm (FR-RPT-06, BR-007).

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `event_id` | `character varying(150)` | — |  |  |
| `event_type` | `kiosk_interaction_type` | — |  |  |
| `brand_id` | `uuid` | — |  |  |
| `slot_rental_id` | `uuid` | — |  |  |
| `machine_id` | `uuid` | — |  |  |
| `slot_id` | `uuid` | — |  |  |
| `fragrance_product_id` | `uuid` | — |  |  |
| `kiosk_session_id` | `uuid` | — |  | Phiên ẩn danh, xoay vòng — KHÔNG chứa bất kỳ định danh khách hàng nào. |
| `occurred_at` | `timestamp with time zone` | — |  |  |
| `received_at` | `timestamp with time zone` | — | `now()` |  |

**Khóa ngoại**

- `fk_kiosk_event_rental_same_brand` — `FOREIGN KEY (slot_rental_id, brand_id) REFERENCES slot_rentals(id, brand_id)` — *ràng buộc cùng thương hiệu*
- `kiosk_interaction_events_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `kiosk_interaction_events_fragrance_product_id_fkey` — `FOREIGN KEY (fragrance_product_id) REFERENCES fragrance_products(id)`
- `kiosk_interaction_events_machine_id_fkey` — `FOREIGN KEY (machine_id) REFERENCES machines(id)`
- `kiosk_interaction_events_slot_id_fkey` — `FOREIGN KEY (slot_id) REFERENCES machine_slots(id)`
- `kiosk_interaction_events_slot_rental_id_fkey` — `FOREIGN KEY (slot_rental_id) REFERENCES slot_rentals(id)`

**Index**

- `idx_kiosk_events_brand` — `USING btree (brand_id, occurred_at)`
- `idx_kiosk_events_machine` — `USING btree (machine_id, event_type, occurred_at)`
- `idx_kiosk_events_product` — `USING btree (fragrance_product_id, event_type, occurred_at)`
- `idx_kiosk_events_rental` — `USING btree (slot_rental_id, event_type, occurred_at)`
- `kiosk_interaction_events_event_id_key` (UNIQUE) — `USING btree (event_id)`
- `kiosk_interaction_events_pkey` (UNIQUE) — `USING btree (id)`

## Nhóm Operations

Cảnh báo, bảo trì, yêu cầu bổ sung, thông báo và nhật ký kiểm toán. `alerts.brand_id` và `maintenance_tickets.brand_id` gần như luôn NULL — danh sách thương hiệu bị ảnh hưởng suy ra lúc đọc bằng join `slot_rentals` (FR-ALR-09, FR-MNT-07).

### `alerts`

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `brand_id` | `uuid` | có |  | CHỈ có giá trị với cảnh báo mức slot, khi biết chắc một thương hiệu (vd FR-ALR-02). NULL với cảnh báo mức máy (FR-ALR-01/03/05) vì có thể ảnh hưởng nhiều thương hiệu cùng lúc — FR-ALR-09 suy ra danh sách thương hiệu bị ảnh hưởng lúc đọc, bằng cách join slot_rentals đang hiệu lực của máy, KHÔNG lấy từ cột này. |
| `machine_id` | `uuid` | — |  |  |
| `slot_id` | `uuid` | có |  |  |
| `type` | `character varying(80)` | — |  |  |
| `severity` | `alert_severity` | — |  |  |
| `status` | `alert_status` | — | `'OPEN'::alert_status` |  |
| `deduplication_key` | `character varying(255)` | — |  |  |
| `title` | `character varying(250)` | — |  |  |
| `description` | `text` | có |  |  |
| `first_occurred_at` | `timestamp with time zone` | — |  |  |
| `last_occurred_at` | `timestamp with time zone` | — |  |  |
| `occurrence_count` | `integer` | — | `1` |  |
| `acknowledged_by` | `uuid` | có |  |  |
| `acknowledged_at` | `timestamp with time zone` | có |  |  |
| `assigned_to` | `uuid` | có |  |  |
| `resolved_by` | `uuid` | có |  |  |
| `resolved_at` | `timestamp with time zone` | có |  |  |
| `resolution` | `text` | có |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |

**Ràng buộc kiểm tra**

- `chk_alert_occurrence_positive` — `CHECK ((occurrence_count > 0))`

**Khóa ngoại**

- `alerts_acknowledged_by_fkey` — `FOREIGN KEY (acknowledged_by) REFERENCES users(id)`
- `alerts_assigned_to_fkey` — `FOREIGN KEY (assigned_to) REFERENCES users(id)`
- `alerts_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `alerts_machine_id_fkey` — `FOREIGN KEY (machine_id) REFERENCES machines(id)`
- `alerts_resolved_by_fkey` — `FOREIGN KEY (resolved_by) REFERENCES users(id)`
- `alerts_slot_id_fkey` — `FOREIGN KEY (slot_id) REFERENCES machine_slots(id)`

**Index**

- `alerts_pkey` (UNIQUE) — `USING btree (id)`
- `idx_alerts_brand` — `USING btree (brand_id, status, severity, created_at)`
- `idx_alerts_machine` — `USING btree (machine_id)`
- `uq_alert_dedup_unresolved` (UNIQUE) — `USING btree (deduplication_key) WHERE (status = ANY (ARRAY['OPEN'::alert_status, 'ACKNOWLEDGED'::alert_status, 'IN_PROGRESS'::alert_status]))`

### `maintenance_tickets`

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `brand_id` | `uuid` | có |  | Hầu như luôn NULL: phiếu bảo trì là tài nguyên của nền tảng/máy, không thuộc thương hiệu nào. FR-MNT-07 thông báo cho mọi Brand Admin có slot trên máy, suy ra bằng join slot_rentals đang hiệu lực — không lưu ở đây. |
| `machine_id` | `uuid` | — |  |  |
| `source_alert_id` | `uuid` | có |  |  |
| `ticket_number` | `character varying(80)` | — |  |  |
| `category` | `character varying(100)` | — |  |  |
| `severity` | `alert_severity` | — |  |  |
| `priority` | `ticket_priority` | — |  |  |
| `status` | `ticket_status` | — | `'OPEN'::ticket_status` |  |
| `assigned_to` | `uuid` | có |  |  |
| `due_at` | `timestamp with time zone` | có |  |  |
| `started_at` | `timestamp with time zone` | có |  |  |
| `resolved_at` | `timestamp with time zone` | có |  |  |
| `closed_at` | `timestamp with time zone` | có |  |  |
| `diagnosis` | `text` | có |  |  |
| `corrective_action` | `text` | có |  |  |
| `replacement_parts` | `jsonb` | có |  |  |
| `cost` | `numeric(19,4)` | có |  |  |
| `post_test_result` | `character varying(30)` | có |  |  |
| `post_tested_by` | `uuid` | có |  |  |
| `post_tested_at` | `timestamp with time zone` | có |  |  |
| `downtime_minutes` | `integer` | có |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |

**Ràng buộc kiểm tra**

- `chk_downtime_nonnegative` — `CHECK (((downtime_minutes IS NULL) OR (downtime_minutes >= 0)))`
- `chk_ticket_cost_nonnegative` — `CHECK (((cost IS NULL) OR (cost >= (0)::numeric)))`

**Khóa ngoại**

- `maintenance_tickets_assigned_to_fkey` — `FOREIGN KEY (assigned_to) REFERENCES users(id)`
- `maintenance_tickets_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `maintenance_tickets_machine_id_fkey` — `FOREIGN KEY (machine_id) REFERENCES machines(id)`
- `maintenance_tickets_post_tested_by_fkey` — `FOREIGN KEY (post_tested_by) REFERENCES users(id)`
- `maintenance_tickets_source_alert_id_fkey` — `FOREIGN KEY (source_alert_id) REFERENCES alerts(id)`

**Index**

- `idx_tickets_machine` — `USING btree (machine_id, status, assigned_to, due_at)`
- `maintenance_tickets_pkey` (UNIQUE) — `USING btree (id)`
- `uq_ticket_number` (UNIQUE) — `USING btree (ticket_number)`

### `maintenance_activities`

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `ticket_id` | `uuid` | — |  |  |
| `actor_id` | `uuid` | — |  |  |
| `activity_type` | `character varying(80)` | — |  |  |
| `from_status` | `ticket_status` | có |  |  |
| `to_status` | `ticket_status` | có |  |  |
| `notes` | `text` | có |  |  |
| `attachments` | `jsonb` | có |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |

**Khóa ngoại**

- `maintenance_activities_actor_id_fkey` — `FOREIGN KEY (actor_id) REFERENCES users(id)`
- `maintenance_activities_ticket_id_fkey` — `FOREIGN KEY (ticket_id) REFERENCES maintenance_tickets(id)`

**Index**

- `idx_maintenance_activities` — `USING btree (ticket_id, created_at)`
- `maintenance_activities_pkey` (UNIQUE) — `USING btree (id)`

### `refill_requests`

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `brand_id` | `uuid` | — |  |  |
| `slot_rental_id` | `uuid` | — |  |  |
| `slot_id` | `uuid` | — |  |  |
| `fragrance_product_id` | `uuid` | — |  |  |
| `reason` | `refill_request_reason` | — |  |  |
| `status` | `refill_request_status` | — | `'SUBMITTED'::refill_request_status` |  |
| `requested_by` | `uuid` | — |  |  |
| `reviewed_by` | `uuid` | có |  |  |
| `rejection_reason` | `text` | có |  |  |
| `scheduled_at` | `timestamp with time zone` | có |  |  |
| `refill_session_id` | `uuid` | có |  | Phiên nạp thực tế liên kết (FR-RFQ-08). Chỉ đặt được COMPLETED khi cột này có giá trị (FR-RFQ-09) — xem §13. |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |

**Khóa ngoại**

- `fk_refill_request_rental_same_brand` — `FOREIGN KEY (slot_rental_id, brand_id) REFERENCES slot_rentals(id, brand_id)` — *ràng buộc cùng thương hiệu*
- `refill_requests_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `refill_requests_fragrance_product_id_fkey` — `FOREIGN KEY (fragrance_product_id) REFERENCES fragrance_products(id)`
- `refill_requests_refill_session_id_fkey` — `FOREIGN KEY (refill_session_id) REFERENCES refill_sessions(id)`
- `refill_requests_requested_by_fkey` — `FOREIGN KEY (requested_by) REFERENCES users(id)`
- `refill_requests_reviewed_by_fkey` — `FOREIGN KEY (reviewed_by) REFERENCES users(id)`
- `refill_requests_slot_id_fkey` — `FOREIGN KEY (slot_id) REFERENCES machine_slots(id)`
- `refill_requests_slot_rental_id_fkey` — `FOREIGN KEY (slot_rental_id) REFERENCES slot_rentals(id)`

**Index**

- `idx_refill_requests_brand` — `USING btree (brand_id, status, created_at)`
- `idx_refill_requests_rental` — `USING btree (slot_rental_id)`
- `idx_refill_requests_slot` — `USING btree (slot_id, status)`
- `refill_requests_pkey` (UNIQUE) — `USING btree (id)`
- `uq_refill_request_open` (UNIQUE) — `USING btree (slot_id) WHERE (status = ANY (ARRAY['SUBMITTED'::refill_request_status, 'ACCEPTED'::refill_request_status, 'SCHEDULED'::refill_request_status]))`

### `notifications`

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `brand_id` | `uuid` | — |  |  |
| `recipient_user_id` | `uuid` | — |  |  |
| `type` | `character varying(80)` | — |  |  |
| `channel` | `character varying(30)` | — |  |  |
| `subject` | `character varying(250)` | có |  |  |
| `content` | `text` | — |  |  |
| `status` | `notification_status` | — | `'PENDING'::notification_status` |  |
| `sent_at` | `timestamp with time zone` | có |  |  |
| `read_at` | `timestamp with time zone` | có |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |

**Khóa ngoại**

- `notifications_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `notifications_recipient_user_id_fkey` — `FOREIGN KEY (recipient_user_id) REFERENCES users(id)`

**Index**

- `idx_notifications_recipient` — `USING btree (recipient_user_id, status, created_at)`
- `notifications_pkey` (UNIQUE) — `USING btree (id)`

### `audit_logs`

CHỈ THÊM MỚI. Không sửa, không xóa — được cưỡng chế ở §11 bằng cả quyền lẫn trigger (FR-AUD-09, NFR-SEC-08).

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `brand_id` | `uuid` | có |  | NULL với sự kiện mức nền tảng. |
| `actor_type` | `character varying(30)` | — |  |  |
| `actor_id` | `uuid` | có |  |  |
| `action` | `character varying(150)` | — |  |  |
| `target_type` | `character varying(100)` | — |  |  |
| `target_id` | `uuid` | có |  |  |
| `source_ip` | `inet` | có |  |  |
| `user_agent` | `text` | có |  |  |
| `severity` | `character varying(30)` | — | `'INFO'::character varying` |  |
| `before_data` | `jsonb` | có |  |  |
| `after_data` | `jsonb` | có |  |  |
| `metadata` | `jsonb` | có |  |  |
| `occurred_at` | `timestamp with time zone` | — | `now()` |  |

**Khóa ngoại**

- `audit_logs_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`

**Index**

- `audit_logs_pkey` (UNIQUE) — `USING btree (id)`
- `idx_audit_actor` — `USING btree (actor_id, occurred_at)`
- `idx_audit_brand` — `USING btree (brand_id, occurred_at)`
- `idx_audit_target` — `USING btree (target_type, target_id)`

## Nhóm Device và IoT

Thông tin xác thực thiết bị, sự kiện và telemetry. Cấu trúc bản tin trên đường truyền nằm ở `spec/contracts/mqtt.md`.

### `device_credentials`

Mỗi máy một bộ thông tin xác thực riêng, không dùng chung (FR-MCH-02, NFR-SEC-07). Chỉ lưu băm/khóa công khai, không lưu bí mật gốc (NFR-SEC-05).

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `machine_id` | `uuid` | — |  |  |
| `credential_identifier` | `character varying(200)` | — |  |  |
| `public_key_or_secret_hash` | `text` | — |  |  |
| `certificate_fingerprint` | `character varying(255)` | có |  |  |
| `status` | `credential_status` | — | `'ACTIVE'::credential_status` |  |
| `issued_at` | `timestamp with time zone` | — |  |  |
| `expires_at` | `timestamp with time zone` | có |  |  |
| `revoked_at` | `timestamp with time zone` | có |  |  |
| `last_authenticated_at` | `timestamp with time zone` | có |  |  |

**Khóa ngoại**

- `device_credentials_machine_id_fkey` — `FOREIGN KEY (machine_id) REFERENCES machines(id)`

**Index**

- `device_credentials_credential_identifier_key` (UNIQUE) — `USING btree (credential_identifier)`
- `device_credentials_machine_id_key` (UNIQUE) — `USING btree (machine_id)`
- `device_credentials_pkey` (UNIQUE) — `USING btree (id)`

### `device_events`

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `machine_id` | `uuid` | — |  |  |
| `device_event_id` | `character varying(150)` | — |  |  |
| `event_type` | `character varying(100)` | — |  |  |
| `occurred_at` | `timestamp with time zone` | — |  |  |
| `received_at` | `timestamp with time zone` | — | `now()` |  |
| `payload` | `jsonb` | có |  |  |

**Khóa ngoại**

- `device_events_machine_id_fkey` — `FOREIGN KEY (machine_id) REFERENCES machines(id)`

**Index**

- `device_events_pkey` (UNIQUE) — `USING btree (id)`
- `idx_device_events_time` — `USING btree (machine_id, occurred_at)`
- `uq_device_event` (UNIQUE) — `USING btree (machine_id, device_event_id)`

### `sensor_readings`

Telemetry theo FR-IOT-04, lưu lịch sử phục vụ báo cáo và phân tích (FR-IOT-14).

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `machine_id` | `uuid` | — |  |  |
| `slot_id` | `uuid` | có |  |  |
| `reading_type` | `character varying(100)` | — |  |  |
| `numeric_value` | `numeric(18,6)` | có |  |  |
| `unit` | `character varying(30)` | có |  |  |
| `payload` | `jsonb` | có |  |  |
| `measured_at` | `timestamp with time zone` | — |  |  |
| `received_at` | `timestamp with time zone` | — | `now()` |  |

**Khóa ngoại**

- `sensor_readings_machine_id_fkey` — `FOREIGN KEY (machine_id) REFERENCES machines(id)`
- `sensor_readings_slot_id_fkey` — `FOREIGN KEY (slot_id) REFERENCES machine_slots(id)`

**Index**

- `idx_sensor_readings` — `USING btree (machine_id, slot_id, measured_at)`
- `sensor_readings_pkey` (UNIQUE) — `USING btree (id)`

