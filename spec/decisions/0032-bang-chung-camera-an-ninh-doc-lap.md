# ADR-0032 — Bằng chứng hình ảnh từ camera an ninh độc lập với máy

**Ngày:** 2026-11-17 · **Trạng thái:** đề xuất · **Người quyết:** TV1

## Bối cảnh

Mọi kết luận hiện nay về một lượt xịt hay một lần nạp chai đều dựa trên **dữ liệu do chính máy gửi về**:
lệnh xịt `ACK`/`RESULT`, sự kiện bấm nút, telemetry, cân/đếm lượt (ADR-0007, ADR-0019). Hội đồng đã chỉ
ra hai câu hỏi mà dữ liệu đó không trả lời được:

| Câu hỏi | Vì sao dữ liệu máy không đủ |
|---|---|
| Khách khai **chưa nhận lượt xịt**, nhưng thực tế đã nhận | Đơn chỉ mở được phiếu khiếu nại khi máy báo lỗi hoặc không rõ kết quả (ADR-0012). Đúng ở chỗ máy không chắc, nên máy không thể tự làm chứng cho mình. Từ chối khiếu nại chỉ bằng log máy thì khách không có lý do để tin |
| Nhân viên **tráo chai** khi nạp (thay nước hoa thật của thương hiệu bằng hàng khác) | Phiếu nạp ghi chai cũ, chai mới, người thực hiện (FR-INV-29 ÷ 31), nhưng những dữ liệu đó do chính người nạp nhập hoặc máy đo — không chứng minh được thứ gì đã thực sự được đổ vào |

Hội đồng gợi ý dùng **camera an ninh hoạt động độc lập với máy**, đối chiếu với đơn hoặc phiếu nạp theo
thời gian. ADR-0031 đã chừa sẵn `key` trong liên kết email để chỉ chủ phiếu xem được bằng chứng.

## Phương án đã cân nhắc

1. **Tích hợp camera vào máy** (ESP32-CAM hay camera USB điều khiển từ kiosk). Bị loại: camera khi đó lại
   là một phần của máy — đúng thứ hội đồng nói không thể tin hoàn toàn; thêm phần cứng, firmware, băng
   thông.
2. **Hệ thống kéo luồng video trực tiếp từ đầu ghi (RTSP/ONVIF) và tự cắt theo đơn.** Bị loại cho phạm vi
   đồ án: phụ thuộc hãng camera, phải lưu và xử lý video liên tục, tự động hoá chưa cần khi số khiếu nại
   ít.
3. **Camera ghi độc lập; hệ thống chỉ chỉ ra khung giờ cần xem, nhận đoạn trích do người tải lên, và cho
   đúng người xem.** **Chọn.** Camera hoàn toàn không phụ thuộc máy hay phần mềm ScentStation; hệ thống
   không cần biết hãng camera; video chỉ lưu khi có sự việc.

## Quyết định

### 1. Nguyên tắc

- Mỗi máy có một camera an ninh **do nền tảng lắp, ghi liên tục lên đầu ghi hoặc thẻ nhớ của chính nó**,
  quay được mặt trước máy (khách đứng nhận lượt xịt) và khoang chai khi mở cửa nạp. ScentStation không
  điều khiển, không kéo luồng, không lưu toàn bộ video.
- Hệ thống giữ **ba việc**: (a) chỉ ra máy nào, camera nào, khung giờ nào; (b) nhận đoạn trích hoặc ảnh
  làm bằng chứng, gắn vào đúng hồ sơ, ghi dấu vân tay tệp; (c) cho đúng người xem, có thời hạn, có ghi vết.
- Bằng chứng gắn vào hai loại hồ sơ: **phiếu khiếu nại hoàn tiền** (`refund_claims`) và **phiếu nạp**
  (`refill_sessions`).

### 2. Khung giờ đề xuất

Hệ thống tự tính và hiện cho người đi lấy bằng chứng, cộng hai đầu `CAMERA_WINDOW_PADDING_SEC`:

| Hồ sơ | Từ | Tới |
|---|---|---|
| Phiếu khiếu nại | `orders.paid_at` | Mốc muộn nhất trong `dispense_commands.completed_at`, `orders.updated_at` của đơn |
| Phiếu nạp | `refill_sessions.started_at` | `completed_at` (phiếu `CANCELLED` cũng ghi thời điểm hủy vào cột này) |

Khi tải lên, người tải khai **khoảng thời gian ghi** (`recorded_from`, `recorded_to`, theo giờ hệ thống) và
**độ lệch đồng hồ camera** (`clock_offset_sec` = giờ trên hình − giờ thật, đọc bằng cách so dấu giờ trên
hình với đồng hồ hệ thống). Khoảng ghi sau khi trừ độ lệch **phải giao với khung giờ đề xuất**, không thì
`VALIDATION_ERROR` — đây là chỗ cưỡng chế "ngày giờ tạo đơn khớp với ngày giờ ghi hình".

Quy trình vận hành (ngoài phần mềm): đồng hồ camera đồng bộ NTP; mỗi lần lắp hoặc thay camera ghi lại
nhãn camera vào máy (mục 5).

### 3. Ai tải lên, ai xem

| Hồ sơ | Tải lên | Xem |
|---|---|---|
| Phiếu khiếu nại | Operations Staff **đang được phân công** phiếu (như ADR-0012 quy tắc 4) | Người được phân công, Platform Super Admin; **khách** khi phiếu `REJECTED` (mục 6) |
| Phiếu nạp | Operations Staff, Platform Super Admin — **không phải người đã thực hiện phiếu nạp** (`performed_by`) | Operations Staff, Platform Super Admin, Brand Admin của thương hiệu sở hữu phiếu (BR-012) |

Inventory Staff không tải lên và không xem bằng chứng phiếu nạp: người bị kiểm tra không được tự nộp
bằng chứng cho mình.

Không thêm quyền mới — dùng quyền đã có trong bảng `permissions`:

| Việc | Quyền | Ai có |
|---|---|---|
| Bằng chứng phiếu khiếu nại | `order.refund` (tải lên: thêm điều kiện được phân công) | Operations Staff, Super Admin |
| Tải bằng chứng phiếu nạp, đóng yêu cầu trích hình, xem bằng chứng phiếu nạp | `machine.operate` | Operations Staff, Super Admin |
| Gửi yêu cầu trích hình | `refill.request` + tài khoản thương hiệu | Brand Admin |
| Nhãn camera của máy | `machine.manage` | Super Admin |

### 4. Từ chối khiếu nại phải có bằng chứng

Phiếu có `refund_order = true` (khách nói không nhận được lượt xịt) chỉ được chuyển `REJECTED` khi đã gắn
**ít nhất một** bằng chứng. Thiếu thì `EVIDENCE_REQUIRED`. Phiếu chỉ khiếu nại chuyển khoản thừa
(`refund_order = false`) không cần — bằng chứng ở đây là sao kê ngân hàng, không phải camera.

Hoàn tiền (`REFUNDED`) không bắt buộc bằng chứng.

### 5. Gắn camera với máy

Thêm `machines.camera_label` (ví dụ "Cam-03 · Vincom Q1 · tầng 2") để người đi lấy hình biết tua đầu ghi
nào. Platform Super Admin sửa ở màn chi tiết máy. Máy chưa có nhãn vẫn tải được bằng chứng — người tải ghi
nhãn camera trên từng tệp.

### 6. Khách xem bằng chứng

- Trang tra cứu `/claim/status` (ADR-0031) hiện mục "Hình ảnh đối chiếu" **chỉ khi** phiếu `REJECTED`, có
  bằng chứng, và liên kết có `key` đúng (chỉ có trong email gửi khách). Nhập tay mỗi mã khiếu nại thì chỉ
  thấy dòng "Phiếu có hình ảnh đối chiếu — mở liên kết trong email để xem".
- `GET /public/refund-claims/{code}/evidence?key=…` trả danh sách tệp kèm URL ký có hạn
  `CAMERA_EVIDENCE_URL_TTL_SEC`. Sai mã hoặc sai `key` → `NOT_FOUND`. Cùng giới hạn tần suất với tra cứu.
- Mỗi lần cấp URL ghi AuditLog `evd.evidence.viewed` (người xem là khách ẩn danh, phiếu nào, tệp nào).

### 7. Brand Admin yêu cầu trích hình phiếu nạp

- Brand Admin gửi **yêu cầu trích hình** cho một phiếu nạp của mình, kèm lý do, trong vòng
  `CAMERA_FOOTAGE_REQUEST_MAX_DAYS` ngày kể từ lúc mở phiếu — quá hạn này đầu ghi có thể đã ghi đè.
- Mỗi phiếu nạp tối đa một yêu cầu đang mở. Yêu cầu sinh thông báo trong ứng dụng cho mọi tài khoản nền
  tảng có `machine.operate` (`notifyPermissionHolders`); kết quả báo lại đúng Brand Admin đã gửi
  (`notifyUsers`).
- Người xử lý đóng yêu cầu bằng một trong hai cách: **đã đính hình** (gắn ít nhất một bằng chứng) hoặc
  **không có hình** (bắt buộc ghi lý do: camera hỏng, đã bị ghi đè…). Brand Admin nhận thông báo kết quả.
- Nền tảng vẫn tự gắn bằng chứng phiếu nạp được bất cứ lúc nào, không cần yêu cầu (kiểm tra ngẫu nhiên,
  lệch tồn kho).

### 8. Tệp, lưu trữ, toàn vẹn

| Hạng mục | Quyết định |
|---|---|
| Định dạng | Video MP4 (kiểm hộp `ftyp` ở đầu tệp, không chỉ tin `Content-Type`), **không chuyển mã** — chưa có worker/ffmpeg (ADR-0020). Ảnh JPEG/PNG mã hoá lại qua `sharp`, bỏ EXIF |
| Giới hạn | Video ≤ `CAMERA_CLIP_MAX_BYTES`, ảnh ≤ `CAMERA_IMAGE_MAX_BYTES`, tối đa `CAMERA_EVIDENCE_MAX_PER_TARGET` tệp mỗi hồ sơ |
| Nơi lưu | **Kho riêng tư**, tách khỏi kho ảnh công khai: bucket `R2_PRIVATE_BUCKET` không có tên miền công khai (driver `r2`), hoặc thư mục `MEDIA_PRIVATE_DIR` (mặc định `storage/private-media`, không được nằm trong `MEDIA_DIR`). Driver `r2` mà chưa khai `R2_PRIVATE_BUCKET` thì lùi về thư mục và ghi cảnh báo lúc khởi động. Không bao giờ có URL công khai cố định như ảnh sản phẩm |
| Đọc | Đường dẫn ký có hạn **qua API**: `GET /evidence-files/{id}?exp=…&sig=…`, chữ ký HMAC bằng khóa dẫn xuất từ `JWT_SECRET` (không dùng chung khóa với JWT). API đọc tệp từ kho riêng tư rồi trả về, hỗ trợ `Range` để trình duyệt tua video. Không cần presigned URL của S3 nên không thêm thư viện, và cùng một cách cho cả hai driver |
| Toàn vẹn | Lưu SHA-256 của tệp lúc tải lên, hiện ở web quản trị. Tệp **không sửa được**; khóa đối tượng chứa id ngẫu nhiên |
| Gỡ nhầm | Người tải gỡ được tệp của mình khi hồ sơ còn mở — phiếu khiếu nại còn `OPEN`; phiếu nạp chưa có yêu cầu trích hình nào đã đóng (đã trả lời thương hiệu thì không rút hình lại được). Bắt buộc lý do, có AuditLog. Dòng đã gỡ vẫn tính vào giới hạn số tệp. Hồ sơ đã đóng thì không gỡ được — chỉ job xoá theo hạn |
| Ảnh | Mã hoá lại sang WebP, cạnh dài ≤ `CAMERA_IMAGE_MAX_EDGE_PX` |

Kho riêng tư là cổng mới `PRIVATE_MEDIA_STORAGE` (`put`, `get`, `delete`) cạnh `MediaStorage`; kho ảnh
công khai giữ nguyên cho ảnh sản phẩm, logo, ảnh khai báo gửi hàng.

### 9. Thời hạn lưu và dữ liệu cá nhân

- **Bằng chứng phiếu khiếu nại** bị xoá cùng khối liên hệ — `REFUND_CLAIM_CONTACT_RETENTION_DAYS` ngày sau
  khi phiếu đóng, chung job xoá của ADR-0012 (có bù sau downtime).
- **Bằng chứng phiếu nạp** bị xoá sau `CAMERA_REFILL_EVIDENCE_RETENTION_DAYS` ngày kể từ lúc tải lên —
  đủ qua ít nhất một kỳ chi trả tháng (ADR-0013) để thương hiệu còn đối chiếu.
- Xoá tệp thì giữ lại dòng hồ sơ (ai tải, lúc nào, SHA-256, `purged_at`) — chứng minh đã từng có bằng
  chứng mà không còn giữ hình.
- **Đoạn trích chỉ gồm khoảng của chính sự việc.** Người tải chịu trách nhiệm cắt sao cho không lộ rõ mặt
  khách khác; không tránh được thì làm mờ bằng công cụ của đầu ghi trước khi tải lên.
- **Thông báo và đồng ý:** biển "Khu vực có camera an ninh" tại mỗi máy; nội dung đồng ý ở form khiếu nại
  (ADR-0012 quy tắc 9) thêm: hình ảnh tại máy trong thời gian giao dịch có thể được dùng để xử lý phiếu và
  gửi lại cho chính người khiếu nại. Nội dung nên được người có chuyên môn pháp lý xem theo Nghị định
  13/2023/NĐ-CP.
- Thông tin nhân viên trong video phiếu nạp là dữ liệu nhân sự nội bộ — cần ghi vào quy chế lao động/nội
  quy rằng khu vực máy có camera.

### 10. Lược đồ

Module mới **EVD** (bằng chứng), sở hữu hai bảng dưới; ORD và INV gọi qua `EvdService`.

```sql
CREATE TYPE evidence_kind AS ENUM ('VIDEO', 'IMAGE');
CREATE TYPE footage_request_status AS ENUM ('OPEN', 'FULFILLED', 'UNAVAILABLE');

CREATE TABLE camera_evidence (
    id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    refund_claim_id    uuid          REFERENCES refund_claims (id),
    refill_session_id  uuid          REFERENCES refill_sessions (id),
    kind               evidence_kind NOT NULL,
    storage_key        text,
    content_type       varchar(50)   NOT NULL,
    size_bytes         integer       NOT NULL,
    sha256             char(64)      NOT NULL,
    camera_label       varchar(100)  NOT NULL,
    recorded_from      timestamptz   NOT NULL,
    recorded_to        timestamptz   NOT NULL,
    clock_offset_sec   integer       NOT NULL DEFAULT 0,
    note               text,
    uploaded_by        uuid          NOT NULL REFERENCES users (id),
    uploaded_at        timestamptz   NOT NULL DEFAULT now(),
    removed_by         uuid          REFERENCES users (id),
    removed_reason     text,
    purged_at          timestamptz,

    CONSTRAINT chk_evidence_one_target
        CHECK (num_nonnulls(refund_claim_id, refill_session_id) = 1),
    CONSTRAINT chk_evidence_recorded_range CHECK (recorded_to > recorded_from),
    CONSTRAINT chk_evidence_size_positive CHECK (size_bytes > 0),
    CONSTRAINT chk_evidence_removed_has_reason
        CHECK (removed_by IS NULL OR removed_reason IS NOT NULL),
    CONSTRAINT chk_evidence_file_present
        CHECK ((storage_key IS NULL) = (purged_at IS NOT NULL OR removed_by IS NOT NULL))
);

CREATE INDEX idx_evidence_claim  ON camera_evidence (refund_claim_id)   WHERE refund_claim_id IS NOT NULL;
CREATE INDEX idx_evidence_refill ON camera_evidence (refill_session_id) WHERE refill_session_id IS NOT NULL;

CREATE TABLE footage_requests (
    id                 uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
    refill_session_id  uuid                   NOT NULL,
    brand_id           uuid                   NOT NULL,
    status             footage_request_status NOT NULL DEFAULT 'OPEN',
    reason             text                   NOT NULL,
    requested_by       uuid                   NOT NULL REFERENCES users (id),
    response_note      text,
    resolved_by        uuid                   REFERENCES users (id),
    created_at         timestamptz            NOT NULL DEFAULT now(),
    resolved_at        timestamptz,

    CONSTRAINT fk_footage_request_session_same_brand
        FOREIGN KEY (refill_session_id, brand_id) REFERENCES refill_sessions (id, brand_id),
    CONSTRAINT chk_footage_request_unavailable_has_note
        CHECK (status <> 'UNAVAILABLE' OR response_note IS NOT NULL),
    CONSTRAINT chk_footage_request_resolved
        CHECK ((status = 'OPEN') = (resolved_at IS NULL))
);

CREATE UNIQUE INDEX uq_footage_request_open
    ON footage_requests (refill_session_id) WHERE status = 'OPEN';

ALTER TABLE machines ADD COLUMN camera_label varchar(100);
```

Khóa ngoại kép cần thêm `UNIQUE (id, brand_id)` trên `refill_sessions`, như `uq_order_id_brand` ở
ADR-0012.

### 11. Hằng ngưỡng (`spec/constraints.md`)

| Hằng | Giá trị | FR |
|---|---|---|
| `CAMERA_WINDOW_PADDING_SEC` | 60 | FR-ORD-38, FR-INV-38 |
| `CAMERA_CLIP_MAX_BYTES` | 20971520 (20 MB, khoảng 30 giây 720p) | FR-ORD-38, FR-INV-38 |
| `CAMERA_IMAGE_MAX_BYTES` | 5242880 (5 MB) | FR-ORD-38, FR-INV-38 |
| `CAMERA_IMAGE_MAX_EDGE_PX` | 1920 | FR-ORD-38, FR-INV-38 |
| `CAMERA_EVIDENCE_MAX_PER_TARGET` | 5 | FR-ORD-38, FR-INV-38 |
| `CAMERA_EVIDENCE_URL_TTL_SEC` | 300 | FR-ORD-39, FR-INV-38 |
| `CAMERA_FOOTAGE_REQUEST_MAX_DAYS` | 14 | FR-INV-39 |
| `CAMERA_REFILL_EVIDENCE_RETENTION_DAYS` | 90 | FR-INV-38 |

`CAMERA_FOOTAGE_REQUEST_MAX_DAYS` phải **không lớn hơn** số ngày đầu ghi giữ hình; khi mua camera cần
chọn loại giữ được ít nhất 14 ngày.

### 12. Đặc tả

**Mới:**

| FR | Nội dung | BR | Mức |
|---|---|---|---|
| FR-ORD-38 | Hệ thống phải cho Operations Staff được phân công gắn đoạn video hoặc ảnh từ camera an ninh độc lập vào phiếu khiếu nại, với khoảng thời gian ghi khớp thời gian giao dịch của đơn, và bắt buộc có ít nhất một bằng chứng trước khi từ chối phiếu khách khai không nhận được lượt xịt | BR-002 | M |
| FR-ORD-39 | Hệ thống phải cho khách xem bằng chứng hình ảnh của phiếu bị từ chối qua liên kết trong email, bằng đường dẫn có hạn, và ghi nhật ký mỗi lần xem | BR-002, BR-008 | M |
| FR-INV-38 | Hệ thống phải cho Operations Staff hoặc Platform Super Admin, không phải người đã nạp, gắn đoạn video hoặc ảnh từ camera an ninh vào phiếu nạp; Brand Admin xem được bằng chứng phiếu nạp của thương hiệu mình | BR-005, BR-012 | M |
| FR-INV-39 | Hệ thống phải cho Brand Admin yêu cầu trích hình một phiếu nạp của thương hiệu mình trong `CAMERA_FOOTAGE_REQUEST_MAX_DAYS` ngày, và thông báo kết quả: đã đính hình hoặc không có hình kèm lý do | BR-005, BR-012 | M |
| FR-MCH-20 | Hệ thống phải cho Platform Super Admin ghi nhãn camera an ninh gắn với mỗi máy | BR-004 | S |

**Viết lại:** NFR-DAT-04 không đổi. Thêm vào mô tả bảo vệ dữ liệu cá nhân: bằng chứng hình ảnh lưu riêng
tư, chỉ đọc qua đường dẫn có hạn, xoá theo hạn ở mục 9.

**Mã lỗi mới (`spec/errors.md`):**

| Mã | HTTP | Khi nào |
|---|---|---|
| `EVIDENCE_REQUIRED` | 409 | Từ chối phiếu khiếu nại `refund_order = true` khi chưa có bằng chứng |
| `EVIDENCE_LIMIT_REACHED` | 409 | Hồ sơ đã đủ `CAMERA_EVIDENCE_MAX_PER_TARGET` tệp |
| `EVIDENCE_TARGET_CLOSED` | 409 | Gỡ bằng chứng khi hồ sơ đã đóng |
| `FOOTAGE_REQUEST_EXPIRED` | 409 | Yêu cầu trích hình quá `CAMERA_FOOTAGE_REQUEST_MAX_DAYS` ngày |
| `FOOTAGE_REQUEST_ALREADY_OPEN` | 409 | Phiếu nạp đã có yêu cầu đang mở |
| `EVIDENCE_SELF_REVIEW` | 403 | Người tải bằng chứng phiếu nạp chính là người đã thực hiện phiếu nạp đó |

Khoảng ghi không khớp khung giờ, tệp sai định dạng hay quá cỡ dùng `VALIDATION_ERROR`. Brand Admin chạm
phiếu nạp của thương hiệu khác dùng `FORBIDDEN_SCOPE` (FR-AUTH-08 AC2).

## Hệ quả

- **Contract (`openapi.yaml`):**

  | Endpoint | Ai gọi |
  |---|---|
  | `GET /refund-claims/{id}/evidence-window`, `GET /refill-sessions/{id}/evidence-window` | Người tải lên |
  | `POST /refund-claims/{id}/evidence`, `POST /refill-sessions/{id}/evidence` (multipart) | Như mục 3 |
  | `GET /refund-claims/{id}/evidence`, `GET /refill-sessions/{id}/evidence` | Như mục 3 — trả URL ký có hạn |
  | `POST /evidence/{id}/remove` (body: lý do) | Người tải, khi hồ sơ còn mở |
  | `GET /evidence-files/{id}?exp=…&sig=…` | Công khai, quyền nằm ở chữ ký có hạn |
  | `PUT /machines/{id}/camera-label` | Super Admin |
  | `GET /public/refund-claims/{code}/evidence?key=…` | Khách |
  | `POST /refill-sessions/{id}/footage-requests`, `GET /footage-requests` | Brand Admin; nhân sự nền tảng |
  | `POST /footage-requests/{id}/resolve` | Operations Staff, Platform Super Admin |

  Schema `Machine` thêm `cameraLabel`; `RefundClaimTracking` thêm `hasEvidence`.
- **Lược đồ:** `schema.sql`, `data-dictionary.md`, `erd.md` — hai bảng, hai enum, cột `camera_label`,
  `uq_refill_session_id_brand`. Enum ở migration riêng (`docs/MIGRATIONS.md`).
- **`spec/PROJECT.md`:** thêm module **EVD** vào bảng sở hữu bảng.
- **API:** module EVD; cổng `PRIVATE_MEDIA_STORAGE` (hai driver); ORD chặn từ chối khi
  thiếu bằng chứng; job xoá bằng chứng (gộp vào job khối liên hệ của ADR-0012, thêm nhánh phiếu nạp).
- **Web quản trị:**
  - Phiếu khiếu nại: khối "Bằng chứng camera" (khung giờ đề xuất, nhãn camera, tải lên, xem, SHA-256).
  - Phiếu nạp: khối tương tự cho nhân sự nền tảng; Brand Admin thấy bằng chứng và nút "Yêu cầu trích
    hình".
  - Hàng "Yêu cầu trích hình" cho Operations Staff; chi tiết máy thêm ô nhãn camera.
  - Trang `/claim/status`: mục "Hình ảnh đối chiếu".
- **Vận hành:** lắp camera, biển thông báo, đồng bộ NTP, quy trình cắt và làm mờ đoạn trích, chọn đầu ghi
  giữ hình ≥ 14 ngày.

**Test đề xuất:**

- Từ chối phiếu `refund_order = true` không có bằng chứng → `EVIDENCE_REQUIRED`; có một bằng chứng → được.
- Khoảng ghi không giao khung giờ đề xuất (kể cả sau khi trừ `clock_offset_sec`) → `VALIDATION_ERROR`.
- Người đã nạp tải bằng chứng cho phiếu nạp của mình → `EVIDENCE_SELF_REVIEW`; Brand Admin xem bằng
  chứng phiếu nạp của thương hiệu khác → `FORBIDDEN_SCOPE` (BR-012, FR-AUTH-08 AC2).
- Tệp đổi đuôi `.mp4` nhưng không có hộp `ftyp` → `VALIDATION_ERROR`; ảnh tải lên không còn EXIF.
- Khách gọi xem bằng chứng sai `key`, hoặc phiếu chưa `REJECTED` → `NOT_FOUND`; URL ký quá hạn bị từ chối.
- Job xoá: qua hạn (kể cả tắt dịch vụ qua mốc rồi bật lại) → đối tượng bị xoá khỏi kho, dòng còn
  `sha256` và `purged_at`.
- Không có URL công khai nào trỏ tới tiền tố `evidence/`.
- Yêu cầu trích hình: quá 14 ngày → `FOOTAGE_REQUEST_EXPIRED`; hai yêu cầu cùng mở → `FOOTAGE_REQUEST_ALREADY_OPEN`;
  đóng `UNAVAILABLE` không lý do → CSDL từ chối.

**Rủi ro đã biết:**

- **Đầu ghi đã ghi đè** trước khi có người lấy hình → yêu cầu trích hình đóng `UNAVAILABLE`; phiếu khiếu
  nại không từ chối được (mục 4) nên phải hoàn tiền. Chấp nhận: thà hoàn nhầm một lượt xịt còn hơn từ
  chối không có bằng chứng.
- **Người tải chọn đoạn có lợi cho mình** → khung giờ do hệ thống tính, có SHA-256 và AuditLog người tải;
  phiếu nạp không cho chính người nạp tải lên. Không chống được việc nhân sự nền tảng thông đồng — ngoài
  phạm vi kỹ thuật.
- **Camera hỏng hoặc bị che** → không có bằng chứng; như trường hợp ghi đè. Nên có kiểm tra camera trong
  bảo trì định kỳ (ADR-0027).
- **Video không chuyển mã** → một số tệp từ đầu ghi (H.265) có thể không phát được trên trình duyệt; người
  tải xuất lại MP4 H.264 bằng phần mềm của đầu ghi. Khi có worker, chuyển mã có thể đưa vào mà không đổi
  contract.

---

## Ghi chú hiện thực (2026-11-17)

- **Số hiệu FR:** bản nháp đầu dùng FR-INV-36, 37 và FR-MCH-19, nhưng các số này đã thuộc ADR-0026
  (việc cần nạp) và ADR-0028 (hủy phiếu nạp, máy dừng bán) trong `spec/modules/` — chỉ là chưa được ghi
  vào `docs/FR_NFR_SCENTSTATION.md`. ADR này dùng **FR-INV-38, 39** và **FR-MCH-20**.
- **Biến môi trường mới, đều tuỳ chọn:** `MEDIA_PRIVATE_DIR`, `R2_PRIVATE_BUCKET`. Cần thêm vào
  `.env.example` (file được bảo vệ, cần người sửa).
- **Migration:** `migrations/1791800060000_adr-0032-bang-chung-camera.sql`; `schema.sql` §10h. Đã kiểm
  `pg_dump --schema-only` của CSDL nạp `schema.sql` trùng khít CSDL chạy hết migration.
