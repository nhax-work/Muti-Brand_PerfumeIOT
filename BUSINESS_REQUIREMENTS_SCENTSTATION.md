# BUSINESS REQUIREMENTS DOCUMENT — SCENTSTATION

## 1. Thông tin tài liệu

| Thuộc tính | Nội dung |
|---|---|
| Tên dự án | ScentStation: Nền tảng IoT đa thương hiệu cho máy trải nghiệm và quản lý nước hoa |
| Tên tiếng Anh | ScentStation: A Multi-Brand IoT Perfume Experience and Management Platform |
| Loại tài liệu | Business Requirements Document (BRD) |
| Nguồn phạm vi chính thức | `Phieu_FA26SE114.docx` |
| Phạm vi triển khai trước mắt | Nền tảng web, kiosk web, backend và cơ sở dữ liệu |
| Phạm vi triển khai sau | IoT gateway, firmware, cảm biến và máy vật lý |

## 2. Mục đích tài liệu

Tài liệu này xác định nhu cầu nghiệp vụ, phạm vi, tác nhân, quy trình, quy tắc và tiêu chí thành công của ScentStation. Đây là cơ sở để xây dựng Use Case Specification, Database Design, API Specification, kế hoạch kiểm thử và kế hoạch triển khai.

Các yêu cầu được gắn mã để duy trì khả năng truy vết:

- `BR-xxx`: yêu cầu nghiệp vụ.
- `RULE-xxx`: quy tắc nghiệp vụ bắt buộc.
- `NFR-xxx`: yêu cầu phi chức năng.
- `CON-xxx`: ràng buộc hoặc giả định.

## 3. Bối cảnh và vấn đề nghiệp vụ

Khách hàng thường cần trải nghiệm mùi hương trước khi mua sản phẩm nước hoa nguyên chai. Việc trải nghiệm hiện phụ thuộc nhiều vào cửa hàng có nhân viên và tester vật lý. Mô hình này tạo ra các vấn đề:

- Khách hàng bị giới hạn địa điểm và thời gian trải nghiệm.
- Thương hiệu khó đo lường chính xác mức độ quan tâm đến từng sản phẩm.
- Việc kiểm tra lượng nước hoa và tình trạng thiết bị chủ yếu thực hiện thủ công.
- Tester có thể hết mà không được phát hiện kịp thời.
- Hoạt động refill, bảo trì và điều chỉnh tồn kho khó truy vết.
- Thanh toán, lượt xịt và tồn kho có nguy cơ không nhất quán.
- Một nền tảng phục vụ nhiều thương hiệu phải ngăn truy cập chéo dữ liệu.

ScentStation được đề xuất để tự động hóa trải nghiệm: khách hàng chọn nước hoa trên kiosk, thanh toán bằng QR và nhận một lượt xịt có kiểm soát. Nền tảng đồng thời hỗ trợ quản lý nhiều thương hiệu, máy, sản phẩm, tồn kho, vận hành, bảo trì, giao dịch và báo cáo.

## 4. Mục tiêu nghiệp vụ

| Mã | Mục tiêu |
|---|---|
| BR-001 | Cho phép khách hàng tự trải nghiệm nước hoa thông qua kiosk mà không cần nhân viên thực hiện lượt xịt. |
| BR-002 | Bảo đảm một giao dịch được xác nhận hợp lệ tạo ra không quá một lượt xịt thành công. |
| BR-003 | Cho phép nhiều thương hiệu sử dụng chung nền tảng nhưng dữ liệu và quyền quản trị được cô lập. |
| BR-004 | Quản lý tập trung thương hiệu, người dùng, sản phẩm, địa điểm, máy và từng ngăn máy. |
| BR-005 | Quản lý chai hoặc cartridge, lô hàng, tồn kho, refill và điều chỉnh tồn kho. |
| BR-006 | Theo dõi giao dịch, thanh toán, kết quả xịt và các trường hợp cần xử lý thủ công. |
| BR-007 | Hỗ trợ giám sát thiết bị, cảnh báo và quy trình bảo trì. |
| BR-008 | Cung cấp số liệu vận hành và kinh doanh theo thương hiệu, máy, địa điểm, sản phẩm và thời gian. |
| BR-009 | Duy trì nhật ký và khả năng truy vết cho các hoạt động quan trọng. |
| BR-010 | Tạo nền tảng có thể tích hợp kiosk vật lý tối thiểu bốn ngăn và thiết bị IoT ở giai đoạn sau. |

## 5. Stakeholder và tác nhân nghiệp vụ

| Tác nhân | Trách nhiệm chính |
|---|---|
| Platform Super Administrator | Quản lý toàn nền tảng, tenant, quản trị viên thương hiệu, cấu hình dùng chung, quyền cấp nền tảng và giám sát tổng thể. |
| Brand Administrator | Quản lý người dùng, sản phẩm, địa điểm, máy, giá, tồn kho, vận hành và báo cáo trong một thương hiệu. |
| Operations Manager | Theo dõi hoạt động, giao dịch bất thường, cảnh báo và phiếu bảo trì. |
| Technician | Kiểm tra, chẩn đoán, hỗ trợ refill, sửa chữa và xác nhận máy trở lại hoạt động. |
| Inventory Staff | Quản lý lô, chai, tồn kho, lắp/tháo chai và lịch sử refill. |
| Customer/Kiosk User | Chọn sản phẩm, tạo đơn, thanh toán và nhận trạng thái lượt trải nghiệm. |
| Payment Provider | Cung cấp QR thanh toán và gửi kết quả giao dịch về backend. |
| IoT Device | Nhận lệnh, kiểm tra điều kiện an toàn, thực hiện xịt và gửi trạng thái/kết quả. |

## 6. Phạm vi dự án

### 6.1. Phạm vi sản phẩm Capstone

Phạm vi sản phẩm cuối cùng bám theo phiếu đăng ký:

- Kiosk trải nghiệm có tối thiểu bốn ngăn nước hoa điều khiển độc lập.
- Kiosk application cho phép chọn sản phẩm, thanh toán QR và theo dõi lượt xịt.
- Backend API, xác thực, RBAC và quản lý đa thương hiệu.
- IoT gateway cho telemetry, cảnh báo, lệnh an toàn và cấu hình từ xa.
- Quản lý sản phẩm, chai/cartridge, lô, tồn kho và refill.
- Quản lý vận hành, cảnh báo, bảo trì và hoạt động kỹ thuật viên.
- Đối soát giao dịch, dashboard, báo cáo, thông báo và audit log.
- Tích hợp, kiểm thử bảo mật, độ tin cậy, pilot và tài liệu bàn giao.

### 6.2. Phạm vi triển khai web-first

Giai đoạn hiện tại ưu tiên:

- Backend Node.js/NestJS.
- PostgreSQL và Prisma.
- Web quản trị đa thương hiệu.
- Kiosk chạy trên trình duyệt.
- Authentication, RBAC và tenant isolation.
- Sản phẩm, địa điểm, máy và ngăn logic.
- Đơn hàng, payment adapter, QR payment mock/sandbox và webhook.
- Tồn kho, refill, cảnh báo, bảo trì, dashboard và audit.
- Device simulator để kiểm thử nghiệp vụ trước khi có thiết bị thật.
- Contract `DeviceGateway` để tích hợp MQTT sau này.

Web-first là thứ tự triển khai, không loại IoT khỏi phạm vi Capstone.

### 6.3. Tạm hoãn đến giai đoạn IoT

- MQTT broker và IoT gateway thực tế.
- Firmware và device credential.
- Heartbeat, telemetry và sự kiện thiết bị thật.
- Load cell, cảm biến cửa, rò rỉ và nguồn điện.
- Cơ cấu xịt, hiệu chuẩn và kiểm thử độ bền.
- Ký/xác minh lệnh tại thiết bị.
- Lưu cục bộ và đồng bộ sự kiện khi thiết bị mất mạng.
- OTA firmware.

## 7. Yêu cầu nghiệp vụ theo miền

### 7.1. Quản lý nền tảng và thương hiệu

| Mã | Yêu cầu |
|---|---|
| BR-011 | Platform Super Administrator có thể tạo, cập nhật, kích hoạt hoặc tạm ngưng tenant thương hiệu. |
| BR-012 | Platform Super Administrator có thể tạo và quản lý Brand Administrator cho từng tenant. |
| BR-013 | Hệ thống hỗ trợ cấu hình dùng chung như payment provider, chính sách thiết bị, thông báo và tham số hệ thống. |
| BR-014 | Platform Super Administrator xem được thống kê và trạng thái tổng hợp toàn nền tảng. |
| BR-015 | Brand Administrator có thể quản lý thông tin và nội dung hiển thị của thương hiệu. |
| BR-016 | Dữ liệu nghiệp vụ phải luôn được liên kết với tenant sở hữu. |

### 7.2. Người dùng và quyền truy cập

| Mã | Yêu cầu |
|---|---|
| BR-020 | Hệ thống cho phép tạo, cập nhật, khóa, vô hiệu hóa và đặt lại tài khoản theo thẩm quyền. |
| BR-021 | Một người dùng thuộc một tenant và có thể có một hoặc nhiều vai trò. |
| BR-022 | Quyền có thể giới hạn theo chức năng, tenant, địa điểm, máy hoặc trách nhiệm vận hành. |
| BR-023 | Hệ thống thu hồi phiên hoạt động khi tài khoản bị vô hiệu hóa. |
| BR-024 | Hoàn tiền, điều chỉnh tồn kho, xịt chẩn đoán và cấu hình máy yêu cầu quyền bổ sung. |
| BR-025 | Hệ thống ghi nhận đăng nhập, thay đổi tài khoản, vai trò và quyền. |

### 7.3. Sản phẩm, địa điểm, máy và ngăn

| Mã | Yêu cầu |
|---|---|
| BR-030 | Brand Administrator quản lý sản phẩm gồm tên, mô tả, hình ảnh, tầng hương, giá mỗi lượt và trạng thái. |
| BR-031 | Brand Administrator quản lý địa điểm và phân bổ máy cho địa điểm. |
| BR-032 | Mỗi máy được đăng ký bằng serial number và device identity duy nhất. |
| BR-033 | Mỗi máy thuộc đúng một tenant và một địa điểm tại một thời điểm. |
| BR-034 | Hệ thống quản lý các ngăn độc lập của từng máy. |
| BR-035 | Mỗi ngăn có thể được cấu hình sản phẩm, giá, ngưỡng tồn, liều lượng/thời gian xịt và trạng thái khả dụng. |
| BR-036 | Người có quyền có thể bật/tắt toàn bộ máy hoặc từng ngăn. |
| BR-037 | Hệ thống lưu lịch sử lắp đặt, di chuyển, cấu hình và bảo trì máy. |

### 7.4. Kiosk và trải nghiệm khách hàng

| Mã | Yêu cầu |
|---|---|
| BR-040 | Kiosk hiển thị các nước hoa khả dụng tại máy cùng thương hiệu, mô tả, tầng hương, ảnh, giá và hướng dẫn. |
| BR-041 | Khách hàng có thể chọn và xác nhận một sản phẩm trước khi tạo đơn. |
| BR-042 | Kiosk hiển thị QR thanh toán riêng cho từng đơn. |
| BR-043 | Kiosk hiển thị trạng thái thanh toán gồm chờ, thành công, thất bại, hủy và hết hạn. |
| BR-044 | Kiosk hướng dẫn khách đặt giấy thử hoặc cổ tay đúng vị trí. |
| BR-045 | Kiosk hiển thị trạng thái xử lý, thành công hoặc thất bại của lượt xịt. |
| BR-046 | Khi thanh toán thành công nhưng xịt không thành công, kiosk phải đưa ra hướng dẫn xử lý rõ ràng. |
| BR-047 | Kiosk tự trở về màn hình chính sau khi hoàn tất hoặc hết thời gian chờ. |
| BR-048 | QR sản phẩm có thể dẫn khách đến thông tin, khuyến mãi hoặc kênh mua sản phẩm đầy đủ. |

### 7.5. Đơn hàng và thanh toán

| Mã | Yêu cầu |
|---|---|
| BR-050 | Chỉ tạo đơn khi máy và ngăn được chọn đang khả dụng. |
| BR-051 | Đơn lưu snapshot tenant, máy, ngăn, sản phẩm, giá, tiền tệ và hạn thanh toán. |
| BR-052 | Mỗi đơn có mã tham chiếu và QR thanh toán duy nhất. |
| BR-053 | Backend nhận, xác minh và xử lý webhook của payment provider. |
| BR-054 | Webhook phải được kiểm tra chữ ký, tham chiếu, số tiền, tiền tệ và trạng thái. |
| BR-055 | Thông báo thanh toán trùng không được xử lý nhiều lần. |
| BR-056 | Đơn chưa thanh toán được chuyển sang hết hạn sau thời gian cấu hình. |
| BR-057 | Đơn thất bại, đã hủy hoặc hết hạn không được tạo lệnh xịt. |
| BR-058 | Hệ thống lưu toàn bộ lịch sử trạng thái đơn và thanh toán. |
| BR-059 | Hệ thống hỗ trợ manual review hoặc hoàn tiền khi đã thanh toán nhưng xịt không thành công. |
| BR-060 | Người có quyền có thể tìm kiếm và đối soát giao dịch. |

### 7.6. Quản lý lượt xịt an toàn

| Mã | Yêu cầu |
|---|---|
| BR-061 | Backend chỉ tạo lệnh xịt sau khi xác nhận thanh toán thành công. |
| BR-062 | Mỗi lệnh có ID duy nhất, máy/ngăn đích, thời gian tạo, hạn hiệu lực và chữ ký. |
| BR-063 | Một đơn không có nhiều hơn một lệnh xịt đang hiệu lực. |
| BR-064 | Thiết bị phải xác nhận tiếp nhận và gửi kết quả thực hiện cuối cùng. |
| BR-065 | Thiết bị từ chối lệnh sai, hết hạn, trùng hoặc không đúng máy. |
| BR-066 | Không xịt khi máy bảo trì, cửa mở, ngăn rỗng hoặc có lỗi nghiêm trọng. |
| BR-067 | Hệ thống chỉ chuyển đơn sang `DISPENSED` sau kết quả thành công từ thiết bị. |
| BR-068 | Timeout hoặc kết quả không rõ không được tự động tạo lượt xịt thứ hai. |
| BR-069 | Kết quả thất bại hoặc không rõ phải được chuyển sang quy trình kiểm tra vận hành. |

### 7.7. Tồn kho và refill

| Mã | Yêu cầu |
|---|---|
| BR-070 | Hệ thống quản lý lô hàng gồm sản phẩm, số lô, số lượng, ngày nhập và hạn dùng. |
| BR-071 | Mỗi chai/cartridge được đăng ký bằng mã duy nhất và có trạng thái vòng đời. |
| BR-072 | Một chai đang hoạt động được gán vào đúng một ngăn tại một thời điểm. |
| BR-073 | Mỗi lần refill/thay chai lưu người thực hiện, thời gian, máy, ngăn, chai cũ/mới và số đo trước/sau. |
| BR-074 | Hệ thống ước tính lượng còn lại từ lượng ban đầu, lượt xịt thành công và mức tiêu thụ hiệu chuẩn. |
| BR-075 | Hệ thống có thể đối chiếu tồn kho ước tính với dữ liệu cảm biến. |
| BR-076 | Ngăn được chuyển sang không khả dụng khi không đủ nước hoa cho một lượt an toàn. |
| BR-077 | Điều chỉnh tồn kho chỉ dành cho người có quyền và bắt buộc có lý do. |
| BR-078 | Hệ thống lưu lịch sử lắp, refill, tháo, điều chỉnh và hủy chai. |
| BR-079 | Hệ thống cung cấp báo cáo tồn kho và cảnh báo sắp hết, bất thường hoặc sắp hết hạn. |

### 7.8. Cảnh báo và bảo trì

| Mã | Yêu cầu |
|---|---|
| BR-080 | Hệ thống tạo cảnh báo cho máy offline, tồn thấp, ngăn rỗng, cửa mở, rò rỉ, lỗi cảm biến/cơ cấu và xịt thất bại. |
| BR-081 | Cảnh báo được phân loại theo loại, mức độ, trạng thái, máy, địa điểm và thời điểm. |
| BR-082 | Hệ thống hạn chế cảnh báo trùng cho cùng một sự cố chưa xử lý. |
| BR-083 | Người có quyền có thể tiếp nhận, phân công, xử lý hoặc mở lại cảnh báo. |
| BR-084 | Cảnh báo nghiêm trọng có thể tự động tạo phiếu bảo trì. |
| BR-085 | Phiếu bảo trì có loại sự cố, mức độ, ưu tiên, người phụ trách, hạn và trạng thái. |
| BR-086 | Kỹ thuật viên ghi chẩn đoán, xử lý, linh kiện, chi phí, ghi chú và bằng chứng. |
| BR-087 | Máy có sự cố nghiêm trọng không được nhận đơn mới. |
| BR-088 | Máy chỉ trở lại hoạt động sau checklist và kiểm tra sau bảo trì đạt yêu cầu. |
| BR-089 | Hệ thống lưu lịch sử và báo cáo downtime, lỗi lặp, tần suất bảo trì và thời gian xử lý. |

### 7.9. Dashboard, báo cáo và audit

| Mã | Yêu cầu |
|---|---|
| BR-090 | Dashboard hiển thị máy theo trạng thái, giao dịch, doanh thu và kết quả xịt. |
| BR-091 | Dashboard xác định trường hợp thanh toán thành công nhưng chưa xác nhận xịt. |
| BR-092 | Hệ thống báo cáo sản phẩm phổ biến, tồn kho, nhu cầu refill, uptime, downtime và cảnh báo. |
| BR-093 | Báo cáo được lọc theo quyền, tenant, địa điểm, máy, sản phẩm và thời gian. |
| BR-094 | Người có quyền có thể xuất CSV hoặc Excel. |
| BR-095 | Chỉ Platform Super Administrator xem được dữ liệu tổng hợp toàn nền tảng. |
| BR-096 | Audit log lưu actor, tenant, hành động, đối tượng, thời gian, nguồn và dữ liệu trước/sau. |
| BR-097 | Người dùng thông thường không được sửa hoặc xóa audit log. |
| BR-098 | Hệ thống truy vết được từ order đến payment, command, result, inventory, incident và refund. |

### 7.10. Giám sát và giao tiếp IoT

Các yêu cầu này thuộc phạm vi sản phẩm cuối nhưng được triển khai sau web-first.

| Mã | Yêu cầu |
|---|---|
| BR-100 | Hệ thống nhận heartbeat và xác định thiết bị online, không ổn định hoặc offline. |
| BR-101 | Hệ thống nhận telemetry về tồn kho, cửa, rò rỉ, cơ cấu và nguồn. |
| BR-102 | Hệ thống nhận sự kiện khởi động, tắt, kết nối lại, bảo trì và lỗi. |
| BR-103 | Hệ thống gửi lệnh xịt, chẩn đoán, yêu cầu trạng thái và cấu hình qua kênh an toàn. |
| BR-104 | Mỗi command phải được liên kết với ACK và kết quả cuối cùng. |
| BR-105 | Thiết bị có thể lưu tạm sự kiện khi mất mạng và đồng bộ không trùng khi kết nối lại. |
| BR-106 | Hệ thống theo dõi firmware và configuration version. |
| BR-107 | Hệ thống từ chối thiết bị chưa đăng ký, bị thu hồi hoặc có credential không hợp lệ. |

## 8. Quy tắc nghiệp vụ

| Mã | Quy tắc |
|---|---|
| RULE-001 | Mỗi máy thuộc đúng một tenant tại một thời điểm. |
| RULE-002 | Mỗi ngăn chỉ có một chai/cartridge hoạt động tại một thời điểm. |
| RULE-003 | Khách chỉ được chọn sản phẩm khả dụng trong máy online và vận hành bình thường. |
| RULE-004 | Sản phẩm và giá của đơn được cố định tại thời điểm tạo. |
| RULE-005 | Chỉ backend được quyền xác nhận payment thành công. |
| RULE-006 | Ảnh chụp hoặc kết quả hiển thị tại kiosk không phải bằng chứng thanh toán. |
| RULE-007 | Một đơn thanh toán thành công tạo không quá một lượt xịt thành công. |
| RULE-008 | Lệnh hết hạn, sai, trùng hoặc sai máy phải bị thiết bị từ chối. |
| RULE-009 | Không xịt khi cửa mở, máy bảo trì, ngăn rỗng hoặc có lỗi phần cứng nghiêm trọng. |
| RULE-010 | Không nhận đơn mới khi máy không thể giao tiếp với backend. |
| RULE-011 | Chỉ lượt xịt khách hàng được xác nhận thành công mới làm giảm tồn kho bán hàng. |
| RULE-012 | Lượt xịt chẩn đoán phải được ghi riêng và vẫn được tính vào lượng nước hoa thực tế đã dùng. |
| RULE-013 | Refill, điều chỉnh tồn, xịt chẩn đoán, đổi giá, đổi quyền và hoàn tiền đều phải có audit log. |
| RULE-014 | Người dùng một tenant không được truy cập dữ liệu tenant khác. |
| RULE-015 | Kết quả xịt không rõ phải được review và không tự động tạo command mới. |
| RULE-016 | Máy bảo trì chỉ trở lại hoạt động sau checklist và kiểm tra sau bảo trì thành công. |
| RULE-017 | Webhook, command và event có khả năng gửi lại phải được xử lý idempotent. |
| RULE-018 | Thao tác hoàn tiền, điều chỉnh tồn và xịt chẩn đoán yêu cầu quyền riêng. |

## 9. Yêu cầu phi chức năng

| Mã | Nhóm | Yêu cầu |
|---|---|---|
| NFR-001 | Hiệu năng | Trạng thái thanh toán và trạng thái máy được cập nhật với độ trễ thấp trong điều kiện mạng bình thường. |
| NFR-002 | Sẵn sàng | Hệ thống phải vô hiệu hóa giao dịch mới một cách rõ ràng khi máy không thể xịt an toàn. |
| NFR-003 | Bảo mật | API và giao tiếp thiết bị sử dụng TLS trong môi trường triển khai. |
| NFR-004 | Bảo mật | Hệ thống áp dụng authentication, RBAC, tenant isolation và audit log. |
| NFR-005 | Bảo mật | Mật khẩu được băm an toàn; token có thời hạn và cơ chế thu hồi. |
| NFR-006 | Tin cậy | Webhook, command và retry phải idempotent và truy vết được. |
| NFR-007 | Tin cậy | Một giao dịch hợp lệ không được tạo quá một lượt xịt thành công. |
| NFR-008 | Mở rộng | Hệ thống hỗ trợ nhiều tenant, địa điểm, máy, ngăn và người dùng đồng thời. |
| NFR-009 | Dễ sử dụng | Admin và kiosk responsive, dễ hiểu và có thông báo rõ cho các trạng thái chính. |
| NFR-010 | Bảo trì | Các module phải có ranh giới rõ, có thể kiểm thử và quan sát được. |
| NFR-011 | An toàn | Thiết bị phải thực thi điều kiện cửa, tồn kho, timeout và giới hạn kích hoạt độc lập với giao diện. |
| NFR-012 | Dữ liệu | Tiền tệ và số liệu tồn kho phải dùng kiểu dữ liệu chính xác, không dùng floating-point cho tiền. |
| NFR-013 | Thời gian | Thời điểm trong database được lưu theo UTC và chuyển đổi theo múi giờ giao diện. |
| NFR-014 | Phục hồi | Database phải có cơ chế backup, restore và migration có kiểm soát. |

## 10. Giả định và ràng buộc

| Mã | Nội dung |
|---|---|
| CON-001 | Backend sử dụng Node.js, NestJS và TypeScript. |
| CON-002 | Database nghiệp vụ chính sử dụng PostgreSQL và Prisma. |
| CON-003 | Giao diện quản trị và kiosk sử dụng Next.js/TypeScript. |
| CON-004 | Giai đoạn web-first sử dụng device simulator thay cho thiết bị thật. |
| CON-005 | Simulator phải tuân theo cùng contract với IoT gateway tương lai. |
| CON-006 | Payment ban đầu được tích hợp qua mock, sau đó qua sandbox trước production. |
| CON-007 | Triển khai thương mại cần đánh giá thêm về an toàn điện, cháy, vật liệu chứa cồn, cảnh báo người dùng và quy định thanh toán. |
| CON-008 | Prototype phần cứng cuối cùng phải có ít nhất bốn ngăn điều khiển độc lập. |

## 11. Tiêu chí thành công nghiệp vụ

| Mã | Tiêu chí |
|---|---|
| SC-001 | Khách hoàn thành được luồng chọn nước hoa, thanh toán QR và nhận kết quả lượt trải nghiệm. |
| SC-002 | Một payment hợp lệ không tạo quá một lượt xịt thành công, kể cả khi webhook hoặc command được gửi lại. |
| SC-003 | Không có truy cập chéo dữ liệu giữa hai tenant trong kiểm thử. |
| SC-004 | Brand Administrator quản lý được sản phẩm, giá, địa điểm, máy và bốn ngăn. |
| SC-005 | Hệ thống quản lý được lô, chai, gán chai, refill, tồn ước tính và điều chỉnh tồn. |
| SC-006 | Operations Manager phát hiện và xử lý được trường hợp đã trả tiền nhưng xịt thất bại hoặc không rõ. |
| SC-007 | Cảnh báo nghiêm trọng có thể tạo và đi qua vòng đời phiếu bảo trì. |
| SC-008 | Dashboard và báo cáo hiển thị đúng theo tenant và phạm vi quyền. |
| SC-009 | Các hành động nhạy cảm có audit log và truy vết đầu cuối. |
| SC-010 | Nghiệp vụ web hoạt động với simulator và có thể chuyển sang MQTT gateway mà không viết lại order/payment. |

## 12. Ngoài phạm vi phiên bản đầu

Các nội dung sau không phải ưu tiên của Web MVP đầu tiên nhưng có thể thuộc giai đoạn nâng cao:

- Thanh toán production và vận hành thương mại thực tế.
- OTA firmware hoàn chỉnh.
- Phân tích dự báo tồn kho bằng machine learning.
- Ứng dụng di động riêng.
- Chương trình khách hàng thân thiết.
- Tích hợp sâu với hệ thống ERP/CRM của thương hiệu.
- Tự động tối ưu giá hoặc chiến dịch.

## 13. Ma trận truy vết cấp cao

| Mục tiêu | Nhóm yêu cầu liên quan |
|---|---|
| Trải nghiệm tự phục vụ | BR-040 đến BR-069 |
| Đa thương hiệu và phân quyền | BR-011 đến BR-025, RULE-014 |
| Quản lý máy và sản phẩm | BR-030 đến BR-037 |
| Tồn kho và refill | BR-070 đến BR-079 |
| Vận hành và bảo trì | BR-080 đến BR-089 |
| Báo cáo và truy vết | BR-090 đến BR-098 |
| Tích hợp IoT sau web-first | BR-100 đến BR-107 |
| An toàn payment-to-spray | RULE-005 đến RULE-010, RULE-015, RULE-017 |

Ma trận chi tiết giữa `BR`, `RULE`, `UC`, bảng dữ liệu, API và test case sẽ được bổ sung sau khi hoàn thành Use Case Specification và Database Design.
