# FR-ORD — Đơn hàng và thanh toán

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` mục A11 · 23 FR  
> Trạng thái AC: **hoàn thành**  
> Phụ trách: TV1 / Tài  

Đọc kèm: `spec/glossary.md`, `spec/errors.md`, `spec/constraints.md`

---

## FR-ORD-01 — Hiển thị sản phẩm khả dụng trên Kiosk
* **Statement:** Hệ thống phải hiển thị trên kiosk sản phẩm của tất cả slot đang khả dụng trên máy, kèm tên thương hiệu tương ứng.
* **Traces:** BR-001, BR-011 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given máy `M` đang ONLINE, có 4 slot: slot 1 (Thương hiệu A, Nước hoa X, AVAILABLE), slot 2 (Thương hiệu B, Nước hoa Y, AVAILABLE), slot 3 (UNAVAILABLE), slot 4 (chưa gắn chai),  
    When màn hình Kiosk tải danh mục sản phẩm,  
    Then Kiosk chỉ hiển thị sản phẩm của slot 1 và slot 2 kèm logo/tên thương hiệu A và B tương ứng.
  * **AC2:** Given slot 3 đang `UNAVAILABLE` (hết nước hoa hoặc bảo trì),  
    When khách xem Kiosk,  
    Then slot 3 không thể được bấm chọn để thanh toán (hiển thị mờ hoặc có nhãn "Tạm hết").
* **Test:** `test_FR_ORD_01_kiosk_display_available_products`

---

## FR-ORD-02 — Hiển thị thông tin chi tiết sản phẩm khi chọn slot
* **Statement:** Hệ thống phải hiển thị tên, mô tả, hình ảnh, tầng hương và giá của sản phẩm khi khách chọn một slot.
* **Traces:** BR-001 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given khách hàng chạm chọn một slot khả dụng trên Kiosk,  
    When màn hình chi tiết mở ra,  
    Then hiển thị đầy đủ: tên nước hoa, hình ảnh chất lượng cao, mô tả mùi hương, các nốt hương (hương đầu, hương giữa, hương cuối), và giá tiền một lượt xịt (VND).
  * **AC2 (Hiệu năng):** Given khách thao tác chạm trên Kiosk,  
    When đo thời gian phản hồi,  
    Then màn hình chi tiết hiển thị trong vòng `<= 500ms` (`KIOSK_SELECT_RESPONSE_MAX_MS = 500`).
* **Test:** `test_FR_ORD_02_kiosk_display_product_details`

---

## FR-ORD-03 — Lọc danh mục Kiosk theo thương hiệu
* **Statement:** Hệ thống phải cho phép khách lọc danh mục trên kiosk theo thương hiệu.
* **Traces:** BR-001 · **Priority:** S
* **Acceptance criteria:**
  * **AC1:** Given máy `M` có các slot của nhiều thương hiệu khác nhau,  
    When khách hàng chạm vào tên/logo của Thương hiệu A trong thanh lọc,  
    Then màn hình Kiosk chỉ lọc và hiển thị các slot thuộc Thương hiệu A.
  * **AC2:** When khách chọn lại "Tất cả",  
    Then Kiosk hiển thị lại đầy đủ sản phẩm của toàn bộ các thương hiệu trên máy.
* **Test:** `test_FR_ORD_03_kiosk_filter_by_brand`

---

## FR-ORD-04 — Điều kiện tiên quyết để tạo đơn hàng
* **Statement:** Hệ thống phải chỉ cho phép tạo đơn khi máy ở trạng thái ONLINE và slot được chọn ở trạng thái AVAILABLE.
* **Traces:** BR-001, BR-002 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given máy `M` đang ở trạng thái kết nối `ONLINE`, chế độ `NORMAL`, và slot `S` ở trạng thái `AVAILABLE`,  
    When khách hàng bấm xác nhận tạo đơn trải nghiệm,  
    Then hệ thống tạo đơn hàng thành công và chuyển sang `PENDING_PAYMENT`.
  * **AC2 (Máy mất kết nối):** Given máy `M` đang ở trạng thái `OFFLINE` hoặc `UNSTABLE`,  
    When gửi yêu cầu tạo đơn,  
    Then hệ thống từ chối với HTTP 409 `MACHINE_OFFLINE`.
  * **AC3 (Máy bảo trì):** Given máy `M` đang ở chế độ `MAINTENANCE` hoặc `DISABLED`,  
    When gửi yêu cầu tạo đơn,  
    Then hệ thống từ chối với HTTP 409 `MACHINE_IN_MAINTENANCE`.
  * **AC4 (Slot không sẵn sàng):** Given slot `S` đang ở trạng thái `UNAVAILABLE`,  
    When gửi yêu cầu tạo đơn,  
    Then hệ thống từ chối với HTTP 409 `SLOT_UNAVAILABLE`.
* **Test:** `test_FR_ORD_04_validate_machine_and_slot_prerequisites`

---

## FR-ORD-05 — Chụp nhanh (Snapshot) dữ liệu vào đơn hàng
* **Statement:** Hệ thống phải lưu định danh máy, slot, hợp đồng thuê, thương hiệu, sản phẩm, giá, loại tiền và chủ sở hữu doanh thu vào đơn hàng tại thời điểm tạo đơn.
* **Traces:** BR-002, BR-008, BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given yêu cầu tạo đơn hàng hợp lệ,  
    When bản ghi `Order` được tạo,  
    Then hệ thống snapshot lưu trữ cố định: `machine_id`, `slot_id`, `slot_rental_id`, `brand_id`, `product_id`, `price`, `currency` (mặc định `'VND'`), và `revenue_owner` (`'BRAND'` hoặc `'PLATFORM'`).
  * **AC2:** Given thiếu bất kỳ trường nào trong danh sách trên,  
    When thực thi INSERT,  
    Then CSDL từ chối do vi phạm ràng buộc toàn vẹn dữ liệu.
* **Test:** `test_FR_ORD_05_snapshot_order_metadata`

---

## FR-ORD-06 — Bất biến giá của đơn hàng
* **Statement:** Hệ thống phải giữ nguyên giá đã lưu trong đơn hàng kể cả khi giá slot thay đổi sau đó.
* **Traces:** BR-002 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given đơn hàng `O` đã tạo với giá `25,000 VND` trên slot `S`,  
    When Brand Admin cập nhật giá của slot `S` lên `30,000 VND`,  
    Then số tiền cần thanh toán trong đơn hàng `O` vẫn giữ nguyên là `25,000 VND`.
  * **AC2:** When đơn hàng `O` được thanh toán,  
    Then hệ thống đối soát theo đúng giá trị `25,000 VND` đã snapshot.
* **Test:** `test_FR_ORD_06_order_price_immutability`

---

## FR-ORD-07 — Sinh mã tham chiếu đơn hàng duy nhất
* **Statement:** Hệ thống phải sinh cho mỗi đơn hàng một mã tham chiếu duy nhất trên toàn hệ thống.
* **Traces:** BR-002, BR-008 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** When tạo đơn hàng mới,  
    Then hệ thống tự động sinh thuộc tính `order_code` duy nhất trên toàn hệ thống (định dạng `ORD-YYYYMMDD-XXXXXX`).
  * **AC2 (Đồng thời - Concurrency):** Given nhiều yêu cầu tạo đơn đến đồng thời trong cùng một thời điểm,  
    Then các mã `order_code` được sinh ra là duy nhất và không bị xung đột nhờ ràng buộc UNIQUE trong CSDL.
* **Test:** `test_FR_ORD_07_generate_unique_order_code`

---

## FR-ORD-08 — Sinh mã QR thanh toán
* **Statement:** Hệ thống phải sinh mã QR thanh toán tương ứng với mã tham chiếu của đơn hàng.
* **Traces:** BR-001 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given đơn hàng `O` có mã tham chiếu `order_code` và số tiền `price`,  
    When đơn hàng chuyển sang `PENDING_PAYMENT`,  
    Then hệ thống gọi API cổng thanh toán tạo payload mã QR thanh toán động chứa chính xác mã tham chiếu và số tiền của `O`.
  * **AC2:** When Kiosk nhận được payload,  
    Then Kiosk hiển thị mã QR rõ nét kèm số tiền và đồng hồ đếm ngược thời gian thanh toán.
* **Test:** `test_FR_ORD_08_generate_payment_qr`

---

## FR-ORD-09 — Thời hạn thanh toán của đơn hàng (TTL)
* **Statement:** Hệ thống phải gán cho mỗi đơn hàng một thời hạn thanh toán mặc định 5 phút, có thể cấu hình.
* **Traces:** BR-002 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given cấu hình `ORDER_PAYMENT_TTL_SEC = 300` (5 phút),  
    When đơn hàng `O` được tạo tại thời điểm `t0`,  
    Then thời hạn hết hạn thanh toán của đơn hàng được gán là `expires_at = t0 + 300 giây`.
  * **AC2:** Given giá trị `ORDER_PAYMENT_TTL_SEC` được điều chỉnh trong file cấu hình thành `180` giây,  
    When tạo đơn hàng mới tiếp theo,  
    Then đơn hàng mới nhận thời hạn thanh toán là `t0 + 180 giây`.
* **Test:** `test_FR_ORD_09_order_payment_ttl`

---

## FR-ORD-10 — Quản lý vòng đời trạng thái đơn hàng
* **Statement:** Hệ thống phải quản lý trạng thái đơn hàng theo tập: CREATED, PENDING_PAYMENT, PAID, DISPENSE_REQUESTED, DISPENSED, FAILED, EXPIRED, REFUND_PENDING, REFUNDED.
* **Traces:** BR-002, BR-008 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given đơn hàng ở `PENDING_PAYMENT`, khi thanh toán thành công, chuyển sang `PAID`.
  * **AC2:** Given đơn hàng ở `PAID`, khi gửi lệnh xịt qua MQTT đến thiết bị, chuyển sang `DISPENSE_REQUESTED`.
  * **AC3:** Given đơn hàng ở `DISPENSE_REQUESTED`, khi thiết bị trả kết quả xịt thành công, chuyển sang `DISPENSED`.
  * **AC4:** Given đơn hàng ở `DISPENSE_REQUESTED`, khi thiết bị báo lỗi hoặc timeout không phản hồi, chuyển sang `FAILED` và cắm cờ kiểm tra thủ công / chuyển `REFUND_PENDING`.
* **Test:** `test_FR_ORD_10_order_status_lifecycle`

---

## FR-ORD-11 — Cập nhật trạng thái thanh toán lên Kiosk trong vòng 3 giây
* **Statement:** Hệ thống phải hiển thị trạng thái thanh toán trên kiosk và cập nhật trong vòng 3 giây kể từ khi trạng thái thay đổi.
* **Traces:** BR-001 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given đơn hàng đang hiển thị mã QR trên Kiosk,  
    When backend tiếp nhận thanh toán thành công và chuyển trạng thái đơn hàng sang `PAID` tại thời điểm `t`,  
    Then màn hình Kiosk cập nhật giao diện sang trạng thái "Đã thanh toán thành công" trước thời điểm `t + 3 giây` (`ORDER_STATUS_POLL_MAX_SEC = 3`).
  * **AC2:** Given kết nối thời gian thực (WebSocket hoặc Polling 1s),  
    When backend phát sự kiện thay đổi trạng thái,  
    Then màn hình Kiosk chuyển tiếp mượt mà sang bước hướng dẫn đặt tay/que thử để chuẩn bị nhận lượt xịt.
* **Test:** `test_FR_ORD_11_kiosk_payment_status_latency`

---

## FR-ORD-12 — Tiếp nhận webhook thanh toán từ nhà cung cấp
* **Statement:** Hệ thống phải tiếp nhận thông báo kết quả thanh toán từ nhà cung cấp qua webhook.
* **Traces:** BR-002 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given cổng thanh toán gửi HTTP POST request đến endpoint webhook `/api/v1/payments/webhook`,  
    When request có payload JSON hợp lệ,  
    Then hệ thống tiếp nhận payload, kích hoạt quy trình xử lý và phản hồi HTTP 200/204 cho cổng thanh toán.
  * **AC2:** Given request gửi đến endpoint webhook bị lỗi định dạng hoặc không thể phân giải JSON,  
    When tiếp nhận,  
    Then hệ thống phản hồi HTTP 400 và ghi log cảnh báo.
* **Test:** `test_FR_ORD_12_receive_payment_webhook`

---

## FR-ORD-13 — Xác minh chữ ký số của webhook
* **Statement:** Hệ thống phải xác minh chữ ký của mỗi webhook trước khi xử lý và từ chối webhook có chữ ký không hợp lệ.
* **Traces:** BR-002 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given webhook gửi kèm chữ ký số HMAC-SHA256 trong header/body khớp với chữ ký backend tính toán từ webhook secret key,  
    When backend kiểm tra chữ ký,  
    Then chữ ký được xác nhận hợp lệ và tiếp tục tiến trình xử lý đơn hàng.
  * **AC2 (Chữ ký giả mạo/không hợp lệ):** Given webhook có chữ ký bị sai lệch, thiếu chữ ký hoặc giả mạo,  
    When backend kiểm tra chữ ký,  
    Then hệ thống từ chối ngay lập tức với HTTP 401 `INVALID_WEBHOOK_SIGNATURE`, hủy xử lý và ghi AuditLog cảnh báo bảo mật.
* **Test:** `test_FR_ORD_13_verify_webhook_signature`

---

## FR-ORD-14 — Xác minh khớp mã tham chiếu, số tiền và loại tiền
* **Statement:** Hệ thống phải xác minh mã tham chiếu, số tiền và loại tiền trong webhook khớp với đơn hàng tương ứng.
* **Traces:** BR-002 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given webhook có `order_code = "ORD-001"`, `amount = 25000`, `currency = "VND"`, khớp hoàn toàn với đơn hàng trong CSDL,  
    When đối soát thông tin,  
    Then hệ thống xác nhận dữ liệu chính xác và cho phép chuyển đơn hàng sang `PAID`.
  * **AC2 (Sai lệch số tiền):** Given webhook có `amount = 20000` nhưng đơn hàng yêu cầu `25000`,  
    When đối soát thông tin,  
    Then hệ thống từ chối cập nhật `PAID`, trả về HTTP 400 `AMOUNT_MISMATCH`, và đánh dấu đơn hàng cần kiểm tra thủ công.
  * **AC3 (Không tìm thấy đơn hàng):** Given `order_code` trong webhook không tồn tại trong hệ thống,  
    When xử lý,  
    Then hệ thống trả về HTTP 404 và không thay đổi trạng thái dữ liệu.
* **Test:** `test_FR_ORD_14_verify_webhook_amount_and_reference`

---

## FR-ORD-15 — Xử lý Webhook Idempotent (Chống xử lý lặp)
* **Statement:** Hệ thống phải bảo đảm mỗi webhook chỉ được xử lý đúng một lần, kể cả khi nhà cung cấp gửi lại nhiều lần.
* **Traces:** BR-002 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given đơn hàng `O` đang ở trạng thái `PENDING_PAYMENT`,  
    When webhook thanh toán hợp lệ đến lần đầu tiên,  
    Then đơn hàng chuyển sang `PAID` và kích hoạt tạo lệnh xịt.
  * **AC2 (Gửi lặp - Idempotent):** Given cổng thanh toán gửi lại đúng webhook đó lần thứ 2 (cùng transaction_id hoặc order_code),  
    When backend tiếp nhận,  
    Then hệ thống nhận diện giao dịch đã được xử lý trước đó, không thực hiện trừ kho hay tạo thêm lệnh xịt lần thứ hai, và trả về HTTP 200 với mã `WEBHOOK_ALREADY_PROCESSED`.
  * **AC3 (Đồng thời - Race Condition):** Given hai webhook trùng lặp gửi đến hệ thống cùng một thời điểm,  
    Then nhờ cơ chế khóa hoặc unique transaction constraint, đúng một luồng xử lý chuyển trạng thái đơn hàng, luồng còn lại nhận kết quả `WEBHOOK_ALREADY_PROCESSED`.
* **Test:** `test_FR_ORD_15_webhook_idempotent`

---

## FR-ORD-16 — Hết hạn đơn hàng khi quá thời hạn thanh toán
* **Statement:** Hệ thống phải chuyển đơn hàng sang trạng thái EXPIRED khi quá thời hạn thanh toán mà chưa nhận được xác nhận.
* **Traces:** BR-002 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given đơn hàng `O` đang `PENDING_PAYMENT` có `expires_at < CurrentTimestamp` và chưa có xác nhận thanh toán,  
    When job quét quá hạn chạy hoặc khi Kiosk kiểm tra trạng thái đơn,  
    Then đơn hàng `O` chuyển sang trạng thái `EXPIRED`.
  * **AC2:** Given đơn hàng đã chuyển `EXPIRED`,  
    When Kiosk hiển thị,  
    Then Kiosk đóng mã QR và hiển thị thông báo "Đơn hàng đã hết hạn thanh toán, vui lòng thực hiện lại".
  * **AC3 (Ca biên - Webhook đến muộn sau khi EXPIRED):** Given đơn hàng đã chuyển sang `EXPIRED` nhưng sau đó webhook thanh toán thành công mới đến,  
    When webhook được tiếp nhận,  
    Then hệ thống không kích hoạt xịt tự động mà chuyển đơn hàng sang `REFUND_PENDING` / cắm cờ kiểm tra thủ công để hoàn tiền cho khách.
* **Test:** `test_FR_ORD_16_order_expiration_timeout`

---

## FR-ORD-17 — Từ chối tạo lệnh xịt từ đơn hàng không hợp lệ
* **Statement:** Hệ thống phải từ chối tạo lệnh xịt từ đơn hàng ở trạng thái FAILED, EXPIRED hoặc REFUNDED.
* **Traces:** BR-002 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given đơn hàng `O` đang ở trạng thái `FAILED`, `EXPIRED`, hoặc `REFUNDED`,  
    When có bất kỳ yêu cầu nào cố gắng tạo lệnh xịt cho đơn hàng `O`,  
    Then hệ thống từ chối ngay lập tức và không phát sinh bất kỳ lệnh xịt nào trên MQTT.
  * **AC2 (Chống xịt trùng):** Given đơn hàng `O` đã ở trạng thái `DISPENSED` (đã xịt thành công),  
    When nhận yêu cầu tạo lệnh xịt lần nữa,  
    Then hệ thống từ chối tuyệt đối (bảo đảm BR-002: 0 trường hợp xịt trùng).
* **Test:** `test_FR_ORD_17_reject_dispense_for_invalid_order_status`

---

## FR-ORD-18 — Lưu vết toàn bộ lịch sử chuyển trạng thái đơn hàng
* **Statement:** Hệ thống phải lưu toàn bộ lịch sử chuyển trạng thái của đơn hàng kèm thời điểm và nguyên nhân.
* **Traces:** BR-008 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given đơn hàng `O` trải qua các trạng thái từ `CREATED -> PENDING_PAYMENT -> PAID -> DISPENSE_REQUESTED -> DISPENSED`,  
    When truy vấn bảng `OrderStatusHistory`,  
    Then tồn tại chính xác 5 bản ghi lưu vết tương ứng, mỗi bản ghi ghi nhận: `order_id`, `from_status`, `to_status`, `reason`, và `created_at`.
  * **AC2:** Given đơn hàng chuyển sang `FAILED` do lỗi thiết bị hoặc timeout,  
    When ghi vết lịch sử,  
    Then cột `reason` bắt buộc phải lưu mã lỗi cụ thể (ví dụ: `ACTUATOR_FAULT`, `HARD_TIMEOUT`, `DOOR_OPEN`).
* **Test:** `test_FR_ORD_18_order_status_history_trail`

---

## FR-ORD-19 — Đánh dấu đơn hàng cần kiểm tra thủ công khi xịt thất bại
* **Statement:** Hệ thống phải đánh dấu đơn hàng cần kiểm tra thủ công khi thanh toán thành công nhưng lượt xịt thất bại hoặc không xác định.
* **Traces:** BR-002, BR-006 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given đơn hàng `O` đã thanh toán (`PAID`), lệnh xịt được gửi đi nhưng thiết bị báo lỗi (`FAILED`) hoặc quá `DISPENSE_RESULT_TIMEOUT_SEC = 60` không có phản hồi (`UNKNOWN`),  
    When hệ thống xử lý kết quả,  
    Then đơn hàng `O` chuyển sang trạng thái `FAILED`, được đánh dấu cờ `needs_manual_review = TRUE` (hoặc chuyển `REFUND_PENDING`), và sinh cảnh báo Alert gửi đến Operations Staff.
  * **AC2 (Không tự xịt lại):** Given đơn hàng rơi vào trạng thái xịt thất bại hoặc không xác định,  
    When hệ thống xử lý,  
    Then tuyệt đối không tự động sinh lệnh xịt thứ hai (bảo đảm an toàn theo BR-002).
* **Test:** `test_FR_ORD_19_flag_order_for_manual_review_on_dispense_failure`

---

## FR-ORD-20 — Khởi tạo quy trình hoàn tiền cho đơn hàng cần kiểm tra
* **Statement:** Hệ thống phải cho phép Operations Staff khởi tạo quy trình hoàn tiền cho đơn hàng cần kiểm tra thủ công.
* **Traces:** BR-002 · **Priority:** S
* **Acceptance criteria:**
  * **AC1:** Given người dùng là Operations Staff đã xác thực lại mật khẩu (`REAUTH_REQUIRED`), đơn hàng `O` đang ở trạng thái `REFUND_PENDING` hoặc có cờ `needs_manual_review = TRUE`,  
    When bấm nút xác nhận hoàn tiền kèm lý do bắt buộc,  
    Then trạng thái đơn hàng chuyển sang `REFUNDED`, hệ thống gửi yêu cầu hoàn tiền đến cổng thanh toán, lưu lịch sử và ghi AuditLog.
  * **AC2 (Đơn đã xịt thành công):** Given đơn hàng `O` đang ở trạng thái `DISPENSED` (đã xịt thành công bình thường),  
    When cố gắng thao tác hoàn tiền thông thường,  
    Then hệ thống từ chối với HTTP 409 `ORDER_NOT_REFUNDABLE`.
  * **AC3:** Given người dùng không có vai trò vận hành nền tảng (vd: Brand Admin),  
    When gửi yêu cầu hoàn tiền,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
* **Test:** `test_FR_ORD_20_initiate_refund_process`

---

## FR-ORD-21 — Hiển thị hướng dẫn xử lý sự cố trên Kiosk
* **Statement:** Hệ thống phải hiển thị hướng dẫn xử lý cho khách trên kiosk khi đã thanh toán nhưng lượt xịt thất bại, kèm mã tham chiếu sự cố.
* **Traces:** BR-002 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given đơn hàng đã trừ tiền thành công nhưng lượt xịt gặp sự cố,  
    When backend phát sự kiện lỗi về Kiosk,  
    Then Kiosk hiển thị màn hình thông báo xin lỗi khách hàng, hiển thị rõ ràng:
    * Mã tham chiếu đơn hàng / sự cố (ví dụ: `REF-ORD-00123`)
    * Số điện thoại tổng đài hỗ trợ và mã QR liên hệ Zalo CSKH
    * Thông báo cam kết hoàn tiền tự động hoặc kiểm tra xử lý trong vòng 24 giờ.
  * **AC2:** Given màn hình thông báo sự cố đang mở,  
    When khách chưa tương tác,  
    Then màn hình giữ nguyên không tự động biến mất quá nhanh (chỉ đóng khi khách chạm "Hoàn tất" hoặc sau thời gian idle timeout an toàn).
* **Test:** `test_FR_ORD_21_kiosk_error_guidance_display`

---

## FR-ORD-22 — Tìm kiếm và lọc giao dịch đa tiêu chí
* **Statement:** Hệ thống phải cho phép tìm kiếm giao dịch theo khoảng thời gian, máy, slot, địa điểm, sản phẩm, mã tham chiếu và trạng thái.
* **Traces:** BR-008 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given Platform Super Admin thực hiện tìm kiếm đơn hàng với bộ lọc đa tiêu chí: `from_date`, `to_date`, `machine_id`, `status = PAID`,  
    When gửi truy vấn,  
    Then hệ thống trả về chính xác danh sách các đơn hàng khớp toàn bộ tiêu chí.
  * **AC2 (Tìm theo mã đơn):** Given tìm kiếm bằng `order_code` chính xác,  
    When gửi truy vấn,  
    Then hệ thống trả về đúng đơn hàng duy nhất đó với thời gian đáp ứng `< 1 giây`.
  * **AC3 (Cô lập dữ liệu BR-012):** Given Brand Admin của thương hiệu `B` tìm kiếm đơn hàng,  
    When API thực thi,  
    Then hệ thống tự động gắn điều kiện lọc `brand_id = B.id`, tuyệt đối không hiển thị giao dịch của các thương hiệu khác.
* **Test:** `test_FR_ORD_22_search_and_filter_orders`

---

## FR-ORD-23 — Đối soát giao dịch nội bộ với nhà cung cấp thanh toán
* **Statement:** Hệ thống phải cho phép đối soát giao dịch nội bộ với dữ liệu từ nhà cung cấp thanh toán và liệt kê các mục lệch.
* **Traces:** BR-008, BR-009 · **Priority:** S
* **Acceptance criteria:**
  * **AC1:** Given Operations Staff tải file sao kê đối soát từ cổng thanh toán cho ngày `D`,  
    When hệ thống chạy tiến trình đối soát tự động,  
    Then hệ thống so khớp từng giao dịch theo `transaction_id`, `order_code`, số tiền và trạng thái giữa dữ liệu đối tác và dữ liệu bảng `Order` nội bộ.
  * **AC2:** Given phát hiện trường hợp lệch (tiền đã trừ bên cổng thanh toán nhưng đơn hàng nội bộ là `EXPIRED`, hoặc số tiền không khớp),  
    When tiến trình đối soát kết thúc,  
    Then hệ thống lập danh sách chênh lệch (discrepancy report) và gửi cảnh báo để bộ phận vận hành xử lý hoàn tiền hoặc đối soát thủ công.
* **Test:** `test_FR_ORD_23_payment_reconciliation_audit`
