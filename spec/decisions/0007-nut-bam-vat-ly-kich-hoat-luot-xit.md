# ADR-0007 — Khách bấm nút vật lý để nhận lượt xịt

**Ngày:** 2026-09-29 · **Trạng thái:** đã duyệt (TV1, 2026-09-29) · **Người quyết:** TV1

## Bối cảnh

Thiết kế thật của máy: **mỗi slot có một nút vật lý có đèn**. Thanh toán thành công thì đèn nút của
slot vừa mua sáng lên; khách bấm nút thì máy xịt. Bàn thử phần cứng "nút → đèn → bơm" của TV2 (lộ
trình tuần 3) đã đi theo thiết kế này.

Đặc tả và contract đang mô tả máy **tự xịt ngay** sau khi thanh toán:

| Chỗ | Đang ghi | Vì sao không dùng được với nút bấm |
|---|---|---|
| `mqtt.md` §5.2 | Thiết bị gửi xác nhận tiếp nhận rồi kích hoạt cơ cấu ngay | Không có bước chờ khách bấm |
| NFR-PER-03 | Từ lúc nhận webhook tới lúc kích hoạt cơ cấu ≤ `WEBHOOK_TO_ACTUATION_MAX_SEC` (5 giây) | Không thể đạt khi phải chờ người bấm |
| FR-DSP-06, FR-DSP-08 | Lệnh hết hiệu lực `DISPENSE_CMD_TTL_SEC` sau khi tạo; thiết bị từ chối lệnh hết hạn | Nếu hiểu là hạn để *kích hoạt*, khách bấm muộn bị từ chối |
| FR-DSP-18 | Không có kết quả trong `DISPENSE_RESULT_TIMEOUT_SEC` thì lệnh `UNKNOWN` | Khách bấm chậm bị ghi thành sự cố, đẩy vào kiểm tra thủ công |
| FR-ORD-10 | Không có trạng thái cho đơn "đã trả tiền nhưng khách không bấm" | Gộp vào `FAILED` làm sai tỷ lệ xịt lỗi và kéo vào kiểm tra thủ công |

## Phương án đã cân nhắc

| Câu hỏi | Các phương án | Chọn |
|---|---|---|
| Khách không bấm trong thời gian chờ | (a) cho sáng lại một lần rồi hoàn tiền · (b) hoàn tiền ngay · (c) **không hoàn tiền** | **(c)** |
| Thời gian chờ bấm | 30 · **60** · 120 giây | **60 giây** |
| Nút và phạm vi khóa | **mỗi slot một nút, khóa cả máy** · mỗi slot một nút, khóa riêng slot · một nút chung | **mỗi slot một nút, khóa cả máy** |

(c) ít việc nhất và khớp chủ trương của nhóm; cái giá là phải nói rõ với khách **trước khi thanh
toán** (FR-ORD-25) để không mâu thuẫn với BR-002. Khóa cả máy vì kiosk chỉ có một màn hình phục vụ
một khách; hai nút sáng cùng lúc thì người sau dễ bấm lượt của người trước.

## Quyết định

### Luồng mới

```
Webhook thanh toán ─> đơn PAID ─> (máy rảnh?) ─> tạo lệnh ─> thiết bị kiểm tra 7 bước
   ─> sáng đèn nút slot đích + gửi ACK   (đơn DISPENSE_REQUESTED, kiosk hiện "Mời bấm nút số N")
      ├─ khách bấm đúng nút trong DISPENSE_PRESS_WINDOW_SEC
      │     ─> kiểm tra an toàn lần hai ─> kích hoạt ─> RESULT ─> đơn DISPENSED
      ├─ hết DISPENSE_PRESS_WINDOW_SEC chưa bấm
      │     ─> tắt đèn, REJECT PRESS_TIMEOUT ─> lệnh REJECTED, đơn FORFEITED (không hoàn tiền)
      └─ lúc bấm mà cửa mở / đang bảo trì / slot rỗng
            ─> REJECT với mã tương ứng ─> đơn FAILED + kiểm tra thủ công (khách không có lỗi)
```

### Luật nghiệp vụ

**ACK nghĩa là "đã sáng đèn, đang chờ bấm".** Không thêm trạng thái lệnh mới: `ACKNOWLEDGED` đổi nghĩa
từ "đã nhận, sắp kích hoạt" thành "đã sáng đèn, chờ khách bấm". `REJECTED` giờ xảy ra được cả sau
`ACKNOWLEDGED`.

**Ba mốc thời gian tách bạch:**

| Hằng | Giá trị | Đo từ → đến |
|---|---|---|
| `DISPENSE_CMD_TTL_SEC` | 60 (giữ nguyên) | tạo lệnh → thiết bị phải nhận và sáng đèn. Quá hạn thì từ chối `CMD_EXPIRED` |
| `DISPENSE_PRESS_WINDOW_SEC` | **60 (mới)** | sáng đèn → khách phải bấm |
| `DISPENSE_RESULT_TIMEOUT_SEC` | 60 (giữ nguyên, đổi mốc) | gửi lệnh → ACK; hoặc ACK + `DISPENSE_PRESS_WINDOW_SEC` → RESULT/REJECT. Quá thì `UNKNOWN` |

**NFR-PER-03 tách làm hai:** webhook → đèn sáng ≤ `WEBHOOK_TO_ARMED_MAX_SEC` (5 giây, đổi tên từ
`WEBHOOK_TO_ACTUATION_MAX_SEC`); bấm nút → kích hoạt cơ cấu ≤ `PRESS_TO_ACTUATION_MAX_MS` (300 ms,
NFR-PER-07 mới).

**Không hoàn tiền khi khách không bấm.** Đơn chuyển trạng thái mới `FORFEITED`: không đánh dấu kiểm tra
thủ công (FR-ORD-19 loại trừ), không hoàn tiền, doanh thu vẫn ghi nhận theo `revenue_owner` như đơn
đã xịt. Báo cáo tách riêng `FORFEITED` khỏi tỷ lệ xịt lỗi (FR-RPT-04). Kiosk phải hiện điều khoản này
**trước khi hiện mã QR** (FR-ORD-25). BR-002 được làm rõ: khách được *quyền* nhận đúng một lượt xịt
trong thời gian chờ bấm.

**Chỉ `PRESS_TIMEOUT` là lỗi của khách.** Mọi lý do từ chối khác sau khi đã sáng đèn (cửa mở, bảo trì,
slot rỗng lúc bấm; mất điện dẫn tới `UNKNOWN`) đi theo luồng cũ: `FAILED` hoặc `UNKNOWN` + kiểm tra thủ
công (FR-ORD-19).

**Mỗi máy tối đa một lệnh xịt khách hàng đang hiệu lực** (`CREATED`, `SENT`, `ACKNOWLEDGED`), cưỡng
chế bằng partial unique index `uq_machine_active_customer_command`. Hai hệ quả:
- Kiosk từ chối tạo đơn mới khi máy đang có lệnh chờ bấm: `MACHINE_BUSY` (FR-ORD-24).
- Đơn thanh toán sau trong lúc máy bận (khách trước bỏ dở màn QR rồi trả tiền muộn) **giữ ở `PAID`**
  — chờ lượt — và chỉ được tạo lệnh khi lệnh trước kết thúc (FR-DSP-26). Không tạo lệnh sớm rồi để
  nó chờ: `DISPENSE_CMD_TTL_SEC` tính từ lúc tạo nên lệnh sẽ hết hạn trong hàng đợi.

**Lệnh chẩn đoán không chờ bấm** (FR-DSP-27): Operations Staff đứng tại máy và đã xác thực lại, thiết
bị kích hoạt ngay như cũ. Lệnh chẩn đoán cũng không tính vào ràng buộc một lệnh mỗi máy.

**An toàn:**
- Kiểm tra cửa mở, chế độ bảo trì, slot rỗng **lần hai đúng lúc bấm** (FR-DSP-23), vì các điều kiện
  này có thể đổi trong lúc chờ.
- Chỉ nút của slot đích có tác dụng; bấm nút slot khác bị bỏ qua (FR-DSP-22, bổ sung FR-DSP-15).
- Thiết bị **không khôi phục trạng thái chờ bấm** sau khi khởi động lại (FR-DSP-25): đèn tắt, lệnh
  không bao giờ được kích hoạt, nền tảng thấy `UNKNOWN` và đơn vào kiểm tra thủ công.
- `ACTUATOR_MAX_MS` và nút dừng khẩn cấp (NFR-SAF-01, 02) không đổi.

### Ánh xạ FR

| Loại | FR |
|---|---|
| **Sửa** | FR-DSP-06, 08, 11, 12, 13, 14, 15, 18; FR-ORD-10, 17, 19; FR-RPT-04; NFR-PER-03; BR-002 (làm rõ) |
| **Mới** | FR-DSP-21 ÷ 27 (7 FR), FR-ORD-24 ÷ 27 (4 FR), NFR-PER-07 — đều mức M |

### Hằng ngưỡng và mã lỗi

| Thay đổi | Chi tiết |
|---|---|
| Hằng mới | `DISPENSE_PRESS_WINDOW_SEC = 60`, `PRESS_TO_ACTUATION_MAX_MS = 300` |
| Đổi tên | `WEBHOOK_TO_ACTUATION_MAX_SEC` → `WEBHOOK_TO_ARMED_MAX_SEC` (giá trị 5 giữ nguyên; chưa có code nào dùng) |
| Mã lỗi mới | `PRESS_TIMEOUT` (thiết bị, không qua HTTP), `MACHINE_BUSY` (409, tạo đơn) |

### Thay đổi contract

| File | Thay đổi |
|---|---|
| Migration | `1790752000000_order-status-forfeited.sql` (chỉ `ADD VALUE 'FORFEITED'`), `1790752060000_one-active-customer-command-per-machine.sql` (index) |
| `schema.sql` | `order_status` thêm `FORFEITED`; index `uq_machine_active_customer_command`; COMMENT |
| `mqtt.md` | §5 nghĩa `expires_at`; §5.2 thực hiện có chờ bấm; §6 nghĩa ACK, REJECT sau ACK, bảng ánh xạ, mốc `UNKNOWN`, trường `pressed_at`; §7 `press_window_sec`; §9 `PRESS_TIMEOUT`; §10 hằng |
| `openapi.yaml` | `OrderStatus` thêm `FORFEITED`; `OrderStatusView` thêm `slotNumber`, `pressDeadline`; `POST /kiosk/orders` thêm `MACHINE_BUSY`; mô tả webhook và lệnh xịt |
| `erd.md`, DBML | Ràng buộc mới; enum |
| Sinh lại | `data-dictionary.md`, `openapi.ts`, `types.generated.ts`, hằng và mã lỗi |

## Hệ quả

**Test người tự viết bị ảnh hưởng** (`spec/testing.md`):
- *TTL lệnh xịt* — thêm ca: bấm sau `DISPENSE_PRESS_WINDOW_SEC` → thiết bị tắt đèn, `PRESS_TIMEOUT`,
  không kích hoạt.
- *Hard timeout firmware* — không đổi, nhưng chạy lại với luồng có nút.
- *Mất điện giữa lúc xịt* — thêm ca: reset khi đèn đang sáng → khởi động lại không sáng lại, không xịt.
- *Idempotency webhook* — thêm ca: hai đơn cùng máy trả tiền gần nhau → chỉ một lệnh hiệu lực, đơn sau
  chờ ở `PAID` rồi mới có lệnh.

**Phần cứng và firmware (TV2):** đọc nút theo từng slot có chống dội (debounce), điều khiển đèn nút,
bộ đếm `press_window_sec` bằng timer phần cứng, không lưu trạng thái chờ bấm vào bộ nhớ không mất điện.

**Kiosk (TV4):** màn điều khoản trước QR, màn "Mời bấm nút số N" có đếm ngược, màn "Máy đang phục vụ
khách khác", màn "Đang chờ lượt" cho đơn `PAID` chờ máy rảnh, màn "Hết thời gian bấm nút".

**Giới hạn đã biết:** khách không bấm là mất lượt — chấp nhận theo quyết định của nhóm, nhưng hội đồng
có thể hỏi; câu trả lời là điều khoản được hiện trước khi thanh toán (FR-ORD-25) và thời gian chờ là
hằng cấu hình được.
