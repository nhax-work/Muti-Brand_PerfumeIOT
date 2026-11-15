# ADR-0030 — Tự lấy lại mật khẩu qua email

**Ngày:** 2026-11-13 · **Trạng thái:** đề xuất · **Người quyết:** TV1

## Bối cảnh

Người dùng quên mật khẩu hiện chỉ có một đường: nhờ Platform Super Admin đặt lại (FR-USR-04), nhận mật
khẩu tạm qua kênh ngoài rồi đổi ở lần đăng nhập đầu (ADR-0004). ADR-0004 chọn mật khẩu tạm vì lúc đó
**chưa có hạ tầng email** (phương án 3 bị loại vì lý do này).

Từ ADR-0013 và ADR-0017, hệ thống đã gửi được email: mã xác minh cho thương hiệu tự đăng ký
(FR-USR-07) và thông báo tiền/hàng (FR-ALR-16). Thương hiệu tự đăng ký không có quan hệ trực tiếp với
Super Admin, nên "nhờ Super Admin đặt lại" là ngõ cụt với chính nhóm người dùng đông nhất.

## Phương án đã cân nhắc

1. **Giữ như cũ.** Super Admin phải xử lý tay mọi lần quên mật khẩu và gửi mật khẩu tạm qua kênh ngoài
   — đúng thứ ADR-0004 muốn tránh khi đã có email.
2. **Gửi mật khẩu mới qua email.** Mật khẩu nằm nguyên văn trong hòm thư, và ai biết email người khác là
   đổi được mật khẩu của họ (khóa họ khỏi tài khoản) chỉ bằng một yêu cầu.
3. **Gửi liên kết đặt lại mật khẩu dùng một lần.** **Chọn.** Mật khẩu chỉ đổi khi người mở được hòm thư
   tự đặt; yêu cầu của người lạ không làm gì tài khoản.

## Quyết định

### 1. Luồng

| Bước | Thao tác | Kết quả |
|---|---|---|
| 1 | `POST /auth/forgot-password` `{ email }` | Luôn `204`. Tài khoản tồn tại và đang `ACTIVE` hoặc `INVITED` → sinh mã, gửi email liên kết `{ADMIN_WEB_BASE_URL}/reset-password?token=…` |
| 2 | Người dùng mở liên kết, nhập mật khẩu mới | — |
| 3 | `POST /auth/reset-password` `{ token, newPassword }` | `204`; mã sai, quá hạn hoặc đã dùng → `VALIDATION_ERROR` |

Luật:

- **Không lộ email nào có tài khoản.** Bước 1 trả cùng một câu trả lời cho email có thật, không có thật
  và tài khoản bị khóa. Lỗi gửi email chỉ ghi log.
- **Mã dùng một lần, hết hạn sau `PASSWORD_RESET_TOKEN_TTL_MIN` phút.** Chỉ lưu SHA-256 của mã
  (NFR-SEC-05), như `email_verifications`. Mỗi tài khoản một mã hiệu lực: yêu cầu mới thay mã cũ.
- **Giới hạn tần suất** `PASSWORD_RESET_RATE_LIMIT_PER_MIN` theo IP **và** theo email — chặn dò email
  lẫn dội thư vào hòm của một người. Vượt ngưỡng trả `RATE_LIMITED` (lộ là đang bị giới hạn, không lộ
  tài khoản có tồn tại).
- **Đặt lại xong:** mật khẩu mới (tối thiểu 8 ký tự, như `ChangePasswordRequest`), tài khoản `INVITED`
  chuyển `ACTIVE` (đã tự đặt mật khẩu — đúng điều kiện thoát `INVITED` của ADR-0004), **mọi phiên bị thu
  hồi**, ghi AuditLog `auth.password.reset`. Bản ghi này ngắt chuỗi đăng nhập sai liên tiếp của
  FR-AUTH-03 (đếm từ `audit_logs`) — người vừa đặt lại mật khẩu không phải chờ hết `LOGIN_LOCKOUT_MIN`.
- Tài khoản `DISABLED` hay `LOCKED` không lấy lại được mật khẩu — nếu không, đây là cửa sau mở lại tài
  khoản bị khóa có chủ ý (cùng lý do với FR-USR-04 AC2).
- Mã còn hạn nhưng tài khoản bị khóa sau khi gửi → `VALIDATION_ERROR` như mã sai.

### 2. Lược đồ

```sql
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
```

`ON DELETE CASCADE`: mã không có nghĩa gì khi tài khoản không còn.

### 3. Hằng ngưỡng (`spec/constraints.md`)

| Hằng | Giá trị | FR |
|---|---|---|
| `PASSWORD_RESET_TOKEN_TTL_MIN` | 30 | FR-AUTH-13 |
| `PASSWORD_RESET_RATE_LIMIT_PER_MIN` | 5 | FR-AUTH-13 |

### 4. Đặc tả

FR-AUTH-13 (M): *Hệ thống phải cho phép người dùng tự đặt lại mật khẩu qua liên kết dùng một lần gửi tới
email của tài khoản, không tiết lộ email nào có tài khoản.* Không có mã lỗi mới — dùng
`VALIDATION_ERROR` và `RATE_LIMITED`. FR-USR-04 giữ nguyên: Super Admin vẫn đặt lại được, cho người
không còn dùng hòm thư cũ.

## Hệ quả

- **Contract:** `openapi.yaml` — `forgotPassword`, `resetPassword`, schema `ForgotPasswordRequest`,
  `ResetPasswordRequest`; `schema.sql`, `data-dictionary.md`, `erd.md` — bảng `password_reset_tokens`.
- **Migration:** `migrations/1791700060000_adr-0030-quen-mat-khau.sql`.
- **API:** `AuthService.requestPasswordReset`, `AuthService.resetPassword`, cổng gửi email
  `PASSWORD_RESET_SENDER`.
- **Web quản trị:** liên kết "Quên mật khẩu?" ở trang đăng nhập; màn `/forgot-password` và
  `/reset-password` (công khai, trong `AuthLayout`).
