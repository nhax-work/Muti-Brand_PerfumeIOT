# ADR-0004 — Cấp mật khẩu tạm một lần và bắt đổi mật khẩu

**Ngày:** 2026-09-18 · **Trạng thái:** đã duyệt · **Người quyết:** TV1

## Bối cảnh

Khi hiện thực module USR trong task Auth · RBAC · cô lập dữ liệu mức slot, phát hiện contract
`spec/contracts/openapi.yaml` (đóng băng ở ADR-0002) có một lỗ hổng khiến FR-USR-01, FR-USR-02 và
FR-USR-04 **không hiện thực đúng được**:

| Chỗ | Contract đang ghi | Hệ quả |
|---|---|---|
| `POST /users` | `UserCreate` chỉ có `email, fullName, role, brandId`; trả `User` | Tài khoản vừa tạo không có cách nào nhận mật khẩu |
| `POST /users/{id}/reset-password` | Không có body, trả `204` | Mật khẩu mới được đặt nhưng không đi tới đâu |
| Đổi mật khẩu | Không có endpoint nào | Người dùng không tự đổi được mật khẩu |
| `spec/modules/AUTH.md` FR-AUTH-01 AC3 | Tài khoản `INVITED` bị chặn đăng nhập | Tài khoản mới tạo ở `INVITED` là ngõ cụt vĩnh viễn |

Lỗ hổng có từ lúc viết contract, không phải do thay đổi yêu cầu. Không có hạ tầng gửi email: gửi
qua kênh ngoài là FR-ALR-15, ưu tiên W.

## Phương án đã cân nhắc

1. **Mật khẩu tạm trả về đúng một lần, bắt đổi ở lần đăng nhập đầu.** Hệ thống sinh mật khẩu ngẫu
   nhiên, trả trong phản hồi của lệnh tạo/đặt lại rồi không bao giờ trả lại nữa. Tài khoản ở
   `INVITED` cho tới khi người dùng tự đổi.
2. **Super Admin tự đặt mật khẩu ban đầu.** Thêm trường `password` vào `UserCreate` và body của
   reset-password. Người quản trị biết mật khẩu của người khác; và vẫn phải thêm endpoint đổi mật
   khẩu, nên lượng thay đổi contract gần như bằng phương án 1.
3. **Gửi liên kết mời qua email.** Chuẩn nhất, nhưng cần hạ tầng email — ngoài phạm vi MVP.

## Quyết định

Chọn **phương án 1**. Đây cũng là mẫu contract đã dùng sẵn cho thông tin xác thực thiết bị:
`DeviceCredentialIssued` trả bí mật gốc đúng một lần (FR-MCH-02). Dùng lại cùng mẫu cho mật khẩu
để hai chỗ nhất quán.

### Thay đổi contract

| Thay đổi | Chi tiết |
|---|---|
| Schema mới `TemporaryPassword` | `{ temporaryPassword: string }` — chỉ xuất hiện trong phản hồi tạo và đặt lại |
| Schema mới `UserCreated` | `User` + `temporaryPassword` (allOf, giống `DeviceCredentialIssued`) |
| `POST /users` | `201` trả `UserCreated` thay vì `User` |
| `POST /users/{id}/reset-password` | `200` trả `TemporaryPassword` thay vì `204` |
| Endpoint mới `POST /auth/change-password` | Body `{ currentPassword, newPassword }`, trả `204` |
| Schema `CurrentUser` | Thêm `mustChangePassword: boolean` |
| `spec/contracts/mqtt.md` §11 | Sửa `tests/e2e/test_command_ttl.py` thành `.ts` — tàn dư từ lúc chưa chốt ngôn ngữ, gom vào ADR này vì cũng chạm contract |

### Luật nghiệp vụ

**Trạng thái `INVITED` nghĩa là "phải đổi mật khẩu".** Tạo tài khoản mới và đặt lại mật khẩu đều
đưa tài khoản về `INVITED`.

**Tài khoản `INVITED` đăng nhập được nhưng bị giới hạn.** Chỉ gọi được `GET /auth/me`,
`POST /auth/logout` và `POST /auth/change-password`; mọi endpoint khác trả `403 FORBIDDEN_SCOPE`.
Trường `mustChangePassword` trong `CurrentUser` báo cho giao diện chuyển thẳng sang màn hình đổi mật
khẩu ngay sau đăng nhập, không phải đợi tới lần gọi API đầu tiên bị từ chối.

**Đổi mật khẩu thu hồi mọi phiên.** Sau khi đổi, tài khoản chuyển `ACTIVE`, mọi phiên (kể cả phiên
hiện tại) bị thu hồi và người dùng đăng nhập lại bằng mật khẩu mới. Đặt lại mật khẩu cũng thu hồi
mọi phiên (FR-AUTH-10).

**Mật khẩu tạm không bao giờ được lưu dạng gốc** — chỉ lưu băm argon2 như mọi mật khẩu khác
(NFR-SEC-03), và không ghi vào `audit_logs`.

### Không thêm mã lỗi mới

Tái dùng mã đã có trong `spec/errors.md`:

| Tình huống | Mã |
|---|---|
| `INVITED` gọi endpoint ngoài danh sách cho phép | `FORBIDDEN_SCOPE` |
| Đổi mật khẩu với mật khẩu hiện tại sai | `INVALID_CREDENTIALS` |
| Mật khẩu mới quá ngắn hoặc trùng mật khẩu hiện tại | `VALIDATION_ERROR` |
| Tạo tài khoản với email đã tồn tại | `VALIDATION_ERROR` kèm `details.fields` chỉ ra `email` |

Email trùng lẽ ra hợp với `409`, nhưng `spec/errors.md` không có mã xung đột chung và thêm mã mới là
việc cần duyệt riêng. `400 VALIDATION_ERROR` đã nằm trong danh sách phản hồi của `POST /users`.

## Hệ quả

**Contract:** `openapi.yaml` (4 schema, 3 endpoint), `mqtt.md` (một đường dẫn file).

**Đặc tả:** `spec/modules/AUTH.md` — FR-AUTH-01 AC3 đổi từ "INVITED bị chặn đăng nhập" thành
"INVITED đăng nhập được nhưng chỉ được đổi mật khẩu". `spec/modules/USR.md` viết AC theo luật trên.

**Mã nguồn:** `packages/contracts` phải sinh lại (`npm run contracts:generate`).

**Giới hạn đã biết:** Super Admin phải tự chuyển mật khẩu tạm cho người dùng qua một kênh ngoài hệ
thống. Khi có hạ tầng email (FR-ALR-15), có thể thay bằng liên kết mời mà không phải đổi luật
`INVITED` ở trên.
