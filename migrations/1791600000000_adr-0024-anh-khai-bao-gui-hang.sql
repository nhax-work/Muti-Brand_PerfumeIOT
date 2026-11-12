-- Up Migration
--
-- Contract ADR-0024: Brand Admin gửi ảnh lô hàng trước khi đóng gói và ảnh kiện hàng đã đóng gói
-- khi khai báo gửi hàng (FR-INV-22). Mỗi dòng một ảnh, có loại, người upload và thời điểm.
-- spec/contracts/schema.sql đã được cập nhật để mô tả trạng thái lược đồ sau file này.

CREATE TYPE shipment_photo_kind AS ENUM ('BEFORE_PACKING', 'PACKED');

CREATE TABLE shipment_declaration_photos (
    id              uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
    declaration_id  uuid                NOT NULL REFERENCES brand_shipment_declarations (id)
                                            ON DELETE CASCADE,
    kind            shipment_photo_kind NOT NULL,
    url             text                NOT NULL,
    uploaded_by     uuid                NOT NULL REFERENCES users (id),
    created_at      timestamptz         NOT NULL DEFAULT now()
);

CREATE INDEX idx_shipment_photo_declaration
    ON shipment_declaration_photos (declaration_id, kind, created_at);

COMMENT ON TABLE shipment_declaration_photos IS
    'Ảnh lô hàng trước khi đóng gói và kiện hàng đã đóng gói của một khai báo gửi hàng (FR-INV-22, '
    'ADR-0024). Chỉ thêm/xóa khi khai báo còn DECLARED.';
COMMENT ON COLUMN shipment_declaration_photos.url IS
    'URL tuyệt đối trên kho ảnh, khóa shipments/{declaration_id}-{hash}.webp (ADR-0024).';


-- Down Migration

DROP TABLE shipment_declaration_photos;
DROP TYPE shipment_photo_kind;
