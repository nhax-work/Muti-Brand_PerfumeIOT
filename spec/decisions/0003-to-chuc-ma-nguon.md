# ADR-0003 — Tổ chức mã nguồn: modular monolith cắt theo mã module, một repo nhiều ứng dụng

**Ngày:** 2026-09-17 · **Trạng thái:** đã duyệt · **Người quyết:** TV1

## Bối cảnh

Repo hiện chưa có thư mục `src/`. Trước khi viết dòng code nghiệp vụ đầu tiên cần chốt cách tổ chức,
vì cả nhóm sẽ code theo đó suốt 10 tuần còn lại và đổi cấu trúc giữa chừng đắt hơn nhiều so với
chọn đúng từ đầu.

Bốn dữ kiện định hình quyết định này:

**1. Hệ thống có ba cửa vào khác nhau cùng gọi một tập nghiệp vụ.**

| Cửa vào | Ví dụ |
|---|---|
| HTTP | kiosk tạo đơn, web quản trị duyệt hợp đồng, webhook thanh toán |
| MQTT | heartbeat, telemetry, sự kiện thiết bị, xác nhận và kết quả lệnh xịt |
| Bộ lập lịch | DRAFT→ACTIVE đúng ngày (FR-SLT-24), đơn quá hạn thanh toán (FR-ORD-16), lệnh quá `DISPENSE_RESULT_TIMEOUT_SEC` chuyển UNKNOWN (FR-DSP-18), cảnh báo lô sắp hết hạn (FR-INV-20) |

Cùng một quy tắc nghiệp vụ bị gọi từ nhiều hướng. Nếu nghiệp vụ nằm lẫn trong tầng HTTP thì MQTT và
scheduler buộc phải sao chép lại, và hai bản sao sẽ lệch nhau.

**2. Có ba ứng dụng, dùng chung một contract API.** Backend, web quản trị (NFR-USA-06, NFR-SEC-01)
và ứng dụng kiosk. Cả ba tiêu thụ cùng `spec/contracts/openapi.yaml` — file đã đóng băng.

**3. Repo đã có sẵn hai ràng buộc cứng về đường dẫn**, xuất hiện trước khi có ADR này:

- `scripts/check-coverage.mjs` lọc coverage bằng `path.toLowerCase().includes('/' + mod + '/')` với
  `CORE = ['ord','dsp','slt','exp','rev','inv']`. Cổng coverage NFR-MTN-01 **chỉ chạy được** nếu mã
  nguồn nằm trong thư mục đặt tên đúng mã module in thường.
- `scripts/check_traceability.py` quét `ROOT / "tests"`. Thư mục `tests/` phải ở gốc repo.

**4. Truy vết `FR-<MODULE>-<số>` là cơ chế nghiệm thu của dự án.** 264 FR chia theo 17 mã module;
tên test bám mã module; cổng coverage đo theo module.

## Phương án đã cân nhắc

**1. Chia theo loại file** — `controllers/`, `services/`, `models/`, `routes/`. Đây là bố cục mặc
định trong phần lớn tài liệu hướng dẫn Node. Với 17 module và 264 FR, mỗi tính năng nằm rải ở bốn
thư mục, và cổng coverage theo module không hoạt động vì không có thư mục nào tên `ord/`.

**2. Ports & adapters đầy đủ** (Clean/Hexagonal) — domain ở lõi, hạ tầng ở vành ngoài, đảo phụ thuộc
toàn bộ. Giá trị chính của mô hình này là thay được hạ tầng mà domain không biết. Dự án không có
kịch bản đó: `schema.sql` đã đóng băng, PostgreSQL cố định, đổi phải qua ADR, và ADR-0002 đã chốt
không dùng ORM — nên `IRepository` để trừu tượng hóa ORM là trừu tượng hóa một thứ không tồn tại.
Chi phí là gấp ba bốn lần số file và làm đứt liên kết trực tiếp FR → thư mục.

**3. Modular monolith cắt dọc theo mã module** — mỗi module một thư mục tự chứa cửa vào, nghiệp vụ
và truy vấn của riêng nó.

**4. Tách client và server thành hai repo** — loại. Hai repo nghĩa là kiểu dữ liệu sinh từ
`openapi.yaml` phải publish thành package hoặc chép tay giữa hai nơi, và chúng sẽ lệch. Đó đúng là
thất bại mà cơ chế đóng băng contract sinh ra để chặn. Ngoài ra job `contract` và job `spec` trong
CI (chặn PR sửa contract không kèm ADR) sẽ không phủ được repo client.

## Quyết định

Chọn **phương án 3**, trong **một repo** theo npm workspaces.

### Bố cục

```
apps/
  api/
    src/
      modules/<mã module>/         # ord, slt, inv, dsp, auth, alr, ...
        <mod>.http.ts              # cửa vào HTTP
        <mod>.mqtt.ts              # cửa vào MQTT (nếu module có)
        <mod>.jobs.ts              # cửa vào scheduler (nếu module có)
        <mod>.service.ts           # nghiệp vụ
        <mod>.queries.ts           # SQL của riêng module
        index.ts                   # mặt tiền module khác được phép gọi
      shared/scoping/              # chốt chặn cô lập dữ liệu
      shared/audit/                # AuditLog + mã tương quan
      shared/errors/               # theo spec/errors.md
      shared/config/               # theo spec/constraints.md
      adapters/payment/            # port + hiện thực theo nhà cung cấp
      adapters/mqtt/               # client, ký lệnh, khử trùng sự kiện
      entrypoints/http.ts | mqtt.ts | scheduler.ts
  admin-web/src/routes/<màn hình>/
  kiosk/src/screens/<màn hình>/
packages/
  contracts/                       # kiểu sinh từ openapi.yaml, dùng chung 3 app
spec/  migrations/  tests/  scripts/   # giữ nguyên ở gốc repo
```

### Năm quy tắc bắt buộc

**QT1 — Tên thư mục module là mã module in thường.** `modules/ord/`, `modules/slt/`… Không phải lựa
chọn phong cách: cổng coverage NFR-MTN-01 lọc theo chính chuỗi này.

**QT2 — Tầng nghiệp vụ không biết gì về cửa vào.** `*.service.ts` không nhận `req`, không trả `res`,
không đụng MQTT client, không đọc biến môi trường trực tiếp. Ba cửa vào chỉ dịch dữ liệu rồi gọi
service. Đây là điều kiện để cùng một quy tắc chạy đúng cho cả ba hướng, và là điều kiện để
`tests/unit/` kiểm được logic thuần theo phân tầng của `spec/testing.md`.

**QT3 — Module gọi nhau qua `index.ts`, không chạm ruột nhau.** Module A gọi **service** của B qua
mặt tiền `index.ts` của B; tuyệt đối không import `b.queries.ts`. Đây là thứ giữ cho các module còn
tách được về sau; bỏ qua nó thì sáu tuần nữa mọi thứ dính chùm.

**QT4 — Cô lập dữ liệu đi qua đúng một chốt chặn.** Mọi truy vấn trả dữ liệu thuộc thương hiệu phải
lấy điều kiện lọc từ một hàm duy nhất trong `shared/scoping/`, nhận người dùng hiện tại và trả về
mệnh đề đã nối qua `orders`/`slot_rentals`, kèm `revenue_owner = BRAND` và giới hạn kỳ hạn hợp đồng
(FR-AUTH-07). Handler không được tự viết điều kiện `brand_id`.

Lý do phải là một chốt: NFR-SEC-04 đòi 100% endpoint có dữ liệu thương hiệu vượt test truy cập chéo,
mà Row-Level Security chưa bật (ADR-0002, `schema.sql` §12) — không có lưới đỡ ở tầng CSDL. Một chốt
thì test kiểm một hàm; rải rác thì phải kiểm từng endpoint và sẽ sót.

**QT5 — Client hiển thị trạng thái server trả về, không tự tính lại nghiệp vụ.** Ví dụ điều kiện slot
khả dụng là bốn điều kiện đồng thời (FR-MCH-16); client tự suy sẽ lệch âm thầm. Vì vậy
`KioskCatalogItem` trong `openapi.yaml` đã có sẵn trường `available`.

### Tiêu chí cắt hai bên khác nhau — có chủ ý

| | Cắt theo | Vì sao |
|---|---|---|
| Server | Mã module nghiệp vụ | FR đánh mã theo module; truy vết và coverage đo theo module |
| Client | Màn hình / luồng người dùng | Một màn hình chạm nhiều module — "chi tiết máy" hiển thị MCH + ALR + MNT + IOT cùng lúc |

Kiosk và web quản trị là **hai ứng dụng riêng**, không phải hai route của cùng một SPA: kiosk có
ràng buộc khác hẳn (NFR-PER-01 phản hồi ≤500ms, NFR-USA-02 idle 60s, NFR-USA-04 cỡ chữ ≥18px,
FR-IOT-13 hiển thị tạm ngưng khi mất kết nối).

### Ba chỗ có seam, và chỉ ba

1. **Adapter thanh toán** — NFR-SCA-03 ghi nguyên văn "thêm nhà cung cấp thanh toán mới bằng cách
   hiện thực một adapter, không sửa logic đơn hàng". Đây là port/adapter có tiêu chí nghiệm thu.
2. **Adapter MQTT** — thiết bị nằm ngoài ranh giới hệ thống. Module DSP/IOT gọi adapter, không gọi
   thẳng MQTT client.
3. **Chốt chặn cô lập dữ liệu** — QT4.

Ngoài ba chỗ này, không dựng thêm lớp trừu tượng. Cụ thể: **không** tạo lớp repository chỉ bọc SQL
1-1 mà không thêm ràng buộc phạm vi.

### Chiều sinh contract: contract-first

`openapi.yaml` là nguồn. Sinh **kiểu TypeScript từ nó** cho cả ba ứng dụng. **Không** sinh
`openapi.yaml` từ decorator trong code.

NFR-MTN-04 viết "tài liệu OpenAPI sinh tự động và luôn đồng bộ với mã nguồn". Yêu cầu này ngược
chiều với việc `openapi.yaml` là contract viết tay đã đóng băng — nếu sinh từ code sẽ có hai file
OpenAPI và chúng lệch nhau. **Diễn giải chốt tại ADR này:** "đồng bộ" nghĩa là *được contract test
chứng minh là đồng bộ*, thực thi bằng `tests/contract/` và job `contract` trong CI, chứ không phải
sinh ngược từ mã nguồn.

### Lựa chọn thư viện

| Vai trò | Chọn | Lý do |
|---|---|---|
| Framework server | NestJS | Module system ánh xạ thẳng 17 mã module; Guard cho RBAC và chốt chặn phạm vi (QT4); Interceptor cho AuditLog và mã tương quan (NFR-MTN-02). Không dùng `@nestjs/swagger` làm nguồn contract. |
| Truy cập dữ liệu | Kysely | SQL-first, type-safe, sinh kiểu từ lược đồ đã migrate. Nhất quán với ADR-0002. |
| Sinh kiểu API | `openapi-typescript` | Từ `openapi.yaml` vào `packages/contracts` |
| Quản lý workspace | npm workspaces | Đủ cho 3 ứng dụng; chưa cần Nx hay Turborepo |

**Không dùng Prisma hay TypeORM** — chúng muốn làm nguồn sự thật của lược đồ, sẽ xung đột với
`schema.sql` đang đóng băng.

## Hệ quả

**File cấu hình phải sửa khi dựng khung:**

- `tsconfig.json` — `include` hiện là `src/**/*.ts`, `scripts/**/*.ts`, `tests/**/*.ts`
- `package.json` — thêm `workspaces`; `dev` hiện trỏ `src/main.ts`
- `.github/workflows/ci.yml` — job `lint` và `test` chạy từ gốc, cần kiểm lại với workspaces
- `scripts/seed.ts` và `scripts/gen-data-dictionary.ts` — giữ ở `scripts/` hay chuyển vào `apps/api`,
  quyết khi dựng khung (lưu ý `make seed` và `make migrate` đang trỏ vào `scripts/`)

**NFR liên quan:** NFR-MTN-01 (coverage theo module), NFR-MTN-02 (log có mã tương quan),
NFR-MTN-04 (diễn giải lại như trên), NFR-SCA-03 (adapter thanh toán), NFR-SEC-04 (cô lập dữ liệu).

**Khả năng tách về sau.** Vì QT2 và QT3, muốn tách bộ nhận MQTT hoặc scheduler thành tiến trình
riêng thì chỉ đổi file trong `entrypoints/`, không viết lại nghiệp vụ. Đây là toàn bộ khả năng mở
rộng mà đồ án cần; không dựng thêm hạ tầng cho nó từ bây giờ.

**Không thuộc phạm vi ADR này:**

- Bật Row-Level Security — cần ADR riêng (ADR-0002 đã ghi nhận là nợ kỹ thuật). Cho tới lúc đó, QT4
  là lớp bảo vệ duy nhất cho NFR-SEC-04.
- `scripts/check_traceability.py` hiện chỉ quét `tests/**/*.py` trong khi stack là TypeScript, nên
  không đếm được test nào; `spec/testing.md` cũng liệt kê 7 test người tự viết dưới đuôi `.py`. Đây
  là tàn dư từ giai đoạn chưa chốt ngôn ngữ, sửa ở một thay đổi riêng — không cần ADR vì không chạm
  contract đóng băng.
