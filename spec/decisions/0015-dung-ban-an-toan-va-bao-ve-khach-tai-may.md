# ADR-0015 — Dừng bán an toàn và bảo vệ khách tại máy

**Ngày:** 2026-10-13 · **Trạng thái:** đã duyệt (2026-10-13) · **Người quyết:** TV1

## Bối cảnh

Bản rà soát nghiệp vụ ngày 2026-10-13 chỉ ra các tình huống khách **đã trả tiền** mà không nhận được
lượt xịt, hoặc bị bỏ rơi giữa chừng, vì máy không biết dừng bán đúng lúc:

| # | Tình huống | Đặc tả hiện tại |
|---|---|---|
| A6 | Thiết bị từ chối lệnh **trước khi đèn sáng** (cửa mở, bảo trì, slot rỗng…) sau khi khách đã trả tiền | `mqtt.md` §6: đơn `FAILED`, **không** gắn cờ kiểm tra thủ công — trái FR-ORD-19 ("thanh toán thành công nhưng xịt thất bại thì đánh dấu kiểm tra thủ công") |
| P0-4 | Đơn `PAID` chờ lượt khi máy mất kết nối hoặc còn lệnh khác | Không có thời hạn — đơn có thể treo mãi |
| P0-5 | Khách rời màn QR rồi vẫn chuyển khoản; đèn sáng khi không còn ai đứng trước máy | Không có API hủy đơn; một máy nhận được nhiều đơn chờ thanh toán cùng lúc |
| P0-25 | 3 lượt xịt lỗi liên tiếp trên một slot | FR-ALR-04 chỉ sinh cảnh báo, slot vẫn bán — khách thứ 4, thứ 5 vẫn trả tiền rồi lỗi |
| P0-23 | Inventory Staff mở phiếu nạp, mở cửa máy | FR-INV-30 chỉ tắt cảnh báo cửa; máy vẫn bán → khách trả tiền rồi bị từ chối `DOOR_OPEN` |
| P0-24 | Operations Staff chuyển máy sang `MAINTENANCE` | Không quan tâm khách đang ở màn QR hay đèn đang sáng |

## Phương án đã cân nhắc

| Vấn đề | Phương án | Chọn |
|---|---|---|
| Từ chối trước khi đèn sáng | **gắn cờ + cho khiếu nại** · giữ như `mqtt.md` · tự gửi lại lệnh một lần | **gắn cờ** — khớp FR-ORD-19, không đụng FR-DSP-19 |
| Chờ lượt tối đa | **3 phút** · 5 phút · 10 phút | **3 phút** |
| Đơn chờ thanh toán mỗi máy | **một** · không giới hạn | **một** |
| Khách không bấm kịp (ADR-0007) | **giữ không hoàn tiền + theo dõi** · cho sáng lại một lần · cho khiếu nại | **giữ nguyên** |
| 3 lỗi liên tiếp | **tự tắt slot** · chỉ cảnh báo | **tự tắt slot** |
| Phiếu nạp | **dừng bán cả máy** · chỉ dừng slot đang nạp | **cả máy** — cửa mở ảnh hưởng mọi slot |
| Trước bảo trì | **chế độ "đang dừng bán"** · chuyển thẳng | **đang dừng bán** |

## Quyết định

### 1. Từ chối trước khi đèn sáng → gắn cờ kiểm tra thủ công

Sửa dòng "`REJECT`, mã khác, **trước** `ACK`" trong bảng ánh xạ `mqtt.md` §6: đơn `FAILED` **và** đặt
`needs_manual_review`. Khách đã trả tiền nên đơn vào danh sách `GET /orders/manual-review` và được khiếu
nại qua QR sự cố (ADR-0012). `CMD_DUPLICATE` vẫn bị bỏ qua (ADR-0011). Lệnh **không** được gửi lại tự
động (FR-DSP-19 giữ nguyên).

### 2. Đơn chờ lượt tối đa 3 phút

Đơn `PAID` chưa được ghi lệnh xịt sau `PAID_QUEUE_MAX_SEC` = 180 giây kể từ `paid_at` → `FAILED` với mã
`QUEUE_TIMEOUT`, đặt `needs_manual_review`. Job chạy trong nhịp DSP, có bù sau downtime. Kiosk hiện màn
sự cố kèm QR khiếu nại.

### 3. Mỗi máy một đơn chờ thanh toán, và hủy đơn từ kiosk

- Mỗi máy tối đa một đơn ở `CREATED`/`PENDING_PAYMENT`, cưỡng chế bằng partial unique index. Đơn thứ hai
  bị từ chối `MACHINE_BUSY` (mở rộng nghĩa của mã có sẵn).
- `POST /kiosk/orders/{id}/cancel`: đơn `PENDING_PAYMENT` → `EXPIRED` với lý do `CUSTOMER_CANCELLED`, đồng
  thời **hủy link thanh toán bên PayOS** để khách không trả được nữa. Không thêm trạng thái đơn mới.
- Kiosk gọi hủy khi khách xác nhận rời màn QR, và khi phiên kiosk bị reset lúc còn đơn chờ thanh toán.
- Tiền vẫn về sau khi đã hủy → đơn `REFUND_PENDING` như tiền về sau hạn, vào danh sách hoàn tiền.

### 4. Khách không bấm kịp — giữ ADR-0007, đo khi pilot

Không đổi luật: `FORFEITED`, không hoàn tiền, không cho khiếu nại. Báo cáo FR-RPT-04 thêm tỉ lệ
`FORFEITED` **theo từng máy**. Quy trình nhóm: tỉ lệ ở máy nào vượt 10% trong pilot thì xem lại ADR-0007
(ví dụ cho đèn sáng lại một lần). Đây là ngưỡng xem xét của nhóm, không phải hằng ngưỡng hệ thống.

### 5. Tự tắt slot sau 3 lỗi liên tiếp

Khi `CONSECUTIVE_FAIL_ALERT` (= 3) lệnh `CUSTOMER` liên tiếp trên cùng slot kết thúc bằng `FAILED`,
`UNKNOWN`, hoặc `REJECTED` với mã khác `PRESS_TIMEOUT`/`CMD_DUPLICATE`: ngoài cảnh báo (FR-ALR-04), hệ
thống chuyển slot sang `MAINTENANCE` (giá trị đã có của `slot_status`) và ghi AuditLog. Slot không tự bật
lại; Operations Staff bật lại sau khi kiểm tra (FR-MCH-12). Dùng chung một hằng để cảnh báo và tự tắt
luôn đi cùng nhau.

### 6. Mở phiếu nạp → dừng bán cả máy

- Khi máy có phiếu nạp `STARTED` (FR-INV-29): không nhận đơn mới (`MACHINE_IN_MAINTENANCE`), không ghi
  lệnh cho đơn chờ lượt (đơn chờ quá 3 phút đi theo mục 2). Kiosk hiện màn tạm ngưng.
- Không mở được phiếu nạp khi máy còn lệnh `CUSTOMER` đang hiệu lực hoặc đơn chờ thanh toán — trả
  `MACHINE_BUSY`; Inventory Staff thử lại sau tối đa vài chục giây.
- Đóng phiếu (FR-INV-31) thì máy bán lại bình thường.

### 7. Chế độ "đang dừng bán" trước bảo trì

- `machine_operating_mode` thêm `DRAINING`. Operations Staff yêu cầu bảo trì (FR-MNT-05) → máy vào
  `DRAINING`: không nhận đơn mới (`MACHINE_IN_MAINTENANCE`), đơn đã trả tiền và lệnh đang chạy được phục
  vụ nốt.
- Khi không còn lệnh `CUSTOMER` hiệu lực, đơn chờ thanh toán hay đơn chờ lượt → máy tự sang
  `MAINTENANCE`. Operations Staff có thể ép chuyển ngay, kèm lý do bắt buộc (dùng khi khẩn cấp; đơn bị
  ảnh hưởng đi theo FR-ORD-19).
- `DRAINING` chỉ tồn tại ở backend: thiết bị vẫn nhận chế độ `NORMAL` cho tới khi máy thật sự sang
  `MAINTENANCE`, nên `mqtt.md` không cần thêm giá trị chế độ.

### 8. Khách nước ngoài

PayOS chỉ nhận chuyển khoản VietQR, nên khách không có tài khoản ngân hàng Việt Nam không thanh toán
được. Ghi là **giới hạn của pilot** trong báo cáo; không có thay đổi hệ thống.

### Thay đổi đặc tả và contract — viết ở PR riêng

| Chỗ | Thay đổi |
|---|---|
| `spec/contracts/mqtt.md` | §6: dòng từ chối trước `ACK` đặt `needs_manual_review` |
| `schema.sql` | Enum `machine_operating_mode` thêm `DRAINING` (migration riêng). Partial unique index `uq_machine_open_order ON orders (machine_id) WHERE status IN ('CREATED', 'PENDING_PAYMENT')` |
| `openapi.yaml` | `POST /kiosk/orders/{id}/cancel`; `MachineOperatingMode` thêm `DRAINING`; `POST /machines/{id}/mode` ghi rõ `MAINTENANCE` đi qua `DRAINING`, có cờ ép chuyển kèm lý do; mô tả `MACHINE_BUSY` mở rộng |
| `spec/constraints.md` | `PAID_QUEUE_MAX_SEC = 180` |
| `spec/errors.md` | `QUEUE_TIMEOUT` (mã thất bại của đơn, không qua HTTP); mở rộng mô tả `MACHINE_BUSY`, `MACHINE_IN_MAINTENANCE` |
| `docs/FR_NFR_SCENTSTATION.md` | Sửa FR-ORD-19 (gồm từ chối trước `ACK`), FR-ALR-04 (tự tắt slot), FR-INV-30 (dừng bán cả máy), FR-MNT-05, 06 (`DRAINING`), FR-MCH-09 (thêm chế độ), FR-RPT-04 (theo máy); FR mới cho chờ lượt tối đa, một đơn chờ thanh toán mỗi máy, hủy đơn từ kiosk |
| `spec/glossary.md` | Trục chế độ của `Machine` thêm `DRAINING`; ghi chú `EXPIRED` có lý do `CUSTOMER_CANCELLED` |

## Hệ quả

- **Module:** DSP (gắn cờ trước `ACK`, job chờ lượt, tự tắt slot), ORD (một đơn chờ mỗi máy, hủy đơn),
  MCH và MNT (`DRAINING`), INV (phiếu nạp dừng bán), kiosk (gọi hủy, màn tạm ngưng khi đang nạp).
- **Test:** hai đơn tạo đồng thời trên một máy → chỉ một thành công (CSDL chặn); hủy rồi tiền về →
  `REFUND_PENDING`; job chờ lượt có bù sau downtime; 3 lỗi liên tiếp → slot `MAINTENANCE`; `DRAINING` tự
  sang `MAINTENANCE` khi hết đơn; mở phiếu nạp khi đèn đang sáng → `MACHINE_BUSY`.
- **Đánh đổi:** một đơn chờ thanh toán mỗi máy nghĩa là khách bỏ dở màn QR mà kiosk không kịp hủy sẽ chặn
  khách sau tới khi đơn hết hạn (`ORDER_PAYMENT_TTL_SEC`). Kiosk phải gọi hủy ở mọi lối thoát; đây là lý
  do mục 3 đi kèm API hủy.
