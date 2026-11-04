# ADR-0021 — Báo trạng thái xác minh email trong `CurrentUser`

**Ngày:** 2026-11-03 · **Trạng thái:** đã duyệt (2026-11-03) · **Người quyết:** TV1

## Bối cảnh

Thương hiệu tự đăng ký đăng nhập được ngay (FR-USR-06 AC1) nhưng chỉ tạo được phiên thanh toán thuê
slot sau khi xác minh email (FR-USR-07, ADR-0013). Hiện giao diện không biết tài khoản đã xác minh hay
chưa: `CurrentUser` (trả về từ `GET /auth/me`, và nằm trong `TokenPair.user` của đăng nhập/làm mới
phiên) chỉ có `id, email, fullName, brandId, roles, permissions, mustChangePassword`.

Hệ quả: Brand Admin chỉ biết phải xác minh email khi đã chọn slot, chọn gói và bấm "Giữ chỗ và thanh
toán" — lúc đó máy chủ mới trả `EMAIL_NOT_VERIFIED`. Nếu email xác minh đã trôi vào thư rác, thương hiệu
không có dấu hiệu nào nhắc tới nó trước bước này.

Yêu cầu từ nhóm (2026-11-03): hiện một thanh thông báo trên **mọi trang** của web quản trị khi tài khoản
chưa xác minh email, kèm nút gửi lại email xác minh.

## Phương án đã cân nhắc

1. **Bắt xác minh ngay khi đăng ký** (chưa xác minh thì không đăng nhập được). Trái FR-USR-06 AC1 và
   luồng đã chốt ở ADR-0013; email gửi chậm hoặc vào thư rác thì thương hiệu bị kẹt ngoài hệ thống.
   Không chọn.
2. **Không đổi contract, giao diện tự đoán:** gọi `POST /auth/verify-email/resend` để dò, hoặc thử tạo
   phiên thanh toán rỗng. Cái trước gửi email thật mỗi lần tải trang; cái sau dùng sai mục đích một
   endpoint nghiệp vụ. Không chọn.
3. **Thêm một trường boolean vào `CurrentUser`.** Thay đổi chỉ thêm, không phá client cũ; máy chủ đã có
   sẵn dữ liệu (`email_verifications`). **Chọn.**

## Quyết định

### 1. Contract HTTP (`openapi.yaml`, schema `CurrentUser`)

Thêm trường bắt buộc:

```yaml
emailVerificationPending:
  type: boolean
  description: >-
    true khi tài khoản có bản ghi email_verifications mà verified_at còn NULL — đúng điều kiện
    POST /rental-checkouts trả EMAIL_NOT_VERIFIED (FR-USR-07, ADR-0013). Tài khoản do Super Admin
    tạo, tài khoản mức nền tảng và tài khoản đã xác minh đều là false. Giao diện dùng trường này để
    nhắc xác minh trên mọi trang (ADR-0021).
```

Đặt tên `emailVerificationPending` thay vì `emailVerified` vì tài khoản không có bản ghi xác minh (do
Super Admin tạo) không "đã xác minh" mà là "không cần xác minh" — một cờ "đang chờ" diễn đạt đúng cả
hai trường hợp. Vì `TokenPair.user` dùng chung `$ref: CurrentUser`, đăng nhập và làm mới phiên cũng trả
trường này.

### 2. Máy chủ

- Câu truy vấn nạp người dùng (`PrincipalLoader`) lấy thêm `EXISTS (… email_verifications … verified_at
  IS NULL)`; `AuthService.toCurrentUser` gán vào `emailVerificationPending`.
- `PrincipalLoader` nhớ đệm người dùng tới `SESSION_REVOKE_MAX_SEC`, nên `AuthService.verifyEmail` xóa
  nhớ đệm của tài khoản ngay sau khi xác minh — nếu không, `GET /auth/me` vẫn báo chưa xác minh.
- Không đổi lược đồ CSDL, không đổi mã lỗi, không thêm ngưỡng.

### 3. Web quản trị

- `AdminLayout` hiện thanh cảnh báo (antd `Alert`, kiểu `warning`, có nút "Gửi lại email xác minh" gọi
  `POST /auth/verify-email/resend`) ngay dưới header khi `user.emailVerificationPending` là true.
- Màn `/verify-email` xác minh thành công thì gọi lại `GET /auth/me` nếu tab đó đang đăng nhập.
- Refresh token nằm trong `sessionStorage` riêng từng tab, nên liên kết trong email thường mở ở một tab
  không có phiên. Vì vậy khi thanh cảnh báo đang hiện, tab quản trị gọi lại `GET /auth/me` mỗi lần
  người dùng quay lại tab (`focus`, `visibilitychange`) để thanh tự biến mất.
- Màn hướng dẫn lần đầu cho Brand Admin thêm một bước trỏ vào thanh cảnh báo khi nó đang hiện.

### 4. Không đổi

FR-USR-06, FR-USR-07 và kiểm tra `EMAIL_NOT_VERIFIED` ở `POST /rental-checkouts` giữ nguyên — máy chủ
vẫn là nơi chặn; trường mới chỉ phục vụ hiển thị (FE5).

## Hệ quả

- Thương hiệu thấy việc cần xác minh email ngay từ lần đăng nhập đầu, không phải đợi tới bước thanh toán.
- Sau khi duyệt: sửa `openapi.yaml`, `npm run contracts:generate`, sửa `PrincipalLoader` và
  `toCurrentUser`, chạy `make test-contract`; thêm test cho trường mới ở `tests/unit/auth.test.ts`
  (đặt tên theo FR-USR-07) và test giao diện cho thanh cảnh báo.
- Fixture và mock `CurrentUser` trong test giao diện phải thêm trường mới (trường bắt buộc), `tsc` chỉ ra
  từng chỗ.

## Nhật ký áp dụng

- 2026-11-03: đề xuất và được duyệt; áp dụng cùng ngày. Bổ sung khi hiện thực: xóa nhớ đệm
  `PrincipalLoader` sau khi xác minh, và hỏi lại `GET /auth/me` khi quay lại tab (mục 2, 3).
