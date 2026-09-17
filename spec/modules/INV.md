# FR-INV — Tồn kho và nạp nước hoa

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` Mục A9 · 31 FR  
> Trạng thái AC: **đã viết** (FR-INV-01÷21 viết tuần 1; FR-INV-22÷31 bổ sung sau)  
> Phụ trách: Hoàng (TV4)  
> Mức chi tiết: AC cho FR có điều kiện; CRUD để dạng phát biểu

Đọc kèm: `spec/glossary.md`, `spec/errors.md`, `spec/constraints.md`

## FR-INV-01 — Tạo lô nước hoa

**Tuyên bố:** Hệ thống phải cho phép Inventory Staff tạo lô nước hoa với thương hiệu sở hữu, sản phẩm, số lô, số lượng, ngày nhập và hạn sử dụng.

**Dấu vết:** BR-005 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho Inventory Staff có quyền quản lý tồn kho, Khi tạo một lô và cung cấp đầy đủ thương hiệu sở hữu, sản phẩm, số lô, số lượng, ngày nhập và hạn sử dụng, Thì hệ thống tạo lô và lưu đầy đủ các thông tin đã cung cấp.
- AC2: Cho dữ liệu tạo lô thiếu một thông tin bắt buộc, Khi Inventory Staff gửi yêu cầu tạo lô, Thì hệ thống từ chối thao tác và không tạo lô không đầy đủ.

**Kiểm tra:** `test_FR_INV_01_create_batch`

## FR-INV-02 — Đăng ký từng chai

**Tuyên bố:** Hệ thống phải cho phép đăng ký từng chai nước hoa với một mã định danh duy nhất.

**Dấu vết:** BR-005 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho một chai chưa được đăng ký, Khi Inventory Staff cung cấp mã định danh hợp lệ, Thì hệ thống tạo bản ghi chai với mã đó.
- AC2: Cho mã định danh đã tồn tại, Khi Inventory Staff đăng ký chai khác với cùng mã, Thì hệ thống từ chối và không tạo chai trùng mã.

**Kiểm tra:** `test_FR_INV_02_register_bottle`

## FR-INV-03 — Chủ sở hữu chai

**Tuyên bố:** Hệ thống phải ghi nhận cho mỗi chai chủ sở hữu là một thương hiệu cụ thể hoặc là nền tảng.

**Dấu vết:** BR-005, BR-013 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho chai mới, Khi ghi nhận chủ sở hữu là một thương hiệu hợp lệ, Thì hệ thống lưu đúng thương hiệu đó.
- AC2: Cho chai được nền tảng sở hữu, Khi ghi nhận chủ sở hữu là PLATFORM, Thì hệ thống lưu chủ sở hữu là nền tảng và không gán chai đó cho thương hiệu khác.

**Kiểm tra:** `test_FR_INV_03_bottle_owner`

## FR-INV-04 — Trạng thái chai

**Tuyên bố:** Hệ thống phải quản lý trạng thái chai theo tập: IN_STOCK, INSTALLED, LOW, EMPTY, DAMAGED, EXPIRED, LIQUIDATED.

**Dấu vết:** BR-005, BR-013 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho một chai trong hệ thống, Khi trạng thái được cập nhật theo nghiệp vụ hợp lệ, Thì hệ thống chỉ lưu một giá trị thuộc tập trạng thái đã quy định.
- AC2: Cho một giá trị trạng thái ngoài tập đã quy định, Khi yêu cầu cập nhật trạng thái, Thì hệ thống từ chối giá trị đó.

**Kiểm tra:** `test_FR_INV_04_bottle_status`

## FR-INV-05 — Khối lượng ban đầu

**Tuyên bố:** Hệ thống phải ghi nhận khối lượng ban đầu của chai tại thời điểm lắp vào slot.

**Dấu vết:** BR-005 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho chai được lắp vào slot, Khi Inventory Staff hoàn tất thao tác lắp và cung cấp số đo khối lượng, Thì hệ thống lưu khối lượng ban đầu của chai.
- AC2: Cho thao tác lắp chai không có số đo khối lượng ban đầu, Khi Inventory Staff hoàn tất thao tác, Thì hệ thống không ghi nhận phiên lắp thành công.

**Kiểm tra:** `test_FR_INV_05_initial_weight`

## FR-INV-06 — Kiểm tra quyền sở hữu khi gán slot

**Tuyên bố:** Hệ thống phải từ chối gán vào slot chai thuộc thương hiệu không có hợp đồng thuê slot đó.

**Dấu vết:** BR-003, BR-012 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho slot có hợp đồng hiệu lực của Brand A và chai thuộc Brand A, Khi Inventory Staff gán chai vào slot, Thì hệ thống cho phép thao tác.
- AC2: Cho slot có hợp đồng hiệu lực của Brand A và chai thuộc Brand B, Khi Inventory Staff gán chai vào slot, Thì hệ thống từ chối thao tác.

**Kiểm tra:** `test_FR_INV_06_owner_contract`

## FR-INV-07 — Kiểm tra sản phẩm khi gán chai

**Tuyên bố:** Hệ thống phải cảnh báo khi Inventory Staff gán chai có sản phẩm không khớp với sản phẩm cấu hình cho slot.

**Dấu vết:** BR-005 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho chai có sản phẩm trùng sản phẩm cấu hình của slot, Khi Inventory Staff gán chai, Thì hệ thống cho phép tiếp tục thao tác mà không sinh cảnh báo không khớp.
- AC2: Cho chai có sản phẩm khác sản phẩm cấu hình của slot, Khi Inventory Staff gán chai, Thì hệ thống sinh cảnh báo không khớp.

**Kiểm tra:** `test_FR_INV_07_product_mismatch`

## FR-INV-08 — Từ chối chai hết hạn

**Tuyên bố:** Hệ thống phải từ chối gán chai đã quá hạn sử dụng vào slot.

**Dấu vết:** BR-005 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho chai còn hạn sử dụng, Khi Inventory Staff gán chai vào slot hợp lệ, Thì hệ thống không từ chối vì lý do hết hạn.
- AC2: Cho chai đã quá hạn sử dụng, Khi Inventory Staff gán chai vào slot, Thì hệ thống từ chối thao tác.

**Kiểm tra:** `test_FR_INV_08_expired_bottle`

## FR-INV-09 — Ước tính lượng còn lại

**Tuyên bố:** Hệ thống phải ước tính lượng còn lại của mỗi slot dựa trên số lượt xịt thành công và lượng tiêu thụ trung bình đã hiệu chuẩn.

**Dấu vết:** BR-005 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho slot có lượng ban đầu và lượng tiêu thụ trung bình đã hiệu chuẩn, Khi có thêm lượt xịt thành công, Thì hệ thống cập nhật lượng còn lại theo số lượt xịt thành công.
- AC2: Cho lượt xịt thất bại, Khi hệ thống xử lý kết quả lượt xịt, Thì lượt xịt thất bại không được tính vào lượng tiêu thụ ước tính.

**Kiểm tra:** `test_FR_INV_09_estimated_remaining`

## FR-INV-10 — Cập nhật sau lượt xịt

**Tuyên bố:** Hệ thống phải cập nhật lượng còn lại sau mỗi lượt xịt khách hàng hoặc lượt xịt chẩn đoán thành công.

**Dấu vết:** BR-005 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho lượt xịt khách hàng thành công, Khi hệ thống nhận kết quả thành công, Thì lượng còn lại của slot được cập nhật.
- AC2: Cho lượt xịt chẩn đoán thành công, Khi hệ thống nhận kết quả thành công, Thì lượng còn lại cũng được cập nhật.

**Kiểm tra:** `test_FR_INV_10_update_after_dispense`

## FR-INV-11 — Cảnh báo sắp hết

**Tuyên bố:** Hệ thống phải sinh cảnh báo sắp hết khi lượng còn lại xuống dưới ngưỡng đã cấu hình cho slot.

**Dấu vết:** BR-005 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho slot có ngưỡng sắp hết đã cấu hình, Khi lượng còn lại giảm xuống dưới ngưỡng, Thì hệ thống sinh cảnh báo sắp hết.
- AC2: Cho slot có lượng còn lại vẫn bằng hoặc cao hơn ngưỡng, Khi hệ thống cập nhật tồn, Thì hệ thống không sinh cảnh báo sắp hết do điều kiện này.

**Kiểm tra:** `test_FR_INV_11_low_stock_alert`

## FR-INV-12 — Slot không đủ một lượt xịt

**Tuyên bố:** Hệ thống phải chuyển slot sang trạng thái UNAVAILABLE khi lượng còn lại không đủ cho một lượt xịt.

**Dấu vết:** BR-005 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho slot có lượng còn lại nhỏ hơn lượng cần cho một lượt xịt, Khi hệ thống cập nhật tồn, Thì slot chuyển sang UNAVAILABLE.
- AC2: Cho slot có lượng còn lại đủ cho một lượt xịt, Khi hệ thống cập nhật tồn, Thì slot không bị chuyển sang UNAVAILABLE vì lý do thiếu lượng.

**Kiểm tra:** `test_FR_INV_12_slot_unavailable`

## FR-INV-13 — Ghi nhận phiên nạp

**Tuyên bố:** Hệ thống phải lưu cho mỗi phiên nạp: người thực hiện, thời điểm, máy, slot, chai cũ, chai mới và khối lượng đo được trước và sau.

**Dấu vết:** BR-005, BR-008 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho một phiên nạp hoàn tất, Khi Inventory Staff lưu phiên nạp, Thì hệ thống ghi nhận đầy đủ người thực hiện, thời điểm, máy, slot, chai cũ, chai mới và số đo trước/sau.
- AC2: Cho phiên nạp thiếu một trường thông tin bắt buộc, Khi Inventory Staff kết thúc phiên, Thì hệ thống không ghi nhận phiên hoàn tất.

**Kiểm tra:** `test_FR_INV_13_refill_session`

## FR-INV-14 — Checklist nạp nước hoa

**Tuyên bố:** Hệ thống phải cung cấp checklist nạp nước hoa mà Inventory Staff phải hoàn thành trước khi kết thúc phiên nạp.

**Dấu vết:** BR-005 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho Inventory Staff đang thực hiện phiên nạp, Khi mở quy trình nạp, Thì hệ thống cung cấp checklist tương ứng.
- AC2: Cho checklist còn mục chưa hoàn thành, Khi Inventory Staff yêu cầu kết thúc phiên nạp, Thì hệ thống từ chối kết thúc phiên.

**Kiểm tra:** `test_FR_INV_14_refill_checklist`

## FR-INV-15 — Tháo chai về kho

**Tuyên bố:** Hệ thống phải cung cấp quy trình tháo chai khỏi slot và trả về kho, ghi nhận khối lượng còn lại.

**Dấu vết:** BR-005, BR-013 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho chai đang INSTALLED, Khi Inventory Staff thực hiện quy trình tháo chai và cung cấp số đo còn lại, Thì hệ thống ghi nhận chai đã tháo và lượng còn lại.
- AC2: Cho thao tác tháo chai không có số đo còn lại, Khi Inventory Staff hoàn tất, Thì hệ thống không ghi nhận thao tác tháo hoàn chỉnh.

**Kiểm tra:** `test_FR_INV_15_remove_to_stock`

## FR-INV-16 — Điều chỉnh tồn kho

**Tuyên bố:** Hệ thống phải cho phép ghi nhận điều chỉnh tồn kho kèm lý do bắt buộc.

**Dấu vết:** BR-005 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho người có quyền điều chỉnh tồn kho, Khi cung cấp giá trị điều chỉnh và lý do, Thì hệ thống lưu điều chỉnh cùng lý do.
- AC2: Cho yêu cầu điều chỉnh không có lý do, Khi gửi yêu cầu, Thì hệ thống từ chối thao tác.

**Kiểm tra:** `test_FR_INV_16_inventory_adjustment`

## FR-INV-17 — Lịch sử vòng đời chai

**Tuyên bố:** Hệ thống phải lưu lịch sử lắp, nạp, tháo, điều chỉnh, thanh lý và hủy bỏ của từng chai.

**Dấu vết:** BR-005, BR-008 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho chai phát sinh một trong các sự kiện lắp, nạp, tháo, điều chỉnh, thanh lý hoặc hủy bỏ, Khi sự kiện hoàn tất, Thì hệ thống lưu sự kiện vào lịch sử chai.
- AC2: Cho chai chưa phát sinh sự kiện thuộc các loại trên, Khi xem lịch sử, Thì hệ thống không tạo bản ghi giả cho sự kiện chưa xảy ra.

**Kiểm tra:** `test_FR_INV_17_bottle_history`

## FR-INV-18 — Đối chiếu tiêu thụ và load cell

**Tuyên bố:** Hệ thống phải so sánh lượng tiêu thụ tính theo số lượt xịt với số đo từ load cell của cùng slot.

**Dấu vết:** BR-005 · **Ưu tiên:** S

**Tiêu chí xét tuyển**

- AC1: Cho slot có số lượt xịt và dữ liệu load cell trong cùng khoảng thời gian, Khi hệ thống thực hiện đối chiếu, Thì hệ thống tính và hiển thị chênh lệch giữa hai nguồn.
- AC2: Cho slot thiếu một trong hai nguồn dữ liệu, Khi thực hiện đối chiếu, Thì hệ thống không kết luận chênh lệch đầy đủ như khi có đủ hai nguồn.

**Kiểm tra:** `test_FR_INV_18_load_cell_reconciliation`

## FR-INV-19 — Cảnh báo nghi ngờ rò rỉ

**Tuyên bố:** Hệ thống phải sinh cảnh báo nghi ngờ rò rỉ khi khối lượng đo được giảm quá 20% so với lượng tiêu thụ tính theo số lượt xịt trong cùng khoảng thời gian.

**Dấu vết:** BR-005 · **Ưu tiên:** S

**Tiêu chí xét tuyển**

- AC1: Cho cùng một khoảng thời gian có đủ số liệu load cell và số lượt xịt, Khi mức giảm khối lượng vượt quá 20% so với lượng tiêu thụ tính theo lượt xịt, Thì hệ thống sinh cảnh báo nghi ngờ rò rỉ.
- AC2: Cho mức chênh lệch không vượt quá 20%, Khi hệ thống đối chiếu, Thì hệ thống không sinh cảnh báo nghi ngờ rò rỉ theo điều kiện này.

**Kiểm tra:** `test_FR_INV_19_leak_suspected`

## FR-INV-20 — Lô sắp hết hạn

**Tuyên bố:** Hệ thống phải sinh cảnh báo khi lô nước hoa còn dưới 30 ngày là hết hạn.

**Dấu vết:** BR-005 · **Ưu tiên:** S

**Tiêu chí xét tuyển**

- AC1: Cho lô còn dưới 30 ngày đến hạn sử dụng, Khi hệ thống kiểm tra hạn, Thì hệ thống sinh cảnh báo.
- AC2: Cho lô còn từ 30 ngày trở lên đến hạn sử dụng, Khi hệ thống kiểm tra hạn, Thì hệ thống không sinh cảnh báo theo điều kiện dưới 30 ngày.

**Kiểm tra:** `test_FR_INV_20_batch_expiry_alert`

## FR-INV-21 — Báo cáo tồn kho

**Tuyên bố:** Hệ thống phải cho phép tạo báo cáo tồn kho theo thương hiệu, sản phẩm, lô, máy, slot và khoảng thời gian.

**Dấu vết:** BR-005, BR-007 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho người dùng có quyền xem báo cáo tồn kho, Khi chọn các bộ lọc thương hiệu, sản phẩm, lô, máy, slot và khoảng thời gian, Thì hệ thống trả về báo cáo theo phạm vi đã chọn.
- AC2: Cho người dùng không có quyền truy cập dữ liệu của thương hiệu/slot, Khi yêu cầu báo cáo chứa dữ liệu ngoài phạm vi, Thì hệ thống không trả về dữ liệu ngoài phạm vi được phép.

**Kiểm tra:** `test_FR_INV_21_inventory_report`

## FR-INV-22 — Khai báo lô hàng gửi đến kho nền tảng

**Tuyên bố:** Hệ thống phải cho phép Brand Admin khai báo lô hàng gửi đến kho nền tảng, gồm sản phẩm, số lượng chai, dung tích mỗi chai và ngày dự kiến gửi.

**Dấu vết:** BR-005 · **Ưu tiên:** M · **API:** `POST /shipment-declarations`

**Tiêu chí xét tuyển**

- AC1: Cho Brand Admin của thương hiệu `B` và sản phẩm `P` thuộc `B`, Khi khai báo lô hàng với số lượng > 0 và dung tích > 0, Thì hệ thống tạo bản ghi khai báo ở trạng thái `DECLARED` gắn với `B`.
- AC2: Cho sản phẩm `P2` thuộc thương hiệu khác, Khi Brand Admin của `B` khai báo lô hàng cho `P2`, Thì hệ thống từ chối với `PRODUCT_NOT_OWNED`.
- AC3 (Ca biên): Cho số lượng khai báo bằng 0 hoặc âm, Khi gửi khai báo, Thì hệ thống từ chối — ràng buộc `chk_declared_quantity_positive` ở tầng CSDL cũng chặn.

**Kiểm tra:** `test_FR_INV_22_declare_shipment`

## FR-INV-23 — Trạng thái khai báo gửi hàng

**Tuyên bố:** Hệ thống phải quản lý trạng thái khai báo gửi hàng theo tập: DECLARED, RECEIVED, DISCREPANCY, CANCELLED.

**Dấu vết:** BR-005 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho khai báo vừa tạo, Khi hệ thống lưu bản ghi, Thì trạng thái là `DECLARED`.
- AC2: Cho giá trị trạng thái ngoài tập quy định, Khi yêu cầu cập nhật, Thì hệ thống từ chối giá trị đó (enum `shipment_declaration_status`).

**Kiểm tra:** `test_FR_INV_23_declaration_status_set`

## FR-INV-24 — Đối chiếu số thực nhận với khai báo

**Tuyên bố:** Hệ thống phải cho phép Inventory Staff đối chiếu số lượng thực nhận với khai báo của Brand Admin khi tiếp nhận lô hàng.

**Dấu vết:** BR-005 · **Ưu tiên:** M · **API:** `POST /shipment-declarations/{id}/receive`

**Tiêu chí xét tuyển**

- AC1: Cho khai báo `D` ở trạng thái `DECLARED` và Inventory Staff nhập số thực nhận bằng số khai báo, Khi xác nhận tiếp nhận, Thì khai báo chuyển `RECEIVED` và hệ thống ghi `received_by`, `received_at`.
- AC2: Cho người dùng không phải Inventory Staff, Khi xác nhận tiếp nhận, Thì hệ thống từ chối với `FORBIDDEN_SCOPE`.
- AC3: Cho khai báo đã ở trạng thái `RECEIVED` hoặc `CANCELLED`, Khi xác nhận tiếp nhận lần nữa, Thì hệ thống từ chối thao tác.

**Kiểm tra:** `test_FR_INV_24_reconcile_shipment`

## FR-INV-25 — Ghi chú bắt buộc khi lệch số lượng

**Tuyên bố:** Hệ thống phải chuyển khai báo sang trạng thái DISCREPANCY và yêu cầu ghi chú bắt buộc khi số lượng thực nhận khác số lượng khai báo.

**Dấu vết:** BR-005 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho số thực nhận khác số khai báo và có ghi chú lệch, Khi xác nhận tiếp nhận, Thì khai báo chuyển `DISCREPANCY` (không phải `RECEIVED`) và lưu `discrepancy_notes`.
- AC2: Cho số thực nhận khác số khai báo nhưng thiếu ghi chú, Khi xác nhận tiếp nhận, Thì hệ thống từ chối thao tác và không đổi trạng thái khai báo.
- AC3 (Ca biên - Nhận thiếu hoàn toàn): Cho số thực nhận bằng 0 kèm ghi chú, Khi xác nhận, Thì khai báo chuyển `DISCREPANCY` và hệ thống không tạo lô nước hoa nào.

**Kiểm tra:** `test_FR_INV_25_shipment_discrepancy`

## FR-INV-26 — Tự động tạo lô khi tiếp nhận

**Tuyên bố:** Hệ thống phải tự động tạo lô nước hoa theo FR-INV-01, liên kết với khai báo gửi hàng, khi Inventory Staff xác nhận đã tiếp nhận.

**Dấu vết:** BR-005, BR-008 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho khai báo `D` được xác nhận tiếp nhận, Khi hệ thống xử lý, Thì trong cùng một transaction hệ thống tạo `InventoryBatch` với `source_declaration_id = D.id`, `brand_id` và `fragrance_product_id` lấy từ khai báo, `quantity_received` bằng số thực nhận.
- AC2: Cho lô được tạo tự động, Khi kiểm tra bản ghi, Thì `source_declaration_id` khác NULL — phân biệt được với lô nhập thủ công.
- AC3 (Ràng buộc cùng thương hiệu): Cho nỗ lực tạo lô với `fragrance_product_id` thuộc thương hiệu khác `brand_id`, Khi ghi vào CSDL, Thì composite foreign key `fk_batch_product_same_brand` từ chối thao tác.

**Kiểm tra:** `test_FR_INV_26_auto_create_batch_on_receive`

## FR-INV-27 — Brand Admin xem lịch sử gửi hàng

**Tuyên bố:** Hệ thống phải cho phép Brand Admin xem trạng thái và lịch sử các lần gửi hàng của thương hiệu mình.

**Dấu vết:** BR-005 · **Ưu tiên:** M · **API:** `GET /shipment-declarations`

**Tiêu chí xét tuyển**

- AC1: Cho thương hiệu `B` có nhiều khai báo ở các trạng thái khác nhau, Khi Brand Admin của `B` truy vấn, Thì hệ thống trả về đầy đủ khai báo của `B` kèm trạng thái, số thực nhận và ghi chú lệch nếu có.
- AC2 (Cô lập dữ liệu): Cho thương hiệu `B2` cũng có khai báo, Khi Brand Admin của `B1` truy vấn, Thì kết quả không chứa khai báo nào của `B2`.

**Kiểm tra:** `test_FR_INV_27_list_own_shipments`

## FR-INV-28 — Thông báo khai báo gửi hàng mới

**Tuyên bố:** Hệ thống phải thông báo cho Inventory Staff khi có khai báo gửi hàng mới.

**Dấu vết:** BR-005 · **Ưu tiên:** S

**Tiêu chí xét tuyển**

- AC1: Cho Brand Admin tạo khai báo gửi hàng mới, Khi khai báo được lưu, Thì hệ thống sinh thông báo cho các tài khoản Inventory Staff.
- AC2: Cho khai báo chỉ được cập nhật chứ không phải tạo mới, Khi lưu thay đổi, Thì hệ thống không sinh thông báo "khai báo mới" lần nữa.

**Kiểm tra:** `test_FR_INV_28_notify_new_shipment`

## FR-INV-29 — Mở phiếu nạp trước khi thao tác

**Tuyên bố:** Hệ thống phải cho phép Inventory Staff mở phiếu nạp cho một slot trước khi thao tác, ghi nhận máy, slot, người thực hiện và thời điểm mở phiếu.

**Dấu vết:** BR-005 · **Ưu tiên:** M · **API:** `POST /refill-sessions`

**Tiêu chí xét tuyển**

- AC1: Cho Inventory Staff và slot `S` trên máy `M`, Khi mở phiếu nạp, Thì hệ thống tạo `RefillSession` trạng thái `STARTED` ghi `machine_id`, `slot_id`, `performed_by` và `started_at`.
- AC2: Cho phiếu vừa mở, Khi kiểm tra bản ghi, Thì `new_bottle_id` được phép là NULL — chai thay thế chọn sau, tại thời điểm đóng phiếu.
- AC3: Cho Brand Admin, Khi gọi endpoint mở phiếu nạp, Thì hệ thống từ chối với `FORBIDDEN_SCOPE` (FR-RFQ-11 — thương hiệu không trực tiếp thực hiện phiên nạp).

**Kiểm tra:** `test_FR_INV_29_open_refill_session`

## FR-INV-30 — Tạm ngưng cảnh báo cửa mở khi phiếu nạp đang mở

**Tuyên bố:** Hệ thống phải tạm ngưng cảnh báo cửa mở quá hạn theo FR-ALR-03 cho máy có slot đang trong phiếu nạp còn mở.

**Dấu vết:** BR-005, BR-006 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho tồn tại `RefillSession` trạng thái `STARTED` trên máy `M`, Khi thiết bị báo cửa mở liên tục quá `DOOR_OPEN_ALERT_MIN`, Thì hệ thống không sinh cảnh báo FR-ALR-03 — kể cả khi máy đang ở chế độ NORMAL.
- AC2: Cho máy `M` không có phiếu nạp nào đang mở và không ở chế độ MAINTENANCE, Khi cửa mở quá `DOOR_OPEN_ALERT_MIN`, Thì hệ thống sinh cảnh báo bình thường.

> Đây là ngoại lệ **thứ hai** của FR-ALR-03, bổ sung cho ngoại lệ chế độ MAINTENANCE vốn có.
> Inventory Staff nạp hàng không chuyển máy sang MAINTENANCE, nên thiếu ngoại lệ này thì mỗi lần
> nạp quá `DOOR_OPEN_ALERT_MIN` sẽ sinh báo động giả. Cùng ghi ở `spec/contracts/schema.sql` §13
> mục 5 và `spec/contracts/mqtt.md` §3.

**Kiểm tra:** `test_FR_INV_30_suppress_door_alert_during_refill`

## FR-INV-31 — Đóng phiếu nạp và khôi phục giám sát

**Tuyên bố:** Hệ thống phải yêu cầu Inventory Staff đóng phiếu nạp khi hoàn tất; tại thời điểm đóng phiếu, hệ thống khôi phục giám sát cảnh báo cửa mở bình thường cho slot đó.

**Dấu vết:** BR-005, BR-006 · **Ưu tiên:** M · **API:** `POST /refill-sessions/{id}/close`

**Tiêu chí xét tuyển**

- AC1: Cho phiếu nạp `F` trạng thái `STARTED`, checklist đã hoàn thành và đã chọn chai mới hợp lệ, Khi đóng phiếu, Thì `F` chuyển `COMPLETED`, ghi `completed_at`, và `new_bottle_id` khác NULL.
- AC2 (Cổng checklist): Cho checklist chưa hoàn thành, Khi yêu cầu đóng phiếu, Thì hệ thống từ chối (FR-INV-14).
- AC3 (Chai chưa chọn): Cho `new_bottle_id` chưa được cung cấp, Khi yêu cầu đóng phiếu, Thì hệ thống từ chối — cột nullable ở CSDL chỉ phục vụ giai đoạn phiếu còn mở, ràng buộc này nằm ở domain service (`spec/contracts/schema.sql` §13 mục 2).
- AC4 (Khôi phục giám sát): Cho phiếu `F` vừa chuyển `COMPLETED`, Khi cửa tiếp tục mở quá `DOOR_OPEN_ALERT_MIN` sau thời điểm đóng phiếu, Thì hệ thống sinh cảnh báo FR-ALR-03 trở lại.

**Kiểm tra:** `test_FR_INV_31_close_refill_session`
