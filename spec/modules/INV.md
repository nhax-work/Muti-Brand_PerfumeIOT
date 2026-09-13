# FR-INV — Tồn kho và nạp nước hoa

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` Mục A9 · 21 FR  
> Trạng thái AC: **đã viết**  
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
