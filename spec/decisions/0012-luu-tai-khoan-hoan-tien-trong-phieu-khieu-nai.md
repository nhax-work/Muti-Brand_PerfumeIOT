# ADR-0012 — Hoàn tiền thủ công qua phiếu khiếu nại và lưu tài khoản nhận hoàn tiền (sửa NFR-DAT-04)

**Ngày:** 2026-10-13 · **Trạng thái:** đề xuất — chờ TV1 duyệt · **Người quyết:** TV1

## Bối cảnh

Nhóm đã chọn **PayOS** làm cổng thanh toán và quyết định **không** dùng API hoàn tiền tự động. Mọi
khoản hoàn cho khách lẻ đều do nhân viên chuyển khoản tay. Khách gặp sự cố thì quét **mã QR sự cố**
trên kiosk để gửi khiếu nại, nhân viên tiếp nhận và xử lý.

Các trường hợp khách đã trả tiền mà không nhận được lượt xịt, nên phải được hoàn:

| Trường hợp | Dấu hiệu trong hệ thống |
|---|---|
| Xịt thất bại hoặc không xác định sau khi đèn đã sáng | đơn `FAILED`/`DISPENSE_REQUESTED` có `needs_manual_review` (FR-ORD-19) |
| Tiền về sau khi đơn đã hết hạn | đơn `REFUND_PENDING`, lý do `PAID_AFTER_EXPIRY` |
| Khách chuyển khoản hai lần cùng một mã QR | `payment_events.processing_result = EXTRA_TRANSFER_REFUND_PENDING` (PR #30) |

Khách ở kiosk là người vô danh, nên muốn chuyển tiền hoàn thì nhân viên phải biết **chuyển vào tài
khoản nào**. NFR-DAT-04 hiện ghi:

> Hệ thống phải không lưu bất kỳ thông tin thẻ hoặc tài khoản ngân hàng nào của khách hàng.

Vậy hệ thống không có chỗ hợp lệ để giữ tài khoản nhận hoàn tiền, và quy trình hoàn tiền thủ công
không thực hiện được trong khuôn khổ đặc tả hiện tại.

Còn một chỗ hở có sẵn: `payment_events.payload` và `payments.raw_response` đang lưu nguyên văn dữ liệu
cổng gửi về. Nếu webhook PayOS có kèm thông tin tài khoản của người chuyển — cần đối chiếu tài liệu
PayOS — thì hệ thống đang lưu đúng loại dữ liệu NFR-DAT-04 cấm, ngay cả khi không có sự cố nào.

## Phương án đã cân nhắc

1. **Giữ nguyên NFR-DAT-04, không lưu.** Nhân viên gọi điện hỏi số tài khoản rồi chuyển, hệ thống chỉ
   ghi mã giao dịch hoàn. Chậm, phụ thuộc việc gọi được khách, không có gì để đối chiếu khi chuyển
   nhầm, và khó đạt mục tiêu xử lý trong 24 giờ của BR-002.
2. **Lưu tài khoản như dữ liệu thường.** Đơn giản nhất, nhưng một bản sao lưu, một log hay một quyền
   truy cập lỏng là lộ tài khoản ngân hàng của khách. Trái nguyên tắc tối thiểu hoá dữ liệu cá nhân.
3. **Tự lấy tài khoản người chuyển từ webhook PayOS.** Khách không phải nhập gì. Nhưng người trả tiền
   chưa chắc là người muốn nhận hoàn, và hệ thống sẽ giữ tài khoản của **mọi** giao dịch chứ không
   riêng giao dịch có sự cố.
4. **Lưu có điều kiện.** Chỉ lưu tài khoản nhận hoàn tiền **trong phiếu khiếu nại**, mã hoá, chỉ nhân
   viên được phân công xử lý phiếu xem được, xoá ngay khi phiếu đóng.

## Quyết định

Chọn **phương án 4**.

### NFR-DAT-04 viết lại

| | Nội dung |
|---|---|
| **Cũ** | Hệ thống phải không lưu bất kỳ thông tin thẻ hoặc tài khoản ngân hàng nào của khách hàng |
| **Mới** | Hệ thống phải không lưu thông tin thẻ của khách hàng, và không lưu thông tin tài khoản ngân hàng của khách hàng ở bất kỳ đâu ngoài phiếu khiếu nại hoàn tiền. Trong phiếu khiếu nại, tài khoản nhận hoàn tiền phải được mã hoá, chỉ nhân viên được phân công xử lý phiếu xem được, và phải bị xoá khi phiếu đóng |
| **Cách kiểm chứng** | Rà soát lược đồ dữ liệu · ràng buộc CSDL xoá khi đóng phiếu · bộ test ở mục "Hệ quả" |

Thông tin **thẻ** vẫn bị cấm hoàn toàn — PayOS là chuyển khoản, hệ thống không bao giờ cần đến thẻ.

### Quy tắc bảo vệ tài khoản nhận hoàn tiền

| # | Quy tắc | Chi tiết |
|---|---|---|
| 1 | **Chỉ một chỗ chứa** | Tài khoản nhận hoàn tiền chỉ nằm trong bảng phiếu khiếu nại. Không được ghi vào `audit_logs`, log ứng dụng, `payment_events`, `notifications`, email hay bất kỳ bảng nào khác |
| 2 | **Lưu gì** | Mã ngân hàng, số tài khoản, tên chủ tài khoản, cùng số điện thoại hoặc email liên hệ — gom thành **một khối mã hoá** |
| 3 | **Mã hoá** | AES-256-GCM ở tầng ứng dụng, IV ngẫu nhiên cho mỗi bản ghi, lưu kèm phiên bản khoá để xoay khoá. Khoá nằm trong biến môi trường `REFUND_ACCOUNT_ENC_KEY`, không bao giờ commit (NFR-SEC-05). Không dùng mã hoá trong CSDL (`pgcrypto`) vì khoá sẽ phải đi qua câu SQL, và bản sao lưu hằng ngày (NFR-DAT-05) khi đó chỉ chứa dữ liệu đã mã hoá |
| 4 | **Ai xem được** | Chỉ Operations Staff đang được phân công cho phiếu đó, và phải xác thực lại mật khẩu trước khi xem (FR-AUTH-09). Người khác, kể cả Platform Super Admin, chỉ thấy phiếu "đã có / chưa có tài khoản nhận hoàn tiền". Super Admin được phân công lại phiếu nhưng không xem được tài khoản |
| 5 | **Ghi vết khi xem** | Mỗi lần giải mã để xem ghi một AuditLog `ord.refund_claim.account_viewed` (ai xem, phiếu nào, lúc nào), **không kèm dữ liệu tài khoản** — nhật ký kiểm toán chỉ thêm, không xoá được (FR-AUD-09), nên lọt dữ liệu vào đó là không bao giờ xoá được nữa |
| 6 | **Xoá khi đóng phiếu** | Khi phiếu chuyển sang trạng thái đóng (`REFUNDED`, `REJECTED` hoặc `EXPIRED`), ngay trong cùng transaction: xoá khối mã hoá, ghi thời điểm xoá. CSDL cưỡng chế bằng ràng buộc CHECK: phiếu đã đóng thì không còn dữ liệu tài khoản. Sau khi đóng chỉ còn: đơn, số tiền, mã giao dịch chuyển khoản hoàn, người xử lý, thời điểm, ghi chú |
| 7 | **Phiếu bị bỏ quên** | Phiếu còn mở quá `REFUND_CLAIM_MAX_OPEN_DAYS` thì job tự chuyển sang `EXPIRED` và xoá tài khoản, có bù sau downtime (NFR-REL-07). Trước đó, phiếu quá `REFUND_CLAIM_SLA_HOURS` chưa xử lý thì sinh cảnh báo cho Operations Staff |
| 8 | **Webhook PayOS** | Adapter PayOS phải bỏ mọi trường thông tin tài khoản người chuyển (nếu có) khỏi dữ liệu **trước khi** ghi `payment_events.payload` và `payments.raw_response`. `payload_hash` vẫn tính trên byte gốc để kiểm chữ ký. Không dùng tài khoản người chuyển để tự điền phiếu |
| 9 | **Đồng ý của khách** | Trang khiếu nại nêu rõ mục đích thu thập, thời gian lưu (tới khi phiếu đóng) và yêu cầu khách tick đồng ý trước khi gửi; lưu thời điểm đồng ý. Nội dung nên được người có chuyên môn pháp lý xem lại theo Nghị định 13/2023/NĐ-CP |
| 10 | **Bản sao lưu** | Chấp nhận: bản sao lưu còn giữ dữ liệu đã mã hoá cho tới khi bị quay vòng. Không có khoá thì không đọc được. Khoá cũ chỉ huỷ sau khi mọi bản sao lưu dùng nó đã hết hạn |

### Phiếu khiếu nại hoàn tiền — phần tối thiểu để có chỗ chứa hợp lệ

| Hạng mục | Quyết định |
|---|---|
| **Cửa vào** | Màn sự cố trên kiosk hiện mã QR dẫn tới trang khiếu nại công khai. QR chứa mã đơn và một **mã khiếu nại dùng một lần**, ngẫu nhiên, hệ thống chỉ lưu dạng băm — người lạ không thể đoán mã đơn để gửi khiếu nại thay khách |
| **Đơn được khiếu nại** | Chỉ các trường hợp ở bảng "Bối cảnh". Đơn `DISPENSED` hoặc `FORFEITED` (khách không bấm, ADR-0007) không mở được phiếu |
| **Một phiếu mỗi đơn** | Mỗi đơn tối đa một phiếu đang mở, cưỡng chế bằng partial unique index |
| **Trạng thái** | `OPEN` → `REFUNDED` / `REJECTED` / `EXPIRED`. Ba trạng thái sau đều là "đã đóng" |
| **Ghi nhận đã hoàn** | Nhân viên được phân công, sau khi xác thực lại, nhập mã giao dịch chuyển khoản. Hệ thống đóng phiếu `REFUNDED`, xoá tài khoản, chuyển đơn sang `REFUNDED`, ghi AuditLog (FR-AUD-06) |
| **Từ chối** | Bắt buộc ghi lý do. Đóng phiếu `REJECTED`, xoá tài khoản |
| **Phạm vi thương hiệu** | Phiếu thuộc nghiệp vụ nội bộ nền tảng; Brand Admin không thấy phiếu. Đơn đã hoàn tiền vẫn phải được trừ khỏi bảng đối soát doanh thu của thương hiệu (FR-SLT-18) |

Hủy đơn từ kiosk (kèm hủy link thanh toán PayOS) và hoàn tiền thuê slot cho Brand Admin **không** thuộc
ADR này.

### Thay đổi contract — chỉ áp dụng sau khi ADR này được duyệt

**`schema.sql`** — qua migration mới; giá trị enum mới nằm ở migration riêng (`docs/MIGRATIONS.md`):

| Thay đổi | Chi tiết |
|---|---|
| Enum mới `refund_claim_status` | `OPEN`, `REFUNDED`, `REJECTED`, `EXPIRED` |
| Bảng mới `refund_claims` | `id`, `order_id` (FK), `brand_id` (theo đơn, phục vụ đối soát), `claim_token_hash`, `status`, `amount`, `currency`, `pii_ciphertext bytea`, `pii_key_version smallint`, `has_refund_account boolean`, `consented_at`, `assigned_to` (FK `users`), `assigned_at`, `payout_reference`, `resolution_note`, `created_at`, `closed_at`, `pii_purged_at` |
| Ràng buộc | `CHECK (status = 'OPEN' OR (pii_ciphertext IS NULL AND pii_purged_at IS NOT NULL))` · `CHECK (status <> 'REFUNDED' OR payout_reference IS NOT NULL)` · `CHECK (status <> 'REJECTED' OR resolution_note IS NOT NULL)` · partial unique index `(order_id) WHERE status = 'OPEN'` |
| COMMENT `payments` | Thay câu trích NFR-DAT-04 theo nội dung mới |

**`openapi.yaml`:**

| Endpoint | Ai gọi | Ghi chú |
|---|---|---|
| `POST /public/refund-claims` | Khách, không đăng nhập | Gửi mã khiếu nại, liên hệ, tài khoản nhận hoàn tiền, đồng ý. Có giới hạn tần suất |
| `GET /refund-claims`, `GET /refund-claims/{id}` | Operations Staff, Super Admin | Không bao giờ trả dữ liệu tài khoản |
| `POST /refund-claims/{id}/assign` | Operations Staff, Super Admin | Phân công người xử lý |
| `GET /refund-claims/{id}/refund-account` | Chỉ người được phân công | Cần xác thực lại; ghi AuditLog mỗi lần gọi |
| `POST /refund-claims/{id}/refund` | Chỉ người được phân công | Cần xác thực lại; body có mã giao dịch chuyển khoản |
| `POST /refund-claims/{id}/reject` | Chỉ người được phân công | Lý do bắt buộc |
| `OrderStatusView` | Kiosk | Thêm đường dẫn QR sự cố khi đơn đủ điều kiện khiếu nại |
| `POST /orders/{id}/refund` | — | Đánh dấu `deprecated`; ghi nhận hoàn tiền đi qua phiếu |

**`spec/errors.md`** — cần thêm qua review:

| Mã đề xuất | HTTP | Khi nào |
|---|---|---|
| `ORDER_NOT_CLAIMABLE` | 409 | Đơn không thuộc trường hợp được khiếu nại |
| `CLAIM_ALREADY_OPEN` | 409 | Đơn đã có phiếu đang mở |
| `CLAIM_NOT_ASSIGNED` | 403 | Người gọi không phải nhân viên được phân công cho phiếu |

Mã khiếu nại sai hoặc đã dùng trả `NOT_FOUND`, để không lộ đơn nào tồn tại.

**`spec/constraints.md`** — cần thêm qua review:

| Hằng đề xuất | Giá trị | Ý nghĩa |
|---|---|---|
| `REFUND_CLAIM_SLA_HOURS` | 24 | Mục tiêu xử lý của BR-002; quá hạn thì cảnh báo |
| `REFUND_CLAIM_MAX_OPEN_DAYS` | 30 | Quá hạn thì phiếu tự `EXPIRED` và xoá tài khoản |
| `REFUND_CLAIM_RATE_LIMIT_PER_MIN` | 5 | Giới hạn gửi khiếu nại mỗi địa chỉ IP |

**`docs/FR_NFR_SCENTSTATION.md`:**

| Loại | Nội dung |
|---|---|
| Viết lại | NFR-DAT-04 (như trên) · FR-ORD-20 nâng từ **S lên M**, viết lại thành: Operations Staff được phân công ghi nhận đã hoàn tiền thủ công kèm mã giao dịch chuyển khoản · FR-ORD-21 bổ sung: hướng dẫn trên kiosk kèm QR sự cố |
| Mới (số hiệu cấp khi duyệt) | Khách gửi khiếu nại qua QR sự cố, kèm tài khoản nhận hoàn tiền và đồng ý xử lý dữ liệu · mỗi đơn tối đa một phiếu đang mở · xoá tài khoản khi phiếu đóng · phiếu quá hạn tự `EXPIRED` · cảnh báo phiếu quá SLA |

## Hệ quả

**Mã nguồn:**
- ORD: module phiếu khiếu nại, mã hoá/giải mã, job hết hạn trong `entrypoints/scheduler.ts`.
- Adapter PayOS (tuần 6): lọc thông tin tài khoản người chuyển trước khi lưu (quy tắc 8).
- Kiosk: màn sự cố và màn hết hạn hiện QR sự cố, thay cho câu chữ đọc từ `VITE_SUPPORT_CONTACT`.
- Web quản trị: hàng phiếu cho Operations Staff, màn xem tài khoản có xác thực lại.
- Biến môi trường mới `REFUND_ACCOUNT_ENC_KEY` — thêm vào `.env.example` (file được bảo vệ, cần người sửa).

**Test đề xuất thêm vào nhóm trọng yếu "Tài khoản hoàn tiền":**
- Đóng phiếu ở cả ba trạng thái → khối mã hoá bị xoá; `UPDATE` sang trạng thái đóng mà còn dữ liệu bị CSDL từ chối.
- Sau một vòng khiếu nại → hoàn tiền, không bảng nào ngoài `refund_claims` chứa số tài khoản (`audit_logs`, `payment_events`, `notifications`).
- Người không được phân công, kể cả Super Admin, gọi API xem tài khoản → `CLAIM_NOT_ASSIGNED`; người được phân công xem được và sinh AuditLog không kèm dữ liệu.
- Job hết hạn: tắt dịch vụ qua mốc `REFUND_CLAIM_MAX_OPEN_DAYS`, bật lại → phiếu được `EXPIRED` và xoá.
- Webhook PayOS có trường tài khoản người chuyển → trường đó không có trong `payment_events.payload`.
- Mã khiếu nại dùng lại lần hai hoặc đoán bừa → `NOT_FOUND`.

**Rủi ro đã biết:**
- **Mất khoá** → không đọc được tài khoản của các phiếu đang mở; khách phải gửi lại. Khoá cần được sao lưu riêng, tách khỏi bản sao lưu CSDL.
- **Chuyển nhầm tài khoản** do khách nhập sai → nhân viên đối chiếu tên chủ tài khoản do ngân hàng hiện khi chuyển với tên khách đã nhập; lệch thì liên hệ khách trước khi chuyển.
- **Lạm dụng nội bộ** → mọi lần xem và mọi lần ghi nhận hoàn tiền đều có AuditLog; nên có báo cáo hoàn tiền theo nhân viên.

---

## Nhật ký áp dụng

Chưa áp dụng. Chưa sửa `docs/FR_NFR_SCENTSTATION.md`, `spec/contracts/*`, `spec/errors.md` hay
`spec/constraints.md` — chỉ làm sau khi TV1 duyệt.
