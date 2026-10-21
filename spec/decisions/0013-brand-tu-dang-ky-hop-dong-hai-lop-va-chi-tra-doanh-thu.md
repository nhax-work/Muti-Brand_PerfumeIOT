# ADR-0013 — Brand tự đăng ký, hợp đồng hai lớp và chi trả doanh thu

**Ngày:** 2026-10-13 · **Trạng thái:** đã duyệt (2026-10-13) · **Người quyết:** TV1

## Bối cảnh

Bản rà soát nghiệp vụ ngày 2026-10-13 chỉ ra ba chỗ thiếu ở phía thương hiệu:

1. **Không có căn cứ pháp lý cho việc thanh lý hàng (P0-11).** ADR-0006 bỏ hợp đồng, nhưng nền tảng
   vẫn thu phí ân hạn, từ chối hoàn tiền và chuyển quyền sở hữu hàng của thương hiệu khi thanh lý
   (BR-013). Không có bằng chứng thương hiệu đã đồng ý thì mọi việc đó dễ bị tranh chấp.
2. **"Tự phục vụ" nhưng tài khoản do Super Admin tạo (P1-21).** Thuê slot là tự phục vụ (ADR-0006),
   nhưng FR-USR-01 và FR-USR-05 bắt mọi tài khoản phải do Platform Super Admin tạo.
3. **Không có vòng đời chuyển trả doanh thu (P0-12).** Nền tảng thu hộ toàn bộ tiền lượt xịt qua PayOS
   nhưng chỉ có báo cáo đối soát (`GET /settlements`); không có kỳ chi trả, trạng thái hay chứng từ.

Ngoài ra, mọi thông báo về tiền và hàng (hết hạn, ân hạn, thanh lý, thanh toán) chỉ nằm trong ứng dụng
(P0-13). Thương hiệu không đăng nhập vài tuần là hàng bị thanh lý mà không biết.

## Phương án đã cân nhắc

| Vấn đề | Phương án | Chọn |
|---|---|---|
| Hợp đồng | (a) giữ "không hợp đồng" · (b) hợp đồng ký tay, duyệt từng lượt thuê · (c) **hai lớp**: hợp đồng khung tự đồng ý một lần + phụ lục tự sinh cho từng lượt thuê | **(c)** — có căn cứ pháp lý mà không làm chậm việc giành slot |
| Đăng ký | (a) Super Admin tạo · (b) **tự đăng ký, thuê ngay, hậu kiểm pháp nhân** · (c) tự đăng ký, chờ duyệt mới thuê | **(b)** |
| Chu kỳ chi trả | tuần · **tháng** · theo yêu cầu | **tháng** |
| Phí PayOS và khoản đã hoàn cho khách | **nền tảng chịu** · trừ vào doanh thu thương hiệu | **nền tảng chịu** |
| Đơn tính vào doanh thu thương hiệu | **`DISPENSED` + `FORFEITED`** · chỉ `DISPENSED` · mọi đơn đã trả tiền | **`DISPENSED` + `FORFEITED`** |

## Quyết định

### 1. Thương hiệu tự đăng ký

```
Đăng ký (tên thương hiệu, email, mật khẩu) ─> xác minh email ─> đồng ý hợp đồng khung
   ─> thuê slot được ngay
   ─> trước lần chi trả doanh thu đầu tiên: Super Admin xác minh pháp nhân (mã số thuế, giấy phép)
```

- Đăng ký tạo cùng lúc một `Brand` và một tài khoản Brand Admin gắn với thương hiệu đó (FR-AUTH-05).
- Super Admin vẫn tạo được thương hiệu và tài khoản như cũ (FR-BND-01, FR-USR-01), và vẫn đình chỉ được
  thương hiệu (FR-BND-03).
- Chưa xác minh pháp nhân thì kỳ chi trả của thương hiệu dừng ở trạng thái chờ, tiền không chuyển đi.

### 2. Hợp đồng hai lớp

| | Hợp đồng khung | Phụ lục từng lượt thuê |
|---|---|---|
| Khi nào | Một lần, lúc đăng ký — chưa đồng ý thì không tạo được phiên thanh toán | Mỗi phiên thanh toán, trước khi trả tiền |
| Nội dung | Xử lý lọ hỏng và bồi thường, ân hạn, chủ động không gia hạn, thanh lý, hoàn tiền thủ công, cam kết hàng chính hãng, chế tài khi khai gian | Con số của lượt thuê: slot, gói thuê, gói bảo quản, mức bảo vệ tối đa, tỉ lệ phí ân hạn |
| Ai soạn | Nền tảng, có phiên bản — giống nhau cho mọi thương hiệu | Hệ thống tự điền từ ảnh chụp giá trên hóa đơn (FR-SLT-33) |
| Xác nhận | Tick đồng ý; lưu phiên bản, người đồng ý, thời điểm, IP, mã băm nội dung | Tick đồng ý; lưu cùng các thông tin trên |

Không thương lượng riêng với từng thương hiệu. Xác nhận bằng OTP qua email để mức S; mức M tối thiểu là
tick đồng ý kèm phần lưu vết trên.

**Bồi thường hàng hoá** theo thiết kế ở bản rà soát (Mục 4): phí gói bảo quản tính theo mức được bảo
vệ (`coverage_cap`, đã có); giá trị lọ do thương hiệu tự khai, chỉ phải chứng minh khi có sự cố; tiền
đền = min(tỉ lệ bồi thường × giá có bằng chứng, mức bảo vệ còn lại). Giấy tờ chính hãng nộp trong
`RENTAL_MAX_STOCKING_DAYS` sau khi thanh toán, phải được duyệt trước khi lắp chai.

### 3. Chi trả doanh thu hằng tháng

| Hạng mục | Quyết định |
|---|---|
| Kỳ | Tháng dương lịch, theo giờ Việt Nam |
| Đơn được tính | `revenue_owner = BRAND` và trạng thái `DISPENSED` hoặc `FORFEITED` (FR-ORD-27 vẫn ghi doanh thu cho đơn khách bỏ lượt) |
| Không tính | Đơn `FAILED`, `REFUND_PENDING`, `REFUNDED` — tiền đã hoặc sẽ hoàn cho khách |
| Phí PayOS, khoản đã hoàn | Nền tảng chịu, không trừ vào doanh thu thương hiệu |
| Trạng thái kỳ | `DRAFT` (đang cộng dồn) → `CONFIRMED` (khoá số liệu sau khi hết tháng) → `PAID` (đã chuyển khoản, có mã giao dịch) |
| Điều kiện chuyển `PAID` | Thương hiệu đã được xác minh pháp nhân và có tài khoản nhận tiền; Super Admin xác thực lại (FR-AUTH-09) |
| Khiếu nại số liệu | Thương hiệu gửi khiếu nại trên kỳ `CONFIRMED`; Super Admin trả lời trước khi chuyển `PAID` |

Tài khoản nhận tiền của **thương hiệu** là tài khoản doanh nghiệp, không thuộc phạm vi NFR-DAT-04.

### 4. Gửi email cho thông báo về tiền và hàng

FR-ALR-15 nâng từ **W lên M** cho riêng nhóm thông báo: thanh toán thuê slot, hóa đơn bắt đầu hiệu
lực, sắp hết hạn, vào ân hạn, sắp thanh lý, đã thanh lý, hàng trả về sẵn sàng, kỳ chi trả. Dùng cột
`notifications.channel` đã có (`EMAIL`), lưu trạng thái gửi làm bằng chứng. Email cảnh báo vận hành
(FR-ALR-15 phần còn lại) vẫn mức W.

### Thay đổi đặc tả và contract — viết ở PR riêng

| Chỗ | Thay đổi |
|---|---|
| `docs/FR_NFR_SCENTSTATION.md` | Sửa FR-USR-01, FR-USR-05 (cho phép tự đăng ký); sửa ghi chú Phần D "mọi tài khoản do Super Admin tạo"; sửa FR-SLT-17, 18 (đơn được tính, kỳ tháng); FR-ALR-15 tách phần email tiền/hàng lên M; FR mới cho đăng ký, xác minh email, hợp đồng khung, phụ lục, kỳ chi trả (số hiệu cấp khi viết) |
| `schema.sql` | `brands`: `tax_code`, `legal_verified_at`, `legal_verified_by`, `payout_account` (mã hoá). Bảng mới `agreement_versions`, `agreement_acceptances`, `email_verifications`, `brand_payouts` (kỳ, số tiền, trạng thái, mã giao dịch). `rental_checkouts`: tham chiếu phụ lục đã đồng ý |
| `openapi.yaml` | `POST /auth/register-brand`, `POST /auth/verify-email`, `GET /agreements/current`, `POST /agreements/{version}/accept`, `GET /rental-checkouts/{id}/annex`, `GET/POST /brand-payouts…`; `POST /rental-checkouts` từ chối khi chưa đồng ý hợp đồng khung |
| `spec/errors.md` | `AGREEMENT_NOT_ACCEPTED` (403), `EMAIL_NOT_VERIFIED` (403), `BRAND_NOT_VERIFIED` (409, khi chi trả) |

## Hệ quả

- **Module:** AUTH và USR (đăng ký, xác minh email), BND (xác minh pháp nhân), SLT (hợp đồng, phụ lục,
  kỳ chi trả), ALR (gửi email).
- **Test:** chưa đồng ý hợp đồng khung thì `POST /rental-checkouts` bị từ chối; kỳ chi trả không tính đơn
  `FAILED`/`REFUNDED`; thương hiệu chưa xác minh không chuyển được `PAID`; cô lập — thương hiệu A không
  xem được kỳ chi trả của B (thêm vào nhóm trọng yếu "Cô lập mức slot").
- **Rủi ro:** tự đăng ký mở cửa cho tài khoản rác — cần giới hạn tần suất đăng ký và xác minh email
  trước khi thuê.
- **Pháp lý:** nội dung hợp đồng khung và giá trị của xác nhận điện tử cần người có chuyên môn xem lại.

---

## Nhật ký áp dụng

**2026-10-14:** áp đặc tả — FR mới và FR viết lại trong `docs/FR_NFR_SCENTSTATION.md`, `spec/errors.md`
(`EMAIL_NOT_VERIFIED`, `AGREEMENT_NOT_ACCEPTED`, `BRAND_NOT_VERIFIED`), glossary.

**2026-10-16 — PR contract chung ADR-0013/0014/0015** (nhánh `feat/business-gap-review`):

| Hạng mục | Đã làm |
|---|---|
| Migration | `1791100060000_adr-0013-0014-0015-contract.sql` — enum `agreement_kind`, `brand_payout_status`; cột `brands.tax_code`, `business_license_number`, `payout_account_ciphertext`, `payout_account_key_version`, `legal_verified_at/by`; `rental_checkouts.agreement_version_id`; bảng `email_verifications`, `agreement_versions`, `agreement_acceptances`, `brand_payouts` |
| `schema.sql` | Cột mới cuối bảng, §10g, REVOKE ở §11, §13 mục 13 |
| `openapi.yaml` | `POST /auth/register-brand`, `/auth/verify-email`, `/auth/verify-email/resend`; `PUT /brands/me/legal-profile`, `POST /brands/{id}/legal-verification`; `GET/POST /agreements`, `GET /agreements/current`, `POST /agreements/{version}/publish`, `/accept`; `GET /rental-checkouts/{id}/annex`, `POST …/annex/accept`; `GET /brand-payouts`, `GET /brand-payouts/{id}`, `POST …/pay`, `…/dispute`, `…/dispute-response`; mô tả `POST /rental-checkouts` và `…/payments` thêm ba mã lỗi |
| `erd.md`, sinh lại | Nhóm Identity và Catalog; `data-dictionary.md`, `types.generated.ts`, `packages/contracts/src/openapi.ts` |

**Lệch so với bảng "Thay đổi đặc tả và contract" ở trên:**

| Chỗ | ADR ghi | Đã làm | Vì sao |
|---|---|---|---|
| Tham chiếu phụ lục | cột trên `rental_checkouts` | `rental_checkouts.agreement_version_id` (hợp đồng khung lúc tạo phiên) + `agreement_acceptances.rental_checkout_id` (kind `ANNEX`, một hàng mỗi phiên) | Bằng chứng đồng ý tự đứng được: hàng đồng ý biết nó thuộc phiên nào; tránh khóa ngoại vòng hai chiều |
| `payout_account` | một cột mã hoá | `payout_account_ciphertext` + `payout_account_key_version` | Cùng mẫu `refund_claims` — xoay khóa mà vẫn đọc được bản cũ |
| Xác minh email | bảng `email_verifications` | Một hàng mỗi tài khoản (`UNIQUE user_id`); không có hàng = tài khoản Super Admin tạo, không cần xác minh | Không thêm cột vào `users`; phân biệt tài khoản tự đăng ký mà không cần cờ riêng |
| Khiếu nại số liệu | — | Cột `dispute_*` trên `brand_payouts`, mỗi kỳ một khiếu nại; `chk_payout_paid_dispute_resolved` chặn PAID khi chưa trả lời | FR-SLT-54 ở mức M chỉ cần một vòng hỏi–đáp |
| Hợp đồng khung bất biến | — | `trg_agreement_versions_published_immutable` | Mã băm trong bằng chứng đồng ý phải trỏ tới đúng văn bản đã công bố |
| Endpoint thêm | — | `/auth/verify-email/resend`, `GET/POST /agreements`, `/agreements/{version}/publish`, `/brands/{id}/legal-verification`, `/brands/me/legal-profile` | Cần cho FR-USR-07, FR-SLT-48, FR-BND-09, 10 — ADR chỉ liệt kê endpoint phía thương hiệu |

**2026-10-20 — Bổ sung trường payoutAccountMasked vào schema BrandProfile (FR-BND-09)**:

| Hạng mục | Đã làm |
|---|---|
| `openapi.yaml` | Thêm trường `payoutAccountMasked` vào schema `BrandProfile` (gồm `bankCode`, `maskedAccountNumber`, `accountHolder`) để hiển thị thông tin 4 số cuối tài khoản nhận doanh thu phục vụ đối soát pháp nhân mà vẫn tuân thủ NFR-DAT-04 (không lộ số tài khoản đầy đủ). |

**2026-10-21 — hiện thực kỳ chi trả (TV1, việc T7)** — module `apps/api/src/modules/rev`:

| Hạng mục | Đã làm |
|---|---|
| Kỳ chi trả | Job `RevService.refreshPayouts` 5 phút một lần và ngay khi khởi động: tính lại kỳ DRAFT từ đầu, chốt CONFIRMED kỳ của tháng đã hết theo giờ Việt Nam. Đơn thuộc kỳ theo `paid_at`; cùng tập `REVENUE_ORDER_STATUSES` với báo cáo RPT |
| Chuyển PAID | `POST /brand-payouts/{id}/pay`: quyền mới `revenue.manage` (chỉ Super Admin) + xác thực lại; `RENTAL_NOT_ACTIVE` khi kỳ không CONFIRMED hoặc còn khiếu nại; `BRAND_NOT_VERIFIED` khi thiếu `legal_verified_at` hoặc tài khoản nhận tiền |
| Khiếu nại | `…/dispute` chỉ Brand Admin, kỳ CONFIRMED, một lần; `…/dispute-response` Super Admin; thông báo trong ứng dụng |
| Đối soát, tách doanh thu | `GET /settlements` (FR-SLT-17, 18), `GET /revenue/split` (FR-REV-04) |
| Màn hình | `/brand-payouts`, `/revenue` trên web quản trị |

AC FR-SLT-53, 54 trong `spec/modules/SLT.md` đã sửa theo contract (`/pay`, `/dispute-response`,
`RENTAL_NOT_ACTIVE`); bản AC cũ dùng `/payout`, `/resolve-dispute` và mã `DISPUTE_PENDING` không có trong
`openapi.yaml` hay `errors.md`. Thông báo kỳ chi trả mới ở kênh `IN_APP`; gửi email do hạ tầng FR-ALR-16
của TV4 nối sau.
