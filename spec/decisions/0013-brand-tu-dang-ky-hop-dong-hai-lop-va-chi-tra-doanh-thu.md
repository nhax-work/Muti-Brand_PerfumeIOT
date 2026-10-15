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
