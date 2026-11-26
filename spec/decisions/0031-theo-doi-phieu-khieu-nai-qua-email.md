# ADR-0031 — Khách theo dõi phiếu khiếu nại hoàn tiền qua mã khiếu nại và email

**Ngày:** 2026-11-17 · **Trạng thái:** đề xuất · **Người quyết:** TV1

## Bối cảnh

ADR-0012 cho khách gửi phiếu khiếu nại hoàn tiền qua QR sự cố trên kiosk (FR-ORD-28, FR-ORD-29). Sau
khi bấm gửi, khách chỉ nhận lại một màn "đã ghi nhận" với mã phiếu dạng UUID, rồi **không còn đường nào
để biết phiếu đang ở đâu**: đã có người nhận chưa, đã chuyển tiền chưa, bị từ chối vì sao. Khách ở kiosk
là người vô danh, không có tài khoản để đăng nhập xem lại.

Hệ quả thực tế:

- Khách không biết tiền đã về hay chưa, phải tự soi sao kê ngân hàng và đoán khoản nào là tiền hoàn.
- Phiếu bị từ chối thì khách không được báo, cũng không biết lý do để khiếu nại lại.
- Khách có số điện thoại hoặc email trong phiếu (khối liên hệ, ADR-0012 quy tắc 2), nhưng hệ thống
  không dùng nó để báo gì — nhân viên phải tự liên lạc tay.

Hạ tầng gửi email đã có từ ADR-0013, ADR-0017 và ADR-0030 (cổng `EMAIL_VERIFICATION_SENDER`,
`PASSWORD_RESET_SENDER`).

ADR này là bước một của đề xuất cải tiến khiếu nại. Bằng chứng hình ảnh từ camera an ninh độc lập với máy
(khách khai chưa nhận lượt xịt, nghi tráo chai khi nạp) để ở **ADR-0032**; ADR này chỉ chừa sẵn chỗ để
ADR-0032 gắn vào mà không phải đổi email hay trang tra cứu.

## Phương án đã cân nhắc

1. **Giữ như cũ, nhân viên tự liên lạc.** Không tốn công làm, nhưng phụ thuộc việc nhân viên nhớ báo,
   không có dấu vết khách đã được báo, và khách vẫn không tự xem được lúc nào muốn.
2. **Chỉ gửi email ở mỗi lần đổi trạng thái, không có trang tra cứu.** Khách nhập sai email hoặc thư vào
   thư rác là mất hết thông tin; không có chỗ đưa bằng chứng ở ADR-0032.
3. **Tra cứu bằng mã phiếu hiện có (UUID).** UUID dài 36 ký tự, khách không đọc qua điện thoại hay gõ
   lại được.
4. **Mã khiếu nại ngắn dễ đọc + trang tra cứu công khai + email kèm liên kết.** **Chọn.** Khách luôn có
   mã trên màn hình ngay khi gửi, dù email hỏng; email chỉ là đường tắt tới trang, không chứa dữ liệu
   nhạy cảm.

## Quyết định

### 1. Mã khiếu nại

- Mỗi phiếu có một **mã khiếu nại** dạng `KN-XXXXX-XXXXX`: 10 ký tự Crockford Base32 (bỏ `I`, `L`, `O`,
  `U` để không nhầm với `1`, `0` và không thành từ tục), sinh ngẫu nhiên bằng bộ sinh số mật mã khi tạo
  phiếu — **không** đánh số tăng dần, để không đoán được mã của phiếu kế bên.
- Độ ngẫu nhiên 50 bit, cộng giới hạn tần suất ở mục 3: dò mã là không khả thi.
- Mã không phải dữ liệu cá nhân, **không bị xoá** khi xoá khối tài khoản hay khối liên hệ — khách vẫn tra
  cứu được kết quả sau khi phiếu đóng.
- Khi nhập: không phân biệt hoa thường, bỏ qua dấu gạch và khoảng trắng; `I`/`L` đọc thành `1`, `O` đọc
  thành `0` (quy ước Crockford).
- Màn "đã ghi nhận" sau khi gửi phiếu hiện mã **thật to** kèm nút sao chép và lời nhắc chụp màn hình.
- Nhân viên tìm được phiếu theo mã ở web quản trị (khách gọi điện đọc mã).

### 2. Email là thông tin liên hệ bắt buộc

- Trường `contact` của `RefundClaimCreate` giữ tên nhưng **bắt buộc là email hợp lệ** (trước đây nhận số
  điện thoại hoặc email). Lưu vẫn trong khối liên hệ mã hoá, xoá theo `REFUND_CLAIM_CONTACT_RETENTION_DAYS`
  như ADR-0012 quy tắc 6 — không đổi.
- Phiếu cũ đã lưu số điện thoại vẫn hợp lệ; hệ thống chỉ bỏ qua việc gửi email cho phiếu đó.
- Form khiếu nại: ô "Email nhận thông báo", kèm câu ngắn "Chúng tôi gửi mã khiếu nại và kết quả xử lý tới
  email này". Nội dung đồng ý (ADR-0012 quy tắc 9) thêm mục đích "gửi thông báo tiến độ phiếu".

### 3. Trang tra cứu công khai

Trang mới trên web quản trị, công khai, cùng khung với trang `/claim`:
`{ADMIN_WEB_BASE_URL}/claim/status`.

- Ban đầu chỉ có **một ô nhập mã khiếu nại**. Mở từ liên kết trong email thì mã đã điền sẵn và tra cứu
  ngay.
- Gọi `GET /public/refund-claims/{code}`. Mã sai trả `NOT_FOUND` — không phân biệt "không có" với "sai
  định dạng".
- Giới hạn tần suất `REFUND_CLAIM_LOOKUP_RATE_LIMIT_PER_MIN` theo IP; vượt thì `RATE_LIMITED`.

Trang hiện:

| Mục | Nguồn | Ghi chú |
|---|---|---|
| Mã khiếu nại, ngày gửi, số tiền được hoàn | `refund_claims` | |
| Tiến độ | `status` + `assigned_at` | Ba bước: **Đã nhận phiếu** → **Đang xử lý** (đã có người nhận) → **Hoàn tất** / **Từ chối** / **Hết hạn**. Không hiện tên nhân viên |
| Hạn xử lý dự kiến | `created_at` + `REFUND_CLAIM_SLA_HOURS` | Chỉ khi phiếu còn mở |
| Mã giao dịch chuyển khoản hoàn và ngày chuyển | `payout_reference`, `closed_at` | Khi `REFUNDED` — khách dùng để đối chiếu sao kê |
| Lý do từ chối | `resolution_note` | Khi `REJECTED` |

Trang **không bao giờ** hiện tài khoản ngân hàng hay email, kể cả che bớt — khối tài khoản đã bị xoá khi
phiếu đóng, và người có mã chưa chắc là chủ phiếu.

Vì `resolution_note` nay khách đọc được, màn từ chối ở web quản trị ghi rõ nhãn "Lý do (khách sẽ thấy)",
và nhân viên không được ghi số tài khoản hay thông tin nội bộ vào đây.

### 4. Email gửi khách

| Thời điểm | Nội dung |
|---|---|
| Ngay sau khi gửi phiếu | Mã khiếu nại, số tiền, hạn xử lý dự kiến, liên kết tra cứu |
| Khi phiếu đóng (`REFUNDED`, `REJECTED`, `EXPIRED`) | "Phiếu `KN-…` đã có kết quả", liên kết tra cứu |

Luật:

- **Không có tài khoản ngân hàng, lý do từ chối hay mã giao dịch trong email** — chỉ mã phiếu, số tiền,
  trạng thái chung và liên kết. Giữ đúng ADR-0012 quy tắc 1, và hòm thư không phải chỗ lưu kết quả.
- Liên kết: `{ADMIN_WEB_BASE_URL}/claim/status?code=KN-…&key=…`. `key` = HMAC(`REFUND_CLAIM_TOKEN_SECRET`,
  `refund-claim-view:{claim id}`), tính lại khi kiểm — không lưu, cùng cách với mã khiếu nại trong QR
  (ADR-0012, nhật ký áp dụng). ADR này **chưa dùng** `key`; ADR-0032 dùng nó để chỉ cho chủ phiếu xem
  bằng chứng hình ảnh. Đặt sẵn từ bây giờ để email gửi trước ADR-0032 vẫn mở được bằng chứng sau này.
- Gửi trực tiếp qua cổng email mới `REFUND_CLAIM_MAILER`, **không** ghi bảng `notifications`: địa chỉ email
  của khách chỉ nằm trong khối liên hệ mã hoá của phiếu (ADR-0012 quy tắc 1, 2).
- Gửi sau khi transaction đổi trạng thái đã commit. Gửi lỗi chỉ ghi log (không kèm địa chỉ), không làm hỏng
  thao tác của khách hay nhân viên — khách vẫn có mã trên màn hình và tra cứu được.
- Mỗi lần gửi ghi AuditLog `ord.refund_claim.customer_notified` (phiếu nào, loại thư, thành công hay
  không), **không kèm địa chỉ email**.
- Khối liên hệ đã bị xoá thì không gửi.
- Song ngữ: email gửi theo ngôn ngữ trang khiếu nại lúc khách gửi phiếu (lưu `locale` trên phiếu).

### 5. Lược đồ

```sql
ALTER TABLE refund_claims
    ADD COLUMN public_code char(10),
    ADD COLUMN locale      varchar(5) NOT NULL DEFAULT 'vi';

-- Migration sinh mã cho các phiếu đã có, rồi:
ALTER TABLE refund_claims
    ALTER COLUMN public_code SET NOT NULL,
    ADD CONSTRAINT uq_refund_claim_public_code UNIQUE (public_code),
    ADD CONSTRAINT chk_refund_claim_public_code
        CHECK (public_code ~ '^[0-9A-HJKMNP-TV-Z]{10}$'),
    ADD CONSTRAINT chk_refund_claim_locale CHECK (locale IN ('vi', 'en'));
```

`public_code` lưu 10 ký tự không có tiền tố `KN-` và dấu gạch; giao diện tự thêm khi hiển thị.

### 6. Hằng ngưỡng (`spec/constraints.md`)

| Hằng | Giá trị | FR |
|---|---|---|
| `REFUND_CLAIM_LOOKUP_RATE_LIMIT_PER_MIN` | 10 | FR-ORD-36 |

### 7. Đặc tả

**Viết lại:**

| FR | Cũ | Mới |
|---|---|---|
| FR-ORD-29 | … kèm thông tin liên hệ, tài khoản nhận hoàn tiền … | … kèm **email**, tài khoản nhận hoàn tiền …; sau khi gửi hiển thị mã khiếu nại cho khách |

**Mới:**

| FR | Nội dung | BR | Mức |
|---|---|---|---|
| FR-ORD-36 | Hệ thống phải cho khách tra cứu tiến độ và kết quả phiếu khiếu nại trên trang công khai bằng mã khiếu nại, không hiển thị tài khoản ngân hàng hay thông tin liên hệ | BR-002 | M |
| FR-ORD-37 | Hệ thống phải gửi email cho khách khi phiếu khiếu nại được tạo và khi phiếu đóng, kèm mã khiếu nại và liên kết tra cứu, không kèm tài khoản ngân hàng | BR-002 | M |

Không có mã lỗi mới — dùng `NOT_FOUND`, `VALIDATION_ERROR`, `RATE_LIMITED`.

## Hệ quả

- **Contract:**
  - `openapi.yaml` — endpoint `GET /public/refund-claims/{code}` (không đăng nhập) trả schema mới
    `RefundClaimTracking` (`code`, `status`, `stage`, `amount`, `currency`, `createdAt`, `dueAt`,
    `closedAt`, `payoutReference`, `resolutionNote`).
  - `RefundClaimCreate.contact` đổi sang `format: email`, thêm `locale`.
  - `RefundClaimReceipt` và `RefundClaim` thêm `code`; `GET /refund-claims` thêm bộ lọc `code`.
  - `schema.sql`, `data-dictionary.md`, `erd.md` — hai cột mới.
- **Migration:** `migrations/…_adr-0031-theo-doi-phieu-khieu-nai.sql`, sinh mã cho phiếu cũ.
- **API:** `RefundClaimsService` sinh mã khi tạo phiếu, thêm `track(code)`, gửi email sau khi tạo và khi
  đóng (cả job `EXPIRED`); cổng `REFUND_CLAIM_MAILER`; thêm `REFUND_CLAIM_LOOKUP_RATE_LIMIT_PER_MIN`.
- **Web quản trị:**
  - `/claim`: ô email, màn đã ghi nhận hiện mã to.
  - Trang công khai mới `/claim/status`.
  - Hàng phiếu cho nhân viên: hiện mã, tìm theo mã, nhãn "Lý do (khách sẽ thấy)" ở màn từ chối.
- **i18n:** chuỗi trang tra cứu và hai mẫu email, đủ `vi` và `en`.
- **Kiosk:** không đổi — QR sự cố vẫn dẫn tới `/claim` như cũ.

**Test đề xuất:**

- Tạo phiếu → có mã đúng định dạng, không trùng; tra cứu được bằng mã viết thường, có dấu gạch, có `O`
  thay `0`.
- Tra cứu mã sai hoặc chưa tồn tại → `NOT_FOUND`; vượt giới hạn tần suất → `RATE_LIMITED`.
- Kết quả tra cứu và nội dung cả hai email **không chứa** số tài khoản, tên chủ tài khoản hay email —
  thêm vào test "không bảng nào ngoài `refund_claims` chứa số tài khoản" của ADR-0012.
- Đóng phiếu ở cả ba trạng thái (kể cả qua job `EXPIRED`) → gửi đúng một email; cổng email lỗi → phiếu
  vẫn đóng, AuditLog ghi thất bại.
- Phiếu cũ có liên hệ là số điện thoại → không gửi email, không lỗi.
- Sau khi khối liên hệ bị xoá → tra cứu vẫn được, không gửi thêm email.

**Rủi ro đã biết:**

- **Khách nhập sai email** → không nhận thư; khách vẫn có mã trên màn hình đã ghi nhận. Đây là lý do mã
  phải hiện to và nhắc chụp lại.
- **Thư vào thư rác** → như trên; tên miền gửi cần SPF/DKIM như các email hiện có.
- **Người khác biết mã** (khách đưa ảnh chụp) → chỉ thấy tiến độ, số tiền, mã giao dịch và lý do — không
  có dữ liệu cá nhân. Bằng chứng hình ảnh ở ADR-0032 đòi thêm `key` từ email.

---

## Ghi chú hiện thực (2026-11-17)

- **Migration:** `migrations/1791800000000_adr-0031-theo-doi-phieu-khieu-nai.sql` — phiếu đã có được sinh
  mã bằng `random()` của PostgreSQL; phiếu mới do API sinh bằng `node:crypto`. Trùng mã (xác suất ~ số
  phiếu / 2^50) thì API thử lại cả transaction tối đa ba lần.
- **Cổng email:** `REFUND_CLAIM_MAILER` (`DefaultRefundClaimMailer`) gửi qua `EMAIL_PROVIDER` dùng chung.
  Máy dev chưa cấu hình SMTP thì `ConsoleEmailProvider` chỉ ghi log — log đó có địa chỉ người nhận, như với
  các email khác; production bắt buộc có SMTP (ADR-0017 mục 4).
- **Liên kết email:** `{ADMIN_WEB_BASE_URL}/claim/status?code=…&key=…`; ADR-0032 dùng `key` để mở hình
  ảnh đối chiếu cho khách.
- **Test:** `tests/integration/test_refund_claims.test.ts` (khối "Khách theo dõi phiếu khiếu nại"),
  `tests/unit/refund-claims.test.ts`, `apps/admin-web/src/routes/claim*/**.test.tsx`.
