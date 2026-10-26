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

Tổng: **46 bảng**, **30 kiểu enum**.

---

## Kiểu enum

| Kiểu | Giá trị |
|---|---|
| `agreement_kind` | `FRAMEWORK` · `ANNEX` |
| `alert_severity` | `INFO` · `WARNING` · `HIGH` · `CRITICAL` |
| `alert_status` | `OPEN` · `ACKNOWLEDGED` · `IN_PROGRESS` · `RESOLVED` · `CLOSED` |
| `batch_authenticity_status` | `NOT_SUBMITTED` · `PENDING` · `APPROVED` · `REJECTED` |
| `bottle_return_method` | `WAREHOUSE_PICKUP` · `SHIP_TO_BRAND` |
| `bottle_status` | `IN_STOCK` · `INSTALLED` · `LOW` · `EMPTY` · `DAMAGED` · `EXPIRED` · `LIQUIDATED` · `RETURNED_TO_BRAND` |
| `brand_payout_status` | `DRAFT` · `CONFIRMED` · `PAID` |
| `brand_status` | `ACTIVE` · `SUSPENDED` · `DISABLED` |
| `command_status` | `CREATED` · `SENT` · `ACKNOWLEDGED` · `SUCCEEDED` · `FAILED` · `REJECTED` · `EXPIRED` · `UNKNOWN` |
| `credential_status` | `ACTIVE` · `REVOKED` · `EXPIRED` |
| `dispense_type` | `CUSTOMER` · `DIAGNOSTIC` |
| `kiosk_interaction_type` | `PRODUCT_IMPRESSION` · `PRODUCT_SELECTED` |
| `machine_connection_status` | `ONLINE` · `UNSTABLE` · `OFFLINE` |
| `machine_operating_mode` | `NORMAL` · `DRAINING` · `MAINTENANCE` · `DISABLED` |
| `notification_status` | `PENDING` · `SENT` · `FAILED` · `READ` |
| `order_status` | `CREATED` · `PENDING_PAYMENT` · `PAID` · `DISPENSE_REQUESTED` · `DISPENSED` · `FAILED` · `EXPIRED` · `REFUND_PENDING` · `REFUNDED` · `FORFEITED` |
| `payment_status` | `PENDING` · `SUCCEEDED` · `FAILED` · `CANCELLED` · `EXPIRED` · `REFUND_PENDING` · `PARTIALLY_REFUNDED` · `REFUNDED` |
| `refill_request_reason` | `LOW_STOCK` · `EXPIRING` · `PRODUCT_CHANGE` |
| `refill_request_status` | `SUBMITTED` · `ACCEPTED` · `REJECTED` · `SCHEDULED` · `COMPLETED` · `CANCELLED` |
| `refill_status` | `STARTED` · `COMPLETED` · `CANCELLED` |
| `refund_claim_status` | `OPEN` · `REFUNDED` · `REJECTED` · `EXPIRED` |
| `revenue_owner_type` | `BRAND` · `PLATFORM` |
| `shipment_declaration_status` | `DECLARED` · `RECEIVED` · `DISCREPANCY` · `CANCELLED` |
| `slot_rental_request_status` | `REQUESTED` · `APPROVED` · `REJECTED` · `CONVERTED` · `CANCELLED` |
| `slot_rental_status` | `DRAFT` · `ACTIVE` · `EXPIRING` · `GRACE` · `RENEWED` · `LIQUIDATED` · `CLOSED` · `TERMINATED` · `CANCELLED` |
| `slot_status` | `AVAILABLE` · `UNAVAILABLE` · `MAINTENANCE` · `DISABLED` |
| `storage_compensation_status` | `PENDING` · `PAID` |
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
| `tax_code` | `character varying(20)` | có |  | Mã số thuế do Brand Admin khai (FR-BND-09). Bắt buộc trước khi Super Admin xác minh pháp nhân. |
| `business_license_number` | `character varying(100)` | có |  |  |
| `payout_account_ciphertext` | `bytea` | có |  | Tài khoản doanh nghiệp nhận doanh thu (mã ngân hàng, số tài khoản, tên chủ tài khoản), mã hóa tầng ứng dụng (FR-BND-09, ADR-0013). Tài khoản của THƯƠNG HIỆU, không thuộc phạm vi NFR-DAT-04. |
| `payout_account_key_version` | `smallint` | có |  | Phiên bản khóa đã mã hóa payout_account_ciphertext — để xoay khóa mà vẫn đọc được bản cũ. |
| `legal_verified_at` | `timestamp with time zone` | có |  | Super Admin ghi nhận đã xác minh pháp nhân (FR-BND-10). NULL thì kỳ chi trả không chuyển được sang PAID (BRAND_NOT_VERIFIED, FR-SLT-53). Không chặn việc thuê slot. |
| `legal_verified_by` | `uuid` | có |  |  |

**Ràng buộc kiểm tra**

- `chk_brand_legal_verified_has_tax_code` — `CHECK (((legal_verified_at IS NULL) OR (tax_code IS NOT NULL)))`
- `chk_brand_legal_verified_pair` — `CHECK (((legal_verified_at IS NULL) = (legal_verified_by IS NULL)))`
- `chk_brand_payout_account_key` — `CHECK (((payout_account_ciphertext IS NULL) = (payout_account_key_version IS NULL)))`

**Khóa ngoại**

- `brands_legal_verified_by_fkey` — `FOREIGN KEY (legal_verified_by) REFERENCES users(id)`

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

### `email_verifications`

Xác minh email của tài khoản Brand Admin tự đăng ký (FR-USR-07, ADR-0013). Không có dòng = tài khoản do Super Admin tạo, không cần xác minh. Có dòng, verified_at NULL = chưa xác minh.

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `user_id` | `uuid` | — |  |  |
| `email` | `citext` | — |  | Địa chỉ đã gửi mã — đổi email thì phải xác minh lại địa chỉ mới. |
| `token_hash` | `character(64)` | — |  | SHA-256 (hex) của mã gửi trong email. Không lưu mã gốc (NFR-SEC-05). |
| `expires_at` | `timestamp with time zone` | — |  |  |
| `verified_at` | `timestamp with time zone` | có |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |

**Ràng buộc kiểm tra**

- `chk_email_verification_expiry` — `CHECK ((expires_at > created_at))`

**Khóa ngoại**

- `email_verifications_user_id_fkey` — `FOREIGN KEY (user_id) REFERENCES users(id)`

**Index**

- `email_verifications_pkey` (UNIQUE) — `USING btree (id)`
- `uq_email_verification_token` (UNIQUE) — `USING btree (token_hash)`
- `uq_email_verification_user` (UNIQUE) — `USING btree (user_id)`

## Nhóm Catalog và Machines

Địa điểm, máy, slot, danh mục sản phẩm, gói thuê và hóa đơn thuê slot. `machines` KHÔNG có `brand_id` — đường duy nhất nối thương hiệu với máy là `slot_rentals` (BR-003, BR-012). Một lần thanh toán có thể gồm nhiều hóa đơn, gom bằng `rental_checkouts` (ADR-0008).

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
| `operating_mode` | `machine_operating_mode` | — | `'NORMAL'::machine_operating_mode` | Trục chế độ, do người vận hành đặt (FR-MCH-09, FR-MNT-05/12). Độc lập với status. DRAINING (ADR-0015): đã yêu cầu bảo trì, không nhận đơn mới nhưng phục vụ nốt đơn đã trả tiền, rồi tự sang MAINTENANCE; chỉ tồn tại ở backend — thiết bị vẫn nhận chế độ NORMAL. |
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
| `monthly_rent_price` | `numeric(19,4)` | có |  | Giá thuê niêm yết mỗi tháng (FR-SLT-32). NULL = slot chưa mở cho thuê, không hiện trong danh sách slot trống (FR-SLT-19). |

**Ràng buộc kiểm tra**

- `chk_slot_number_positive` — `CHECK ((slot_number > 0))`
- `chk_slot_remaining_ml_nonnegative` — `CHECK ((estimated_remaining_ml >= (0)::numeric))`
- `chk_slot_remaining_sprays_nonnegative` — `CHECK ((estimated_remaining_sprays >= 0))`
- `chk_slot_rent_price_nonnegative` — `CHECK (((monthly_rent_price IS NULL) OR (monthly_rent_price >= (0)::numeric)))`

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

DEPRECATED (ADR-0006): luồng Brand Admin gửi yêu cầu thuê, Super Admin duyệt (FR-SLT-20 ÷ 26) đã bãi bỏ. Không ghi thêm bản ghi mới. Giữ bảng vì xóa là thay đổi phá hủy.

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
| `resulting_rental_id` | `uuid` | có |  | DEPRECATED (ADR-0006). Trước đây: đặt khi yêu cầu được duyệt và hóa đơn DRAFT được tạo tự động. |
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

### `rental_packages`

Gói thuê niêm yết: thời hạn theo tháng và tỷ lệ ưu đãi (FR-SLT-30, ADR-0006). Ngừng mở bán bằng is_active = false; hóa đơn đã mua không bị ảnh hưởng vì giá đã được chụp (FR-SLT-33).

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `name` | `character varying(100)` | — |  |  |
| `duration_months` | `smallint` | — |  |  |
| `discount_percent` | `numeric(5,2)` | — | `0` |  |
| `is_active` | `boolean` | — | `true` |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |

**Ràng buộc kiểm tra**

- `chk_package_discount_percent` — `CHECK (((discount_percent >= (0)::numeric) AND (discount_percent <= (100)::numeric)))`
- `chk_package_duration_positive` — `CHECK ((duration_months > 0))`

**Index**

- `rental_packages_pkey` (UNIQUE) — `USING btree (id)`
- `uq_rental_package_name` (UNIQUE) — `USING btree (name)`

### `storage_plans`

Gói bảo quản — bảo hiểm hàng hóa (FR-SLT-31, ADR-0006). Mỗi hóa đơn bắt buộc chọn đúng một gói. Domain service phải giữ ít nhất một gói is_active = true (FR-SLT-31 AC3).

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `name` | `character varying(100)` | — |  |  |
| `description` | `text` | có |  |  |
| `monthly_price` | `numeric(19,4)` | — |  |  |
| `currency` | `character(3)` | — | `'VND'::bpchar` |  |
| `coverage_percent` | `numeric(5,2)` | — |  | Tỷ lệ bồi thường tính trên giá bán lẻ chai (fragrance_products.full_bottle_retail_price). |
| `coverage_cap` | `numeric(19,4)` | — |  | Hạn mức bồi thường tối đa cộng dồn cho MỘT hóa đơn. |
| `is_active` | `boolean` | — | `true` |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |

**Ràng buộc kiểm tra**

- `chk_storage_plan_cap_nonnegative` — `CHECK ((coverage_cap >= (0)::numeric))`
- `chk_storage_plan_coverage_percent` — `CHECK (((coverage_percent >= (0)::numeric) AND (coverage_percent <= (100)::numeric)))`
- `chk_storage_plan_price_nonnegative` — `CHECK ((monthly_price >= (0)::numeric))`

**Index**

- `storage_plans_pkey` (UNIQUE) — `USING btree (id)`
- `uq_storage_plan_name` (UNIQUE) — `USING btree (name)`

### `rental_checkouts`

Phiên thanh toán thuê slot (ADR-0008): một lần Brand Admin chọn một hoặc nhiều slot rồi trả tiền một lần. Mỗi slot vẫn là một hóa đơn (slot_rentals) có số hóa đơn, ảnh chụp giá và vòng đời riêng; phiên chỉ gom giữ chỗ, tổng tiền và thanh toán. Trạng thái suy ra từ paid_at và cancelled_at: cả hai NULL = chờ thanh toán.

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `brand_id` | `uuid` | — |  |  |
| `currency` | `character(3)` | — | `'VND'::bpchar` |  |
| `total_amount` | `numeric(19,4)` | — |  | Tổng total_amount của mọi hóa đơn trong phiên (FR-SLT-36), chỉ ghi một lần lúc tạo. Số tiền webhook đối chiếu (FR-SLT-38). trg_rental_checkouts_consistency kiểm lúc COMMIT. |
| `hold_expires_at` | `timestamp with time zone` | — |  | Hết giờ giữ chỗ cho MỌI slot trong phiên: lúc tạo + RENTAL_CHECKOUT_HOLD_MIN (FR-SLT-35). Quá mốc mà paid_at NULL thì phiên và mọi hóa đơn của nó chuyển CANCELLED (FR-SLT-39). |
| `paid_at` | `timestamp with time zone` | có |  | Thời điểm thanh toán được xác nhận (FR-SLT-38). Cùng transaction: mọi hóa đơn của phiên nhận paid_at và mỗi hóa đơn một số hóa đơn riêng. |
| `cancelled_at` | `timestamp with time zone` | có |  | Hết giờ giữ chỗ mà chưa thanh toán (FR-SLT-39). Cùng transaction: mọi hóa đơn của phiên → CANCELLED và payment PENDING của phiên → EXPIRED. |
| `created_by` | `uuid` | — |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |
| `agreement_version_id` | `uuid` | có |  | Hợp đồng khung hiện hành lúc tạo phiên — thương hiệu phải đã đồng ý phiên bản này (AGREEMENT_NOT_ACCEPTED). Phụ lục của phiên là phụ lục của phiên bản này. NULL với phiên tạo trước ADR-0013. |

**Ràng buộc kiểm tra**

- `chk_checkout_amount_nonnegative` — `CHECK ((total_amount >= (0)::numeric))`
- `chk_checkout_paid_or_cancelled` — `CHECK (((paid_at IS NULL) OR (cancelled_at IS NULL)))`

**Khóa ngoại**

- `rental_checkouts_agreement_version_id_fkey` — `FOREIGN KEY (agreement_version_id) REFERENCES agreement_versions(id)`
- `rental_checkouts_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `rental_checkouts_created_by_fkey` — `FOREIGN KEY (created_by) REFERENCES users(id)`

**Index**

- `idx_checkouts_brand` — `USING btree (brand_id, created_at)`
- `idx_checkouts_unpaid_hold` — `USING btree (hold_expires_at) WHERE ((paid_at IS NULL) AND (cancelled_at IS NULL))`
- `rental_checkouts_pkey` (UNIQUE) — `USING btree (id)`
- `uq_checkout_id_brand` (UNIQUE) — `USING btree (id, brand_id)`

### `slot_rentals`

Hóa đơn thuê slot: một lần thương hiệu mua gói thuê một slot (ADR-0006). Một hóa đơn ứng với đúng một slot; thương hiệu thuê 3 slot có 3 hóa đơn độc lập (BR-009), có thể thanh toán chung trong một phiên (rental_checkouts, ADR-0008). Đây là đường duy nhất nối thương hiệu với máy.

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `slot_id` | `uuid` | — |  |  |
| `brand_id` | `uuid` | — |  |  |
| `fragrance_product_id` | `uuid` | có |  | Nullable ở tầng CSDL CHỈ để phục vụ cửa sổ giữa lúc thanh toán (FR-SLT-38) và lúc Brand Admin cấu hình slot (FR-SLT-27). Domain service phải chặn tạo đơn khi cột này NULL (FR-SLT-29). Xem §13. |
| `product_assigned_at` | `timestamp with time zone` | có |  |  |
| `request_id` | `uuid` | có |  | DEPRECATED (ADR-0006): luồng yêu cầu thuê và duyệt tay đã bãi bỏ. Hóa đơn mới để NULL. |
| `previous_rental_id` | `uuid` | có |  | Hóa đơn liền trước khi đây là hóa đơn gia hạn (FR-SLT-12). |
| `status` | `slot_rental_status` | — | `'DRAFT'::slot_rental_status` |  |
| `starts_at` | `timestamp with time zone` | — |  | Hóa đơn DRAFT: mốc TẠM để excl_slot_rental_overlap giữ được slot. Ghi đè bằng thời điểm thật khi kích hoạt — lắp chai đầu tiên (FR-SLT-24), quá RENTAL_MAX_STOCKING_DAYS (FR-SLT-42), hoặc nối tiếp hóa đơn cũ (FR-SLT-12). |
| `ends_at` | `timestamp with time zone` | — |  | Hóa đơn DRAFT: mốc TẠM = starts_at + RENTAL_MAX_STOCKING_DAYS + số tháng (hóa đơn mới) hoặc starts_at + số tháng (hóa đơn gia hạn). Khi kích hoạt: starts_at + duration_months. |
| `grace_ends_at` | `timestamp with time zone` | có |  | Ngày kết thúc ân hạn do Platform Super Admin ấn định (FR-EXP-07). |
| `price_per_spray` | `numeric(19,4)` | có |  | Nullable từ ADR-0006: Brand Admin đặt giá ở bước cấu hình slot sau khi thanh toán (FR-SLT-08). Domain service phải chặn tạo đơn khi cột này NULL (FR-SLT-29). |
| `currency` | `character(3)` | — | `'VND'::bpchar` |  |
| `fixed_fee` | `numeric(19,4)` | — | `0` | DEPRECATED (ADR-0006): mô hình phí cố định theo kỳ đã bỏ. Giữ cột để không phá migration và test hiện có; hóa đơn mới để mặc định 0. |
| `revenue_share_percent` | `numeric(5,2)` | — | `0` | DEPRECATED (ADR-0006): không còn ăn chia doanh thu lượt xịt. Giữ cột để không phá migration và test hiện có; hóa đơn mới để mặc định 0. |
| `terminated_reason` | `text` | có |  |  |
| `created_by` | `uuid` | — |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |
| `invoice_number` | `character varying(30)` | có |  | Số hóa đơn, cấp đúng lúc thanh toán thành công và duy nhất toàn hệ thống (FR-SLT-38). |
| `rental_package_id` | `uuid` | có |  | Gói thuê đã mua. NULL với hóa đơn tạo theo mô hình cũ trước ADR-0006. |
| `storage_plan_id` | `uuid` | có |  |  |
| `duration_months` | `smallint` | có |  |  |
| `monthly_rent_price` | `numeric(19,4)` | có |  | Ảnh chụp giá niêm yết của slot lúc tạo hóa đơn (FR-SLT-33). Cùng với duration_months, discount_percent, storage_* , rent_amount, storage_amount, total_amount: chỉ ghi một lần. |
| `discount_percent` | `numeric(5,2)` | có |  |  |
| `storage_monthly_price` | `numeric(19,4)` | có |  |  |
| `storage_coverage_percent` | `numeric(5,2)` | có |  |  |
| `storage_coverage_cap` | `numeric(19,4)` | có |  |  |
| `rent_amount` | `numeric(19,4)` | có |  |  |
| `storage_amount` | `numeric(19,4)` | có |  |  |
| `grace_fee_amount` | `numeric(19,4)` | — | `0` | Phí ân hạn của hóa đơn cũ chuyển sang hóa đơn gia hạn (FR-EXP-12, FR-SLT-36). 0 với hóa đơn mới. |
| `total_amount` | `numeric(19,4)` | có |  |  |
| `paid_at` | `timestamp with time zone` | có |  | Thời điểm thanh toán được xác nhận (FR-SLT-38) — ghi cùng lúc với rental_checkouts.paid_at của phiên. DRAFT + paid_at NULL = chờ thanh toán; DRAFT + paid_at khác NULL = chờ nạp hàng. |
| `cancelled_at` | `timestamp with time zone` | có |  |  |
| `checkout_id` | `uuid` | có |  | Phiên thanh toán sinh ra hóa đơn (ADR-0008). Bắt buộc với hóa đơn theo gói (chk_rental_package_snapshot_complete); NULL với hóa đơn mô hình cũ trước ADR-0006. |
| `non_renewal_requested_at` | `timestamp with time zone` | có |  | Brand Admin báo không gia hạn (FR-EXP-23): hóa đơn không vào GRACE, không tính phí ân hạn, giữ ACTIVE/EXPIRING tới khi Inventory Staff tháo chai (FR-EXP-25). Rút lại trước ends_at thì về NULL (FR-EXP-24). |
| `non_renewal_requested_by` | `uuid` | có |  |  |
| `return_method` | `bottle_return_method` | có |  | Cách nhận hàng trả về, chọn lúc báo không gia hạn (FR-EXP-23). |
| `swapped_from_slot_id` | `uuid` | có |  | Slot cũ khi hóa đơn đã đổi slot (FR-SLT-55). Khác NULL nghĩa là đã dùng lượt đổi duy nhất. |
| `swapped_at` | `timestamp with time zone` | có |  |  |

**Ràng buộc kiểm tra**

- `chk_rental_amounts_nonnegative` — `CHECK ((((monthly_rent_price IS NULL) OR (monthly_rent_price >= (0)::numeric)) AND ((storage_monthly_price IS NULL) OR (storage_monthly_price >= (0)::numeric)) AND ((storage_coverage_cap IS NULL) OR (storage_coverage_cap >= (0)::numeric)) AND ((rent_amount IS NULL) OR (rent_amount >= (0)::numeric)) AND ((storage_amount IS NULL) OR (storage_amount >= (0)::numeric)) AND (grace_fee_amount >= (0)::numeric) AND ((total_amount IS NULL) OR (total_amount >= (0)::numeric))))`
- `chk_rental_cancelled_at` — `CHECK ((((status)::text = 'CANCELLED'::text) = (cancelled_at IS NOT NULL)))`
- `chk_rental_cancelled_unpaid` — `CHECK ((((status)::text <> 'CANCELLED'::text) OR (paid_at IS NULL)))`
- `chk_rental_duration_positive` — `CHECK (((duration_months IS NULL) OR (duration_months > 0)))`
- `chk_rental_fee_nonnegative` — `CHECK ((fixed_fee >= (0)::numeric))`
- `chk_rental_invoice_on_payment` — `CHECK (((paid_at IS NULL) = (invoice_number IS NULL)))`
- `chk_rental_non_renewal_fields` — `CHECK ((num_nulls(non_renewal_requested_at, non_renewal_requested_by, return_method) = ANY (ARRAY[0, 3])))`
- `chk_rental_package_snapshot_complete` — `CHECK (((rental_package_id IS NULL) OR (num_nulls(storage_plan_id, duration_months, monthly_rent_price, discount_percent, storage_monthly_price, storage_coverage_percent, storage_coverage_cap, rent_amount, storage_amount, total_amount, checkout_id) = 0)))`
- `chk_rental_percents` — `CHECK ((((discount_percent IS NULL) OR ((discount_percent >= (0)::numeric) AND (discount_percent <= (100)::numeric))) AND ((storage_coverage_percent IS NULL) OR ((storage_coverage_percent >= (0)::numeric) AND (storage_coverage_percent <= (100)::numeric)))))`
- `chk_rental_period` — `CHECK ((ends_at > starts_at))`
- `chk_rental_price_nonnegative` — `CHECK ((price_per_spray >= (0)::numeric))`
- `chk_rental_swap_fields` — `CHECK (((swapped_from_slot_id IS NULL) = (swapped_at IS NULL)))`
- `chk_rental_swap_other_slot` — `CHECK (((swapped_from_slot_id IS NULL) OR (swapped_from_slot_id <> slot_id)))`
- `chk_rental_total_amount` — `CHECK (((total_amount IS NULL) OR (total_amount = ((rent_amount + storage_amount) + grace_fee_amount))))`
- `chk_revenue_share_percent` — `CHECK (((revenue_share_percent >= (0)::numeric) AND (revenue_share_percent <= (100)::numeric)))`
- `excl_slot_rental_overlap` — `EXCLUDE USING gist (slot_id WITH =, tstzrange(starts_at, ends_at, '[)'::text) WITH &&) WHERE ((status = ANY (ARRAY['DRAFT'::slot_rental_status, 'ACTIVE'::slot_rental_status, 'EXPIRING'::slot_rental_status, 'GRACE'::slot_rental_status, 'LIQUIDATED'::slot_rental_status])))`

**Khóa ngoại**

- `fk_rental_checkout_same_brand` — `FOREIGN KEY (checkout_id, brand_id) REFERENCES rental_checkouts(id, brand_id)` — *ràng buộc cùng thương hiệu*
- `fk_rental_product_same_brand` — `FOREIGN KEY (fragrance_product_id, brand_id) REFERENCES fragrance_products(id, brand_id)` — *ràng buộc cùng thương hiệu*
- `slot_rentals_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `slot_rentals_created_by_fkey` — `FOREIGN KEY (created_by) REFERENCES users(id)`
- `slot_rentals_fragrance_product_id_fkey` — `FOREIGN KEY (fragrance_product_id) REFERENCES fragrance_products(id)`
- `slot_rentals_non_renewal_requested_by_fkey` — `FOREIGN KEY (non_renewal_requested_by) REFERENCES users(id)`
- `slot_rentals_previous_rental_id_fkey` — `FOREIGN KEY (previous_rental_id) REFERENCES slot_rentals(id)`
- `slot_rentals_rental_package_id_fkey` — `FOREIGN KEY (rental_package_id) REFERENCES rental_packages(id)`
- `slot_rentals_request_id_fkey` — `FOREIGN KEY (request_id) REFERENCES slot_rental_requests(id)`
- `slot_rentals_slot_id_fkey` — `FOREIGN KEY (slot_id) REFERENCES machine_slots(id)`
- `slot_rentals_storage_plan_id_fkey` — `FOREIGN KEY (storage_plan_id) REFERENCES storage_plans(id)`
- `slot_rentals_swapped_from_slot_id_fkey` — `FOREIGN KEY (swapped_from_slot_id) REFERENCES machine_slots(id)`

**Index**

- `excl_slot_rental_overlap` — `USING gist (slot_id, tstzrange(starts_at, ends_at, '[)'::text)) WHERE (status = ANY (ARRAY['DRAFT'::slot_rental_status, 'ACTIVE'::slot_rental_status, 'EXPIRING'::slot_rental_status, 'GRACE'::slot_rental_status, 'LIQUIDATED'::slot_rental_status]))`
- `idx_rentals_brand` — `USING btree (brand_id, status, starts_at)`
- `idx_rentals_checkout` — `USING btree (checkout_id) WHERE (checkout_id IS NOT NULL)`
- `idx_rentals_draft_awaiting_stock` — `USING btree (paid_at) WHERE ((status = 'DRAFT'::slot_rental_status) AND (paid_at IS NOT NULL))`
- `idx_rentals_product` — `USING btree (fragrance_product_id, status)`
- `idx_rentals_slot` — `USING btree (slot_id, starts_at, ends_at)`
- `slot_rentals_pkey` (UNIQUE) — `USING btree (id)`
- `uq_rental_id_brand` (UNIQUE) — `USING btree (id, brand_id)`
- `uq_rental_invoice_number` (UNIQUE) — `USING btree (invoice_number)`
- `uq_slot_active_rental` (UNIQUE) — `USING btree (slot_id) WHERE (status = ANY (ARRAY['ACTIVE'::slot_rental_status, 'EXPIRING'::slot_rental_status, 'GRACE'::slot_rental_status, 'LIQUIDATED'::slot_rental_status]))`

### `agreement_versions`

Hợp đồng khung do nền tảng soạn, giống nhau cho mọi thương hiệu (ADR-0013). Bản nháp sửa được; đã công bố (published_at) thì nội dung bất biến. Đổi điều khoản = công bố phiên bản mới.

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `version` | `character varying(20)` | — |  |  |
| `title` | `character varying(200)` | — |  |  |
| `content` | `text` | — |  |  |
| `content_hash` | `character(64)` | — |  | SHA-256 (hex) của content — thứ được lưu lại trong agreement_acceptances làm bằng chứng. |
| `is_current` | `boolean` | — | `false` |  |
| `published_at` | `timestamp with time zone` | có |  |  |
| `created_by` | `uuid` | — |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |

**Ràng buộc kiểm tra**

- `chk_agreement_current_published` — `CHECK (((NOT is_current) OR (published_at IS NOT NULL)))`

**Khóa ngoại**

- `agreement_versions_created_by_fkey` — `FOREIGN KEY (created_by) REFERENCES users(id)`

**Index**

- `agreement_versions_pkey` (UNIQUE) — `USING btree (id)`
- `uq_agreement_version` (UNIQUE) — `USING btree (version)`
- `uq_agreement_version_current` (UNIQUE) — `USING btree (is_current) WHERE is_current`

### `agreement_acceptances`

Bằng chứng thương hiệu đồng ý hợp đồng khung (FRAMEWORK) hoặc phụ lục của một phiên thanh toán (ANNEX) — ADR-0013. Chỉ thêm mới: trigger và REVOKE như audit_logs.

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `brand_id` | `uuid` | — |  |  |
| `accepted_by` | `uuid` | — |  |  |
| `kind` | `agreement_kind` | — |  |  |
| `agreement_version_id` | `uuid` | — |  | FRAMEWORK: phiên bản được đồng ý. ANNEX: phiên bản hợp đồng khung mà phụ lục thuộc về (= rental_checkouts.agreement_version_id). |
| `rental_checkout_id` | `uuid` | có |  |  |
| `content_hash` | `character(64)` | — |  | SHA-256 (hex) của đúng văn bản người dùng đã thấy: nội dung hợp đồng khung, hoặc phụ lục sinh từ ảnh chụp giá của các hóa đơn trong phiên (FR-SLT-50). |
| `ip_address` | `inet` | — |  |  |
| `user_agent` | `text` | có |  |  |
| `accepted_at` | `timestamp with time zone` | — | `now()` |  |

**Ràng buộc kiểm tra**

- `chk_acceptance_annex_has_checkout` — `CHECK (((kind = 'ANNEX'::agreement_kind) = (rental_checkout_id IS NOT NULL)))`

**Khóa ngoại**

- `agreement_acceptances_accepted_by_fkey` — `FOREIGN KEY (accepted_by) REFERENCES users(id)`
- `agreement_acceptances_agreement_version_id_fkey` — `FOREIGN KEY (agreement_version_id) REFERENCES agreement_versions(id)`
- `agreement_acceptances_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `fk_acceptance_checkout_same_brand` — `FOREIGN KEY (rental_checkout_id, brand_id) REFERENCES rental_checkouts(id, brand_id)` — *ràng buộc cùng thương hiệu*

**Index**

- `agreement_acceptances_pkey` (UNIQUE) — `USING btree (id)`
- `uq_acceptance_annex` (UNIQUE) — `USING btree (rental_checkout_id) WHERE (kind = 'ANNEX'::agreement_kind)`
- `uq_acceptance_framework` (UNIQUE) — `USING btree (brand_id, agreement_version_id) WHERE (kind = 'FRAMEWORK'::agreement_kind)`

### `brand_payouts`

Kỳ chi trả doanh thu lượt xịt hằng tháng cho một thương hiệu (ADR-0013): DRAFT → CONFIRMED → PAID. Tính đơn revenue_owner = BRAND ở DISPENSED hoặc FORFEITED; không trừ phí cổng hay khoản đã hoàn cho khách (FR-SLT-18).

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `brand_id` | `uuid` | — |  |  |
| `period_month` | `date` | — |  | Ngày đầu tháng dương lịch của kỳ, theo giờ Việt Nam (Asia/Ho_Chi_Minh). |
| `status` | `brand_payout_status` | — | `'DRAFT'::brand_payout_status` |  |
| `currency` | `character(3)` | — | `'VND'::bpchar` |  |
| `order_count` | `integer` | — | `0` |  |
| `amount` | `numeric(19,4)` | — | `0` | DRAFT: số cộng dồn tạm, tính lại mỗi lần cập nhật. Từ CONFIRMED trở đi: số đã khóa, không đổi. |
| `confirmed_at` | `timestamp with time zone` | có |  |  |
| `paid_at` | `timestamp with time zone` | có |  |  |
| `paid_by` | `uuid` | có |  |  |
| `transfer_reference` | `character varying(100)` | có |  | Mã giao dịch chuyển khoản Super Admin nhập khi chuyển PAID, sau khi xác thực lại (FR-SLT-53). |
| `dispute_note` | `text` | có |  | Khiếu nại số liệu của Brand Admin trên kỳ CONFIRMED (FR-SLT-54) — mỗi kỳ một khiếu nại. |
| `disputed_at` | `timestamp with time zone` | có |  |  |
| `disputed_by` | `uuid` | có |  |  |
| `dispute_response` | `text` | có |  |  |
| `dispute_resolved_at` | `timestamp with time zone` | có |  |  |
| `dispute_resolved_by` | `uuid` | có |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |

**Ràng buộc kiểm tra**

- `chk_payout_amounts_nonnegative` — `CHECK (((amount >= (0)::numeric) AND (order_count >= 0)))`
- `chk_payout_confirmed_at` — `CHECK (((status = 'DRAFT'::brand_payout_status) = (confirmed_at IS NULL)))`
- `chk_payout_dispute_fields` — `CHECK (((num_nulls(dispute_note, disputed_at, disputed_by) = ANY (ARRAY[0, 3])) AND (num_nulls(dispute_response, dispute_resolved_at, dispute_resolved_by) = ANY (ARRAY[0, 3]))))`
- `chk_payout_dispute_on_confirmed` — `CHECK (((disputed_at IS NULL) OR (status <> 'DRAFT'::brand_payout_status)))`
- `chk_payout_dispute_resolution_after_dispute` — `CHECK (((dispute_resolved_at IS NULL) OR (disputed_at IS NOT NULL)))`
- `chk_payout_paid` — `CHECK ((((status = 'PAID'::brand_payout_status) = (paid_at IS NOT NULL)) AND ((status <> 'PAID'::brand_payout_status) OR ((paid_by IS NOT NULL) AND (transfer_reference IS NOT NULL)))))`
- `chk_payout_paid_dispute_resolved` — `CHECK (((status <> 'PAID'::brand_payout_status) OR (disputed_at IS NULL) OR (dispute_resolved_at IS NOT NULL)))`
- `chk_payout_period_first_day` — `CHECK ((EXTRACT(day FROM period_month) = (1)::numeric))`

**Khóa ngoại**

- `brand_payouts_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `brand_payouts_dispute_resolved_by_fkey` — `FOREIGN KEY (dispute_resolved_by) REFERENCES users(id)`
- `brand_payouts_disputed_by_fkey` — `FOREIGN KEY (disputed_by) REFERENCES users(id)`
- `brand_payouts_paid_by_fkey` — `FOREIGN KEY (paid_by) REFERENCES users(id)`

**Index**

- `brand_payouts_pkey` (UNIQUE) — `USING btree (id)`
- `idx_brand_payouts_status` — `USING btree (status, period_month)`
- `uq_brand_payout_period` (UNIQUE) — `USING btree (brand_id, period_month)`

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
- `fk_shipment_product_same_brand` — `FOREIGN KEY (fragrance_product_id, brand_id) REFERENCES fragrance_products(id, brand_id)` — *ràng buộc cùng thương hiệu*

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
| `authenticity_status` | `batch_authenticity_status` | — | `'NOT_SUBMITTED'::batch_authenticity_status` | Xác minh giấy tờ chính hãng của lô (FR-INV-33 ÷ 35, ADR-0013, ADR-0017). Chỉ chai thuộc lô APPROVED mới được lắp vào slot (BATCH_NOT_APPROVED). |
| `authenticity_document_url` | `character varying(1000)` | có |  |  |
| `authenticity_document_type` | `character varying(50)` | có |  |  |
| `authenticity_submitted_by` | `uuid` | có |  |  |
| `authenticity_submitted_at` | `timestamp with time zone` | có |  |  |
| `authenticity_verified_by` | `uuid` | có |  |  |
| `authenticity_verified_at` | `timestamp with time zone` | có |  |  |
| `authenticity_rejection_reason` | `text` | có |  |  |

**Ràng buộc kiểm tra**

- `chk_batch_authenticity_rejection` — `CHECK (((authenticity_status = 'REJECTED'::batch_authenticity_status) = (authenticity_rejection_reason IS NOT NULL)))`
- `chk_batch_authenticity_submitted` — `CHECK (((authenticity_status = 'NOT_SUBMITTED'::batch_authenticity_status) OR ((authenticity_document_url IS NOT NULL) AND (authenticity_submitted_by IS NOT NULL) AND (authenticity_submitted_at IS NOT NULL))))`
- `chk_batch_authenticity_verified` — `CHECK (((authenticity_status = ANY (ARRAY['APPROVED'::batch_authenticity_status, 'REJECTED'::batch_authenticity_status])) = ((authenticity_verified_by IS NOT NULL) AND (authenticity_verified_at IS NOT NULL))))`
- `chk_batch_quantity_positive` — `CHECK ((quantity_received > 0))`

**Khóa ngoại**

- `fk_batch_product_same_brand` — `FOREIGN KEY (fragrance_product_id, brand_id) REFERENCES fragrance_products(id, brand_id)` — *ràng buộc cùng thương hiệu*
- `inventory_batches_authenticity_submitted_by_fkey` — `FOREIGN KEY (authenticity_submitted_by) REFERENCES users(id)`
- `inventory_batches_authenticity_verified_by_fkey` — `FOREIGN KEY (authenticity_verified_by) REFERENCES users(id)`
- `inventory_batches_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `inventory_batches_created_by_fkey` — `FOREIGN KEY (created_by) REFERENCES users(id)`
- `inventory_batches_fragrance_product_id_fkey` — `FOREIGN KEY (fragrance_product_id) REFERENCES fragrance_products(id)`
- `inventory_batches_source_declaration_id_fkey` — `FOREIGN KEY (source_declaration_id) REFERENCES brand_shipment_declarations(id)`

**Index**

- `idx_batches_authenticity` — `USING btree (authenticity_status, brand_id)`
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
| `source_rental_id` | `uuid` | có |  | Hóa đơn mà chai đang phục vụ tại thời điểm thanh lý (FR-EXP-16). |
| `liquidated_at` | `timestamp with time zone` | có |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |
| `bottle_return_id` | `uuid` | có |  | Phiếu trả hàng chứa chai này (FR-EXP-26). Bắt buộc khi status = RETURNED_TO_BRAND. |
| `damaged_at` | `timestamp with time zone` | có |  | Thời điểm Inventory Staff ghi nhận chai hư hỏng (POST /bottles/{id}/mark-damaged, ADR-0018). |
| `damage_reason` | `text` | có |  | Lý do hư hỏng do Inventory Staff nhập — căn cứ của khoản bồi thường (FR-SLT-44). |

**Ràng buộc kiểm tra**

- `chk_bottle_current_nonnegative` — `CHECK ((current_estimated_ml >= (0)::numeric))`
- `chk_bottle_initial_nonnegative` — `CHECK ((initial_volume_ml >= (0)::numeric))`
- `chk_bottle_returned_has_return` — `CHECK ((((status)::text <> 'RETURNED_TO_BRAND'::text) OR (bottle_return_id IS NOT NULL)))`

**Khóa ngoại**

- `bottles_batch_id_fkey` — `FOREIGN KEY (batch_id) REFERENCES inventory_batches(id)`
- `bottles_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `bottles_fragrance_product_id_fkey` — `FOREIGN KEY (fragrance_product_id) REFERENCES fragrance_products(id)`
- `bottles_source_rental_id_fkey` — `FOREIGN KEY (source_rental_id) REFERENCES slot_rentals(id)`
- `fk_bottle_batch_same_brand` — `FOREIGN KEY (batch_id, brand_id) REFERENCES inventory_batches(id, brand_id)` — *ràng buộc cùng thương hiệu*
- `fk_bottle_return_same_brand` — `FOREIGN KEY (bottle_return_id, brand_id) REFERENCES bottle_returns(id, brand_id)` — *ràng buộc cùng thương hiệu*

**Index**

- `bottles_pkey` (UNIQUE) — `USING btree (id)`
- `idx_bottles_batch` — `USING btree (batch_id)`
- `idx_bottles_brand_status_expiry` — `USING btree (brand_id, status, expires_at)`
- `idx_bottles_return` — `USING btree (bottle_return_id) WHERE (bottle_return_id IS NOT NULL)`
- `uq_bottle_brand_identifier` (UNIQUE) — `USING btree (brand_id, identifier)`
- `uq_bottle_id_brand` (UNIQUE) — `USING btree (id, brand_id)`

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
- `uq_slot_open_refill_session` (UNIQUE) — `USING btree (slot_id) WHERE (status = 'STARTED'::refill_status)`

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

### `storage_compensations`

Khoản bồi thường khi chai của thương hiệu chuyển DAMAGED lúc nền tảng đang giữ (FR-SLT-44). Tiền chuyển ngoài hệ thống; Super Admin ghi nhận chi trả sau khi xác thực lại (FR-SLT-45).

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `brand_id` | `uuid` | — |  |  |
| `bottle_id` | `uuid` | — |  |  |
| `slot_rental_id` | `uuid` | — |  | Hóa đơn có gói bảo quản được áp: hóa đơn của slot chai đang lắp, hoặc — với chai trong kho — hóa đơn hiệu lực có coverage_percent cao nhất của thương hiệu. Hạn mức cộng dồn theo cột này. |
| `bottle_retail_price` | `numeric(19,4)` | — |  |  |
| `coverage_percent` | `numeric(5,2)` | — |  |  |
| `amount` | `numeric(19,4)` | — |  | min(coverage_percent × bottle_retail_price, hạn mức còn lại của hóa đơn). Domain service tính. |
| `currency` | `character(3)` | — | `'VND'::bpchar` |  |
| `status` | `storage_compensation_status` | — | `'PENDING'::storage_compensation_status` |  |
| `payout_reference` | `character varying(200)` | có |  |  |
| `paid_by` | `uuid` | có |  |  |
| `paid_at` | `timestamp with time zone` | có |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |

**Ràng buộc kiểm tra**

- `chk_compensation_amounts_nonnegative` — `CHECK (((bottle_retail_price >= (0)::numeric) AND (amount >= (0)::numeric)))`
- `chk_compensation_coverage_percent` — `CHECK (((coverage_percent >= (0)::numeric) AND (coverage_percent <= (100)::numeric)))`
- `chk_compensation_paid_fields` — `CHECK (((status = 'PAID'::storage_compensation_status) = ((paid_at IS NOT NULL) AND (paid_by IS NOT NULL) AND (payout_reference IS NOT NULL))))`

**Khóa ngoại**

- `fk_compensation_bottle_same_brand` — `FOREIGN KEY (bottle_id, brand_id) REFERENCES bottles(id, brand_id)` — *ràng buộc cùng thương hiệu*
- `fk_compensation_rental_same_brand` — `FOREIGN KEY (slot_rental_id, brand_id) REFERENCES slot_rentals(id, brand_id)` — *ràng buộc cùng thương hiệu*
- `storage_compensations_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `storage_compensations_paid_by_fkey` — `FOREIGN KEY (paid_by) REFERENCES users(id)`

**Index**

- `idx_compensations_brand_status` — `USING btree (brand_id, status, created_at)`
- `idx_compensations_rental` — `USING btree (slot_rental_id)`
- `storage_compensations_pkey` (UNIQUE) — `USING btree (id)`
- `uq_compensation_bottle` (UNIQUE) — `USING btree (bottle_id)`

### `bottle_returns`

Phiếu trả hàng khi thương hiệu chủ động không gia hạn (ADR-0014). Lập lúc Inventory Staff tháo chai (FR-EXP-26); đóng bằng bàn giao (FR-EXP-27) hoặc quá hạn nhận → chuyển sở hữu về nền tảng như thanh lý (FR-EXP-28). Chai trên phiếu trỏ về đây qua bottles.bottle_return_id.

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `slot_rental_id` | `uuid` | — |  |  |
| `brand_id` | `uuid` | — |  |  |
| `return_method` | `bottle_return_method` | — |  |  |
| `shipping_address` | `text` | có |  | Địa chỉ gửi hàng khi SHIP_TO_BRAND — ảnh chụp lúc lập phiếu; phí vận chuyển thu ngoài hệ thống. |
| `ready_at` | `timestamp with time zone` | — |  |  |
| `pickup_deadline` | `timestamp with time zone` | — |  | ready_at + RETURN_PICKUP_MAX_DAYS. Báo trước cho Brand Admin 3 ngày (reminder_sent_at). |
| `reminder_sent_at` | `timestamp with time zone` | có |  |  |
| `handed_over_at` | `timestamp with time zone` | có |  |  |
| `handed_over_by` | `uuid` | có |  |  |
| `recipient_name` | `character varying(200)` | có |  |  |
| `tracking_number` | `character varying(100)` | có |  |  |
| `forfeited_at` | `timestamp with time zone` | có |  | Quá hạn nhận hàng: mọi chai trên phiếu chuyển owner = PLATFORM, status LIQUIDATED (FR-EXP-28). |
| `created_by` | `uuid` | — |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |

**Ràng buộc kiểm tra**

- `chk_bottle_return_closed_once` — `CHECK (((handed_over_at IS NULL) OR (forfeited_at IS NULL)))`
- `chk_bottle_return_deadline` — `CHECK ((pickup_deadline > ready_at))`
- `chk_bottle_return_handover_fields` — `CHECK ((num_nulls(handed_over_at, handed_over_by, recipient_name) = ANY (ARRAY[0, 3])))`
- `chk_bottle_return_ship_address` — `CHECK (((return_method <> 'SHIP_TO_BRAND'::bottle_return_method) OR (shipping_address IS NOT NULL)))`
- `chk_bottle_return_shipped_has_tracking` — `CHECK (((return_method <> 'SHIP_TO_BRAND'::bottle_return_method) OR (handed_over_at IS NULL) OR (tracking_number IS NOT NULL)))`

**Khóa ngoại**

- `bottle_returns_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `bottle_returns_created_by_fkey` — `FOREIGN KEY (created_by) REFERENCES users(id)`
- `bottle_returns_handed_over_by_fkey` — `FOREIGN KEY (handed_over_by) REFERENCES users(id)`
- `fk_bottle_return_rental_same_brand` — `FOREIGN KEY (slot_rental_id, brand_id) REFERENCES slot_rentals(id, brand_id)` — *ràng buộc cùng thương hiệu*

**Index**

- `bottle_returns_pkey` (UNIQUE) — `USING btree (id)`
- `idx_bottle_returns_brand` — `USING btree (brand_id, created_at)`
- `idx_bottle_returns_pending` — `USING btree (pickup_deadline) WHERE ((handed_over_at IS NULL) AND (forfeited_at IS NULL))`
- `uq_bottle_return_id_brand` (UNIQUE) — `USING btree (id, brand_id)`
- `uq_bottle_return_rental` (UNIQUE) — `USING btree (slot_rental_id)`

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
| `needs_manual_review` | `boolean` | — | `false` | Đặt true khi đã thanh toán nhưng lượt xịt thất bại, không xác định, bị thiết bị từ chối (kể cả trước khi đèn sáng) hoặc chờ lượt quá PAID_QUEUE_MAX_SEC (FR-ORD-19, FR-ORD-34, ADR-0015). Không đặt với đơn FORFEITED. Dẫn vào luồng hoàn tiền thủ công (FR-ORD-20, ADR-0012). |
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
- `idx_orders_paid_queue` — `USING btree (paid_at) WHERE (status = 'PAID'::order_status)`
- `idx_orders_rental` — `USING btree (slot_rental_id)`
- `idx_orders_slot` — `USING btree (slot_id)`
- `orders_idempotency_key_key` (UNIQUE) — `USING btree (idempotency_key)`
- `orders_payment_reference_key` (UNIQUE) — `USING btree (payment_reference)`
- `orders_pkey` (UNIQUE) — `USING btree (id)`
- `uq_machine_open_order` (UNIQUE) — `USING btree (machine_id) WHERE (status = ANY (ARRAY['CREATED'::order_status, 'PENDING_PAYMENT'::order_status]))`
- `uq_order_id_brand` (UNIQUE) — `USING btree (id, brand_id)`

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

Không lưu thông tin thẻ của khách, và không lưu tài khoản ngân hàng của khách — tài khoản nhận hoàn tiền chỉ nằm trong refund_claims (NFR-DAT-04, ADR-0012). raw_response chỉ chứa phản hồi của cổng thanh toán đã loại dữ liệu nhạy cảm, kể cả tài khoản người chuyển.

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `brand_id` | `uuid` | — |  |  |
| `order_id` | `uuid` | có |  | Đơn kiosk được thanh toán. Đúng một trong order_id, rental_checkout_id có giá trị (chk_payment_single_target). |
| `provider` | `character varying(50)` | — |  |  |
| `provider_transaction_id` | `character varying(200)` | có |  |  |
| `provider_reference` | `character varying(200)` | có |  | Mã tham chiếu cổng thanh toán gửi lại trong webhook (FR-ORD-14). Cổng có mã riêng thì lưu mã của cổng — PayOS: orderCode (số nguyên, ADR-0016); cổng không có (mock) thì lưu mã hệ thống: đơn kiosk bằng orders.payment_reference, phiên thuê slot mã riêng cho MỖI payment. Duy nhất theo provider (uq_payment_provider_reference, ADR-0009). |
| `amount` | `numeric(19,4)` | — |  |  |
| `currency` | `character(3)` | — |  |  |
| `status` | `payment_status` | — | `'PENDING'::payment_status` |  |
| `raw_response` | `jsonb` | có |  |  |
| `paid_at` | `timestamp with time zone` | có |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |
| `rental_checkout_id` | `uuid` | có |  | Phiên thanh toán thuê slot được thanh toán (FR-SLT-37, ADR-0008) — một thanh toán cho mọi hóa đơn trong phiên. Mỗi phiên tối đa một payment PENDING (uq_checkout_payment_pending). |

**Ràng buộc kiểm tra**

- `chk_payment_amount_nonnegative` — `CHECK ((amount >= (0)::numeric))`
- `chk_payment_single_target` — `CHECK ((num_nonnulls(order_id, rental_checkout_id) = 1))`

**Khóa ngoại**

- `fk_payment_checkout_same_brand` — `FOREIGN KEY (rental_checkout_id, brand_id) REFERENCES rental_checkouts(id, brand_id)` — *ràng buộc cùng thương hiệu*
- `payments_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `payments_order_id_fkey` — `FOREIGN KEY (order_id) REFERENCES orders(id)`

**Index**

- `idx_payments_brand_status` — `USING btree (brand_id, status, created_at)`
- `idx_payments_checkout` — `USING btree (rental_checkout_id) WHERE (rental_checkout_id IS NOT NULL)`
- `idx_payments_order` — `USING btree (order_id)`
- `payments_pkey` (UNIQUE) — `USING btree (id)`
- `uq_checkout_payment_pending` (UNIQUE) — `USING btree (rental_checkout_id) WHERE ((rental_checkout_id IS NOT NULL) AND (status = 'PENDING'::payment_status))`
- `uq_payment_provider_reference` (UNIQUE) — `USING btree (provider, provider_reference) WHERE (provider_reference IS NOT NULL)`
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
| `brand_id` | `uuid` | có |  | Có giá trị với lệnh CUSTOMER (chép từ đơn). NULL với lệnh DIAGNOSTIC chạy trên slot chưa có hóa đơn nào. |
| `order_id` | `uuid` | có |  |  |
| `machine_id` | `uuid` | — |  |  |
| `slot_id` | `uuid` | — |  |  |
| `command_type` | `dispense_type` | — |  |  |
| `command_token` | `character varying(255)` | — |  | Mã lệnh duy nhất toàn hệ thống (FR-DSP-02). Thiết bị lưu lại để từ chối lệnh trùng (FR-DSP-10, lỗi CMD_DUPLICATE). |
| `signature` | `text` | — |  |  |
| `status` | `command_status` | — | `'CREATED'::command_status` |  |
| `expires_at` | `timestamp with time zone` | — |  | created_at + DISPENSE_CMD_TTL_SEC (FR-DSP-06): hạn để thiết bị NHẬN lệnh và sáng đèn nút. Thời gian khách được bấm là DISPENSE_PRESS_WINDOW_SEC, tính từ lúc sáng đèn (ADR-0007). |
| `sent_at` | `timestamp with time zone` | có |  |  |
| `acknowledged_at` | `timestamp with time zone` | có |  | Lệnh CUSTOMER: lúc đèn nút của slot đích sáng, bắt đầu chờ khách bấm (FR-DSP-11, FR-DSP-21). Lệnh DIAGNOSTIC: lúc thiết bị nhận lệnh, kích hoạt ngay sau đó (FR-DSP-27). |
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
- `idx_commands_slot_customer` — `USING btree (slot_id, created_at) WHERE (command_type = 'CUSTOMER'::dispense_type)`
- `uq_machine_active_customer_command` (UNIQUE) — `USING btree (machine_id) WHERE ((command_type = 'CUSTOMER'::dispense_type) AND (status = ANY (ARRAY['CREATED'::command_status, 'SENT'::command_status, 'ACKNOWLEDGED'::command_status])))`
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

### `refund_claims`

Phiếu khiếu nại hoàn tiền thủ công (ADR-0012). Chỗ DUY NHẤT được lưu tài khoản ngân hàng của khách (NFR-DAT-04): mã hóa tầng ứng dụng, xóa khi phiếu đóng. Không ghi dữ liệu tài khoản vào audit_logs, log, payment_events hay notifications.

| Cột | Kiểu | Null | Mặc định | Mô tả |
|---|---|---|---|---|
| `id` | `uuid` | — | `gen_random_uuid()` |  |
| `order_id` | `uuid` | — |  |  |
| `brand_id` | `uuid` | — |  |  |
| `status` | `refund_claim_status` | — | `'OPEN'::refund_claim_status` |  |
| `refund_order` | `boolean` | — |  | TRUE: hoàn cả tiền đơn (khách không nhận được lượt xịt) — ghi nhận hoàn thì đơn chuyển REFUNDED. FALSE: chỉ hoàn tiền chuyển khoản thừa (EXTRA_TRANSFER), trạng thái đơn giữ nguyên. |
| `amount` | `numeric(19,4)` | — |  | Số tiền phải hoàn, tính lúc tạo phiếu: tiền đơn (nếu refund_order) cộng các khoản chuyển thừa. |
| `currency` | `character(3)` | — |  |  |
| `account_ciphertext` | `bytea` | có |  | Tài khoản nhận hoàn tiền (mã ngân hàng, số tài khoản, tên chủ tài khoản), AES-256-GCM tầng ứng dụng. Chỉ Operations Staff được phân công giải mã, sau khi xác thực lại. NULL ngay khi phiếu đóng. |
| `contact_ciphertext` | `bytea` | có |  | Số điện thoại hoặc email liên hệ, mã hóa riêng. Giữ thêm REFUND_CLAIM_CONTACT_RETENTION_DAYS ngày sau khi đóng phiếu rồi job xóa. |
| `pii_key_version` | `smallint` | — |  | Phiên bản khóa đã mã hóa hai khối trên — để xoay khóa mà vẫn đọc được phiếu cũ. |
| `consented_at` | `timestamp with time zone` | — |  | Thời điểm khách tick đồng ý xử lý dữ liệu cá nhân trên trang khiếu nại. |
| `assigned_to` | `uuid` | có |  |  |
| `assigned_at` | `timestamp with time zone` | có |  |  |
| `payout_reference` | `character varying(100)` | có |  | Mã giao dịch chuyển khoản hoàn tiền nhân viên nhập khi ghi nhận đã hoàn. Bắt buộc khi REFUNDED. |
| `resolution_note` | `text` | có |  |  |
| `resolved_by` | `uuid` | có |  |  |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |
| `closed_at` | `timestamp with time zone` | có |  |  |
| `account_purged_at` | `timestamp with time zone` | có |  |  |
| `contact_purged_at` | `timestamp with time zone` | có |  |  |

**Ràng buộc kiểm tra**

- `chk_refund_claim_account_purged_on_close` — `CHECK (((status = 'OPEN'::refund_claim_status) OR ((account_ciphertext IS NULL) AND (account_purged_at IS NOT NULL))))`
- `chk_refund_claim_amount_positive` — `CHECK ((amount > (0)::numeric))`
- `chk_refund_claim_assignment` — `CHECK (((assigned_to IS NULL) = (assigned_at IS NULL)))`
- `chk_refund_claim_closed_at` — `CHECK (((status = 'OPEN'::refund_claim_status) = (closed_at IS NULL)))`
- `chk_refund_claim_contact_purge` — `CHECK (((contact_purged_at IS NULL) OR (contact_ciphertext IS NULL)))`
- `chk_refund_claim_open_has_account` — `CHECK (((status <> 'OPEN'::refund_claim_status) OR (account_ciphertext IS NOT NULL)))`
- `chk_refund_claim_refunded_has_payout` — `CHECK (((status <> 'REFUNDED'::refund_claim_status) OR (payout_reference IS NOT NULL)))`
- `chk_refund_claim_rejected_has_note` — `CHECK (((status <> 'REJECTED'::refund_claim_status) OR (resolution_note IS NOT NULL)))`

**Khóa ngoại**

- `fk_refund_claim_order_same_brand` — `FOREIGN KEY (order_id, brand_id) REFERENCES orders(id, brand_id)` — *ràng buộc cùng thương hiệu*
- `refund_claims_assigned_to_fkey` — `FOREIGN KEY (assigned_to) REFERENCES users(id)`
- `refund_claims_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `refund_claims_resolved_by_fkey` — `FOREIGN KEY (resolved_by) REFERENCES users(id)`

**Index**

- `idx_refund_claims_assigned` — `USING btree (assigned_to, status)`
- `idx_refund_claims_contact_purge` — `USING btree (closed_at) WHERE (contact_ciphertext IS NOT NULL)`
- `idx_refund_claims_status` — `USING btree (status, created_at)`
- `refund_claims_pkey` (UNIQUE) — `USING btree (id)`
- `uq_refund_claim_order` (UNIQUE) — `USING btree (order_id)`

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
| `refill_session_id` | `uuid` | có |  | Phiên nạp thực tế liên kết (FR-RFQ-08). Chỉ đặt được COMPLETED khi cột này có giá trị (FR-RFQ-09) — chk_refill_request_completed_has_session. |
| `created_at` | `timestamp with time zone` | — | `now()` |  |
| `updated_at` | `timestamp with time zone` | — | `now()` |  |
| `note` | `text` | có |  | Ghi chú của Brand Admin khi tạo yêu cầu (RefillRequestCreate.note). |

**Ràng buộc kiểm tra**

- `chk_refill_request_completed_has_session` — `CHECK ((((status)::text <> 'COMPLETED'::text) OR (refill_session_id IS NOT NULL)))`

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
| `recipient_address` | `character varying(320)` | có |  | Hòm thư nhận tại thời điểm gửi (FR-ALR-16 AC2) — chụp lại, không đọc lại từ users. |
| `reference_id` | `character varying(100)` | có |  | Mã sự kiện nghiệp vụ sinh ra thông báo, ví dụ id phiên thanh toán thuê slot (FR-ALR-16 AC2). |
| `provider_message_id` | `character varying(255)` | có |  | Mã thư do dịch vụ email trả về khi nhận gửi (FR-ALR-16 AC2). |
| `delivery_attempts` | `integer` | — | `0` | Số lần đã thử gửi email. Job dừng tự thử khi đạt EMAIL_MAX_ATTEMPTS (FR-ALR-16 AC3). |
| `last_attempt_at` | `timestamp with time zone` | có |  |  |
| `last_error` | `text` | có |  | Phản hồi lỗi của dịch vụ email ở lần thử gần nhất (FR-ALR-16 AC2). |

**Ràng buộc kiểm tra**

- `chk_notification_attempts_nonnegative` — `CHECK ((delivery_attempts >= 0))`

**Khóa ngoại**

- `notifications_brand_id_fkey` — `FOREIGN KEY (brand_id) REFERENCES brands(id)`
- `notifications_recipient_user_id_fkey` — `FOREIGN KEY (recipient_user_id) REFERENCES users(id)`

**Index**

- `idx_notifications_email_outbox` — `USING btree (status, last_attempt_at) WHERE (((channel)::text = 'EMAIL'::text) AND (status = ANY (ARRAY['PENDING'::notification_status, 'FAILED'::notification_status])))`
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

