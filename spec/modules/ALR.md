# FR-ALR — Cảnh báo

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` Mục A14 · 16 FR  
> Trạng thái AC: **hoàn thành** (FR-ALR-04, 15 soát lại và FR-ALR-16 thêm ngày 2026-10-17 theo ADR-0013, ADR-0015)  
> Phụ trách: Hoàng (TV4) / Tài  
> Mức chi tiết: AC cho FR có điều kiện; CRUD để dạng phát biểu

Đọc kèm: `spec/glossary.md`, `spec/errors.md`, `spec/constraints.md`,
`spec/decisions/0013-brand-tu-dang-ky-hop-dong-hai-lop-va-chi-tra-doanh-thu.md`,
`spec/decisions/0015-dung-ban-an-toan-va-bao-ve-khach-tai-may.md`

## FR-ALR-01 — Cảnh báo máy OFFLINE

**Tuyên bố:** Hệ thống phải sinh cảnh báo khi máy chuyển sang trạng thái OFFLINE.

**Dấu vết:** BR-006 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho máy chuyển sang OFFLINE, Khi hệ thống xác định trạng thái OFFLINE, Thì hệ thống sinh cảnh báo cho máy đó.
- AC2: Cho máy chưa ở trạng thái OFFLINE, Khi trạng thái được cập nhật nhưng không chuyển sang OFFLINE, Thì hệ thống không sinh cảnh báo OFFLINE.

**Kiểm tra:** `test_FR_ALR_01_offline_alert`

## FR-ALR-02 — Cảnh báo slot sắp hết/rỗng

**Tuyên bố:** Hệ thống phải sinh cảnh báo khi slot đạt ngưỡng sắp hết hoặc chuyển sang rỗng.

**Dấu vết:** BR-005, BR-006 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho slot đạt ngưỡng sắp hết, Khi tồn kho được cập nhật đến ngưỡng, Thì hệ thống sinh cảnh báo tương ứng.
- AC2: Cho slot chuyển sang rỗng, Khi trạng thái tồn được xác định là EMPTY, Thì hệ thống sinh cảnh báo slot rỗng.

**Kiểm tra:** `test_FR_ALR_02_slot_stock_alert`

## FR-ALR-03 — Cửa mở quá 5 phút

**Tuyên bố:** Hệ thống phải sinh cảnh báo khi thiết bị báo cửa mở quá `DOOR_OPEN_ALERT_MIN` ngoài phiên bảo trì **và ngoài phiên nạp đang mở** (FR-INV-29, FR-INV-30).

**Dấu vết:** BR-006, BR-010 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho máy không ở chế độ MAINTENANCE và không có phiếu nạp nào đang mở trên máy/slot đó, Khi cửa mở liên tục quá `DOOR_OPEN_ALERT_MIN`, Thì hệ thống sinh cảnh báo.
- AC2: Cho máy đang ở chế độ MAINTENANCE, Khi cửa mở quá `DOOR_OPEN_ALERT_MIN`, Thì hệ thống không sinh cảnh báo theo điều kiện này.
- AC3: Cho tồn tại một `RefillSession` trạng thái `STARTED` trên cùng máy/slot (phiếu nạp đang mở, FR-INV-29), Khi cửa mở quá `DOOR_OPEN_ALERT_MIN`, Thì hệ thống không sinh cảnh báo theo điều kiện này — kể cả khi máy đang ở chế độ NORMAL (FR-INV-30).
- AC4: Cho phiếu nạp vừa được đóng (`RefillSession` chuyển `COMPLETED`), Khi cửa tiếp tục mở quá `DOOR_OPEN_ALERT_MIN` sau thời điểm đóng phiếu, Thì hệ thống sinh cảnh báo trở lại (FR-INV-31).

> **Hai ngoại lệ, không phải một.** Inventory Staff nạp/tháo chai **không** chuyển máy sang
> MAINTENANCE, nên nếu chỉ loại trừ chế độ MAINTENANCE thì mỗi lần nạp hàng quá
> `DOOR_OPEN_ALERT_MIN` sẽ sinh báo động giả — đó chính là lỗ hổng mà FR-INV-29÷31 được thêm để
> đóng (`docs/FR_NFR_SCENTSTATION.md` Phần D). Ràng buộc này cũng ghi ở `spec/contracts/schema.sql`
> §13 mục 5 và `spec/contracts/mqtt.md` §3.

**Kiểm tra:** `test_FR_ALR_03_door_open_alert`

## FR-ALR-04 — Cảnh báo xịt thất bại liên tiếp và tự tắt slot
**Tuyên bố:** Hệ thống phải sinh cảnh báo khi có `CONSECUTIVE_FAIL_ALERT` lệnh xịt khách hàng liên tiếp trên cùng một slot kết thúc bằng FAILED, UNKNOWN hoặc REJECTED với mã khác `PRESS_TIMEOUT` và `CMD_DUPLICATE`; slot đồng thời tự tắt theo FR-MCH-18 (ADR-0015).

**Dấu vết:** BR-006 · **Ưu tiên:** M · ADR-0015 mục 4

**Tiêu chí xét tuyển**

- AC1 (Sinh cảnh báo và tự tắt slot): Cho cùng một slot có `CONSECUTIVE_FAIL_ALERT = 3` lượt xịt khách hàng liên tiếp kết thúc bằng `FAILED`, `UNKNOWN` (timeout không có phản hồi) hoặc bị thiết bị từ chối trước/sau `ACK`, Khi kết quả thất bại thứ ba được ghi nhận, Thì hệ thống sinh cảnh báo loại `CONSECUTIVE_FAIL_ALERT` mức độ `HIGH`, gửi thông báo đến Operations Staff, đồng thời tự động cập nhật slot sang `MAINTENANCE` (FR-MCH-18).
- AC2 (Loại trừ không bấm nút và trùng lệnh): Cho lượt xịt kết thúc bằng `PRESS_TIMEOUT` (khách không bấm nút) hoặc bị từ chối với `CMD_DUPLICATE`, Khi ghi nhận kết quả, Thì chuỗi thất bại liên tiếp không bị tính tăng và không kích hoạt cảnh báo này.
- AC3: Cho chuỗi thất bại chưa chạm ngưỡng 3 lượt liên tiếp hoặc có 1 lượt xịt thành công xen giữa, Khi ghi nhận kết quả, Thì bộ đếm lỗi được reset về 0 và hệ thống không sinh cảnh báo.

**Kiểm tra:** `test_FR_ALR_04_three_failed_dispenses`

## FR-ALR-05 — Lỗi cảm biến/cơ cấu

**Tuyên bố:** Hệ thống phải sinh cảnh báo khi thiết bị báo lỗi cảm biến hoặc lỗi cơ cấu.

**Dấu vết:** BR-006 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho thiết bị gửi sự kiện lỗi cảm biến, Khi hệ thống tiếp nhận sự kiện hợp lệ, Thì hệ thống sinh cảnh báo.
- AC2: Cho thiết bị gửi sự kiện lỗi cơ cấu, Khi hệ thống tiếp nhận sự kiện hợp lệ, Thì hệ thống sinh cảnh báo tương ứng.

**Kiểm tra:** `test_FR_ALR_05_device_error_alert`

## FR-ALR-06 — Phân loại cảnh báo

**Tuyên bố:** Hệ thống phải phân loại mỗi cảnh báo theo loại, mức độ nghiêm trọng, máy, slot, địa điểm và thời điểm phát sinh.

**Dấu vết:** BR-006 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho một cảnh báo được tạo, Khi hệ thống lưu cảnh báo, Thì bản ghi chứa loại, mức độ nghiêm trọng, máy, slot, địa điểm và thời điểm phát sinh.
- AC2: Cho cảnh báo không xác định được một trường phân loại bắt buộc, Khi hệ thống tạo cảnh báo, Thì hệ thống không lưu bản ghi thiếu thông tin bắt buộc.

**Kiểm tra:** `test_FR_ALR_06_alert_classification`

## FR-ALR-07 — Chống tạo cảnh báo trùng

**Tuyên bố:** Hệ thống phải không sinh cảnh báo mới cùng loại trên cùng đối tượng khi đã tồn tại một cảnh báo chưa xử lý.

**Dấu vết:** BR-006 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho cùng loại cảnh báo trên cùng đối tượng đang có một cảnh báo chưa xử lý, Khi điều kiện cảnh báo lặp lại, Thì hệ thống không tạo thêm cảnh báo mới cùng loại.
- AC2: Cho cảnh báo cũ đã được xử lý, Khi cùng điều kiện phát sinh lại, Thì hệ thống có thể tạo một cảnh báo mới cho lần phát sinh mới.

**Kiểm tra:** `test_FR_ALR_07_duplicate_alert`

## FR-ALR-08 — Trạng thái cảnh báo

**Tuyên bố:** Hệ thống phải quản lý trạng thái cảnh báo theo tập: OPEN, ACKNOWLEDGED, RESOLVED, CLOSED.

**Dấu vết:** BR-006 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho cảnh báo trong hệ thống, Khi trạng thái được cập nhật theo nghiệp vụ, Thì hệ thống chỉ lưu một giá trị thuộc tập trạng thái quy định.
- AC2: Cho giá trị trạng thái ngoài tập quy định, Khi yêu cầu cập nhật, Thì hệ thống từ chối giá trị đó.

**Kiểm tra:** `test_FR_ALR_08_alert_status`

## FR-ALR-09 — Xác định thương hiệu bị ảnh hưởng

**Tuyên bố:** Hệ thống phải xác định danh sách thương hiệu bị ảnh hưởng bởi mỗi cảnh báo mức máy, dựa trên các slot đang có hóa đơn hiệu lực.

**Dấu vết:** BR-006, BR-012 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho máy có các slot đang có hóa đơn hiệu lực, Khi phát sinh cảnh báo mức máy, Thì hệ thống xác định các thương hiệu tương ứng là đối tượng bị ảnh hưởng.
- AC2: Cho slot không có hóa đơn hiệu lực, Khi xác định thương hiệu bị ảnh hưởng, Thì slot đó không làm phát sinh thương hiệu bị ảnh hưởng.

**Kiểm tra:** `test_FR_ALR_09_affected_brands`

## FR-ALR-10 — Thông báo cảnh báo cho Brand Admin

**Tuyên bố:** Hệ thống phải thông báo cho Brand Admin các cảnh báo ảnh hưởng đến slot của thương hiệu mình, không tiết lộ thông tin slot của thương hiệu khác.

**Dấu vết:** BR-006, BR-012 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho cảnh báo ảnh hưởng đến slot của Brand A, Khi hệ thống gửi thông báo cho Brand Admin của Brand A, Thì thông báo chứa thông tin cần thiết về ảnh hưởng tới Brand A.
- AC2: Cho cùng máy có slot của Brand B, Khi Brand Admin của Brand A nhận thông báo, Thì thông báo không tiết lộ thông tin slot hoặc dữ liệu của Brand B.

**Kiểm tra:** `test_FR_ALR_10_brand_alert_notification`

## FR-ALR-11 — Tiếp nhận, phân công và đóng cảnh báo

**Tuyên bố:** Hệ thống phải cho phép Operations Staff tiếp nhận, phân công và đóng cảnh báo.

**Dấu vết:** BR-006 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho Operations Staff có quyền xử lý cảnh báo, Khi thực hiện tiếp nhận hoặc phân công cảnh báo, Thì hệ thống cập nhật cảnh báo tương ứng.
- AC2: Cho cảnh báo chưa hoàn tất xử lý, Khi Operations Staff yêu cầu đóng cảnh báo, Thì hệ thống chỉ cho phép đóng khi điều kiện nghiệp vụ đóng được đáp ứng.

**Kiểm tra:** `test_FR_ALR_11_manage_alert`

## FR-ALR-12 — Lưu thông tin xử lý

**Tuyên bố:** Hệ thống phải lưu người xử lý, thời điểm tiếp nhận, nội dung xử lý và thời điểm hoàn thành của mỗi cảnh báo.

**Dấu vết:** BR-006, BR-008 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho cảnh báo được tiếp nhận và xử lý, Khi cập nhật quá trình xử lý, Thì hệ thống lưu người xử lý, thời điểm tiếp nhận, nội dung xử lý và thời điểm hoàn thành.
- AC2: Cho cảnh báo chưa hoàn thành, Khi xem thông tin xử lý, Thì hệ thống không ghi nhận thời điểm hoàn thành như một sự kiện đã xảy ra.

**Kiểm tra:** `test_FR_ALR_12_alert_resolution_log`

## FR-ALR-13 — Tự tạo phiếu bảo trì

**Tuyên bố:** Hệ thống phải tự động tạo phiếu bảo trì cho các loại cảnh báo được cấu hình là nghiêm trọng.

**Dấu vết:** BR-006 · **Ưu tiên:** S

**Tiêu chí xét tuyển**

- AC1: Cho loại cảnh báo được cấu hình là nghiêm trọng, Khi cảnh báo loại đó được tạo, Thì hệ thống tự động tạo phiếu bảo trì liên quan.
- AC2: Cho loại cảnh báo không được cấu hình là nghiêm trọng, Khi cảnh báo được tạo, Thì hệ thống không tự động tạo phiếu bảo trì theo điều kiện này.

**Kiểm tra:** `test_FR_ALR_13_auto_maintenance_ticket`

## FR-ALR-14 — Nâng mức khi quá hạn

**Tuyên bố:** Hệ thống phải nâng mức cảnh báo khi quá thời hạn xử lý quy định.

**Dấu vết:** BR-006 · **Ưu tiên:** S

**Tiêu chí xét tuyển**

- AC1: Cho cảnh báo chưa được xử lý và đã vượt thời hạn xử lý quy định, Khi hệ thống kiểm tra SLA, Thì mức cảnh báo được nâng lên.
- AC2: Cho cảnh báo chưa vượt thời hạn xử lý, Khi hệ thống kiểm tra SLA, Thì mức cảnh báo không bị nâng vì điều kiện quá hạn.

**Kiểm tra:** `test_FR_ALR_14_escalate_overdue`

## FR-ALR-15 — Cảnh báo vận hành qua kênh ngoài
**Tuyên bố:** Hệ thống phải gửi cảnh báo vận hành qua kênh ngoài như email hoặc Zalo cho người chịu trách nhiệm (phần thông báo về tiền và hàng tách sang FR-ALR-16) (ADR-0013).

**Dấu vết:** BR-006 · **Ưu tiên:** W

**Tiêu chí xét tuyển**

- AC1: Cho cảnh báo vận hành nghiêm trọng (như máy offline, lỗi cảm biến, xịt lỗi liên tiếp), Khi hệ thống sinh cảnh báo, Thì hệ thống gửi thông báo qua kênh ngoài (Email/Zalo) được cấu hình cho nhân sự vận hành phụ trách.
- AC2: Cho kênh ngoài chưa được cấu hình hoặc gặp sự cố mạng, Khi phát hành thông báo, Thì hệ thống ghi nhận lỗi gửi và không làm gián đoạn luồng xử lý cảnh báo trong hệ thống.

**Kiểm tra:** `test_FR_ALR_15_external_notification`

---

## FR-ALR-16 — Gửi email thông báo tiền và hàng cho Brand Admin
**Tuyên bố:** Hệ thống phải gửi email cho Brand Admin, và lưu trạng thái gửi làm bằng chứng, các thông báo: thanh toán thuê slot thành công, hóa đơn bắt đầu hiệu lực, sắp hết hạn, vào ân hạn, sắp thanh lý, đã thanh lý, hàng trả về sẵn sàng và kỳ chi trả doanh thu (ADR-0013).

**Dấu vết:** BR-009, BR-013 · **Ưu tiên:** M · ADR-0013 mục 4

**Tiêu chí xét tuyển**

- AC1 (Danh sách 8 sự kiện bắt buộc gửi email): Cho Brand Admin của thương hiệu, Khi phát sinh một trong 8 sự kiện sau:
  1. Thanh toán phiên thuê slot thành công (FR-SLT-43)
  2. Hóa đơn bắt đầu có hiệu lực sau khi lắp chai (FR-SLT-24, 43)
  3. Hóa đơn sắp hết hạn mốc 7 ngày và 3 ngày (FR-EXP-01, 02)
  4. Hóa đơn chuyển sang trạng thái ân hạn GRACE (FR-EXP-06)
  5. Cảnh báo sắp thanh lý hàng tồn mốc 3 ngày trước hạn (FR-EXP-28)
  6. Hàng tồn bị thanh lý chuyển sở hữu về nền tảng (FR-EXP-19)
  7. Phiếu trả hàng sẵn sàng tại kho để nhận (FR-EXP-26)
  8. Kỳ chi trả doanh thu được chốt số liệu hoặc đã chuyển khoản (FR-SLT-52, 53)
  Thì hệ thống tự động tạo bản ghi thông báo với `channel = 'EMAIL'`, gửi email đến hòm thư đã xác minh của Brand Admin và lưu trạng thái gửi (`SENT`, `FAILED`) làm bằng chứng đối soát pháp lý.
- AC2 (Lưu vết bằng chứng gửi): Cho mỗi email được gửi đi, Khi gửi qua SMTP/nhà cung cấp email, Thì hệ thống lưu thông tin người nhận, thời điểm gửi, tiêu đề, mã tham chiếu sự kiện và phản hồi của dịch vụ email vào bảng `notifications`.
- AC3 (Chống thất lạc): Cho trường hợp dịch vụ gửi email tạm thời gián đoạn, Khi gửi thất bại, Thì bản ghi được đánh dấu `FAILED` và job định kỳ tự động thử gửi lại để bảo đảm quyền lợi thông tin của thương hiệu.

**Kiểm tra:** `test_FR_ALR_16_send_brand_email_notifications`
