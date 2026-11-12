# FR-INV — Tồn kho và nạp nước hoa

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` Mục A9 · 35 mục = 33 FR hiệu lực + 2 FR bãi bỏ (mức X)  
> Trạng thái AC: **hoàn thành** (FR-INV-04, 30, 31 soát lại và FR-INV-32÷35 thêm ngày 2026-10-17 theo ADR-0013, ADR-0014, ADR-0015; FR-INV-05, 13, 15 sửa và FR-INV-18, 19 bãi bỏ ngày 2026-10-28 theo ADR-0019 — máy không có load cell)  
> Phụ trách: Hoàng (TV4) / Tài  
> Mức chi tiết: AC cho FR có điều kiện; CRUD để dạng phát biểu

Đọc kèm: `spec/glossary.md`, `spec/errors.md`, `spec/constraints.md`,
`spec/decisions/0013-brand-tu-dang-ky-hop-dong-hai-lop-va-chi-tra-doanh-thu.md`,
`spec/decisions/0014-an-han-chu-dong-khong-gia-han-va-doi-slot.md`,
`spec/decisions/0015-dung-ban-an-toan-va-bao-ve-khach-tai-may.md`,
`spec/decisions/0019-dem-luot-xit-thay-load-cell.md`

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

**Tuyên bố:** Hệ thống phải quản lý trạng thái chai theo tập: IN_STOCK, INSTALLED, LOW, EMPTY, DAMAGED, EXPIRED, LIQUIDATED, RETURNED_TO_BRAND (ADR-0014).

**Dấu vết:** BR-005, BR-013 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho một chai trong hệ thống, Khi trạng thái được cập nhật theo nghiệp vụ hợp lệ, Thì hệ thống chỉ lưu một giá trị thuộc tập trạng thái đã quy định: `IN_STOCK`, `INSTALLED`, `LOW`, `EMPTY`, `DAMAGED`, `EXPIRED`, `LIQUIDATED`, `RETURNED_TO_BRAND`.
- AC2 (Trả hàng về thương hiệu - ADR-0014): Cho chai thuộc hóa đơn chủ động không gia hạn khi được Inventory Staff tháo khỏi máy, Khi ghi nhận vào phiếu trả hàng, Thì trạng thái chai chuyển thành `RETURNED_TO_BRAND`.
- AC3: Cho một giá trị trạng thái ngoài tập đã quy định, Khi yêu cầu cập nhật trạng thái, Thì hệ thống từ chối giá trị đó.

**Kiểm tra:** `test_FR_INV_04_bottle_status`

## FR-INV-05 — Dung tích ban đầu

**Tuyên bố:** Hệ thống phải ghi nhận dung tích ban đầu của chai khi đăng ký chai (ADR-0019).

**Dấu vết:** BR-005 · **Ưu tiên:** M · **API:** `POST /bottles`

**Tiêu chí xét tuyển**

- AC1: Cho Inventory Staff đăng ký chai với `initialVolumeMl`, Khi hệ thống lưu chai, Thì `initial_volume_ml` bằng giá trị đó và `current_estimated_ml` được đặt bằng chính giá trị đó.
- AC2: Cho yêu cầu đăng ký chai thiếu `initialVolumeMl` hoặc giá trị không lớn hơn 0, Khi gửi yêu cầu, Thì hệ thống từ chối với `VALIDATION_ERROR`.

> Máy không có load cell (ADR-0019): lượng còn lại theo dõi bằng số lượt xịt thành công × liều hiệu chuẩn (FR-INV-09, FR-INV-10), không cân chai.

**Kiểm tra:** `test_FR_INV_05_initial_volume`

## FR-INV-06 — Kiểm tra quyền sở hữu khi gán slot

**Tuyên bố:** Hệ thống phải từ chối gán vào slot chai thuộc thương hiệu không có hóa đơn thuê slot đó.

**Dấu vết:** BR-003, BR-012 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho slot có hóa đơn hiệu lực của Brand A và chai thuộc Brand A, Khi Inventory Staff gán chai vào slot, Thì hệ thống cho phép thao tác.
- AC2: Cho slot có hóa đơn hiệu lực của Brand A và chai thuộc Brand B, Khi Inventory Staff gán chai vào slot, Thì hệ thống từ chối thao tác.

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

**Tuyên bố:** Hệ thống phải lưu cho mỗi phiên nạp: người thực hiện, thời điểm, máy, slot, chai cũ và chai mới. Lượng còn lại của chai cũ lấy từ ước tính `current_estimated_ml` lúc tháo (ADR-0019).

**Dấu vết:** BR-005, BR-008 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho một phiên nạp hoàn tất, Khi Inventory Staff lưu phiên nạp, Thì hệ thống ghi nhận đầy đủ người thực hiện, thời điểm, máy, slot, chai cũ và chai mới.
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

**Tuyên bố:** Hệ thống phải cung cấp quy trình tháo chai khỏi slot và trả về kho; lượng còn lại là ước tính `current_estimated_ml` tại thời điểm tháo, không nhập tay (ADR-0019).

**Dấu vết:** BR-005, BR-013 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1: Cho chai đang INSTALLED, Khi Inventory Staff thực hiện quy trình tháo chai, Thì hệ thống ghi nhận chai đã tháo; chai còn lượng thì về `IN_STOCK`, hết thì `EMPTY`, giữ nguyên `current_estimated_ml`.
- AC2: Cho lượng thực tế lệch với ước tính, Khi Inventory Staff muốn sửa, Thì sửa bằng điều chỉnh tồn kho kèm lý do (FR-INV-16), không qua thao tác tháo.

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

## FR-INV-18 — ~~Đối chiếu tiêu thụ và load cell~~ (bãi bỏ)

**Tuyên bố:** ~~Hệ thống phải so sánh lượng tiêu thụ tính theo số lượt xịt với số đo từ load cell của cùng slot.~~

**Dấu vết:** BR-005 · **Ưu tiên:** X (bãi bỏ theo ADR-0019)

**Lý do:** máy không có load cell; lượng còn lại chỉ có một nguồn là số lượt xịt thành công × liều hiệu chuẩn (FR-INV-09), nên không còn gì để đối chiếu. Lệch thực tế được sửa bằng điều chỉnh tồn kho (FR-INV-16).

## FR-INV-19 — ~~Cảnh báo nghi ngờ rò rỉ~~ (bãi bỏ)

**Tuyên bố:** ~~Hệ thống phải sinh cảnh báo nghi ngờ rò rỉ khi khối lượng đo được giảm quá 20% so với lượng tiêu thụ tính theo số lượt xịt trong cùng khoảng thời gian.~~

**Dấu vết:** BR-005 · **Ưu tiên:** X (bãi bỏ theo ADR-0019)

**Lý do:** không có số đo khối lượng để so với lượng tiêu thụ tính theo lượt xịt. Hằng số `LEAK_DETECT_THRESHOLD_PCT` bị xóa cùng. Rò rỉ chỉ lộ ra khi Inventory Staff kiểm tra lúc nạp hoặc khi chai hết sớm hơn ước tính (ADR-0019, rủi ro chấp nhận).

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

## FR-INV-30 — Tạm ngưng cảnh báo cửa mở và dừng nhận đơn khi phiếu nạp đang mở
**Tuyên bố:** Hệ thống phải, khi máy có phiếu nạp còn mở: tạm ngưng cảnh báo cửa mở quá hạn theo FR-ALR-03, từ chối tạo đơn mới trên cả máy và không tạo lệnh xịt cho đơn đang chờ lượt (ADR-0015).

**Dấu vết:** BR-005, BR-006, BR-010 · **Ưu tiên:** M

**Tiêu chí xét tuyển**

- AC1 (Tạm ngưng cảnh báo): Cho tồn tại `RefillSession` trạng thái `STARTED` trên máy `M`, Khi thiết bị báo cửa mở liên tục quá `DOOR_OPEN_ALERT_MIN`, Thì hệ thống không sinh cảnh báo FR-ALR-03 — kể cả khi máy đang ở chế độ NORMAL.
- AC2: Cho máy `M` không có phiếu nạp nào đang mở và không ở chế độ MAINTENANCE, Khi cửa mở quá `DOOR_OPEN_ALERT_MIN`, Thì hệ thống sinh cảnh báo bình thường.
- AC3 (Từ chối tạo đơn mới - ADR-0015): Cho máy `M` đang có phiếu nạp trạng thái `STARTED`, Khi kiosk gửi yêu cầu tạo đơn mới (`POST /kiosk/machines/{serialNumber}/orders`), Thì hệ thống từ chối với HTTP 409 `MACHINE_IN_MAINTENANCE` (hoặc `MACHINE_BUSY`).
- AC4 (Không tạo lệnh xịt đơn chờ lượt - ADR-0015): Cho đơn hàng đã thanh toán `PAID` đang chờ lượt trên máy `M`, Khi máy có phiếu nạp mở, Thì hệ thống tạm giữ đơn trong hàng đợi, tuyệt đối không tạo và gửi lệnh xịt xuống máy cho tới khi phiếu nạp được đóng.

> Ngoại lệ thứ hai của FR-ALR-03, bổ sung cho ngoại lệ chế độ MAINTENANCE.

**Kiểm tra:** `test_FR_INV_30_suppress_door_alert_during_refill`

---

## FR-INV-31 — Đóng phiếu nạp và khôi phục giám sát
**Tuyên bố:** Hệ thống phải yêu cầu Inventory Staff đóng phiếu nạp khi hoàn tất; tại thời điểm đóng phiếu, hệ thống khôi phục giám sát cảnh báo cửa mở và cho máy nhận đơn trở lại (ADR-0015).

**Dấu vết:** BR-005, BR-006 · **Ưu tiên:** M · **API:** `POST /inventory/refill-sessions/{id}/close`

**Tiêu chí xét tuyển**

- AC1: Cho phiếu nạp `F` trạng thái `STARTED`, checklist đã hoàn thành và đã chọn chai mới hợp lệ, Khi đóng phiếu, Thì `F` chuyển `COMPLETED`, ghi `completed_at`, và `new_bottle_id` khác NULL.
- AC2 (Cổng checklist): Cho checklist chưa hoàn thành, Khi yêu cầu đóng phiếu, Thì hệ thống từ chối (FR-INV-14).
- AC3 (Chai chưa chọn): Cho `new_bottle_id` chưa được cung cấp, Khi yêu cầu đóng phiếu, Thì hệ thống từ chối.
- AC4 (Khôi phục giám sát): Cho phiếu `F` vừa chuyển `COMPLETED`, Khi cửa tiếp tục mở quá `DOOR_OPEN_ALERT_MIN` sau thời điểm đóng phiếu, Thì hệ thống sinh cảnh báo FR-ALR-03 trở lại.
- AC5 (Mở nhận đơn trở lại - ADR-0015): Cho phiếu nạp trên máy `M` vừa đóng thành công, Khi kiosk tạo đơn hàng mới hoặc scheduler quét đơn `PAID` đang chờ lượt, Thì hệ thống cho phép tạo đơn và tiếp tục phát lệnh xịt bình thường.

**Kiểm tra:** `test_FR_INV_31_close_refill_session`

---

## FR-INV-32 — Chặn mở phiếu nạp khi máy đang bận
**Tuyên bố:** Hệ thống phải từ chối mở phiếu nạp trên máy còn lệnh xịt khách hàng đang hiệu lực hoặc đơn đang chờ thanh toán (ADR-0015).

**Dấu vết:** BR-002, BR-010 · **Ưu tiên:** M · ADR-0015 mục 4 · **API:** `POST /inventory/refill-sessions`

**Tiêu chí xét tuyển**

- AC1 (Có lệnh xịt đang hiệu lực): Cho máy `M` đang có lệnh xịt khách hàng ở trạng thái `SENT` hoặc `ACKED` (chưa nhận kết quả hoàn tất hoặc timeout), Khi Inventory Staff gửi yêu cầu mở phiếu nạp trên máy `M`, Thì hệ thống từ chối với HTTP 409 `MACHINE_BUSY`.
- AC2 (Có đơn chờ thanh toán): Cho máy `M` đang tồn tại đơn hàng ở trạng thái `CREATED` hoặc `PENDING_PAYMENT`, Khi Inventory Staff gửi yêu cầu mở phiếu nạp, Thì hệ thống từ chối với HTTP 409 `MACHINE_BUSY`.
- AC3 (Thành công): Cho máy `M` không còn đơn chờ thanh toán và không còn lệnh xịt nào đang hiệu lực, Khi Inventory Staff gửi yêu cầu mở phiếu nạp, Thì hệ thống chấp nhận tạo phiếu.

**Kiểm tra:** `test_FR_INV_32_reject_open_refill_when_machine_busy`

---

## FR-INV-33 — Nộp giấy tờ chứng minh hàng chính hãng
**Tuyên bố:** Hệ thống phải cho phép Brand Admin nộp giấy tờ chứng minh hàng chính hãng cho lô hàng gửi đến kho trong `RENTAL_MAX_STOCKING_DAYS` ngày kể từ lúc thanh toán hóa đơn (ADR-0013).

**Dấu vết:** BR-005, BR-008 · **Ưu tiên:** M · ADR-0013 mục 2 · **API:** `POST /inventory-batches/{id}/authenticity-documents`

**Tiêu chí xét tuyển**

- AC1 (Nộp giấy tờ): Cho Brand Admin của thương hiệu `B` sở hữu lô hàng `L`, thời gian từ lúc thanh toán hóa đơn `<= RENTAL_MAX_STOCKING_DAYS = 30` ngày, Khi gửi tệp tài liệu / chứng từ chứng minh hàng chính hãng (`documentUrl`, `documentType`), Thì hệ thống lưu thông tin chứng từ vào lô hàng `L`, đặt trạng thái xác minh `authenticity_status = 'PENDING'` và ghi AuditLog.
- AC2 (Phân quyền): Cho Brand Admin của thương hiệu khác, Khi nộp giấy tờ cho lô hàng `L`, Thì hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
- AC3 (Quá hạn nộp giấy tờ): Cho thời gian kể từ lúc thanh toán hóa đơn đã vượt quá `RENTAL_MAX_STOCKING_DAYS`, Khi gửi yêu cầu nộp giấy tờ, Thì hệ thống từ chối với HTTP 409 `DOCUMENT_SUBMISSION_EXPIRED`.

**Kiểm tra:** `test_FR_INV_33_submit_authenticity_documents`

---

## FR-INV-34 — Phê duyệt giấy tờ chính hãng của lô hàng
**Tuyên bố:** Hệ thống phải cho phép Platform Super Admin duyệt hoặc từ chối giấy tờ chính hãng của lô hàng, kèm lý do bắt buộc khi từ chối (ADR-0013).

**Dấu vết:** BR-005, BR-008 · **Ưu tiên:** M · ADR-0013 mục 2 · **API:** `POST /inventory-batches/{id}/approve-authenticity`, `POST /inventory-batches/{id}/reject-authenticity`

**Tiêu chí xét tuyển**

- AC1 (Duyệt thành công): Cho lô hàng `L` đang có giấy tờ ở trạng thái `PENDING`, Khi Platform Super Admin gửi `POST /inventory-batches/{id}/approve-authenticity`, Thì lô chuyển sang `authenticity_status = 'APPROVED'`, ghi nhận `verified_by = current_user_id`, `verified_at = CURRENT_TIMESTAMP`, và thông báo cho Brand Admin.
- AC2 (Từ chối có lý do): Cho lô hàng `L` đang `PENDING`, Khi Platform Super Admin gửi `POST /inventory-batches/{id}/reject-authenticity` kèm `reason = "Chứng từ mờ không hợp lệ"`, Thì lô chuyển sang `authenticity_status = 'REJECTED'`, lưu lý do từ chối và thông báo cho Brand Admin.
- AC3 (Từ chối thiếu lý do): Cho yêu cầu từ chối nhưng không cung cấp trường `reason`, Khi gửi yêu cầu, Thì hệ thống từ chối với HTTP 400 `REASON_REQUIRED`.
- AC4 (Phân quyền): Cho người dùng không phải Platform Super Admin gọi duyệt/từ chối, Khi gửi yêu cầu, Thì hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.

**Kiểm tra:** `test_FR_INV_34_review_authenticity_documents`

---

## FR-INV-35 — Chặn lắp chai chưa có giấy tờ chính hãng được duyệt
**Tuyên bố:** Hệ thống phải từ chối lắp vào slot chai thuộc lô hàng chưa có giấy tờ chính hãng được duyệt (ADR-0013).

**Dấu vết:** BR-005, BR-008 · **Ưu tiên:** M · ADR-0013 mục 2 · **API:** `POST /inventory/refill-sessions/{id}/close`

**Tiêu chí xét tuyển**

- AC1 (Chặn lắp chai chưa duyệt): Cho chai `C` thuộc lô hàng `L` có `authenticity_status != 'APPROVED'` (`PENDING`, `REJECTED`, hoặc chưa nộp giấy tờ), Khi Inventory Staff chọn chai `C` để lắp vào slot trong phiên nạp (`new_bottle_id = C`), Thì hệ thống từ chối với HTTP 409 `BATCH_NOT_APPROVED` và ngăn không cho đóng phiên nạp.
- AC2 (Cho phép khi đã duyệt): Cho chai `C` thuộc lô hàng đã có `authenticity_status = 'APPROVED'`, Khi chọn chai `C` để nạp vào slot, Thì hệ thống chấp nhận lắp chai và đóng phiên nạp thành công.

**Kiểm tra:** `test_FR_INV_35_reject_install_unapproved_batch_bottle`
