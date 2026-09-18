# FR-AUTH — Xác thực và phân quyền

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` mục A1 · 12 FR
> Trạng thái AC: **hoàn thành**
> Phụ trách: TV1
> Mức chi tiết: AC cho FR có điều kiện; CRUD để dạng phát biểu

Đọc kèm: `spec/glossary.md`, `spec/errors.md`, `spec/constraints.md`,
`spec/contracts/openapi.yaml` (nhóm tag AUTH), `spec/contracts/schema.sql` §3

---

## Ba điều phải nắm trước khi hiện thực module này

**1. Phạm vi của người dùng thuộc thương hiệu đi qua hợp đồng, không qua máy.** `machines` không có
`brand_id`. Mọi truy vấn dữ liệu thương hiệu phải nối qua `orders`/`slot_rentals`. Đây là quy tắc
ở `spec/PROJECT.md` Mục 3 và là thứ Review Agent bắt buộc kiểm mọi PR.

**2. Lọc theo `revenue_owner`, không chỉ theo `brand_id`.** Đơn phát sinh sau khi hợp đồng bị thanh
lý vẫn giữ `orders.brand_id` của thương hiệu cũ, nhưng `revenue_owner = PLATFORM` và thương hiệu
**không** được thấy (FR-REV-06, FR-EXP-20). Lọc chỉ bằng `brand_id` là rò rỉ dữ liệu.

**3. Phạm vi bị giới hạn theo thời gian, không chỉ theo tập slot.** FR-AUTH-07 cho phép thấy slot
"đang **hoặc đã từng**" có hợp đồng — nhưng chỉ trong đúng kỳ hạn hợp đồng tương ứng
(`spec/glossary.md` §"Quy tắc cô lập dữ liệu"). Thương hiệu không được thấy giao dịch phát sinh
trên slot đó trước khi mình thuê hay sau khi hợp đồng kết thúc.

---

## FR-AUTH-01 — Đăng nhập bằng email và mật khẩu
* **Statement:** Hệ thống phải cho phép người dùng đăng nhập bằng email và mật khẩu.
* **Traces:** BR-003 · **Priority:** M
* **API:** `POST /auth/login` (không cần xác thực)
* **Acceptance criteria:**
  * **AC1:** Given tài khoản `U` tồn tại với `status = ACTIVE` và mật khẩu đúng,  
    When gửi yêu cầu đăng nhập,  
    Then hệ thống trả cặp token kèm hồ sơ người dùng, cập nhật `users.last_login_at`, và ghi AuditLog sự kiện đăng nhập thành công (FR-AUD-01).
  * **AC2:** Given email không tồn tại **hoặc** mật khẩu sai,  
    When gửi yêu cầu đăng nhập,  
    Then hệ thống trả HTTP 401 `INVALID_CREDENTIALS` với **cùng một thông báo** cho cả hai trường hợp — không tiết lộ email nào có tồn tại trong hệ thống.
  * **AC3:** Given tài khoản `U` có `status` là `DISABLED` hoặc `INVITED`,  
    When đăng nhập với mật khẩu đúng,  
    Then hệ thống từ chối và **không** cấp token.
  * **AC4 (Lưu trữ mật khẩu):** Given bất kỳ tài khoản nào trong CSDL,  
    When đọc cột `users.password_hash`,  
    Then giá trị là băm bcrypt hoặc argon2, không phải mật khẩu gốc và không phải băm không salt (NFR-SEC-03).
  * **AC5 (Ghi nhật ký thất bại):** Given một lần đăng nhập sai,  
    When hệ thống từ chối,  
    Then hệ thống vẫn ghi AuditLog sự kiện đăng nhập thất bại kèm email đã thử và `source_ip` (FR-AUD-01).
* **Test:** `test_FR_AUTH_01_login_with_email_password`

---

## FR-AUTH-02 — Cấp access token và refresh token
* **Statement:** Hệ thống phải cấp access token có thời hạn tối đa 60 phút và refresh token có thời hạn tối đa 7 ngày sau khi đăng nhập thành công.
* **Traces:** BR-003 · **Priority:** M
* **API:** `POST /auth/login`, `POST /auth/refresh`
* **Acceptance criteria:**
  * **AC1:** Given đăng nhập thành công,  
    When hệ thống cấp token,  
    Then access token hết hạn sau đúng `ACCESS_TOKEN_TTL_MIN` và refresh token sau `REFRESH_TOKEN_TTL_DAYS` — cả hai đọc từ cấu hình, **không hardcode** (`spec/constraints.md`).
  * **AC2:** Given access token đã quá hạn,  
    When gọi một endpoint cần xác thực,  
    Then hệ thống trả HTTP 401 `TOKEN_EXPIRED`.
  * **AC3 (Refresh hợp lệ):** Given refresh token còn hiệu lực và chưa bị thu hồi,  
    When gọi `POST /auth/refresh`,  
    Then hệ thống cấp cặp token mới và cập nhật `refresh_sessions.last_used_at`.
  * **AC4 (Refresh đã thu hồi):** Given refresh token có `revoked_at` khác NULL,  
    When gọi refresh,  
    Then hệ thống từ chối với HTTP 401 và không cấp token mới.
  * **AC5 (Lưu trữ):** Given một phiên đăng nhập bất kỳ,  
    When đọc `refresh_sessions.token_hash`,  
    Then chỉ có **băm** của refresh token được lưu, không lưu token gốc (NFR-SEC-05).
* **Test:** `test_FR_AUTH_02_issue_token_pair`

---

## FR-AUTH-03 — Khóa tài khoản sau nhiều lần đăng nhập sai
* **Statement:** Hệ thống phải khóa tài khoản trong 15 phút sau 5 lần đăng nhập sai liên tiếp.
* **Traces:** BR-003 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given tài khoản `U` vừa có `LOGIN_LOCKOUT_ATTEMPTS` lần đăng nhập sai **liên tiếp**,  
    When thử đăng nhập lần tiếp theo — **kể cả với mật khẩu đúng**,  
    Then hệ thống trả HTTP 423 `ACCOUNT_LOCKED` và không cấp token.
  * **AC2 (Hết thời gian khóa):** Given tài khoản `U` bị khóa và đã qua `LOGIN_LOCKOUT_MIN`,  
    When đăng nhập với mật khẩu đúng,  
    Then hệ thống cho đăng nhập bình thường.
  * **AC3 (Đếm lại sau lần đúng):** Given tài khoản `U` đã sai 3 lần rồi đăng nhập đúng một lần,  
    When sau đó lại sai,  
    Then bộ đếm bắt đầu lại từ 1 — điều kiện là **liên tiếp**, không phải tổng tích lũy.
  * **AC4 (Ca biên - Khóa theo tài khoản, không theo IP):** Given hai lần thử sai đến từ hai địa chỉ IP khác nhau trên cùng tài khoản,  
    When đếm số lần sai,  
    Then cả hai đều tính vào cùng bộ đếm của tài khoản đó.
* **Test:** `test_FR_AUTH_03_lock_account_after_failed_attempts`

---

## FR-AUTH-04 — Đăng xuất và vô hiệu hóa refresh token
* **Statement:** Hệ thống phải cho phép người dùng đăng xuất và vô hiệu hóa refresh token của phiên đó.
* **Traces:** BR-003 · **Priority:** M
* **API:** `POST /auth/logout`
* **Acceptance criteria:**
  * **AC1:** Given người dùng `U` đang có phiên hợp lệ,  
    When gọi đăng xuất,  
    Then hệ thống đặt `refresh_sessions.revoked_at = now()` cho **đúng phiên đó** và ghi AuditLog (FR-AUD-01).
  * **AC2 (Chỉ phiên hiện tại):** Given `U` đang đăng nhập trên hai thiết bị (hai phiên),  
    When đăng xuất trên thiết bị thứ nhất,  
    Then phiên thứ hai vẫn hoạt động bình thường.
  * **AC3:** Given refresh token vừa bị thu hồi do đăng xuất,  
    When dùng chính token đó để gọi `POST /auth/refresh`,  
    Then hệ thống từ chối với HTTP 401.
* **Test:** `test_FR_AUTH_04_logout_revokes_refresh_token`

---

## FR-AUTH-05 — Liên kết tài khoản với thương hiệu
* **Statement:** Hệ thống phải liên kết tài khoản Brand Admin với đúng một thương hiệu; tài khoản Platform Super Admin, Operations Staff và Inventory Staff không liên kết với thương hiệu nào.
* **Traces:** BR-003, BR-004 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given tài khoản được tạo với vai trò `BRAND_ADMIN`,  
    When lưu bản ghi,  
    Then `users.brand_id` khác NULL và trỏ tới đúng một thương hiệu.
  * **AC2:** Given tài khoản được tạo với vai trò `PLATFORM_SUPER_ADMIN`, `OPERATIONS_STAFF` hoặc `INVENTORY_STAFF`,  
    When lưu bản ghi,  
    Then `users.brand_id` là NULL.
  * **AC3 (Ca biên - Brand Admin thiếu thương hiệu):** Given yêu cầu tạo Brand Admin không kèm `brandId`,  
    When gửi yêu cầu,  
    Then hệ thống từ chối với HTTP 400.
  * **AC4 (Ca biên - Vai trò nền tảng kèm thương hiệu):** Given yêu cầu tạo Operations Staff có kèm `brandId`,  
    When gửi yêu cầu,  
    Then hệ thống từ chối với HTTP 400 — vai trò nền tảng không được gắn thương hiệu.
  * **AC5 (Đúng một, không nhiều):** Given tài khoản Brand Admin đang gắn thương hiệu `B1`,  
    When cố gắn thêm thương hiệu `B2` cho cùng tài khoản,  
    Then hệ thống từ chối — một tài khoản Brand Admin phục vụ đúng một thương hiệu.
* **Test:** `test_FR_AUTH_05_brand_admin_bound_to_single_brand`

---

## FR-AUTH-06 — Gán vai trò cho tài khoản
* **Statement:** Hệ thống phải gán cho mỗi tài khoản một hoặc nhiều vai trò trong tập: Platform Super Admin, Operations Staff, Inventory Staff, Brand Admin.
* **Traces:** BR-003 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given tài khoản `U`,  
    When gán vai trò,  
    Then hệ thống tạo bản ghi `user_roles` nối `U` với một hàng trong bảng `roles`, và quyền hiệu lực của `U` là **hợp** của mọi `permissions` thuộc các vai trò đó.
  * **AC2 (Bốn vai trò, không phải năm):** Given tập vai trò hệ thống,  
    When liệt kê,  
    Then chỉ có đúng bốn: `PLATFORM_SUPER_ADMIN`, `OPERATIONS_STAFF`, `INVENTORY_STAFF`, `BRAND_ADMIN` — Report Viewer đã gộp vào Brand Admin, Operations Manager và Technician đã gộp thành Operations Staff (`docs/FR_NFR_SCENTSTATION.md` Phần D).
  * **AC3 (Không gán trùng):** Given `U` đã có vai trò `R` trong cùng một phạm vi,  
    When gán lại `R` cho `U` trong đúng phạm vi đó,  
    Then partial unique index `uq_user_role_scope` chặn bản ghi trùng ở tầng CSDL.
  * **AC4 (Ghi nhật ký):** Given một thay đổi vai trò bất kỳ,  
    When lưu thay đổi,  
    Then hệ thống ghi AuditLog kèm dữ liệu trước và sau (FR-AUD-02, FR-AUD-08).
* **Test:** `test_FR_AUTH_06_assign_roles_to_user`

> **Vai trò là dữ liệu, không phải enum.** `roles` và `permissions` là bảng, nên thêm/bớt vai trò
> chỉ cần sửa dữ liệu seed, không cần migration (`spec/contracts/schema.sql`, DB_DIAGRAM note #15).
> Đừng hardcode danh sách vai trò trong code.

---

## FR-AUTH-07 — Giới hạn phạm vi dữ liệu theo tập slot đã thuê
* **Statement:** Hệ thống phải giới hạn phạm vi dữ liệu của người dùng thuộc thương hiệu theo tập slot mà thương hiệu đó đang hoặc đã từng có hợp đồng thuê.
* **Traces:** BR-003, BR-012 · **Priority:** M
* **Acceptance criteria:**
  * **AC1 (Slot đang thuê):** Given thương hiệu `B1` có hợp đồng `ACTIVE` trên slot `S1`,  
    When Brand Admin của `B1` truy vấn đơn hàng,  
    Then kết quả chứa đơn của slot `S1` phát sinh trong kỳ hạn hợp đồng đó.
  * **AC2 (Slot đã từng thuê):** Given `B1` từng thuê slot `S1` trong kỳ `[T1, T2]` và hợp đồng nay đã `CLOSED`,  
    When Brand Admin của `B1` truy vấn đơn hàng,  
    Then kết quả vẫn chứa đơn phát sinh **trong** `[T1, T2]` — quyền xem lịch sử không mất khi hợp đồng kết thúc.
  * **AC3 (Giới hạn theo thời gian):** Given slot `S1` có đơn phát sinh **trước** `T1` (thuộc thương hiệu khác) hoặc **sau** `T2`,  
    When Brand Admin của `B1` truy vấn,  
    Then các đơn đó **không** xuất hiện — phạm vi bị chặn cả theo slot lẫn theo kỳ hạn.
  * **AC4 (Máy dùng chung):** Given máy `M` có slot `S1` của `B1` và slot `S2` của `B2`,  
    When Brand Admin của `B1` truy vấn bất kỳ dữ liệu nào,  
    Then không kết quả nào chứa dữ liệu của `S2`, và không có trường nào tiết lộ sự tồn tại của `B2` trên máy `M` (BR-012, FR-BND-08).
  * **AC5 (Sau thanh lý):** Given hợp đồng của `B1` trên slot `S1` đã `LIQUIDATED` và slot tiếp tục bán hàng thanh lý,  
    When Brand Admin của `B1` truy vấn đơn hàng,  
    Then các đơn có `revenue_owner = PLATFORM` phát sinh sau thời điểm thanh lý **không** xuất hiện (FR-EXP-20, FR-REV-06) — lọc phải theo `revenue_owner`, không chỉ theo `brand_id`.
  * **AC6 (Đường truy vấn):** Given bất kỳ truy vấn nào trả dữ liệu thuộc thương hiệu,  
    When rà soát câu lệnh,  
    Then điều kiện lọc đi qua `orders.brand_id` hoặc `slot_rentals.brand_id`, **không bao giờ** qua `machines` — cột `machines.brand_id` không tồn tại.
* **Test:** `tests/integration/test_slot_isolation.ts`

> **Test người tự viết — agent KHÔNG sinh test cho FR này** (`spec/testing.md`, `spec/PROJECT.md`
> Mục 4). NFR-SEC-04 yêu cầu 100% endpoint có dữ liệu thương hiệu vượt được bộ test truy cập chéo,
> bao gồm trường hợp hai thương hiệu trên cùng một máy. Dữ liệu `make seed` đã dựng sẵn đúng kịch
> bản đó: 1 máy, 4 slot, 2 thương hiệu mỗi bên 2 slot.

> **Nợ kỹ thuật cần biết khi hiện thực.** Row-Level Security chưa bật ở tầng CSDL
> (`spec/contracts/schema.sql` §12, ADR-0002). Toàn bộ FR này hiện phụ thuộc vào tầng ứng dụng —
> một truy vấn quên điều kiện lọc là rò rỉ ngay, không có lưới an toàn phía dưới.

---

## FR-AUTH-08 — Từ chối truy cập ngoài phạm vi
* **Statement:** Hệ thống phải từ chối mọi yêu cầu truy cập tài nguyên ngoài phạm vi cho phép và trả về mã lỗi 403.
* **Traces:** BR-003 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given Brand Admin của `B1` và một tài nguyên thuộc `B2` (đơn hàng, hợp đồng, sản phẩm, chai, yêu cầu bổ sung…),  
    When truy cập tài nguyên đó bằng id trực tiếp,  
    Then hệ thống trả HTTP 403 `FORBIDDEN_SCOPE`.
  * **AC2 (Không tiết lộ tồn tại):** Given id của một tài nguyên thuộc `B2` và id của một tài nguyên **không tồn tại**,  
    When Brand Admin của `B1` truy cập cả hai,  
    Then phản hồi không cho phép phân biệt hai trường hợp — không dùng 404 cho cái này và 403 cho cái kia theo cách suy ra được sự tồn tại (BR-012).
  * **AC3 (Vai trò nền tảng):** Given người dùng có vai trò không đủ quyền cho thao tác (ví dụ Inventory Staff gọi endpoint duyệt hợp đồng),  
    When gửi yêu cầu,  
    Then hệ thống trả HTTP 403 `FORBIDDEN_SCOPE`.
  * **AC4 (Áp cho mọi động từ):** Given một tài nguyên ngoài phạm vi,  
    When truy cập bằng GET, PATCH, PUT, POST hoặc DELETE,  
    Then mọi động từ đều bị từ chối như nhau — không chỉ chặn ở luồng đọc.
* **Test:** `tests/integration/test_slot_isolation.ts`

> Cùng thuộc nhóm test người tự viết với FR-AUTH-07.

---

## FR-AUTH-09 — Xác thực lại trước thao tác nhạy cảm
* **Statement:** Hệ thống phải yêu cầu xác thực lại mật khẩu trước khi thực hiện hoàn tiền, điều chỉnh tồn kho, xịt chẩn đoán, thanh lý hàng tồn hoặc thay đổi cấu hình máy.
* **Traces:** BR-002, BR-005, BR-013 · **Priority:** M
* **API:** `POST /auth/reauth` cấp token ngắn hạn, truyền qua header `X-Reauth-Token`
* **Acceptance criteria:**
  * **AC1:** Given người dùng đã đăng nhập nhưng **chưa** xác thực lại,  
    When gọi một trong các endpoint nhạy cảm,  
    Then hệ thống từ chối với HTTP 403 `REAUTH_REQUIRED`.
  * **AC2:** Given người dùng vừa xác thực lại thành công và gửi kèm `X-Reauth-Token` còn hiệu lực,  
    When gọi endpoint nhạy cảm,  
    Then hệ thống cho thực hiện và ghi AuditLog kèm dấu hiệu đã xác thực lại.
  * **AC3 (Mật khẩu sai):** Given mật khẩu nhập lại không đúng,  
    When gọi `POST /auth/reauth`,  
    Then hệ thống trả HTTP 401 và không cấp reauth token.
  * **AC4 (Danh sách endpoint):** Given tập endpoint nhạy cảm,  
    When rà soát `spec/contracts/openapi.yaml`,  
    Then **đúng 9 endpoint** khai báo `X-Reauth-Token`, phủ đủ 5 nhóm thao tác trong tuyên bố:
    * hoàn tiền — `POST /orders/{id}/refund`
    * điều chỉnh tồn kho — `POST /inventory-adjustments`
    * xịt chẩn đoán — `POST /machines/{id}/diagnostic-dispense`
    * thanh lý hàng tồn — `POST /slot-rentals/{id}/liquidate`
    * đổi cấu hình máy — `PUT /machines/{id}/mode`, `PUT /slots/{id}/config`, `POST /machines/{id}/config/push`, `POST /machines/{id}/credentials`, `POST /machines/{id}/credentials/revoke`
  * **AC5 (Ca biên - Reauth token hết hạn):** Given reauth token đã quá thời hạn ngắn của nó,  
    When gọi endpoint nhạy cảm,  
    Then hệ thống trả `REAUTH_REQUIRED` — không chấp nhận token cũ.
* **Test:** `test_FR_AUTH_09_reauth_required_for_sensitive_ops`

---

## FR-AUTH-10 — Thu hồi phiên khi tài khoản bị vô hiệu hóa
* **Statement:** Hệ thống phải thu hồi toàn bộ phiên đăng nhập đang hoạt động trong vòng 60 giây khi tài khoản bị vô hiệu hóa.
* **Traces:** BR-003 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given tài khoản `U` đang có 2 phiên hoạt động,  
    When Platform Super Admin vô hiệu hóa `U`,  
    Then **mọi** hàng `refresh_sessions` của `U` được đặt `revoked_at`, và access token đang lưu hành mất hiệu lực trong tối đa `SESSION_REVOKE_MAX_SEC`.
  * **AC2 (Cơ chế):** Given access token là JWT tự chứa nên không thu hồi trực tiếp được,  
    When hệ thống vô hiệu hóa tài khoản,  
    Then hệ thống tăng `users.permission_version` và mọi yêu cầu có token mang `permission_version` cũ bị từ chối — đây là đường thực thi của ngưỡng `SESSION_REVOKE_MAX_SEC`.
  * **AC3 (Ca biên - Đang thao tác dở):** Given `U` đang gọi một endpoint tại thời điểm bị vô hiệu hóa,  
    When yêu cầu tiếp theo được gửi,  
    Then yêu cầu đó bị từ chối, không có đường "dùng nốt phiên".
* **Test:** `test_FR_AUTH_10_revoke_sessions_on_disable`

---

## FR-AUTH-11 — Platform Super Admin thu hồi quyền truy cập
* **Statement:** Hệ thống phải cho phép Platform Super Admin thu hồi quyền truy cập của bất kỳ người dùng hoặc thiết bị nào.
* **Traces:** BR-003 · **Priority:** M
* **API:** `POST /users/{id}/disable`, `POST /machines/{id}/credentials/revoke`
* **Acceptance criteria:**
  * **AC1 (Người dùng):** Given tài khoản `U` bất kỳ, kể cả Brand Admin của thương hiệu khác,  
    When Platform Super Admin thu hồi quyền,  
    Then `U` chuyển `status = DISABLED` và phiên bị thu hồi theo FR-AUTH-10.
  * **AC2 (Thiết bị):** Given máy `M` có credential `ACTIVE`,  
    When Platform Super Admin thu hồi,  
    Then `device_credentials.status = REVOKED`, ghi `revoked_at`, và broker từ chối kết nối MQTT từ `M` sau đó (FR-IOT-08).
  * **AC3 (Chỉ Platform Super Admin):** Given người dùng có vai trò khác,  
    When gọi endpoint thu hồi,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE` (FR-USR-05).
  * **AC4 (Ghi nhật ký):** Given một thao tác thu hồi bất kỳ,  
    When hoàn tất,  
    Then hệ thống ghi AuditLog kèm chủ thể thực hiện và đối tượng bị thu hồi (FR-AUD-02).
* **Test:** `test_FR_AUTH_11_revoke_user_or_device_access`

---

## FR-AUTH-12 — Giới hạn phạm vi Operations Staff theo địa điểm hoặc máy
* **Statement:** Hệ thống phải cho phép giới hạn phạm vi của Operations Staff theo danh sách địa điểm hoặc máy của nền tảng được phân công.
* **Traces:** BR-004 · **Priority:** S
* **Acceptance criteria:**
  * **AC1:** Given Operations Staff `U` được gán vai trò với `scope_type = LOCATION` và `scope_id` là địa điểm `L`,  
    When `U` truy vấn danh sách máy,  
    Then kết quả chỉ chứa máy thuộc `L`.
  * **AC2:** Given `U` có `scope_type = MACHINE` và `scope_id = M`,  
    When `U` truy cập dữ liệu chẩn đoán của một máy khác,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
  * **AC3 (Không giới hạn):** Given `U` có `scope_type = PLATFORM`,  
    When truy vấn,  
    Then `U` thấy toàn bộ máy của nền tảng.
  * **AC4 (Ràng buộc dữ liệu):** Given `scope_type` là `LOCATION` hoặc `MACHINE`,  
    When lưu bản ghi `user_roles`,  
    Then `scope_id` bắt buộc khác NULL; với `PLATFORM` và `BRAND` thì `scope_id` là NULL.
* **Test:** `test_FR_AUTH_12_scope_operations_staff_by_location`

> **Ưu tiên S** — hiện thực sau tuần 9 nếu còn thời gian (`docs/FR_NFR_SCENTSTATION.md` Phần D).
> Cột `user_roles.scope_type` và `scope_id` đã có sẵn trong lược đồ nên không cần migration khi làm.
