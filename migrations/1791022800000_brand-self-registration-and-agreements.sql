-- Up Migration
--
-- ADR-0013, FR-USR-06, FR-USR-07, FR-SLT-48, FR-SLT-49:
-- Thương hiệu tự đăng ký, xác minh email, hợp đồng khung có phiên bản và lưu vết chấp thuận.
--

CREATE TABLE email_verifications (
    id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    email        citext       NOT NULL,
    token_hash   text         NOT NULL UNIQUE,
    expires_at   timestamptz  NOT NULL,
    verified_at  timestamptz,
    created_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_verifications_user_status ON email_verifications (user_id, verified_at);
CREATE INDEX idx_email_verifications_email ON email_verifications (email);

CREATE TABLE agreement_versions (
    id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    version      varchar(50)  NOT NULL UNIQUE,
    title        varchar(255) NOT NULL,
    content      text         NOT NULL,
    content_hash varchar(64)  NOT NULL,
    is_active    boolean      NOT NULL DEFAULT false,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    updated_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_agreement_versions_active ON agreement_versions (is_active) WHERE is_active = true;

CREATE TABLE agreement_acceptances (
    id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id             uuid         NOT NULL REFERENCES brands (id) ON DELETE CASCADE,
    agreement_version_id uuid         NOT NULL REFERENCES agreement_versions (id),
    version              varchar(50)  NOT NULL,
    accepted_by          uuid         NOT NULL REFERENCES users (id),
    accepted_at          timestamptz  NOT NULL DEFAULT now(),
    ip_address           inet,
    content_hash         varchar(64)  NOT NULL,
    created_at           timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT uq_brand_agreement_version UNIQUE (brand_id, agreement_version_id)
);

CREATE INDEX idx_agreement_acceptances_brand ON agreement_acceptances (brand_id);

INSERT INTO agreement_versions (version, title, content, content_hash, is_active)
VALUES (
    'v1.0',
    'Hợp đồng khung dịch vụ ScentStation v1.0',
    'Điều khoản dịch vụ ScentStation.',
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    true
) ON CONFLICT (version) DO NOTHING;

-- Down Migration
DROP TABLE IF EXISTS agreement_acceptances;
DROP TABLE IF EXISTS agreement_versions;
DROP TABLE IF EXISTS email_verifications;
