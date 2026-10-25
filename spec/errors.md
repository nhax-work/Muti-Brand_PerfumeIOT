# Danh mục mã lỗi

**Nguồn duy nhất.** Agent không được tự nghĩ mã mới. Cần mã mới thì thêm vào đây trước.

Quy ước: `SCREAMING_SNAKE_CASE`, không kèm tiền tố module.

## Chung

Dùng cho mọi module. Thêm ngày 2026-09-18 khi dựng module xác thực — exception filter phải trả
`{ code, message }` cho mọi lỗi, kể cả lỗi không thuộc nghiệp vụ nào.

| Mã | HTTP | Khi nào |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Thiếu access token, sai chữ ký, hoặc refresh token không hợp lệ/đã thu hồi. Token **hết hạn** thì dùng `TOKEN_EXPIRED` |
| `VALIDATION_ERROR` | 400 | Dữ liệu vào thiếu trường hoặc sai định dạng, khi không có mã nghiệp vụ cụ thể hơn |
| `NOT_FOUND` | 404 | Không tìm thấy tài nguyên. Người dùng thuộc thương hiệu **không** nhận mã này cho tài nguyên của thương hiệu khác — xem FR-AUTH-08 AC2 |
| `INTERNAL_ERROR` | 500 | Lỗi không lường trước. Không bao giờ kèm chi tiết nội bộ trong `message` |
| `RATE_LIMITED` | 429 | Vượt giới hạn tần suất: tạo đơn kiosk theo máy (`ORDER_RATE_LIMIT_PER_MIN`, NFR-SEC-06), gửi khiếu nại theo địa chỉ IP (`REFUND_CLAIM_RATE_LIMIT_PER_MIN`, ADR-0012) |

## Xác thực và phân quyền

| Mã | HTTP | Khi nào |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Sai email hoặc mật khẩu |
| `ACCOUNT_LOCKED` | 423 | Quá số lần đăng nhập sai |
| `TOKEN_EXPIRED` | 401 | Access token hết hạn |
| `FORBIDDEN_SCOPE` | 403 | Ngoài phạm vi slot của thương hiệu |
| `REAUTH_REQUIRED` | 403 | Thao tác nhạy cảm cần xác thực lại |

## Hóa đơn thuê slot

| Mã | HTTP | Khi nào |
|---|---|---|
| `RENTAL_OVERLAP` | 409 | Kỳ hạn chồng lấn hóa đơn khác trên cùng slot |
| `SLOT_OCCUPIED` | 409 | Slot đang có hóa đơn ACTIVE/EXPIRING/GRACE/LIQUIDATED |
| `RENTAL_NOT_ACTIVE` | 409 | Hóa đơn không ở trạng thái cho phép thao tác |
| `PRODUCT_NOT_OWNED` | 403 | Sản phẩm không thuộc thương hiệu thuê slot |
| `INVALID_RENTAL_PERIOD` | 400 | Ngày kết thúc trước ngày bắt đầu |
| `HOLD_LIMIT_REACHED` | 409 | Tạo phiên thanh toán làm số slot chưa thanh toán thương hiệu đang giữ vượt `BRAND_MAX_HELD_SLOTS` (FR-SLT-56, ADR-0014) |
| `SLOT_SWAP_NOT_ALLOWED` | 409 | Đổi slot khi đã quá `SLOT_SWAP_WINDOW_HOURS`, đã lắp chai, đã đổi một lần hoặc slot đích khác giá niêm yết (FR-SLT-55, ADR-0014) |

## Đăng ký thương hiệu, hợp đồng và chi trả

Thêm ngày 2026-10-14 theo ADR-0013.

| Mã | HTTP | Khi nào |
|---|---|---|
| `EMAIL_NOT_VERIFIED` | 403 | Tài khoản tự đăng ký chưa xác minh email mà tạo phiên thanh toán thuê slot (FR-USR-07) |
| `AGREEMENT_NOT_ACCEPTED` | 403 | Tạo phiên thanh toán khi chưa đồng ý hợp đồng khung hiện hành, hoặc thanh toán khi chưa đồng ý phụ lục (FR-SLT-49, 50) |
| `BRAND_NOT_VERIFIED` | 409 | Chuyển kỳ chi trả sang PAID khi thương hiệu chưa được xác minh pháp nhân hoặc chưa có tài khoản nhận doanh thu (FR-SLT-53) |

## Đơn hàng và thanh toán

| Mã | HTTP | Khi nào |
|---|---|---|
| `SLOT_UNAVAILABLE` | 409 | Slot không khả dụng khi tạo đơn |
| `MACHINE_OFFLINE` | 409 | Máy mất kết nối |
| `MACHINE_IN_MAINTENANCE` | 409 | Máy đang bảo trì, đang dừng bán chờ bảo trì (`DRAINING`) hoặc đang có phiếu nạp mở (FR-MNT-06, FR-INV-30, ADR-0015) |
| `ORDER_EXPIRED` | 409 | Quá thời hạn thanh toán |
| `ORDER_NOT_CANCELLABLE` | 409 | Khách hủy trên kiosk nhưng đơn đã thanh toán, cổng đang nhận tiền, hoặc đơn đã kết thúc — không hủy được (FR-ORD-33, ADR-0015) |
| `INVALID_WEBHOOK_SIGNATURE` | 401 | Chữ ký webhook không hợp lệ |
| `WEBHOOK_ALREADY_PROCESSED` | 200 | Webhook trùng — **trả 200, không phải lỗi** |
| `AMOUNT_MISMATCH` | 400 | Số tiền webhook lệch đơn hàng |
| `ORDER_NOT_REFUNDABLE` | 409 | Đơn không ở trạng thái cho hoàn tiền |
| `MACHINE_BUSY` | 409 | Máy đang có lệnh xịt chờ khách bấm nút hoặc đã có một đơn chờ thanh toán — kiosk không nhận đơn mới (FR-ORD-24, FR-ORD-35, ADR-0007, ADR-0015); cũng trả khi mở phiếu nạp lúc máy còn lệnh hoặc đơn đó (FR-INV-32) |
| `QUEUE_TIMEOUT` | — | Mã thất bại ghi trên đơn, **không qua HTTP**: đơn đã thanh toán chờ lượt quá `PAID_QUEUE_MAX_SEC` mà chưa tạo được lệnh xịt (FR-ORD-34, ADR-0015) |

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
| `PRESS_TIMEOUT` | Thiết bị từ chối: khách không bấm nút trong `DISPENSE_PRESS_WINDOW_SEC`, đã tắt đèn — đơn chuyển `FORFEITED`, không hoàn tiền (FR-DSP-24, ADR-0007) |

## Tồn kho

| Mã | HTTP | Khi nào |
|---|---|---|
| `BOTTLE_EXPIRED` | 409 | Chai quá hạn sử dụng |
| `BOTTLE_NOT_OWNED` | 403 | Chai không thuộc thương hiệu thuê slot |
| `PRODUCT_MISMATCH` | 409 | Sản phẩm chai lệch cấu hình slot |
| `SLOT_HAS_ACTIVE_BOTTLE` | 409 | Slot đã có chai đang hoạt động |
| `ADJUSTMENT_REASON_REQUIRED` | 400 | Điều chỉnh tồn kho thiếu lý do |
| `REFILL_REQUEST_PENDING` | 409 | Slot đã có yêu cầu chưa hoàn tất |
| `BATCH_NOT_APPROVED` | 409 | Lắp chai thuộc lô chưa được duyệt giấy tờ chính hãng (FR-INV-35, ADR-0017) |
| `DOCUMENT_SUBMISSION_EXPIRED` | 409 | Nộp giấy tờ chính hãng khi thương hiệu không còn hóa đơn hiệu lực và mọi hóa đơn chờ nạp hàng đã quá `RENTAL_MAX_STOCKING_DAYS` (FR-INV-33, ADR-0017) |
| `AUTHENTICITY_NOT_PENDING` | 409 | Duyệt/từ chối giấy tờ của lô không ở `PENDING`, hoặc nộp lại cho lô đã `APPROVED` (FR-INV-34, ADR-0017) |
| `SHIPMENT_ALREADY_PROCESSED` | 409 | Tiếp nhận khai báo gửi hàng không còn ở `DECLARED` (FR-INV-24, ADR-0017) |
| `REFILL_SESSION_OPEN` | 409 | Slot đã có phiếu nạp đang mở (FR-INV-29, ADR-0017) |
| `REFILL_SESSION_NOT_OPEN` | 409 | Đóng phiếu nạp không ở `STARTED` (FR-INV-31, ADR-0017) |
| `BOTTLE_NOT_IN_STOCK` | 409 | Chai chọn để lắp không ở `IN_STOCK` (FR-INV-31, ADR-0017) |

## Vận hành và thông báo

Thêm ngày 2026-10-24 theo ADR-0017.

| Mã | HTTP | Khi nào |
|---|---|---|
| `REASON_REQUIRED` | 400 | Từ chối giấy tờ chính hãng (FR-INV-34) hoặc ép máy bảo trì (FR-MNT-17) mà thiếu lý do |
| `NOTIFICATION_NOT_RETRYABLE` | 409 | Gửi lại thông báo không phải email ở `FAILED` (FR-ALR-16) |
| `FORCED_MAINTENANCE` | — | Mã thất bại ghi trên đơn, **không qua HTTP**: đơn đã thanh toán chờ lượt khi máy bị ép bảo trì (FR-MNT-17, ADR-0017) |

## Phiếu khiếu nại hoàn tiền

Thêm ngày 2026-10-13 theo ADR-0012 (hoàn tiền thủ công qua phiếu khiếu nại).

| Mã | HTTP | Khi nào |
|---|---|---|
| `ORDER_NOT_CLAIMABLE` | 409 | Đơn không thuộc trường hợp được khiếu nại hoàn tiền (đơn đã xịt, khách bỏ lượt, chưa thanh toán…) |
| `CLAIM_ALREADY_OPEN` | 409 | Đơn đã có phiếu khiếu nại — mã khiếu nại chỉ dùng một lần |
| `CLAIM_NOT_ASSIGNED` | 403 | Người gọi không phải Operations Staff đang được phân công cho phiếu |
