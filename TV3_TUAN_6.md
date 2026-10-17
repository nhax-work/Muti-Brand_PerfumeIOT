# TV3 — hướng dẫn cho AI làm hoàn thiện việc tuần 6

Hạn chót **25/10/2026** (hết T6). File này dành cho coding agent của TV3 (Claude Code hoặc tương đương)
và cho TV3 khi giao việc. Nguồn việc: `docs/LO_TRINH_AI_HARNESS_13_TUAN.md`, mục "TUẦN 6" và "Làm ngay
tuần 6".

**Cách dùng.** TV3 giao **từng bước** ở Mục 3 cho agent, không giao cả file một lần. Mỗi bước có điều
kiện xong; chưa đạt thì không sang bước sau. Bước nào ghi **DỪNG** thì agent dừng lại hỏi TV3, không tự
quyết. Câu mở đầu gợi ý cho mỗi phiên:

```
Đọc spec/PROJECT.md và docs/prompts/TV3_TUAN_6.md. Làm Bước <N>. Dừng ở mọi điểm ghi DỪNG.
```

---

## 1. Việc của TV3 tuần này

| # | Việc | FR | Xong khi |
|---|---|---|---|
| A | Viết AC cho FR mới của ADR-0013/0014, soát AC của FR viết lại | xem Bước 1 | Mọi FR trong danh sách có mục `## FR-…` với AC Given/When/Then, TV1 đã đọc |
| B | Thương hiệu tự đăng ký + xác minh email, giới hạn tần suất đăng ký | FR-USR-06, 07 (sửa FR-USR-01, 05) | Endpoint theo `openapi.yaml`, test `test_FR_USR_06_*`, `test_FR_USR_07_*` xanh |
| C | Hợp đồng khung có phiên bản, đồng ý một lần kèm lưu vết | FR-SLT-48, 49 | Endpoint `/agreements*` theo contract, test xanh, seed có một phiên bản hiện hành |
| D | `POST /rental-checkouts` từ chối `EMAIL_NOT_VERIFIED`, `AGREEMENT_NOT_ACCEPTED` | FR-USR-07, FR-SLT-49 | Test trên CSDL thật, test cũ của checkout vẫn xanh |
| E | Màn hình cho B, C, D trên web quản trị | — | Có test cạnh file, đi được trọn luồng đăng ký → xác minh → đồng ý → mua gói trên máy dev |
| F | Nhận giữ màn hình TV1 làm: Thương hiệu, Tài khoản, Hồ sơ thương hiệu, Bảng giá | **[UI-16/10]** | Đã chạy thử sau `make seed`, lỗi tìm được đã sửa hoặc ghi lại |
| G | Viết AC cho RFQ (12 FR) — TV1 hiện thực ở T8 | FR-RFQ-01 ÷ 12 | `spec/modules/RFQ.md` đủ 12 mục, header đổi trạng thái |

Từ T7 việc của TV3 xây trên tuần này: phụ lục (FR-SLT-50), giới hạn giữ chỗ (FR-SLT-56), đổi slot
(FR-SLT-55), xác minh pháp nhân (FR-BND-09, 10), báo không gia hạn (FR-EXP-23 ÷ 25). T6 trễ là T7 trễ, mà
T8 là đóng băng code (08/11).

---

## 2. Đọc trước khi bắt đầu

| File | Vì sao |
|---|---|
| `spec/PROJECT.md` | Quy tắc bắt buộc, "không bao giờ tự quyết", quy ước ngôn ngữ |
| `spec/decisions/0013-brand-tu-dang-ky-hop-dong-hai-lop-va-chi-tra-doanh-thu.md` | Quyết định gốc của B, C, D — **đọc cả "Nhật ký áp dụng" và bảng "Lệch so với…"** ở cuối |
| `spec/decisions/0014-an-han-chu-dong-khong-gia-han-va-doi-slot.md` | Cần cho AC của FR-EXP-23 ÷ 28, FR-SLT-55, 56 |
| `spec/decisions/0004-cap-mat-khau-tam-va-bat-doi.md` | Tài khoản Super Admin tạo đi qua `INVITED`; tài khoản tự đăng ký thì không |
| `spec/contracts/openapi.yaml` | `registerBrand`, `verifyEmail`, `resendEmailVerification`, `listAgreementVersions`, `createAgreementVersion`, `getCurrentAgreement`, `publishAgreementVersion`, `acceptAgreement`, `createRentalCheckout` |
| `spec/contracts/schema.sql` | §10g (`email_verifications`, `agreement_versions`, `agreement_acceptances`), §13 mục 13 (thứ tự kiểm khi tạo phiên) |
| `spec/modules/SLT.md` | Mẫu định dạng AC (xem FR-SLT-35) |
| `spec/testing.md` | Tên test, tầng test, nhóm test trọng yếu |
| `docs/HUONG_DAN_BACKEND.md`, `docs/HUONG_DAN_FRONTEND.md` | Cách viết module và màn hình |
| `DEFINITION_OF_DONE.md` | Điều kiện một PR được coi là xong |

**Kiểm nền trước khi code.** Contract ADR-0013/0014/0015 nằm ở commit `df09b05` trên nhánh
`feat/business-gap-review`. Nếu `git log main` chưa có commit đó thì tách nhánh từ
`feat/business-gap-review`, không từ `main`. Sau đó:

```bash
make migrate      # migration 1791100060000_adr-0013-0014-0015-contract.sql
make seed
npm run db:types  # kiểu Kysely cho bảng mới
```

---

## 3. Các bước

### Bước 1 — AC (việc A) · làm trước, xong trước khi giao agent hiện thực

**FR mới cần viết AC** — mỗi FR một mục `## FR-XXX-NN — <tên ngắn>` theo đúng mẫu FR-SLT-35 (Statement,
Traces, Priority, API, Acceptance criteria, Test):

| File | FR |
|---|---|
| `spec/modules/USR.md` | FR-USR-06, 07 |
| `spec/modules/BND.md` | FR-BND-09, 10 |
| `spec/modules/SLT.md` | FR-SLT-48 ÷ 56 (FR-SLT-51 mức S — viết Statement, ghi "không làm trong lịch 12 tuần", không cần AC chi tiết) |
| `spec/modules/EXP.md` | FR-EXP-23 ÷ 28 |

**FR viết lại cần soát AC** — đang mang dòng "*AC bên dưới cần soát lại cho khớp*": FR-USR-01, 05,
FR-SLT-17, 18, 44, FR-EXP-06, 07, FR-AUTH-09. Soát xong thì xóa dòng nghiêng đó.

Quy tắc khi viết:

- Statement chép **nguyên văn** câu ở `docs/FR_NFR_SCENTSTATION.md`. Mã lỗi chỉ lấy từ `spec/errors.md`,
  ngưỡng chỉ lấy tên từ `spec/constraints.md`, endpoint và mã HTTP khớp `openapi.yaml`.
- AC phải trả lời được các câu dưới đây — đây là chỗ contract để ngỏ, agent hiện thực sẽ đoán nếu AC
  không nói:

| FR | Điểm AC phải chốt |
|---|---|
| FR-USR-06 | Brand và tài khoản cùng tạo trong **một transaction**, cả hai `ACTIVE` (không qua `INVITED`), vai trò Brand Admin; `brands.code` sinh từ tên — trùng thì xử lý thế nào; email trùng (không phân biệt hoa thường) → `VALIDATION_ERROR` ở trường `email`; vượt giới hạn theo IP → `RATE_LIMITED`; AuditLog không chứa mật khẩu |
| FR-USR-07 | Mã sai / quá hạn / đã dùng → `VALIDATION_ERROR`; mã đã dùng của email đã xác minh → 204; gửi lại thay mã cũ, mã cũ hết hiệu lực; tài khoản không có dòng `email_verifications` (Super Admin tạo) **không** bị chặn; chưa xác minh → `POST /rental-checkouts` trả `EMAIL_NOT_VERIFIED` |
| FR-USR-01, 05 | Tài khoản Super Admin tạo vẫn `INVITED` + mật khẩu tạm như cũ và không có dòng `email_verifications`; FR-USR-05 thêm ngoại lệ tự đăng ký — `/users` vẫn chỉ Super Admin |
| FR-SLT-48 | Bản nháp → công bố; đúng một bản hiện hành (`uq_agreement_version_current`); đã công bố thì bất biến (trigger); `version` trùng → `VALIDATION_ERROR`; công bố cần xác thực lại |
| FR-SLT-49 | Chỉ đồng ý được bản hiện hành; `contentHash` lệch → `VALIDATION_ERROR`; đồng ý lại → 200 cùng bản ghi cũ; lưu phiên bản, người, thời điểm, IP, mã băm; bảng chỉ thêm mới; **chưa có bản nào được công bố thì tạo phiên bị từ chối** (`AGREEMENT_NOT_ACCEPTED` — chặn an toàn); công bố bản mới thì mọi thương hiệu phải đồng ý lại trước phiên tiếp theo; tài khoản mức nền tảng gọi accept → `FORBIDDEN_SCOPE` |
| FR-SLT-50 | Phụ lục sinh lại từ cùng dữ liệu cho cùng `contentHash`; phiên tạo trước ADR-0013 → `NOT_FOUND`; thanh toán khi chưa đồng ý → `AGREEMENT_NOT_ACCEPTED` |
| FR-SLT-52 ÷ 54 | Kỳ tháng giờ Việt Nam; đơn được tính đúng như ADR-0013 §3; `BRAND_NOT_VERIFIED`; khiếu nại chưa trả lời chặn `PAID`. **TV1 hiện thực** — viết AC đủ để TV1 dùng ngay ở T7 |
| FR-SLT-55, 56 | Theo §13 mục 13 của `schema.sql`: điều kiện `SLOT_SWAP_NOT_ALLOWED`, cộng dồn slot chưa thanh toán trên mọi phiên mở cho `HOLD_LIMIT_REACHED`; ca đồng thời (đã có trong bảng nhóm test trọng yếu của lộ trình) |
| FR-EXP-23 ÷ 28 | Báo/rút lại trước `ends_at`; không vào `GRACE`, không phí; phiếu trả hàng, `RETURNED_TO_BRAND`, `CLOSED`; quá `RETURN_PICKUP_MAX_DAYS` → chuyển sở hữu như thanh lý, báo trước 3 ngày, bù sau downtime |
| FR-EXP-06, 07 | Không vào `GRACE` khi đã báo không gia hạn; ngày kết thúc ân hạn mặc định `GRACE_PERIOD_DEFAULT_DAYS` |

- Cập nhật header mỗi file: số FR, trạng thái AC, ngày. Báo TV1 để sửa đoạn "Lệch từ 2026-10-14" ở
  `spec/PROJECT.md` (file đó TV1 giữ).
- Gặp chỗ đặc tả mâu thuẫn hoặc cần mã lỗi/ngưỡng chưa có → **DỪNG**, ghi câu hỏi vào cuối PR, không tự
  thêm.

Commit: `docs(SLT,EXP,USR,BND): AC cho FR mới của ADR-0013, 0014`. TV1 đọc rồi mới sang Bước 3.

### Bước 2 — Ngưỡng còn thiếu · **DỪNG chờ TV1 duyệt**

Việc B cần ba ngưỡng **chưa có** trong `spec/constraints.md`. Thêm ngưỡng là việc "không bao giờ tự
quyết" (`spec/PROJECT.md` Mục 4), nên agent chỉ **đề xuất**, TV3 gửi TV1 duyệt:

| Tên đề xuất | Giá trị đề xuất | Dùng cho |
|---|---|---|
| `EMAIL_VERIFICATION_TTL_HOURS` | 24 | `email_verifications.expires_at` (FR-USR-07) |
| `BRAND_REGISTER_RATE_LIMIT_PER_MIN` | 3 | `POST /auth/register-brand`, theo IP (FR-USR-06) |
| `EMAIL_VERIFICATION_RESEND_RATE_LIMIT_PER_MIN` | 1 | `POST /auth/verify-email/resend`, theo tài khoản |

Kèm theo: sửa mô tả `RATE_LIMITED` trong `spec/errors.md` để liệt kê thêm hai trường hợp này (mã đã
có, không thêm mã mới). Duyệt xong: `npm run spec:generate`. Commit riêng:
`chore(spec): ngưỡng xác minh email và giới hạn đăng ký (ADR-0013)`.

### Bước 3 — Tự đăng ký và xác minh email (việc B)

Endpoint `/auth/*` nằm ở `apps/api/src/modules/auth/auth.http.ts`; tạo thương hiệu và tài khoản là
nghiệp vụ của BND và USR — gọi qua `index.ts` của module, theo ranh giới module ở ADR-0003.

- `POST /auth/register-brand` (`@Public()`): kiểm giới hạn tần suất **trước** mọi việc khác — dùng lại
  `PerMinuteRateLimiter` (`apps/api/src/shared/http/rate-limiter.ts`) và `originOf`
  (`apps/api/src/shared/http/request-origin.ts`), như `refund-claims.service.ts` đang làm. Trong một
  transaction: tạo `brands` (`ACTIVE`, `code` sinh từ tên), `users` (`ACTIVE`, băm mật khẩu bằng hàm đã
  có ở `modules/auth/password.ts`), gán vai trò Brand Admin, tạo dòng `email_verifications`. Gửi email
  **sau** commit.
- Mã xác minh: chuỗi ngẫu nhiên đủ dài (≥ 32 byte, base64url — contract đòi tối thiểu 16 ký tự), chỉ lưu
  SHA-256 hex vào `token_hash`. **Không** ghi mã gốc vào log, AuditLog hay phản hồi API.
- `POST /auth/verify-email` (`@Public()`): tìm theo băm của mã; đúng và còn hạn → đặt `verified_at`.
- `POST /auth/verify-email/resend` (cần đăng nhập): sinh mã mới **thay** mã cũ trên cùng dòng (dòng là
  `UNIQUE user_id`), dời `expires_at`. Không có dòng hoặc đã xác minh → 204, không gửi.
- **Gửi email.** Hạ tầng email (FR-ALR-16) là của TV4 ở T7, hiện chưa có. Tuần này làm một cổng nhỏ
  (interface gửi email theo khóa i18n + tham số) cùng adapter dev chỉ ghi đường dẫn xác minh ra log
  **khi không phải production**; test dùng adapter giả để lấy mã. **DỪNG** — thống nhất hình dạng
  interface với TV4 trước khi viết, để T7 TV4 chỉ thay adapter.
- Đường dẫn trong email trỏ tới màn `/verify-email?token=…` của web quản trị. Nếu cấu hình chưa có URL
  gốc của web quản trị thì thêm biến vào `apps/api/src/shared/config/app-config.ts`. Agent không sửa được
  `.env.example` (security guard chặn `.env.*`) — ghi dòng cần thêm vào PR để TV3 tự thêm.
- Chuỗi người dùng đọc (tiêu đề, nội dung email, thông báo lỗi) vào `packages/i18n`, cả `vi` và `en`.
- AuditLog cho đăng ký (FR-AUD-01), không chứa mật khẩu hay mã.

Test (`tests/unit/usr.test.ts`, `tests/unit/auth.test.ts`, và `tests/integration/` cho phần transaction):
`test_FR_USR_06_register_creates_brand_and_active_admin`, `test_FR_USR_06_duplicate_email_rejected`,
`test_FR_USR_06_rate_limited_by_ip`, `test_FR_USR_07_verify_token_once`,
`test_FR_USR_07_expired_token_rejected`, `test_FR_USR_07_resend_replaces_token` — tên chỉ là gợi ý, chỉnh
cho khớp AC đã viết ở Bước 1.

### Bước 4 — Hợp đồng khung (việc C)

Contract gắn tag SLT, nên code nằm trong `apps/api/src/modules/slt/` (file riêng, ví dụ
`agreement.service.ts`, `agreement.queries.ts`, `agreement.http.ts` — giống cách `catalog.*` tách khỏi
`slt.*`).

- `POST /agreements`: tạo bản nháp, tính `content_hash` = SHA-256 hex của `content` ngay lúc tạo.
  Contract không có endpoint sửa bản nháp — sai thì tạo version mới.
- `POST /agreements/{version}/publish`: `@RequireReauth()` (`modules/auth/decorators.ts`). Trong một
  transaction: bỏ `is_current` của bản cũ trước, rồi đặt bản mới `is_current = true`, `published_at`.
  Đảo thứ tự là vi phạm `uq_agreement_version_current`.
- `GET /agreements/current`: bản hiện hành + lần đồng ý **của thương hiệu người gọi** (null với tài
  khoản mức nền tảng). Không bao giờ trả lần đồng ý của thương hiệu khác (BR-012).
- `POST /agreements/{version}/accept`: chỉ Brand Admin; chỉ bản hiện hành; so `contentHash`; ghi
  `agreement_acceptances` kind `FRAMEWORK` với `ip_address`, `user_agent` từ `originOf`. Hai yêu cầu đồng
  thời: bắt `23505` của `uq_acceptance_framework` rồi đọc lại, trả 200. Bảng chỉ thêm mới — không có
  đường UPDATE.
- Quyền: quản lý phiên bản chỉ Super Admin. Nếu chưa có quyền phù hợp thì thêm quyền mới vào
  `scripts/seed.ts` (danh sách quyền ở đầu file), chỉ cấp cho Super Admin.
- **Seed:** thêm một phiên bản `1.0` đã công bố, hiện hành, nội dung giữ chỗ ghi rõ "chờ người có chuyên
  môn pháp lý xem lại" (ADR-0013, mục Hệ quả). Hai thương hiệu seed đã đồng ý bản đó, để luồng mua gói
  hiện tại không gãy sau Bước 5. `make seed` phải chạy lại được nhiều lần (`ON CONFLICT DO NOTHING`).

Test: `test_FR_SLT_48_single_current_version`, `test_FR_SLT_48_published_content_immutable` (đi qua
trigger thật), `test_FR_SLT_49_accept_records_evidence`, `test_FR_SLT_49_hash_mismatch_rejected`,
`test_FR_SLT_49_accept_idempotent`.

### Bước 5 — Chốt chặn khi tạo phiên thanh toán (việc D)

Sửa `createCheckout` ở `apps/api/src/modules/slt/slt.service.ts`, ngay sau kiểm phạm vi thương hiệu, theo
thứ tự ở `schema.sql` §13 mục 13:

1. Tài khoản người gọi có dòng `email_verifications` mà `verified_at` NULL → `EMAIL_NOT_VERIFIED`.
2. Không có bản hiện hành, hoặc thương hiệu chưa đồng ý bản hiện hành → `AGREEMENT_NOT_ACCEPTED`.
3. Ghi `rental_checkouts.agreement_version_id` = id bản hiện hành, đọc **trong** transaction tạo phiên.

**Không** bật kiểm phụ lục ở `POST /rental-checkouts/{id}/payments` tuần này: phụ lục (FR-SLT-50) làm ở
T7; bật bây giờ thì không ai trả tiền được. Ghi rõ trong PR là còn thiếu, chờ T7.

Test cũ tạo phiên (`tests/integration/test_slt_checkout_payment.test.ts`,
`test_slt_concurrent_hold.test.ts`, `test_slot_constraint.test.ts`, `test_slt_job_expiry.test.ts`…) sẽ đỏ
vì thiếu đồng ý hợp đồng khung. Sửa bằng cách cho helper trong `tests/integration/helpers/` tạo sẵn bản
hiện hành và lần đồng ý — **không** thêm cờ tắt kiểm tra, không mock bỏ qua nó (ADR-0010).

Test mới (CSDL thật): `test_FR_USR_07_unverified_account_cannot_checkout`,
`test_FR_USR_07_admin_created_account_needs_no_verification`,
`test_FR_SLT_49_checkout_requires_current_agreement`,
`test_FR_SLT_49_new_version_requires_reaccept`.

### Bước 6 — Màn hình (việc E)

Theo `docs/HUONG_DAN_FRONTEND.md`; mỗi màn có test cạnh file; chuỗi qua `packages/i18n`, cả `vi` và
`en`; kiểu lấy từ `packages/contracts`, không khai tay.

| Màn | Ai dùng | Ghi chú |
|---|---|---|
| `/register` — đăng ký thương hiệu | Công khai | Thêm vào router cạnh `/login`, `/claim`; link từ màn đăng nhập. Xong thì hướng dẫn kiểm email, rồi đăng nhập |
| `/verify-email?token=…` | Công khai | Gọi `verifyEmail`, hiện thành công/thất bại, nút về đăng nhập |
| Gửi lại mã xác minh | Brand Admin | Hiện khi API trả `EMAIL_NOT_VERIFIED`; xử lý `RATE_LIMITED` |
| Đồng ý hợp đồng khung | Brand Admin | Hiện nội dung bản hiện hành, ô tick, gửi đúng `contentHash` đã nhận. Chặn trước luồng mua gói (`/rentals/available`) khi `acceptance` là null |
| Quản lý phiên bản hợp đồng khung | Super Admin | Danh sách, soạn bản nháp, công bố có xác thực lại (dùng lại cách màn khóa MQTT đang làm) |
| Màn checkout hiện có | Brand Admin | Hiển thị đúng `EMAIL_NOT_VERIFIED`, `AGREEMENT_NOT_ACCEPTED` kèm lối đi tiếp (gửi lại mã / đi tới màn đồng ý) |

`/auth/me` **không** có cờ "đã xác minh email" và contract đã đóng băng — màn hình dựa vào mã lỗi và
`GET /agreements/current`, không tự thêm trường vào contract.

### Bước 7 — Nhận giữ màn hình TV1 đã làm (việc F)

Sau `make seed`, đăng nhập lần lượt Super Admin và Brand Admin, chạy thử: **Thương hiệu**
(`routes/brands`), **Tài khoản** (`routes/users`), **Hồ sơ thương hiệu** (`routes/brand-profile`),
**Bảng giá** (`routes/pricing`). Với mỗi màn: tạo/sửa/ngừng một bản ghi, kiểm thông báo lỗi, kiểm chuỗi
cả hai ngôn ngữ. Lỗi nhỏ thì sửa luôn (`fix(admin-web): …`), lỗi lớn ghi vào PR cho TV3 quyết. Từ đây
TV3 giữ các màn này; T7 màn hồ sơ thương hiệu sẽ thêm phần khai pháp nhân (FR-BND-09).

> Đang có thay đổi chưa commit trong `routes/products`, `routes/orders`, `routes/pricing`,
> `routes/machines` và `packages/i18n` trên máy TV1. Kéo nhánh mới nhất trước khi sửa `pricing` để khỏi
> đụng nhau.

### Bước 8 — AC cho RFQ (việc G)

`spec/modules/RFQ.md` đang là khung rỗng. Viết đủ FR-RFQ-01 ÷ 12 theo mẫu FR-SLT-35, đối chiếu:

- `schema.sql`: `refill_requests`, enum `refill_request_status`, `refill_request_reason`,
  `uq_refill_request_open` (FR-RFQ-12 — mã lỗi `REFILL_REQUEST_PENDING`), `fk_refill_request_rental_same_brand`,
  §13 mục 4 (chỉ `COMPLETED` khi có `refill_session_id`, FR-RFQ-09).
- `openapi.yaml`: `/refill-requests*` (tìm theo đường dẫn).
- `spec/glossary.md` mục `RefillRequest` (state machine).
- Ràng buộc từ ADR khác: slot phải thuộc hóa đơn đang hiệu lực của thương hiệu (cô lập mức slot); phiếu
  nạp mở → cả máy dừng nhận đơn (ADR-0015); không có gì cho Brand Admin chạm vào phiên nạp (FR-RFQ-11).
- FR-RFQ-07 mức S — viết Statement, AC ngắn.

Header: "Trạng thái AC: **hoàn thành** · Phụ trách đặc tả: TV3 · Hiện thực: TV1 (T8)".

---

## 4. Bẫy đã biết

| Bẫy | Làm đúng |
|---|---|
| Tài khoản Super Admin tạo bị chặn `EMAIL_NOT_VERIFIED` | Không có dòng `email_verifications` = không cần xác minh. Chỉ chặn khi **có** dòng và `verified_at` NULL |
| Đặt tài khoản tự đăng ký ở `INVITED` | Tự đăng ký là `ACTIVE` ngay — người dùng tự chọn mật khẩu. `INVITED` khiến mọi API trả `FORBIDDEN_SCOPE` (ADR-0004) |
| Lưu hoặc log mã xác minh gốc | Chỉ lưu SHA-256; adapter dev chỉ in đường dẫn khi không phải production |
| Tự nghĩ mã lỗi `TOKEN_EXPIRED`, `EMAIL_TAKEN`… | Contract dùng `VALIDATION_ERROR` cho cả hai. Mã mới phải qua `spec/errors.md` |
| Hardcode 24 giờ, 3 lần/phút | Đọc hằng sinh từ `spec/constraints.md` (Bước 2) |
| Sửa `openapi.yaml` / `schema.sql` cho tiện | Đóng băng. Cần đổi → **DỪNG**, báo TV1, viết ADR |
| Đọc lần đồng ý theo `Machine` hay trả lần đồng ý của thương hiệu khác | Lọc theo `brand_id` của người gọi |
| Công bố bản mới: bật bản mới trước rồi mới tắt bản cũ | Tắt trước, bật sau, cùng transaction |
| Sửa test cũ bằng cách nới kiểm tra | Sửa helper để tạo dữ liệu đúng; kiểm tra giữ nguyên |
| Bật kiểm phụ lục ở thanh toán ngay tuần này | Để T7 cùng FR-SLT-50 |
| `npx prettier --write .` | Chỉ format file đã sửa: `npx prettier --write <file…>`. Repo dùng `autocrlf=true`, format cả thư mục sinh hàng loạt thay đổi giả |

---

## 5. Trước khi mở PR

```bash
make lint
make test
make test-contract
make check-traceability
npx prettier --write <các file đã sửa>
```

- Mỗi việc (A … G) một PR hoặc một chuỗi commit rõ ràng; Conventional Commits, scope là mã module, ví dụ
  `feat(USR): thương hiệu tự đăng ký và xác minh email (FR-USR-06, 07, ADR-0013)`.
- PR có test trọng yếu (CSDL thật, đồng thời) thì ghi rõ để người review riêng phần test (ADR-0010).
- PR ghi rõ phần **chưa** làm: kiểm phụ lục ở thanh toán (T7), adapter email thật (TV4, T7), dòng cần
  thêm vào `.env.example`.
- Xong việc thì đánh dấu ✓ ở dòng TV3 trong mục TUẦN 6 của `docs/LO_TRINH_AI_HARNESS_13_TUAN.md`.

## 6. Không làm tuần này

OTP xác nhận đồng ý (FR-SLT-51, mức S — không làm trong lịch 12 tuần) · phụ lục, giới hạn giữ chỗ, đổi
slot, khai và xác minh pháp nhân, báo không gia hạn (T7) · kỳ chi trả (TV1, T7) · RefillRequest hiện thực
(TV1, T8) · đổi email của tài khoản.
