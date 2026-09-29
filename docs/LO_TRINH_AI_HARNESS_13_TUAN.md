# Kế hoạch 13 tuần — ScentStation

14/09/2026 → 13/12/2026 · 4 người · AI coding harness

> **Cập nhật 21/09/2026 — điều chỉnh track phần cứng.** Phần mềm giữ nguyên. Xem mục "Nhật ký thay đổi" ở cuối file.
>
> **Cập nhật 29/09/2026 — thuê slot theo gói trả trước (ADR-0006).** Bỏ luồng xin thuê/duyệt tay và phí cố định + ăn chia; thay bằng mua gói 3/6/12 tháng + gói bảo quản, thanh toán một lần, nhận hóa đơn. "Hợp đồng thuê slot" gọi là **hóa đơn thuê slot**. Phần cứng giữ nguyên. Các dòng đổi từ T3 trở đi đánh dấu **[ADR-0006]**; T1–T2 đã xong, giữ nguyên làm lịch sử.

---

## Phân công

| | Sở hữu |
|---|---|
| **TV1** | Harness, CI, contract · ORD, DSP, REV, IOT backend · **Device Simulator (nhận từ TV2 từ T3)** · webhook thanh toán dùng chung cho đơn kiosk và hóa đơn thuê slot **[ADR-0006]** |
| **TV2** | Phần cứng toàn thời gian: cơ khí, mạch, firmware, hiệu chuẩn |
| **TV3** | SLT, EXP, RFQ, AUTH, BND, USR · bảng giá gói, mua gói, hóa đơn, bảo hiểm hàng hóa **[ADR-0006]** |
| **TV4** | INV, ALR, MNT, RPT, PRD, MCH · QA lead · hỗ trợ TV2 1–2 ngày/tuần (T2–T7) |

---

## Ràng buộc phần cứng đã xác lập

Đọc trước khi giao bất kỳ việc phần cứng nào cho AI harness.

| Ràng buộc | Nội dung |
|---|---|
| Kiến trúc cơ cấu | **Bơm màng + van điện từ định liều.** Bơm nạp áp khi máy rảnh rồi tắt; van mở ~250ms để xịt. Bơm không chạy trong lúc xịt. Không còn phương án servo/solenoid nhấn đầu xịt |
| Bơm hiện có | DP-521 (0,48 MPa) — **nhãn cấm chất lỏng dễ cháy, motor chổi than.** Chỉ dùng với nước hoặc nước pha 1 giọt nước rửa chén |
| Bơm cho nước hoa thật | Phải đạt đủ 4 tiêu chí: áp ≥ 3 bar · bơm màng tự mồi · **không chổi than** · vật liệu ướt chịu cồn |
| Van | UniD UD-08, **bản 12VDC**, thường đóng, tác động trực tiếp, đặt sát béc (van–béc < 15mm) |
| Đường đẩy | Ống PTFE 4×2mm, bơm–béc < 20cm. Ống mềm chỉ dùng cho đường hút |
| Khoang máy | **Vách ngăn khoang ướt / khoang khô.** Đầu bơm bên ướt, motor bên khô. Quạt hút ở khoang ướt thải ra ngoài; khoang khô lấy gió sạch |
| Số ngăn chuẩn | **2 ngăn thật + 2 ngăn simulator.** Mỗi ngăn cần 1 bơm riêng (không dùng chung bơm cho hai mùi) |
| Trần thời gian | 800ms bằng timer phần cứng (`esp_timer` one-shot), không dùng `delay` |

---

## Ràng buộc phần mềm từ ADR-0006

Đọc trước khi giao việc SLT, EXP, ORD (webhook) hay INV (lắp chai) cho AI harness.

| Ràng buộc | Nội dung |
|---|---|
| Luồng Brand Admin | Xem slot trống → chọn slot → chọn gói thuê + gói bảo quản → thanh toán → nhận hóa đơn → cấu hình slot (sản phẩm, giá) |
| Giữ chỗ | Hóa đơn `DRAFT` giữ slot `RENTAL_CHECKOUT_HOLD_MIN`; cưỡng chế bằng `excl_slot_rental_overlap`, không bằng code. Hết giờ chưa trả → `CANCELLED` |
| Kích hoạt | **Lắp chai đầu tiên** chuyển hóa đơn đã thanh toán sang `ACTIVE` (FR-SLT-24) — phụ thuộc INV. Quá `RENTAL_MAX_STOCKING_DAYS` thì tự kích hoạt |
| Thanh toán | Dùng chung bảng `payments` và webhook với đơn kiosk; đúng một trong `order_id`/`slot_rental_id` |
| Tiền | Bảng giá chụp vào hóa đơn lúc tạo, không đọc lại danh mục. Không còn phí cố định, không còn ăn chia |
| Không dùng nữa | `slot_rental_requests`, `slot_rentals.fixed_fee`, `revenue_share_percent`, `request_id` — giữ trong lược đồ, **không** viết code mới dùng chúng |

---

## TUẦN 1 — Harness và contract *(đã xong)*

| TV | Việc |
|---|---|
| TV1 | Dựng `AGENTS.md`, cấu trúc `spec/`, Docker Compose, CI, script check traceability |
| TV1+TV3 | **Vẽ ERD đầy đủ — làm trước khi viết schema.sql** |
| TV3 | Data dictionary: bảng, cột, kiểu dữ liệu, ràng buộc, mô tả |
| TV1 | Thiết kế index và ràng buộc: partial unique trên slot, NOT NULL `revenue_owner` |
| TV1+TV3 | Viết `openapi.yaml`, `schema.sql`, `mqtt.md` → **đóng băng cuối tuần** — dùng đúng bản `seed_document/DB_DIAGRAM_MERMAID.md` mới nhất (đã cập nhật 15/09: bảng `slot_rental_requests`, `brand_shipment_declarations`, sở hữu/thanh lý chai, tách `machine_connection_status`/`machine_operating_mode`, `order_status` khớp FR-ORD-10) |
| TV3 | Viết AC cho SLT, EXP, REV, ORD (~81 FR, tăng từ ~70 do SLT có thêm luồng tự yêu cầu thuê slot FR-SLT-19÷29) — mức chi tiết đầy đủ |
| TV4 | Viết AC cho INV, ALR, MNT (~62 FR, tăng từ ~50 do INV có thêm luồng brand gửi hàng + phiếu nạp FR-INV-22÷31) |
| TV1 | Viết AC cho 12 FR về quyền truy cập và cô lập dữ liệu (AUTH, BND, RPT, AUD) |
| TV3 | Viết `glossary.md`, `constraints.md`, `errors.md` |
| Nhóm | AUTH, BND, USR, PRD, MCH, RPT, AUD phần CRUD: giữ dạng phát biểu, **không viết AC** |
| TV2 | Đặt linh kiện · chuẩn bị buổi test bơm với giảng viên |
| Nhóm | Nộp đăng ký sandbox thanh toán · chốt MoSCoW · hỏi quy định AI của trường |

**Không viết code tính năng tuần này.**

**Gate 1:** ERD và data dictionary xong · contract đóng băng · CI chạy · linh kiện đã đặt · sandbox đã nộp · ~155 FR có AC

---

## TUẦN 2 — Nền tảng *(đã xong)*

| TV | Việc |
|---|---|
| TV1 | Dựng migration framework · script seed 2 brand × 2 slot |
| TV1 | Auth · RBAC · cô lập dữ liệu **mức slot** · chỉ 4 vai trò (Platform Super Admin, Operations Staff, Inventory Staff, Brand Admin — đã gộp Operations Manager/Technician) |
| TV3 | CRUD Brand, User, Product |
| TV4 | CRUD Machine, Slot, Location · seed 1 máy 4 slot 2 brand |
| TV2 | Thử phun sương DP-521 và R385 với béc 0,10/0,15mm · phát hiện vấn đề đuôi phun sau khi ngắt bơm · phát hiện nhãn DP-521 cấm chất lỏng dễ cháy |

---

## TUẦN 3 — Cô lập, mô phỏng và chốt mô hình thuê *(đang chạy)*

| TV | Việc | Tiêu chí xong |
|---|---|---|
| TV1 | **Bộ test cô lập slot viết tay**, không giao AI. Seed 1 máy 4 slot: slot 1–2 brand A, slot 3–4 brand B. Test: A đọc trực tiếp slot 3 bị từ chối · endpoint danh sách của A chỉ trả slot 1–2 · đơn, doanh thu, tồn kho, telemetry slot 3 không lọt sang A · endpoint cấp máy không lộ dữ liệu B | **Gỡ tạm bộ lọc cô lập thì test phải đỏ.** Ghi phép thử này vào PR |
| TV1 | Test ràng buộc CSDL chạy thẳng vào DB, không qua API: 2 hóa đơn ACTIVE cùng slot · đơn thiếu `revenue_owner` · xóa slot đang có hóa đơn | Cả 3 trường hợp bị CSDL từ chối |
| TV1 | **Duyệt ADR-0006 và PR contract đi kèm** (2 migration, `schema.sql`, `openapi.yaml`, `erd.md`, 2 hằng mới) **[ADR-0006]** | ADR chuyển "đã duyệt"; `make reset && make migrate` sạch; `make test-contract` xanh |
| TV1 | Cập nhật `test_FR_AUTH_07_available_slots_expose_only_location_data` (nhóm cô lập — người tự viết): slot trống có 7 trường (thêm `monthlyRentPrice`), chỉ slot đã có giá niêm yết, loại cả slot đang giữ chỗ **[ADR-0006]** | Test đỏ trên hiện thực cũ, xanh sau khi TV3 sửa `listAvailableSlots` |
| TV1 | **Nhận Device Simulator từ TV2.** Mức tối thiểu: heartbeat định kỳ, nhận lệnh xịt, trả kết quả sau độ trễ giả lập, theo đúng `mqtt.md` | Simulator online, backend thấy heartbeat. Chữ ký/TTL để T5 |
| TV3 | Khung `SlotRental` (hóa đơn thuê slot): thực thể, trạng thái gồm `CANCELLED`, API đọc, partial unique trên slot. **Không** làm API tạo thủ công (FR-SLT-01 đã bãi bỏ) **[ADR-0006]** | ACTIVE thứ hai cùng slot bị CSDL từ chối, có test |
| TV3 | Bảng giá: CRUD gói thuê, gói bảo quản, giá niêm yết slot (FR-SLT-30÷32) · seed 3 gói (3/6/12 tháng) + 3 gói bảo quản **[ADR-0006]** | Super Admin tạo/sửa/ngừng mở bán được; không ngừng được gói bảo quản cuối cùng |
| TV3 | Sửa `listAvailableSlots` theo FR-SLT-19 mới, **sau** khi TV1 cập nhật test ở trên; sửa luôn lỗi lọc `status = 'AVAILABLE'` (slot trống không bao giờ AVAILABLE) **[ADR-0006]** | Test FR-AUTH-07 mới xanh; `monthlyRentPrice` vào `required` trong `openapi.yaml` |
| TV4 | Màn hình quản trị máy và slot: danh sách máy, chi tiết máy kèm slot, trạng thái từng slot, brand đang thuê, **giá niêm yết** **[ADR-0006]** | Dùng lại CRUD T2, hiển thị đúng seed 1 máy 4 slot 2 brand |
| TV4 | Hỗ trợ TV2 lắp bàn thử và đo | |
| TV2 | Hoàn thành bàn thử nút → đèn → bơm (ESP32 + module MOSFET AOD4184 + DP-521) | Xịt đúng 500ms, ESP32 không reset qua 20 lần bấm |
| TV2 | Đổi đường đẩy sang ống PTFE 4×2, dưới 15cm | Cân phần đuôi phun trước và sau khi đổi, có số liệu |
| TV2 | Đặt van UD-08 bản 12VDC | Đã đặt, có ảnh nhãn DC 12V từ người bán |
| TV2 | Tìm bơm màng không chổi than | ≥ 1 ứng viên đạt đủ 4 tiêu chí |
| TV2 | Firmware nhận lệnh qua Serial | `SHOT 250` xịt đúng 250ms bằng `esp_timer` |

**Mọi thử nghiệm phần cứng tuần này chỉ dùng nước hoặc nước pha nước rửa chén.**

**Gate 2:** brand A không đọc được dữ liệu slot brand B **cùng một máy**, có test chứng minh và test đỏ khi gỡ bộ lọc · ràng buộc CSDL có test · simulator online · **ADR-0006 đã duyệt, migration mới chạy sạch trên DB trống và DB có dữ liệu** · **1 ngăn nhận lệnh và xịt đúng thời gian, chạy bằng nước, có số liệu 20 lượt** (chưa yêu cầu đạt sai số 10%)

---

## TUẦN 4 — Đơn hàng và mua gói thuê

| TV | Việc |
|---|---|
| TV1 | Order state machine · webhook idempotent · `revenue_owner` · **webhook nhận cả payment có `slot_rental_id`** (chỉ phân nhánh, chưa xử lý nghiệp vụ hóa đơn) **[ADR-0006]** |
| TV3 | Mua gói: xem bảng giá cho slot (FR-SLT-34) · checkout tạo hóa đơn DRAFT, chụp giá, tính tiền, giữ chỗ (FR-SLT-33, 35, 36) · chống chồng lấn · danh sách và chi tiết hóa đơn (FR-SLT-40, 41) **[ADR-0006]** |
| TV3 | Cấu hình slot sau thanh toán: gán/đổi sản phẩm (FR-SLT-27÷29), đặt giá tự do (FR-SLT-08) — slot chưa có sản phẩm **hoặc** chưa có giá không nhận đơn **[ADR-0006]** |
| TV4 | Kiosk đa thương hiệu: danh mục, chi tiết sản phẩm |
| TV2 | Lắp van UD-08 · chuyển sang kiến trúc bơm nạp áp → van định liều |
| TV2 | Đo 20 lượt vào cốc trên cân 0,01g, tính khối lượng trung bình và độ lệch chuẩn · lặp lại ở 3 mức dịch: đầy, nửa, gần cạn · cân phần đuôi phun sau khi có van |
| TV2 | Thiết kế CAD vách ngăn khoang ướt / khoang khô |

**Thứ 6: Integration Day đầu tiên.** Từ nay mỗi thứ 6 dừng code, ghép hệ thống với máy thật.

**Gate HW-A:** kiến trúc cơ cấu được chốt bằng số liệu — áp làm việc · độ lệch chuẩn 20 lượt · khối lượng đuôi phun · ảnh vệt sương so với chai nước hoa thật. Nếu độ lệch chuẩn vẫn > 10% sau khi có van → bổ sung bình tích áp ở T5.

---

## TUẦN 5 — Lệnh xịt và thanh toán hóa đơn

| TV | Việc |
|---|---|
| TV1 | `DispenseCommand` có chữ ký và TTL · mock payment provider **dùng chung cho đơn kiosk và hóa đơn** · simulator bổ sung chữ ký, TTL, chống lặp **[ADR-0006]** |
| TV3 | Thanh toán hóa đơn: `POST /slot-rentals/{id}/payments` (một PENDING/hóa đơn) · xử lý webhook cho hóa đơn: `paid_at`, cấp số hóa đơn, tiền về sau khi hủy → `REFUND_PENDING` (FR-SLT-37, 38) **[ADR-0006]** |
| TV3 | Job hủy hóa đơn hết giờ giữ chỗ (FR-SLT-39), có bù sau downtime · thông báo thanh toán thành công (FR-SLT-43) **[ADR-0006]** |
| TV3 | Màn hình web quản trị cho Brand Admin: slot trống → chọn dịch vụ → thanh toán → hóa đơn → cấu hình slot **[ADR-0006]** |
| TV4 | Kiosk: tạo đơn, hiện QR, theo dõi trạng thái |
| TV2 | Thử bơm không chổi than: áp bít đầu ra, chất lượng sương với béc 0,15mm |
| TV2 | Dựng ngăn thứ hai |
| TV2 | Firmware: nhận lệnh MQTT, kiểm chữ ký, TTL, chống lặp, trả kết quả · trần 800ms bằng `esp_timer` cho cả van và bơm |
| Nhóm | Chốt kích thước bơm, van, bình, vách ngăn → **đặt gia công vỏ máy** (mất 1–2 tuần) |

**Gate 3:** E2E chạy với mock payment + simulator · webhook gửi lại 5 lần chỉ tạo 1 lệnh · **Brand Admin mua gói bằng mock payment: giữ chỗ → thanh toán → có số hóa đơn; hóa đơn không trả tiền tự hủy sau `RENTAL_CHECKOUT_HOLD_MIN`; webhook hóa đơn gửi lại 5 lần chỉ ghi nhận 1 lần** **[ADR-0006]** · **2 ngăn thật xịt đúng ngăn, 2 ngăn còn lại qua simulator**

---

## TUẦN 6 — Thanh toán thật

| TV | Việc |
|---|---|
| TV1+TV4 | Thay mock bằng sandbox thật · xác minh chữ ký, số tiền, mã tham chiếu — **cho cả đơn kiosk và hóa đơn thuê slot** **[ADR-0006]** |
| TV3 | Viết AC cho RFQ (12 FR) |
| TV3 | `RefillRequest` · thông báo hết hạn T−7 và T−3 **kèm nút gia hạn (mua gói mới)** **[ADR-0006]** |
| TV2+TV4 | Hiệu chuẩn lượng xịt từng ngăn bằng cân 0,01g · lưu tham số hiệu chuẩn vào NVS |
| TV2 | Chuyển mạch từ breadboard sang **bo hàn lỗ đa năng** |
| TV2 | Lắp thử vách ngăn và quạt hút khoang ướt |

---

## TUẦN 7 — Luồng vàng

| TV | Việc |
|---|---|
| Nhóm | Chạy luồng vàng trên máy vật lý |
| TV2 | Kiểm thử 500 chu kỳ/ngăn · nút dừng khẩn cấp cắt cứng đường 12V |
| TV1 | Xử lý timeout, kết quả không xác định |
| TV3 | Mua gói bằng **sandbox thật** trên web quản trị, chạy song song luồng vàng **[ADR-0006]** |

**Gate 4 — MỐC SỐNG CÒN:** chọn hương → QR sandbox → thanh toán → xác minh webhook → phát lệnh có chữ ký → máy thật xịt đúng 1 lần → kết quả về → đơn `DISPENSED`

> **[ADR-0006]** Slot trong luồng vàng dùng hóa đơn `ACTIVE` từ seed. Hóa đơn mua qua web chỉ tự kích
> hoạt khi **lắp chai đầu tiên** (FR-SLT-24), mà luồng lắp chai thuộc INV ở T8 — nên G4 **không** phụ
> thuộc chuỗi mua gói. Chuỗi đầy đủ mua gói → nạp chai → bán kiểm ở G5.

**Điều kiện dịch:** chạy bằng nước hoa thật **chỉ khi** đã có đủ bơm không chổi than, vách ngăn hai khoang và quạt hút. Thiếu bất kỳ thứ nào → chạy bằng dịch giả lập và ghi rõ trong biên bản.

**Trượt Gate 4 → bỏ hết FR ưu tiên S, TV4 chuyển sang hỗ trợ phần cứng toàn thời gian đến khi đạt.**

---

## TUẦN 8 — Tồn kho, cảnh báo và kích hoạt hóa đơn

| TV | Việc |
|---|---|
| TV3 | Ân hạn: chuyển trạng thái GRACE, tính phí lưu kho · **gia hạn tự phục vụ: mua gói mới khi EXPIRING/GRACE, phí ân hạn cộng vào hóa đơn gia hạn, hóa đơn cũ → RENEWED đúng lúc hóa đơn mới hiệu lực** (FR-SLT-12, FR-EXP-12, 13) **[ADR-0006]** |
| TV3+TV4 | **Kích hoạt hóa đơn khi lắp chai đầu tiên** (FR-SLT-24): TV4 gọi service SLT trong cùng transaction đóng phiếu nạp · job tự kích hoạt sau `RENTAL_MAX_STOCKING_DAYS` (FR-SLT-42) · thông báo hóa đơn bắt đầu hiệu lực **[ADR-0006]** |
| TV1 | ~~Quyết toán hai luồng doanh thu~~ → **Bảng đối soát doanh thu chuyển trả cho thương hiệu** (FR-SLT-17, 18 — không còn phí thuê, ăn chia) · tách doanh thu BRAND/PLATFORM (FR-REV) **[ADR-0006]** |
| TV4 | INV: chai, lô, phiên nạp, checklist · brand khai báo lô hàng gửi kho + Inventory Staff đối soát (FR-INV-22÷28) · phiếu nạp mở trước khi thao tác (FR-INV-29÷31) · **chỉ lắp chai vào slot có hóa đơn đã thanh toán** **[ADR-0006]** · ALR: 5 loại cảnh báo, cửa mở quá hạn phải loại trừ cả phiên nạp đang mở, không chỉ phiên bảo trì (FR-ALR-03 đã sửa) |
| TV2 | **Vẽ PCB đế** (chỗ cắm ESP32 DevKit, module MOSFET, module hạ áp, domino cho từng tải) và gửi gia công |
| TV2 | Load cell + HX711 |

---

## TUẦN 9 — Thanh lý, bảo hiểm hàng hóa và dashboard

| TV | Việc |
|---|---|
| TV3 | Thanh lý: chuyển quyền sở hữu chai, đóng hóa đơn |
| TV3 | **Bảo hiểm hàng hóa:** tính bồi thường khi chai chuyển DAMAGED (FR-SLT-44) · Super Admin ghi nhận chi trả có xác thực lại (FR-SLT-45) · Brand Admin xem khoản bồi thường (FR-SLT-46) **[ADR-0006]** |
| TV1 | Test biên `revenue_owner` quanh mốc thanh lý |
| TV1 | Tối ưu truy vấn báo cáo · bổ sung index theo EXPLAIN |
| TV4 | MNT: phiếu bảo trì · Dashboard · AuditLog · **báo cáo doanh thu bán gói (FR-SLT-47)** **[ADR-0006]** |
| TV2 | Lắp PCB và cơ cấu vào vỏ máy · lên 4 ngăn thật nếu còn thời gian và ngân sách |

**Gate 5:** **hóa đơn đi hết vòng đời: mua gói → thanh toán sandbox → lắp chai kích hoạt → bán → hết hạn → ân hạn → gia hạn hoặc LIQUIDATED** **[ADR-0006]** · doanh thu tách đúng hai nguồn · refill request hoàn tất · **một chai DAMAGED sinh đúng một khoản bồi thường theo gói**

---

## TUẦN 10 — Đóng băng tính năng, kiểm thử

Từ tuần này chỉ sửa lỗi, không thêm chức năng.

| TV | Việc |
|---|---|
| TV1 | Test cô lập chéo trên 100% endpoint — **gồm hóa đơn, bồi thường, bảng giá cho slot** · test tranh chấp đồng thời **[ADR-0006]** |
| TV3 | Kịch bản lỗi: webhook lặp, sai chữ ký, mất mạng, hóa đơn hết hạn giữa lúc có đơn chờ · **hai thương hiệu giữ chỗ cùng slot · tiền về sau khi hóa đơn đã hủy · đổi bảng giá khi hóa đơn đang chờ thanh toán** **[ADR-0006]** |
| TV4 | UAT với người ngoài nhóm — **gồm luồng Brand Admin mua gói** · bắt đầu viết Test Report **[ADR-0006]** |
| TV2 | Kiểm thử phần cứng tiếp tục tới 1.000 chu kỳ |

---

## TUẦN 11 — Hoàn tất kiểm thử

| TV | Việc |
|---|---|
| TV1 | Bảo mật: TLS, secret, rate limit · sửa bug nghiêm trọng |
| TV1 | Test tải 50 simulator |
| TV3 | Sửa bug · hoàn thiện tài liệu module |
| TV4 | Thiết lập sao lưu CSDL hằng ngày (NFR-DAT-05) |
| TV4 | Hoàn tất Test Report · ma trận truy vết |
| TV2 | Kiểm thử mất điện giữa lệnh: van phải đóng, bơm phải dừng |

**Gate 6:** 100% FR ưu tiên M có test đạt · CI xanh · không còn bug nghiêm trọng

---

## TUẦN 12 — Chạy thử thực tế

| TV | Việc |
|---|---|
| Nhóm | Đặt máy 5–7 ngày, cấu hình 2 brand × 2 slot — **mỗi brand tự mua gói qua web, không seed tay** **[ADR-0006]** |
| TV4 | Thu số liệu: lượt/ngày, tỷ lệ thanh toán, tỷ lệ xịt lỗi, sai số lượng xịt |
| TV2 | Trực xử lý sự cố phần cứng |
| Nhóm | **Quay video demo trong tuần này** · phỏng vấn 10–15 người dùng |

**Gate 7:** pilot có số liệu · video demo đã quay

---

## TUẦN 13 — Tài liệu và bảo vệ

| TV | Việc |
|---|---|
| TV1 | Xuất `docs/` từ `spec/` · sinh ma trận truy vết bằng script |
| TV1 | Chương Database Design · xuất data dictionary tự động từ schema |
| TV3 | Chương phương pháp AI-assisted development · **chương mô hình kinh doanh: vì sao đổi từ đàm phán hợp đồng sang gói trả trước (ADR-0005 → ADR-0006)** **[ADR-0006]** |
| TV4 | Ráp báo cáo cuối |
| TV2 | Chương thiết kế phần cứng và firmware · so sánh phương án bơm (R385, DP-521, bơm không chổi than) bằng số liệu đo |
| Nhóm | 2 buổi tập bảo vệ, có người ngoài đóng vai hội đồng |

**Gate 8:** tài liệu đủ · sẵn sàng bảo vệ

---

## Bảng mốc

| Gate | Tuần | Điều kiện |
|---|---|---|
| G1 | 1 | Contract đóng băng, linh kiện đã đặt, sandbox đã nộp |
| G2 | 3 | Cô lập slot có test chứng minh (đỏ khi gỡ bộ lọc), **ADR-0006 duyệt + migration sạch**, 1 ngăn xịt đúng thời gian bằng nước, có số liệu 20 lượt |
| **HW-A** | **4** | **Kiến trúc cơ cấu chốt bằng số liệu: áp, độ lệch chuẩn, đuôi phun, ảnh vệt sương** |
| G3 | 5 | E2E với mock, idempotency chứng minh được, **mua gói bằng mock payment + tự hủy khi hết giữ chỗ**, 2 ngăn thật + 2 ngăn simulator |
| **G4** | **7** | **Luồng vàng trên phần cứng thật với sandbox thật · nước hoa thật chỉ khi đủ điều kiện an toàn** (slot dùng hóa đơn seed) |
| G5 | 9 | **Hóa đơn đi hết vòng đời từ mua gói tới gia hạn hoặc LIQUIDATED**, doanh thu tách hai nguồn, **bồi thường hàng hóa chạy** |
| G6 | 11 | 100% FR ưu tiên M có test đạt, CI xanh |
| G7 | 12 | Pilot có số liệu (brand tự mua gói), video demo đã quay |
| G8 | 13 | Tài liệu đủ, sẵn sàng bảo vệ |

---

## Quy tắc cố định

- Thứ 6 hằng tuần từ T4: Integration Day, cả nhóm ghép hệ thống với máy thật
- Mọi PR phải có người review, kể cả PR do AI sinh
- PR quá 400 dòng phải tách nhỏ
- CI fail nếu FR ưu tiên M chưa có test mang đúng mã
- Tài liệu viết dần mỗi tuần, không dồn về T13
- Không rút TV2 khỏi phần cứng vì bất kỳ lý do gì
- **Bơm có motor chổi than chỉ chạy với nước hoặc nước pha nước rửa chén. Nước hoa thật chỉ dùng khi đủ bơm không chổi than, vách ngăn hai khoang và quạt hút**
- **Mọi thay đổi phần cứng được ghi vào sổ đo: bơm, béc, ống, áp, số liệu 20 lượt, ảnh vệt sương**
- **[ADR-0006] Migration thêm giá trị enum: kiểm cả DB trống lẫn DB đã có lược đồ cũ** — node-pg-migrate chạy mọi migration đang chờ trong một transaction (`docs/MIGRATIONS.md`)
- **[ADR-0006] Không viết code mới dùng `slot_rental_requests`, `fixed_fee`, `revenue_share_percent`**

---

## Chín chỗ tự viết test, không giao AI

| Chỗ | Test bắt buộc |
|---|---|
| Idempotency webhook | Gửi 2 webhook song song, phải có unique constraint ở CSDL — **cho cả đơn kiosk và hóa đơn thuê slot** **[ADR-0006]** |
| Cô lập mức slot | Brand A truy vấn slot Brand B **trên cùng máy** — **gồm hóa đơn, bồi thường; danh sách slot trống có đúng 7 trường** **[ADR-0006]** |
| `revenue_owner` | Tạo đơn → thanh lý → đơn cũ vẫn phải thuộc BRAND |
| Unique constraint slot | Cho thuê slot đang bán hàng thanh lý → phải bị từ chối |
| TTL lệnh xịt | Gửi lệnh hết hạn thẳng tới thiết bị → thiết bị phải từ chối |
| Hard timeout firmware | Lệnh sai định dạng → van và bơm vẫn dừng ở 800ms |
| Chuyển trạng thái theo lịch | Tắt dịch vụ qua mốc chuyển trạng thái, bật lại → phải bù — **gồm hủy hóa đơn hết giờ giữ chỗ (FR-SLT-39) và tự kích hoạt sau `RENTAL_MAX_STOCKING_DAYS` (FR-SLT-42)** **[ADR-0006]** |
| ~~Yêu cầu thuê slot trùng lặp~~ → **Giữ chỗ slot đồng thời** | ~~Gửi 2 yêu cầu thuê cùng slot đồng thời (FR-SLT-26)~~ → Hai thương hiệu checkout cùng slot đồng thời → chỉ 1 hóa đơn DRAFT được tạo, do `excl_slot_rental_overlap` chặn (FR-SLT-35) **[ADR-0006]** |
| **Mất điện giữa lúc xịt** | **Ngắt nguồn hoặc reset ESP32 khi van đang mở → van phải đóng, bơm phải dừng, lệnh không được thực hiện lại khi khởi động** |

---

## Làm ngay tuần 3

1. TV2 bàn giao simulator cho TV1 trong ngày đầu tuần
2. TV2 hoàn thành bàn thử nút → đèn → bơm, đổi đường đẩy sang PTFE, cân phần đuôi phun
3. Đặt van UD-08 bản 12VDC, xác nhận ảnh nhãn DC 12V
4. Tìm ít nhất một bơm màng không chổi than đạt đủ 4 tiêu chí
5. TV1 viết bộ test cô lập slot, chạy phép thử gỡ bộ lọc để chứng minh test có tác dụng
6. **TV1 review và duyệt ADR-0006 cùng PR contract — mọi việc SLT từ T4 chờ bước này** **[ADR-0006]**
7. **TV1 cập nhật test FR-AUTH-07 (slot trống 7 trường), rồi TV3 sửa `listAvailableSlots`** **[ADR-0006]**
8. **TV3 dựng bảng giá (gói thuê, gói bảo quản, giá niêm yết) và seed dữ liệu mẫu** **[ADR-0006]**

---

## Nhật ký thay đổi

### 29/09/2026 — Thuê slot theo gói trả trước (ADR-0006)

| Thay đổi | Lý do |
|---|---|
| Bỏ luồng xin thuê → Super Admin duyệt → hợp đồng DRAFT (FR-SLT-20÷23, 25, 26 bãi bỏ) | Nhóm chốt mô hình mua gói tự phục vụ; không còn điều khoản riêng từng thương hiệu |
| TV3 T4: yêu cầu thuê → **mua gói + giữ chỗ + hóa đơn** | Đổi việc, khối lượng tương đương; bỏ được màn hình duyệt của Super Admin |
| Thêm việc thanh toán hóa đơn ở T5, sandbox ở T6 | Bám lịch mock payment (T5) và sandbox (T6) sẵn có của TV1 — dùng chung webhook, không dựng cổng thứ hai |
| Kích hoạt hóa đơn dời sang T8 cùng INV | Thời hạn tính từ lúc lắp chai đầu tiên; luồng lắp chai thuộc INV ở T8 |
| G4 dùng hóa đơn seed; chuỗi mua gói đầy đủ kiểm ở G5 | Không để mốc sống còn phụ thuộc INV (T8) |
| T8 TV1: quyết toán hai luồng → bảng đối soát chuyển trả | Không còn phí cố định và ăn chia; việc nhẹ đi |
| Thêm bảo hiểm hàng hóa ở T9 (TV3) | Phụ thuộc trạng thái chai DAMAGED của INV (T8) |
| Báo cáo doanh thu bán gói ở T9 (TV4, cùng dashboard) | Doanh thu nền tảng nay đến từ bán gói |
| Test tự viết "Yêu cầu thuê trùng lặp" → "Giữ chỗ slot đồng thời" | Bảng yêu cầu thuê đã DEPRECATED; ràng buộc cần chứng minh nay là `excl_slot_rental_overlap` |
| Bổ sung test cô lập, idempotency, chuyển trạng thái theo lịch | Hóa đơn, bồi thường và hai job mới đều chạm các nhóm test này |
| Thêm việc T3: duyệt ADR-0006, cập nhật test FR-AUTH-07, sửa `listAvailableSlots` | Contract đã áp dụng trước khi duyệt; test cô lập thuộc nhóm người tự viết nên agent không sửa |

### 21/09/2026 — Điều chỉnh track phần cứng

| Thay đổi | Lý do |
|---|---|
| Bỏ "chốt servo hay solenoid" | Kiến trúc đã chuyển sang bơm màng + van điện từ định liều |
| Device Simulator chuyển từ TV2 sang TV1 | Simulator là phần mềm viết theo `mqtt.md`; TV2 đang quá tải phần cứng |
| Thêm tìm và thử bơm không chổi than (T3, T5) | Nhãn DP-521 cấm chất lỏng dễ cháy, motor chổi than tạo tia lửa |
| Thêm vách ngăn khoang ướt/khô (T4 thiết kế, T6 lắp thử) | Tách nguồn đánh lửa khỏi vùng có hơi cồn |
| Quạt thông gió dời từ T8 lên T6 | Là điều kiện an toàn trước khi chạy nước hoa thật |
| Đặt gia công vỏ máy dời từ T4 sang T5 | Cần biết kích thước bơm cuối cùng và vách ngăn trước |
| 4 ngăn thật → 2 ngăn thật + 2 simulator | Mỗi ngăn cần 1 bơm riêng; 4 bơm không chổi than tốn 1,6–4 triệu |
| Thêm bo hàn lỗ đa năng (T6) và PCB đế (T8) | Kế hoạch cũ không có việc làm bo mạch |
| Thêm Gate HW-A ở T4 | Chốt kiến trúc cơ cấu bằng số liệu trước khi đặt gia công vỏ |
| Sửa lời G2, G3, G4 | Phản ánh 2 ngăn chuẩn và điều kiện an toàn khi dùng nước hoa thật |
| Test tải 50 simulator chuyển sang TV1 (T11) | TV1 sở hữu simulator |
| Thêm test thứ 9: mất điện giữa lúc xịt | Kiến trúc có van điện từ cần chứng minh trạng thái an toàn khi mất nguồn |
