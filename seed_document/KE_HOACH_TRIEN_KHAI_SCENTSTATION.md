# Kế hoạch triển khai dự án ScentStation

## 1. Tổng quan dự án

**Tên dự án:** ScentStation — Nền tảng IoT đa thương hiệu cho máy trải nghiệm và quản lý nước hoa.

ScentStation là hệ thống cho phép khách hàng lựa chọn một loại nước hoa trên màn hình kiosk, thanh toán bằng mã QR và nhận đúng một lượt xịt. Một máy có thể chứa nhiều loại nước hoa trong các ngăn độc lập. Toàn bộ máy được kết nối với nền tảng quản trị trung tâm để theo dõi giao dịch, lượng nước hoa còn lại, tình trạng thiết bị, lịch nạp nước hoa và hoạt động bảo trì.

Hệ thống được thiết kế theo mô hình đa thương hiệu. Mỗi thương hiệu có không gian quản trị và dữ liệu riêng, trong khi quản trị viên cấp cao có thể quản lý toàn bộ nền tảng.

## 2. Mục tiêu

### 2.1. Mục tiêu nghiệp vụ

- Cho phép khách hàng trải nghiệm nước hoa thuận tiện mà không cần nhân viên trực tiếp phục vụ.
- Tạo thêm kênh quảng bá và thu thập dữ liệu về mức độ quan tâm đối với từng mùi hương.
- Giúp thương hiệu quản lý máy, sản phẩm thử, giao dịch và bảo trì từ xa.
- Hạn chế thất thoát nước hoa và giảm công việc kiểm tra thủ công.
- Hỗ trợ vận hành nhiều thương hiệu trên cùng một nền tảng nhưng bảo đảm dữ liệu độc lập.

### 2.2. Mục tiêu kỹ thuật

- Chế tạo máy mẫu có tối thiểu bốn ngăn nước hoa điều khiển độc lập.
- Bảo đảm một giao dịch hợp lệ chỉ tạo tối đa một lượt xịt.
- Giám sát trạng thái máy và lượng nước hoa gần thời gian thực.
- Hỗ trợ thanh toán QR và xác minh giao dịch tại backend.
- Cung cấp cổng quản trị web theo mô hình multi-tenant và phân quyền theo vai trò.
- Lưu được lịch sử vận hành, giao dịch, cảnh báo, refill và bảo trì.

## 3. Phạm vi phiên bản Capstone/MVP

### 3.1. Trong phạm vi

- Một đến ba máy mẫu.
- Tối thiểu bốn ngăn nước hoa trên mỗi máy.
- Màn hình cảm ứng hoặc máy tính bảng chạy chế độ kiosk.
- Danh mục nước hoa và giá theo từng ngăn.
- Một phương thức thanh toán QR có môi trường sandbox hoặc mô phỏng sát thực tế.
- Điều khiển một lượt xịt sau khi backend xác nhận thanh toán.
- Theo dõi máy online/offline và heartbeat.
- Ước tính lượng nước hoa còn lại bằng số lượt xịt kết hợp cảm biến khối lượng nếu khả thi.
- Quản lý thương hiệu, người dùng, vai trò, máy, địa điểm và sản phẩm.
- Quản lý chai/hộp nước hoa, refill, cảnh báo và phiếu bảo trì.
- Dashboard và báo cáo cơ bản.
- Nhật ký kiểm toán đối với các hành động quan trọng.

### 3.2. Ngoài phạm vi MVP

- AI nhận diện khuôn mặt hoặc phân tích khách hàng bằng camera.
- AI tư vấn mùi hương chuyên sâu.
- Chương trình thành viên và tích điểm phức tạp.
- Nhiều cổng thanh toán cùng lúc.
- Giao dịch thanh toán hoàn toàn ngoại tuyến.
- Quản lý chuỗi cung ứng hoặc ERP đầy đủ.
- Sản xuất máy ở quy mô thương mại.

## 4. Đối tượng sử dụng và phân quyền

| Vai trò | Phạm vi và quyền chính |
|---|---|
| Platform Super Admin | Quản lý toàn bộ thương hiệu, quản trị viên thương hiệu, cấu hình nền tảng, tình trạng hệ thống và audit log |
| Brand Admin | Quản lý người dùng, nước hoa, giá, địa điểm, máy, chiến dịch và báo cáo của một thương hiệu |
| Operations Manager | Theo dõi hoạt động máy, giao dịch, cảnh báo, tồn kho và lịch vận hành |
| Technician | Xem máy được phân công, thực hiện chẩn đoán, refill và xử lý phiếu bảo trì |
| Inventory Staff | Quản lý chai/hộp nước hoa, lô hàng, nạp mới và chênh lệch tồn kho |
| Finance/Viewer | Xem giao dịch, hoàn tiền, đối soát và báo cáo trong phạm vi được cấp |
| Customer | Chọn nước hoa, thanh toán và nhận một lượt xịt tại kiosk |

Mọi dữ liệu nghiệp vụ của thương hiệu phải gắn với `tenant_id`. Backend phải tự xác định tenant từ tài khoản đăng nhập, không tin `tenant_id` do giao diện tùy ý gửi lên.

## 5. Kiến trúc tổng thể

```text
Khách hàng
    │
    ▼
Ứng dụng kiosk ──────── Nhà cung cấp thanh toán QR
    │ HTTPS                        │ webhook
    ▼                              ▼
Backend API ───────────── Payment Module
    │
    ├── PostgreSQL
    ├── Redis / Background Jobs
    ├── Object Storage
    └── MQTT Broker
             │
             ▼
      Bộ điều khiển IoT
             │
       ┌─────┼─────────┐
       ▼     ▼         ▼
     Bơm   Cảm biến   Khóa/cửa

Cổng quản trị web ──HTTPS── Backend API
```

### 5.1. Định hướng kiến trúc phần mềm

Trong giai đoạn Capstone nên sử dụng **modular monolith** thay vì triển khai nhiều microservice. Backend vẫn được chia thành các module độc lập về nghiệp vụ:

- Identity & Access.
- Tenant & Brand.
- Machine & IoT.
- Fragrance Catalog.
- Order & Dispensing.
- Payment & Reconciliation.
- Inventory & Refill.
- Maintenance.
- Notification.
- Dashboard & Reporting.
- Audit Log.

Kiến trúc này giảm độ phức tạp triển khai nhưng vẫn cho phép tách service sau này.

## 6. Thiết kế phần cứng

### 6.1. Thành phần đề xuất

| Thành phần | Công dụng |
|---|---|
| Android tablet hoặc mini PC | Chạy giao diện kiosk |
| ESP32 hoặc STM32 | Điều khiển cơ cấu xịt và đọc cảm biến |
| Servo/solenoid hoặc bơm định lượng | Tạo một lượt xịt |
| Load cell và HX711 | Đo khối lượng chai để ước tính lượng còn lại |
| Cảm biến cửa | Ngăn hoạt động khi cửa bảo trì đang mở |
| Cảm biến rò rỉ | Phát hiện dung dịch ở khay chứa nếu được trang bị |
| Relay/MOSFET và mạch bảo vệ | Điều khiển cơ cấu chấp hành an toàn |
| Wi-Fi/4G/Ethernet | Kết nối backend và MQTT broker |
| Nguồn điện ổn định | Cấp nguồn riêng phù hợp cho máy tính và cơ cấu chấp hành |
| Nút dừng khẩn cấp | Dừng thiết bị khi có tình huống bất thường |

### 6.2. Phương án tạo lượt xịt

Có thể thử nghiệm hai phương án:

1. **Servo/solenoid nhấn đầu xịt nguyên bản:** dễ làm nguyên mẫu, giảm tiếp xúc giữa nước hoa và ống dẫn nhưng cần bộ gá phù hợp với từng loại chai.
2. **Bơm định lượng và đường ống riêng:** dễ kiểm soát thể tích hơn nhưng phải kiểm tra độ tương thích của ống, gioăng và bơm với cồn và tinh dầu.

Đối với MVP, nên ưu tiên cơ cấu nhấn đầu xịt nguyên bản nếu kết quả kiểm thử cho độ ổn định chấp nhận được. Mỗi mùi hương phải có vòi hoặc đường dẫn riêng để tránh lẫn mùi.

### 6.3. Quy tắc an toàn tại firmware

Firmware chỉ kích hoạt cơ cấu xịt khi:

- Lệnh có mã duy nhất và chữ ký hợp lệ.
- Lệnh chưa hết hạn và chưa từng được thực hiện.
- Đúng mã máy và đúng ngăn.
- Cửa máy đang đóng.
- Ngăn còn đủ nước hoa.
- Không có lỗi bơm, servo hoặc cảm biến nghiêm trọng.
- Máy không ở chế độ bảo trì hoặc dừng khẩn cấp.
- Khoảng nghỉ tối thiểu giữa hai lần kích hoạt đã kết thúc.

Firmware phải giới hạn thời gian kích hoạt tối đa để lỗi phần mềm không làm bơm hoặc servo hoạt động liên tục.

## 7. Luồng giao dịch và xịt nước hoa

```text
CREATED
   │
   ▼
PENDING_PAYMENT ─────► PAYMENT_FAILED / EXPIRED
   │ webhook hợp lệ
   ▼
PAID
   │ tạo lệnh duy nhất
   ▼
DISPENSE_REQUESTED
   ├─────────────────► DISPENSE_FAILED
   │ máy xác nhận
   ▼
DISPENSED
```

Quy trình chi tiết:

1. Khách chọn nước hoa trên kiosk.
2. Kiosk yêu cầu backend tạo đơn hàng.
3. Backend kiểm tra ngăn, tồn kho và trạng thái máy.
4. Backend tạo yêu cầu thanh toán và trả về mã QR.
5. Kiosk hiển thị QR và theo dõi trạng thái đơn.
6. Nhà cung cấp thanh toán gọi webhook về backend.
7. Backend xác minh chữ ký, số tiền, mã giao dịch và trạng thái.
8. Backend chuyển đơn sang `PAID` đúng một lần.
9. Backend tạo `DispenseCommand` có mã duy nhất, thời hạn và chữ ký.
10. Lệnh được gửi tới máy qua MQTT.
11. Firmware kiểm tra điều kiện an toàn và thực hiện một chu kỳ xịt.
12. Máy gửi kết quả, thông số cảm biến và mã lỗi về backend.
13. Backend cập nhật đơn, tồn kho, báo cáo và giao diện kiosk.
14. Nếu xịt thất bại, hệ thống tạo yêu cầu xử lý lại có kiểm soát hoặc hoàn tiền.

### 7.1. Chống xịt trùng

- Webhook thanh toán phải idempotent.
- `provider_transaction_id` phải là duy nhất.
- Mỗi đơn chỉ có một lệnh xịt đang hiệu lực.
- `command_id` phải là duy nhất và được lưu cả ở server lẫn thiết bị.
- Thiết bị lưu danh sách lệnh gần nhất để không thực hiện lại sau khi khởi động hoặc kết nối lại.
- Retry chỉ gửi lại cùng `command_id`, không tạo lệnh mới tùy tiện.

## 8. Hoạt động khi mất mạng

Trong MVP áp dụng chính sách an toàn:

- Máy mất kết nối backend sẽ không nhận giao dịch mới.
- Giao dịch đã được xác nhận và lệnh đã tới máy có thể hoàn thành nếu lệnh còn hạn.
- Telemetry và log chưa gửi được lưu tạm cục bộ.
- Khi có mạng, máy đồng bộ log theo mã sự kiện duy nhất để tránh dữ liệu trùng.
- Kiosk hiển thị rõ máy tạm ngưng thay vì tiếp tục cho khách thanh toán.

## 9. Các chức năng phần mềm

### 9.1. Ứng dụng kiosk

- Màn hình chờ và nội dung quảng bá.
- Danh sách nước hoa hiện có tại máy.
- Thông tin mùi hương, thương hiệu, giá và hướng dẫn.
- Tạo đơn và hiển thị mã QR.
- Theo dõi trạng thái thanh toán.
- Hướng dẫn đặt giấy thử hoặc cổ tay đúng vị trí.
- Hiển thị trạng thái đang xịt, thành công hoặc thất bại.
- Tự quay về màn hình chính sau một khoảng thời gian.
- Chế độ kỹ thuật yêu cầu xác thực riêng.

### 9.2. Cổng quản trị web

- Đăng nhập, đổi mật khẩu và quản lý phiên đăng nhập.
- Quản lý thương hiệu và người dùng.
- Quản lý vai trò và quyền.
- Quản lý địa điểm và máy.
- Sơ đồ ngăn chứa trên từng máy.
- Danh mục nước hoa, hình ảnh và giá.
- Quản lý chai/hộp, lô hàng và lần refill.
- Danh sách đơn hàng và giao dịch.
- Đối soát thanh toán và xử lý hoàn tiền.
- Quản lý cảnh báo và phiếu bảo trì.
- Dashboard, biểu đồ và xuất báo cáo.
- Nhật ký hành động quan trọng.

### 9.3. Giám sát IoT

- Đăng ký và kích hoạt thiết bị.
- Heartbeat định kỳ.
- Trạng thái online/offline.
- Phiên bản firmware và cấu hình máy.
- Dữ liệu cảm biến theo từng ngăn.
- Gửi lệnh xịt, lệnh kiểm tra và cấu hình.
- Nhận kết quả lệnh và mã lỗi.
- Cảnh báo mất mạng, sắp hết, cửa mở, rò rỉ và lỗi cơ cấu.
- Hỗ trợ cập nhật firmware có chữ ký trong giai đoạn nâng cao.

## 10. Mô hình dữ liệu đề xuất

### 10.1. Các entity chính

| Entity | Nội dung chính |
|---|---|
| Tenant | Thương hiệu/khách hàng sử dụng nền tảng |
| User, Role, Permission | Tài khoản và phân quyền |
| Location | Địa điểm đặt máy |
| Machine | Thông tin và trạng thái máy |
| MachineSlot | Ngăn chứa, cấu hình và sản phẩm đang lắp |
| DeviceCredential | Định danh và thông tin xác thực thiết bị |
| FragranceProduct | Danh mục nước hoa |
| Bottle/Cartridge | Chai hoặc hộp nước hoa cụ thể |
| InventoryBatch | Lô hàng, ngày nhập và hạn dùng |
| RefillSession | Lịch sử nạp/thay chai |
| Order | Đơn mua một lượt trải nghiệm |
| Payment | Giao dịch và dữ liệu đối soát |
| DispenseCommand | Lệnh xịt duy nhất gửi tới máy |
| DispenseResult | Kết quả xịt và mã lỗi |
| SensorReading | Dữ liệu cảm biến |
| Alert | Cảnh báo vận hành |
| MaintenanceTicket | Phiếu bảo trì |
| DeviceEvent | Sự kiện máy và firmware |
| AuditLog | Nhật ký hành động của người dùng/hệ thống |

### 10.2. Trường dữ liệu quan trọng

`Machine`:

- `id`, `tenant_id`, `location_id`.
- `serial_number`, `display_name`.
- `status`, `last_seen_at`.
- `firmware_version`, `configuration_version`.

`MachineSlot`:

- `id`, `tenant_id`, `machine_id`, `slot_number`.
- `fragrance_product_id`, `active_bottle_id`.
- `estimated_remaining_ml`, `estimated_remaining_sprays`.
- `price_per_spray`, `availability_status`.

`Order`:

- `id`, `tenant_id`, `machine_id`, `slot_id`.
- `amount`, `currency`, `status`.
- `created_at`, `paid_at`, `dispensed_at`.
- `failure_code`, `refund_status`.

`DispenseCommand`:

- `id`, `order_id`, `machine_id`, `slot_id`.
- `command_token`, `expires_at`, `status`.
- `sent_at`, `acknowledged_at`, `completed_at`.

## 11. API và MQTT topic tham khảo

### 11.1. REST API

```text
POST   /api/auth/login
GET    /api/brands
GET    /api/machines
GET    /api/machines/{id}
GET    /api/machines/{id}/slots
POST   /api/kiosk/orders
GET    /api/kiosk/orders/{id}/status
POST   /api/payments/webhook/{provider}
POST   /api/refills
GET    /api/alerts
POST   /api/maintenance-tickets
PATCH  /api/maintenance-tickets/{id}
GET    /api/reports/revenue
GET    /api/reports/dispensing
```

### 11.2. MQTT topic

```text
machines/{machineId}/heartbeat
machines/{machineId}/telemetry
machines/{machineId}/events
machines/{machineId}/commands
machines/{machineId}/commands/{commandId}/result
machines/{machineId}/config
```

Thiết bị chỉ được publish/subscribe các topic thuộc chính `machineId` của mình. MQTT broker phải áp dụng TLS và access control list.

## 12. Công nghệ tham khảo

Nhóm có thể điều chỉnh theo năng lực hiện tại.

| Thành phần | Lựa chọn đề xuất |
|---|---|
| Backend | Java Spring Boot, ASP.NET Core hoặc NestJS |
| Web quản trị | React/Next.js |
| Kiosk | Flutter, Android native hoặc React chạy kiosk mode |
| Firmware | ESP-IDF/Arduino cho ESP32 hoặc STM32 HAL |
| Cơ sở dữ liệu | PostgreSQL |
| Cache và background job | Redis |
| IoT messaging | EMQX, Mosquitto hoặc HiveMQ |
| Lưu file | S3-compatible object storage |
| Triển khai | Docker và cloud VM/container platform |
| Theo dõi hệ thống | Prometheus/Grafana và log tập trung |
| CI/CD | GitHub Actions hoặc GitLab CI |

## 13. Bảo mật

- Mật khẩu được băm bằng thuật toán phù hợp như Argon2 hoặc bcrypt.
- Access token có thời hạn ngắn; refresh token có cơ chế thu hồi.
- Phân quyền được kiểm tra tại backend trên từng API.
- Cô lập tenant ở service/repository và bổ sung kiểm thử chống truy cập chéo.
- Mỗi máy có credential riêng; không dùng chung mật khẩu cho toàn bộ máy.
- Giao tiếp API và MQTT sử dụng TLS.
- Lệnh xịt có chữ ký, thời hạn, nonce hoặc mã lệnh duy nhất.
- Webhook thanh toán được xác minh chữ ký và địa chỉ nguồn nếu nhà cung cấp hỗ trợ.
- Không lưu thông tin thẻ ngân hàng.
- Giới hạn tần suất tạo đơn, đăng nhập và gửi lệnh.
- Ghi audit log cho thay đổi giá, phân quyền, refill, chẩn đoán, hoàn tiền và cấu hình máy.
- Không đưa secret vào source code hoặc firmware công khai.

## 14. Quản lý tồn kho

Lượng còn lại nên được xác định bằng hai nguồn:

1. **Ước tính theo lượt xịt:** lấy lượng ban đầu trừ số lượt xịt thành công nhân lượng trung bình mỗi lượt.
2. **Đo bằng load cell:** so sánh khối lượng hiện tại với khối lượng chai rỗng và khối lượng khi nạp.

Hệ thống cảnh báo khi:

- Lượng ước tính thấp hơn ngưỡng.
- Số liệu cảm biến lệch đáng kể so với số lượt đã ghi nhận.
- Khối lượng giảm khi không có lượt xịt, có thể là dấu hiệu rò rỉ hoặc can thiệp vật lý.
- Chai đã mở quá thời gian cho phép.
- Chai hoặc lô hàng sắp hết hạn.

Mỗi lần refill cần lưu người thực hiện, thời gian, chai cũ, chai mới, khối lượng trước/sau và ghi chú.

## 15. Bảo trì và vận hành

### 15.1. Checklist refill

- Xác thực kỹ thuật viên.
- Chuyển máy sang chế độ bảo trì.
- Mở đúng ngăn được phân công.
- Quét mã QR/RFID của chai nếu có.
- Kiểm tra tên sản phẩm, lô và hạn dùng.
- Ghi khối lượng trước khi lắp.
- Lắp chai và kiểm tra cơ cấu.
- Thực hiện lượt xịt chẩn đoán có ghi log.
- Kiểm tra rò rỉ và đóng cửa.
- Xác nhận hoàn thành để máy hoạt động trở lại.

### 15.2. Phiếu bảo trì

Phiếu bảo trì cần có:

- Mã máy, địa điểm và thương hiệu.
- Loại sự cố và mức độ ưu tiên.
- Thời gian phát hiện và nguồn cảnh báo.
- Kỹ thuật viên phụ trách.
- Chẩn đoán, biện pháp xử lý và phụ tùng thay thế.
- Ảnh hoặc tài liệu liên quan nếu cần.
- Thời gian máy ngừng hoạt động.
- Kết quả kiểm tra sau sửa chữa.

## 16. Kiểm thử

### 16.1. Kiểm thử phần cứng

- Đo lượng xịt của từng ngăn qua ít nhất hàng trăm chu kỳ trong giai đoạn đầu.
- Chạy kiểm thử độ bền với mục tiêu 1.000–5.000 chu kỳ cho cơ cấu mẫu.
- Kiểm tra sai số giữa các lượt xịt.
- Kiểm tra đầu xịt bị kẹt, chai rỗng và cơ cấu không hồi vị.
- Kiểm tra load cell khi thay đổi nhiệt độ, rung và vị trí chai.
- Kiểm tra rò rỉ và độ tương thích vật liệu.
- Kiểm tra cửa mở, nút dừng khẩn cấp và giới hạn thời gian kích hoạt.
- Kiểm tra mất điện và khởi động lại giữa quá trình xử lý lệnh.

### 16.2. Kiểm thử phần mềm

- Unit test cho state machine của đơn hàng.
- Integration test cho database, MQTT và webhook.
- Test webhook được gửi lặp lại.
- Test mất mạng trước và sau khi thanh toán.
- Test gửi lại cùng một lệnh xịt nhiều lần.
- Test truy cập chéo giữa hai thương hiệu.
- Test thay đổi giá trong lúc khách đang thanh toán.
- Test máy báo hết nước hoa sau khi tạo đơn.
- Test hoàn tiền hoặc xử lý giao dịch thất bại.
- Test tải đối với heartbeat và telemetry của nhiều máy.
- Test bảo mật API, xác thực, phân quyền và quản lý secret.

### 16.3. Tiêu chí nghiệm thu MVP

- Máy điều khiển độc lập ít nhất bốn ngăn.
- Một giao dịch hợp lệ không tạo quá một lượt xịt.
- Không xịt khi chưa có xác nhận thanh toán từ backend.
- Không xịt khi cửa máy mở hoặc ngăn không khả dụng.
- Backend nhận và hiển thị heartbeat, telemetry và kết quả lệnh.
- Dữ liệu của hai thương hiệu không truy cập chéo được.
- Ghi nhận đầy đủ đơn hàng, thanh toán, lượt xịt, refill và bảo trì.
- Kiosk cung cấp thông báo rõ ràng cho các trạng thái chính.
- Dashboard hiển thị được doanh thu, lượt xịt, tồn kho và tình trạng máy.
- Hệ thống phục hồi nhất quán sau khi mất mạng hoặc khởi động lại.

## 17. Lộ trình triển khai dự kiến

### Giai đoạn 1 — Khảo sát và chốt yêu cầu (2–3 tuần)

- Phỏng vấn người dùng và đại diện thương hiệu.
- Xác định quy trình trải nghiệm, refill và bảo trì.
- Chọn phương án cơ khí và linh kiện.
- Thiết kế use case, wireframe, kiến trúc và mô hình dữ liệu.
- Chốt phạm vi MVP và tiêu chí nghiệm thu.

### Giai đoạn 2 — Proof of Concept phần cứng (4–6 tuần)

- Làm cơ cấu cho một đến hai chai.
- Điều khiển servo/solenoid hoặc bơm.
- Đo định lượng lượt xịt.
- Tích hợp load cell và cảm biến cửa.
- Thử nghiệm độ bền, rò rỉ và lỗi cơ cấu.
- Chốt thiết kế để mở rộng lên bốn ngăn.

### Giai đoạn 3 — Nền tảng phần mềm cốt lõi (6–8 tuần)

- Xây dựng database và backend modular monolith.
- Xác thực, phân quyền và multi-tenant.
- Quản lý thương hiệu, máy, ngăn và nước hoa.
- Tích hợp MQTT và heartbeat.
- Xây dựng giao diện kiosk và cổng quản trị cơ bản.

### Giai đoạn 4 — Thanh toán và quy trình xịt đầu cuối (4–6 tuần)

- Tích hợp QR thanh toán sandbox.
- Xây dựng state machine đơn hàng.
- Xác minh webhook và chống xử lý trùng.
- Phát lệnh xịt có thời hạn và chữ ký.
- Xử lý lỗi, timeout, retry và hoàn tiền/mô phỏng hoàn tiền.

### Giai đoạn 5 — Tồn kho, bảo trì và báo cáo (4–5 tuần)

- Quản lý chai, lô và refill.
- Tính lượng còn lại và tạo cảnh báo.
- Phiếu bảo trì và checklist kỹ thuật viên.
- Dashboard giao dịch, lượt xịt và tình trạng máy.
- Audit log và thông báo.

### Giai đoạn 6 — Tích hợp, kiểm thử và pilot (4–6 tuần)

- Tích hợp máy bốn ngăn với hệ thống hoàn chỉnh.
- Kiểm thử chức năng, bảo mật, mất mạng và độ bền.
- Chạy thử tại địa điểm có kiểm soát.
- Thu thập số liệu và phản hồi người dùng.
- Sửa lỗi, hoàn thiện tài liệu và chuẩn bị bảo vệ.

## 18. Phân chia công việc cho nhóm bốn người

| Thành viên | Trách nhiệm chính | Trách nhiệm phối hợp |
|---|---|---|
| Thành viên 1 — Leader/Backend | Kiến trúc, backend API, database, multi-tenant, authentication | Tích hợp hệ thống, code review, triển khai |
| Thành viên 2 — IoT/Embedded | Firmware, MQTT, cảm biến, điều khiển xịt, an toàn thiết bị | Thiết kế cơ khí và kiểm thử độ bền |
| Thành viên 3 — Kiosk/Payment | Giao diện kiosk, luồng đơn hàng, QR payment, trạng thái giao dịch | UX và kiểm thử đầu cuối |
| Thành viên 4 — Admin/Operations | Cổng quản trị, tồn kho, refill, bảo trì, dashboard | QA, tài liệu và báo cáo |

Tất cả thành viên cần tham gia phân tích yêu cầu, kiểm thử tích hợp, pilot, viết báo cáo và chuẩn bị demo. Không nên để duy nhất một người hiểu phần cứng hoặc quy trình thanh toán.

## 19. Rủi ro và biện pháp xử lý

| Rủi ro | Mức ảnh hưởng | Biện pháp |
|---|---|---|
| Lượng xịt không đồng đều | Cao | Hiệu chuẩn từng ngăn, kiểm thử nhiều chu kỳ, chuẩn hóa cơ cấu gá |
| Lẫn mùi giữa các sản phẩm | Cao | Mỗi mùi dùng vòi/đường dẫn riêng, bố trí khoảng cách và vệ sinh định kỳ |
| Đã thanh toán nhưng không xịt | Cao | State machine, ACK từ máy, retry có kiểm soát và quy trình hoàn tiền |
| Xịt trùng khi retry | Cao | Idempotency, command ID duy nhất và lưu lịch sử trên thiết bị |
| Vật liệu bị cồn làm hỏng | Cao | Kiểm tra tương thích vật liệu trước khi chốt thiết kế |
| Rò rỉ hoặc nguy cơ cháy | Cao | Khay hứng, cảm biến, thông gió, tách nguồn nhiệt và đánh giá an toàn |
| Mất mạng tại địa điểm | Trung bình | 4G dự phòng, dừng giao dịch mới, lưu log cục bộ |
| Đo tồn kho không chính xác | Trung bình | Kết hợp lượt xịt, load cell và hiệu chuẩn khi refill |
| Lộ dữ liệu giữa thương hiệu | Cao | Tenant isolation, RBAC, audit log và kiểm thử truy cập chéo |
| Phạm vi đồ án quá lớn | Cao | Khóa phạm vi MVP và chuyển tính năng nâng cao sang future work |
| Chậm tích hợp cổng thanh toán | Trung bình | Dùng sandbox sớm và chuẩn bị payment adapter/mô phỏng |
| Thiếu linh kiện hoặc thay đổi thiết kế | Trung bình | Mua linh kiện sớm, chuẩn bị linh kiện thay thế và thiết kế module |

## 20. Chỉ số đánh giá pilot

- Số lượt trải nghiệm mỗi ngày và theo khung giờ.
- Tỷ lệ tạo đơn thành công.
- Tỷ lệ thanh toán thành công.
- Tỷ lệ đã thanh toán nhưng xịt thất bại.
- Sai số lượng xịt trung bình và lớn nhất.
- Thời gian trung bình từ chọn sản phẩm đến hoàn tất.
- Số lần máy mất kết nối.
- Thời gian hoạt động của từng máy.
- Số cảnh báo tồn kho đúng và sai.
- Tần suất refill.
- Số phiếu bảo trì và thời gian xử lý trung bình.
- Nước hoa được chọn nhiều nhất theo máy và địa điểm.

## 21. Ước tính hiệu quả kinh doanh

```text
Doanh thu tháng
= số lượt/ngày × giá/lượt × số ngày hoạt động

Lợi nhuận đóng góp
= doanh thu
- chi phí nước hoa
- phí thanh toán
- chi phí thuê địa điểm
- refill và vận chuyển
- bảo trì
- kết nối mạng và cloud
- khấu hao máy
```

Số lượt thực tế trên mỗi chai phải được xác định bằng thử nghiệm. Không nên chỉ lấy dung tích chai chia cho lượng xịt lý thuyết vì còn hao hụt do kiểm tra, tồn đáy chai, bay hơi, sai số và lượt xịt lỗi.

## 22. Tài liệu cần bàn giao

- Software Requirements Specification.
- System Architecture Document.
- Database Design và Data Dictionary.
- API và MQTT Specification.
- Hardware Design và sơ đồ kết nối.
- Firmware Design.
- Security và Tenant Isolation Design.
- Test Plan, Test Cases và Test Report.
- Deployment Guide.
- User Guide cho Brand Admin, Operations và Technician.
- Maintenance và Refill Guide.
- Source code và hướng dẫn chạy hệ thống.
- Video demo và số liệu pilot.
- Báo cáo đồ án và slide bảo vệ.

## 23. Ưu tiên thực hiện

Thứ tự ưu tiên của dự án:

1. Chứng minh cơ cấu xịt chính xác, ổn định và an toàn.
2. Bảo đảm quan hệ một-một giữa giao dịch hợp lệ và lượt xịt.
3. Hoàn thiện giám sát máy, tồn kho, refill và bảo trì.
4. Bảo đảm cô lập dữ liệu và phân quyền đa thương hiệu.
5. Chạy pilot, đo hiệu quả và điều chỉnh trải nghiệm người dùng.
6. Chỉ phát triển tính năng nâng cao sau khi luồng cốt lõi hoạt động ổn định.

Nút thắt lớn nhất của ScentStation không phải là dashboard mà là độ ổn định của cơ cấu xịt, tính tương thích vật liệu, xử lý giao dịch nhất quán và quy trình vận hành ngoài thực địa. Các phần này cần được thử nghiệm càng sớm càng tốt.
