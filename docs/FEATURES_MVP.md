# ScentStation — Danh sách Feature MVP (quy đổi từ FR ưu tiên M)

Tài liệu này quy đổi các FR ưu tiên **M (Must)** trong [FR_NFR_SCENTSTATION.md](FR_NFR_SCENTSTATION.md) thành các Feature (FE) ở mức sản phẩm, phục vụ lập kế hoạch triển khai MVP.

Nguồn: **214 FR mức M**, trải trên 17 module (AUTH, BND, USR, PRD, MCH, SLT, EXP, REV, INV, RFQ, ORD, DSP, IOT, ALR, MNT, RPT, AUD).

**Phương pháp:** mỗi FR được gán cho đúng một actor chính — actor được nêu làm chủ ngữ trong câu FR ("cho phép **Brand Admin**…", "**Thiết bị** phải…"). Những FR không gắn với thao tác của một người dùng cụ thể (kiểm tra ràng buộc, tính toán, chuyển trạng thái tự động, gửi thông báo hệ thống) được gom vào actor **Hệ thống** — đây là các "engine" nghiệp vụ chạy nền, không có màn hình thao tác riêng nhưng vẫn là khối chức năng cần xây dựng. **Thiết bị (Firmware)** được giữ như một actor riêng vì đặc tả gốc coi các FR nhóm DSP/IOT có chủ ngữ "Thiết bị phải…" là ràng buộc giao diện với phần cứng, không phải yêu cầu nội tại backend.

---

## Tổng số theo actor

| Actor | Số FR-M | Số Feature |
|---|---|---|
| Khách hàng (Kiosk) | 5 | 1 |
| Dùng chung (mọi tài khoản) | 3 | 1 |
| Brand Admin | 14 | 6 |
| Platform Super Admin | 36 | 13 |
| Operations Staff | 16 | 4 |
| Inventory Staff | 9 | 2 |
| Thiết bị (Firmware) | 16 | 2 |
| Hệ thống (engine nền) | 115 | 16 |
| **Tổng** | **214** | **45** |

---

## 1. Khách hàng (Kiosk)

| Mã | Feature | FR nguồn | Số FR | Mô tả |
|---|---|---|---|---|
| F-CUS-01 | Trải nghiệm chọn sản phẩm & thanh toán trên Kiosk | FR-ORD-01, 02, 08, 11, 21 | 5 | Duyệt danh mục các slot khả dụng trên máy, xem chi tiết sản phẩm, nhận mã QR thanh toán, theo dõi trạng thái thanh toán realtime, nhận hướng dẫn xử lý khi lượt xịt thất bại sau khi đã thanh toán. |

## 2. Dùng chung (mọi tài khoản)

| Mã | Feature | FR nguồn | Số FR | Mô tả |
|---|---|---|---|---|
| F-SHR-01 | Đăng nhập, đăng xuất & bảo mật phiên | FR-AUTH-01, 04, 09 | 3 | Đăng nhập email/mật khẩu, đăng xuất thu hồi refresh token, yêu cầu xác thực lại mật khẩu trước các hành động nhạy cảm (hoàn tiền, điều chỉnh tồn kho, xịt chẩn đoán, thanh lý, đổi cấu hình máy). |

## 3. Brand Admin

| Mã | Feature | FR nguồn | Số FR | Mô tả |
|---|---|---|---|---|
| F-BR-01 | Hồ sơ thương hiệu | FR-BND-06 | 1 | Quản lý tên hiển thị, logo, mô tả, thông tin liên hệ của thương hiệu mình. |
| F-BR-02 | Quản lý danh mục sản phẩm | FR-PRD-01, 02, 03, 05 | 4 | Tạo/cập nhật/ngừng kinh doanh sản phẩm nước hoa; ghi nhận giá bán lẻ và dung tích chai đầy đủ phục vụ tính phí lưu kho. |
| F-BR-03 | Đặt giá lượt xịt slot | FR-SLT-08 | 1 | Tự do đặt giá mỗi lượt xịt cho slot đang thuê, không giới hạn giá sàn/trần. |
| F-BR-04 | Gửi & theo dõi yêu cầu bổ sung nước hoa | FR-RFQ-01, 02, 03, 10 | 4 | Tạo yêu cầu nạp thêm (kèm lý do LOW_STOCK/EXPIRING/PRODUCT_CHANGE), nhận gợi ý khi sắp hết, xem trạng thái & lịch sử yêu cầu. |
| F-BR-05 | Nhận cảnh báo ảnh hưởng đến slot | FR-ALR-10 | 1 | Nhận thông báo các cảnh báo ảnh hưởng slot của thương hiệu mình, không thấy thông tin slot của thương hiệu khác. |
| F-BR-06 | Xem báo cáo doanh thu & sản phẩm | FR-RPT-06, 08, 12 | 3 | Xem xếp hạng sản phẩm, báo cáo doanh thu/lượt xịt theo slot mình thuê, sơ đồ máy chỉ hiển thị slot của mình. |

## 4. Platform Super Admin

| Mã | Feature | FR nguồn | Số FR | Mô tả |
|---|---|---|---|---|
| F-PSA-01 | Quản lý vai trò & thu hồi quyền truy cập | FR-AUTH-06, 11 | 2 | Gán vai trò cho tài khoản; thu hồi quyền truy cập của bất kỳ người dùng hoặc thiết bị nào. |
| F-PSA-02 | Quản lý thương hiệu | FR-BND-01, 02, 03, 07 | 4 | Tạo/cập nhật thương hiệu, chuyển trạng thái ACTIVE/SUSPENDED, xem dữ liệu tổng hợp toàn bộ thương hiệu. |
| F-PSA-03 | Quản lý tài khoản người dùng nội bộ | FR-USR-01…05 | 5 | Tạo tài khoản Brand Admin và nhân sự nền tảng (Operations Staff, Inventory Staff), vô hiệu hóa tài khoản, đặt lại mật khẩu. |
| F-PSA-04 | Đăng ký máy & quản lý địa điểm | FR-MCH-01…04 | 4 | Đăng ký máy mới (serial, định danh thiết bị, credential MQTT), tạo/quản lý địa điểm, gán máy cho địa điểm. |
| F-PSA-05 | Cấu hình slot | FR-MCH-05, 06 | 2 | Cấu hình số lượng slot, mã slot, liều lượng xịt và ngưỡng cảnh báo sắp hết cho từng slot. |
| F-PSA-06 | Quản lý hợp đồng thuê slot | FR-SLT-01, 12, 14 | 3 | Tạo hợp đồng thuê slot mới, gia hạn (tạo hợp đồng kế tiếp), đóng hợp đồng LIQUIDATED sau khi xử lý xong hàng thanh lý. |
| F-PSA-07 | Quản lý ân hạn & thanh lý | FR-EXP-07, 18 | 2 | Ấn định ngày kết thúc ân hạn cho từng hợp đồng; đặt giá lượt xịt cho slot đang bán hàng thanh lý. |
| F-PSA-08 | Xem báo cáo doanh thu tách nguồn | FR-REV-04 | 1 | Xem doanh thu tách theo hai nguồn: thuộc thương hiệu và thuộc nền tảng. |
| F-PSA-09 | Xem báo cáo tồn kho | FR-INV-21 | 1 | Tạo báo cáo tồn kho theo thương hiệu, sản phẩm, lô, máy, slot, khoảng thời gian. |
| F-PSA-10 | Duyệt yêu cầu bổ sung nước hoa | FR-RFQ-06 | 1 | Chấp nhận hoặc từ chối (kèm lý do bắt buộc) yêu cầu bổ sung của Brand Admin. |
| F-PSA-11 | Tra cứu giao dịch | FR-ORD-22 | 1 | Tìm kiếm giao dịch theo thời gian, máy, slot, địa điểm, sản phẩm, mã tham chiếu, trạng thái. |
| F-PSA-12 | Dashboard vận hành nền tảng | FR-RPT-01…05, 07, 09, 15 | 8 | Số máy theo trạng thái, doanh thu/giao dịch theo thời gian, tỷ lệ xịt thành công/thất bại, đơn hàng cần kiểm tra, tồn kho ước tính, doanh thu theo máy/địa điểm/slot/thương hiệu, báo cáo tổng hợp toàn nền tảng. |
| F-PSA-13 | Tra cứu & truy vết nhật ký kiểm toán | FR-AUD-10, 11 | 2 | Tìm kiếm nhật ký theo thời gian/người dùng/máy/slot/hành động; truy vết từ một đơn hàng đến toàn bộ chuỗi liên quan. |

## 5. Operations Staff

> Gộp từ hai vai trò cũ Operations Manager và Technician (`docs/FR_NFR_SCENTSTATION.md` Phần D).
> Một vai trò duy nhất quản lý trọn vòng đời vận hành và sự cố của máy — từ bật/tắt máy, tiếp nhận
> cảnh báo, tạo và tự phân công phiếu bảo trì, đến chẩn đoán và đóng phiếu.

| Mã | Feature | FR nguồn | Số FR | Mô tả |
|---|---|---|---|---|
| F-OPS-01 | Điều khiển máy/slot từ xa | FR-MCH-11, 12 | 2 | Bật/tắt toàn bộ máy hoặc từng slot riêng lẻ từ xa. |
| F-OPS-02 | Xử lý cảnh báo | FR-ALR-11, 12 | 2 | Tiếp nhận, phân công, đóng cảnh báo; lưu người xử lý, thời điểm, nội dung xử lý. |
| F-OPS-03 | Tạo & phân công phiếu bảo trì | FR-MNT-01, 02, 03, 04, 07 | 5 | Tạo phiếu bảo trì thủ công, phân công cho một tài khoản Operations Staff cụ thể, phân loại theo mức độ/độ ưu tiên/hạn xử lý, thông báo cho Brand Admin liên quan khi máy vào chế độ MAINTENANCE. |
| F-OPS-04 | Thực hiện bảo trì & chẩn đoán thiết bị | FR-MNT-05, 08, 09, 10, 11, 12, 13 | 7 | Chuyển máy sang MAINTENANCE, xem dữ liệu cảm biến/lỗi/sự kiện, thực hiện lượt xịt chẩn đoán (sau xác thực lại), ghi kết quả/nguyên nhân/linh kiện thay thế, hoàn thành checklist trước khi đưa máy về NORMAL, đóng phiếu bảo trì. |

## 6. Inventory Staff

| Mã | Feature | FR nguồn | Số FR | Mô tả |
|---|---|---|---|---|
| F-INVS-01 | Nạp/tháo/điều chỉnh nước hoa tại máy | FR-INV-01, 02, 05, 13, 14, 15, 16 | 7 | Tạo lô nước hoa, đăng ký chai, ghi khối lượng ban đầu khi lắp, hoàn thành checklist nạp, quy trình tháo chai trả kho, điều chỉnh tồn kho kèm lý do bắt buộc. |
| F-INVS-02 | Xử lý & hoàn tất yêu cầu bổ sung | FR-RFQ-08, 09 | 2 | Liên kết yêu cầu bổ sung với phiên nạp thực tế; yêu cầu tự chuyển COMPLETED khi phiên nạp kết thúc thành công. |

## 7. Thiết bị (Firmware)

| Mã | Feature | FR nguồn | Số FR | Mô tả |
|---|---|---|---|---|
| F-DEV-01 | Thực thi lệnh xịt an toàn | FR-DSP-07…16 | 10 | Xác minh chữ ký lệnh, từ chối lệnh hết hạn/sai máy/trùng mã, từ chối khi cửa mở/đang MAINTENANCE/slot rỗng, kích hoạt đúng cơ cấu slot đích, gửi xác nhận tiếp nhận và kết quả thực hiện. |
| F-DEV-02 | Giao tiếp & báo cáo trạng thái thiết bị | FR-IOT-01, 04, 05, 10, 11, 13 | 6 | Gửi heartbeat định kỳ, telemetry (khối lượng, cửa, cơ cấu, nguồn điện), sự kiện vận hành, lưu tạm & gửi lại khi mất kết nối, hiển thị trạng thái tạm ngưng trên kiosk khi mất liên lạc. |

## 8. Hệ thống (engine nghiệp vụ chạy nền)

Nhóm này không có màn hình thao tác riêng — là logic backend bắt buộc để các feature actor-facing ở trên hoạt động đúng.

| Mã | Feature | FR nguồn | Số FR | Mô tả |
|---|---|---|---|---|
| F-SYS-01 | Phân quyền & cô lập dữ liệu theo thương hiệu | FR-AUTH-05, 07, 08 + FR-BND-04, 05, 08 | 6 | Giới hạn phạm vi dữ liệu theo hợp đồng thuê slot, từ chối truy cập ngoài phạm vi (403), không tiết lộ thông tin thương hiệu khác. |
| F-SYS-02 | Bảo mật phiên đăng nhập | FR-AUTH-02, 03, 10 | 3 | Cấp access/refresh token có thời hạn, khóa tài khoản sau 5 lần sai, thu hồi phiên trong 60s khi tài khoản bị vô hiệu hóa. |
| F-SYS-03 | Ràng buộc vận hành máy & slot | FR-MCH-07, 08, 09, 10, 13 | 5 | Ngăn gán 2 chai active cùng slot, hiển thị trạng thái kết nối/chế độ hoạt động, lưu lịch sử thay đổi cấu hình. |
| F-SYS-04 | Vòng đời & ràng buộc hợp đồng thuê slot | FR-SLT-02, 03, 04, 05, 06, 07, 09, 10, 11, 15 | 10 | Ràng buộc 1 hợp đồng active/slot, chống chồng lấn kỳ hạn, quản lý state machine hợp đồng, áp giá mới đúng thời điểm, khóa slot khi hợp đồng đóng. |
| F-SYS-05 | Sinh bảng quyết toán kỳ | FR-SLT-17, 18 | 2 | Tự động gộp toàn bộ hợp đồng của một thương hiệu trong kỳ, tính doanh thu/phí thuê/ăn chia/phí ân hạn. |
| F-SYS-06 | Quy trình tự động ân hạn, gia hạn & thanh lý | FR-EXP-01…06, 08, 09, 13…17, 19…22 | 17 | Thông báo T-7/T-3, chuyển trạng thái EXPIRING→GRACE→LIQUIDATED, chuyển quyền sở hữu chai khi thanh lý, ghi audit toàn bộ sự kiện. |
| F-SYS-07 | Phân tách & gán chủ sở hữu doanh thu | FR-REV-01, 02, 03, 05, 06 | 5 | Gán BRAND/PLATFORM cho từng đơn hàng tại thời điểm tạo, giữ nguyên dù quyền sở hữu tồn kho đổi sau đó. |
| F-SYS-08 | Theo dõi & cảnh báo tồn kho tự động | FR-INV-03, 04, 06, 07, 08, 09, 10, 11, 12, 17 | 10 | Ước tính lượng còn lại, cập nhật sau mỗi lượt xịt, sinh cảnh báo sắp hết/rò rỉ, chặn gán chai hết hạn/sai thương hiệu, chuyển slot UNAVAILABLE khi cạn. |
| F-SYS-09 | Quản lý vòng đời yêu cầu bổ sung | FR-RFQ-04, 05, 11, 12 | 4 | State machine SUBMITTED→…→COMPLETED, thông báo Platform/Inventory Staff, chặn tạo trùng yêu cầu trên cùng slot. |
| F-SYS-10 | Xử lý đơn hàng & webhook thanh toán | FR-ORD-04, 05, 06, 07, 09, 10, 12…19 | 14 | Kiểm tra điều kiện tạo đơn, lưu snapshot giá/slot/hợp đồng, sinh mã tham chiếu, xác minh chữ ký & idempotency webhook, state machine đơn hàng, xử lý hết hạn/refund flag. |
| F-SYS-11 | Sinh & ký lệnh xịt | FR-DSP-01…06, 17…20 | 10 | Chỉ tạo lệnh sau khi PAID, ký số, giới hạn 1 lệnh active/đơn, timeout 60s, chuyển DISPENSED/UNKNOWN theo kết quả thiết bị, tách riêng lượt xịt chẩn đoán. |
| F-SYS-12 | Giám sát kết nối & điều phối thiết bị MQTT | FR-IOT-02, 03, 06, 07, 08, 09, 12 | 7 | Đánh dấu UNSTABLE/OFFLINE theo heartbeat, gửi lệnh qua MQTT, xác thực & phân quyền topic theo định danh máy, chặn tạo đơn khi máy OFFLINE. |
| F-SYS-13 | Sinh & phân loại cảnh báo tự động | FR-ALR-01…09 | 9 | Sinh cảnh báo theo sự kiện (offline, sắp hết, cửa mở, xịt lỗi liên tiếp, lỗi cảm biến), phân loại mức độ nghiêm trọng, chống trùng lặp, xác định thương hiệu bị ảnh hưởng. |
| F-SYS-14 | Ràng buộc trạng thái vận hành khi bảo trì | FR-MNT-06, 14 | 2 | Chặn tạo đơn hàng khi máy MAINTENANCE, lưu lịch sử bảo trì của từng máy. |
| F-SYS-15 | Ràng buộc cô lập dữ liệu trong báo cáo | FR-RPT-10, 11 | 2 | Giới hạn phạm vi dữ liệu báo cáo theo hợp đồng thuê của thương hiệu, không hiển thị chỉ số cho phép suy ra số liệu thương hiệu khác. |
| F-SYS-16 | Ghi nhật ký kiểm toán tự động | FR-AUD-01…09 | 9 | Ghi log cho mọi sự kiện đăng nhập, đổi quyền, hợp đồng, giá, lệnh thiết bị, thanh toán, tồn kho; log append-only, không sửa/xóa được. |

---

## Đối chiếu với các cách gộp khác

| Cách gộp | Số Feature |
|---|---|
| Gộp theo module (thô) | 20 |
| **Tách chi tiết theo actor (tài liệu này)** | **45** (29 actor-facing/thiết bị + 16 engine hệ thống) |
| Chỉ tính feature có màn hình thao tác (bỏ 16 engine hệ thống) | 29 |

Gợi ý dùng: 45 feature phù hợp làm **product backlog epic** để giao việc theo actor/module cho từng dev; nếu cần trình bày cho stakeholder ở mức cao hơn, dùng lại bảng 20 feature theo module trong lần xuất trước hoặc cột "chỉ tính feature có màn hình" (29).

---

*Tài liệu cập nhật ngày 2026-09-13, dựa trên [FR_NFR_SCENTSTATION.md](FR_NFR_SCENTSTATION.md) phiên bản 2.0.*
