# FR-USR — Người dùng và vai trò

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` mục A3 · 7 FR  
> Trạng thái AC: **hoàn thành** (FR-USR-01, 05 soát lại và FR-USR-06, 07 thêm ngày 2026-10-17 theo ADR-0013 — thương hiệu tự đăng ký & xác minh email)  
> Phụ trách: TV1 / Tài  
> Mức chi tiết: AC cho FR có điều kiện; CRUD để dạng phát biểu  

Đọc kèm: `spec/modules/AUTH.md`, `spec/errors.md`, `spec/constraints.md`,
`spec/decisions/0004-cap-mat-khau-tam-va-bat-doi.md`,
`spec/decisions/0013-brand-tu-dang-ky-hop-dong-hai-lop-va-chi-tra-doanh-thu.md`,
`spec/contracts/openapi.yaml` (tag USR, AUTH)

---

## Hai luật chung cho cả module

**Chỉ Platform Super Admin.** Mọi endpoint `/users` đòi quyền `user.manage`, và seed chỉ cấp quyền
đó cho vai trò Platform Super Admin. Cưỡng chế một lần ở cấp controller, không lặp lại trong từng
thao tác (FR-USR-05). Luồng duy nhất tạo tài khoản không qua Super Admin là thương hiệu tự đăng ký (FR-USR-06, ADR-0013).

**Mật khẩu tạm, trả về đúng một lần (ADR-0004).** Tạo tài khoản thủ công và đặt lại mật khẩu đều sinh mật khẩu
tạm ngẫu nhiên, trả trong phản hồi của chính lệnh đó rồi không bao giờ trả lại, không lưu dạng gốc,
không ghi vào nhật ký kiểm toán. Tài khoản ở `INVITED` cho tới khi người dùng tự đổi qua
`POST /auth/change-password`.

---

## FR-USR-01 — Tạo tài khoản Brand Admin thủ công
* **Statement:** Hệ thống phải cho phép Platform Super Admin tạo tài khoản Brand Admin và gán cho một thương hiệu, song song với luồng thương hiệu tự đăng ký (FR-USR-06).
* **Traces:** BR-003 · **Priority:** M
* **API:** `POST /users`
* **Acceptance criteria:**
  * **AC1:** Given Platform Super Admin và thương hiệu `B` tồn tại,  
    When tạo tài khoản với `role = BRAND_ADMIN`, `brandId = B`,  
    Then hệ thống tạo tài khoản ở `INVITED` gắn với `B`, trả `201` kèm `temporaryPassword`, và ghi AuditLog `usr.user.created` **không** chứa mật khẩu tạm.
  * **AC2 (Ca biên - Thương hiệu không tồn tại):** Given `brandId` không trỏ tới thương hiệu nào,  
    When tạo tài khoản,  
    Then hệ thống từ chối với HTTP 400 `VALIDATION_ERROR`, `details.fields` chỉ ra `brandId`.
  * **AC3 (Ca biên - Email trùng):** Given đã có tài khoản dùng email `a@x.local`,  
    When tạo tài khoản khác với `A@X.LOCAL`,  
    Then hệ thống từ chối với HTTP 400 `VALIDATION_ERROR`, `details.fields` chỉ ra `email` — so sánh không phân biệt hoa thường (`users.email` là `citext`).
  * **AC4 (Mật khẩu tạm chỉ xuất hiện một lần):** Given tài khoản vừa tạo,  
    When đọc lại bằng `GET /users/{id}`,  
    Then phản hồi **không** có `temporaryPassword`.
* **Test:** `test_FR_USR_01_create_brand_admin_user`

---

## FR-USR-02 — Tạo và quản lý tài khoản nhân sự nền tảng
* **Statement:** Hệ thống phải cho phép Platform Super Admin tạo và quản lý tài khoản Operations Staff và Inventory Staff của nền tảng.
* **Traces:** BR-004 · **Priority:** M
* **API:** `POST /users`, `GET /users`, `GET /users/{id}`
* **Acceptance criteria:**
  * **AC1:** Given Platform Super Admin,  
    When tạo tài khoản với `role = OPERATIONS_STAFF` hoặc `INVENTORY_STAFF` và **không** có `brandId`,  
    Then hệ thống tạo tài khoản ở `INVITED` với `brandId = null`.
  * **AC2 (Ca biên - Vai trò nền tảng gắn thương hiệu):** Given yêu cầu tạo Operations Staff có kèm `brandId`,  
    When gửi yêu cầu,  
    Then hệ thống từ chối với HTTP 400 `VALIDATION_ERROR`.
  * **AC3 (Tra cứu):** Given danh sách tài khoản,  
    When lọc theo `role` hoặc `brandId` và phân trang bằng `page`, `pageSize` (tối đa 200),  
    Then hệ thống trả `items` đã lọc kèm `meta.total` là tổng số khớp bộ lọc, không phải số trong trang.
* **Test:** `test_FR_USR_02_manage_platform_staff_users`

---

## FR-USR-03 — Vô hiệu hóa tài khoản
* **Statement:** Hệ thống phải cho phép Platform Super Admin vô hiệu hóa bất kỳ tài khoản nào trên nền tảng.
* **Traces:** BR-003 · **Priority:** M
* **API:** `POST /users/{id}/disable`
* **Acceptance criteria:**
  * **AC1:** Given tài khoản `U` đang có phiên hoạt động,  
    When Platform Super Admin vô hiệu hóa `U`,  
    Then `U` chuyển `DISABLED`, mọi phiên của `U` bị thu hồi (FR-AUTH-10), và AuditLog `usr.user.disabled` ghi trạng thái trước và sau.
  * **AC2 (Không tự vô hiệu hóa):** Given Platform Super Admin,  
    When vô hiệu hóa chính tài khoản của mình,  
    Then hệ thống từ chối với HTTP 400 `VALIDATION_ERROR` — tránh trường hợp Super Admin cuối cùng tự khóa nền tảng.
  * **AC3 (Idempotent):** Given `U` đã `DISABLED`,  
    When vô hiệu hóa lần nữa,  
    Then hệ thống trả `204`, không thu hồi lại phiên, không ghi thêm AuditLog.
  * **AC4:** Given `U` bị vô hiệu hóa,  
    When `U` đăng nhập với mật khẩu đúng,  
    Then hệ thống trả `INVALID_CREDENTIALS` (FR-AUTH-01 AC3).
* **Test:** `test_FR_USR_03_disable_user_account`

---

## FR-USR-04 — Đặt lại mật khẩu
* **Statement:** Hệ thống phải cho phép Platform Super Admin đặt lại mật khẩu cho bất kỳ tài khoản nào trên nền tảng.
* **Traces:** BR-003 · **Priority:** M
* **API:** `POST /users/{id}/reset-password`, `POST /auth/change-password`
* **Acceptance criteria:**
  * **AC1:** Given tài khoản `U` đang hoạt động,  
    When Platform Super Admin đặt lại mật khẩu,  
    Then hệ thống trả `200` kèm `temporaryPassword` mới, đưa `U` về `INVITED`, thu hồi mọi phiên của `U`, và mật khẩu cũ không còn dùng được.
  * **AC2 (Tài khoản đã vô hiệu hóa):** Given `U` ở `DISABLED`,  
    When đặt lại mật khẩu,  
    Then hệ thống từ chối với HTTP 400 `VALIDATION_ERROR` — đặt lại sẽ đưa về `INVITED`, tức âm thầm mở lại một tài khoản đã bị khóa có chủ ý.
  * **AC3 (Đổi mật khẩu tạm):** Given `U` ở `INVITED` đăng nhập bằng mật khẩu tạm,  
    When gọi `POST /auth/change-password` với mật khẩu hiện tại đúng và mật khẩu mới dài tối thiểu 8 ký tự,  
    Then `U` chuyển `ACTIVE`, **mọi** phiên của `U` bị thu hồi kể cả phiên vừa gọi, và `U` đăng nhập lại bằng mật khẩu mới.
  * **AC4 (Ca biên - Mật khẩu hiện tại sai):** Given mật khẩu hiện tại không đúng,  
    When đổi mật khẩu,  
    Then hệ thống trả `INVALID_CREDENTIALS` và không đổi gì.
  * **AC5 (Ca biên - Mật khẩu mới trùng mật khẩu cũ):** Given mật khẩu mới trùng mật khẩu hiện tại,  
    When đổi mật khẩu,  
    Then hệ thống trả `VALIDATION_ERROR`.
* **Test:** `test_FR_USR_04_reset_password_and_mandatory_change`

---

## FR-USR-05 — Phân quyền quản trị tài khoản
* **Statement:** Hệ thống phải ngăn tài khoản không có vai trò Platform Super Admin tạo, sửa hoặc vô hiệu hóa tài khoản của người khác; tự đăng ký thương hiệu (FR-USR-06) là cách duy nhất tạo tài khoản mà không cần Super Admin.
* **Traces:** BR-003, BR-012 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given Brand Admin, Operations Staff hoặc Inventory Staff,  
    When gọi bất kỳ endpoint nào dưới `/users`,  
    Then hệ thống trả HTTP 403 `FORBIDDEN_SCOPE`.
  * **AC2 (Cưỡng chế ở controller):** Given controller `UsrController`,  
    When kiểm tra quyền,  
    Then quyền `user.manage` được gắn ở cấp lớp, áp cho mọi endpoint.
* **Test:** `test_FR_USR_05_user_endpoints_require_user_manage_permission`

---

## FR-USR-06 — Thương hiệu tự đăng ký
* **Statement:** Hệ thống phải cho phép thương hiệu tự đăng ký bằng tên thương hiệu, email và mật khẩu, tạo cùng lúc một thương hiệu và một tài khoản Brand Admin gắn với thương hiệu đó (ADR-0013).
* **Traces:** BR-011 · **Priority:** M · ADR-0013 mục 1
* **API:** `POST /auth/register-brand`
* **Acceptance criteria:**
  * **AC1 (Đăng ký thành công):** Given khách truy cập cung cấp `brandName`, `email`, và `password` hợp lệ (tối thiểu 8 ký tự),  
    When gửi `POST /auth/register-brand`,  
    Then hệ thống tạo một bản ghi `brands` với trạng thái `ACTIVE`, một bản ghi `users` với vai trò `BRAND_ADMIN`, gắn `brand_id` vào thương hiệu vừa tạo, `status = 'ACTIVE'`, `email_verified = FALSE`; đồng thời sinh mã xác minh email và trả về HTTP 201 kèm token phiên đăng nhập.
  * **AC2 (Email đã tồn tại):** Given email đã được đăng ký trong hệ thống,  
    When gửi yêu cầu đăng ký mới với email đó,  
    Then hệ thống từ chối với HTTP 409 `EMAIL_EXISTS`.
  * **AC3 (Giới hạn tần suất đăng ký):** Given cùng một IP hoặc client gửi vượt quá giới hạn đăng ký trong khoảng thời gian quy định,  
    When gửi tiếp yêu cầu,  
    Then hệ thống từ chối với HTTP 429 `TOO_MANY_REQUESTS`.
* **Test:** `test_FR_USR_06_brand_self_registration`

---

## FR-USR-07 — Bắt buộc xác minh email trước khi tạo phiên thanh toán
* **Statement:** Hệ thống phải yêu cầu xác minh email của tài khoản tự đăng ký trước khi cho phép tạo phiên thanh toán thuê slot (ADR-0013).
* **Traces:** BR-003, BR-011 · **Priority:** M · ADR-0013 mục 1
* **API:** `POST /auth/verify-email`, `POST /auth/resend-verification`
* **Acceptance criteria:**
  * **AC1 (Gửi mã xác minh):** Given tài khoản tự đăng ký mới được tạo,  
    When hoàn tất đăng ký (hoặc khi gọi gửi lại mã xác minh),  
    Then hệ thống tạo mã OTP ngẫu nhiên lưu trong bảng `email_verifications` kèm thời hạn `EMAIL_VERIFICATION_TTL_MIN` và gửi email đến người dùng.
  * **AC2 (Xác minh hợp lệ):** Given Brand Admin nhận được mã OTP và gửi `POST /auth/verify-email` kèm mã đúng trước khi hết hạn,  
    Then hệ thống cập nhật `users.email_verified = TRUE`, ghi nhận `verified_at` trong `email_verifications`.
  * **AC3 (Chặn thuê slot khi chưa xác minh):** Given tài khoản Brand Admin có `email_verified = FALSE`,  
    When gửi yêu cầu tạo phiên thanh toán thuê slot (`POST /rental-checkouts`),  
    Then hệ thống từ chối với HTTP 403 `EMAIL_NOT_VERIFIED`.
  * **AC4 (Mã sai hoặc hết hạn):** Given gửi mã OTP sai hoặc đã quá hạn `EMAIL_VERIFICATION_TTL_MIN`,  
    When gọi xác minh,  
    Then hệ thống từ chối với HTTP 400 `INVALID_VERIFICATION_CODE` và giữ nguyên trạng thái `email_verified = FALSE`.
* **Test:** `test_FR_USR_07_require_email_verification_before_checkout`
