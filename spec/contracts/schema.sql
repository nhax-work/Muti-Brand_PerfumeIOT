-- =====================================================================================
-- ScentStation — Lược đồ CSDL (PostgreSQL 16)
--
-- CONTRACT ĐÓNG BĂNG. Không sửa trực tiếp file này.
-- Muốn đổi: viết ADR trong spec/decisions/, TV1 duyệt, rồi mới sửa (spec/contracts/README.md).
--
-- Nguồn thiết kế : seed_document/DB_DIAGRAM_MERMAID.md
-- Chuẩn đặt tên  : spec/decisions/0002-chuan-dat-ten-va-kieu-du-lieu-csdl.md
-- Quy mô         : 25 enum · 38 bảng · 4 partial unique index bắt buộc · 1 exclusion constraint
-- Cập nhật       : ADR-0006 (thuê slot theo gói trả trước, hóa đơn, bảo hiểm hàng hóa) — áp bằng
--                  migrations/1790665900000_slot-rental-status-cancelled.sql và
--                  migrations/1790665960000_prepaid-rental-packages.sql. Cột thêm bằng ALTER TABLE
--                  được đặt CUỐI mỗi bảng dưới đây để khớp thứ tự cột thật trong CSDL.
--                  ADR-0007 (khách bấm nút vật lý) — order_status thêm FORFEITED, index
--                  uq_machine_active_customer_command; áp bằng migrations/1790752000000_* và
--                  migrations/1790752060000_*.
--
-- Bố cục file:
--   §1  Extension
--   §2  Enum
--   §3  Bảng — Identity và Brands
--   §4  Bảng — Catalog và Machines
--   §5  Bảng — Inventory
--   §6  Bảng — Orders và Payments
--   §7  Bảng — Operations
--   §8  Bảng — Device và IoT
--   §9  Khóa ngoại vòng (tách ra vì phụ thuộc hai chiều)
--   §10 Index và ràng buộc bắt buộc (spec/contracts/README.md)
--   §11 Audit log append-only (FR-AUD-09, NFR-SEC-08)
--   §12 Row-Level Security — mẫu, chưa bật
--   §13 Ràng buộc thuộc tầng domain service, KHÔNG nằm ở CSDL
--
-- Quy ước chung:
--   - Mọi thời điểm là timestamptz, lưu ở UTC (NFR-DAT-01).
--   - Mọi cột tiền là numeric(19,4), không dùng float (NFR-DAT-02, ADR-0002).
--   - Mọi khóa chính là uuid, mặc định gen_random_uuid().
-- =====================================================================================


-- =====================================================================================
-- §1. EXTENSION
-- =====================================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;      -- users.email không phân biệt hoa thường
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- exclusion constraint chống chồng lấn kỳ hạn thuê


-- =====================================================================================
-- §2. ENUM
-- =====================================================================================

CREATE TYPE brand_status AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

CREATE TYPE user_status AS ENUM ('INVITED', 'ACTIVE', 'LOCKED', 'DISABLED');

CREATE TYPE machine_connection_status AS ENUM ('ONLINE', 'UNSTABLE', 'OFFLINE');

CREATE TYPE machine_operating_mode AS ENUM ('NORMAL', 'MAINTENANCE', 'DISABLED');

CREATE TYPE slot_status AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'MAINTENANCE', 'DISABLED');

CREATE TYPE bottle_status AS ENUM (
    'IN_STOCK', 'INSTALLED', 'LOW', 'EMPTY', 'DAMAGED', 'EXPIRED', 'LIQUIDATED'
);

CREATE TYPE refill_status AS ENUM ('STARTED', 'COMPLETED', 'CANCELLED');

-- FORFEITED thêm theo ADR-0007: khách không bấm nút trong DISPENSE_PRESS_WINDOW_SEC (FR-ORD-27).
CREATE TYPE order_status AS ENUM (
    'CREATED', 'PENDING_PAYMENT', 'PAID', 'DISPENSE_REQUESTED', 'DISPENSED',
    'FAILED', 'EXPIRED', 'REFUND_PENDING', 'REFUNDED', 'FORFEITED'
);

CREATE TYPE payment_status AS ENUM (
    'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED',
    'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED'
);

-- ACKNOWLEDGED/SUCCEEDED thay cho ACKED/SUCCESS; REJECTED tách khỏi FAILED (ADR-0002)
CREATE TYPE command_status AS ENUM (
    'CREATED', 'SENT', 'ACKNOWLEDGED', 'SUCCEEDED', 'FAILED', 'REJECTED', 'EXPIRED', 'UNKNOWN'
);

CREATE TYPE dispense_type AS ENUM ('CUSTOMER', 'DIAGNOSTIC');

CREATE TYPE alert_severity AS ENUM ('INFO', 'WARNING', 'HIGH', 'CRITICAL');

CREATE TYPE alert_status AS ENUM ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

CREATE TYPE ticket_status AS ENUM (
    'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_PART', 'POST_TEST', 'RESOLVED', 'CLOSED', 'REOPENED'
);

CREATE TYPE ticket_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TYPE credential_status AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

CREATE TYPE notification_status AS ENUM ('PENDING', 'SENT', 'FAILED', 'READ');

-- CANCELLED thêm theo ADR-0006: hóa đơn DRAFT hết giờ giữ chỗ mà chưa thanh toán (FR-SLT-39).
CREATE TYPE slot_rental_status AS ENUM (
    'DRAFT', 'ACTIVE', 'EXPIRING', 'GRACE', 'RENEWED', 'LIQUIDATED', 'CLOSED', 'TERMINATED',
    'CANCELLED'
);

CREATE TYPE revenue_owner_type AS ENUM ('BRAND', 'PLATFORM');

CREATE TYPE kiosk_interaction_type AS ENUM ('PRODUCT_IMPRESSION', 'PRODUCT_SELECTED');

CREATE TYPE refill_request_status AS ENUM (
    'SUBMITTED', 'ACCEPTED', 'REJECTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED'
);

CREATE TYPE refill_request_reason AS ENUM ('LOW_STOCK', 'EXPIRING', 'PRODUCT_CHANGE');

CREATE TYPE slot_rental_request_status AS ENUM (
    'REQUESTED', 'APPROVED', 'REJECTED', 'CONVERTED', 'CANCELLED'
);

CREATE TYPE shipment_declaration_status AS ENUM (
    'DECLARED', 'RECEIVED', 'DISCREPANCY', 'CANCELLED'
);

CREATE TYPE storage_compensation_status AS ENUM ('PENDING', 'PAID');


-- =====================================================================================
-- §3. BẢNG — IDENTITY VÀ BRANDS
-- =====================================================================================

CREATE TABLE brands (
    id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    code          varchar(50)  NOT NULL UNIQUE,
    name          varchar(200) NOT NULL,
    logo_url      text,
    description   text,
    contact_info  jsonb,
    kiosk_content jsonb,
    status        brand_status NOT NULL DEFAULT 'ACTIVE',
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id           uuid         REFERENCES brands (id),
    email              citext       NOT NULL UNIQUE,
    password_hash      text         NOT NULL,
    full_name          varchar(200) NOT NULL,
    status             user_status  NOT NULL DEFAULT 'INVITED',
    permission_version int          NOT NULL DEFAULT 1,
    last_login_at      timestamptz,
    created_at         timestamptz  NOT NULL DEFAULT now(),
    updated_at         timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_brand_status ON users (brand_id, status);

COMMENT ON COLUMN users.brand_id IS
    'NULL với tài khoản mức nền tảng (Platform Super Admin, Operations Staff, Inventory Staff). '
    'Brand Admin bắt buộc có giá trị (FR-AUTH-05).';
COMMENT ON COLUMN users.permission_version IS
    'Tăng lên khi vai trò/quyền đổi, để vô hiệu hóa access token đang lưu hành (FR-AUTH-10).';

CREATE TABLE roles (
    id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id    uuid         REFERENCES brands (id),
    code        varchar(100) NOT NULL,
    name        varchar(150) NOT NULL,
    description text,
    is_system   boolean      NOT NULL DEFAULT false,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_roles_brand_code ON roles (brand_id, code);

COMMENT ON COLUMN roles.brand_id IS 'NULL với vai trò mức nền tảng/hệ thống.';
COMMENT ON TABLE roles IS
    'Vai trò là dữ liệu, không phải enum — đổi tập vai trò chỉ cần sửa dữ liệu seed, không cần '
    'migration (DB_DIAGRAM implementation note #15). MVP có 4 vai trò hệ thống.';

CREATE TABLE permissions (
    id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    code        varchar(150) NOT NULL UNIQUE,
    description text,
    created_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES users (id),
    role_id     uuid        NOT NULL REFERENCES roles (id),
    scope_type  varchar(30) NOT NULL DEFAULT 'BRAND',
    scope_id    uuid,
    assigned_by uuid        REFERENCES users (id),
    assigned_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_user_role_scope_type
        CHECK (scope_type IN ('PLATFORM', 'BRAND', 'LOCATION', 'MACHINE'))
);

COMMENT ON COLUMN user_roles.scope_id IS
    'Id địa điểm hoặc máy khi scope_type yêu cầu (FR-AUTH-12). NULL với scope PLATFORM/BRAND.';

CREATE TABLE role_permissions (
    role_id       uuid        NOT NULL REFERENCES roles (id),
    permission_id uuid        NOT NULL REFERENCES permissions (id),
    created_at    timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE refresh_sessions (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid        NOT NULL REFERENCES users (id),
    token_hash   text        NOT NULL UNIQUE,
    ip_address   inet,
    user_agent   text,
    expires_at   timestamptz NOT NULL,
    revoked_at   timestamptz,
    last_used_at timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_sessions_user_expiry ON refresh_sessions (user_id, expires_at);

COMMENT ON COLUMN refresh_sessions.token_hash IS
    'Chỉ lưu băm của refresh token, không lưu token gốc (NFR-SEC-05). TTL: REFRESH_TOKEN_TTL_DAYS.';


-- =====================================================================================
-- §4. BẢNG — CATALOG VÀ MACHINES
-- =====================================================================================

CREATE TABLE locations (
    id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    code       varchar(50)  NOT NULL UNIQUE,
    name       varchar(200) NOT NULL,
    address    text,
    timezone   varchar(50)  NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    status     varchar(30)  NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz  NOT NULL DEFAULT now(),
    updated_at timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE fragrance_products (
    id                       uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id                 uuid          NOT NULL REFERENCES brands (id),
    sku                      varchar(100)  NOT NULL,
    name                     varchar(200)  NOT NULL,
    description              text,
    fragrance_notes          jsonb,
    image_url                text,
    product_url              text,
    default_price            numeric(19,4) NOT NULL,
    currency                 char(3)       NOT NULL DEFAULT 'VND',
    full_bottle_retail_price numeric(19,4),
    full_bottle_volume_ml    numeric(14,4),
    status                   varchar(30)   NOT NULL DEFAULT 'ACTIVE',
    created_at               timestamptz   NOT NULL DEFAULT now(),
    updated_at               timestamptz   NOT NULL DEFAULT now(),
    deleted_at               timestamptz,

    CONSTRAINT chk_product_price_nonnegative
        CHECK (default_price >= 0),
    CONSTRAINT chk_product_retail_price_nonnegative
        CHECK (full_bottle_retail_price IS NULL OR full_bottle_retail_price >= 0),
    CONSTRAINT chk_product_volume_nonnegative
        CHECK (full_bottle_volume_ml IS NULL OR full_bottle_volume_ml >= 0)
);

CREATE UNIQUE INDEX uq_products_brand_sku ON fragrance_products (brand_id, sku);

COMMENT ON COLUMN fragrance_products.default_price IS
    'Giá gợi ý mỗi lượt xịt, dùng làm gợi ý khi Brand Admin đặt giá slot (FR-PRD-04). '
    'Giá thực tế nằm ở slot_rentals.price_per_spray.';
COMMENT ON COLUMN fragrance_products.full_bottle_retail_price IS
    'Giá bán lẻ một chai đầy, dùng tính phí lưu kho thời gian ân hạn (FR-PRD-05, FR-EXP-10).';

CREATE TABLE machines (
    id                    uuid                      PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id           uuid                      NOT NULL REFERENCES locations (id),
    serial_number         varchar(100)              NOT NULL UNIQUE,
    display_name          varchar(200)              NOT NULL,
    status                machine_connection_status NOT NULL DEFAULT 'OFFLINE',
    operating_mode        machine_operating_mode    NOT NULL DEFAULT 'NORMAL',
    last_seen_at          timestamptz,
    firmware_version      varchar(100),
    configuration_version int                       NOT NULL DEFAULT 1,
    simulator_enabled     boolean                   NOT NULL DEFAULT false,
    created_at            timestamptz               NOT NULL DEFAULT now(),
    updated_at            timestamptz               NOT NULL DEFAULT now()
);

CREATE INDEX idx_machines_location_status ON machines (location_id, status);
CREATE INDEX idx_machines_last_seen       ON machines (last_seen_at);

COMMENT ON TABLE machines IS
    'Máy thuộc nền tảng, KHÔNG có brand_id. Một máy chứa slot của nhiều thương hiệu; quan hệ '
    'thương hiệu ↔ máy đi qua slot_rentals (BR-003, BR-012, spec/PROJECT.md §3).';
COMMENT ON COLUMN machines.status IS
    'Trục kết nối, suy ra từ heartbeat (FR-MCH-08, FR-IOT-01..03). Độc lập với operating_mode.';
COMMENT ON COLUMN machines.operating_mode IS
    'Trục chế độ, do người vận hành đặt (FR-MCH-09, FR-MNT-05/12). Độc lập với status.';

CREATE TABLE machine_slots (
    id                        uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id                uuid          NOT NULL REFERENCES machines (id),
    slot_number               int           NOT NULL,
    active_bottle_id          uuid,  -- FK thêm ở §9 (phụ thuộc vòng với bottles)
    calibrated_dosage_ml      numeric(10,4),
    low_stock_threshold_ml    numeric(14,4),
    estimated_remaining_ml    numeric(14,4) NOT NULL DEFAULT 0,
    estimated_remaining_sprays int          NOT NULL DEFAULT 0,
    status                    slot_status   NOT NULL DEFAULT 'DISABLED',
    version                   int           NOT NULL DEFAULT 1,
    created_at                timestamptz   NOT NULL DEFAULT now(),
    updated_at                timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT chk_slot_number_positive
        CHECK (slot_number > 0),
    CONSTRAINT chk_slot_remaining_ml_nonnegative
        CHECK (estimated_remaining_ml >= 0),
    CONSTRAINT chk_slot_remaining_sprays_nonnegative
        CHECK (estimated_remaining_sprays >= 0),

    -- ADR-0006
    monthly_rent_price        numeric(19,4),
    CONSTRAINT chk_slot_rent_price_nonnegative
        CHECK (monthly_rent_price IS NULL OR monthly_rent_price >= 0)
);

CREATE UNIQUE INDEX uq_slot_machine_number ON machine_slots (machine_id, slot_number);
CREATE INDEX idx_slots_machine_status      ON machine_slots (machine_id, status);

COMMENT ON COLUMN machine_slots.active_bottle_id IS
    'Chai đang lắp ở slot. Một slot tối đa một chai do chính cardinality của cột; chiều ngược lại '
    '(một chai không lắp ở hai slot) do uq_slot_active_bottle chặn (FR-MCH-07, ADR-0002).';
COMMENT ON COLUMN machine_slots.version IS
    'Optimistic locking cho thao tác đồng thời trên slot.';
COMMENT ON COLUMN machine_slots.monthly_rent_price IS
    'Giá thuê niêm yết mỗi tháng (FR-SLT-32). NULL = slot chưa mở cho thuê, không hiện trong danh '
    'sách slot trống (FR-SLT-19).';

CREATE TABLE machine_status_histories (
    id                     uuid                      PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id             uuid                      NOT NULL REFERENCES machines (id),
    from_connection_status machine_connection_status,
    to_connection_status   machine_connection_status,
    from_operating_mode    machine_operating_mode,
    to_operating_mode      machine_operating_mode,
    reason                 text,
    source                 varchar(30)               NOT NULL,
    changed_by             uuid                      REFERENCES users (id),
    occurred_at            timestamptz               NOT NULL DEFAULT now()
);

CREATE INDEX idx_machine_status_hist ON machine_status_histories (machine_id, occurred_at);

COMMENT ON TABLE machine_status_histories IS
    'Một hàng cho mỗi lần chuyển. Thay đổi kết nối (FR-MCH-08, FR-IOT-02/03) điền cặp '
    '*_connection_status và để trống cặp *_operating_mode; thay đổi chế độ (FR-MCH-09, '
    'FR-MNT-05/12) làm ngược lại (FR-MCH-13).';

CREATE TABLE rental_packages (
    id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    name             varchar(100) NOT NULL,
    duration_months  smallint     NOT NULL,
    discount_percent numeric(5,2) NOT NULL DEFAULT 0,
    is_active        boolean      NOT NULL DEFAULT true,
    created_at       timestamptz  NOT NULL DEFAULT now(),
    updated_at       timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT chk_package_duration_positive
        CHECK (duration_months > 0),
    CONSTRAINT chk_package_discount_percent
        CHECK (discount_percent >= 0 AND discount_percent <= 100)
);

CREATE UNIQUE INDEX uq_rental_package_name ON rental_packages (name);

COMMENT ON TABLE rental_packages IS
    'Gói thuê niêm yết: thời hạn theo tháng và tỷ lệ ưu đãi (FR-SLT-30, ADR-0006). Ngừng mở bán '
    'bằng is_active = false; hóa đơn đã mua không bị ảnh hưởng vì giá đã được chụp (FR-SLT-33).';

CREATE TABLE storage_plans (
    id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    name             varchar(100)  NOT NULL,
    description      text,
    monthly_price    numeric(19,4) NOT NULL,
    currency         char(3)       NOT NULL DEFAULT 'VND',
    coverage_percent numeric(5,2)  NOT NULL,
    coverage_cap     numeric(19,4) NOT NULL,
    is_active        boolean       NOT NULL DEFAULT true,
    created_at       timestamptz   NOT NULL DEFAULT now(),
    updated_at       timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT chk_storage_plan_price_nonnegative
        CHECK (monthly_price >= 0),
    CONSTRAINT chk_storage_plan_coverage_percent
        CHECK (coverage_percent >= 0 AND coverage_percent <= 100),
    CONSTRAINT chk_storage_plan_cap_nonnegative
        CHECK (coverage_cap >= 0)
);

CREATE UNIQUE INDEX uq_storage_plan_name ON storage_plans (name);

COMMENT ON TABLE storage_plans IS
    'Gói bảo quản — bảo hiểm hàng hóa (FR-SLT-31, ADR-0006). Mỗi hóa đơn bắt buộc chọn đúng một gói. '
    'Domain service phải giữ ít nhất một gói is_active = true (FR-SLT-31 AC3).';
COMMENT ON COLUMN storage_plans.coverage_percent IS
    'Tỷ lệ bồi thường tính trên giá bán lẻ chai (fragrance_products.full_bottle_retail_price).';
COMMENT ON COLUMN storage_plans.coverage_cap IS
    'Hạn mức bồi thường tối đa cộng dồn cho MỘT hóa đơn.';

CREATE TABLE slot_rental_requests (
    id                  uuid                       PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_id             uuid                       NOT NULL REFERENCES machine_slots (id),
    brand_id            uuid                       NOT NULL REFERENCES brands (id),
    requested_by        uuid                       NOT NULL REFERENCES users (id),
    desired_starts_at   timestamptz                NOT NULL,
    desired_ends_at     timestamptz                NOT NULL,
    status              slot_rental_request_status NOT NULL DEFAULT 'REQUESTED',
    reviewed_by         uuid                       REFERENCES users (id),
    reviewed_at         timestamptz,
    rejection_reason    text,
    resulting_rental_id uuid,  -- FK thêm ở §9 (phụ thuộc vòng với slot_rentals)
    created_at          timestamptz                NOT NULL DEFAULT now(),
    updated_at          timestamptz                NOT NULL DEFAULT now(),

    CONSTRAINT chk_request_period CHECK (desired_ends_at > desired_starts_at)
);

CREATE INDEX idx_rental_requests_brand ON slot_rental_requests (brand_id, status, created_at);
CREATE INDEX idx_rental_requests_slot  ON slot_rental_requests (slot_id, status);

COMMENT ON TABLE slot_rental_requests IS
    'DEPRECATED (ADR-0006): luồng Brand Admin gửi yêu cầu thuê, Super Admin duyệt (FR-SLT-20 ÷ 26) '
    'đã bãi bỏ. Không ghi thêm bản ghi mới. Giữ bảng vì xóa là thay đổi phá hủy.';
COMMENT ON COLUMN slot_rental_requests.resulting_rental_id IS
    'DEPRECATED (ADR-0006). Trước đây: đặt khi yêu cầu được duyệt và hóa đơn DRAFT được tạo tự động.';

CREATE TABLE slot_rentals (
    id                    uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_id               uuid               NOT NULL REFERENCES machine_slots (id),
    brand_id              uuid               NOT NULL REFERENCES brands (id),
    fragrance_product_id  uuid               REFERENCES fragrance_products (id),
    product_assigned_at   timestamptz,
    request_id            uuid               REFERENCES slot_rental_requests (id),
    previous_rental_id    uuid               REFERENCES slot_rentals (id),
    status                slot_rental_status NOT NULL DEFAULT 'DRAFT',
    starts_at             timestamptz        NOT NULL,
    ends_at               timestamptz        NOT NULL,
    grace_ends_at         timestamptz,
    price_per_spray       numeric(19,4),
    currency              char(3)            NOT NULL DEFAULT 'VND',
    fixed_fee             numeric(19,4)      NOT NULL DEFAULT 0,
    revenue_share_percent numeric(5,2)       NOT NULL DEFAULT 0,
    terminated_reason     text,
    created_by            uuid               NOT NULL REFERENCES users (id),
    created_at            timestamptz        NOT NULL DEFAULT now(),
    updated_at            timestamptz        NOT NULL DEFAULT now(),

    CONSTRAINT chk_rental_period
        CHECK (ends_at > starts_at),
    CONSTRAINT chk_rental_price_nonnegative
        CHECK (price_per_spray >= 0),
    CONSTRAINT chk_rental_fee_nonnegative
        CHECK (fixed_fee >= 0),
    CONSTRAINT chk_revenue_share_percent
        CHECK (revenue_share_percent >= 0 AND revenue_share_percent <= 100),

    -- ADR-0006: gói thuê, ảnh chụp giá, hóa đơn. Nullable ở tầng cột vì hóa đơn tạo theo mô hình cũ
    -- không có gói; chk_rental_package_snapshot_complete bảo đảm có gói thì đủ bộ chụp giá.
    invoice_number           varchar(30)   CONSTRAINT uq_rental_invoice_number UNIQUE,
    rental_package_id        uuid          REFERENCES rental_packages (id),
    storage_plan_id          uuid          REFERENCES storage_plans (id),
    duration_months          smallint,
    monthly_rent_price       numeric(19,4),
    discount_percent         numeric(5,2),
    storage_monthly_price    numeric(19,4),
    storage_coverage_percent numeric(5,2),
    storage_coverage_cap     numeric(19,4),
    rent_amount              numeric(19,4),
    storage_amount           numeric(19,4),
    grace_fee_amount         numeric(19,4) NOT NULL DEFAULT 0,
    total_amount             numeric(19,4),
    hold_expires_at          timestamptz,
    paid_at                  timestamptz,
    cancelled_at             timestamptz,

    CONSTRAINT chk_rental_package_snapshot_complete
        CHECK (
            rental_package_id IS NULL
            OR num_nulls(
                storage_plan_id, duration_months, monthly_rent_price, discount_percent,
                storage_monthly_price, storage_coverage_percent, storage_coverage_cap,
                rent_amount, storage_amount, total_amount, hold_expires_at
            ) = 0
        ),
    CONSTRAINT chk_rental_amounts_nonnegative
        CHECK (
            (monthly_rent_price IS NULL OR monthly_rent_price >= 0)
            AND (storage_monthly_price IS NULL OR storage_monthly_price >= 0)
            AND (storage_coverage_cap IS NULL OR storage_coverage_cap >= 0)
            AND (rent_amount IS NULL OR rent_amount >= 0)
            AND (storage_amount IS NULL OR storage_amount >= 0)
            AND grace_fee_amount >= 0
            AND (total_amount IS NULL OR total_amount >= 0)
        ),
    CONSTRAINT chk_rental_percents
        CHECK (
            (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100))
            AND (storage_coverage_percent IS NULL
                 OR (storage_coverage_percent >= 0 AND storage_coverage_percent <= 100))
        ),
    CONSTRAINT chk_rental_duration_positive
        CHECK (duration_months IS NULL OR duration_months > 0),
    -- FR-SLT-36: tổng = phí thuê + phí bảo quản + phí ân hạn chuyển sang.
    CONSTRAINT chk_rental_total_amount
        CHECK (total_amount IS NULL OR total_amount = rent_amount + storage_amount + grace_fee_amount),
    -- FR-SLT-38: số hóa đơn cấp đúng lúc thanh toán thành công.
    CONSTRAINT chk_rental_invoice_on_payment
        CHECK ((paid_at IS NULL) = (invoice_number IS NULL)),
    -- FR-SLT-06 AC4: đã thanh toán thì không hủy. So sánh qua ::text — lý do ở migration
    -- 1790665960000 (enum mới thêm, chạy chung transaction).
    CONSTRAINT chk_rental_cancelled_unpaid
        CHECK (status::text <> 'CANCELLED' OR paid_at IS NULL),
    CONSTRAINT chk_rental_cancelled_at
        CHECK ((status::text = 'CANCELLED') = (cancelled_at IS NOT NULL))
);

CREATE INDEX idx_rentals_brand   ON slot_rentals (brand_id, status, starts_at);
CREATE INDEX idx_rentals_slot    ON slot_rentals (slot_id, starts_at, ends_at);
CREATE INDEX idx_rentals_product ON slot_rentals (fragrance_product_id, status);

-- Job hủy hóa đơn hết giờ giữ chỗ (FR-SLT-39) và job tự kích hoạt khi chờ nạp hàng quá lâu
-- (FR-SLT-42) quét đúng hai tập này mỗi lần chạy.
CREATE INDEX idx_rentals_draft_unpaid_hold ON slot_rentals (hold_expires_at)
    WHERE status = 'DRAFT' AND paid_at IS NULL;
CREATE INDEX idx_rentals_draft_awaiting_stock ON slot_rentals (paid_at)
    WHERE status = 'DRAFT' AND paid_at IS NOT NULL;

COMMENT ON TABLE slot_rentals IS
    'Hóa đơn thuê slot: một lần thương hiệu mua gói thuê một slot (ADR-0006). Một hóa đơn ứng với '
    'đúng một slot; thương hiệu thuê 3 slot có 3 hóa đơn độc lập (BR-009). Đây là đường duy nhất nối '
    'thương hiệu với máy.';
COMMENT ON COLUMN slot_rentals.fragrance_product_id IS
    'Nullable ở tầng CSDL CHỈ để phục vụ cửa sổ giữa lúc thanh toán (FR-SLT-38) và lúc Brand Admin '
    'cấu hình slot (FR-SLT-27). Domain service phải chặn tạo đơn khi cột này NULL (FR-SLT-29). Xem §13.';
COMMENT ON COLUMN slot_rentals.price_per_spray IS
    'Nullable từ ADR-0006: Brand Admin đặt giá ở bước cấu hình slot sau khi thanh toán (FR-SLT-08). '
    'Domain service phải chặn tạo đơn khi cột này NULL (FR-SLT-29).';
COMMENT ON COLUMN slot_rentals.previous_rental_id IS
    'Hóa đơn liền trước khi đây là hóa đơn gia hạn (FR-SLT-12).';
COMMENT ON COLUMN slot_rentals.starts_at IS
    'Hóa đơn DRAFT: mốc TẠM để excl_slot_rental_overlap giữ được slot. Ghi đè bằng thời điểm thật khi '
    'kích hoạt — lắp chai đầu tiên (FR-SLT-24), quá RENTAL_MAX_STOCKING_DAYS (FR-SLT-42), hoặc nối '
    'tiếp hóa đơn cũ (FR-SLT-12).';
COMMENT ON COLUMN slot_rentals.ends_at IS
    'Hóa đơn DRAFT: mốc TẠM = starts_at + RENTAL_MAX_STOCKING_DAYS + số tháng (hóa đơn mới) hoặc '
    'starts_at + số tháng (hóa đơn gia hạn). Khi kích hoạt: starts_at + duration_months.';
COMMENT ON COLUMN slot_rentals.invoice_number IS
    'Số hóa đơn, cấp đúng lúc thanh toán thành công và duy nhất toàn hệ thống (FR-SLT-38).';
COMMENT ON COLUMN slot_rentals.rental_package_id IS
    'Gói thuê đã mua. NULL với hóa đơn tạo theo mô hình cũ trước ADR-0006.';
COMMENT ON COLUMN slot_rentals.monthly_rent_price IS
    'Ảnh chụp giá niêm yết của slot lúc tạo hóa đơn (FR-SLT-33). Cùng với duration_months, '
    'discount_percent, storage_* , rent_amount, storage_amount, total_amount: chỉ ghi một lần.';
COMMENT ON COLUMN slot_rentals.grace_fee_amount IS
    'Phí ân hạn của hóa đơn cũ chuyển sang hóa đơn gia hạn (FR-EXP-12, FR-SLT-36). 0 với hóa đơn mới.';
COMMENT ON COLUMN slot_rentals.hold_expires_at IS
    'Hết giờ giữ chỗ: tạo hóa đơn + RENTAL_CHECKOUT_HOLD_MIN. Quá mốc mà paid_at NULL thì hóa đơn '
    'chuyển CANCELLED (FR-SLT-39).';
COMMENT ON COLUMN slot_rentals.paid_at IS
    'Thời điểm thanh toán được xác nhận (FR-SLT-38). DRAFT + paid_at NULL = chờ thanh toán; '
    'DRAFT + paid_at khác NULL = chờ nạp hàng.';
COMMENT ON COLUMN slot_rentals.fixed_fee IS
    'DEPRECATED (ADR-0006): mô hình phí cố định theo kỳ đã bỏ. Giữ cột để không phá migration và test '
    'hiện có; hóa đơn mới để mặc định 0.';
COMMENT ON COLUMN slot_rentals.revenue_share_percent IS
    'DEPRECATED (ADR-0006): không còn ăn chia doanh thu lượt xịt. Giữ cột để không phá migration và '
    'test hiện có; hóa đơn mới để mặc định 0.';
COMMENT ON COLUMN slot_rentals.request_id IS
    'DEPRECATED (ADR-0006): luồng yêu cầu thuê và duyệt tay đã bãi bỏ. Hóa đơn mới để NULL.';
COMMENT ON COLUMN slot_rentals.grace_ends_at IS
    'Ngày kết thúc ân hạn do Platform Super Admin ấn định (FR-EXP-07).';


-- =====================================================================================
-- §5. BẢNG — INVENTORY
-- =====================================================================================

CREATE TABLE brand_shipment_declarations (
    id                        uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id                  uuid                        NOT NULL REFERENCES brands (id),
    fragrance_product_id      uuid                        NOT NULL REFERENCES fragrance_products (id),
    declared_quantity         int                         NOT NULL,
    declared_bottle_volume_ml numeric(14,4)               NOT NULL,
    expected_ship_date        date,
    status                    shipment_declaration_status NOT NULL DEFAULT 'DECLARED',
    received_quantity         int,
    discrepancy_notes         text,
    received_by               uuid                        REFERENCES users (id),
    received_at               timestamptz,
    declared_by               uuid                        NOT NULL REFERENCES users (id),
    created_at                timestamptz                 NOT NULL DEFAULT now(),
    updated_at                timestamptz                 NOT NULL DEFAULT now(),

    CONSTRAINT chk_declared_quantity_positive CHECK (declared_quantity > 0)
);

CREATE INDEX idx_shipment_decl_brand ON brand_shipment_declarations (brand_id, status, created_at);

COMMENT ON TABLE brand_shipment_declarations IS
    'Brand Admin khai báo lô hàng gửi đến kho nền tảng; Inventory Staff đối chiếu khi nhận '
    '(FR-INV-22 đến FR-INV-28). Lô sinh ra trỏ ngược về đây qua inventory_batches.source_declaration_id.';
COMMENT ON COLUMN brand_shipment_declarations.discrepancy_notes IS
    'Bắt buộc khi received_quantity khác declared_quantity (FR-INV-25).';

CREATE TABLE inventory_batches (
    id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id              uuid         NOT NULL REFERENCES brands (id),
    fragrance_product_id  uuid         NOT NULL REFERENCES fragrance_products (id),
    source_declaration_id uuid         REFERENCES brand_shipment_declarations (id),
    batch_number          varchar(100) NOT NULL,
    received_at           timestamptz  NOT NULL,
    expires_at            timestamptz,
    quantity_received     int          NOT NULL,
    supplier_info         jsonb,
    created_by            uuid         NOT NULL REFERENCES users (id),
    created_at            timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT chk_batch_quantity_positive CHECK (quantity_received > 0)
);

CREATE UNIQUE INDEX uq_batch_brand_product_number
    ON inventory_batches (brand_id, fragrance_product_id, batch_number);

COMMENT ON COLUMN inventory_batches.source_declaration_id IS
    'Đặt khi lô được tạo tự động từ khai báo gửi hàng đã nhận (FR-INV-26); NULL với lô nhập thủ công.';

CREATE TABLE bottles (
    id                        uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id                  uuid               NOT NULL REFERENCES brands (id),
    owner                     revenue_owner_type NOT NULL DEFAULT 'BRAND',
    batch_id                  uuid               NOT NULL REFERENCES inventory_batches (id),
    fragrance_product_id      uuid               NOT NULL REFERENCES fragrance_products (id),
    identifier                varchar(150)       NOT NULL,
    status                    bottle_status      NOT NULL DEFAULT 'IN_STOCK',
    initial_volume_ml         numeric(14,4)      NOT NULL,
    current_estimated_ml      numeric(14,4)      NOT NULL,
    empty_weight_g            numeric(14,4),
    initial_measured_weight_g numeric(14,4),
    current_measured_weight_g numeric(14,4),
    opened_at                 timestamptz,
    installed_at              timestamptz,
    removed_at                timestamptz,
    expires_at                timestamptz,
    source_rental_id          uuid               REFERENCES slot_rentals (id),
    liquidated_at             timestamptz,
    created_at                timestamptz        NOT NULL DEFAULT now(),
    updated_at                timestamptz        NOT NULL DEFAULT now(),

    CONSTRAINT chk_bottle_initial_nonnegative
        CHECK (initial_volume_ml >= 0),
    CONSTRAINT chk_bottle_current_nonnegative
        CHECK (current_estimated_ml >= 0)
);

CREATE UNIQUE INDEX uq_bottle_brand_identifier ON bottles (brand_id, identifier);
CREATE INDEX idx_bottles_brand_status_expiry  ON bottles (brand_id, status, expires_at);
CREATE INDEX idx_bottles_batch                ON bottles (batch_id);

COMMENT ON COLUMN bottles.brand_id IS
    'Thương hiệu gốc, bất biến để phục vụ kiểm toán kể cả sau khi quyền sở hữu chuyển về nền tảng.';
COMMENT ON COLUMN bottles.owner IS
    'Chủ sở hữu hiện tại. Lật sang PLATFORM khi thanh lý (FR-EXP-15). Đây mới là cột quyết định '
    'quyền sở hữu, không phải brand_id.';
COMMENT ON COLUMN bottles.source_rental_id IS
    'Hóa đơn mà chai đang phục vụ tại thời điểm thanh lý (FR-EXP-16).';

CREATE TABLE refill_sessions (
    id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id             uuid          NOT NULL REFERENCES brands (id),
    machine_id           uuid          NOT NULL REFERENCES machines (id),
    slot_id              uuid          NOT NULL REFERENCES machine_slots (id),
    old_bottle_id        uuid          REFERENCES bottles (id),
    new_bottle_id        uuid          REFERENCES bottles (id),
    performed_by         uuid          NOT NULL REFERENCES users (id),
    status               refill_status NOT NULL DEFAULT 'STARTED',
    checklist_completed  boolean       NOT NULL DEFAULT false,
    before_weight_g      numeric(14,4),
    after_weight_g       numeric(14,4),
    notes                text,
    started_at           timestamptz   NOT NULL DEFAULT now(),
    completed_at         timestamptz
);

CREATE INDEX idx_refill_sessions_brand_machine ON refill_sessions (brand_id, machine_id, started_at);

COMMENT ON TABLE refill_sessions IS
    'Hàng này CHÍNH LÀ phiếu nạp. status=STARTED/started_at = mở phiếu (FR-INV-29); '
    'status=COMPLETED/completed_at = đóng phiếu (FR-INV-31). Trong lúc STARTED, cảnh báo cửa mở '
    'quá hạn (FR-ALR-03) phải bị tạm ngưng cho máy/slot này (FR-INV-30) — xem §13.';
COMMENT ON COLUMN refill_sessions.new_bottle_id IS
    'Nullable vì phiếu được mở trước khi chọn chai thay thế (FR-INV-29). Domain service phải bảo '
    'đảm NOT NULL trước khi status chuyển COMPLETED — xem §13.';
COMMENT ON COLUMN refill_sessions.checklist_completed IS
    'Cổng chặn của FR-INV-14: phải true trước khi đóng phiếu.';

CREATE TABLE inventory_adjustments (
    id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id           uuid          NOT NULL REFERENCES brands (id),
    bottle_id          uuid          NOT NULL REFERENCES bottles (id),
    slot_id            uuid          REFERENCES machine_slots (id),
    before_quantity_ml numeric(14,4) NOT NULL,
    after_quantity_ml  numeric(14,4) NOT NULL,
    difference_ml      numeric(14,4) NOT NULL,
    reason             text          NOT NULL,
    adjusted_by        uuid          NOT NULL REFERENCES users (id),
    created_at         timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT chk_adjust_before_nonnegative CHECK (before_quantity_ml >= 0),
    CONSTRAINT chk_adjust_after_nonnegative  CHECK (after_quantity_ml >= 0)
);

CREATE INDEX idx_adjustments_brand_bottle ON inventory_adjustments (brand_id, bottle_id, created_at);

COMMENT ON COLUMN inventory_adjustments.reason IS
    'NOT NULL: lý do là bắt buộc (FR-INV-16, lỗi ADJUSTMENT_REASON_REQUIRED).';

-- ADR-0006. Hai khóa ngoại cùng thương hiệu (bottle, slot_rental) nằm ở §10b.
CREATE TABLE storage_compensations (
    id                   uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id             uuid                        NOT NULL REFERENCES brands (id),
    bottle_id            uuid                        NOT NULL,
    slot_rental_id       uuid                        NOT NULL,
    bottle_retail_price  numeric(19,4)               NOT NULL,
    coverage_percent     numeric(5,2)                NOT NULL,
    amount               numeric(19,4)               NOT NULL,
    currency             char(3)                     NOT NULL DEFAULT 'VND',
    status               storage_compensation_status NOT NULL DEFAULT 'PENDING',
    payout_reference     varchar(200),
    paid_by              uuid                        REFERENCES users (id),
    paid_at              timestamptz,
    created_at           timestamptz                 NOT NULL DEFAULT now(),
    updated_at           timestamptz                 NOT NULL DEFAULT now(),

    CONSTRAINT chk_compensation_amounts_nonnegative
        CHECK (bottle_retail_price >= 0 AND amount >= 0),
    CONSTRAINT chk_compensation_coverage_percent
        CHECK (coverage_percent >= 0 AND coverage_percent <= 100),
    CONSTRAINT chk_compensation_paid_fields
        CHECK ((status = 'PAID') = (paid_at IS NOT NULL AND paid_by IS NOT NULL
                                    AND payout_reference IS NOT NULL))
);

-- Một chai hư hỏng chỉ được bồi thường một lần.
CREATE UNIQUE INDEX uq_compensation_bottle ON storage_compensations (bottle_id);
CREATE INDEX idx_compensations_brand_status ON storage_compensations (brand_id, status, created_at);
CREATE INDEX idx_compensations_rental       ON storage_compensations (slot_rental_id);

COMMENT ON TABLE storage_compensations IS
    'Khoản bồi thường khi chai của thương hiệu chuyển DAMAGED lúc nền tảng đang giữ (FR-SLT-44). '
    'Tiền chuyển ngoài hệ thống; Super Admin ghi nhận chi trả sau khi xác thực lại (FR-SLT-45).';
COMMENT ON COLUMN storage_compensations.slot_rental_id IS
    'Hóa đơn có gói bảo quản được áp: hóa đơn của slot chai đang lắp, hoặc — với chai trong kho — hóa '
    'đơn hiệu lực có coverage_percent cao nhất của thương hiệu. Hạn mức cộng dồn theo cột này.';
COMMENT ON COLUMN storage_compensations.amount IS
    'min(coverage_percent × bottle_retail_price, hạn mức còn lại của hóa đơn). Domain service tính.';


-- =====================================================================================
-- §6. BẢNG — ORDERS VÀ PAYMENTS
-- =====================================================================================

CREATE TABLE orders (
    id                        uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id                  uuid               NOT NULL REFERENCES brands (id),
    slot_rental_id            uuid               NOT NULL REFERENCES slot_rentals (id),
    revenue_owner             revenue_owner_type NOT NULL,
    machine_id                uuid               NOT NULL REFERENCES machines (id),
    slot_id                   uuid               NOT NULL REFERENCES machine_slots (id),
    fragrance_product_id      uuid               NOT NULL REFERENCES fragrance_products (id),
    product_name_snapshot     varchar(200)       NOT NULL,
    amount                    numeric(19,4)      NOT NULL,
    currency                  char(3)            NOT NULL,
    status                    order_status       NOT NULL DEFAULT 'CREATED',
    payment_reference         varchar(150)       NOT NULL UNIQUE,
    idempotency_key           varchar(150)       NOT NULL UNIQUE,
    expires_at                timestamptz        NOT NULL,
    paid_at                   timestamptz,
    dispensed_at              timestamptz,
    failure_code              varchar(100),
    needs_manual_review       boolean            NOT NULL DEFAULT false,
    manual_review_resolved_by uuid               REFERENCES users (id),
    manual_review_resolved_at timestamptz,
    created_at                timestamptz        NOT NULL DEFAULT now(),
    updated_at                timestamptz        NOT NULL DEFAULT now(),

    CONSTRAINT chk_order_amount_nonnegative CHECK (amount >= 0)
);

CREATE INDEX idx_orders_brand         ON orders (brand_id, created_at);
CREATE INDEX idx_orders_brand_status  ON orders (brand_id, status, created_at);
CREATE INDEX idx_orders_machine       ON orders (machine_id, created_at);

COMMENT ON COLUMN orders.brand_id IS
    'Thương hiệu sở hữu sản phẩm trong danh mục tại thời điểm tạo đơn — LUÔN có giá trị, kể cả với '
    'đơn phát sinh sau thanh lý (khi đó revenue_owner = PLATFORM). Quyền sở hữu tiền nằm ở '
    'revenue_owner, KHÔNG phải cột này. Màn hình của Brand Admin (FR-EXP-20, FR-REV-06) phải lọc '
    'theo revenue_owner = BRAND, không bao giờ chỉ theo brand_id.';
COMMENT ON COLUMN orders.revenue_owner IS
    'Ảnh chụp bất biến tại thời điểm tạo đơn: BRAND hoặc PLATFORM (FR-REV-01/02/03). Không có '
    'đường cập nhật (NFR-DAT-06).';
COMMENT ON COLUMN orders.amount IS
    'Giá đã chụp tại thời điểm tạo đơn; đổi giá slot sau đó không ảnh hưởng đơn này (FR-ORD-06, '
    'FR-SLT-09). Không có đường cập nhật (NFR-DAT-06).';
COMMENT ON COLUMN orders.expires_at IS 'created_at + ORDER_PAYMENT_TTL_SEC (FR-ORD-09).';
COMMENT ON COLUMN orders.needs_manual_review IS
    'Đặt true khi đã thanh toán nhưng lượt xịt thất bại hoặc không xác định (FR-ORD-19). Dẫn vào '
    'luồng hoàn tiền và hỗ trợ (FR-ORD-20/21).';

CREATE TABLE order_status_histories (
    id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id    uuid         NOT NULL REFERENCES brands (id),
    order_id    uuid         NOT NULL REFERENCES orders (id),
    from_status order_status,
    to_status   order_status NOT NULL,
    reason      text,
    metadata    jsonb,
    actor_type  varchar(30)  NOT NULL,
    actor_id    uuid,
    occurred_at timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_status_hist ON order_status_histories (order_id, occurred_at);

COMMENT ON TABLE order_status_histories IS 'Toàn bộ lịch sử chuyển trạng thái đơn (FR-ORD-18).';

CREATE TABLE payments (
    id                      uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id                uuid           NOT NULL REFERENCES brands (id),
    order_id                uuid           REFERENCES orders (id),
    provider                varchar(50)    NOT NULL,
    provider_transaction_id varchar(200),
    provider_reference      varchar(200),
    amount                  numeric(19,4)  NOT NULL,
    currency                char(3)        NOT NULL,
    status                  payment_status NOT NULL DEFAULT 'PENDING',
    raw_response            jsonb,
    paid_at                 timestamptz,
    created_at              timestamptz    NOT NULL DEFAULT now(),
    updated_at              timestamptz    NOT NULL DEFAULT now(),

    CONSTRAINT chk_payment_amount_nonnegative CHECK (amount >= 0),

    -- ADR-0006: thanh toán hóa đơn thuê slot đi chung bảng với đơn kiosk (FR-SLT-37).
    -- Khóa ngoại cùng thương hiệu fk_payment_rental_same_brand nằm ở §10b.
    slot_rental_id          uuid,
    CONSTRAINT chk_payment_single_target
        CHECK (num_nonnulls(order_id, slot_rental_id) = 1)
);

CREATE INDEX idx_payments_order        ON payments (order_id);
CREATE INDEX idx_payments_brand_status ON payments (brand_id, status, created_at);

COMMENT ON TABLE payments IS
    'Không lưu bất kỳ thông tin thẻ hay tài khoản ngân hàng nào của khách (NFR-DAT-04). '
    'raw_response chỉ chứa phản hồi của cổng thanh toán đã loại dữ liệu nhạy cảm.';
COMMENT ON COLUMN payments.order_id IS
    'Đơn kiosk được thanh toán. Đúng một trong order_id, slot_rental_id có giá trị '
    '(chk_payment_single_target).';
COMMENT ON COLUMN payments.slot_rental_id IS
    'Hóa đơn thuê slot được thanh toán (FR-SLT-37). Mỗi hóa đơn tối đa một payment PENDING '
    '(uq_rental_payment_pending).';

CREATE TABLE payment_events (
    id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id          uuid          REFERENCES brands (id),
    payment_id        uuid          REFERENCES payments (id),
    provider          varchar(50)   NOT NULL,
    provider_event_id varchar(200)  NOT NULL,
    payload_hash      varchar(128)  NOT NULL,
    signature_valid   boolean       NOT NULL,
    payload           jsonb         NOT NULL,
    processing_result varchar(50),
    received_at       timestamptz   NOT NULL DEFAULT now(),
    processed_at      timestamptz
);

CREATE INDEX idx_payment_events_brand ON payment_events (brand_id, received_at);

COMMENT ON COLUMN payment_events.brand_id IS
    'NULL khi webhook không khớp được với payment/order nào (chữ ký sai, mã tham chiếu lạ) — vẫn '
    'ghi lại để rà soát bảo mật (FR-ORD-13/14).';

CREATE TABLE dispense_commands (
    id            uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id      uuid           REFERENCES brands (id),
    order_id      uuid           REFERENCES orders (id),
    machine_id    uuid           NOT NULL REFERENCES machines (id),
    slot_id       uuid           NOT NULL REFERENCES machine_slots (id),
    command_type  dispense_type  NOT NULL,
    command_token varchar(255)   NOT NULL UNIQUE,
    signature     text           NOT NULL,
    status        command_status NOT NULL DEFAULT 'CREATED',
    expires_at    timestamptz    NOT NULL,
    sent_at       timestamptz,
    acknowledged_at timestamptz,
    completed_at  timestamptz,
    retry_count   int            NOT NULL DEFAULT 0,
    created_by    uuid           REFERENCES users (id),
    created_at    timestamptz    NOT NULL DEFAULT now(),

    CONSTRAINT chk_command_retry_nonnegative CHECK (retry_count >= 0)
);

CREATE INDEX idx_commands_machine ON dispense_commands (machine_id, created_at);

COMMENT ON COLUMN dispense_commands.brand_id IS
    'Có giá trị với lệnh CUSTOMER (chép từ đơn). NULL với lệnh DIAGNOSTIC chạy trên slot chưa có '
    'hóa đơn nào.';
COMMENT ON COLUMN dispense_commands.command_token IS
    'Mã lệnh duy nhất toàn hệ thống (FR-DSP-02). Thiết bị lưu lại để từ chối lệnh trùng '
    '(FR-DSP-10, lỗi CMD_DUPLICATE).';
COMMENT ON COLUMN dispense_commands.expires_at IS
    'created_at + DISPENSE_CMD_TTL_SEC (FR-DSP-06): hạn để thiết bị NHẬN lệnh và sáng đèn nút. Thời '
    'gian khách được bấm là DISPENSE_PRESS_WINDOW_SEC, tính từ lúc sáng đèn (ADR-0007).';
COMMENT ON COLUMN dispense_commands.acknowledged_at IS
    'Lệnh CUSTOMER: lúc đèn nút của slot đích sáng, bắt đầu chờ khách bấm (FR-DSP-11, FR-DSP-21). '
    'Lệnh DIAGNOSTIC: lúc thiết bị nhận lệnh, kích hoạt ngay sau đó (FR-DSP-27).';

CREATE TABLE dispense_results (
    id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id             uuid          REFERENCES brands (id),
    command_id           uuid          NOT NULL UNIQUE REFERENCES dispense_commands (id),
    success              boolean       NOT NULL,
    result_code          varchar(100),
    failure_code         varchar(100),
    executed_at          timestamptz,
    received_at          timestamptz   NOT NULL DEFAULT now(),
    measured_quantity_ml numeric(10,4),
    sensor_snapshot      jsonb,
    raw_payload          jsonb,
    device_event_id      varchar(150)
);

CREATE INDEX idx_results_brand ON dispense_results (brand_id, received_at);

COMMENT ON COLUMN dispense_results.failure_code IS
    'Chỉ dùng mã trong spec/errors.md §"Lệnh xịt": CMD_INVALID_SIGNATURE, CMD_EXPIRED, '
    'CMD_WRONG_MACHINE, CMD_DUPLICATE, DOOR_OPEN, SLOT_EMPTY, ACTUATOR_FAULT, HARD_TIMEOUT, NO_CURRENT.';

CREATE TABLE kiosk_interaction_events (
    id                   uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id             varchar(150)           NOT NULL UNIQUE,
    event_type           kiosk_interaction_type NOT NULL,
    brand_id             uuid                   NOT NULL REFERENCES brands (id),
    slot_rental_id       uuid                   NOT NULL REFERENCES slot_rentals (id),
    machine_id           uuid                   NOT NULL REFERENCES machines (id),
    slot_id              uuid                   NOT NULL REFERENCES machine_slots (id),
    fragrance_product_id uuid                   NOT NULL REFERENCES fragrance_products (id),
    kiosk_session_id     uuid                   NOT NULL,
    occurred_at          timestamptz            NOT NULL,
    received_at          timestamptz            NOT NULL DEFAULT now()
);

CREATE INDEX idx_kiosk_events_brand   ON kiosk_interaction_events (brand_id, occurred_at);
CREATE INDEX idx_kiosk_events_rental  ON kiosk_interaction_events (slot_rental_id, event_type, occurred_at);
CREATE INDEX idx_kiosk_events_product ON kiosk_interaction_events (fragrance_product_id, event_type, occurred_at);
CREATE INDEX idx_kiosk_events_machine ON kiosk_interaction_events (machine_id, event_type, occurred_at);

COMMENT ON TABLE kiosk_interaction_events IS
    'Nguồn dữ liệu cho xếp hạng sản phẩm theo mức độ quan tâm (FR-RPT-06, BR-007).';
COMMENT ON COLUMN kiosk_interaction_events.kiosk_session_id IS
    'Phiên ẩn danh, xoay vòng — KHÔNG chứa bất kỳ định danh khách hàng nào.';


-- =====================================================================================
-- §7. BẢNG — OPERATIONS
-- =====================================================================================

CREATE TABLE refill_requests (
    id                   uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id             uuid                  NOT NULL REFERENCES brands (id),
    slot_rental_id       uuid                  NOT NULL REFERENCES slot_rentals (id),
    slot_id              uuid                  NOT NULL REFERENCES machine_slots (id),
    fragrance_product_id uuid                  NOT NULL REFERENCES fragrance_products (id),
    reason               refill_request_reason NOT NULL,
    status               refill_request_status NOT NULL DEFAULT 'SUBMITTED',
    requested_by         uuid                  NOT NULL REFERENCES users (id),
    reviewed_by          uuid                  REFERENCES users (id),
    rejection_reason     text,
    scheduled_at         timestamptz,
    refill_session_id    uuid                  REFERENCES refill_sessions (id),
    created_at           timestamptz           NOT NULL DEFAULT now(),
    updated_at           timestamptz           NOT NULL DEFAULT now()
);

CREATE INDEX idx_refill_requests_brand ON refill_requests (brand_id, status, created_at);
CREATE INDEX idx_refill_requests_slot  ON refill_requests (slot_id, status);

COMMENT ON COLUMN refill_requests.refill_session_id IS
    'Phiên nạp thực tế liên kết (FR-RFQ-08). Chỉ đặt được COMPLETED khi cột này có giá trị '
    '(FR-RFQ-09) — xem §13.';

CREATE TABLE alerts (
    id                uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id          uuid           REFERENCES brands (id),
    machine_id        uuid           NOT NULL REFERENCES machines (id),
    slot_id           uuid           REFERENCES machine_slots (id),
    type              varchar(80)    NOT NULL,
    severity          alert_severity NOT NULL,
    status            alert_status   NOT NULL DEFAULT 'OPEN',
    deduplication_key varchar(255)   NOT NULL,
    title             varchar(250)   NOT NULL,
    description       text,
    first_occurred_at timestamptz    NOT NULL,
    last_occurred_at  timestamptz    NOT NULL,
    occurrence_count  int            NOT NULL DEFAULT 1,
    acknowledged_by   uuid           REFERENCES users (id),
    acknowledged_at   timestamptz,
    assigned_to       uuid           REFERENCES users (id),
    resolved_by       uuid           REFERENCES users (id),
    resolved_at       timestamptz,
    resolution        text,
    created_at        timestamptz    NOT NULL DEFAULT now(),

    CONSTRAINT chk_alert_occurrence_positive CHECK (occurrence_count > 0)
);

CREATE INDEX idx_alerts_brand ON alerts (brand_id, status, severity, created_at);

COMMENT ON COLUMN alerts.brand_id IS
    'CHỈ có giá trị với cảnh báo mức slot, khi biết chắc một thương hiệu (vd FR-ALR-02). NULL với '
    'cảnh báo mức máy (FR-ALR-01/03/05) vì có thể ảnh hưởng nhiều thương hiệu cùng lúc — FR-ALR-09 '
    'suy ra danh sách thương hiệu bị ảnh hưởng lúc đọc, bằng cách join slot_rentals đang hiệu lực '
    'của máy, KHÔNG lấy từ cột này.';

CREATE TABLE maintenance_tickets (
    id                 uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id           uuid            REFERENCES brands (id),
    machine_id         uuid            NOT NULL REFERENCES machines (id),
    source_alert_id    uuid            REFERENCES alerts (id),
    ticket_number      varchar(80)     NOT NULL,
    category           varchar(100)    NOT NULL,
    severity           alert_severity  NOT NULL,
    priority           ticket_priority NOT NULL,
    status             ticket_status   NOT NULL DEFAULT 'OPEN',
    assigned_to        uuid            REFERENCES users (id),
    due_at             timestamptz,
    started_at         timestamptz,
    resolved_at        timestamptz,
    closed_at          timestamptz,
    diagnosis          text,
    corrective_action  text,
    replacement_parts  jsonb,
    cost               numeric(19,4),
    post_test_result   varchar(30),
    post_tested_by     uuid            REFERENCES users (id),
    post_tested_at     timestamptz,
    downtime_minutes   int,
    created_at         timestamptz     NOT NULL DEFAULT now(),
    updated_at         timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT chk_ticket_cost_nonnegative CHECK (cost IS NULL OR cost >= 0),
    CONSTRAINT chk_downtime_nonnegative    CHECK (downtime_minutes IS NULL OR downtime_minutes >= 0)
);

CREATE UNIQUE INDEX uq_ticket_number ON maintenance_tickets (ticket_number);
CREATE INDEX idx_tickets_machine    ON maintenance_tickets (machine_id, status, assigned_to, due_at);

COMMENT ON COLUMN maintenance_tickets.brand_id IS
    'Hầu như luôn NULL: phiếu bảo trì là tài nguyên của nền tảng/máy, không thuộc thương hiệu nào. '
    'FR-MNT-07 thông báo cho mọi Brand Admin có slot trên máy, suy ra bằng join slot_rentals đang '
    'hiệu lực — không lưu ở đây.';
COMMENT ON INDEX uq_ticket_number IS
    'Duy nhất toàn cục — phiếu bảo trì là tài nguyên nền tảng, không phân phạm vi theo thương hiệu.';

CREATE TABLE maintenance_activities (
    id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id     uuid          NOT NULL REFERENCES maintenance_tickets (id),
    actor_id      uuid          NOT NULL REFERENCES users (id),
    activity_type varchar(80)   NOT NULL,
    from_status   ticket_status,
    to_status     ticket_status,
    notes         text,
    attachments   jsonb,
    created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_maintenance_activities ON maintenance_activities (ticket_id, created_at);

CREATE TABLE notifications (
    id                uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id          uuid                NOT NULL REFERENCES brands (id),
    recipient_user_id uuid                NOT NULL REFERENCES users (id),
    type              varchar(80)         NOT NULL,
    channel           varchar(30)         NOT NULL,
    subject           varchar(250),
    content           text                NOT NULL,
    status            notification_status NOT NULL DEFAULT 'PENDING',
    sent_at           timestamptz,
    read_at           timestamptz,
    created_at        timestamptz         NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_recipient ON notifications (recipient_user_id, status, created_at);

CREATE TABLE audit_logs (
    id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id    uuid         REFERENCES brands (id),
    actor_type  varchar(30)  NOT NULL,
    actor_id    uuid,
    action      varchar(150) NOT NULL,
    target_type varchar(100) NOT NULL,
    target_id   uuid,
    source_ip   inet,
    user_agent  text,
    severity    varchar(30)  NOT NULL DEFAULT 'INFO',
    before_data jsonb,
    after_data  jsonb,
    metadata    jsonb,
    occurred_at timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_brand  ON audit_logs (brand_id, occurred_at);
CREATE INDEX idx_audit_actor  ON audit_logs (actor_id, occurred_at);
CREATE INDEX idx_audit_target ON audit_logs (target_type, target_id);

COMMENT ON TABLE audit_logs IS
    'CHỈ THÊM MỚI. Không sửa, không xóa — được cưỡng chế ở §11 bằng cả quyền lẫn trigger '
    '(FR-AUD-09, NFR-SEC-08).';
COMMENT ON COLUMN audit_logs.brand_id IS 'NULL với sự kiện mức nền tảng.';


-- =====================================================================================
-- §8. BẢNG — DEVICE VÀ IOT
-- =====================================================================================

CREATE TABLE device_credentials (
    id                       uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id               uuid              NOT NULL UNIQUE REFERENCES machines (id),
    credential_identifier    varchar(200)      NOT NULL UNIQUE,
    public_key_or_secret_hash text             NOT NULL,
    certificate_fingerprint  varchar(255),
    status                   credential_status NOT NULL DEFAULT 'ACTIVE',
    issued_at                timestamptz       NOT NULL,
    expires_at               timestamptz,
    revoked_at               timestamptz,
    last_authenticated_at    timestamptz
);

COMMENT ON TABLE device_credentials IS
    'Mỗi máy một bộ thông tin xác thực riêng, không dùng chung (FR-MCH-02, NFR-SEC-07). '
    'Chỉ lưu băm/khóa công khai, không lưu bí mật gốc (NFR-SEC-05).';

CREATE TABLE device_events (
    id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id      uuid         NOT NULL REFERENCES machines (id),
    device_event_id varchar(150) NOT NULL,
    event_type      varchar(100) NOT NULL,
    occurred_at     timestamptz  NOT NULL,
    received_at     timestamptz  NOT NULL DEFAULT now(),
    payload         jsonb
);

CREATE UNIQUE INDEX uq_device_event ON device_events (machine_id, device_event_id);
CREATE INDEX idx_device_events_time ON device_events (machine_id, occurred_at);

COMMENT ON INDEX uq_device_event IS
    'Khử trùng sự kiện thiết bị gửi lại sau khi kết nối lại (FR-IOT-10, FR-IOT-11).';

CREATE TABLE sensor_readings (
    id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id    uuid          NOT NULL REFERENCES machines (id),
    slot_id       uuid          REFERENCES machine_slots (id),
    reading_type  varchar(100)  NOT NULL,
    numeric_value numeric(18,6),
    unit          varchar(30),
    payload       jsonb,
    measured_at   timestamptz   NOT NULL,
    received_at   timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_sensor_readings ON sensor_readings (machine_id, slot_id, measured_at);

COMMENT ON TABLE sensor_readings IS
    'Telemetry theo FR-IOT-04, lưu lịch sử phục vụ báo cáo và phân tích (FR-IOT-14).';


-- =====================================================================================
-- §9. KHÓA NGOẠI VÒNG
-- Hai cặp bảng phụ thuộc hai chiều, không khai báo inline được.
-- =====================================================================================

ALTER TABLE machine_slots
    ADD CONSTRAINT fk_slot_active_bottle
    FOREIGN KEY (active_bottle_id) REFERENCES bottles (id);

ALTER TABLE slot_rental_requests
    ADD CONSTRAINT fk_request_resulting_rental
    FOREIGN KEY (resulting_rental_id) REFERENCES slot_rentals (id);


-- =====================================================================================
-- §10. INDEX VÀ RÀNG BUỘC BẮT BUỘC
-- Bốn index đầu là yêu cầu cứng của spec/contracts/README.md — toàn bộ cơ chế bảo đảm
-- idempotency và ràng buộc slot của dự án nằm ở đây.
-- =====================================================================================

-- (1) Một hóa đơn hiệu lực trên mỗi slot (FR-SLT-02, NFR-DAT-07)
CREATE UNIQUE INDEX uq_slot_active_rental ON slot_rentals (slot_id)
    WHERE status IN ('ACTIVE', 'EXPIRING', 'GRACE', 'LIQUIDATED');

-- (2) Chống xử lý webhook trùng (FR-ORD-15)
CREATE UNIQUE INDEX uq_payment_event ON payment_events (provider, provider_event_id);

-- (3) Một lệnh xịt hiệu lực trên mỗi đơn (FR-DSP-05)
--     Chỉ áp cho lệnh CUSTOMER: lệnh DIAGNOSTIC không gắn đơn nên order_id NULL.
CREATE UNIQUE INDEX uq_order_active_command ON dispense_commands (order_id)
    WHERE order_id IS NOT NULL
      AND command_type = 'CUSTOMER'
      AND status IN ('CREATED', 'SENT', 'ACKNOWLEDGED');

-- (3b) Một lệnh xịt khách hàng hiệu lực trên mỗi MÁY (FR-DSP-26, ADR-0007). Lệnh ACKNOWLEDGED nghĩa là
--      đèn nút đang sáng chờ khách bấm; hai lệnh cùng hiệu lực là hai nút sáng cùng lúc và người sau
--      bấm được lượt của người trước. Đơn thanh toán sau giữ ở PAID ("chờ lượt") tới khi lệnh trước
--      kết thúc. DIAGNOSTIC không chờ bấm nên không tính.
CREATE UNIQUE INDEX uq_machine_active_customer_command ON dispense_commands (machine_id)
    WHERE command_type = 'CUSTOMER'
      AND status IN ('CREATED', 'SENT', 'ACKNOWLEDGED');

-- (4) Một chai hoạt động trên mỗi slot (FR-MCH-07)
--     Chiều "một slot một chai" đã do cardinality của cột bảo đảm; index này chặn chiều còn lại:
--     một chai không thể đồng thời lắp ở hai slot (ADR-0002).
CREATE UNIQUE INDEX uq_slot_active_bottle ON machine_slots (active_bottle_id)
    WHERE active_bottle_id IS NOT NULL;

-- Kỳ hạn hai hóa đơn trên cùng slot không được chồng lấn (FR-SLT-05, lỗi RENTAL_OVERLAP).
--
-- Tập trạng thái ở đây RỘNG HƠN uq_slot_active_rental đúng một giá trị: DRAFT. Đó là toàn bộ giá
-- trị của ràng buộc này. uq_slot_active_rental đã bảo đảm mỗi slot chỉ có một hóa đơn đang chiếm
-- dụng, nên với riêng 4 trạng thái chiếm dụng thì exclusion constraint không bao giờ kích hoạt
-- độc lập. Hóa đơn DRAFT — đang giữ chỗ chờ thanh toán, hoặc đã thanh toán chờ nạp hàng — lọt qua
-- unique index, và chỉ ràng buộc này chặn được hai thương hiệu cùng giữ chỗ một slot (FR-SLT-35
-- AC3, ADR-0006). Hóa đơn DRAFT mang kỳ hạn tạm đủ dài để phủ thời gian chờ nạp hàng.
--
-- RENEWED/CLOSED/TERMINATED/CANCELLED không nằm trong tập: hóa đơn đã kết thúc hoặc đã hủy thì slot
-- được cho thuê lại (spec/glossary.md). Dùng '[)' để hóa đơn gia hạn nối tiếp đúng ngày cũ hết hạn
-- không bị coi là chồng lấn (FR-SLT-12).
ALTER TABLE slot_rentals
    ADD CONSTRAINT excl_slot_rental_overlap
    EXCLUDE USING gist (
        slot_id WITH =,
        tstzrange(starts_at, ends_at, '[)') WITH &&
    )
    WHERE (status IN ('DRAFT', 'ACTIVE', 'EXPIRING', 'GRACE', 'LIQUIDATED'));

-- Một giao dịch nhà cung cấp chỉ ứng với một payment (DB_DIAGRAM note #2)
CREATE UNIQUE INDEX uq_payment_provider_txn ON payments (provider, provider_transaction_id)
    WHERE provider_transaction_id IS NOT NULL;

-- Không sinh cảnh báo mới cùng loại trên cùng đối tượng khi còn cảnh báo chưa xử lý (FR-ALR-07)
CREATE UNIQUE INDEX uq_alert_dedup_unresolved ON alerts (deduplication_key)
    WHERE status IN ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS');

-- Một vai trò chỉ gán một lần cho một người trong cùng phạm vi (DB_DIAGRAM note #7).
-- COALESCE vì NULL không bằng NULL trong unique index thông thường.
CREATE UNIQUE INDEX uq_user_role_scope ON user_roles (
    user_id,
    role_id,
    scope_type,
    COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- Không tạo yêu cầu bổ sung mới khi slot còn yêu cầu chưa hoàn tất (FR-RFQ-12,
-- lỗi REFILL_REQUEST_PENDING)
CREATE UNIQUE INDEX uq_refill_request_open ON refill_requests (slot_id)
    WHERE status IN ('SUBMITTED', 'ACCEPTED', 'SCHEDULED');

-- DEPRECATED (ADR-0006): bảng slot_rental_requests không còn nhận bản ghi mới. Giữ index cho tới khi
-- bảng bị xóa. Trước đây: không gửi yêu cầu thuê mới khi slot còn yêu cầu chưa xử lý xong (FR-SLT-26).
CREATE UNIQUE INDEX uq_slot_rental_request_open ON slot_rental_requests (slot_id)
    WHERE status IN ('REQUESTED', 'APPROVED');

-- Index cho khóa ngoại nằm trên đường truy vấn nóng.
-- PostgreSQL KHÔNG tự tạo index cho khóa ngoại. Năm cột dưới đây được join thường xuyên; các
-- khóa ngoại còn lại (created_by, reviewed_by, assigned_to…) cố tình để trống vì gần như không
-- bao giờ join, thêm index chỉ làm chậm INSERT.
CREATE INDEX idx_orders_rental          ON orders (slot_rental_id);          -- FR-SLT-17/18, NFR-PER-06
CREATE INDEX idx_orders_slot            ON orders (slot_id);                 -- FR-RPT-08
CREATE INDEX idx_alerts_machine         ON alerts (machine_id);              -- FR-ALR-09
CREATE INDEX idx_refill_requests_rental ON refill_requests (slot_rental_id); -- FR-RFQ-10
CREATE INDEX idx_payment_events_payment ON payment_events (payment_id);      -- FR-AUD-11

-- Mỗi hóa đơn thuê slot tối đa một thanh toán đang chờ (FR-SLT-37 AC3, ADR-0006).
CREATE UNIQUE INDEX uq_rental_payment_pending ON payments (slot_rental_id)
    WHERE slot_rental_id IS NOT NULL AND status = 'PENDING';
CREATE INDEX idx_payments_rental ON payments (slot_rental_id)
    WHERE slot_rental_id IS NOT NULL;


-- =====================================================================================
-- §10b. RÀNG BUỘC CÙNG THƯƠNG HIỆU (composite foreign key)
--
-- Chặn ở tầng CSDL đúng loại lỗi mà BR-012 sợ nhất: ghi brand_id của thương hiệu này lên bản ghi
-- trỏ tới tài nguyên của thương hiệu khác. Ứng dụng có thể quên kiểm; khóa ngoại thì không.
--
-- Cách làm: thêm UNIQUE (id, brand_id) lên bảng cha — dư thừa về mặt tính duy nhất vì id đã là
-- khóa chính, nhưng PostgreSQL bắt buộc cột được tham chiếu phải có ràng buộc duy nhất.
-- =====================================================================================

ALTER TABLE slot_rentals
    ADD CONSTRAINT uq_rental_id_brand UNIQUE (id, brand_id);
ALTER TABLE fragrance_products
    ADD CONSTRAINT uq_product_id_brand UNIQUE (id, brand_id);
ALTER TABLE inventory_batches
    ADD CONSTRAINT uq_batch_id_brand UNIQUE (id, brand_id);
ALTER TABLE bottles
    ADD CONSTRAINT uq_bottle_id_brand UNIQUE (id, brand_id);

-- (1) Đơn hàng phải cùng thương hiệu với hóa đơn thuê sinh ra nó.
--     Vẫn đúng sau thanh lý: hóa đơn LIQUIDATED giữ nguyên brand_id của thương hiệu thuê, chỉ
--     orders.revenue_owner lật sang PLATFORM (FR-REV-02).
ALTER TABLE orders
    ADD CONSTRAINT fk_order_rental_same_brand
    FOREIGN KEY (slot_rental_id, brand_id) REFERENCES slot_rentals (id, brand_id);

-- (2) Sự kiện tương tác kiosk phải cùng thương hiệu với hóa đơn.
ALTER TABLE kiosk_interaction_events
    ADD CONSTRAINT fk_kiosk_event_rental_same_brand
    FOREIGN KEY (slot_rental_id, brand_id) REFERENCES slot_rentals (id, brand_id);

-- (3) Yêu cầu bổ sung phải cùng thương hiệu với hóa đơn.
ALTER TABLE refill_requests
    ADD CONSTRAINT fk_refill_request_rental_same_brand
    FOREIGN KEY (slot_rental_id, brand_id) REFERENCES slot_rentals (id, brand_id);

-- (4) Sản phẩm gán vào slot phải thuộc thương hiệu thuê slot đó (FR-SLT-07, PRODUCT_NOT_OWNED).
--     fragrance_product_id nullable + MATCH SIMPLE (mặc định) nghĩa là ràng buộc tự bỏ qua khi
--     cột NULL — đúng hành vi cần cho cửa sổ giữa lúc thanh toán và lúc cấu hình slot (ADR-0006).
ALTER TABLE slot_rentals
    ADD CONSTRAINT fk_rental_product_same_brand
    FOREIGN KEY (fragrance_product_id, brand_id) REFERENCES fragrance_products (id, brand_id);

-- (5) Lô nhập phải cùng thương hiệu với sản phẩm trong lô.
ALTER TABLE inventory_batches
    ADD CONSTRAINT fk_batch_product_same_brand
    FOREIGN KEY (fragrance_product_id, brand_id) REFERENCES fragrance_products (id, brand_id);

-- (6) Chai phải cùng thương hiệu với lô sinh ra nó.
--     Dùng brand_id (thương hiệu gốc, bất biến), KHÔNG dùng owner — owner lật sang PLATFORM khi
--     thanh lý trong khi chai vẫn thuộc lô cũ (FR-EXP-15, FR-EXP-16).
ALTER TABLE bottles
    ADD CONSTRAINT fk_bottle_batch_same_brand
    FOREIGN KEY (batch_id, brand_id) REFERENCES inventory_batches (id, brand_id);

-- (7) Thanh toán hóa đơn phải cùng thương hiệu với hóa đơn (ADR-0006).
ALTER TABLE payments
    ADD CONSTRAINT fk_payment_rental_same_brand
    FOREIGN KEY (slot_rental_id, brand_id) REFERENCES slot_rentals (id, brand_id);

-- (8) Khoản bồi thường phải cùng thương hiệu với chai hư hỏng và với hóa đơn có gói bảo quản được
--     áp (FR-SLT-44, ADR-0006). Chặn đúng lỗi "bồi thường chai của B bằng hạn mức hóa đơn của A".
ALTER TABLE storage_compensations
    ADD CONSTRAINT fk_compensation_bottle_same_brand
    FOREIGN KEY (bottle_id, brand_id) REFERENCES bottles (id, brand_id);
ALTER TABLE storage_compensations
    ADD CONSTRAINT fk_compensation_rental_same_brand
    FOREIGN KEY (slot_rental_id, brand_id) REFERENCES slot_rentals (id, brand_id);


-- =====================================================================================
-- §10c. TỰ CẬP NHẬT updated_at
--
-- DEFAULT now() chỉ chạy lúc INSERT. Không có trigger thì updated_at đứng im mãi sau đó, và
-- không ai phát hiện cho tới lúc cần biết "bản ghi này sửa lần cuối khi nào".
-- Đặt ở tầng CSDL chứ không phó mặc tầng ứng dụng, để sửa tay bằng psql hay Adminer lúc dev cũng đúng.
-- =====================================================================================

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'bottles', 'brand_shipment_declarations', 'brands', 'fragrance_products', 'locations',
        'machine_slots', 'machines', 'maintenance_tickets', 'orders', 'payments',
        'refill_requests', 'rental_packages', 'roles', 'slot_rental_requests', 'slot_rentals',
        'storage_compensations', 'storage_plans', 'users'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_set_updated_at
                 BEFORE UPDATE ON %1$I
                 FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()', t
        );
    END LOOP;
END;
$$;


-- =====================================================================================
-- §11. AUDIT LOG APPEND-ONLY (FR-AUD-09, NFR-SEC-08)
--
-- Hai lớp: quyền cho role ứng dụng, và trigger chặn kể cả khi chạy bằng superuser lúc dev.
-- =====================================================================================

CREATE OR REPLACE FUNCTION fn_audit_logs_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs chỉ cho phép thêm mới (FR-AUD-09, NFR-SEC-08); % bị từ chối',
        TG_OP;
END;
$$;

CREATE TRIGGER trg_audit_logs_append_only
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION fn_audit_logs_append_only();

-- Role ứng dụng. Backend phải kết nối bằng role này, KHÔNG dùng role sở hữu schema:
-- trigger ở trên chặn được thao tác, nhưng chỉ REVOKE mới chặn được cả TRUNCATE.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scent_app') THEN
        CREATE ROLE scent_app NOLOGIN;
    END IF;
END;
$$;

GRANT USAGE ON SCHEMA public TO scent_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO scent_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM scent_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO scent_app;


-- =====================================================================================
-- §12. ROW-LEVEL SECURITY — MẪU, CHƯA BẬT
--
-- DB_DIAGRAM implementation note #5. Chưa bật trong đợt này: cô lập dữ liệu hiện do tầng ứng
-- dụng bảo đảm (FR-BND-05, FR-AUTH-07). Đây là NỢ KỸ THUẬT đã ghi nhận trong ADR-0002 —
-- NFR-SEC-04 yêu cầu 100% endpoint có dữ liệu thương hiệu vượt test truy cập chéo.
-- Bật RLS phải đi kèm một ADR riêng.
--
-- Mẫu cho bảng orders:
--
--   ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY brand_isolation ON orders
--       USING (brand_id = current_setting('app.current_brand_id')::uuid);
--
-- Lưu ý khi bật: chính sách phải lọc qua orders/slot_rentals, KHÔNG qua machines — machines
-- không có brand_id (BR-003, BR-012, spec/PROJECT.md §3).
-- =====================================================================================


-- =====================================================================================
-- §13. RÀNG BUỘC THUỘC TẦNG DOMAIN SERVICE, KHÔNG NẰM Ở CSDL
--
-- Những điều sau KHÔNG được CSDL cưỡng chế. Đọc schema này rồi tưởng DB đã lo hết là sai.
-- Nguồn: DB_DIAGRAM_MERMAID.md implementation notes #6, #9, #12, #13, #14, #16.
--
--  1. Chuyển trạng thái hợp lệ của order, slot_rental, dispense_command, ticket, alert —
--     cưỡng chế ở domain service và ghi vào bảng lịch sử tương ứng (spec/glossary.md).
--
--  2. refill_sessions.new_bottle_id phải NOT NULL tại thời điểm status chuyển COMPLETED.
--     Cột để nullable vì FR-INV-29 cho phép mở phiếu nạp trước khi chọn chai thay thế.
--
--  3. slot_rentals.fragrance_product_id và price_per_spray phải NOT NULL trước khi slot nhận đơn
--     (FR-SLT-29). Hai cột để nullable chỉ để phục vụ cửa sổ giữa lúc thanh toán và lúc cấu hình
--     slot (ADR-0006).
--
--  4. refill_requests chỉ được đặt COMPLETED khi refill_session_id có giá trị (FR-RFQ-09).
--
--  5. FR-ALR-03 (cửa mở quá DOOR_OPEN_ALERT_MIN) phải tạm ngưng khi tồn tại refill_sessions
--     với status = STARTED cho cùng máy/slot (FR-INV-30), BỔ SUNG cho ngoại lệ chế độ
--     MAINTENANCE vốn có.
--
--  6. Ràng buộc cùng thương hiệu: 6 quan hệ ĐÃ được cưỡng chế bằng composite FK ở §10b. Hai chỗ
--     còn lại vẫn thuộc domain service vì không diễn đạt được bằng khóa ngoại:
--       - Chai gán vào slot phải thuộc thương hiệu ĐANG THUÊ slot đó (FR-INV-06, lỗi
--         BOTTLE_NOT_OWNED). Không làm bằng FK được vì phải so bottles.brand_id với brand_id của
--         hóa đơn đang hiệu lực trên slot — một giá trị thay đổi theo thời gian, không phải cột
--         cố định trên bảng nào.
--       - bottles.fragrance_product_id phải khớp sản phẩm của lô sinh ra chai (FR-INV-07, lỗi
--         PRODUCT_MISMATCH). Siết được bằng FK (batch_id, fragrance_product_id) → inventory_batches
--         nếu cần, nhưng chưa làm trong đợt này.
--
--  7. Các cột ảnh chụp trên orders (brand_id, slot_rental_id, revenue_owner, amount) không có
--     đường cập nhật sau khi tạo (NFR-DAT-06, spec/contracts/README.md).
--
--  8. Khi thanh lý theo FR-EXP-15: với mọi chai đang lắp hoặc còn giữ cho slot của hóa đơn đó,
--     đặt bottles.owner = PLATFORM, bottles.status = LIQUIDATED, bottles.liquidated_at = now(),
--     bottles.source_rental_id = id hóa đơn bị thanh lý (FR-EXP-16).
--
--  9. Mọi ngưỡng số (TTL, timeout, giới hạn) đọc từ cấu hình theo tên hằng trong
--     spec/constraints.md — không hardcode, và cũng không đặt làm DEFAULT trong schema này.
--
--  10. Hóa đơn thuê slot theo gói (ADR-0006):
--       - Các cột ảnh chụp giá trên slot_rentals (duration_months, monthly_rent_price,
--         discount_percent, storage_*, rent_amount, storage_amount, grace_fee_amount, total_amount)
--         chỉ ghi một lần lúc tạo hóa đơn (FR-SLT-33), như cột ảnh chụp trên orders ở mục 7.
--       - hold_expires_at = lúc tạo + RENTAL_CHECKOUT_HOLD_MIN; job FR-SLT-39 chuyển DRAFT chưa
--         thanh toán quá mốc sang CANCELLED và đặt payment PENDING của nó sang EXPIRED.
--       - Lắp chai đầu tiên (FR-SLT-24) hoặc quá RENTAL_MAX_STOCKING_DAYS kể từ paid_at (FR-SLT-42)
--         chuyển DRAFT đã thanh toán sang ACTIVE và ghi đè starts_at/ends_at bằng kỳ hạn thật.
--       - Hóa đơn gia hạn: hóa đơn cũ → RENEWED và hóa đơn mới → ACTIVE trong CÙNG transaction,
--         đúng lúc hóa đơn mới bắt đầu hiệu lực (FR-SLT-12, FR-EXP-13).
--       - storage_compensations.amount không vượt hạn mức còn lại =
--         slot_rentals.storage_coverage_cap − tổng amount đã có của cùng slot_rental_id (FR-SLT-44).
--
--  11. Nút bấm vật lý (ADR-0007):
--       - Webhook PAID chỉ tạo lệnh CUSTOMER khi máy không còn lệnh CUSTOMER hiệu lực (index 3b);
--         nếu còn, đơn giữ PAID và được tạo lệnh ngay khi lệnh trước kết thúc (FR-DSP-26).
--       - Tạo đơn mới trên máy có lệnh CUSTOMER hiệu lực trả MACHINE_BUSY (FR-ORD-24).
--       - REJECT với failure_code = PRESS_TIMEOUT → lệnh REJECTED, đơn FORFEITED, KHÔNG đặt
--         needs_manual_review (FR-ORD-27). Mọi mã từ chối khác sau ACK → đơn FAILED + needs_manual_review.
--       - Mốc UNKNOWN sau ACK = acknowledged_at + DISPENSE_PRESS_WINDOW_SEC + DISPENSE_RESULT_TIMEOUT_SEC
--         (FR-DSP-18).
-- =====================================================================================
