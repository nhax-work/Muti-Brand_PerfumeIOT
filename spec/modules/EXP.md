# FR-EXP — Ân hạn, gia hạn và thanh lý

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` mục A7 · 22 FR  
> Trạng thái AC: **hoàn thành**  
> Phụ trách: TV3 / Tài  

Đọc kèm: `spec/glossary.md`, `spec/errors.md`, `spec/constraints.md`

---

## FR-EXP-01 — Thông báo hết hạn trước 7 ngày
* **Statement:** Hệ thống phải thông báo cho Brand Admin khi hợp đồng còn 7 ngày là hết hạn, kèm lời mời gia hạn.
* **Traces:** BR-009, BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given hợp đồng `H` có `end_date = CurrentDate + 7 ngày` (`RENTAL_EXPIRING_DAYS = 7`) và đang ở trạng thái `ACTIVE`,  
    When job kiểm tra hợp đồng hết hạn hằng ngày thực thi,  
    Then hệ thống gửi thông báo trong ứng dụng và email cho Brand Admin kèm liên kết gia hạn.
  * **AC2 (Ca biên - Ngày không khớp):** Given hợp đồng còn 8 ngày hoặc 6 ngày mới hết hạn,  
    When job hằng ngày thực thi,  
    Then hệ thống không kích hoạt thông báo mốc 7 ngày cho hợp đồng đó.
* **Test:** `test_FR_EXP_01_notify_expiring_7_days`

---

## FR-EXP-02 — Thông báo lần hai trước 3 ngày
* **Statement:** Hệ thống phải thông báo lần hai cho Brand Admin khi hợp đồng còn 3 ngày là hết hạn.
* **Traces:** BR-009, BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given hợp đồng `H` có `end_date = CurrentDate + 3 ngày` (`RENTAL_NOTICE_DAYS = 3`) và chưa được gia hạn,  
    When job hằng ngày thực thi,  
    Then hệ thống gửi thông báo nhắc nhở lần 2 cảnh báo về nguy cơ bước vào thời gian ân hạn có tính phí và thanh lý hàng tồn.
  * **AC2:** Given hợp đồng đã được gia hạn (trạng thái `RENEWED`),  
    When đến mốc 3 ngày trước khi hợp đồng cũ kết thúc,  
    Then hệ thống không gửi thông báo cảnh báo này.
* **Test:** `test_FR_EXP_02_notify_expiring_3_days`

---

## FR-EXP-03 — Gộp thông báo các hợp đồng hết hạn cùng ngày
* **Statement:** Hệ thống phải gộp các hợp đồng của cùng một thương hiệu hết hạn trong cùng ngày thành một thông báo duy nhất liệt kê đầy đủ các slot.
* **Traces:** BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given thương hiệu `B` có 3 hợp đồng trên 3 slot khác nhau cùng hết hạn vào ngày `D`,  
    When job gửi thông báo mốc 7 ngày hoặc 3 ngày chạy,  
    Then Brand Admin của thương hiệu `B` chỉ nhận đúng 1 thông báo tổng hợp liệt kê rõ ràng danh sách cả 3 slot.
  * **AC2:** Given thương hiệu `B1` và `B2` đều có hợp đồng hết hạn vào ngày `D`,  
    When job chạy,  
    Then hệ thống sinh 2 thông báo tách biệt gửi riêng cho từng thương hiệu, không để lộ thông tin của nhau.
* **Test:** `test_FR_EXP_03_consolidate_expiring_notifications`

---

## FR-EXP-04 — Ghi AuditLog khi gửi thông báo hết hạn
* **Statement:** Hệ thống phải ghi nhật ký kiểm toán cho mỗi lần gửi thông báo hết hạn, kèm thời điểm và người nhận.
* **Traces:** BR-008, BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given thông báo hết hạn được gửi thành công cho Brand Admin `U`,  
    When tiến trình gửi hoàn tất,  
    Then một bản ghi AuditLog được tạo với hành động `EXPIRY_NOTICE_SENT`, lưu `recipient_id = U.id`, `rental_id`, timestamp chính xác.
  * **AC2 (Gửi lỗi):** Given việc gửi thông báo gặp lỗi ngoại lệ,  
    When xảy ra lỗi,  
    Then hệ thống ghi AuditLog với trạng thái `FAILED` kèm nội dung lỗi để phục vụ theo dõi vận hành.
* **Test:** `test_FR_EXP_04_audit_expiry_notification`

---

## FR-EXP-05 — Chuyển trạng thái EXPIRING ở mốc 7 ngày
* **Statement:** Hệ thống phải chuyển hợp đồng sang trạng thái EXPIRING khi còn 7 ngày là hết hạn.
* **Traces:** BR-009 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given hợp đồng `H` đang ở trạng thái `ACTIVE` có `end_date <= CurrentDate + 7 ngày`,  
    When job kiểm tra trạng thái quét định kỳ,  
    Then trạng thái hợp đồng `H` tự động chuyển sang `EXPIRING`.
  * **AC2:** Given hợp đồng ở trạng thái `EXPIRING`,  
    When khách hàng trải nghiệm mua xịt trên slot của hợp đồng `H`,  
    Then slot vẫn cho phép tạo đơn và bán hàng bình thường (`revenue_owner = 'BRAND'`).
* **Test:** `test_FR_EXP_05_transition_to_expiring`

---

## FR-EXP-06 — Chuyển sang GRACE khi đến ngày hết hạn mà chưa gia hạn
* **Statement:** Hệ thống phải chuyển hợp đồng sang trạng thái GRACE khi đến ngày hết hạn mà chưa có hợp đồng gia hạn.
* **Traces:** BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given hợp đồng `H` ở trạng thái `EXPIRING` có `end_date < CurrentDate` và chưa có hợp đồng gia hạn nối tiếp,  
    When job chạy lúc 00:00:00 ngày tiếp theo,  
    Then trạng thái hợp đồng `H` chuyển sang `GRACE`.
  * **AC2:** Given hợp đồng `H` đã được gia hạn trước đó (trạng thái `RENEWED`),  
    When đến ngày hết hạn của `H`,  
    Then `H` không chuyển sang `GRACE` mà kích hoạt hợp đồng mới sang `ACTIVE`.
* **Test:** `test_FR_EXP_06_transition_to_grace`

---

## FR-EXP-07 — Cấu hình ngày kết thúc ân hạn cho từng hợp đồng
* **Statement:** Hệ thống phải cho phép Platform Super Admin ấn định ngày kết thúc thời gian ân hạn cho từng hợp đồng.
* **Traces:** BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given người dùng là Platform Super Admin, hợp đồng `H` đang ở trạng thái `GRACE`,  
    When cập nhật ngày `grace_period_end_date` với giá trị hợp lệ (`grace_period_end_date >= CurrentDate`),  
    Then hệ thống lưu ngày kết thúc ân hạn mới và ghi AuditLog.
  * **AC2 (Ca biên - Ngày trong quá khứ):** Given đặt `grace_period_end_date < CurrentDate`,  
    When gửi yêu cầu cập nhật,  
    Then hệ thống từ chối với HTTP 400.
  * **AC3:** Given người dùng là Brand Admin,  
    When gửi yêu cầu thay đổi `grace_period_end_date`,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
* **Test:** `test_FR_EXP_07_set_grace_period_end_date`

---

## FR-EXP-08 — Tiếp tục nhận đơn hàng trong thời gian ân hạn
* **Statement:** Hệ thống phải cho phép slot tiếp tục tiếp nhận đơn hàng trong thời gian ân hạn.
* **Traces:** BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given slot `S` có hợp đồng ở trạng thái `GRACE`, máy `ONLINE`, slot `AVAILABLE`,  
    When khách hàng chọn slot `S` trên kiosk và bấm thanh toán,  
    Then hệ thống cho phép tạo đơn hàng thành công.
  * **AC2:** Given slot `S` có hợp đồng ở trạng thái `GRACE`,  
    When Kiosk tải danh mục sản phẩm,  
    Then sản phẩm của slot `S` vẫn hiển thị ở trạng thái sẵn sàng phục vụ.
* **Test:** `test_FR_EXP_08_slot_accepts_orders_during_grace`

---

## FR-EXP-09 — Doanh thu trong thời gian ân hạn thuộc về thương hiệu
* **Statement:** Hệ thống phải ghi nhận doanh thu phát sinh trong thời gian ân hạn thuộc về thương hiệu.
* **Traces:** BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given slot `S` có hợp đồng `H` ở trạng thái `GRACE` của thương hiệu `B`,  
    When đơn hàng `O` được tạo trên slot `S` trong thời gian ân hạn này,  
    Then thuộc tính `revenue_owner` của đơn hàng được gán chính xác là `'BRAND'`, và `brand_id = B.id`.
  * **AC2:** When đơn hàng `O` hoàn tất thanh toán thành công,  
    Then doanh thu từ đơn hàng `O` được tính vào tổng doanh thu bán hàng của thương hiệu `B`.
* **Test:** `test_FR_EXP_09_grace_revenue_belongs_to_brand`

---

## FR-EXP-10 — Tính phí lưu kho trong thời gian ân hạn
* **Statement:** Hệ thống phải tính phí lưu kho trong thời gian ân hạn bằng tỷ lệ phần trăm cấu hình được nhân với giá chai và số chai còn tồn của thương hiệu tại slot đó.
* **Traces:** BR-013 · **Priority:** S
* **Acceptance criteria:**
  * **AC1:** Given hợp đồng `H` cấu hình `grace_fee_rate = 0.05` (`GRACE_FEE_RATE_DEFAULT = 0.05`), giá bán lẻ chai nước hoa của sản phẩm là `1,000,000 VND`, số chai tồn của thương hiệu gán cho slot là `2` chai,  
    When hệ thống chạy tác vụ tính phí ân hạn định kỳ theo chu kỳ,  
    Then phí ân hạn phát sinh = `0.05 * 1,000,000 * 2 = 100,000 VND`.
  * **AC2 (Ca biên - Hết tồn kho):** Given số chai tồn tại slot là `0`,  
    When chạy tác vụ tính phí,  
    Then phí lưu kho ân hạn phát sinh là `0 VND`.
* **Test:** `test_FR_EXP_10_calculate_grace_storage_fee`

---

## FR-EXP-11 — Hiển thị phí ân hạn phát sinh cho Brand Admin
* **Statement:** Hệ thống phải hiển thị cho Brand Admin số tiền phí ân hạn đang phát sinh và ngày kết thúc ân hạn.
* **Traces:** BR-013 · **Priority:** S
* **Acceptance criteria:**
  * **AC1:** Given Brand Admin của thương hiệu `B` đăng nhập, slot `S` của thương hiệu đang ở trạng thái `GRACE`,  
    When vào màn hình quản lý hợp đồng/slot,  
    Then giao diện hiển thị rõ ràng: số tiền phí ân hạn lũy kế hiện tại và ngày kết thúc ân hạn (`grace_period_end_date`).
  * **AC2 (Cô lập dữ liệu BR-012):** Given slot của thương hiệu khác cũng đang ở trạng thái `GRACE`,  
    When Brand Admin của `B` xem màn hình,  
    Then tuyệt đối không thấy thông tin phí hay tình trạng ân hạn của thương hiệu khác.
* **Test:** `test_FR_EXP_11_display_grace_fee_to_brand_admin`

---

## FR-EXP-12 — Đưa phí ân hạn vào bảng quyết toán
* **Statement:** Hệ thống phải đưa phí ân hạn đã phát sinh vào bảng quyết toán của kỳ tương ứng.
* **Traces:** BR-009, BR-013 · **Priority:** S
* **Acceptance criteria:**
  * **AC1:** Given hợp đồng `H` phát sinh tổng phí ân hạn là `450,000 VND` trong kỳ quyết toán `K`,  
    When tạo bảng quyết toán kỳ `K`,  
    Then dòng chi tiết của hợp đồng `H` ghi nhận cột `grace_fee = 450,000 VND`, được tính vào tổng các khoản khấu trừ của thương hiệu.
  * **AC2:** Given hợp đồng không bước vào giai đoạn ân hạn,  
    When quyết toán,  
    Then cột `grace_fee` hiển thị là `0 VND`.
* **Test:** `test_FR_EXP_12_include_grace_fee_in_settlement`

---

## FR-EXP-13 — Chuyển sang RENEWED và dừng tính phí khi gia hạn thành công
* **Statement:** Hệ thống phải chuyển hợp đồng sang trạng thái RENEWED và dừng tính phí ân hạn khi thương hiệu gia hạn thành công.
* **Traces:** BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given hợp đồng `H` đang ở trạng thái `GRACE` (đang tích lũy phí ân hạn),  
    When Platform Super Admin tạo thành công hợp đồng gia hạn mới nối tiếp `H`,  
    Then hợp đồng `H` chuyển sang trạng thái `RENEWED`, việc tính phí ân hạn dừng lại ngay lập tức tại thời điểm đó.
  * **AC2:** Given hợp đồng `H` đã chuyển `RENEWED`,  
    When tiến trình tính phí lưu kho chạy vào các ngày kế tiếp,  
    Then không cộng thêm bất kỳ khoản phí ân hạn nào cho hợp đồng `H`.
* **Test:** `test_FR_EXP_13_transition_to_renewed_stops_grace_fee`

---

## FR-EXP-14 — Chuyển sang LIQUIDATED khi hết hạn ân hạn
* **Statement:** Hệ thống phải chuyển hợp đồng sang trạng thái LIQUIDATED khi hết thời gian ân hạn mà chưa gia hạn.
* **Traces:** BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given hợp đồng `H` đang ở `GRACE` có `CurrentDate > grace_period_end_date` và chưa có hợp đồng gia hạn,  
    When job quét hằng ngày thực thi,  
    Then hợp đồng `H` tự động chuyển sang trạng thái `LIQUIDATED`.
  * **AC2:** Given hợp đồng `H` đã chuyển sang `RENEWED` trước khi hết ân hạn,  
    When đến sau ngày `grace_period_end_date`,  
    Then hợp đồng `H` giữ nguyên `RENEWED`, không chuyển sang `LIQUIDATED`.
* **Test:** `test_FR_EXP_14_transition_to_liquidated_on_grace_expiry`

---

## FR-EXP-15 — Chuyển quyền sở hữu chai tồn sang nền tảng
* **Statement:** Hệ thống phải chuyển quyền sở hữu toàn bộ chai còn tồn của thương hiệu tại slot đó sang nền tảng khi hợp đồng chuyển sang LIQUIDATED.
* **Traces:** BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given hợp đồng `H` trên slot `S` chuyển sang `LIQUIDATED`, các chai nước hoa đang lắp trên slot `S` và chai dự phòng tại slot `S` có `owner = 'BRAND'`,  
    When sự kiện LIQUIDATED hoàn tất cập nhật,  
    Then toàn bộ các chai này được đổi thuộc tính `owner = 'PLATFORM'`, trạng thái chai chuyển thành `LIQUIDATED`.
  * **AC2 (Bảo vệ tài sản các slot khác):** Given các chai nước hoa khác của thương hiệu đang nằm ở các slot khác hoặc trong kho tổng chưa gán cho slot `S`,  
    When slot `S` bị thanh lý,  
    Then quyền sở hữu các chai đó vẫn giữ nguyên `'BRAND'`, không bị ảnh hưởng.
* **Test:** `test_FR_EXP_15_transfer_bottle_ownership_to_platform`

---

## FR-EXP-16 — Lưu lịch sử thanh lý cho từng chai nước hoa
* **Statement:** Hệ thống phải ghi nhận thời điểm thanh lý và hợp đồng nguồn cho mỗi chai bị thanh lý.
* **Traces:** BR-008, BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given chai `B` bị thanh lý khi hợp đồng `H` chuyển sang `LIQUIDATED`,  
    When thực hiện chuyển đổi quyền sở hữu,  
    Then bản ghi chai `B` lưu `liquidated_at = CurrentTimestamp` và `source_rental_id = H.id`.
  * **AC2:** Given truy vấn kiểm toán chai `B`,  
    When xem chi tiết lịch sử chai,  
    Then hệ thống thể hiện rõ nguồn gốc thương hiệu ban đầu, hợp đồng chuyển giao và ngày thanh lý.
* **Test:** `test_FR_EXP_16_record_liquidation_audit_trail`

---

## FR-EXP-17 — Slot tiếp tục bán hàng tồn sau khi thanh lý
* **Statement:** Hệ thống phải cho phép slot tiếp tục tiếp nhận đơn hàng sau khi thanh lý, bán hàng tồn thuộc sở hữu nền tảng.
* **Traces:** BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given slot `S` có hợp đồng ở trạng thái `LIQUIDATED`, chai nước hoa trong slot còn dung lượng (> 0), máy ONLINE, slot AVAILABLE,  
    When khách hàng tạo đơn và thanh toán trên slot `S`,  
    Then đơn hàng được chấp nhận xử lý, hệ thống kích hoạt lệnh xịt như bình thường.
  * **AC2 (Ca biên - Chai đã cạn):** Given slot `S` có hợp đồng `LIQUIDATED` nhưng chai nước hoa đã `EMPTY`,  
    When khách hàng chọn slot `S`,  
    Then hệ thống báo slot không khả dụng (`SLOT_UNAVAILABLE`).
* **Test:** `test_FR_EXP_17_slot_operates_during_liquidation`

---

## FR-EXP-18 — Đặt giá lượt xịt cho slot đang bán hàng thanh lý
* **Statement:** Hệ thống phải cho phép Platform Super Admin đặt giá lượt xịt cho slot đang bán hàng thanh lý.
* **Traces:** BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given hợp đồng trên slot `S` đang ở trạng thái `LIQUIDATED`, Platform Super Admin đặt giá mới `P_liq > 0` cho slot `S`,  
    When gửi yêu cầu cập nhật,  
    Then hệ thống cập nhật giá mới cho slot `S` và ghi AuditLog.
  * **AC2:** Given Brand Admin của thương hiệu cũ cố gắng đổi giá trên slot `S` đang `LIQUIDATED`,  
    When gửi yêu cầu,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
* **Test:** `test_FR_EXP_18_platform_admin_sets_liquidation_price`

---

## FR-EXP-19 — Thông báo thanh lý cho Brand Admin
* **Statement:** Hệ thống phải thông báo cho Brand Admin khi hàng tồn của họ bị thanh lý, kèm danh sách chai và khối lượng còn lại.
* **Traces:** BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given hợp đồng `H` chuyển sang trạng thái `LIQUIDATED`,  
    When tiến trình thanh lý hoàn tất,  
    Then hệ thống tự động gửi thông báo đến Brand Admin sở hữu hợp đồng, kèm danh sách chi tiết các mã chai, tên sản phẩm và khối lượng/dung tích còn lại tại thời điểm thanh lý.
  * **AC2:** Given thông báo được gửi,  
    When kiểm tra AuditLog,  
    Then ghi nhận hành động `LIQUIDATION_NOTICE_SENT` kèm danh sách chai chi tiết.
* **Test:** `test_FR_EXP_19_notify_brand_admin_on_liquidation`

---

## FR-EXP-20 — Chấm dứt quyền truy cập dữ liệu sau thanh lý
* **Statement:** Hệ thống phải chấm dứt quyền truy cập của thương hiệu tới dữ liệu giao dịch phát sinh sau thời điểm thanh lý trên slot đó.
* **Traces:** BR-012, BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given slot `S` bị thanh lý lúc `T_liq`, đơn hàng `O1` phát sinh trước `T_liq`, đơn hàng `O2` phát sinh sau `T_liq`,  
    When Brand Admin của thương hiệu cũ truy vấn danh sách đơn hàng hoặc báo cáo của slot `S`,  
    Then kết quả chỉ trả về `O1`, hoàn toàn không xuất hiện `O2`.
  * **AC2:** Given Brand Admin gọi trực tiếp API chi tiết đơn hàng `O2` bằng ID,  
    When gửi request,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
* **Test:** `test_FR_EXP_20_revoke_brand_access_to_post_liquidation_orders`

---

## FR-EXP-21 — Ghi AuditLog cho toàn bộ vòng đời ân hạn và thanh lý
* **Statement:** Hệ thống phải ghi nhật ký kiểm toán cho mọi sự kiện chuyển sang ân hạn, gia hạn, thanh lý và đóng hợp đồng.
* **Traces:** BR-008 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given hợp đồng chuyển trạng thái sang `GRACE`, `RENEWED`, `LIQUIDATED` hoặc `CLOSED` (bằng scheduler tự động hoặc qua API của Admin),  
    When sự kiện chuyển trạng thái diễn ra,  
    Then hệ thống tự động tạo bản ghi mới vào bảng `AuditLog` ghi nhận `actor_id`, `action`, `entity_type = 'SlotRental'`, `entity_id`, `before_state`, `after_state` và timestamp.
  * **AC2:** Given bảng `AuditLog`,  
    When có thao tác UPDATE hoặc DELETE bất kỳ,  
    Then CSDL chặn lại (nguyên tắc append-only).
* **Test:** `test_FR_EXP_21_audit_all_expiry_lifecycle_events`

---

## FR-EXP-22 — Xử lý độc lập giữa các hợp đồng của cùng thương hiệu
* **Statement:** Hệ thống phải áp dụng quy trình ân hạn và thanh lý độc lập cho từng hợp đồng, kể cả khi cùng thương hiệu có nhiều slot trên cùng máy.
* **Traces:** BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given thương hiệu `B` thuê slot 1 (hợp đồng `H1` hết hạn hôm nay) và slot 2 (hợp đồng `H2` còn hạn 30 ngày) trên cùng máy `M`,  
    When `H1` chuyển sang `GRACE` hoặc `LIQUIDATED`,  
    Then `H2` vẫn duy trì trạng thái `ACTIVE` bình thường, không bị áp dụng ân hạn hay thanh lý.
  * **AC2:** Given `H1` bị thanh lý chuyển quyền sở hữu chai ở slot 1 sang PLATFORM,  
    When kiểm tra tài sản ở slot 2,  
    Then chai ở slot 2 vẫn giữ nguyên quyền sở hữu của thương hiệu `B`.
* **Test:** `test_FR_EXP_22_independent_contract_expiry_lifecycle`
