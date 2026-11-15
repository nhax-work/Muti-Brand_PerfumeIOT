-- Up Migration
--
-- Contract ADR-0030: tự lấy lại mật khẩu qua liên kết dùng một lần gửi tới email (FR-AUTH-13).
-- spec/contracts/schema.sql đã được cập nhật để mô tả trạng thái lược đồ sau file này.

CREATE TABLE password_reset_tokens (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash char(64)    NOT NULL,
    expires_at timestamptz NOT NULL,
    used_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_password_reset_user UNIQUE (user_id),
    CONSTRAINT uq_password_reset_token UNIQUE (token_hash),
    CONSTRAINT chk_password_reset_expiry CHECK (expires_at > created_at)
);

COMMENT ON TABLE password_reset_tokens IS
    'Mã đặt lại mật khẩu gửi qua email (FR-AUTH-13, ADR-0030). Mỗi tài khoản một dòng: yêu cầu mới '
    'thay mã cũ. used_at khác NULL = mã đã dùng.';
COMMENT ON COLUMN password_reset_tokens.token_hash IS
    'SHA-256 (hex) của mã gửi trong email. Không lưu mã gốc (NFR-SEC-05).';


-- Down Migration

DROP TABLE password_reset_tokens;
