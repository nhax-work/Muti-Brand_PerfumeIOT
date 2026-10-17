# FR-USR — Người dùng và vai trò

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` mục A3 · 7 FR
> Trạng thái AC: **hoàn thành** — đã hiện thực ở `apps/api/src/modules/usr` và `apps/api/src/modules/auth`
> Phụ trách: TV1, TV3 (bổ sung FR-USR-06, 07 theo ADR-0013)
> Cập nhật: 2026-10-17
> Mức chi tiết: AC cho FR có điều kiện; CRUD để dạng phát biểu

Đọc kèm: `spec/modules/AUTH.md`, `spec/errors.md`,
`spec/decisions/0004-cap-mat-khau-tam-va-bat-doi.md`, `spec/decisions/0013-brand-tu-dang-ky-hop-dong-hai-lop-va-chi-tra-doanh-thu.md`, `spec/contracts/openapi.yaml` (tag USR, AUTH)

---

## Hai luật chung cho cả module

**Chỉ Platform Super Admin.** Mọi endpoint `/users` đòi quyền `user.manage`, và seed chỉ cấp quyền
đó cho vai trò Platform Super Admin. Cưỡng chế một lần ở cấp controller, không lặp lại trong từng
thao tác (FR-USR-05).

**Mật khẩu tạm, trả về đúng một lần (ADR-0004).** Tạo tài khoản và đặt lại mật khẩu đều sinh mật khẩu
tạm ngẫu nhiên, trả trong phản hồi của chính lệnh đó rồi không bao giờ trả lại, không lưu dạng gốc,
không ghi vào nhật ký kiểm toán. Tài khoản ở `INVITED` cho tới khi người dùng tự đổi qua
`POST /auth/change-password`.

---

## FR-USR-01 — Tạo tài khoản Brand Admin
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
  * **AC5 (Không cần xác minh email):** Given tài khoản do Super Admin tạo,  
    When tạo xong,  
    Then tài khoản không có dòng trong `email_verifications` và không bị chặn bởi kiểm tra xác minh email khi thuê slot (ADR-0013).
* **Test:** `tests/unit/usr.test.ts` — các test `test_FR_USR_01_*`

> Luật liên kết thương hiệu — Brand Admin bắt buộc có `brandId`, vai trò nền tảng bắt buộc không
> có — là FR-AUTH-05, xem AC3 và AC4 ở `spec/modules/AUTH.md`.

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
* **Test:** `tests/unit/usr.test.ts` — các test `test_FR_USR_02_*`

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
* **Test:** `tests/unit/usr.test.ts` — các test `test_FR_USR_03_*`

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
* **Test:** `tests/unit/usr.test.ts`, `tests/unit/auth.test.ts` — các test `test_FR_USR_04_*`

---

## FR-USR-05 — Chỉ Platform Super Admin quản trị tài khoản
* **Statement:** Hệ thống phải ngăn tài khoản không có vai trò Platform Super Admin tạo, sửa hoặc vô hiệu hóa tài khoản của người khác; tự đăng ký thương hiệu (FR-USR-06) là cách duy nhất tạo tài khoản mà không cần Super Admin.
* **Traces:** BR-003, BR-012, ADR-0013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given Brand Admin, Operations Staff hoặc Inventory Staff,  
    When gọi bất kỳ endpoint nào dưới `/users`,  
    Then hệ thống trả HTTP 403 `FORBIDDEN_SCOPE`.
  * **AC2 (Cưỡng chế ở một chỗ):** Given controller `UsrController`,  
    When đọc metadata phân quyền,  
    Then quyền `user.manage` được gắn ở cấp lớp, áp cho mọi endpoint — thêm endpoint mới vào controller không thể quên kiểm quyền.
  * **AC3 (Ngoại lệ tự đăng ký):** Given người dùng chưa có tài khoản,  
    When gọi `POST /auth/register-brand` (FR-USR-06),  
    Then hệ thống cho phép tạo tài khoản Brand Admin mà không đòi hỏi quyền `user.manage` hay sự can thiệp của Super Admin.
* **Test:** `tests/unit/usr.test.ts` — `test_FR_USR_05_user_endpoints_require_user_manage_permission`

---

## FR-USR-06 — Thương hiệu tự đăng ký
* **Statement:** Hệ thống phải cho phép thương hiệu tự đăng ký bằng tên thương hiệu, email và mật khẩu, tạo cùng lúc một thương hiệu và một tài khoản Brand Admin gắn với thương hiệu đó (ADR-0013).
* **Traces:** BR-011, ADR-0013 · **Priority:** M
* **API:** `POST /auth/register-brand`
* **Acceptance criteria:**
  * **AC1:** Given tên thương hiệu, email hợp lệ và mật khẩu hợp lệ (tối thiểu 8 ký tự),  
    When gọi `POST /auth/register-brand`,  
    Then trong cùng một transaction: tạo `Brand` ở trạng thái `ACTIVE` (với `code` tự sinh từ tên thương hiệu), tạo `User` ở trạng thái `ACTIVE` (không qua `INVITED`) với vai trò `BRAND_ADMIN`, tạo bản ghi `email_verifications` với `expires_at = now() + 24 giờ`, và trả về `201 Created` kèm thông tin thương hiệu và người dùng.
  * **AC2 (Ca biên - Email trùng):** Given email đã tồn tại trong hệ thống (không phân biệt hoa thường),  
    When gọi đăng ký,  
    Then hệ thống từ chối với HTTP 400 `VALIDATION_ERROR`, chỉ ra lỗi ở trường `email`.
  * **AC3 (Ca biên - Giới hạn tần suất đăng ký):** Given một địa chỉ IP đã gửi quá `BRAND_REGISTER_RATE_LIMIT_PER_MIN` (5 lần/phút) yêu cầu đăng ký trong vòng 1 phút,  
    When gửi tiếp yêu cầu đăng ký,  
    Then hệ thống từ chối với HTTP 429 `RATE_LIMITED`.
  * **AC4 (Bảo mật nhật ký):** Given yêu cầu đăng ký thành công,  
    When kiểm tra AuditLog `auth.brand.registered`,  
    Then nhật ký ghi nhận nguồn IP và user-agent nhưng **tuyệt đối không** chứa mật khẩu hay mã xác minh email gốc.
* **Test:** `tests/unit/auth.test.ts` — các test `test_FR_USR_06_*`

---

## FR-USR-07 — Xác minh email của tài khoản tự đăng ký
* **Statement:** Hệ thống phải yêu cầu xác minh email của tài khoản tự đăng ký trước khi cho phép tạo phiên thanh toán thuê slot (ADR-0013).
* **Traces:** BR-003, BR-011, ADR-0013 · **Priority:** M
* **API:** `POST /auth/verify-email`, `POST /auth/resend-verification`
* **Acceptance criteria:**
  * **AC1:** Given tài khoản tự đăng ký có mã xác minh chưa hết hạn,  
    When gọi `POST /auth/verify-email` với mã xác minh hợp lệ,  
    Then hệ thống cập nhật `verified_at = now()` và trả về `200` với `{ verified: true }`.
  * **AC2 (Idempotency):** Given email đã được xác minh thành công trước đó,  
    When gọi lại `POST /auth/verify-email` với cùng mã xác minh,  
    Then hệ thống vẫn trả về `200` với `{ verified: true }`, không báo lỗi.
  * **AC3 (Ca biên - Mã sai hoặc quá hạn):** Given mã xác minh không tồn tại hoặc đã quá thời hạn `EMAIL_VERIFICATION_TOKEN_TTL_HOURS` (24 giờ),  
    When gọi xác minh,  
    Then hệ thống từ chối với HTTP 400 `VALIDATION_ERROR`.
  * **AC4 (Gửi lại mã xác minh):** Given tài khoản chưa xác minh email,  
    When gọi `POST /auth/resend-verification`,  
    Then hệ thống sinh mã ngẫu nhiên mới thay thế mã cũ trên bản ghi, cập nhật lại hạn dùng `expires_at = now() + 24 giờ`, và mã cũ lập tức mất hiệu lực.
  * **AC5 (Chặn tạo phiên thuê slot khi chưa xác minh):** Given tài khoản tự đăng ký có bản ghi `email_verifications` mà `verified_at` đang NULL,  
    When gọi `POST /rental-checkouts`,  
    Then hệ thống từ chối với HTTP 403 `EMAIL_NOT_VERIFIED`.
  * **AC6 (Tài khoản Super Admin tạo không bị chặn):** Given tài khoản Brand Admin do Platform Super Admin tạo (không có dòng `email_verifications`),  
    When gọi `POST /rental-checkouts`,  
    Then hệ thống **không** từ chối lỗi `EMAIL_NOT_VERIFIED`.
* **Test:** `tests/unit/auth.test.ts` — các test `test_FR_USR_07_*`, `tests/unit/slt.test.ts`

