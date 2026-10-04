> File này, `spec/PROJECT.md`, là nguồn sự thật của dự án dành cho coding agent. `AGENTS.md` và
> `CLAUDE.md` do `dev-harness` sinh ra từ `harness.config.json` và chỉ chứa cấu hình harness
> (persona, tên công cụ lint/format/test, quy tắc security guard) — chúng **không phải** đặc tả và
> không được coi là đặc tả.

## 1. Dự án này là gì

ScentStation là nền tảng cho phép khách chọn nước hoa trên màn hình kiosk, thanh toán bằng mã QR và
nhận đúng một lượt xịt. Mỗi máy (`Machine`) chứa nhiều ngăn được điều khiển độc lập (`MachineSlot`),
nối về nền tảng quản trị trung tâm để theo dõi giao dịch, lượng nước hoa còn lại, tình trạng thiết
bị, hoạt động nạp và bảo trì. Nền tảng chạy theo **mô hình cho thuê slot**: nền tảng sở hữu và vận
hành toàn bộ máy; các thương hiệu nước hoa (`Brand`) thuê từng slot để trưng bày sản phẩm. Một máy
có thể chứa slot của nhiều thương hiệu khác nhau, và một thương hiệu có thể thuê nhiều slot trên
cùng một máy lẫn trên nhiều máy. Dữ liệu kinh doanh được cô lập ở mức slot.

| Trong hệ thống | Bên ngoài |
|---|---|
| Backend | Máy trải nghiệm (`Machine`) — giao tiếp qua MQTT |
| Ứng dụng kiosk | Cổng thanh toán |

Mô hình cho thuê, theo các quyết định nghiệp vụ nền tảng:

- Nền tảng sở hữu và vận hành toàn bộ máy, địa điểm và nhân sự vận hành/kỹ thuật/kho (BR-004, BR-011).
- Thương hiệu tự mua gói thuê slot, quản lý danh mục sản phẩm, giá mỗi lượt xịt trên slot mình thuê, báo cáo của mình và yêu cầu bổ sung (BR-007, BR-011).
- Thuê slot tự phục vụ, không ký hợp đồng, không duyệt tay: xem slot trống → chọn slot → chọn gói thuê 3/6/12 tháng và một gói bảo quản bắt buộc → thanh toán hết một lần → nhận hóa đơn → cấu hình slot. Thời hạn tính từ lúc lắp chai đầu tiên (ADR-0006, đã duyệt 2026-09-29).
- Một hóa đơn thuê slot (`SlotRental`) ứng với đúng một slot; thương hiệu thuê 3 slot có 3 hóa đơn độc lập (BR-009). "Hóa đơn" là thuật ngữ tiếng Việt; định danh kỹ thuật vẫn là `SlotRental`.
- Nhiều slot được chọn và trả tiền **một lần** trong một **phiên thanh toán** (`RentalCheckout`): phiên gom giữ chỗ, tổng tiền và thanh toán; mỗi slot vẫn nhận hóa đơn và số hóa đơn riêng (ADR-0008, đã duyệt 2026-09-30).
- Giá tự do — không có giá sàn hay giá trần (FR-SLT-08).
- Doanh thu nền tảng = tiền bán gói thuê trả trước (gói dài có ưu đãi) + gói bảo quản; không ăn chia doanh thu lượt xịt (BR-009).
- Khi hóa đơn hết hạn: ân hạn có tính phí trước, sau đó thanh lý về sở hữu nền tảng nếu không gia hạn (BR-013) — xem state machine `SlotRental` trong `spec/glossary.md`.
- Khách **bấm nút vật lý** để nhận lượt xịt (ADR-0007, đã duyệt 2026-09-29): mỗi slot một nút có đèn; thanh toán xong máy **không tự xịt** mà sáng đèn nút slot đích, khách bấm trong `DISPENSE_PRESS_WINDOW_SEC` thì xịt. Không bấm → đơn `FORFEITED`, không hoàn tiền. Mỗi máy chỉ một lượt chờ bấm tại một thời điểm.

## 2. Đọc trước khi làm bất cứ việc gì

| # | File | Chứa gì | Mở khi nào |
|---|---|---|---|
| 1 | `docs/FR_NFR_SCENTSTATION.md` | Toàn bộ 286 FR + 52 NFR, lý do BR, danh sách vai trò, thứ tự cắt scope | Cần nội dung yêu cầu thật, mã BR hoặc độ ưu tiên của nó |
| 2 | `spec/glossary.md` | Thực thể và mọi state machine | Đụng tới vòng đời của một thực thể, hoặc viết truy vấn có phạm vi |
| 3 | `spec/constraints.md` | Tên mọi hằng ngưỡng số | Cần một timeout, TTL, giới hạn hay tỷ lệ — không bao giờ hardcode |
| 4 | `spec/errors.md` | Danh mục mã lỗi đầy đủ | Cần trả về hoặc kiểm tra một mã lỗi |
| 5 | `spec/contracts/README.md` | Quy tắc đóng băng và quy trình đổi contract | Trước khi đụng bất cứ thứ gì trong `spec/contracts/` |
| 6 | `spec/testing.md` | Quy ước đặt tên test, phân tầng test, cổng CI, test người tự viết | Trước khi viết hoặc đặt tên bất kỳ test nào |
| 7 | `spec/modules/*.md` | FR theo module kèm acceptance criteria | Cần AC dạng Given/When/Then của một module |
| 8 | `spec/decisions/` | Nhật ký ADR cho các thay đổi contract | Đang đề xuất hoặc rà soát một thay đổi contract |
| 9 | `docs/HUONG_DAN_BACKEND.md` | Cách viết một module backend: bảo vệ endpoint, cô lập dữ liệu, lỗi, ngưỡng, test | **Trước khi viết module backend đầu tiên** |
| 10 | `docs/HUONG_DAN_FRONTEND.md` | Cấu trúc `apps/admin-web` và `apps/kiosk`, năm quy tắc FE, gọi API, i18n, xác thực lại | **Trước khi viết màn hình đầu tiên** |

> **Quyết định mới nhất phải đọc trước khi đụng SLT, EXP, INV, ORD, DSP hay firmware:**
> `spec/decisions/0006-mua-goi-thue-slot-tu-phuc-vu-va-hoa-don.md` (thuê slot theo gói trả trước, hóa
> đơn, bảo hiểm hàng hóa) và `spec/decisions/0007-nut-bam-vat-ly-kich-hoat-luot-xit.md` (nút bấm vật
> lý), cùng `spec/decisions/0008-thanh-toan-nhieu-slot-mot-lan.md` (phiên thanh toán nhiều slot, bổ
> sung ADR-0006). Các ADR này đổi nghiệp vụ lõi; tài liệu nguồn trong `seed_document/` (trừ `DB_DIAGRAM_MERMAID.md`)
> và mọi ghi nhớ cũ về "hợp đồng thuê", "yêu cầu thuê", "phí cố định", "ăn chia", "xịt ngay sau
> thanh toán" đều đã lỗi thời.

> Cả năm file contract đã tồn tại và **đã đóng băng**: `erd.md`, `data-dictionary.md`, `schema.sql`,
> `openapi.yaml`, `mqtt.md`. Chuẩn đặt tên và giá trị enum chốt ở
> `spec/decisions/0002-chuan-dat-ten-va-kieu-du-lieu-csdl.md`.
>
> Hai trong số đó **được sinh ra, không viết tay**: `migrations/1789516800000_initial-schema.sql` là
> bản sao nguyên văn của `schema.sql` **lúc đóng băng**, còn `data-dictionary.md` do
> `scripts/gen-data-dictionary.ts` sinh từ CSDL đã áp migration. Sửa tay một trong hai là làm chúng
> lệch khỏi chính lược đồ mà chúng mô tả. Từ ADR-0006, `schema.sql` mô tả trạng thái sau **mọi**
> migration (ban đầu + `1790665900000_*` + `1790665960000_*` + `1790752000000_*` + `1790752060000_*` + `1790757100000_*` + `1790760300000_*`); `pg_dump --schema-only` của DB nạp
> `schema.sql` phải trùng với DB chạy hết migration.

> Trạng thái acceptance criteria trong `spec/modules/` (188/286 FR hiệu lực, đếm lại ngày 2026-09-29
> sau ADR-0006 và ADR-0007 — đều đã duyệt; 7 FR mức X đã bãi bỏ không tính):
>
> - **Đủ:** `AUTH`, `USR`, `SLT`, `ORD`, `EXP`, `INV`, `MNT`, `ALR`, `REV`
> - **Một phần:** `BND` (chỉ FR-BND-05, 08 — cô lập dữ liệu), `MCH` (chỉ FR-MCH-15..17), `DSP` (chỉ
>   FR-DSP-21..27 — nút bấm vật lý, ADR-0007)
> - **Còn rỗng:** `IOT`, `RPT`, `RFQ`, `AUD`, `PRD`
>
> Đừng bịa acceptance criteria cho nhóm rỗng — viết theo đúng định dạng Given/When/Then đã dùng ở
> `spec/modules/SLT.md`, hoặc nêu rõ là còn thiếu. Header của mỗi file ghi số FR và trạng thái; đếm
> lại bằng cách so mục `## FR-XXX-NN` trong file với bảng FR ở `docs/FR_NFR_SCENTSTATION.md`.

## 3. Quy tắc bắt buộc

- **Contract đã đóng băng.** `erd.md`, `data-dictionary.md`, `schema.sql`, `openapi.yaml`, `mqtt.md`
  trong `spec/contracts/` không được sửa trực tiếp. Muốn đổi: dừng lại, viết ADR trong
  `spec/decisions/` mô tả vấn đề và các phương án, được duyệt, rồi mới sửa contract và chạy
  `make test-contract` (`spec/contracts/README.md`).
- **Ngưỡng số chỉ lấy từ `spec/constraints.md`.** Không bao giờ hardcode timeout, TTL, số lần thử
  lại hay giới hạn tần suất — đọc hằng có tên (ví dụ `DISPENSE_CMD_TTL_SEC`, `ORDER_PAYMENT_TTL_SEC`,
  `MACHINE_OFFLINE_SEC`) từ cấu hình.
- **Mã lỗi chỉ lấy từ `spec/errors.md`.** Agent không được tự nghĩ mã mới. Trường hợp thật sự mới
  thì thêm vào `errors.md` trước (`SCREAMING_SNAKE_CASE`, không kèm tiền tố module), rồi mới dùng.
- **Đặt tên test:** `test_FR_<MODULE>_<số>_<mô_tả_ngắn>` (ví dụ `test_FR_SLT_02_reject_occupied_slot`).
  `scripts/check-traceability.mjs` quét theo đúng mẫu này; đặt sai tên thì CI coi như FR đó chưa có test.
- **Migration chỉ được thêm, không được sửa.** Không bao giờ sửa tay một bảng do migration trước tạo
  ra, và không bao giờ sinh lại / gộp / xóa file migration đã có. Muốn đổi lược đồ: thêm một file
  migration mới chồng lên file mới nhất, rồi chạy `make reset && make migrate` trên CSDL sạch để
  chắc chắn nó áp được trước khi commit. Nếu thay đổi đó động tới thứ gì đã ghi trong
  `spec/contracts/schema.sql` hay `erd.md` thì quy tắc đóng băng ở trên vẫn áp dụng — viết ADR
  trước, được duyệt, *rồi mới* viết migration và cập nhật contract cho khớp. Agent không được tự
  chọn hay đổi công cụ migration (xem Mục 4) — quyết định đó đã chốt: **node-pg-migrate với
  migration SQL thuần** (`spec/decisions/0002-chuan-dat-ten-va-kieu-du-lieu-csdl.md`).
- **Quy tắc giới hạn phạm vi dữ liệu (BR-003, BR-012, FR-BND-05, FR-AUTH-07):** truy vấn của người
  dùng thuộc thương hiệu phải lọc qua quyền sở hữu ở `Order`/`SlotRental`, **không bao giờ** qua
  `Machine` — `Machine` không có `brand_id`, vì một máy chứa slot của nhiều thương hiệu.

  ```sql
  -- ĐÚNG
  WHERE o.brand_id = :current_brand_id

  -- SAI: cột này không tồn tại
  WHERE m.brand_id = :current_brand_id
  ```

  Thương hiệu không bao giờ được thấy danh tính, sản phẩm hay sự tồn tại của thương hiệu khác trên
  máy dùng chung (BR-012); slot không khả dụng của bên khác hiển thị là không khả dụng, không kèm
  bất kỳ chi tiết nào (FR-RPT-12).

- **Chuỗi hướng người dùng chỉ lấy từ `packages/i18n` (NFR-USA-07).** Không viết chuỗi thẳng vào
  service, controller hay component. Thêm khóa vào **cả `vi` và `en`** trong cùng commit với code
  dùng nó — bỏ bản tiếng Anh là làm đỏ `tsc`, không phải việc để sau.

  ```ts
  // ĐÚNG — khóa, kèm tham số nếu câu có chỗ giữ
  throw new AppError('NOT_FOUND', 'mch.machineNotFound');
  throw new AppError('VALIDATION_ERROR', 'mch.serialTaken', { serialNumber: input.serialNumber });

  // SAI: chuỗi viết tay thì chỉ có một ngôn ngữ, và đây là lỗi biên dịch
  throw new AppError('NOT_FOUND', 'Không tìm thấy máy');
  ```

  Ngoại lệ duy nhất là `new Error(...)` cho lỗi hướng **lập trình viên và vận hành** — thiếu biến
  môi trường lúc khởi động, vi phạm bất biến nội bộ. Những lỗi đó không bao giờ tới tay người dùng
  nên vẫn viết tiếng Việt thẳng trong mã.

- **Không viết code mới dùng phần DEPRECATED (ADR-0006).** Bảng `slot_rental_requests`, cột
  `slot_rentals.fixed_fee`, `revenue_share_percent`, `request_id` và các endpoint `/slot-rental-requests*`,
  `POST /slot-rentals` chỉ còn để không phá migration và test cũ. Hóa đơn chỉ sinh ra qua
  `POST /rental-checkouts` (hoặc gia hạn qua `POST /slot-rentals/{id}/renew`), luôn thuộc một phiên
  thanh toán; thanh toán trỏ tới phiên (`payments.rental_checkout_id`), không tới từng hóa đơn (ADR-0008).
- **Migration thêm giá trị enum** phải nằm ở file riêng, và file sau **không** được ép chuỗi thành giá
  trị enum mới (so sánh qua `::text`): node-pg-migrate chạy mọi migration đang chờ trong **một**
  transaction. Kiểm cả DB trống lẫn DB đã có lược đồ cũ (`docs/MIGRATIONS.md`).

## 4. Không bao giờ tự quyết

| Trường hợp | Lý do |
|---|---|
| Viết bất kỳ test nào trong 7 nhóm test người tự viết (idempotency webhook, cô lập mức slot, quy kết `revenue_owner`, unique constraint slot, TTL lệnh xịt, hard timeout firmware, job chuyển trạng thái hóa đơn) | Dành cho người viết, không giao agent (`spec/testing.md`) |
| Sửa một file contract đã đóng băng trong `spec/contracts/` | Cần ADR trong `spec/decisions/` và TV1 duyệt trước (`spec/contracts/README.md`) |
| Đổi hoặc gộp công cụ migration | Ảnh hưởng `make migrate` của mọi người và cả CI. Đã chốt — node-pg-migrate với SQL thuần (`spec/decisions/0002-*.md`); đổi thì cần ADR mới |
| Thêm một mã lỗi mới | `spec/errors.md` là nguồn duy nhất; agent không được tự nghĩ mã |
| Đổi hoặc thêm một ngưỡng số | `spec/constraints.md` là nguồn giá trị duy nhất |
| Cắt scope khi tiến độ căng | Đã có thứ tự cắt cố định (bỏ nhóm W, rồi nhóm S trong RPT/MNT, rồi FR-EXP-10..12, rồi nhóm S trong INV); tuyệt đối không cắt FR nhóm DSP và FR-REV-01..03 (`docs/FR_NFR_SCENTSTATION.md`, Phần D) |

## 5. Hướng dẫn theo từng persona

Các persona dưới đây khớp khối `agents` trong `harness.config.json` (cũng liệt kê ở `AGENTS.md` /
`CLAUDE.md`): Plan, Code, Review, Test, Doc, Security.

### 🗺️ Plan Agent

- Chia việc theo ranh giới `FR-<MODULE>-<số>` và trích dẫn BR mà mỗi FR truy về (`docs/FR_NFR_SCENTSTATION.md`).
- Trước khi lập kế hoạch cho một module, kiểm tra `spec/modules/<MODULE>.md` đã có AC thật chưa — 5 trong 17 module vẫn rỗng và 3 module mới có một phần (danh sách ở Mục 2); hãy lên kế hoạch viết AC thay vì bỏ qua.
- Việc SLT dựa trên luồng mua gói (ADR-0006); việc ORD, DSP, kiosk, firmware dựa trên luồng nút bấm (ADR-0007). Không lập task cho luồng "yêu cầu thuê → duyệt" đã bãi bỏ (FR mức X).
- Không bao giờ xếp một task sửa thẳng `spec/contracts/*`; xếp bước viết ADR trước.
- Khi lập kế hoạch test, đặt sẵn tên theo `test_FR_<MODULE>_<số>_<mô_tả_ngắn>` để truy vết không đứt.

### 💻 Code Agent

- Áp quy tắc giới hạn phạm vi dữ liệu (Mục 3) cho mọi truy vấn động tới dữ liệu thuộc thương hiệu — lọc qua `Order`/`SlotRental`, không bao giờ qua `Machine`.
- Không hardcode giá trị nào đã có trong `spec/constraints.md`; đọc hằng có tên từ cấu hình.
- Không viết chuỗi hướng người dùng thẳng vào mã — thêm khóa vào `packages/i18n`, cả `vi` lẫn `en`, trong cùng commit (Mục 3, NFR-USA-07).
- Chỉ dùng mã lỗi đã có trong `spec/errors.md`; nếu thật sự cần mã mới, thêm vào đó ở một bước riêng có review trước khi dùng.
- Coi `orders.brand_id`, `orders.slot_rental_id`, `orders.revenue_owner`, `orders.amount` là chỉ ghi một lần lúc tạo (`spec/contracts/README.md`, NFR-DAT-06) — không có đường cập nhật cho các cột này.
- Không bao giờ sửa file trong `spec/contracts/` từ một thay đổi code; việc đó cần quy trình ADR ở Mục 3.
- Khi task cần đổi lược đồ, thêm đúng một file migration mới — không sửa, không xóa migration cũ — và kiểm bằng `make reset && make migrate` trên CSDL sạch trước khi coi là xong.
- Webhook thanh toán đơn kiosk **không** kích hoạt xịt: tạo lệnh `CUSTOMER` chỉ khi máy không còn lệnh `CUSTOMER` hiệu lực (nếu còn, đơn giữ `PAID` — chờ lượt); `ACK` từ thiết bị nghĩa là đèn nút đã sáng; `REJECT` với `PRESS_TIMEOUT` → đơn `FORFEITED`, không đặt `needs_manual_review`; mọi mã từ chối khác sau `ACK` → `FAILED` + `needs_manual_review` (ADR-0007, `spec/contracts/mqtt.md` §5.2, §6).
- Coi các cột ảnh chụp giá trên `slot_rentals` (`duration_months` … `total_amount`, `invoice_number`) là chỉ ghi một lần, như cột ảnh chụp trên `orders` (ADR-0006, FR-SLT-33).

### 🔍 Review Agent

- Đối chiếu chuyển trạng thái với `spec/glossary.md` thật chính xác — ví dụ `Order` chỉ tới `DISPENSED` sau khi thiết bị trả kết quả thành công (FR-DSP-17), và lệnh ở `UNKNOWN` không được kích hoạt lệnh mới (FR-DSP-19).
- Xác nhận bất biến "một hóa đơn hiệu lực mỗi slot", "một lệnh hiệu lực mỗi đơn" và "một lệnh khách hàng hiệu lực mỗi máy" được cưỡng chế bằng partial unique index ở CSDL, không chỉ bằng code ứng dụng (FR-SLT-02, FR-DSP-05, FR-DSP-26, NFR-DAT-07).
- Từ chối PR cho máy xịt ngay khi nhận lệnh khách hàng (bỏ qua bước chờ bấm), PR đánh dấu kiểm tra thủ công cho đơn `FORFEITED`, hoặc PR có code mới dùng phần DEPRECATED của ADR-0006.
- Từ chối mọi PR có truy vấn hướng thương hiệu lọc qua `Machine` thay vì qua quyền sở hữu ở `Order`/`SlotRental`.
- Từ chối PR có chuỗi hướng người dùng viết thẳng tại chỗ dùng, hoặc thêm khóa vào `vi` mà quên `en`.
- Nêu cờ đỏ với mọi PR sửa file trong `spec/contracts/` mà không kèm ADR trong `spec/decisions/`.
- Yêu cầu kiểm tra xác thực lại ở các endpoint hoàn tiền, điều chỉnh tồn kho, xịt chẩn đoán, thanh lý và đổi cấu hình máy (FR-AUTH-09).

### 🧪 Test Agent

- Đặt tên mọi test sinh ra đúng dạng `test_FR_<MODULE>_<số>_<mô_tả_ngắn>`; `scripts/check-traceability.mjs` dựa vào đó để tính một FR là đã có test.
- Không sinh 7 nhóm test người tự viết liệt kê ở Mục 4 — để dành cho người và nói rõ điều đó. ADR-0006 và ADR-0007 thêm ca vào các nhóm này (giữ chỗ slot đồng thời, webhook trùng cho hóa đơn, job hủy giữ chỗ và tự kích hoạt, bấm sau khi hết thời gian chờ, reset khi đèn đang sáng) — các ca đó cũng là của người. `spec/modules/*.md` đánh dấu từng ca bằng ghi chú "agent không sinh test".
- Đặt test đúng tầng: `tests/unit/` (logic thuần), `tests/integration/` (CSDL thật, ràng buộc, tranh chấp đồng thời), `tests/contract/` (khớp `openapi.yaml`/`mqtt.md`), `tests/e2e/` (luồng đầy đủ với Device Simulator).
- Nhắm độ phủ ≥60% cho `ORD`, `DSP`, `SLT`, `EXP`, `REV`, `INV` — cổng coverage của CI (`spec/testing.md`, NFR-MTN-01).

### 📝 Doc Agent

- Khi một FR của module được hiện thực, bổ sung acceptance criteria vào `spec/modules/<MODULE>.md` theo định dạng Given/When/Then đã dùng ở `spec/modules/SLT.md` — đừng để nguyên mẫu HTML comment.
- Chỉ trích dẫn mã BR/FR/NFR có trong `docs/FR_NFR_SCENTSTATION.md`; không bịa mã không nằm trong danh mục đó.
- Năm file contract đã tồn tại và đóng băng — mô tả chúng đúng trạng thái hiện tại, và nhớ rằng `data-dictionary.md` được sinh tự động nên không sửa tay.
- Ghi mọi thay đổi contract thành một ADR mới trong `spec/decisions/`, theo mẫu `0001-mau.md`.

### 🔒 Security Agent

- Kiểm mật khẩu được băm bằng bcrypt hoặc argon2 (NFR-SEC-03) và không bao giờ lưu dữ liệu thẻ hay tài khoản ngân hàng (NFR-DAT-04).
- Kiểm mọi endpoint có phạm vi thương hiệu đều cưỡng chế cô lập mức slot và trả `FORBIDDEN_SCOPE` khi truy cập ngoài phạm vi (FR-AUTH-08, `spec/errors.md`).
- Kiểm HTTPS/TLS 1.2+ cho lưu lượng kiosk/backend/web quản trị và TLS cho MQTT (NFR-SEC-01, NFR-SEC-02), và mỗi thiết bị có credential riêng không dùng chung (NFR-SEC-07, FR-MCH-02).
- Kiểm `AuditLog` chỉ thêm mới, không có đường sửa/xóa, ở mức quyền và trigger của CSDL (FR-AUD-09, NFR-SEC-08). Backend phải kết nối bằng role `scent_app`: trigger chặn UPDATE/DELETE nhưng chỉ `REVOKE` mới chặn được `TRUNCATE`.
- Kiểm không có bí mật hay credential nào bị commit vào mã nguồn (NFR-SEC-05).

## 6. Lệnh

**Ngôn ngữ của toàn dự án là Node.js** (TypeScript), cho cả backend lẫn hai ứng dụng React và
toàn bộ script công cụ. Không dùng ngôn ngữ thứ hai: `scripts/check-traceability.mjs` trước đây
viết bằng Python nên CI phải cài thêm Python chỉ để chạy đúng một script — nay đã chuyển sang
Node. Thêm một runtime nữa vào repo là quyết định thuộc nhóm "không tự quyết" ở Mục 4.

NestJS là *framework* chạy trên Node, không phải ngôn ngữ — lựa chọn framework ghi ở
`spec/decisions/0003-to-chuc-ma-nguon.md`.

`Makefile` là cửa vào chuẩn — CI lẫn agent đều đi qua đó. Mọi target đều đã trỏ vào lệnh thật, chống
lưng bởi `package.json`.

| Lệnh | Làm gì |
|---|---|
| `make up` / `make down` / `make reset` | Hạ tầng (Postgres, Redis, Mosquitto, Adminer) |
| `make migrate` | `node-pg-migrate up` — xem `docs/MIGRATIONS.md` |
| `make seed` | `scripts/seed.ts` — 1 máy, 4 slot, 2 thương hiệu mỗi bên 2 slot |
| `make lint` | `eslint . && tsc --noEmit` |
| `make fmt` | `prettier --write .` |
| `make test` | unit + integration + contract |
| `make test-contract` | `redocly lint openapi.yaml` + `tests/contract/` |
| `make check-traceability` | `scripts/check-traceability.mjs` |
| `npm run api:dev` | Chạy API ở `http://localhost:3000/api/v1`, tự nạp lại khi sửa code |
| `npm run spec:generate` | Sinh hằng ngưỡng và mã lỗi từ `spec/constraints.md`, `spec/errors.md` — chạy sau khi sửa hai file đó |
| `npm run db:types` | Sinh kiểu Kysely từ CSDL đã migrate — chạy sau mỗi migration mới |
| `npm run contracts:generate` | Sinh kiểu TypeScript từ `openapi.yaml` — tự chạy khi `npm install` |

Công cụ migration là **node-pg-migrate với migration SQL thuần** — chọn vậy vì dự án cần 4 partial
unique index, một exclusion constraint dùng gist, `citext` và trigger append-only, không ORM nào
khai báo trực tiếp được. Quyết định ghi ở `spec/decisions/0002-*.md`; không đổi công cụ nếu không
có ADR mới (xem Mục 4).

Cần `DATABASE_URL` trong `.env` (chép từ `.env.example`). `scripts/seed.ts` cần thêm
`SEED_DEFAULT_PASSWORD` — nó từ chối chạy chứ không hardcode mật khẩu (NFR-SEC-05).

`tests/unit/` và `tests/integration/` hiện qua được nhờ `--passWithNoTests` vì chưa có test nào. Bỏ
cờ đó ngay khi test thật đầu tiên xuất hiện, nếu không cổng CI chỉ là trang trí.

## 7. Không được đụng

- `spec/contracts/*` — đóng băng sau khi đã viết; thay đổi phải qua quy trình ADR ở Mục 3.
- `AGENTS.md`, `CLAUDE.md`, `harness.config.json` — do `dev-harness` sinh ra và ghi đè lại.
- `.agents/`, `.claude/` — thư mục runtime/cấu hình của harness.
- `seed_document/` — kho lưu trữ tài liệu nguồn tuần 1, nội dung có thể đã cũ. Đọc
  `seed_document/README.md` trước khi trích dẫn bất cứ thứ gì trong đó.

## 8. Quy ước Git

Định dạng Conventional Commits (theo `AGENTS.md` / `CLAUDE.md`): `feat:`, `fix:`, `refactor:`,
`test:`, `docs:`, `chore:`. Gắn scope là mã module khi có ích.

Ví dụ:

```
feat(SLT): enforce single active rental per slot (FR-SLT-02)

Add partial unique index uq_slot_active_rental on slot_rentals(slot_id)
for status IN (ACTIVE, EXPIRING, GRACE, LIQUIDATED), per spec/contracts/README.md.
```

## 9. Quy ước ngôn ngữ

**Tài liệu miền viết bằng tiếng Việt; định danh kỹ thuật luôn tiếng Anh.**

| Loại | Ngôn ngữ | Vì sao |
|---|---|---|
| Đặc tả, tài liệu nghiệp vụ, ADR, acceptance criteria, comment trong code, commit message | **Tiếng Việt** | Nhóm và hội đồng chấm đọc tiếng Việt. Đây cũng là `language: vi` trong `harness.config.json` |
| Mã FR/BR/NFR, mã lỗi, tên hằng ngưỡng, tên bảng và cột, giá trị enum, `operationId`, tên test, tên nhánh | **Tiếng Anh**, không dấu | Là thứ code và script truy vết bám vào; phải là ASCII và ổn định |
| Nhãn giao diện và thông báo hệ thống người dùng đọc được | **Cả hai**, ở `packages/i18n` | NFR-USA-07. Khóa viết tiếng Anh không dấu theo hàng trên; giá trị viết theo từng ngôn ngữ |

Đừng dịch hàng loạt tài liệu đặc tả sang tiếng Anh. Chúng là tài liệu **yêu cầu** đã được nhóm rà
soát và là sản phẩm được chấm điểm; dịch máy móc mấy nghìn dòng có rủi ro sai lệch ngữ nghĩa ở đúng
chỗ cần chính xác nhất. Chi phí của tiếng Việt chỉ là token, không phải khả năng hiểu — thứ giúp
agent định vị là hệ mã định danh ASCII ở hàng thứ hai của bảng trên, và hệ đó đã nhất quán.

Ngoại lệ đã biết: `data-dictionary.md` có phần sinh tự động từ `COMMENT ON` nên trộn hai thứ tiếng
theo đúng nội dung comment trong `schema.sql`; `openapi.yaml` dùng khóa tiếng Anh theo chuẩn
OpenAPI nhưng phần `description` viết tiếng Việt.
