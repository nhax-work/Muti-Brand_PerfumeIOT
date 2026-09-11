# Danh mục mã lỗi

**Nguồn duy nhất.** Agent không được tự nghĩ mã mới. Cần mã mới thì thêm vào đây trước.

Quy ước: `SCREAMING_SNAKE_CASE`, không kèm tiền tố module.

## Xác thực và phân quyền

| Mã | HTTP | Khi nào |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Sai email hoặc mật khẩu |
| `ACCOUNT_LOCKED` | 423 | Quá số lần đăng nhập sai |
| `TOKEN_EXPIRED` | 401 | Access token hết hạn |
| `FORBIDDEN_SCOPE` | 403 | Ngoài phạm vi slot của thương hiệu |
| `REAUTH_REQUIRED` | 403 | Thao tác nhạy cảm cần xác thực lại |

## Hợp đồng thuê slot

| Mã | HTTP | Khi nào |
|---|---|---|
| `RENTAL_OVERLAP` | 409 | Kỳ hạn chồng lấn hợp đồng khác trên cùng slot |
| `SLOT_OCCUPIED` | 409 | Slot đang có hợp đồng ACTIVE/EXPIRING/GRACE/LIQUIDATED |
| `RENTAL_NOT_ACTIVE` | 409 | Hợp đồng không ở trạng thái cho phép thao tác |
| `PRODUCT_NOT_OWNED` | 403 | Sản phẩm không thuộc thương hiệu thuê slot |
| `INVALID_RENTAL_PERIOD` | 400 | Ngày kết thúc trước ngày bắt đầu |

## Đơn hàng và thanh toán

| Mã | HTTP | Khi nào |
|---|---|---|
| `SLOT_UNAVAILABLE` | 409 | Slot không khả dụng khi tạo đơn |
| `MACHINE_OFFLINE` | 409 | Máy mất kết nối |
| `MACHINE_IN_MAINTENANCE` | 409 | Máy đang bảo trì |
| `ORDER_EXPIRED` | 409 | Quá thời hạn thanh toán |
| `INVALID_WEBHOOK_SIGNATURE` | 401 | Chữ ký webhook không hợp lệ |
| `WEBHOOK_ALREADY_PROCESSED` | 200 | Webhook trùng — **trả 200, không phải lỗi** |
| `AMOUNT_MISMATCH` | 400 | Số tiền webhook lệch đơn hàng |
| `ORDER_NOT_REFUNDABLE` | 409 | Đơn không ở trạng thái cho hoàn tiền |

## Lệnh xịt

| Mã | Khi nào |
|---|---|
| `CMD_INVALID_SIGNATURE` | Thiết bị từ chối: chữ ký sai |
| `CMD_EXPIRED` | Thiết bị từ chối: quá TTL |
| `CMD_WRONG_MACHINE` | Thiết bị từ chối: sai máy đích |
| `CMD_DUPLICATE` | Thiết bị từ chối: mã lệnh đã thực hiện |
| `DOOR_OPEN` | Thiết bị từ chối: cửa đang mở |
| `SLOT_EMPTY` | Thiết bị từ chối: ngăn rỗng |
| `ACTUATOR_FAULT` | Cơ cấu không phản hồi |
| `HARD_TIMEOUT` | Vượt `ACTUATOR_MAX_MS`, đã cắt nguồn |
| `NO_CURRENT` | Không phát hiện dòng qua cơ cấu |

## Tồn kho

| Mã | HTTP | Khi nào |
|---|---|---|
| `BOTTLE_EXPIRED` | 409 | Chai quá hạn sử dụng |
| `BOTTLE_NOT_OWNED` | 403 | Chai không thuộc thương hiệu thuê slot |
| `PRODUCT_MISMATCH` | 409 | Sản phẩm chai lệch cấu hình slot |
| `SLOT_HAS_ACTIVE_BOTTLE` | 409 | Slot đã có chai đang hoạt động |
| `ADJUSTMENT_REASON_REQUIRED` | 400 | Điều chỉnh tồn kho thiếu lý do |
| `REFILL_REQUEST_PENDING` | 409 | Slot đã có yêu cầu chưa hoàn tất |
