# Danh Mục Đặc Tả Use Case Theo Từng Actor — ScentStation

> **Dự án:** ScentStation — Nền tảng trải nghiệm & kinh doanh nước hoa IoT dùng chung máy  
> **Phiên bản nghiệp vụ:** 2.0 (Cập nhật đầy đủ theo ADR-0006 ÷ ADR-0016 và 320 FR hiệu lực)  
> **Ngày lập:** 2026-10-17  
> **Tài liệu căn cứ:** [FR_NFR_SCENTSTATION.md](file:///c:/FPTU/Ky-9/Muti-Brand_PerfumeIOT/docs/FR_NFR_SCENTSTATION.md), [PROJECT.md](file:///c:/FPTU/Ky-9/Muti-Brand_PerfumeIOT/spec/PROJECT.md), [FEATURES_MVP.md](file:///c:/FPTU/Ky-9/Muti-Brand_PerfumeIOT/docs/FEATURES_MVP.md).

---

## 📌 Tổng quan về các Actor trong hệ thống

Hệ thống ScentStation chuẩn hóa gồm **5 nhóm người dùng (Human Actors)** và **2 tác tử ngoài (External Actors / IoT)**:

| STT | Actor | Phân loại | Mô tả vai trò & Phạm vi |
| :---: | :--- | :--- | :--- |
| 1 | **User** | Base Actor | Người dùng chung trong hệ thống (Login, Logout, Change Password, Re-authenticate). Mọi tài khoản nội bộ và thương hiệu đều kế thừa từ Actor này. |
| 2 | **Customer** | End-User | Khách hàng vãng lai trực tiếp thao tác tại màn hình Kiosk cảm ứng để duyệt danh mục, thanh toán QR và bấm nút vật lý nhận lượt xịt. |
| 3 | **Brand Admin** | Business User | Đại diện thương hiệu nước hoa: tự đăng ký tài khoản, thuê slot tự phục vụ, ký hợp đồng điện tử, cấu hình slot, tạo yêu cầu nạp (RFQ), theo dõi đối soát doanh thu. |
| 4 | **Platform Super Admin** | Platform Admin | Quản trị viên cấp cao nhất của nền tảng: quản lý tài khoản nội bộ, cấu hình tham số & gói thuê, duyệt RFQ, xác minh pháp nhân thương hiệu, chi trả doanh thu, xem audit log. |
| 5 | **Operations Staff** | Platform Staff | Nhân viên vận hành & kỹ thuật nền tảng (*gộp từ Operations Manager và Technician*): giám sát từ xa, xử lý cảnh báo, tiếp nhận phiếu bảo trì, chẩn đoán, test xịt, xử lý phiếu hoàn tiền cho khách. |
| 6 | **Inventory Staff** | Platform Staff | Nhân viên quản lý kho & vật tư nền tảng: tiếp nhận lô chai nước hoa, kiểm tra giấy tờ chính hãng, mở phiếu nạp chai tại trạm, tháo chai trả hàng hết hạn. |
| 7 | **Kiosk / IoT Machine** | IoT System | Máy bán hàng tự động tại địa điểm: gửi heartbeat định kỳ, báo cáo telemetry mức dung tích/nắp cửa, nhận lệnh xịt, điều khiển đèn nút bấm vật lý và cơ cấu bơm xịt. |
| 8 | **Payment Gateway (PayOS)** | External System | Cổng thanh toán trực tuyến: sinh mã VietQR động, gửi webhook xác nhận thanh toán tức thời theo thời gian thực. |

---

## 1. Actor: User (Base Actor - Dùng chung)

| Mã Use Case | Tên Use Case (English) | Tên Tiếng Việt | FR liên quan | Mô tả tóm tắt |
| :--- | :--- | :--- | :--- | :--- |
| **UC-USR-01** | **Login** | Đăng nhập hệ thống | FR-AUTH-01, 02 | Đăng nhập bằng Email và Mật khẩu; cấp Access Token và Refresh Token có thời hạn; khóa tài khoản sau 5 lần sai liên tiếp. |
| **UC-USR-02** | **Logout** | Đăng xuất hệ thống | FR-AUTH-04 | Đăng xuất an toàn và thu hồi ngay Refresh Token trên server. |
| **UC-USR-03** | **Change Password** | Đổi mật khẩu cá nhân | FR-AUTH-01 | Cho phép người dùng chủ động đổi mật khẩu đăng nhập định kỳ. |
| **UC-USR-04** | **Re-authenticate Session** | Xác thực lại mật khẩu | FR-AUTH-09 | Nhập lại mật khẩu trước các thao tác nhạy cảm (hoàn tiền, xịt chẩn đoán, điều chỉnh tồn kho, thanh lý, đổi cấu hình máy, ghi nhận chi trả). |

---

## 2. Actor: Customer (Khách hàng)

| Mã Use Case | Tên Use Case (English) | Tên Tiếng Việt | FR liên quan | Mô tả tóm tắt |
| :--- | :--- | :--- | :--- | :--- |
| **UC-CUS-01** | **Browse Perfume Catalog & Details** | Duyệt danh mục & chi tiết sản phẩm | FR-ORD-01, 02, NFR-USA-05 | Xem các slot đang khả dụng trên Kiosk, duyệt tên nước hoa, thương hiệu, hình ảnh, các tầng hương và giá bán cho 1 lượt xịt. |
| **UC-CUS-02** | **Purchase Perfume Trial via QR** | Mua lượt xịt nước hoa qua QR | FR-ORD-08, 11, 24 | Chọn sản phẩm, xem điều khoản (quá 60s không bấm nút mất lượt), nhận mã VietQR động để quét thanh toán qua ngân hàng/ví điện tử. |
| **UC-CUS-03** | **Cancel Pending Order** | Hủy đơn hàng chờ thanh toán | FR-ORD-33 | Khách hàng chủ động bấm nút "Hủy / Quay lại" khi đang ở màn hình QR code để giải phóng Kiosk cho người sau. |
| **UC-CUS-04** | **Trigger Dispense via Illuminated Button** | Kích hoạt lượt xịt bằng nút bấm vật lý | FR-ORD-10, 24, FR-DSP-21..24 | Sau khi thanh toán thành công, quan sát đèn LED phát sáng tại nút vật lý tương ứng với slot và bấm trong vòng 60 giây để máy xịt. |
| **UC-CUS-05** | **Scan QR & Submit Refund Claim** | Quét QR gửi khiếu nại hoàn tiền | FR-ORD-20, 21, 28, 29 | Khi gặp sự cố máy không xịt hoặc lỗi hệ thống, quét mã QR sự cố trên màn hình Kiosk, điền thông tin tài khoản ngân hàng và lý do để yêu cầu hoàn tiền. |

---

## 3. Actor: Brand Admin (Đại diện Thương hiệu)

| Mã Use Case | Tên Use Case (English) | Tên Tiếng Việt | FR liên quan | Mô tả tóm tắt |
| :--- | :--- | :--- | :--- | :--- |
| **UC-BRA-01** | **Register Brand Account** | Tự đăng ký tài khoản thương hiệu | FR-USR-06 | Khai báo tên thương hiệu, email và mật khẩu để tạo ngay thương hiệu và tài khoản Brand Admin ban đầu. |
| **UC-BRA-02** | **Verify Account Email** | Xác minh Email kích hoạt | FR-USR-07 | Nhập mã xác minh email gửi về hòm thư trước khi thực hiện giao dịch tài chính hoặc thuê slot. |
| **UC-BRA-03** | **Declare Legal Entity & Payout Account** | Khai báo pháp nhân & tài khoản nhận tiền | FR-BND-09 | Khai báo mã số thuế, giấy phép kinh doanh và tài khoản doanh nghiệp nhận doanh thu (lưu mã hóa) để Super Admin đối soát. |
| **UC-BRA-04** | **Manage Brand Profile** | Quản lý hồ sơ thương hiệu | FR-BND-06 | Xem và cập nhật tên hiển thị, logo, mô tả, hotline, website của thương hiệu. |
| **UC-BRA-05** | **Manage Perfume Products** | Quản lý danh mục sản phẩm nước hoa | FR-PRD-01, 02, 03, 05 | Tạo mới, cập nhật thông tin sản phẩm, đăng ảnh chai, nhập tầng hương, giá niêm yết bán lẻ chai đầy đủ và ngừng kinh doanh sản phẩm. |
| **UC-BRA-06** | **Browse Available Machine Slots** | Duyệt & chọn slot máy trống | FR-SLT-30, 31, 32 | Xem bản đồ các địa điểm đặt máy, danh sách máy của nền tảng, tình trạng các slot đang trống và giá thuê niêm yết của từng slot. |
| **UC-BRA-07** | **Rent Slots & Sign Electronic Contract** | Thuê slot & thanh toán tự phục vụ | FR-SLT-33..42 | Chọn 1 hoặc nhiều slot, chọn gói thời hạn (3/6/12 tháng), chọn gói bảo quản (bảo hiểm chai), chấp thuận hợp đồng khung & phụ lục điện tử, quét PayOS QR thanh toán một lần. |
| **UC-BRA-08** | **Swap Leased Slot within 48 Hours** | Đổi slot thuê trong vòng 48 giờ | FR-SLT-55, 56 | Đổi sang một slot trống khác có cùng giá thuê trong vòng 48 giờ kể từ khi thanh toán, với điều kiện slot cũ chưa lắp chai nước hoa. |
| **UC-BRA-09** | **Configure Slot Perfume & Set Dispense Price** | Cấu hình sản phẩm & đặt giá xịt cho slot | FR-SLT-08, 27, 28 | Gán sản phẩm nước hoa của mình vào slot đã thuê và tự do định giá bán cho mỗi lượt xịt (không bị giới hạn giá sàn/trần). |
| **UC-BRA-10** | **Create Refill Request (RFQ)** | Tạo yêu cầu nạp nước hoa (RFQ) | FR-RFQ-01, 02, 03, 10 | Tạo yêu cầu nạp thêm nước hoa cho slot kèm lý do (sắp hết, hết hạn, đổi sản phẩm) và tải lên chứng từ nguồn gốc lô hàng. |
| **UC-BRA-11** | **Opt-out of Slot Renewal** | Chủ động báo không gia hạn slot | FR-EXP-23, 24 | Báo ngừng gia hạn trước ngày hết hạn hợp đồng để không bị tính phí ân hạn và đăng ký nhận lại chai nước hoa vật lý. |
| **UC-BRA-12** | **View Revenue Reports & Product Ranking** | Xem báo cáo doanh thu & xếp hạng sản phẩm | FR-RPT-06, 08, 12 | Xem thống kê số lượt xịt, doanh thu từng slot, xếp hạng mùi hương bán chạy (cô lập 100%, không thấy số liệu thương hiệu khác). |
| **UC-BRA-13** | **View Settlement & Dispute Monthly Payout** | Xem đối soát & khiếu nại kỳ chi trả | FR-SLT-52, 54 | Xem bảng tổng hợp doanh thu lượt xịt hàng tháng do nền tảng thu hộ và gửi khiếu nại đối soát nếu có sai lệch số liệu. |
| **UC-BRA-14** | **Receive Slot Alerts & Notifications** | Nhận thông báo & cảnh báo liên quan slot | FR-ALR-10, FR-EXP-03 | Nhận cảnh báo khi slot bị kẹt, hết nước hoa, sắp hết hạn hợp đồng (T-7, T-3) hoặc thông báo hoàn trả hàng tồn. |

---

## 4. Actor: Platform Super Admin (Quản trị viên Nền tảng)

| Mã Use Case | Tên Use Case (English) | Tên Tiếng Việt | FR liên quan | Mô tả tóm tắt |
| :--- | :--- | :--- | :--- | :--- |
| **UC-ADM-01** | **Manage Platform Internal Accounts** | Quản lý tài khoản nội bộ nền tảng | FR-USR-01..05 | Tạo mới tài khoản Operations Staff, Inventory Staff; vô hiệu hóa tài khoản; đặt lại mật khẩu người dùng. |
| **UC-ADM-02** | **Manage Brands & Partnership Status** | Quản lý thương hiệu & trạng thái hợp tác | FR-BND-01..03, 07 | Tạo thương hiệu thủ công, cập nhật thông tin, kích hoạt hoặc tạm đình chỉ (SUSPEND) thương hiệu vi phạm. |
| **UC-ADM-03** | **Verify Brand Legal Entity** | Xác minh pháp nhân thương hiệu | FR-BND-10 | Kiểm tra giấy phép kinh doanh, mã số thuế của thương hiệu và bấm duyệt xác minh pháp nhân trước kỳ chi trả. |
| **UC-ADM-04** | **Manage Master Agreement Templates** | Quản lý mẫu Hợp đồng khung điện tử | FR-SLT-48 | Soạn thảo, ban hành phiên bản mới của Hợp đồng khung dùng chung cho các thương hiệu đăng ký thuê slot. |
| **UC-ADM-05** | **Configure Machines, Locations & Slots** | Cấu hình máy, vị trí & slot | FR-MCH-01..06 | Tạo địa điểm lắp đặt máy; khai báo máy mới (mã serial, MQTT credential, số slot); cấu hình liều lượng xịt (ml/lượt) và ngưỡng cảnh báo cạn cho từng slot. |
| **UC-ADM-06** | **Configure Rental Plans & Storage Fees** | Cấu hình bảng giá gói thuê & bảo quản | FR-SLT-14, 30, 31 | Thiết lập giá niêm yết thuê cho từng vị trí slot, chính sách ưu đãi cho các gói kỳ hạn 3/6/12 tháng và mức phí gói bảo quản hàng hóa. |
| **UC-ADM-07** | **Approve / Reject Refill Request (RFQ)** | Duyệt / Từ chối yêu cầu nạp nước hoa | FR-RFQ-06 | Xem xét yêu cầu bổ sung nước hoa của Brand Admin, duyệt chấp thuận hoặc từ chối kèm lý do bắt buộc. |
| **UC-ADM-08** | **Manage Grace Period & Inventory Liquidation** | Quản lý chính sách ân hạn & thanh lý | FR-EXP-07, 18, 22 | Ấn định hạn chót ân hạn; định giá lượt xịt khi slot chuyển sang chế độ thanh lý tài sản thuộc sở hữu nền tảng; đóng hóa đơn thanh lý. |
| **UC-ADM-09** | **Execute Monthly Payout to Brands** | Thực hiện chi trả doanh thu cho Brand | FR-SLT-53 | Kiểm tra bảng đối soát kỳ, bấm phê duyệt và ghi nhận trạng thái đã chi trả tiền thu hộ vào tài khoản ngân hàng của thương hiệu. |
| **UC-ADM-10** | **Lookup Transactions & Trace Orders** | Tra cứu giao dịch & truy vết đơn hàng | FR-ORD-22, FR-AUD-11 | Tìm kiếm giao dịch mua lượt xịt theo nhiều tiêu chí (mã đơn, máy, slot, mốc thời gian) và truy vết toàn bộ chuỗi: Đơn → PayOS → Lệnh xịt → Cảm biến. |
| **UC-ADM-11** | **Search & Trace Audit Logs** | Tra cứu & kiểm toán Audit Log | FR-AUD-10 | Tra cứu nhật ký kiểm toán hệ thống (append-only) theo người thực hiện, thời gian, sự kiện bảo mật, thay đổi cấu hình, tiền bạc. |
| **UC-ADM-12** | **View Platform Operations Dashboard & Analytics** | Xem Dashboard vận hành & phân tích toàn nền tảng | FR-RPT-01..05, 07, 09, 15 | Xem tổng quan trạng thái tất cả các máy trên bản đồ, biểu đồ doanh thu bán gói, doanh thu lượt xịt, tỷ lệ xịt thành công/thất bại, tỷ lệ máy online/offline. |
| **UC-ADM-13** | **Revoke Access & Emergency Permissions** | Thu hồi quyền truy cập khẩn cấp | FR-AUTH-11 | Thu hồi tức thì quyền truy cập hoặc phiên làm việc của bất kỳ tài khoản người dùng hoặc máy IoT nào có dấu hiệu bất thường. |

---

## 5. Actor: Operations Staff (Nhân viên Vận hành & Kỹ thuật)

| Mã Use Case | Tên Use Case (English) | Tên Tiếng Việt | FR liên quan | Mô tả tóm tắt |
| :--- | :--- | :--- | :--- | :--- |
| **UC-OPS-01** | **Monitor Real-time Machine & Slot Telemetry** | Giám sát trạng thái máy & slot thời gian thực | FR-MCH-07, 08, 13 | Theo dõi tình trạng kết nối mạng (ONLINE/OFFLINE/UNSTABLE), chế độ máy và mức nước hoa còn lại trên từng slot. |
| **UC-OPS-02** | **Remotely Enable / Disable Machine & Slots** | Điều khiển bật / tắt máy và slot từ xa | FR-MCH-11, 12 | Khóa khẩn cấp một slot bị sự cố hoặc tạm ngưng toàn bộ máy từ xa khi phát hiện nguy cơ rò rỉ/cháy nổ. |
| **UC-OPS-03** | **Receive & Process Operational Alerts** | Quản lý & xử lý cảnh báo vận hành | FR-ALR-11, 12 | Tiếp nhận danh sách cảnh báo (cửa mở, kẹt nút, mất mạng, lỗi bơm), phân công người xử lý và cập nhật kết quả xử lý. |
| **UC-OPS-04** | **Create & Assign Maintenance Ticket** | Tạo & tiếp nhận phiếu bảo trì | FR-MNT-01..04, 07 | Tạo phiếu sự cố kỹ thuật, đặt mức độ ưu tiên, chỉ định kỹ thuật viên phụ trách đến hiện trường kiểm tra. |
| **UC-OPS-05** | **Switch Machine Operating Mode (DRAINING / MAINTENANCE)** | Điều khiển chế độ vận hành | FR-MNT-05, FR-MCH-18 | Chuyển máy sang `DRAINING` để phục vụ nốt khách đã trả tiền trước khi đưa máy về trạng thái `MAINTENANCE` an toàn. |
| **UC-OPS-06** | **Run Hardware Diagnostics & Test Spray** | Chẩn đoán kỹ thuật & thực hiện xịt thử | FR-MNT-08..11 | Đọc dữ liệu cảm biến chuyên sâu, sau đó xác thực lại mật khẩu và kích hoạt lượt xịt test kỹ thuật (lượt xịt test không ghi nhận doanh thu). |
| **UC-OPS-07** | **Complete Safety Checklist & Close Ticket** | Hoàn thành Checklist an toàn & đóng phiếu | FR-MNT-12, 13 | Hoàn tất bảng kiểm tra an toàn sau sửa chữa (kiểm tra cảm biến, đóng nắp, test xịt) trước khi chuyển máy về trạng thái `NORMAL`. |
| **UC-OPS-08** | **Process Customer Refund Claim** | Tiếp nhận & xử lý phiếu khiếu nại hoàn tiền | FR-ORD-20, 30..32 | Tiếp nhận phiếu khiếu nại do khách gửi qua mã QR sự cố, xác thực thông tin đối chiếu với log lệnh xịt, chuyển khoản thủ công cho khách và đóng phiếu. |

---

## 6. Actor: Inventory Staff (Nhân viên Quản lý Kho & Nạp hàng)

| Mã Use Case | Tên Use Case (English) | Tên Tiếng Việt | FR liên quan | Mô tả tóm tắt |
| :--- | :--- | :--- | :--- | :--- |
| **UC-INV-01** | **Receive Batch & Verify Legitimacy Documents** | Tiếp nhận lô hàng & xác minh giấy tờ | FR-INV-34, 35 | Tiếp nhận lô chai nước hoa từ thương hiệu, kiểm tra hóa đơn VAT và phiếu chứng nhận xuất xứ CO/CQ trước khi nhập kho. |
| **UC-INV-02** | **Schedule Refill Task from Approved RFQ** | Lập lịch nạp hàng từ yêu cầu RFQ | FR-RFQ-07, 08 | Lựa chọn các yêu cầu RFQ đã được Super Admin duyệt để lên lịch trình đi nạp tại trạm và tạo phiếu nạp. |
| **UC-INV-03** | **Open & Close In-Station Refill Session** | Mở & Đóng phiên nạp nước hoa tại máy | FR-INV-29..31 | Khai báo mở phiên nạp trước khi mở cửa trạm (hệ thống tạm dừng nhận đơn máy và ngắt cảnh báo cửa mở), sau khi nạp xong thực hiện đóng phiên nạp để phục hồi máy. |
| **UC-INV-04** | **Mount Bottle & Record Initial Volume** | Lắp chai mới & ghi nhận dung tích ban đầu | FR-INV-01, 02, 05, 14 | Quét mã chai, gán vào slot đích trên máy; dung tích ban đầu khai báo khi đăng ký chai là lượng còn lại khởi điểm, hệ thống trừ một liều hiệu chuẩn sau mỗi lượt xịt thành công (ADR-0019). |
| **UC-INV-05** | **Complete Post-Refill Checklist** | Hoàn thành Checklist kiểm tra sau nạp | FR-INV-05, 15 | Kiểm tra ống dẫn, độ kín của bình chứa, đóng nắp khóa chắc chắn và xác nhận hoàn tất phiên nạp để tự động chuyển RFQ sang `COMPLETED`. |
| **UC-INV-06** | **Dismount Expired Bottle & Create Return Order** | Tháo chai hết hạn & lập phiếu trả hàng | FR-EXP-26, 27 | Thực hiện tháo chai của hợp đồng đã hết hạn (chủ động không gia hạn) ra khỏi máy, đưa về kho lưu trữ và tạo phiếu sẵn sàng bàn giao cho Brand. |
| **UC-INV-07** | **Handover Returned Bottle to Brand** | Bàn giao chai trả về cho đại diện thương hiệu | FR-EXP-28 | Tiếp đón đại diện Brand đến kho nhận lại chai, ký biên bản bàn giao và đóng phiếu trả hàng. |
| **UC-INV-08** | **Manually Adjust Inventory Balance** | Điều chỉnh tồn kho thủ công | FR-INV-16 | Nhập lại lượng nước hoa thực tế sau khi kiểm tra hiện trường kèm lý do bắt buộc (có xác thực mật khẩu). |
| **UC-INV-09** | **Monitor Inventory Levels & Expiration Alerts** | Theo dõi cảnh báo tồn kho & hạn sử dụng | FR-INV-21, FR-ALR-06 | Tra cứu báo cáo tồn kho các trạm, nhận cảnh báo chai sắp cạn hoặc nước hoa quá hạn lưu trữ để chủ động xử lý. |

---

## 7. External Actor: Kiosk / Vending Machine (Thiết bị IoT)

| Mã Use Case | Tên Use Case (English) | Tên Tiếng Việt | FR liên quan | Mô tả tóm tắt |
| :--- | :--- | :--- | :--- | :--- |
| **UC-DEV-01** | **Send Periodic Heartbeat** | Gửi Heartbeat duy trì kết nối định kỳ | FR-IOT-01, 02 | Định kỳ mỗi 30 giây gửi bản tin Heartbeat báo cáo tình trạng sống của máy lên MQTT broker. |
| **UC-DEV-02** | **Report Sensor Telemetry & Hardware State** | Báo cáo Telemetry cảm biến & trạng thái | FR-IOT-04, 05 | Báo cáo thông số cảm biến tải trọng (trọng lượng bình nước hoa), trạng thái công tắc nắp cửa (đóng/mở), điện áp nguồn. |
| **UC-DEV-03** | **Receive & Execute Secure Dispense Command** | Tiếp nhận & thực thi lệnh xịt an toàn | FR-DSP-07..16 | Xác minh chữ ký số của lệnh xịt, kiểm tra điều kiện an toàn (cửa đóng, slot không bị khóa), kích hoạt rơ-le bơm xịt đúng liều lượng. |
| **UC-DEV-04** | **Control Physical Illuminated Button** | Điều khiển đèn nút bấm vật lý | FR-DSP-21..27 | Bật sáng đèn LED tại nút bấm của slot vừa thanh toán, lắng nghe tín hiệu bấm trong 60 giây, và tự tắt đèn khi hết hạn. |
| **UC-DEV-05** | **Publish Dispense Execution Result** | Gửi kết quả phản hồi lượt xịt | FR-DSP-14, 15 | Gửi bản tin MQTT xác nhận kết quả xịt thành công (`SUCCESS`) hoặc lỗi phần cứng (`FAILED`, kẹt cơ cấu) kèm thời gian thực hiện. |
| **UC-DEV-06** | **Buffer & Synchronize Offline Events** | Lưu đệm & đồng bộ sự kiện khi mất mạng | FR-IOT-10, 11 | Khi mất kết nối Internet, lưu tạm thời các sự kiện vào bộ nhớ flash và tự động gửi bù về Server ngay khi có mạng trở lại. |

---

## 8. External Actor: Payment Gateway (Cổng thanh toán PayOS)

| Mã Use Case | Tên Use Case (English) | Tên Tiếng Việt | FR liên quan | Mô tả tóm tắt |
| :--- | :--- | :--- | :--- | :--- |
| **UC-PAY-01** | **Generate Dynamic VietQR Payment Link** | Tạo liên kết thanh toán VietQR động | FR-ORD-08, FR-SLT-37 | Tạo thông tin thanh toán gồm mã đơn hàng, số tiền chính xác, mã ngân hàng và sinh chuỗi dữ liệu mã VietQR chuẩn NAPAS 247. |
| **UC-PAY-02** | **Send Instant Payment Webhook** | Gửi Webhook thông báo kết quả giao dịch | FR-ORD-12, 13 | Bắn webhook HTTP POST về Backend ScentStation kèm chữ ký bảo mật xác nhận khách/Brand đã chuyển khoản thành công. |
| **UC-PAY-03** | **Provide Payment Status Query (Polling)** | Kiểm tra trạng thái đơn hàng (Polling) | FR-ORD-15 | Cung cấp API để Backend chủ động tra cứu trạng thái thanh toán khi webhook bị chậm trễ hoặc timeout. |

---

## 9. Ma trận phân quyền Use Case theo Actor (CRUD & Execution Matrix)

| Subsystem / Function | Customer | Brand Admin | Platform Super Admin | Operations Staff | Inventory Staff |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Account & Profile** | | | | | |
| • Register Brand & Verify Email | ❌ | **Execute** | ❌ | ❌ | ❌ |
| • Manage Platform Internal Users | ❌ | ❌ | **Full CRUD** | ❌ | ❌ |
| • Declare Legal Entity & Payout Account | ❌ | **CRUD** | **Verify** | ❌ | ❌ |
| **Slot Rental & Contracts** | | | | | |
| • Rent Slot Self-serve & Sign Contract | ❌ | **Execute** | ❌ | ❌ | ❌ |
| • Swap Slot within 48h | ❌ | **Execute** | ❌ | ❌ | ❌ |
| • Configure Slot (Perfume & Price) | ❌ | **Update** | ❌ | ❌ | ❌ |
| • Manage Rental Pricing & Plans | ❌ | ❌ | **Full CRUD** | ❌ | ❌ |
| **Inventory & Refill (RFQ)** | | | | | |
| • Manage Perfume Catalog | ❌ | **CRUD (Own)** | **View All** | ❌ | ❌ |
| • Create Refill Request (RFQ) | ❌ | **Create/View** | ❌ | ❌ | ❌ |
| • Approve / Reject RFQ | ❌ | ❌ | **Approve/Reject** | ❌ | ❌ |
| • Receive Batch & Execute Refill Session | ❌ | ❌ | ❌ | ❌ | **Execute** |
| • Create Return Order for Expired Bottles | ❌ | **View/Pickup** | ❌ | ❌ | **Create/Close** |
| **Customer Kiosk Experience** | | | | | |
| • Browse Catalog & Pay via QR | **Execute** | ❌ | ❌ | ❌ | ❌ |
| • Trigger Dispense via Button | **Execute** | ❌ | ❌ | ❌ | ❌ |
| • Cancel Pending Order | **Execute** | ❌ | ❌ | ❌ | ❌ |
| • Submit Refund Claim Ticket | **Create** | ❌ | ❌ | ❌ | ❌ |
| • Process Customer Refund Claim | ❌ | ❌ | **View** | **Approve/Refund** | ❌ |
| **Machine & IoT Operations** | | | | | |
| • Remote Lock/Unlock Machine & Slots | ❌ | ❌ | **Full Control** | **Execute** | ❌ |
| • Machine Diagnostics & Test Spray | ❌ | ❌ | ❌ | **Execute** | ❌ |
| • Process Alerts & Safety Checklist | ❌ | ❌ | ❌ | **Execute** | ❌ |
| **Settlement & Reporting** | | | | | |
| • View Revenue Reports | ❌ | **View (Own)** | **View All** | ❌ | ❌ |
| • Dispute Monthly Settlement | ❌ | **Create** | **Resolve** | ❌ | ❌ |
| • Execute Monthly Payout | ❌ | ❌ | **Execute** | ❌ | ❌ |
| • View Audit Logs & Analytics | ❌ | ❌ | **Full View** | ❌ | ❌ |
