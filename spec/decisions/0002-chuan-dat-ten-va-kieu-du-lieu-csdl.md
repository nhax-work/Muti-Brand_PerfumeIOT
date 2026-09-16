# ADR-0002 — Chuẩn đặt tên bảng, giá trị enum và kiểu dữ liệu tiền tệ trong CSDL

**Ngày:** 2026-09-16 · **Trạng thái:** đã duyệt · **Người quyết:** TV1

## Bối cảnh

Thiết kế CSDL đã được chốt ở `seed_document/DB_DIAGRAM_MERMAID.md` (35 bảng, 24 enum). Khi chuyển
thiết kế này thành `spec/contracts/schema.sql`, phát hiện bốn điểm lệch giữa thiết kế đã chốt và các
tài liệu viết trước nó (`spec/contracts/README.md`, `spec/glossary.md`, `docs/FR_NFR_SCENTSTATION.md`).

Không thể viết `schema.sql` mà bỏ qua các điểm lệch này: cả bốn đều ảnh hưởng trực tiếp tới câu lệnh
SQL sẽ chạy trong migration, và hai trong số đó (điểm 2 và 4) nếu chép nguyên văn tài liệu cũ thì
migration sẽ lỗi cú pháp hoặc tạo ra ràng buộc sai.

### Điểm lệch 1 — Tên bảng: số ít hay số nhiều

`spec/contracts/README.md` §"Index bắt buộc phải có trong schema.sql" viết bằng tên số ít:
`slot_rental`, `payment_event`, `dispense_command`, `bottle`.

`DB_DIAGRAM_MERMAID.md` dùng số nhiều nhất quán cho cả 35 bảng: `slot_rentals`, `payment_events`,
`dispense_commands`, `bottles`.

### Điểm lệch 2 — `uq_slot_active_bottle` tham chiếu một cột không tồn tại

`spec/contracts/README.md` viết:

```sql
CREATE UNIQUE INDEX uq_slot_active_bottle ON bottle (installed_slot_id)
  WHERE status IN ('INSTALLED','LOW');
```

Nhưng trong thiết kế đã chốt, bảng `bottles` **không có cột `installed_slot_id`**. Quan hệ
"chai nào đang lắp ở slot nào" được mô hình hóa theo chiều ngược lại:
`machine_slots.active_bottle_id` (DB_DIAGRAM implementation note #1). Câu lệnh trên sẽ lỗi
`column "installed_slot_id" does not exist`.

### Điểm lệch 3 — Giá trị enum của DispenseCommand

`spec/glossary.md` §"DispenseCommand" vẽ state machine với `ACKED` và `SUCCESS`, tổng cộng 6 trạng
thái. `DB_DIAGRAM_MERMAID.md` khai báo `Enum command_status` với 8 giá trị: `CREATED`, `SENT`,
`ACKNOWLEDGED`, `SUCCEEDED`, `FAILED`, `REJECTED`, `EXPIRED`, `UNKNOWN`.

Hai giá trị bị đổi tên (`ACKED` → `ACKNOWLEDGED`, `SUCCESS` → `SUCCEEDED`) và hai giá trị được thêm
(`REJECTED` cho trường hợp thiết bị từ chối lệnh theo FR-DSP-07..10, `EXPIRED` cho lệnh quá TTL chưa
gửi được theo FR-DSP-06).

Điểm lệch này lan vào index `uq_order_active_command`, vốn liệt kê `IN ('CREATED','SENT','ACKED')`.

### Điểm lệch 4 — Kiểu dữ liệu tiền tệ

`NFR-DAT-02` yêu cầu: "Hệ thống phải lưu số tiền dưới dạng số nguyên theo đơn vị nhỏ nhất của loại
tiền". `DB_DIAGRAM_MERMAID.md` khai báo mọi cột tiền là `numeric(19,4)`
(`orders.amount`, `payments.amount`, `slot_rentals.price_per_spray`, `slot_rentals.fixed_fee`,
`fragrance_products.default_price`, `fragrance_products.full_bottle_retail_price`,
`maintenance_tickets.cost`).

## Phương án đã cân nhắc

1. **Giữ nguyên các tài liệu viết trước, sửa lại thiết kế CSDL cho khớp.** Phải đổi 35 tên bảng sang
   số ít, thêm lại cột `bottles.installed_slot_id` (tạo ra hai nguồn sự thật cho cùng một quan hệ:
   vừa `bottles.installed_slot_id` vừa `machine_slots.active_bottle_id`), thu enum `command_status`
   còn 6 giá trị (mất khả năng phân biệt thiết bị-từ-chối với thực-hiện-thất-bại, vốn là hai tình
   huống có mã lỗi khác nhau trong `spec/errors.md`), và đổi mọi cột tiền sang `bigint`.

2. **Lấy `DB_DIAGRAM_MERMAID.md` làm chuẩn, cập nhật các tài liệu viết trước cho khớp.**
   `spec/contracts/README.md` và `spec/glossary.md` được viết ở tuần 1 khi mô hình dữ liệu chưa hoàn
   chỉnh; DB_DIAGRAM là kết quả của việc rà soát toàn bộ 264 FR sau đó.

3. **Chấp nhận hai chuẩn cùng tồn tại**, ánh xạ ở tầng ứng dụng. Loại ngay: đây chính là kiểu lệch
   mà quy trình đóng băng contract sinh ra để phòng tránh.

## Quyết định

Chọn **phương án 2**: `seed_document/DB_DIAGRAM_MERMAID.md` là nguồn chuẩn cho `spec/contracts/schema.sql`.

| # | Điểm lệch | Chốt |
|---|---|---|
| 1 | Tên bảng | **Số nhiều** (`slot_rentals`, `payment_events`, `dispense_commands`, `bottles`, …) cho toàn bộ 35 bảng |
| 2 | `uq_slot_active_bottle` | Chuyển sang `machine_slots(active_bottle_id)`, partial `WHERE active_bottle_id IS NOT NULL` |
| 3 | `command_status` | 8 giá trị theo DB_DIAGRAM; `uq_order_active_command` lọc `IN ('CREATED','SENT','ACKNOWLEDGED')` |
| 4 | Kiểu tiền tệ | Giữ **`numeric(19,4)`**; diễn giải lại NFR-DAT-02 là "không dùng kiểu dấu phẩy động" |

Lý do cho từng điểm:

**(1)** Số nhiều là quy ước nhất quán trong toàn bộ 35 bảng của thiết kế đã chốt; đổi 4 tên trong
README rẻ hơn đổi 35 tên bảng cộng toàn bộ FK và index tham chiếu chúng.

**(2)** Đặt quan hệ ở `machine_slots.active_bottle_id` cho ràng buộc mạnh hơn: một slot có tối đa một
chai đang hoạt động được bảo đảm bởi chính cardinality của cột (một hàng `machine_slots` chỉ giữ được
một giá trị), partial unique index chỉ cần thêm để chặn chiều ngược lại — một chai không bị lắp vào
hai slot cùng lúc. Nếu để ở `bottles.installed_slot_id` thì chỉ ràng buộc được chiều thứ hai. FR-MCH-07
vẫn được thỏa, và thỏa chặt hơn.

**(3)** `REJECTED` và `SUCCEEDED` là hai kết cục khác nhau về nghiệp vụ: `REJECTED` nghĩa là thiết bị
từ chối trước khi kích hoạt cơ cấu (FR-DSP-07 đến FR-DSP-14 — chữ ký sai, quá hạn, sai máy, trùng mã,
cửa mở, đang bảo trì, slot rỗng), khách chưa mất lượt xịt; `FAILED` nghĩa là đã kích hoạt nhưng hỏng.
Gộp hai trạng thái này lại sẽ làm FR-ORD-19 (đánh dấu đơn cần kiểm tra thủ công) không phân biệt được
tình huống, và làm FR-ALR-04 (3 lượt xịt thất bại liên tiếp) đếm nhầm. Đây là lý do nghiệp vụ, không
phải chỉ là đổi tên.

**(4)** VND không có đơn vị nhỏ hơn đồng, nên "số nguyên theo đơn vị nhỏ nhất" với VND chính là số
nguyên đồng — `numeric(19,4)` biểu diễn được tập giá trị đó, không mất chính xác. Ngược lại,
`bigint` sẽ gây rắc rối ở chỗ FR-SLT-18 phải nhân doanh thu với `revenue_share_percent numeric(5,2)`:
kết quả là số thập phân, và với `bigint` ta phải tự chọn quy tắc làm tròn ở tầng ứng dụng cho mọi
phép tính quyết toán. `numeric` giữ phần thập phân đến khi chốt sổ, chính xác hơn. Tinh thần của
NFR-DAT-02 — cấm `float`/`double` vì sai số nhị phân — vẫn được giữ nguyên.

## Hệ quả

**Contract bị ảnh hưởng:**

- `spec/contracts/schema.sql` — viết mới theo chuẩn đã chốt ở ADR này.
- `spec/contracts/README.md` §"Index bắt buộc phải có trong schema.sql" — cập nhật cả 4 câu lệnh mẫu.
- `spec/contracts/erd.md`, `spec/contracts/data-dictionary.md` — sinh theo cùng chuẩn.
- `spec/contracts/openapi.yaml` — enum trong `components.schemas` phải trùng từng giá trị với enum SQL.

**Tài liệu spec bị ảnh hưởng:**

- `spec/glossary.md` §"DispenseCommand" — vẽ lại state machine với 8 trạng thái.

**FR/NFR bị ảnh hưởng:**

- FR-MCH-07 — cách hiện thực đổi, nội dung yêu cầu không đổi.
- FR-DSP-05, FR-DSP-07 đến FR-DSP-14, FR-DSP-18 — dùng tên trạng thái mới.
- FR-SLT-02, NFR-DAT-07 — chỉ đổi tên bảng.
- FR-ORD-15 — chỉ đổi tên bảng.
- **NFR-DAT-02 — thay đổi nội dung yêu cầu**, từ "lưu dưới dạng số nguyên theo đơn vị nhỏ nhất"
  thành "lưu bằng kiểu số thập phân chính xác (`numeric`), không dùng kiểu dấu phẩy động".
  `docs/FR_NFR_SCENTSTATION.md` phải được sửa theo, kèm ghi chú trỏ về ADR này.

**Module bị ảnh hưởng:** DSP (tên trạng thái), INV/MCH (quan hệ chai ↔ slot), ORD/REV/SLT/EXP (kiểu
tiền tệ trong mọi phép tính doanh thu và quyết toán).

**Bổ sung khi rà soát trước lúc đóng băng (cùng ngày, sau khi bản đầu được duyệt):**

Ba thay đổi dưới đây được thêm vào `schema.sql` trong cùng lần rà soát này, nên nằm chung ADR-0002
thay vì mở ADR mới — contract chưa từng được commit nên chưa thực sự đóng băng.

1. **Ràng buộc cùng thương hiệu bằng composite foreign key** (§10b) — note #9 chuyển từ "để ở
   domain service" sang cưỡng chế ở tầng CSDL cho 6 quan hệ: `orders`, `kiosk_interaction_events`,
   `refill_requests` → `slot_rentals`; `slot_rentals`, `inventory_batches` → `fragrance_products`;
   `bottles` → `inventory_batches`. Cần thêm `UNIQUE (id, brand_id)` lên 3 bảng cha.

   Lý do làm ngay thay vì để nợ: đây là đúng loại lỗi BR-012 sợ nhất (ghi `brand_id` của thương
   hiệu này lên bản ghi trỏ tới tài nguyên của thương hiệu khác), ứng dụng có thể quên kiểm còn
   khóa ngoại thì không. Và nó cần đổi bảng cha, nên làm sau khi đóng băng sẽ đắt hơn hẳn.

   Hai quan hệ vẫn ở domain service vì không diễn đạt được bằng FK — xem `schema.sql` §13 mục 6.

2. **Trigger tự cập nhật `updated_at`** (§10c) cho 15 bảng. `DEFAULT now()` chỉ chạy lúc INSERT;
   không có trigger thì cột đứng im sau đó và không ai phát hiện cho tới lúc cần audit.

3. **Năm index cho khóa ngoại trên đường truy vấn nóng** (§10). PostgreSQL không tự tạo index cho
   khóa ngoại. Rà soát thấy 53 FK không có index; 5 cái được thêm là những cái nằm trên đường của
   NFR-PER-06 (quyết toán 20 hợp đồng ≤10 giây), FR-RPT-08, FR-ALR-09, FR-RFQ-10 và FR-AUD-11. 48
   cái còn lại cố tình để trống vì gần như không bao giờ join.

**Nợ kỹ thuật ghi nhận, chưa xử lý trong ADR này:**

- Row-Level Security (DB_DIAGRAM implementation note #5) chưa bật trong `schema.sql` đợt này.
  NFR-SEC-04 yêu cầu 100% endpoint có dữ liệu thương hiệu vượt được test truy cập chéo — hiện phụ
  thuộc hoàn toàn vào tầng ứng dụng. Cần một ADR riêng khi bật RLS.

  Quyết định về thời điểm: **không làm trong đợt này**, vì policy cần `app.current_brand_id` do
  backend set trong mỗi phiên, mà backend chưa tồn tại — bật vào thì chặn luôn `make seed` và
  không có cách nào kiểm là policy đúng hay sai. Migration là additive nên thêm RLS sau bằng một
  migration mới không đắt hơn làm bây giờ. Mẫu policy đã để sẵn dạng comment ở `schema.sql` §12.

- `bottles.fragrance_product_id` chưa buộc khớp sản phẩm của lô sinh ra chai (FR-INV-07). Siết
  được bằng FK `(batch_id, fragrance_product_id)` → `inventory_batches` nếu cần.
