# ADR-0020 — Upload ảnh sản phẩm qua API, lưu ở kho tệp do API phục vụ

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

## Phương án đã cân nhắc

1. **Giữ nguyên, chỉ dán URL.** Không tốn công nhưng không giải quyết được vấn đề.
2. **Không đổi contract: trình duyệt nén ảnh rồi lưu data URL (base64) vào `imageUrl`.** Làm được
   ngay. Nhưng ảnh nằm trong CSDL, và `GET /kiosk/machines/{serial}/catalog` được kiosk gọi lại mỗi
   `HEARTBEAT_INTERVAL_SEC` (30 giây): với 5 slot × khoảng 80 KB, mỗi máy tải lại khoảng 400 KB mỗi
   30 giây mà trình duyệt không cache được. Ảnh cũng không được kiểm tra ở máy chủ.
3. **Endpoint upload; API kiểm tra, chuẩn hóa và lưu tệp vào thư mục riêng, phục vụ tĩnh.**
   `imageUrl` trỏ tới tệp đó. **Chọn.** Kiosk chỉ tải ảnh một lần rồi cache, máy chủ kiểm soát được
   định dạng và kích thước, và không cần thêm hạ tầng.
4. **Như phương án 3 nhưng lưu lên object storage (S3/MinIO) bằng presigned URL.** Hợp với triển
   khai nhiều máy chủ, nhưng thêm một dịch vụ vào `docker-compose.yml` và thêm cấu hình bí mật,
   trong khi hệ thống chạy một instance API. Phần lưu trữ ở phương án 3 được viết qua một interface
   (`MediaStorage`) để sau này đổi sang S3 mà không đổi contract.

## Quyết định

### 1. Contract HTTP (`openapi.yaml`, tag PRD)

Thêm hai thao tác, quyền giống `PATCH /products/{id}` (`product.manage`, phạm vi theo thương hiệu
sở hữu sản phẩm — FR-PRD-03):

| Thao tác | Mô tả |
|---|---|
| `POST /products/{id}/image` | `multipart/form-data`, một trường `file`. Trả `Product` với `imageUrl` mới. Thay ảnh cũ nếu có. |
| `DELETE /products/{id}/image` | Xóa ảnh, đặt `imageUrl = null`. Trả `Product`. |

`Product.imageUrl` và `KioskProduct.imageUrl` giữ nguyên kiểu, chỉ bổ sung mô tả: giá trị là
**đường dẫn tương đối** `/api/v1/media/products/{tên-tệp}` khi ảnh được upload, hoặc URL tuyệt đối
khi được nhập tay như trước. `ProductCreate.imageUrl` (dùng cho cả `POST /products` lẫn `PATCH /products/{id}`) vẫn nhận URL tuyệt đối để
không phá client cũ. Kiosk và web quản trị gọi API cùng origin (proxy `/api`), nên đường dẫn tương
đối dùng được ở cả hai mà không cần biết tên miền.

### 2. Xử lý ở máy chủ

- Chỉ nhận JPEG, PNG, WebP. Kiểm tra bằng **nội dung tệp** (magic bytes), không tin `Content-Type`
  hay đuôi tên tệp. Không nhận SVG (có thể chứa script).
- Giới hạn dung lượng tệp gửi lên `PRODUCT_IMAGE_MAX_BYTES`.
- Giải mã rồi **mã hóa lại** sang WebP, cạnh dài nhất tối đa `PRODUCT_IMAGE_MAX_EDGE_PX`, bỏ toàn bộ
  metadata (EXIF, GPS). Tệp lưu xuống luôn là ảnh do máy chủ tạo, không phải tệp người dùng gửi.
- Tên tệp: `{productId}-{sha256 rút gọn của nội dung}.webp`. Nội dung đổi thì tên đổi, nên tệp được
  phục vụ với `Cache-Control: public, max-age=31536000, immutable`.
- Thay hoặc xóa ảnh: cập nhật CSDL trước, xóa tệp cũ sau (lỗi xóa tệp chỉ ghi log, không làm hỏng
  thao tác). Ghi `AuditLog` như các thao tác sửa sản phẩm khác.
- Thư mục lưu đọc từ biến môi trường `MEDIA_DIR` (mặc định `storage/media`, có trong `.gitignore`).
  Chạy bằng Docker thì gắn volume vào thư mục này.

### 3. Thư viện mới (`apps/api`)

`@fastify/multipart` (nhận tệp), `@fastify/static` (phục vụ tĩnh), `sharp` (giải mã, đổi kích thước,
mã hóa WebP). Cả ba đều phổ biến; `sharp` có bản dựng sẵn cho Windows, Linux và macOS.

### 4. Ngưỡng mới (`constraints.md`, nhóm Sản phẩm)

| Hằng | Giá trị đề xuất | FR |
|---|---|---|
| `PRODUCT_IMAGE_MAX_BYTES` | 5242880 (5 MB) | FR-PRD-01 |
| `PRODUCT_IMAGE_MAX_EDGE_PX` | 1200 | FR-PRD-01 |

### 5. Mã lỗi mới (`errors.md`)

| Mã | HTTP | Khi nào |
|---|---|---|
| `FILE_TOO_LARGE` | 413 | Tệp vượt `PRODUCT_IMAGE_MAX_BYTES` |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Tệp không phải JPEG, PNG hay WebP hợp lệ |

Thiếu trường `file` vẫn là `VALIDATION_ERROR`; sản phẩm của thương hiệu khác vẫn là `NOT_FOUND`
như các endpoint sản phẩm khác.

### 6. Không đổi

`schema.sql`, `erd.md`, `data-dictionary.md`, `mqtt.md`: cột `image_url` đã đủ, không cần migration.

## Hệ quả

- **Contract:** `openapi.yaml` thêm 2 thao tác và mô tả cho `imageUrl`; `constraints.md` thêm 2 hằng;
  `errors.md` thêm 2 mã. Chạy `npm run spec:generate` và `make test-contract` sau khi sửa.
- **Module PRD:** thêm service lưu ảnh qua interface `MediaStorage` (bản cài đặt lưu đĩa), hai
  endpoint mới; đăng ký `@fastify/multipart` và `@fastify/static` ở `entrypoints/http.ts`.
- **Web quản trị:** pop-up Add/Edit product thay ô URL bằng ô chọn ảnh có xem trước (kiểm tra loại và
  dung lượng ở trình duyệt trước khi gửi); sản phẩm mới được tạo trước rồi mới upload ảnh. Bảng
  Products hiện ảnh thu nhỏ.
- **Kiosk:** không đổi code — `ProductImage` đã dùng `imageUrl`; ảnh xuất hiện ở danh mục và chi tiết
  sản phẩm ngay khi thương hiệu upload.
- **Test:** `test_FR_PRD_01_*` cho upload hợp lệ, sai loại (gồm tệp đổi đuôi), quá dung lượng, ảnh
  được mã hóa lại và mất EXIF, thương hiệu khác không upload được vào sản phẩm của mình (BR-012),
  thay/xóa ảnh xóa tệp cũ; test web cho pop-up chọn ảnh.
- **Dữ liệu mẫu:** `scripts/seed.ts` không kèm ảnh nước hoa — ảnh thật do thương hiệu (hoặc nhóm,
  khi chuẩn bị demo) upload qua màn hình.
