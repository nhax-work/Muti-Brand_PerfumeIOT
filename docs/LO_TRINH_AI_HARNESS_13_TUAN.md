# Kế hoạch 12 tuần — ScentStation

14/09/2026 → **06/12/2026** · 4 người · AI coding harness

> **Cập nhật 16/10/2026 (2) — rà soát màn hình còn thiếu.** Đối chiếu `openapi.yaml` × backend × web
> quản trị cho thấy nhiều endpoint đã có backend nhưng không có màn hình, và một số FR mức M không được
> xếp tuần nào. Phần đã có backend (sản phẩm, thương hiệu, tài khoản, hồ sơ thương hiệu, đơn hàng và
> danh sách cần kiểm tra thủ công, địa điểm, đăng ký máy, khóa MQTT, lịch sử trạng thái máy, bảng giá,
> "Slot của tôi") TV1 làm xong ở T6. Phần còn lại chia vào T7–T8, đánh dấu **[UI-16/10]**. Từ T7, **việc
> nghiệp vụ nào có người dùng thao tác thì làm kèm màn hình** — G5 kiểm cả màn hình.
>
> **Cập nhật 16/10/2026 — code phần mềm hoàn thành trong T8.** Đóng băng code ngày **08/11** thay vì hết
> T9. T6 giữ nguyên; toàn bộ việc code của T7, T8, T9 cũ và phần rate limit của T10 cũ dồn vào **T7–T8**.
> T9 chỉ kiểm thử, bảo mật, UAT; T10 hoàn thiện máy và diễn tập pilot; T11 pilot, T12 tài liệu như cũ.
> Phần cứng được trải tới T10 (mốc mới **HW-B**). Bảo hiểm hàng hóa chuyển TV3 → TV1, báo cáo doanh thu
> bán gói chuyển TV4 → TV1 để cân tải. Mục này thay cho các câu về hạn tính năng ở mục 15/10 bên dưới.
>
> **Cập nhật 15/10/2026 — rút lịch từ 13 xuống 12 tuần, áp ADR-0009 ÷ 0016.** Kết thúc ngày 06/12 thay
> vì 13/12. Tuần 13 cũ bị bỏ: đóng băng tính năng và kiểm thử dồn vào **T10**, pilot cùng video demo ở
> **T11**, tài liệu và tập bảo vệ ở **T12**. Phần việc mới của đợt rà soát nghiệp vụ 13/10 (ADR-0012 ÷
> 0015) và của PayOS (ADR-0016) được chia vào T6–T9. Tính năng chỉ được thêm tới hết T9. Dòng đổi đánh
> dấu theo ADR, ví dụ **[ADR-0015]**. Xem "Nhật ký thay đổi" ở cuối file.
>
> **Tiến độ 15/10/2026:** T5 đã xong toàn bộ, Gate 3 đạt; nhóm **đang làm T6 sớm hơn lịch khoảng một
> tuần** (theo lịch 15/10 vẫn thuộc T5). Ngày ở bảng "Lịch tuần" là **hạn chót**, không dời theo; tuần
> đi trước là vùng đệm cho phần việc ADR-0013 ÷ 0015 dồn vào T6.
>
> **Cập nhật 30/09/2026 — thanh toán một lần cho nhiều slot (ADR-0008, TV1 đã duyệt 30/09).** Brand Admin chọn nhiều slot vào một **phiên thanh toán** và trả tiền một lần; mỗi slot vẫn là một hóa đơn có số hóa đơn riêng. Thanh toán trỏ tới phiên (`payments.rental_checkout_id`), giờ giữ chỗ nằm trên phiên. Dòng đổi đánh dấu **[ADR-0008]**.
>
> **Cập nhật 29/09/2026 (2) — khách bấm nút vật lý để nhận lượt xịt (ADR-0007).** Mỗi slot một nút có đèn; thanh toán xong đèn sáng, khách bấm trong 60 giây thì xịt, không bấm thì mất lượt (không hoàn tiền); mỗi máy một lượt chờ bấm. Dòng đổi đánh dấu **[ADR-0007]**.
>
> **Cập nhật 29/09/2026 — thuê slot theo gói trả trước (ADR-0006).** Bỏ luồng xin thuê/duyệt tay và phí cố định + ăn chia; thay bằng mua gói 3/6/12 tháng + gói bảo quản, thanh toán một lần, nhận hóa đơn. "Hợp đồng thuê slot" gọi là **hóa đơn thuê slot**. Phần cứng giữ nguyên. Các dòng đổi từ T3 trở đi đánh dấu **[ADR-0006]**; T1–T2 đã xong, giữ nguyên làm lịch sử.

**Ký hiệu trạng thái** (từ T5): ✓ đã xong, có commit · ◐ đang làm · không ký hiệu = chưa làm.

---

## Lịch tuần

| Tuần | Ngày | Tuần | Ngày |
|---|---|---|---|
| T1 | 14/09 – 20/09 | T7 | 26/10 – 01/11 |
| T2 | 21/09 – 27/09 | **T8** | **02/11 – 08/11 — đóng băng code** |
| T3 | 28/09 – 04/10 | T9 | 09/11 – 15/11 |
| T4 | 05/10 – 11/10 | T10 | 16/11 – 22/11 |
| T5 | 12/10 – 18/10 *(đã xong sớm)* | T11 | 23/11 – 29/11 |
| T6 | 19/10 – 25/10 *(đang làm từ 12/10)* | **T12** | **30/11 – 06/12 — kết thúc** |

---

## Phân công

| | Sở hữu |
|---|---|
| **TV1** | Harness, CI, contract · ORD, DSP, REV, IOT backend · **Device Simulator (nhận từ TV2 từ T3)** · webhook thanh toán dùng chung cho đơn kiosk và hóa đơn thuê slot **[ADR-0006]** · cổng PayOS **[ADR-0016]** · phiếu khiếu nại hoàn tiền **[ADR-0012]** · dừng bán an toàn phía ORD/DSP **[ADR-0015]** · kỳ chi trả doanh thu **[ADR-0013]** · **RefillRequest, bảo hiểm hàng hóa (nhận từ TV3 ở T8)** · **báo cáo doanh thu bán gói (nhận từ TV4 ở T8)** |
| **TV2** | Phần cứng toàn thời gian: cơ khí, mạch, firmware, hiệu chuẩn |
| **TV3** | SLT, EXP, RFQ (đặc tả), AUTH, BND, USR · bảng giá gói, mua gói, hóa đơn **[ADR-0006]** · tự đăng ký, hợp đồng khung + phụ lục, xác minh pháp nhân **[ADR-0013]** · không gia hạn, trả hàng, đổi slot, giới hạn giữ chỗ **[ADR-0014]** |
| **TV4** | INV, ALR, MNT, RPT, PRD, MCH · QA lead · hỗ trợ TV2 1–2 ngày/tuần (T2–T6, T9), toàn thời gian ở T10 · `DRAINING`, phiếu nạp dừng bán, màn hủy đơn trên kiosk **[ADR-0015]** · email thông báo tiền/hàng, giấy tờ chính hãng **[ADR-0013]** · phiếu trả hàng phía kho **[ADR-0014]** |

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
| Luồng Brand Admin | Xem slot trống → chọn slot → chọn gói thuê + gói bảo quản → **đồng ý phụ lục [ADR-0013]** → thanh toán → nhận hóa đơn → cấu hình slot (sản phẩm, giá) |
| Giữ chỗ | Phiên thanh toán giữ **mọi** slot của nó `RENTAL_CHECKOUT_HOLD_MIN`; mỗi slot là một hóa đơn `DRAFT`; cưỡng chế bằng `excl_slot_rental_overlap`, không bằng code — một slot bị chặn là cả giỏ bị từ chối. Hết giờ chưa trả → phiên hủy, mọi hóa đơn `CANCELLED` **[ADR-0008]**. Một thương hiệu giữ tối đa `BRAND_MAX_HELD_SLOTS` slot chưa thanh toán → `HOLD_LIMIT_REACHED` **[ADR-0014]** |
| Kích hoạt | **Lắp chai đầu tiên** chuyển hóa đơn đã thanh toán sang `ACTIVE` (FR-SLT-24) — phụ thuộc INV. Quá `RENTAL_MAX_STOCKING_DAYS` thì tự kích hoạt. Chai thuộc lô chưa có giấy tờ chính hãng được duyệt thì không lắp được (FR-INV-35) **[ADR-0013]** |
| Thanh toán | Dùng chung bảng `payments` và webhook với đơn kiosk; đúng một trong `order_id`/`rental_checkout_id` — một thanh toán cho cả phiên, webhook cấp số hóa đơn riêng cho từng hóa đơn **[ADR-0008]** |
| Tiền | Bảng giá chụp vào hóa đơn lúc tạo, không đọc lại danh mục. Không còn phí cố định, không còn ăn chia |
| Không dùng nữa | `slot_rental_requests`, `slot_rentals.fixed_fee`, `revenue_share_percent`, `request_id` — giữ trong lược đồ, **không** viết code mới dùng chúng |
| Kích hoạt lượt xịt **[ADR-0007]** | Máy **không** tự xịt khi thanh toán xong: sáng đèn nút slot đích, chờ khách bấm `DISPENSE_PRESS_WINDOW_SEC`. `ACK` = đèn đã sáng. Không bấm → `PRESS_TIMEOUT` → đơn `FORFEITED`. Mỗi máy tối đa một lệnh `CUSTOMER` hiệu lực (`uq_machine_active_customer_command`); đơn trả tiền sau giữ `PAID` chờ lượt **tối đa `PAID_QUEUE_MAX_SEC` [ADR-0015]**. Lệnh chẩn đoán xịt ngay |

---

## Ràng buộc phần mềm từ ADR-0009 ÷ 0016

Đọc trước khi giao việc ORD, DSP, SLT, EXP, INV, MCH/MNT hay kiosk cho AI harness.

| ADR | Ràng buộc |
|---|---|
| **0009** | Cột ảnh chụp của `orders` (`revenue_owner`, `amount`, `brand_id`, `slot_rental_id`…) bị trigger `chk_order_snapshot_immutable` chặn UPDATE — code chỉ ghi cột trạng thái. `payments (provider, provider_reference)` là duy nhất |
| **0010** | Agent **được** viết test trọng yếu, mang đúng mã FR. PR có test trọng yếu cần người review riêng phần test, đối chiếu assert với AC. Không mock đúng cơ chế cần chứng minh |
| **0011** | `REJECT CMD_DUPLICATE` bị bỏ qua — không khép lệnh gốc, không đổi đơn |
| **0012** | Hoàn tiền cho khách **thủ công qua phiếu khiếu nại** (QR sự cố trên kiosk). Tài khoản nhận hoàn tiền chỉ nằm trong `refund_claims`, mã hóa AES-256-GCM (`REFUND_ACCOUNT_ENC_KEY`), chỉ Operations Staff được phân công xem sau khi xác thực lại, xóa khi đóng phiếu. Không ghi vào log, `audit_logs`, `payment_events`, email. `POST /orders/{id}/refund` đã `deprecated` |
| **0013** | Thương hiệu **tự đăng ký** → xác minh email → đồng ý hợp đồng khung → thuê ngay. Chưa đồng ý hợp đồng khung thì không tạo được phiên (`AGREEMENT_NOT_ACCEPTED`); mỗi phiên có phụ lục tự sinh phải đồng ý trước khi trả tiền. Doanh thu thương hiệu chi trả **theo tháng** `DRAFT → CONFIRMED → PAID`, tính đơn `BRAND` ở `DISPENSED` + `FORFEITED`; phí PayOS và khoản hoàn do nền tảng chịu. Chưa xác minh pháp nhân thì không chuyển `PAID` (`BRAND_NOT_VERIFIED`). Thông báo về tiền và hàng gửi **email** (FR-ALR-16, mức M). OTP xác nhận (FR-SLT-51) là mức S — **không làm** trong lịch 12 tuần |
| **0014** | Ân hạn mặc định `GRACE_PERIOD_DEFAULT_DAYS` = 7. Thương hiệu được **báo không gia hạn** bất cứ lúc nào trước hạn → không ân hạn, không phí, tháo chai → phiếu trả hàng → chai `RETURNED_TO_BRAND`; quá `RETURN_PICKUP_MAX_DAYS` chưa nhận thì chuyển sở hữu như thanh lý. Được **đổi slot cùng giá** một lần trong `SLOT_SWAP_WINDOW_HOURS` nếu chưa lắp chai; không hoàn tiền |
| **0015** | Mỗi máy **một đơn chờ thanh toán** (`uq_machine_open_order`); kiosk **hủy đơn + hủy link PayOS** ở mọi lối thoát màn QR; tiền về sau khi hủy → `REFUND_PENDING`. Đơn `PAID` chờ lượt quá `PAID_QUEUE_MAX_SEC` → `FAILED` `QUEUE_TIMEOUT` + kiểm tra thủ công. Từ chối **trước** `ACK` cũng gắn cờ kiểm tra thủ công. `CONSECUTIVE_FAIL_ALERT` lỗi liên tiếp → slot tự `MAINTENANCE`. Phiếu nạp mở → **cả máy** dừng nhận đơn. Yêu cầu bảo trì → máy `DRAINING` phục vụ nốt rồi mới `MAINTENANCE` (`DRAINING` chỉ có ở backend, `mqtt.md` không đổi chế độ) |
| **0016** | Cổng là **PayOS, không có sandbox**. CI dùng webhook mẫu ký bằng khóa test; nhóm chạy lượt thật với số tiền nhỏ theo `docs/PAYOS.md`. Cổng `mock` giữ cho dev, test và Integration Day. Webhook chữ ký đúng mà mã tham chiếu lạ → 200 `UNKNOWN_REFERENCE`. Adapter bỏ `counterAccount*` trước khi lưu |

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

## TUẦN 3 — Cô lập, mô phỏng và chốt mô hình thuê *(đã qua)*

| TV | Việc | Tiêu chí xong |
|---|---|---|
| TV1 | **Bộ test cô lập slot viết tay**, không giao AI. Seed 1 máy 4 slot: slot 1–2 brand A, slot 3–4 brand B. Test: A đọc trực tiếp slot 3 bị từ chối · endpoint danh sách của A chỉ trả slot 1–2 · đơn, doanh thu, tồn kho, telemetry slot 3 không lọt sang A · endpoint cấp máy không lộ dữ liệu B | **Gỡ tạm bộ lọc cô lập thì test phải đỏ.** Ghi phép thử này vào PR |
| TV1 | Test ràng buộc CSDL chạy thẳng vào DB, không qua API: 2 hóa đơn ACTIVE cùng slot · đơn thiếu `revenue_owner` · xóa slot đang có hóa đơn | Cả 3 trường hợp bị CSDL từ chối |
| TV1 | ~~**Duyệt ADR-0006 và PR contract đi kèm**~~ **Đã duyệt 29/09** — còn merge PR contract (2 migration, `schema.sql`, `openapi.yaml`, `erd.md`, 2 hằng mới) **[ADR-0006]** | ADR "đã duyệt" ✓; PR đã merge; `make reset && make migrate` sạch; `make test-contract` xanh |
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

## TUẦN 4 — Đơn hàng và mua gói thuê *(đã qua)*

| TV | Việc |
|---|---|
| TV1 | Order state machine · webhook idempotent · `revenue_owner` · **webhook nhận cả payment có `rental_checkout_id`** (chỉ phân nhánh, chưa xử lý nghiệp vụ phiên/hóa đơn) **[ADR-0006, ADR-0008]** · ảnh chụp đơn bất biến bằng trigger CSDL, mã tham chiếu thanh toán duy nhất **[ADR-0009]** |
| TV3 | Mua gói: xem bảng giá cho slot (FR-SLT-34) · checkout `POST /rental-checkouts` tạo phiên + một hóa đơn DRAFT mỗi slot trong một transaction, chụp giá, tính tiền, giữ chỗ cả giỏ (FR-SLT-33, 35, 36) **[ADR-0008]** · chống chồng lấn · danh sách và chi tiết hóa đơn (FR-SLT-40, 41) **[ADR-0006]** |
| TV3 | Cấu hình slot sau thanh toán: gán/đổi sản phẩm (FR-SLT-27÷29), đặt giá tự do (FR-SLT-08) — slot chưa có sản phẩm **hoặc** chưa có giá không nhận đơn **[ADR-0006]** |
| TV4 | Kiosk đa thương hiệu: danh mục, chi tiết sản phẩm |
| TV2 | Lắp van UD-08 · chuyển sang kiến trúc bơm nạp áp → van định liều |
| TV2 | Đo 20 lượt vào cốc trên cân 0,01g, tính khối lượng trung bình và độ lệch chuẩn · lặp lại ở 3 mức dịch: đầy, nửa, gần cạn · cân phần đuôi phun sau khi có van |
| TV2 | Thiết kế CAD vách ngăn khoang ướt / khoang khô |

**Thứ 6: Integration Day đầu tiên.** Từ nay mỗi thứ 6 dừng code, ghép hệ thống với máy thật.

**Gate HW-A:** kiến trúc cơ cấu được chốt bằng số liệu — áp làm việc · độ lệch chuẩn 20 lượt · khối lượng đuôi phun · ảnh vệt sương so với chai nước hoa thật. Nếu độ lệch chuẩn vẫn > 10% sau khi có van → bổ sung bình tích áp ở T5.

---

## TUẦN 5 — Lệnh xịt, thanh toán hóa đơn và rà soát nghiệp vụ *(đã xong)*

| TV | Việc |
|---|---|
| TV1 | ✓ `DispenseCommand` có chữ ký và TTL · mock payment provider **dùng chung cho đơn kiosk và hóa đơn** · simulator bổ sung chữ ký, TTL, chống lặp **[ADR-0006]** |
| TV1 | ✓ Luồng nút bấm phía backend: `ACK` = đèn sáng, `PRESS_TIMEOUT` → đơn `FORFEITED`, mốc `UNKNOWN` sau ACK, một lệnh `CUSTOMER` mỗi máy + đơn chờ lượt · simulator giả lập **bấm nút / không bấm / bấm nhầm slot** **[ADR-0007]** · `CMD_DUPLICATE` không khép lệnh gốc **[ADR-0011]** |
| TV1 | ✓ Test trọng yếu idempotency webhook và TTL lệnh xịt do agent viết, người review **[ADR-0010]** |
| TV1 | ✓ Danh sách đơn cần kiểm tra thủ công `GET /orders/manual-review` · ✓ **phiếu khiếu nại hoàn tiền trọn gói** — backend, mã hóa tài khoản, job hết hạn/xóa liên hệ, QR sự cố trên kiosk, trang khiếu nại công khai, màn xử lý phiếu (FR-ORD-20, 21, 28÷32) **[ADR-0012]** |
| TV1 | ✓ **Kéo sớm từ T6:** cổng PayOS cho đơn kiosk và phiên thuê slot — ký yêu cầu, kiểm chữ ký webhook, `orderCode`, bỏ `counterAccount*` **[ADR-0016]** |
| TV1 | ✓ Ghi ADR-0013, 0014, 0015 (đã duyệt 13/10) · áp đặc tả: FR, `errors.md`, `constraints.md`, glossary (14/10) — contract chuyển sang T6 |
| TV3 | ✓ Thanh toán phiên `POST /rental-checkouts/{id}/payments` · webhook cho phiên: `paid_at`, số hóa đơn riêng từng hóa đơn, tiền về sau khi hủy → `REFUND_PENDING` (FR-SLT-37, 38) · job hủy phiên hết giờ (FR-SLT-39) · màn hình mua gói nhiều slot trên web quản trị **[ADR-0006, ADR-0008]** |
| TV4 | ✓ Kiosk: tạo đơn, hiện QR, theo dõi trạng thái · màn điều khoản bấm nút trước QR, "Mời bấm nút số N" + đếm ngược, `MACHINE_BUSY`, "Đang chờ lượt", "Hết thời gian bấm nút" (FR-ORD-24÷27) **[ADR-0007]** |
| TV2 | ✓ Thử bơm không chổi than: áp bít đầu ra, chất lượng sương với béc 0,15mm |
| TV2 | ✓ Dựng ngăn thứ hai |
| TV2 | ✓ Firmware: nhận lệnh MQTT, kiểm chữ ký, TTL, chống lặp, trả kết quả · trần 800ms bằng `esp_timer` cho cả van và bơm · **sáng đèn nút slot đích, chờ bấm `press_window_sec` bằng timer phần cứng, chống dội phím, bỏ qua nút slot khác, kiểm an toàn lần hai lúc bấm, `PRESS_TIMEOUT`, không lưu trạng thái chờ bấm qua reset; lệnh chẩn đoán xịt ngay** (FR-DSP-21÷27) **[ADR-0007]** |
| Nhóm | ✓ Chốt kích thước bơm, van, bình, vách ngăn → **đặt gia công vỏ máy** (mất 1–2 tuần) |

**Gate 3 — ✓ đạt:** E2E chạy với mock payment + simulator · webhook gửi lại 5 lần chỉ tạo 1 lệnh · **bấm nút thì xịt đúng 1 lần; không bấm thì đèn tắt sau 60 giây và đơn `FORFEITED`; đơn thứ hai trong lúc chờ bấm bị `MACHINE_BUSY`** **[ADR-0007]** · **Brand Admin mua gói bằng mock payment: giữ chỗ → thanh toán → có số hóa đơn; hóa đơn không trả tiền tự hủy sau `RENTAL_CHECKOUT_HOLD_MIN`; webhook hóa đơn gửi lại 5 lần chỉ ghi nhận 1 lần** **[ADR-0006]** · **2 ngăn thật xịt đúng ngăn, 2 ngăn còn lại qua simulator**

---

## TUẦN 6 — Contract mới, PayOS thật và dừng bán an toàn *(đang chạy — bắt đầu sớm từ 12/10, hạn 25/10)*

Việc "thay mock bằng sandbox" của tuần này đã làm xong sớm ở T5 (ADR-0016). PayOS không có sandbox, nên
thời gian giải phóng dùng cho phần việc ADR-0013 ÷ 0015. Tuần này nặng hơn tuần thường, bù lại nhóm có
gần hai tuần lịch (12/10 → 25/10) nhờ đi trước.

**Mốc giữa tuần — PR contract ADR-0013/14/15 merge trước thứ 6 16/10.** Mỗi máy một đơn chờ thanh toán,
tự đăng ký, hợp đồng khung ở tuần này — và không gia hạn, đổi slot, `DRAINING` ở các tuần sau — chờ
bước này.

| TV | Việc |
|---|---|
| TV1 | ✓ **PR contract ADR-0013/0014/0015** (16/10): migration enum riêng (`machine_operating_mode` + `DRAINING`, `bottle_status` + `RETURNED_TO_BRAND`) · `uq_machine_open_order` · cột mới `brands`, `slot_rentals`, `rental_checkouts` · bảng `agreement_versions`, `agreement_acceptances`, `email_verifications`, `brand_payouts`, `bottle_returns` · endpoint mới trong `openapi.yaml` · `mqtt.md` §6 (từ chối trước `ACK` gắn cờ). Kiểm cả DB trống lẫn DB có dữ liệu, `make test-contract` xanh **[ADR-0013, 0014, 0015]** |
| TV1+TV3+TV4 | Viết AC cho 28 FR mới, soát AC của FR viết lại — xong trước khi giao agent hiện thực. TV1: FR-ORD-34, 35, soát FR-ORD-19 · TV3: FR-USR-06, 07, FR-BND-09, 10, FR-SLT-48 ÷ 56, FR-EXP-23 ÷ 28, soát FR-USR-01, 05, FR-SLT-17, 18, 44, FR-EXP-06, 07, FR-AUTH-09 · TV4: FR-INV-32 ÷ 35, FR-MCH-18, FR-MNT-17, FR-ALR-16, soát FR-INV-04, 30, 31, FR-ALR-04, 15, FR-MNT-05, 06, FR-MCH-09, FR-RPT-04 **[ADR-0013, 0014, 0015]** |
| TV1 | ✓ Hủy đơn từ kiosk `POST /kiosk/orders/{id}/cancel` + hủy link PayOS, tiền về sau khi hủy → `REFUND_PENDING` (FR-ORD-33) **[ADR-0015]** |
| TV1 | **Lượt chạy PayOS thật với số tiền nhỏ** theo `docs/PAYOS.md` — đơn kiosk và phiên thuê slot; đăng ký URL webhook (giao dịch mẫu trả 200) **[ADR-0016]** |
| TV1 | ✓ Dừng bán an toàn phía ORD/DSP (16/10): mỗi máy một đơn chờ thanh toán (FR-ORD-35) · job chờ lượt quá `PAID_QUEUE_MAX_SEC` → `FAILED` `QUEUE_TIMEOUT` có bù sau downtime (FR-ORD-34) · từ chối trước `ACK` gắn cờ kiểm tra thủ công (FR-ORD-19) · `CONSECUTIVE_FAIL_ALERT` lỗi liên tiếp → slot tự `MAINTENANCE` + AuditLog (FR-ALR-04) · simulator thêm kịch bản từ chối trước `ACK`, lỗi liên tiếp **[ADR-0015]** |
| TV1 | ✓ **Màn hình còn thiếu cho pilot** (16/10, làm sớm — backend đã có từ T2–T4 nhưng chưa ai làm màn hình): Super Admin — **thương hiệu** (FR-BND-01 ÷ 03, 07), **tài khoản** kèm mật khẩu tạm hiện một lần (FR-USR-01 ÷ 05), **địa điểm** (FR-MCH-03), **đăng ký máy**, **khóa MQTT** cấp/thu hồi có xác thực lại, **lịch sử trạng thái máy** (FR-MCH-01, 02, 13), **bảng giá** gói thuê, gói bảo quản, giá niêm yết slot (FR-SLT-30 ÷ 32 — việc T3 còn thiếu màn hình); Brand Admin — **sản phẩm** (FR-PRD-01 ÷ 03), **hồ sơ thương hiệu** (FR-BND-06), **"Slot của tôi"** kèm backend `GET /reports/brand-slots` (FR-RPT-08, 10); mọi vai trò — **đơn hàng** tra cứu, chi tiết, lịch sử, tab **cần kiểm tra thủ công** cho Ops (FR-ORD-18, 19, 22), **đổi mật khẩu** và chặn tài khoản `INVITED` ở màn đổi mật khẩu (ADR-0004 — trước đó tài khoản Super Admin tạo không dùng được vì mọi API trả `FORBIDDEN_SCOPE` tới khi đổi mật khẩu, mà web chưa có màn này). Từ nay chủ module giữ màn hình: PRD, MCH → TV4; BND, USR → TV3; ORD → TV1 **[UI-16/10]** |
| TV1 | ✓ Seed hóa đơn theo mô hình mua gói (phiên đã thanh toán, số hóa đơn, ảnh chụp giá) — hóa đơn seed cũ không cấu hình được sản phẩm, giá; `make seed` nâng cấp tại chỗ · ✓ sửa webhook PayOS từ chối giao dịch mẫu (401) vì thiếu trường `success` **[ADR-0006, ADR-0016]** |
| TV3 | Thương hiệu tự đăng ký + xác minh email (FR-USR-06, 07; sửa FR-USR-01, 05) · hợp đồng khung có phiên bản, đồng ý một lần kèm phiên bản, người, thời điểm, IP, mã băm (FR-SLT-48, 49) · `POST /rental-checkouts` từ chối khi chưa xác minh email hoặc chưa đồng ý (`EMAIL_NOT_VERIFIED`, `AGREEMENT_NOT_ACCEPTED`) · giới hạn tần suất đăng ký **[ADR-0013]** |
| TV3 | Viết AC cho RFQ (12 FR) — để TV1 hiện thực ở T8 |
| TV4 | Kiosk theo ADR-0015: gọi hủy đơn ở **mọi** lối thoát màn QR (khách xác nhận rời, phiên kiosk reset, hết giờ) · `MACHINE_BUSY` khi máy đã có đơn chờ thanh toán · màn sự cố `QUEUE_TIMEOUT` kèm QR khiếu nại · màn tạm ngưng khi `MACHINE_IN_MAINTENANCE` **[ADR-0015]** |
| TV2+TV4 | Hiệu chuẩn lượng xịt từng ngăn bằng cân 0,01g · lưu tham số hiệu chuẩn vào NVS |
| TV2 | Chuyển mạch từ breadboard sang **bo hàn lỗ đa năng** |
| TV2 | Lắp thử vách ngăn và quạt hút khoang ướt |

---

## TUẦN 7 — Luồng vàng, dừng bán an toàn và tồn kho *(26/10 – 01/11)*

T7 và T8 gánh toàn bộ phần code còn lại của T7, T8, T9 cũ và phần rate limit của T10 cũ. TV4 tạm dừng
hỗ trợ phần cứng trong T7–T8 (vẫn dự Integration Day thứ 6), quay lại từ T9.

**[UI-16/10]** Mỗi dòng việc dưới đây có người dùng thao tác thì **làm kèm màn hình** trên web quản trị
(hoặc kiosk) — PR chỉ có backend chưa tính là xong. Màn hình mới theo `docs/HUONG_DAN_FRONTEND.md`, có
test cạnh file.

| TV | Việc |
|---|---|
| Nhóm | Chạy luồng vàng trên máy vật lý với **PayOS thật, số tiền nhỏ** **[ADR-0016]** |
| TV1 | ✓ Xử lý timeout, kết quả không xác định · **chốt chặn "máy dừng nhận đơn" dùng chung trong ORD/DSP**: máy `DRAINING`/`MAINTENANCE` hoặc có phiếu nạp mở → `MACHINE_IN_MAINTENANCE`, không ghi lệnh cho đơn chờ lượt; điều kiện `DRAINING` tự sang `MAINTENANCE` (hết lệnh `CUSTOMER`, đơn chờ thanh toán, đơn chờ lượt) **[ADR-0015]** |
| TV1 | ✓ **Kỳ chi trả doanh thu hằng tháng** `DRAFT → CONFIRMED → PAID`: tính đơn `BRAND` ở `DISPENSED` + `FORFEITED`, loại `FAILED`/`REFUND_PENDING`/`REFUNDED`; chuyển `PAID` kèm mã giao dịch sau xác thực lại, chặn khi chưa xác minh pháp nhân (`BRAND_NOT_VERIFIED`); khiếu nại số liệu trên kỳ `CONFIRMED` (FR-SLT-17, 18, 52 ÷ 54) · tách doanh thu BRAND/PLATFORM (FR-REV) **[ADR-0006, ADR-0013]** *(dời từ T8 cũ)* |
| TV1 | ✓ Test trọng yếu `revenue_owner` (`test_revenue_attribution`): gồm UPDATE `revenue_owner` bị trigger chặn **[ADR-0009, ADR-0010]** *(dời từ T8 cũ)* |
| TV1 | ✓ **Lượt xịt chẩn đoán** `POST /machines/{id}/diagnostic-dispense` + danh sách lệnh xịt `GET /dispense-commands`, `GET /orders/{id}/dispense-command`; lượt chẩn đoán ghi riêng, không tính doanh thu (FR-MNT-09, FR-DSP-20) · màn hình: nút xịt chẩn đoán trên từng slot ở chi tiết máy (xác thực lại), bảng lệnh xịt — **làm trước để checklist sau bảo trì của TV4 (FR-MNT-11, T8) dùng được** · màn hình kỳ chi trả và tách doanh thu (`/brand-payouts`, `/revenue/split`, FR-REV-04) đi cùng việc kỳ chi trả ở trên **[UI-16/10]** |
| TV3 | Phụ lục tự sinh cho mỗi phiên từ ảnh chụp giá, đồng ý trước khi thanh toán (FR-SLT-50) · giới hạn `BRAND_MAX_HELD_SLOTS` (FR-SLT-56) · đổi slot cùng giá trong `SLOT_SWAP_WINDOW_HOURS` (FR-SLT-55) **[ADR-0013, ADR-0014]** |
| TV3 | Mua gói bằng **PayOS thật** trên web quản trị, chạy song song luồng vàng — thương hiệu tự đăng ký → hợp đồng khung → phụ lục → trả tiền **[ADR-0006, ADR-0013, ADR-0016]** |
| TV3 | Thương hiệu khai mã số thuế, giấy phép, tài khoản nhận doanh thu (mã hóa) · Super Admin ghi nhận xác minh pháp nhân (FR-BND-09, 10) — làm đầu tuần để kỳ chi trả của TV1 chặn được `BRAND_NOT_VERIFIED` **[ADR-0013]** *(dời từ T8 cũ)* |
| TV3 | **Báo không gia hạn** kèm cách nhận hàng, rút lại trước hạn, hóa đơn không vào `GRACE`, không phí (FR-EXP-23 ÷ 25) **[ADR-0014]** *(dời từ T8 cũ)* |
| TV4 | `DRAINING` phía MCH/MNT: yêu cầu bảo trì đưa máy vào `DRAINING`, ép chuyển ngay kèm lý do bắt buộc, màn quản trị hiển thị chế độ (FR-MNT-05, 06, FR-MCH-09) **[ADR-0015]** |
| TV4 | **Sửa quyền xem máy của Operations Staff** (đầu tuần): Ops thấy menu "Máy" nhưng `GET /machines` cần `machine.manage` (chỉ Super Admin có) nên trả 403 — tách quyền đọc máy (`machine.view`) cấp cho Ops, giữ `machine.manage` cho đăng ký máy và khóa MQTT; kèm test quyền **[UI-16/10]** |
| TV4 | Hạ tầng email cho thông báo tiền/hàng, lưu trạng thái gửi làm bằng chứng (FR-ALR-16) — nối vào thông báo thanh toán thuê slot (FR-SLT-43) trước; các thông báo khác nối ở T8 **[ADR-0013]** |
| TV4 | INV: chai, lô, phiên nạp, checklist · brand khai báo lô hàng gửi kho + Inventory Staff đối soát (FR-INV-22÷28) · **giấy tờ chính hãng của lô: nộp, duyệt/từ chối, chặn lắp chai lô chưa duyệt** (FR-INV-33 ÷ 35) **[ADR-0013]** · phiếu nạp mở trước khi thao tác (FR-INV-29÷31) — **mở phiếu thì cả máy dừng nhận đơn qua chốt chặn của TV1; từ chối mở khi máy còn lệnh hoặc đơn chờ thanh toán** (FR-INV-30, 32) **[ADR-0015]** · **chỉ lắp chai vào slot có hóa đơn đã thanh toán** **[ADR-0006]** *(dời từ T8 cũ)* |
| TV2 | Kiểm thử 500 chu kỳ/ngăn · nút dừng khẩn cấp cắt cứng đường 12V |

**Gate 4 — MỐC SỐNG CÒN:** chọn hương → **QR PayOS thật** → thanh toán → xác minh webhook → phát lệnh có chữ ký → **đèn nút sáng → khách bấm** → máy thật xịt đúng 1 lần → kết quả về → đơn `DISPENSED` **[ADR-0007, ADR-0016]** · kèm hai nhánh an toàn: **khách rời màn QR → đơn hủy, link PayOS bị hủy** và **xịt lỗi → kiosk hiện QR sự cố → gửi được phiếu khiếu nại** **[ADR-0012, ADR-0015]**

> **[ADR-0006]** Slot trong luồng vàng dùng hóa đơn `ACTIVE` từ seed. Hóa đơn mua qua web chỉ tự kích
> hoạt khi **lắp chai đầu tiên** (FR-SLT-24); luồng lắp chai làm ở T7 nhưng phần kích hoạt nối ở T8 —
> nên G4 **không** phụ thuộc chuỗi mua gói. Chuỗi đầy đủ mua gói → nạp chai → bán kiểm ở G5.

**Điều kiện dịch:** chạy bằng nước hoa thật **chỉ khi** đã có đủ bơm không chổi than, vách ngăn hai khoang và quạt hút. Thiếu bất kỳ thứ nào → chạy bằng dịch giả lập và ghi rõ trong biên bản.

**Trượt Gate 4:**
- **Do phần mềm** → bỏ ngay hết FR ưu tiên S, cắt tiếp theo "Phạm vi cắt khi rút lịch". Mốc đóng băng code cuối T8 **không dời**.
- **Do phần cứng** → phần mềm không dừng (luồng vàng chạy trên simulator để T8 tiếp tục); G4 chạy lại trên máy thật muộn nhất Integration Day T9 (13/11); TV4 hỗ trợ phần cứng toàn thời gian từ T9 đến khi đạt.

---

## TUẦN 8 — Vòng đời hóa đơn, thanh lý, bồi thường và vận hành · **đóng băng code** *(02/11 – 08/11)*

**Hết thứ 6 06/11 không merge thêm tính năng.** Thứ 7–CN chỉ sửa lỗi để đạt G5. Kiểm tiến độ thứ 4
04/11: FR nào chưa có PR mở thì cắt theo "Phạm vi cắt khi rút lịch".

| TV | Việc |
|---|---|
| TV3 | Ân hạn: chuyển `GRACE` với thời hạn mặc định `GRACE_PERIOD_DEFAULT_DAYS`, Super Admin sửa được từng hóa đơn (FR-EXP-06, 07), tính phí lưu kho · **gia hạn tự phục vụ: mua gói mới khi EXPIRING/GRACE, phí ân hạn cộng vào hóa đơn gia hạn, hóa đơn cũ → RENEWED đúng lúc hóa đơn mới hiệu lực** (FR-SLT-12, FR-EXP-12, 13) **[ADR-0006, ADR-0014]** · thông báo hết hạn T−7 và T−3 **kèm nút gia hạn và nút không gia hạn**, gửi email (FR-ALR-16) **[ADR-0013, ADR-0014]** |
| TV3+TV4 | **Kích hoạt hóa đơn khi lắp chai đầu tiên** (FR-SLT-24): TV4 gọi service SLT trong cùng transaction đóng phiếu nạp · job tự kích hoạt sau `RENTAL_MAX_STOCKING_DAYS` (FR-SLT-42) · thông báo hóa đơn bắt đầu hiệu lực, gửi email **[ADR-0006, ADR-0013]** |
| TV3 | Thanh lý: chuyển quyền sở hữu chai, đóng hóa đơn *(dời từ T9 cũ)* |
| TV3+TV4 | **Trả hàng khi không gia hạn:** tháo chai → phiếu trả hàng ghi khối lượng còn lại, chai `RETURNED_TO_BRAND`, thông báo kèm danh sách chai (FR-EXP-26) · bàn giao: người nhận, thời điểm, mã vận đơn (FR-EXP-27) · job quá `RETURN_PICKUP_MAX_DAYS` chuyển sở hữu như thanh lý, báo trước 3 ngày, có bù sau downtime (FR-EXP-28) · hóa đơn `CLOSED`. TV3 phần SLT/EXP và job; TV4 màn hình và thao tác kho **[ADR-0014]** *(dời từ T9 cũ)* |
| TV1 | **Bảo hiểm hàng hóa** (nhận từ TV3): tính bồi thường khi chai chuyển DAMAGED theo `coverage_cap` (FR-SLT-44) · Super Admin ghi nhận chi trả có xác thực lại (FR-SLT-45) · Brand Admin xem khoản bồi thường (FR-SLT-46) **[ADR-0006, ADR-0013]** *(dời từ T9 cũ)* |
| TV1 | **RefillRequest** (nhận từ TV3, theo AC TV3 viết ở T6) · **báo cáo doanh thu bán gói (FR-SLT-47)** (nhận từ TV4) **[ADR-0006]** *(dời từ T9 cũ)* |
| TV1 | Rate limit: `RATE_LIMITED` cho đăng ký thương hiệu, gửi khiếu nại, tạo đơn kiosk **[ADR-0012, ADR-0013]** *(phần code dời từ T10 cũ)* |
| TV1 | Test trọng yếu còn thiếu: job chuyển trạng thái (`test_rental_scheduler`: tự kích hoạt, ân hạn, quá hạn nhận hàng) · biên `revenue_owner` quanh mốc thanh lý *(dời từ T9 cũ)* |
| TV1 | **Truy vết đầu-cuối một đơn** `GET /audit-logs/order-trace/{orderId}`: đơn → thanh toán → lệnh xịt → kết quả → nhật ký (FR-AUD-11) — nút "Truy vết" trong ngăn chi tiết của màn Đơn hàng · **telemetry và sự kiện thiết bị** `GET /machines/{id}/sensor-readings`, `/device-events`, đẩy lại cấu hình `POST /machines/{id}/config/push` (FR-IOT-04 ÷ 06) — hai thẻ trong chi tiết máy · **xếp hạng sản phẩm** `GET /reports/product-ranking` từ `kiosk_interaction_events` (FR-RPT-06) **[UI-16/10]** |
| TV4 | ALR: 5 loại cảnh báo, cửa mở quá hạn loại trừ cả phiên nạp đang mở (FR-ALR-03 đã sửa) · nối email cho các thông báo tiền/hàng còn lại · **màn hình cảnh báo** (`/alerts…`, FR-ALR-06, 08, 11, 12) và **thông báo trong ứng dụng** cho Brand Admin (`GET /notifications`, FR-EXP-01) **[UI-16/10]** *(dời từ T8 cũ)* |
| TV4 | MNT: phiếu bảo trì kèm màn hình (`/maintenance-tickets…`, FR-MNT-01 ÷ 03, 10, 11, 14) · **Dashboard** thay trang giữ chỗ hiện tại: `GET /reports/platform-dashboard`, `/reports/orders-timeseries` (FR-RPT-01, 02, 09) · báo cáo tồn kho `GET /reports/inventory` (FR-INV-21) · AuditLog `GET /audit-logs` (FR-AUD-08) · tỉ lệ thành công / thất bại / `FORFEITED` **theo từng máy** (FR-RPT-04) **[ADR-0015, UI-16/10]** *(dời từ T9 cũ)* |
| TV2 | **Vẽ PCB đế** (chỗ cắm ESP32 DevKit, module MOSFET, module hạ áp, domino cho từng tải) và gửi gia công |
| TV2 | Load cell + HX711 |

**Gate 5 — code hoàn thành:** **hóa đơn đi hết vòng đời theo cả hai nhánh, bắt đầu từ thương hiệu tự đăng ký: đăng ký → hợp đồng khung → phụ lục → thanh toán PayOS → lắp chai kích hoạt → bán → (a) hết hạn → ân hạn 7 ngày → gia hạn hoặc LIQUIDATED; (b) báo không gia hạn → tháo chai → trả hàng → CLOSED** **[ADR-0006, ADR-0013, ADR-0014]** · doanh thu tách đúng hai nguồn · **một kỳ chi trả tháng đi tới `PAID` cho thương hiệu đã xác minh, kỳ của thương hiệu chưa xác minh bị chặn** **[ADR-0013]** · refill request hoàn tất · **một chai DAMAGED sinh đúng một khoản bồi thường theo gói** · mọi FR ưu tiên M có code và test mang đúng mã · **mọi endpoint mà một vai trò cần thao tác đều có màn hình — chạy lại script đối chiếu `openapi.yaml` × backend × web quản trị, không còn dòng "có backend, không có màn hình"** **[UI-16/10]** · **đóng băng code**

> Chuỗi G5 được chạy trên simulator nếu máy thật chưa xong — phần cứng không chặn mốc đóng băng code.

---

## TUẦN 9 — Kiểm thử, bảo mật và UAT *(09/11 – 15/11)*

Từ tuần này chỉ sửa lỗi, không thêm chức năng. Pilot ở T11 thu tiền thật qua PayOS và giữ tài khoản
hoàn tiền thật của khách, nên **bảo mật và sao lưu phải xong trước pilot**.

| TV | Việc |
|---|---|
| TV1 | Bảo mật: TLS, secret (`PAYOS_*`, `REFUND_ACCOUNT_ENC_KEY` — khóa sao lưu riêng, tách khỏi bản sao lưu CSDL) **[ADR-0012]** |
| TV1 | Test cô lập chéo trên 100% endpoint — **gồm hóa đơn, bồi thường, bảng giá cho slot, kỳ chi trả, phiếu trả hàng, phụ lục** · test tranh chấp đồng thời · test tải 50 simulator **[ADR-0006, ADR-0013, ADR-0014]** · tối ưu truy vấn báo cáo, bổ sung index theo EXPLAIN |
| TV3 | Kịch bản lỗi: webhook lặp, sai chữ ký, mất mạng, hóa đơn hết hạn giữa lúc có đơn chờ · hai thương hiệu giữ chỗ cùng slot · tiền về sau khi hóa đơn đã hủy · đổi bảng giá khi hóa đơn đang chờ thanh toán **[ADR-0006]** · **đổi slot đồng thời với thương hiệu khác giữ slot đích · giỏ vượt 5 slot · báo không gia hạn sát `ends_at` · đổi phiên bản hợp đồng khung khi thương hiệu đang giữ chỗ** **[ADR-0013, ADR-0014]** · sửa bug · hoàn thiện tài liệu module |
| TV4 | UAT với người ngoài nhóm — **gồm luồng thương hiệu tự đăng ký → mua gói, khách gửi khiếu nại → nhân viên ghi nhận hoàn tiền, khách rời màn QR** **[ADR-0006, ADR-0012, ADR-0013, ADR-0015]** · thiết lập sao lưu CSDL hằng ngày (NFR-DAT-05) · Test Report · ma trận truy vết · hỗ trợ TV2 1–2 ngày |
| TV2 | Lắp PCB và cơ cấu vào vỏ máy · tích hợp load cell vào firmware · ~~lên 4 ngăn thật nếu còn thời gian~~ **bỏ — giữ 2 ngăn thật + 2 simulator** |
| Nhóm | Mỗi người nộp **dàn ý chương báo cáo** của mình (xem T12) |

**Gate 6:** 100% FR ưu tiên M có test đạt · CI xanh · không còn bug nghiêm trọng · **TLS, secret, rate limit, sao lưu hằng ngày đã chạy trên môi trường pilot**

---

## TUẦN 10 — Hoàn thiện máy và diễn tập pilot *(16/11 – 22/11)*

Phần mềm chỉ sửa lỗi từ UAT. Tuần này là vùng đệm cho phần cứng: máy phải hoàn chỉnh trong vỏ trước pilot.

| TV | Việc |
|---|---|
| TV2 | Kiểm thử phần cứng tiếp tục tới 1.000 chu kỳ · **kiểm thử mất điện giữa lệnh: van phải đóng, bơm phải dừng** · hoàn thiện máy cho pilot |
| TV4 | Hỗ trợ TV2 toàn thời gian: lắp ráp, hiệu chuẩn lại sau khi vào vỏ · cập nhật Test Report sau UAT |
| TV1 | Sửa lỗi UAT (có review) · xuất `docs/` từ `spec/` · sinh ma trận truy vết bằng script *(dời từ T11 cũ)* |
| TV3 | Sửa lỗi UAT · bản nháp chương phương pháp AI-assisted development và chương mô hình kinh doanh |
| Nhóm | **Diễn tập pilot 1–2 ngày** trên máy hoàn chỉnh: 2 brand tự đăng ký, mua gói qua PayOS thật số tiền nhỏ, nạp chai, bán vài lượt, thử một phiếu khiếu nại **[ADR-0012, ADR-0013, ADR-0016]** |

**Gate HW-B:** máy hoàn chỉnh trong vỏ · 1.000 chu kỳ/ngăn không lỗi · mất điện giữa lệnh thì van đóng, bơm dừng · diễn tập pilot chạy hết một ngày không có lỗi chặn

---

## TUẦN 11 — Chạy thử thực tế và video demo *(23/11 – 29/11)*

| TV | Việc |
|---|---|
| Nhóm | Đặt máy **tối thiểu 5 ngày** (thứ 2 → thứ 6, kéo tới thứ 7 nếu được), cấu hình 2 brand × 2 slot — **mỗi brand tự đăng ký và tự mua gói qua web bằng PayOS thật, không seed tay**; bảng giá pilot đặt mức nhỏ **[ADR-0006, ADR-0013, ADR-0016]** |
| TV4 | Thu số liệu: lượt/ngày, tỷ lệ thanh toán, tỷ lệ xịt lỗi, sai số lượng xịt, **tỉ lệ `FORFEITED` theo máy** (vượt 10% thì nhóm xem lại ADR-0007), **số phiếu khiếu nại và thời gian xử lý so với `REFUND_CLAIM_SLA_HOURS`**, số đơn khách hủy trên kiosk **[ADR-0012, ADR-0015]** |
| TV1 | Trực backend và PayOS · chỉ sửa bug chặn pilot (hotfix vẫn có review), bug khác ghi vào Test Report |
| TV3 | Trực vai Operations Staff: xử lý phiếu khiếu nại, đơn kiểm tra thủ công · hoàn thiện chương phương pháp AI-assisted development |
| TV2 | Trực xử lý sự cố phần cứng · viết chương thiết kế phần cứng và firmware |
| Nhóm | **Quay video demo giữa tuần, khi pilot đã ổn định** · phỏng vấn 10–15 người dùng |

**Gate 7:** pilot có số liệu ≥ 5 ngày (brand tự đăng ký, tự mua gói) · video demo đã quay

---

## TUẦN 12 — Tài liệu và bảo vệ *(30/11 – 06/12)*

| TV | Việc |
|---|---|
| TV1 | Chương Database Design · xuất data dictionary tự động từ schema · chương kiến trúc thanh toán (PayOS, idempotency, hoàn tiền thủ công) |
| TV3 | Hoàn tất chương AI-assisted development · **chương mô hình kinh doanh: từ đàm phán hợp đồng sang gói trả trước (ADR-0005 → ADR-0006), rồi hợp đồng hai lớp, chi trả doanh thu và các luồng kết thúc hóa đơn (ADR-0013, ADR-0014)** |
| TV4 | Ráp báo cáo cuối · chương kiểm thử và số liệu pilot |
| TV2 | Hoàn tất chương phần cứng · so sánh phương án bơm (R385, DP-521, bơm không chổi than) bằng số liệu đo |
| Nhóm | Buổi tập bảo vệ 1 (giữa tuần) → sửa → **đóng băng báo cáo** → buổi tập bảo vệ 2 (cuối tuần), có người ngoài đóng vai hội đồng |

**Gate 8:** tài liệu đủ · sẵn sàng bảo vệ

---

## Bảng mốc

| Gate | Tuần | Điều kiện |
|---|---|---|
| G1 | 1 | Contract đóng băng, linh kiện đã đặt, sandbox đã nộp |
| G2 | 3 | Cô lập slot có test chứng minh (đỏ khi gỡ bộ lọc), **ADR-0006 duyệt + migration sạch**, 1 ngăn xịt đúng thời gian bằng nước, có số liệu 20 lượt |
| **HW-A** | **4** | **Kiến trúc cơ cấu chốt bằng số liệu: áp, độ lệch chuẩn, đuôi phun, ảnh vệt sương** |
| G3 ✓ | 5 | E2E với mock, idempotency chứng minh được, **mua gói bằng mock payment + tự hủy khi hết giữ chỗ**, 2 ngăn thật + 2 ngăn simulator — **đã đạt** |
| **G4** | **7** | **Luồng vàng trên phần cứng thật với PayOS thật (số tiền nhỏ), kích hoạt bằng nút bấm · hủy đơn khi rời QR, QR sự cố dẫn tới khiếu nại · nước hoa thật chỉ khi đủ điều kiện an toàn** (slot dùng hóa đơn seed) |
| **G5** | **8** | **Code hoàn thành:** hóa đơn đi hết vòng đời theo cả nhánh ân hạn lẫn nhánh không gia hạn, từ thương hiệu tự đăng ký, doanh thu tách hai nguồn, kỳ chi trả tới `PAID`, bồi thường hàng hóa chạy · **đóng băng code** |
| G6 | 9 | 100% FR ưu tiên M có test đạt, CI xanh, **bảo mật và sao lưu xong trước pilot** |
| **HW-B** | **10** | **Máy hoàn chỉnh trong vỏ, 1.000 chu kỳ, an toàn khi mất điện, diễn tập pilot 1 ngày không lỗi chặn** |
| G7 | 11 | Pilot ≥ 5 ngày có số liệu (brand tự đăng ký, tự mua gói), video demo đã quay |
| G8 | 12 | Tài liệu đủ, sẵn sàng bảo vệ |

---

## Phạm vi cắt khi rút lịch

Rút từ 13 xuống 12 tuần mà phạm vi lại tăng (ADR-0012 ÷ 0015 thêm 28 FR), nên chốt trước:

| | Nội dung |
|---|---|
| **Không làm** | FR-SLT-51 (OTP xác nhận hợp đồng, mức S) · FR-ALR-15 (email cảnh báo vận hành, mức W) · lên 4 ngăn thật |
| **Rút gọn** | Pilot tối thiểu 5 ngày thay vì 5–7 · hai buổi tập bảo vệ dồn vào T12 |
| **Thứ tự cắt tiếp nếu trễ** | Kiểm ở thứ 4 T8 (04/11) — mốc đóng băng code 08/11 không dời, FR chưa kịp thì cắt. Theo `docs/FR_NFR_SCENTSTATION.md` Phần D: nhóm W → nhóm S trong RPT, MNT → FR-EXP-10 ÷ 12 (phí ân hạn) → nhóm S trong INV. **Không cắt** DSP, FR-REV-01 ÷ 03, và các FR dừng bán an toàn / hoàn tiền thủ công (ADR-0012, 0015) — đó là điều kiện để thu tiền thật trong pilot |

---

## Quy tắc cố định

- Thứ 6 hằng tuần từ T4: Integration Day, cả nhóm ghép hệ thống với máy thật
- Mọi PR phải có người review, kể cả PR do AI sinh
- PR quá 400 dòng phải tách nhỏ
- CI fail nếu FR ưu tiên M chưa có test mang đúng mã
- Tài liệu viết dần mỗi tuần, không dồn về T12 — dàn ý chương nộp ở T9, bản nháp xong trong T11
- **Hết T8 không thêm tính năng (đóng băng code 08/11).** T9–T10 chỉ sửa lỗi; bug tìm thấy trong pilot chỉ sửa nếu chặn pilot, còn lại ghi vào Test Report
- Phần cứng không chặn mốc đóng băng code: chuỗi G4/G5 chạy trên simulator nếu máy thật chưa sẵn
- Không rút TV2 khỏi phần cứng vì bất kỳ lý do gì
- **Bơm có motor chổi than chỉ chạy với nước hoặc nước pha nước rửa chén. Nước hoa thật chỉ dùng khi đủ bơm không chổi than, vách ngăn hai khoang và quạt hút**
- **Mọi thay đổi phần cứng được ghi vào sổ đo: bơm, béc, ống, áp, số liệu 20 lượt, ảnh vệt sương**
- **[ADR-0006] Migration thêm giá trị enum: kiểm cả DB trống lẫn DB đã có lược đồ cũ** — node-pg-migrate chạy mọi migration đang chờ trong một transaction (`docs/MIGRATIONS.md`)
- **[ADR-0006] Không viết code mới dùng `slot_rental_requests`, `fixed_fee`, `revenue_share_percent`**
- **[ADR-0012] Không ghi tài khoản nhận hoàn tiền ra ngoài `refund_claims`** — kể cả log, AuditLog, email, fixture test
- **[ADR-0016] Không có sandbox PayOS:** lượt chạy thật chỉ dùng số tiền nhỏ và kênh thanh toán của nhóm; Integration Day dùng cổng `mock`

---

## Các chỗ test trọng yếu

> ADR-0010 (2026-10-07): bỏ quy định "tự viết, không giao AI". Agent được viết test cho các chỗ này;
> PR có test trọng yếu cần người review riêng phần test, đối chiếu từng assert với yêu cầu ở bảng dưới.
> Trạng thái file test theo dõi ở `spec/testing.md`. Còn thiếu tới 15/10: phần tự
> kích hoạt / ân hạn / quá hạn nhận hàng của job chuyển trạng thái (T8), hard timeout firmware (phần cứng).

| Chỗ | Test bắt buộc |
|---|---|
| Idempotency webhook | Gửi 2 webhook song song, phải có unique constraint ở CSDL — **cho cả đơn kiosk và phiên thanh toán thuê slot; phiên nhiều hóa đơn không được cấp số hóa đơn lần hai** **[ADR-0006, ADR-0008]** · **webhook PayOS gửi lại cùng `orderCode:reference` chỉ ghi nhận 1 lần; mã tham chiếu lạ có chữ ký đúng → 200 `UNKNOWN_REFERENCE`, không đổi dữ liệu** **[ADR-0016]** |
| Cô lập mức slot | Brand A truy vấn slot Brand B **trên cùng máy** — **gồm hóa đơn, bồi thường; danh sách slot trống có đúng 7 trường** **[ADR-0006]** · **kỳ chi trả, phiếu trả hàng, phụ lục của B không lọt sang A** **[ADR-0013, ADR-0014]** |
| `revenue_owner` | Tạo đơn → thanh lý → đơn cũ vẫn phải thuộc BRAND · **`UPDATE orders SET revenue_owner = …` bị CSDL từ chối với `chk_order_snapshot_immutable`** **[ADR-0009]** |
| Unique constraint slot | Cho thuê slot đang bán hàng thanh lý → phải bị từ chối |
| TTL lệnh xịt | Gửi lệnh hết hạn thẳng tới thiết bị → thiết bị phải từ chối · **bấm nút sau `DISPENSE_PRESS_WINDOW_SEC` → không xịt, `PRESS_TIMEOUT`** **[ADR-0007]** · **broker gửi lại lệnh đã `ACK` → `REJECT CMD_DUPLICATE` không làm đơn `FAILED`** **[ADR-0011]** |
| Hard timeout firmware | Lệnh sai định dạng → van và bơm vẫn dừng ở 800ms |
| Chuyển trạng thái theo lịch | Tắt dịch vụ qua mốc chuyển trạng thái, bật lại → phải bù — **gồm hủy phiên hết giờ giữ chỗ cùng mọi hóa đơn của nó (FR-SLT-39) và tự kích hoạt sau `RENTAL_MAX_STOCKING_DAYS` (FR-SLT-42)** **[ADR-0006]** · **hết ân hạn mặc định 7 ngày, quá `RETURN_PICKUP_MAX_DAYS` chưa nhận hàng** **[ADR-0014]** · **đơn chờ lượt quá `PAID_QUEUE_MAX_SEC`** **[ADR-0015]** · **phiếu khiếu nại quá `REFUND_CLAIM_MAX_OPEN_DAYS`, xóa liên hệ sau `REFUND_CLAIM_CONTACT_RETENTION_DAYS`** **[ADR-0012]** |
| ~~Yêu cầu thuê slot trùng lặp~~ → **Giữ chỗ slot đồng thời** | Hai thương hiệu checkout cùng slot đồng thời → chỉ 1 hóa đơn DRAFT được tạo, do `excl_slot_rental_overlap` chặn (FR-SLT-35) **[ADR-0006]** · **giỏ nhiều slot có một slot đã bị giữ → cả phiên bị từ chối, không sót hóa đơn nào; hai giỏ chồng nhau một slot checkout đồng thời → chỉ một giỏ thành công** **[ADR-0008]** · **đổi slot đồng thời với thương hiệu khác giữ slot đích → chỉ một bên thành công; giỏ làm tổng slot chưa thanh toán vượt 5 → `HOLD_LIMIT_REACHED`** **[ADR-0014]** |
| **Mất điện giữa lúc xịt** | **Ngắt nguồn hoặc reset ESP32 khi van đang mở → van phải đóng, bơm phải dừng, lệnh không được thực hiện lại khi khởi động** · **reset khi đèn nút đang sáng → khởi động lại không sáng đèn, bấm nút không xịt** **[ADR-0007]** |
| **Một đơn chờ thanh toán mỗi máy** **[ADR-0015]** | Hai đơn tạo đồng thời trên một máy → chỉ một thành công, CSDL chặn bằng `uq_machine_open_order` · hủy đơn rồi tiền vẫn về → `REFUND_PENDING` · mở phiếu nạp khi đèn đang sáng → `MACHINE_BUSY` · `DRAINING` tự sang `MAINTENANCE` khi hết đơn |
| **Tài khoản hoàn tiền** **[ADR-0012]** | Đóng phiếu ở cả ba trạng thái → khối tài khoản bị xóa; UPDATE sang trạng thái đóng mà còn dữ liệu bị CSDL từ chối · sau một vòng khiếu nại → hoàn tiền, không bảng nào ngoài `refund_claims` chứa số tài khoản · người không được phân công (kể cả Super Admin) xem tài khoản → `CLAIM_NOT_ASSIGNED` · webhook PayOS có `counterAccount*` → không có trong `payment_events.payload` · mã khiếu nại dùng lại hoặc đoán bừa → `NOT_FOUND` |

---

## Làm ngay tuần 6

1. ✓ TV1 xong PR contract ADR-0013/0014/0015 ngày 16/10 (chờ review + merge) — TV3, TV4 bắt đầu được tự đăng ký, không gia hạn, đổi slot, `DRAINING` **[ADR-0013, 0014, 0015]**
2. ✓ TV1 xong hủy đơn từ kiosk + hủy link PayOS, `uq_machine_open_order`, job chờ lượt, gắn cờ từ chối trước `ACK`, tự tắt slot sau lỗi liên tiếp **[ADR-0015]**
3. TV3, TV4, TV1 viết AC cho 28 FR mới và soát AC của các FR viết lại — xong trước khi giao agent hiện thực **[ADR-0013, 0014, 0015]**
4. TV1 chạy một lượt PayOS thật với số tiền nhỏ cho cả đơn kiosk và phiên thuê slot, ghi kết quả vào `docs/PAYOS.md` **[ADR-0016]**
5. TV2 chuyển mạch sang bo hàn lỗ, lắp thử vách ngăn và quạt hút — điều kiện để G4 chạy được nước hoa thật
6. Cả nhóm chạy `make seed` (hóa đơn seed nay theo mô hình mua gói), rồi **chủ module xem lại màn hình TV1 vừa làm trong module mình** và nhận giữ từ đây: TV3 — Thương hiệu, Tài khoản, Hồ sơ thương hiệu, Bảng giá; TV4 — Sản phẩm, Địa điểm, Đăng ký máy, khóa MQTT, lịch sử trạng thái **[UI-16/10]**
7. TV4 xong màn sự cố `QUEUE_TIMEOUT` trên kiosk — backend đã trả mã này từ 16/10 **[ADR-0015]**

---

## Nhật ký thay đổi

### 16/10/2026 (2) — Rà soát màn hình còn thiếu

Đối chiếu bằng script: mọi endpoint trong `openapi.yaml`, endpoint backend đã hiện thực (decorator
NestJS), endpoint web quản trị và kiosk đang gọi. Trước rà soát, web quản trị có 9 màn hình; Super Admin
không tạo được thương hiệu, tài khoản, máy và Brand Admin không tạo được sản phẩm nếu không dùng Swagger.

| Thay đổi | Lý do |
|---|---|
| T6: TV1 làm 12 màn hình cho phần đã có backend (xem dòng **[UI-16/10]** ở T6) + backend `GET /reports/brand-slots` | Chặn pilot: thương hiệu không tạo được sản phẩm thì không gán vào slot được; Ops không có chỗ xem đơn lỗi do dừng bán an toàn sinh ra |
| Quy tắc mới từ T7: việc nghiệp vụ có người dùng thao tác làm kèm màn hình; G5 kiểm thêm "không còn endpoint có backend mà không có màn hình" | Lộ trình cũ viết việc ở mức nghiệp vụ nên màn hình bị bỏ qua — bảng giá T3 chỉ có backend |
| T7 TV1: xịt chẩn đoán + danh sách lệnh xịt (FR-MNT-09, FR-DSP-20); màn kỳ chi trả và tách doanh thu (FR-REV-04) | DSP là của TV1; checklist sau bảo trì của TV4 ở T8 cần xịt chẩn đoán |
| T7 TV4: tách quyền `machine.view` cho Operations Staff | Ops thấy menu "Máy" nhưng API trả 403 |
| T8 TV1: truy vết đơn (FR-AUD-11), telemetry và sự kiện thiết bị, đẩy lại cấu hình (FR-IOT-04 ÷ 06), xếp hạng sản phẩm (FR-RPT-06) | Dữ liệu nằm trong ORD/DSP/IOT và `kiosk_interaction_events` do TV1 làm; TV4 đã nặng nhất ở T7–T8 |
| T8 TV4: ghi rõ màn hình cảnh báo, thông báo trong ứng dụng (FR-EXP-01), phiếu bảo trì, Dashboard (FR-RPT-01, 02, 09), báo cáo tồn kho (FR-INV-21), AuditLog | Các FR mức M này trước chỉ ghi "Dashboard · AuditLog", không nói rõ endpoint và màn hình |
| Chủ module nhận giữ màn hình TV1 làm: PRD, MCH → TV4; BND, USR, bảng giá → TV3 | Giữ nguyên phân công theo module |

### 16/10/2026 — Code phần mềm hoàn thành trong T8

| Thay đổi | Lý do |
|---|---|
| Đóng băng code cuối T8 (08/11) thay vì cuối T9; T6 giữ nguyên | Yêu cầu hoàn thành code phần mềm trong 8 tuần; còn thời gian cho kiểm thử, UAT và diễn tập trước pilot |
| T7 nhận thêm từ T8 cũ: kỳ chi trả + tách doanh thu, test `revenue_owner` (TV1); xác minh pháp nhân, báo không gia hạn (TV3); INV trọn gói (TV4) | Các phần này là nền cho T8: chặn `BRAND_NOT_VERIFIED`, trả hàng, kích hoạt khi lắp chai |
| T8 nhận thêm từ T9 cũ: thanh lý, trả hàng (TV3+TV4), bảo hiểm hàng hóa, RefillRequest, báo cáo doanh thu bán gói (TV1), MNT/Dashboard/AuditLog/RPT-04 (TV4); rate limit từ T10 cũ (TV1) | Mọi việc viết code phải xong trước 08/11 |
| Bảo hiểm hàng hóa TV3 → TV1; FR-SLT-47 TV4 → TV1 | TV3 và TV4 gánh phần lớn việc dồn lên; TV1 có kỳ chi trả cùng mảng tiền |
| TV4 tạm dừng hỗ trợ phần cứng trong T7–T8, quay lại T9 (1–2 ngày) và T10 (toàn thời gian) | Dồn người cho phần mềm hai tuần cuối |
| T9 = kiểm thử, bảo mật, UAT (nội dung T10 cũ trừ rate limit); G6 dời lên T9 | Không còn việc code tính năng |
| T10 mới: hoàn thiện máy, 1.000 chu kỳ, kiểm thử mất điện, diễn tập pilot; thêm mốc **HW-B** | Phần cứng được trải dài; máy phải hoàn chỉnh trong vỏ trước pilot |
| Trượt G4 tách hai nhánh: do phần mềm → cắt FR; do phần cứng → chạy lại muộn nhất Integration Day T9 | Không để phần cứng kéo dời mốc đóng băng code |
| Xuất `docs/`, ma trận truy vết dời T11 → T10 | T10 có thời gian trống phía phần mềm |

### 15/10/2026 — Rút lịch xuống 12 tuần, áp ADR-0009 ÷ 0016

| Thay đổi | Lý do |
|---|---|
| Kết thúc 06/12 thay vì 13/12; bỏ T13. T10 gộp đóng băng + kiểm thử + bảo mật (T10, T11 cũ); T11 là pilot + video (T12 cũ); T12 là tài liệu + bảo vệ (T13 cũ) | Yêu cầu hoàn thành trong 12 tuần |
| Bảo mật, sao lưu CSDL, kiểm thử mất điện dời lên T10, trước pilot | Pilot thu tiền thật qua PayOS và giữ tài khoản hoàn tiền thật của khách (ADR-0012, ADR-0016) |
| T9 là hạn chót thêm tính năng; nộp dàn ý chương báo cáo ở T9 | Không còn tuần dự phòng; T12 chỉ đủ để hoàn thiện tài liệu |
| Thêm mục "Phạm vi cắt khi rút lịch": bỏ FR-SLT-51 (S), FR-ALR-15 (W), 4 ngăn thật; pilot tối thiểu 5 ngày | Phạm vi tăng 28 FR mà lịch ngắn đi một tuần |
| T5 đánh dấu đã xong toàn bộ, Gate 3 đạt; ghi thêm việc làm vượt kế hoạch: PayOS kéo sớm từ T6, phiếu khiếu nại trọn gói, danh sách kiểm tra thủ công, test trọng yếu idempotency và TTL | Nhóm đã hoàn thành T5 và đang làm T6 từ 12/10, đi trước lịch khoảng một tuần; ADR-0010, 0011, 0012, 0016 đã hiện thực 07/10 – 14/10 |
| Ngày trong "Lịch tuần" giữ làm hạn chót, không dời theo tiến độ | Tuần đi trước là vùng đệm; không rút thêm mốc kết thúc |
| T6 thêm: PR contract ADR-0013/14/15 (mốc giữa tuần 16/10), AC cho 28 FR mới, hủy đơn từ kiosk (đang làm) | Đặc tả đã áp 14/10 nhưng chưa có migration và endpoint; việc chưa xong không thuộc T5 cũ |
| T6: "sandbox" → lượt PayOS thật số tiền nhỏ; thêm dừng bán an toàn (TV1), tự đăng ký + hợp đồng khung (TV3), kiosk hủy đơn ở mọi lối thoát (TV4) | PayOS không có sandbox (ADR-0016); thời gian giải phóng dùng cho ADR-0013, 0015 |
| T7: chốt chặn "máy dừng nhận đơn" (TV1), `DRAINING` (TV4), phụ lục + giới hạn giữ chỗ + đổi slot (TV3), hạ tầng email FR-ALR-16 (TV4); G4 dùng PayOS thật và thêm hai nhánh an toàn | ADR-0013, 0014, 0015; email phải có trước các thông báo T8–T9 |
| T8: ân hạn mặc định 7 ngày, báo không gia hạn, xác minh pháp nhân (TV3); kỳ chi trả tháng thay bảng đối soát (TV1); giấy tờ chính hãng và phiếu nạp dừng bán cả máy (TV4) | ADR-0013, 0014, 0015 |
| T9: trả hàng khi không gia hạn (TV3+TV4); FR-RPT-04 theo máy (TV4); G5 kiểm cả hai nhánh kết thúc hóa đơn và kỳ chi trả | ADR-0014, 0015, 0013 |
| RefillRequest chuyển từ TV3 sang TV1 (T9); TV3 vẫn viết AC RFQ ở T6 | TV3 nhận thêm phần lớn việc của ADR-0013, 0014 |
| Bảng test trọng yếu thêm hai chỗ "Một đơn chờ thanh toán mỗi máy", "Tài khoản hoàn tiền" và ca mới cho các chỗ cũ | ADR-0009, 0011, 0012, 0014, 0015, 0016 |
| Thêm bảng "Ràng buộc phần mềm từ ADR-0009 ÷ 0016" | Agent cần đọc trước khi nhận việc |

### 30/09/2026 — Thanh toán một lần cho nhiều slot (ADR-0008)

| Thay đổi | Lý do |
|---|---|
| Thêm phiên thanh toán (`rental_checkouts`): chọn nhiều slot, trả một lần; mỗi slot vẫn một hóa đơn, một số hóa đơn | ADR-0006 bắt thương hiệu thuê 3 slot phải checkout và quét QR 3 lần; gộp vào một hóa đơn thì vỡ vòng đời từng slot |
| `POST /slot-rentals/checkout` → `POST /rental-checkouts`; `POST /slot-rentals/{id}/payments` → `POST /rental-checkouts/{id}/payments` | Thanh toán trỏ tới phiên; hai endpoint cũ chưa hiện thực nên thay, không để DEPRECATED |
| TV1 T4: webhook phân nhánh theo `rental_checkout_id` thay vì `slot_rental_id` · duyệt ADR-0008 | Payment giờ trỏ tới phiên |
| TV3 T4–T5: checkout giỏ, thanh toán phiên, job hủy theo phiên, màn hình giỏ | Khối lượng tăng nhẹ; không đổi mốc |
| Bổ sung ca cho test tự viết "Giữ chỗ slot đồng thời", "Idempotency webhook", "Chuyển trạng thái theo lịch" | Giỏ nhiều slot phải tất cả hoặc không có gì; phiên nhiều hóa đơn không được cấp số hai lần hay hủy sót |

### 29/09/2026 (2) — Khách bấm nút vật lý (ADR-0007)

| Thay đổi | Lý do |
|---|---|
| Máy sáng đèn nút rồi chờ khách bấm, không tự xịt | Đúng thiết kế phần cứng thật (bàn thử "nút → đèn → bơm" của TV2 ở T3); đặc tả cũ mô tả máy xịt ngay sau webhook |
| Thêm việc firmware T5 (TV2), backend + simulator T5 (TV1), màn kiosk T5 (TV4) | Ba phía đều phải biết trạng thái "đèn sáng, chờ bấm" |
| Gate 3, Gate 4 đổi lời thành "đèn sáng → bấm → xịt" | Mốc phải kiểm đúng hành vi thật |
| Bổ sung ca cho test tự viết "TTL lệnh xịt" và "Mất điện giữa lúc xịt" | Có thêm trạng thái chờ bấm cần chứng minh an toàn |
| Không hoàn tiền khi khách không bấm (đơn `FORFEITED`) | Quyết định của nhóm; điều khoản hiện trước khi thanh toán (FR-ORD-25) |

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
