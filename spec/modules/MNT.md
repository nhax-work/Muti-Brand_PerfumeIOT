# FR-MNT — Bảo trì

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` Mục A15 · 17 FR  
> Trạng thái AC: **hoàn thành** (FR-MNT-05, 06 soát lại và FR-MNT-17 thêm ngày 2026-10-17 theo ADR-0015 — dừng bán an toàn & chế độ DRAINING)  
> Phụ trách: Hoàng (TV4) / Tài  
> Mức chi tiết: AC cho FR có điều kiện; CRUD để dạng phát biểu

Đọc kèm: `spec/glossary.md`, `spec/errors.md`, `spec/constraints.md`,
`spec/decisions/0015-dung-ban-an-toan-va-bao-ve-khach-tai-may.md`

## FR-MNT-01 — Tạo phiếu bảo trì thủ công

**Tuyên bố:** Hệ thống phải cho phép Operations Staff tạo phiếu bảo trì thủ công cho một máy.

**Dấu vết:** BR-006 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho Operations Staff có quyền bảo trì, Khi tạo phiếu cho một máy, Thì hệ thống tạo phiếu gắn với đúng máy.
- AC2: Cho yêu cầu tạo phiếu không xác định được máy, Khi gửi yêu cầu, Thì hệ thống từ chối tạo phiếu.

**Kiểm tra:** `test_FR_MNT_01_create_ticket`

## FR-MNT-02 — Phân công phiếu cho một tài khoản Operations Staff

**Tuyên bố:** Hệ thống phải cho phép phân công phiếu bảo trì cho một tài khoản Operations Staff cụ thể của nền tảng.

**Dấu vết:** BR-004, BR-006 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho một phiếu bảo trì và một tài khoản Operations Staff hợp lệ của nền tảng, Khi người có quyền bảo trì phân công phiếu cho tài khoản đó, Thì hệ thống ghi nhận tài khoản được phân công trên phiếu.
- AC2: Cho tài khoản được chọn không có vai trò Operations Staff của nền tảng, Khi phân công, Thì hệ thống từ chối thao tác.

> Nền tảng có thể có nhiều tài khoản Operations Staff phụ trách máy/địa điểm khác nhau, nên việc
> phân công vẫn cần thiết sau khi gộp Operations Manager và Technician thành một vai trò duy nhất
> (`docs/FR_NFR_SCENTSTATION.md` Phần D, FR-AUTH-12).

**Kiểm tra:** `test_FR_MNT_02_assign_operations_staff`

## FR-MNT-03 — Phân loại phiếu

**Tuyên bố:** Hệ thống phải phân loại phiếu bảo trì theo nhóm sự cố, mức độ nghiêm trọng, độ ưu tiên và hạn xử lý.

**Dấu vết:** BR-006 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho phiếu bảo trì được tạo, Khi hệ thống lưu thông tin phân loại, Thì phiếu có nhóm sự cố, mức độ nghiêm trọng, độ ưu tiên và hạn xử lý.
- AC2: Cho phiếu thiếu một thông tin phân loại bắt buộc, Khi hệ thống hoàn tất tạo phiếu, Thì hệ thống không lưu phiếu ở trạng thái hoàn chỉnh.

**Kiểm tra:** `test_FR_MNT_03_ticket_classification`

## FR-MNT-04 — Trạng thái phiếu

**Tuyên bố:** Hệ thống phải quản lý trạng thái phiếu theo tập: OPEN, ASSIGNED, IN_PROGRESS, RESOLVED, CLOSED.

**Dấu vết:** BR-006 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho phiếu bảo trì, Khi trạng thái được cập nhật theo quy trình, Thì hệ thống chỉ lưu một giá trị thuộc tập trạng thái quy định.
- AC2: Cho giá trị trạng thái ngoài tập quy định, Khi yêu cầu cập nhật, Thì hệ thống từ chối giá trị đó.

**Kiểm tra:** `test_FR_MNT_04_ticket_status`

## FR-MNT-05 — Yêu cầu đưa máy vào bảo trì qua chế độ DRAINING
**Tuyên bố:** Hệ thống phải cho phép Operations Staff yêu cầu đưa máy vào bảo trì: máy chuyển sang DRAINING, phục vụ nốt đơn đã thanh toán và lệnh đang chạy, rồi tự chuyển sang MAINTENANCE khi không còn lệnh xịt khách hàng hiệu lực, đơn chờ thanh toán hay đơn chờ lượt (ADR-0015).

**Dấu vết:** BR-006, BR-010 · **Ưu tiên:** M · **API:** `PUT /machines/{id}/mode`

**Tiêu chí xét tuyển**

- AC1 (Chuyển sang DRAINING): Cho Operations Staff gửi yêu cầu chuyển máy `M` sang bảo trì mềm, Khi gọi `PUT /machines/{id}/mode` với `mode = 'DRAINING'`, Thì máy chuyển `operating_mode = 'DRAINING'`, kiosk dừng nhận đơn mới và hiển thị thông báo máy chuẩn bị bảo trì.
- AC2 (Tự chuyển MAINTENANCE khi cạn đơn): Cho máy đang ở `DRAINING`, Khi không còn lệnh xịt khách hàng nào đang gửi/chờ kết quả, không còn đơn nào ở `CREATED`/`PENDING_PAYMENT`, và không còn đơn `PAID` nào trong hàng đợi chờ lượt, Thì hệ thống tự động cập nhật `operating_mode = 'MAINTENANCE'`, sinh thông báo cho các Brand Admin có slot trên máy (FR-MNT-07) và ghi AuditLog.
- AC3 (Chuyển thẳng nếu máy rảnh): Cho máy `M` đang không có đơn hàng dở dang hay lệnh xịt nào, Khi yêu cầu đưa vào bảo trì, Thì máy có thể tự động chuyển ngay từ `DRAINING` sang `MAINTENANCE`.

**Kiểm tra:** `test_FR_MNT_05_enter_maintenance`

---

## FR-MNT-06 — Chặn tạo đơn khi máy DRAINING hoặc MAINTENANCE
**Tuyên bố:** Hệ thống phải từ chối tạo đơn hàng mới trên máy đang ở chế độ DRAINING hoặc MAINTENANCE (ADR-0015).

**Dấu vết:** BR-002, BR-010 · **Ưu tiên:** M · **API:** `POST /kiosk/machines/{serialNumber}/orders`

**Tiêu chí xét tuyển**

- AC1 (Từ chối khi DRAINING): Cho máy `M` đang ở chế độ `DRAINING`, Khi khách hàng/kiosk gửi yêu cầu tạo đơn hàng mới, Thì hệ thống từ chối với HTTP 409 `MACHINE_IN_MAINTENANCE` (hoặc `MACHINE_BUSY`).
- AC2 (Từ chối khi MAINTENANCE): Cho máy `M` đang ở chế độ `MAINTENANCE`, Khi kiosk gửi yêu cầu tạo đơn, Thì hệ thống từ chối với HTTP 409 `MACHINE_IN_MAINTENANCE`.
- AC3 (Bình thường khi NORMAL): Cho máy `M` ở `NORMAL` và các điều kiện slot hợp lệ, Khi gửi yêu cầu tạo đơn, Thì hệ thống cho phép tạo đơn thành công.

**Kiểm tra:** `test_FR_MNT_06_block_order_during_maintenance`

## FR-MNT-07 — Thông báo Brand Admin

**Tuyên bố:** Hệ thống phải thông báo cho tất cả Brand Admin có slot trên máy khi máy chuyển sang chế độ MAINTENANCE.

**Dấu vết:** BR-006, BR-012 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho máy có các slot đang thuộc các thương hiệu có hóa đơn hiệu lực, Khi máy chuyển sang MAINTENANCE, Thì hệ thống thông báo cho Brand Admin của các thương hiệu bị ảnh hưởng.
- AC2: Cho thương hiệu không có slot đang thuộc máy, Khi máy chuyển sang MAINTENANCE, Thì Brand Admin của thương hiệu đó không nhận thông báo ảnh hưởng máy.

**Kiểm tra:** `test_FR_MNT_07_maintenance_notification`

## FR-MNT-08 — Xem dữ liệu chẩn đoán máy

**Tuyên bố:** Hệ thống phải cho phép Operations Staff xem dữ liệu cảm biến, mã lỗi và sự kiện thiết bị gần đây của máy được phân công.

**Dấu vết:** BR-006 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho Operations Staff được phân công máy, Khi xem dữ liệu chẩn đoán, Thì hệ thống trả về dữ liệu cảm biến, mã lỗi và sự kiện thiết bị gần đây của máy đó.
- AC2: Cho Operations Staff không được phân công máy, Khi yêu cầu dữ liệu chẩn đoán của máy đó, Thì hệ thống từ chối truy cập.

**Kiểm tra:** `test_FR_MNT_08_view_device_diagnostics`

## FR-MNT-09 — Xịt chẩn đoán

**Tuyên bố:** Hệ thống phải cho phép Operations Staff thực hiện lượt xịt chẩn đoán trên slot được chọn sau khi xác thực lại.

**Dấu vết:** BR-006 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho Operations Staff được phân công và đã xác thực lại, Khi chọn slot và thực hiện xịt chẩn đoán, Thì hệ thống tạo/thực hiện lượt xịt chẩn đoán trên đúng slot.
- AC2: Cho Operations Staff chưa xác thực lại, Khi yêu cầu xịt chẩn đoán, Thì hệ thống từ chối thao tác.

**Kiểm tra:** `test_FR_MNT_09_diagnostic_dispense`

## FR-MNT-10 — Ghi kết quả chẩn đoán

**Tuyên bố:** Hệ thống phải cho phép Operations Staff ghi kết quả chẩn đoán, nguyên nhân, biện pháp xử lý và linh kiện đã thay.

**Dấu vết:** BR-006, BR-008 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho Operations Staff đang xử lý phiếu, Khi ghi kết quả chẩn đoán cùng nguyên nhân, biện pháp xử lý và linh kiện đã thay, Thì hệ thống lưu đầy đủ thông tin vào phiếu.
- AC2: Cho kết quả xử lý chưa được ghi nhận, Khi Operations Staff yêu cầu hoàn tất phiếu, Thì hệ thống không coi phiếu đã có kết quả xử lý.

**Kiểm tra:** `test_FR_MNT_10_diagnostic_result`

## FR-MNT-11 — Checklist sau bảo trì

**Tuyên bố:** Hệ thống phải cung cấp checklist kiểm tra sau bảo trì mà Operations Staff phải hoàn thành.

**Dấu vết:** BR-006, BR-010 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho Operations Staff đang hoàn tất bảo trì, Khi mở bước kiểm tra sau bảo trì, Thì hệ thống cung cấp checklist.
- AC2: Cho checklist còn mục chưa hoàn thành, Khi Operations Staff yêu cầu hoàn tất bước kiểm tra, Thì hệ thống không cho ghi nhận checklist hoàn thành.

**Kiểm tra:** `test_FR_MNT_11_post_maintenance_checklist`

## FR-MNT-12 — Chặn NORMAL khi checklist chưa xong

**Tuyên bố:** Hệ thống phải từ chối đưa máy trở lại chế độ NORMAL khi checklist kiểm tra sau bảo trì chưa hoàn thành.

**Dấu vết:** BR-006, BR-010 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho checklist sau bảo trì chưa hoàn thành, Khi Operations Staff yêu cầu đưa máy về NORMAL, Thì hệ thống từ chối thao tác.
- AC2: Cho checklist đã hoàn thành đầy đủ, Khi Operations Staff yêu cầu đưa máy về NORMAL, Thì hệ thống không từ chối vì lý do checklist chưa hoàn thành.

**Kiểm tra:** `test_FR_MNT_12_restore_normal`

## FR-MNT-13 — Chặn đóng phiếu thiếu kết quả

**Tuyên bố:** Hệ thống phải từ chối đóng phiếu bảo trì khi chưa ghi nhận kết quả xử lý.

**Dấu vết:** BR-006 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho phiếu chưa có kết quả xử lý, Khi Operations Staff yêu cầu đóng phiếu, Thì hệ thống từ chối đóng.
- AC2: Cho phiếu đã có kết quả xử lý, Khi Operations Staff yêu cầu đóng và các điều kiện khác hợp lệ, Thì hệ thống không từ chối vì thiếu kết quả.

**Kiểm tra:** `test_FR_MNT_13_close_without_result`

## FR-MNT-14 — Lịch sử bảo trì máy

**Tuyên bố:** Hệ thống phải lưu lịch sử bảo trì của từng máy.

**Dấu vết:** BR-006, BR-008 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho máy phát sinh một phiếu bảo trì, Khi phiếu được cập nhật trong quá trình xử lý, Thì lịch sử bảo trì của máy lưu được sự kiện liên quan.
- AC2: Cho máy chưa có hoạt động bảo trì, Khi xem lịch sử, Thì hệ thống không tạo bản ghi bảo trì giả.

**Kiểm tra:** `test_FR_MNT_14_maintenance_history`

## FR-MNT-15 — Đính kèm ghi chú và hình ảnh

**Tuyên bố:** Hệ thống phải cho phép đính kèm ghi chú và hình ảnh vào phiếu bảo trì.

**Dấu vết:** BR-006 · **Ưu tiên:** S

**Tiêu chí xét tuyển**

- AC1: Cho phiếu bảo trì hợp lệ, Khi Operations Staff thêm ghi chú và hình ảnh, Thì hệ thống lưu các nội dung đính kèm với phiếu.
- AC2: Cho người dùng không có quyền chỉnh sửa phiếu, Khi cố thêm ghi chú hoặc hình ảnh, Thì hệ thống từ chối thao tác.

**Kiểm tra:** `test_FR_MNT_15_notes_images`

## FR-MNT-16 — Tính thời gian xử lý

**Tuyên bố:** Hệ thống phải tính thời gian từ khi phát sinh sự cố đến khi tiếp nhận và đến khi xử lý xong.

**Dấu vết:** BR-006 · **Ưu tiên:** S

**Tiêu chí xét tuyển**

- AC1: Cho sự cố có thời điểm phát sinh, thời điểm tiếp nhận và thời điểm xử lý xong, Khi hệ thống tính thời gian, Thì hệ thống cung cấp thời gian từ phát sinh đến tiếp nhận và từ phát sinh đến xử lý xong.
- AC2: Cho phiếu chưa có thời điểm tiếp nhận hoặc chưa có thời điểm xử lý xong, Khi xem thời gian xử lý, Thì hệ thống không coi khoảng thời gian chưa kết thúc là thời gian hoàn tất.

**Kiểm tra:** `test_FR_MNT_16_maintenance_timing`

---

## FR-MNT-17 — Ép máy chuyển sang MAINTENANCE khẩn cấp
**Tuyên bố:** Hệ thống phải cho phép Operations Staff ép máy chuyển thẳng sang MAINTENANCE kèm lý do bắt buộc trong trường hợp khẩn cấp; đơn bị ảnh hưởng đi theo FR-ORD-19 (ADR-0015).

**Dấu vết:** BR-006, BR-010 · **Ưu tiên:** M · ADR-0015 mục 4 · **API:** `PUT /machines/{id}/mode` với `force = true` (ADR-0017)

**Tiêu chí xét tuyển**

- AC1 (Ép bảo trì khẩn cấp): Cho máy `M` đang ở `NORMAL` hoặc `DRAINING` gặp sự cố nghiêm trọng, Khi Operations Staff gửi `PUT /machines/{id}/mode` với `operatingMode = MAINTENANCE`, `force = true` kèm lý do `reason = "Cháy nổ/khẩn cấp..."` và đã xác thực lại mật khẩu (`X-Reauth-Token`), Thì máy chuyển ngay lập tức sang `operating_mode = 'MAINTENANCE'`, không chờ xịt nốt.
- AC2 (Đơn hàng bị ảnh hưởng xử lý theo FR-ORD-19): Cho máy bị ép sang `MAINTENANCE` khi đang có đơn `PAID` chờ xịt hoặc lệnh xịt đang gửi dở dang, Khi lệnh bị hủy hoặc thiết bị từ chối, Thì toàn bộ các đơn hàng đó chuyển sang `FAILED`, đánh dấu `needs_manual_review = TRUE` và tạo Alert để hỗ trợ hoàn tiền cho khách hàng.
- AC3 (Bắt buộc lý do): Cho yêu cầu ép bảo trì nhưng không cung cấp `reason`, Khi gửi yêu cầu, Thì hệ thống từ chối với HTTP 400 `REASON_REQUIRED`.
- AC4 (Bắt buộc xác thực lại): Cho yêu cầu thiếu `X-Reauth-Token` hợp lệ, Khi gửi yêu cầu, Thì hệ thống từ chối với HTTP 403 `REAUTH_REQUIRED` (FR-AUTH-09).

**Kiểm tra:** `test_FR_MNT_17_force_emergency_maintenance`
