# ADR-0020 — Upload ảnh sản phẩm qua API, lưu trên Cloudflare R2

**Ngày:** 2026-11-02 · **Trạng thái:** đề xuất, chờ duyệt · **Người quyết:** TV1

## Bối cảnh

FR-PRD-01 yêu cầu Brand Admin tạo sản phẩm "với tên, mô tả, **hình ảnh**, tầng hương…". Hiện nay
hình ảnh chỉ là một chuỗi URL do người dùng tự dán:

| Chỗ | Hiện trạng |
|---|---|
| `fragrance_products.image_url` (`schema.sql`) | `text`, nullable |
| `Product.imageUrl`, `ProductCreate.imageUrl`, `KioskProduct.imageUrl` (`openapi.yaml`) | chuỗi, không có định dạng |
| API (`prd.http.ts`) | `z.string().url()` — phải là URL tuyệt đối |
| Web quản trị, pop-up Add/Edit product | ô nhập "Product image (URL)" |
| Kiosk (`ProductImage`) | hiện ảnh nếu có URL, không thì hiện khối trung tính |

Thương hiệu không có chỗ nào để đưa ảnh lên: họ phải tự tìm nơi lưu ảnh công khai rồi dán link.
Thực tế dữ liệu hiện tại không sản phẩm nào có ảnh, nên kiosk — màn hình bán hàng duy nhất — chỉ
hiện khối xám. Link ngoài cũng có thể hỏng, chậm, hoặc trỏ tới ảnh khác về sau mà nền tảng không
kiểm soát được.

Sơ đồ kiến trúc hệ thống (`docs/diagrams/system-architecture.drawio`) đã dự kiến cho việc này: một
adapter **Storage** (S3 API, presigned URL) nối tới **Cloudflare R2 + CDN** để lưu "product images ·
private files", và một **Worker** (BullMQ) có nhiệm vụ xử lý ảnh. Cả ba đều đang ở trạng thái
"planned"; hệ thống chưa có worker hay hàng đợi nào.

## Phương án đã cân nhắc

1. **Giữ nguyên, chỉ dán URL.** Không tốn công nhưng không giải quyết được vấn đề.
2. **Không đổi contract: trình duyệt nén ảnh rồi lưu data URL (base64) vào `imageUrl`.** Ảnh nằm
   trong CSDL, và `GET /kiosk/machines/{serial}/catalog` được kiosk gọi lại mỗi
   `HEARTBEAT_INTERVAL_SEC` (30 giây): với 5 slot × khoảng 80 KB, mỗi máy tải lại khoảng 400 KB mỗi
   30 giây mà không cache được. Ảnh cũng không được kiểm tra ở máy chủ. Trái với sơ đồ kiến trúc.
3. **Trình duyệt upload thẳng lên R2 bằng presigned URL, worker xử lý sau.** Đúng hình dung ban đầu
   của sơ đồ. Nhưng ảnh vẫn phải được máy chủ kiểm tra và mã hóa lại (mục 2 bên dưới), nên ảnh gốc
   bị truyền hai lần (trình duyệt → R2 → worker), cần thêm bước "xác nhận đã upload", cấu hình CORS
   trên bucket, và cần dựng worker + BullMQ — hiện chưa có — chỉ cho một tệp tối đa vài MB.
4. **Trình duyệt gửi ảnh cho API; API kiểm tra, mã hóa lại rồi ghi lên R2 qua S3 API; khách đọc ảnh
   qua tên miền công khai (CDN) của bucket.** **Chọn.** Ảnh đi một chiều, bucket không cần CORS, không
   phụ thuộc worker. Vẫn dùng đúng R2 và S3 API như sơ đồ; khi worker được dựng, bước mã hóa lại có
   thể chuyển sang worker mà không đổi contract. Presigned URL vẫn là cách dành cho **tệp riêng tư**
   (ví dụ giấy tờ chính hãng của lô) ở một ADR sau — không thuộc phạm vi ADR này.

## Quyết định

### 1. Contract HTTP (`openapi.yaml`, tag PRD)

Thêm hai thao tác, quyền giống `PATCH /products/{id}` (`product.manage`, phạm vi theo thương hiệu
sở hữu sản phẩm — FR-PRD-03):

| Thao tác | Mô tả |
|---|---|
| `POST /products/{id}/image` | `multipart/form-data`, một trường `file`. Trả `Product` với `imageUrl` mới. Thay ảnh cũ nếu có. |
| `DELETE /products/{id}/image` | Xóa ảnh, đặt `imageUrl = null`. Trả `Product`. |

`Product.imageUrl` và `KioskProduct.imageUrl` giữ nguyên kiểu, chỉ bổ sung mô tả: với ảnh upload, giá
trị là URL tuyệt đối trên tên miền công khai của bucket, dạng
`{MEDIA_PUBLIC_BASE_URL}/products/{tên-tệp}.webp`. `ProductCreate.imageUrl` (dùng cho cả
`POST /products` lẫn `PATCH /products/{id}`) vẫn nhận URL tuyệt đối như trước để không phá client
cũ.

### 2. Xử lý ở máy chủ

- Chỉ nhận JPEG, PNG, WebP. Kiểm tra bằng **nội dung tệp** (magic bytes), không tin `Content-Type`
  hay đuôi tên tệp. Không nhận SVG (có thể chứa script).
- Giới hạn dung lượng tệp gửi lên `PRODUCT_IMAGE_MAX_BYTES`.
- Giải mã rồi **mã hóa lại** sang WebP, cạnh dài nhất tối đa `PRODUCT_IMAGE_MAX_EDGE_PX`, bỏ toàn bộ
  metadata (EXIF, GPS). Đối tượng lưu lên R2 luôn là ảnh do máy chủ tạo, không phải tệp người dùng
  gửi.
- Khóa đối tượng: `products/{productId}-{sha256 rút gọn của nội dung}.webp`, ghi kèm
  `Content-Type: image/webp` và `Cache-Control: public, max-age=31536000, immutable`. Nội dung đổi
  thì khóa đổi, nên CDN và kiosk cache vĩnh viễn mà không bao giờ hiện ảnh cũ.
- Thay hoặc xóa ảnh: cập nhật CSDL trước, xóa đối tượng cũ sau (lỗi xóa chỉ ghi log, không làm hỏng
  thao tác). Ghi `AuditLog` như các thao tác sửa sản phẩm khác.
- Ghi lên R2 thất bại thì không đổi `imageUrl`, trả `INTERNAL_ERROR` như các lỗi hạ tầng khác.

### 3. Lưu trữ qua interface `MediaStorage`

Module PRD chỉ biết interface `MediaStorage` (`put`, `delete`, `publicUrl`). Hai bản cài đặt, chọn
bằng biến môi trường `MEDIA_STORAGE_DRIVER`:

| Driver | Dùng khi | Cấu hình |
|---|---|---|
| `r2` | Triển khai thật và demo | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `MEDIA_PUBLIC_BASE_URL` (tên miền công khai hoặc custom domain của bucket). Endpoint `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, region `auto`. |
| `local` | Máy dev không có khóa R2, test tích hợp và CI | Ghi vào thư mục `MEDIA_DIR` (trong `.gitignore`), API phục vụ tĩnh tại `/api/v1/media`; `MEDIA_PUBLIC_BASE_URL` trỏ tới đó |

Khóa R2 là bí mật: chỉ nằm trong `.env`, không commit (NFR-SEC-05). Token R2 chỉ cấp quyền đọc/ghi
đúng bucket ảnh. Thiếu biến bắt buộc của driver đang chọn thì API từ chối khởi động, giống các biến
môi trường bắt buộc khác.

### 4. Thư viện mới (`apps/api`)

`@fastify/multipart` (nhận tệp), `sharp` (giải mã, đổi kích thước, mã hóa WebP), `@aws-sdk/client-s3`
(S3 API tới R2), `@fastify/static` (chỉ cho driver `local`). `sharp` có bản dựng sẵn cho Windows,
Linux và macOS.

### 5. Ngưỡng mới (`constraints.md`, nhóm Sản phẩm)

| Hằng | Giá trị đề xuất | FR |
|---|---|---|
| `PRODUCT_IMAGE_MAX_BYTES` | 5242880 (5 MB) | FR-PRD-01 |
| `PRODUCT_IMAGE_MAX_EDGE_PX` | 1200 | FR-PRD-01 |

### 6. Mã lỗi mới (`errors.md`)

| Mã | HTTP | Khi nào |
|---|---|---|
| `FILE_TOO_LARGE` | 413 | Tệp vượt `PRODUCT_IMAGE_MAX_BYTES` |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Tệp không phải JPEG, PNG hay WebP hợp lệ |

Thiếu trường `file` vẫn là `VALIDATION_ERROR`; sản phẩm của thương hiệu khác vẫn là `NOT_FOUND`
như các endpoint sản phẩm khác.

### 7. Không đổi

`schema.sql`, `erd.md`, `data-dictionary.md`, `mqtt.md`: cột `image_url` đã đủ, không cần migration.

## Hệ quả

- **Contract:** `openapi.yaml` thêm 2 thao tác và mô tả cho `imageUrl`; `constraints.md` thêm 2 hằng;
  `errors.md` thêm 2 mã. Chạy `npm run spec:generate` và `make test-contract` sau khi sửa.
- **Module PRD:** thêm `MediaStorage` (hai driver `r2`, `local`), hai endpoint mới; đăng ký
  `@fastify/multipart` (và `@fastify/static` khi driver `local`) ở `entrypoints/http.ts`.
- **Cấu hình:** `.env.example` thêm các biến của mục 3 với giá trị giữ chỗ; mặc định
  `MEDIA_STORAGE_DRIVER=local` để máy dev chạy được ngay.
- **Hạ tầng R2 (nhóm tự làm trên Cloudflare):** tạo bucket, bật tên miền công khai (`r2.dev` hoặc
  custom domain qua CDN), tạo API token giới hạn trong bucket.
- **Web quản trị:** pop-up Add/Edit product thay ô URL bằng ô chọn ảnh có xem trước (kiểm tra loại và
  dung lượng ở trình duyệt trước khi gửi); sản phẩm mới được tạo trước rồi mới upload ảnh. Bảng
  Products hiện ảnh thu nhỏ.
- **Kiosk:** không đổi code — `ProductImage` đã dùng `imageUrl`; ảnh xuất hiện ở danh mục và chi tiết
  sản phẩm ngay khi thương hiệu upload, tải từ CDN thay vì từ API.
- **Sơ đồ kiến trúc:** khối Storage và R2 chuyển từ "planned" sang đang dùng; ghi chú rằng ảnh sản
  phẩm đi qua API, presigned URL dành cho tệp riêng tư; Worker vẫn "planned".
- **Test:** `test_FR_PRD_01_*` chạy trên driver `local`: upload hợp lệ, sai loại (gồm tệp đổi đuôi),
  quá dung lượng, ảnh được mã hóa lại và mất EXIF, thương hiệu khác không upload được vào sản phẩm
  của mình (BR-012), thay/xóa ảnh xóa đối tượng cũ. Driver `r2` có unit test với S3 client giả để
  kiểm khóa đối tượng, `Content-Type`, `Cache-Control` và URL công khai. Test web cho pop-up chọn ảnh.
- **Dữ liệu mẫu:** `scripts/seed.ts` không kèm ảnh nước hoa — ảnh thật do thương hiệu (hoặc nhóm,
  khi chuẩn bị demo) upload qua màn hình.
