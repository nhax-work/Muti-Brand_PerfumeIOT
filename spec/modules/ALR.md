# FR-ALR — Cảnh báo

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` Mục A14 · 15 FR  
> Trạng thái AC: **đã viết**  
> Phụ trách: Hoàng (TV4)  
> Mức chi tiết: AC cho FR có điều kiện; CRUD để dạng phát biểu

Đọc kèm: `spec/glossary.md`, `spec/errors.md`, `spec/constraints.md`

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

**Tuyên bố:** Hệ thống phải sinh cảnh báo khi thiết bị báo cửa mở quá 5 phút ngoài phiên bảo trì.

**Dấu vết:** BR-006, BR-010 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho máy không ở trong phiên bảo trì, Khi cửa mở liên tục quá 5 phút, Thì hệ thống sinh cảnh báo.
- AC2: Cho máy đang trong phiên bảo trì, Khi cửa mở quá 5 phút, Thì điều kiện này không sinh cảnh báo ngoài phiên bảo trì.

**Kiểm tra:** `test_FR_ALR_03_door_open_alert`

## FR-ALR-04 — Ba lượt xịt thất bại liên tiếp

**Tuyên bố:** Hệ thống phải sinh cảnh báo khi có 3 lượt xịt thất bại liên tiếp trên cùng một slot.

**Dấu vết:** BR-006 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho cùng một slot có 3 lượt xịt thất bại liên tiếp, Khi kết quả thất bại thứ ba được ghi nhận, Thì hệ thống sinh cảnh báo.
- AC2: Cho chuỗi thất bại chưa đạt 3 lượt liên tiếp, Khi ghi nhận kết quả, Thì hệ thống chưa sinh cảnh báo theo điều kiện này.

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

**Tuyên bố:** Hệ thống phải xác định danh sách thương hiệu bị ảnh hưởng bởi mỗi cảnh báo mức máy, dựa trên các slot đang có hợp đồng hiệu lực.

**Dấu vết:** BR-006, BR-012 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho máy có các slot đang có hợp đồng hiệu lực, Khi phát sinh cảnh báo mức máy, Thì hệ thống xác định các thương hiệu tương ứng là đối tượng bị ảnh hưởng.
- AC2: Cho slot không có hợp đồng hiệu lực, Khi xác định thương hiệu bị ảnh hưởng, Thì slot đó không làm phát sinh thương hiệu bị ảnh hưởng.

**Kiểm tra:** `test_FR_ALR_09_affected_brands`

## FR-ALR-10 — Thông báo cảnh báo cho Brand Admin

**Tuyên bố:** Hệ thống phải thông báo cho Brand Admin các cảnh báo ảnh hưởng đến slot của thương hiệu mình, không tiết lộ thông tin slot của thương hiệu khác.

**Dấu vết:** BR-006, BR-012 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho cảnh báo ảnh hưởng đến slot của Brand A, Khi hệ thống gửi thông báo cho Brand Admin của Brand A, Thì thông báo chứa thông tin cần thiết về ảnh hưởng tới Brand A.
- AC2: Cho cùng máy có slot của Brand B, Khi Brand Admin của Brand A nhận thông báo, Thì thông báo không tiết lộ thông tin slot hoặc dữ liệu của Brand B.

**Kiểm tra:** `test_FR_ALR_10_brand_alert_notification`

## FR-ALR-11 — Tiếp nhận, phân công và đóng cảnh báo

**Tuyên bố:** Hệ thống phải cho phép Operations Manager tiếp nhận, phân công và đóng cảnh báo.

**Dấu vết:** BR-006 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho Operations Manager có quyền xử lý cảnh báo, Khi thực hiện tiếp nhận hoặc phân công cảnh báo, Thì hệ thống cập nhật cảnh báo tương ứng.
- AC2: Cho cảnh báo chưa hoàn tất xử lý, Khi Operations Manager yêu cầu đóng cảnh báo, Thì hệ thống chỉ cho phép đóng khi điều kiện nghiệp vụ đóng được đáp ứng.

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

## FR-ALR-15 — Thông báo qua kênh ngoài

**Tuyên bố:** Hệ thống phải gửi thông báo qua kênh ngoài như email hoặc Zalo cho người chịu trách nhiệm.

**Dấu vết:** BR-006 · **Ưu tiên:** W

**Tiêu chí xét tuyển**

- AC1: Cho cảnh báo cần thông báo qua kênh ngoài và có người chịu trách nhiệm, Khi hệ thống phát hành thông báo, Thì hệ thống gửi thông báo qua kênh ngoài được cấu hình.
- AC2: Cho kênh ngoài chưa được cấu hình hoặc không khả dụng, Khi phát hành thông báo, Thì hệ thống không coi việc gửi qua kênh ngoài là thành công.

**Kiểm tra:** `test_FR_ALR_15_external_notification`
