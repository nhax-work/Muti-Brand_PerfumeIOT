# ADR-0022 — Upload logo thương hiệu qua API, dùng chung kho ảnh của ADR-0020

**Ngày:** 2026-11-11 · **Trạng thái:** đề xuất · **Người quyết:** TV1

## Bối cảnh

FR-BND-06 cho Brand Admin sửa "tên hiển thị, **logo**, mô tả và thông tin liên hệ". Hiện nay logo chỉ
là một chuỗi URL do người dùng tự dán:

| Chỗ | Hiện trạng |
|---|---|
| `brands.logo_url` (`schema.sql`) | `text`, nullable |
| `Brand.logoUrl`, `BrandSelfUpdate.logoUrl` (`openapi.yaml`) | chuỗi, không có định dạng |
| Web quản trị, trang Hồ sơ thương hiệu | ô nhập "Logo (URL)" |

Đây đúng là vấn đề ADR-0020 đã giải quyết cho ảnh sản phẩm: thương hiệu không có chỗ để đưa ảnh lên,
phải tự tìm nơi lưu ảnh công khai rồi dán link; link ngoài có thể hỏng, chậm, hoặc đổi nội dung mà nền
tảng không kiểm soát được. Trong khi đó, sau ADR-0020 hệ thống đã có sẵn kho ảnh (`MediaStorage`, R2
hoặc thư mục local), bước kiểm tra và mã hóa lại ảnh, và mã lỗi cho tệp sai loại hoặc quá cỡ. Khi thử
luồng Brand Admin trên staging (2026-11-11), ô URL này là chỗ người dùng thấy "lạc" nhất so với ô chọn
ảnh của sản phẩm ngay bên cạnh.

Việc này **thêm endpoint trong giai đoạn đóng băng code** (từ 08/11, `docs/QUY_TAC_GIAO_DIEN.md` mục
0), nên cần ADR này được duyệt trước khi merge.

## Phương án đã cân nhắc

1. **Giữ ô URL, chỉ thêm xem trước.** Không đổi contract, nhưng không giải quyết được việc thương hiệu
   không có chỗ lưu ảnh.
2. **Dùng lại `POST /products/{id}/image` bằng một "sản phẩm giả" chứa logo.** Không đổi contract nhưng
   sai mô hình dữ liệu, sản phẩm giả lọt vào danh mục và kiosk.
3. **Thêm `POST/DELETE /brands/me/logo`, xử lý giống hệt ảnh sản phẩm.** **Chọn.** Không cần
   migration, không thêm thư viện hay hạ tầng; phần lớn code là dùng lại của ADR-0020.

## Quyết định

### 1. Contract HTTP (`openapi.yaml`, tag BND)

Cùng điều kiện như `PATCH /brands/me`: chỉ tài khoản thuộc một thương hiệu, thao tác trên thương hiệu
của chính mình (tài khoản nền tảng nhận `FORBIDDEN_SCOPE`, `bnd.brandAccountOnly`).

| Thao tác | Mô tả |
|---|---|
| `POST /brands/me/logo` | `multipart/form-data`, một trường `file`. Trả `Brand` với `logoUrl` mới. Thay logo cũ nếu có. |
| `DELETE /brands/me/logo` | Xóa logo, đặt `logoUrl = null`. Trả `Brand`. |

`Brand.logoUrl` giữ nguyên kiểu, bổ sung mô tả: với logo upload, giá trị là URL tuyệt đối dạng
`{MEDIA_PUBLIC_BASE_URL}/brands/{tên-tệp}.webp`. `BrandSelfUpdate.logoUrl` vẫn nhận URL như trước để
không phá client cũ; web quản trị thôi gửi trường này.

### 2. Xử lý ở máy chủ

Giống ADR-0020 mục 2, chỉ khác ngưỡng và khóa đối tượng:

- Chỉ nhận JPEG, PNG, WebP, kiểm theo nội dung tệp; không nhận SVG.
- Giới hạn dung lượng `BRAND_LOGO_MAX_BYTES`; mã hóa lại sang WebP, cạnh dài nhất tối đa
  `BRAND_LOGO_MAX_EDGE_PX`, bỏ toàn bộ metadata. Không cắt khung: logo giữ nguyên tỉ lệ, chỗ hiển thị
  tự căn.
- Khóa đối tượng `brands/{brandId}-{sha256 rút gọn}.webp`, `Cache-Control` immutable như ảnh sản phẩm.
- Ghi lên kho trước, cập nhật CSDL sau, xóa logo cũ cuối cùng (lỗi xóa chỉ ghi log). Ghi `AuditLog`
  `bnd.brand.logo_updated` / `bnd.brand.logo_removed`.

Phần kiểm tra và mã hóa lại ảnh, và phần đọc tệp multipart, được tách khỏi module PRD thành hàm dùng
chung (`adapters/media`, `shared/http`) để hai module cùng gọi, không chép code.

### 3. Ngưỡng mới (`constraints.md`, nhóm Thương hiệu)

| Hằng | Giá trị đề xuất | FR |
|---|---|---|
| `BRAND_LOGO_MAX_BYTES` | 2097152 (2 MB) | FR-BND-06 |
| `BRAND_LOGO_MAX_EDGE_PX` | 512 | FR-BND-06 |

Logo hiển thị nhỏ (ảnh đại diện, thẻ thương hiệu), nên ngưỡng thấp hơn ảnh sản phẩm.

### 4. Mã lỗi

Không thêm mã. Dùng lại `FILE_TOO_LARGE` (413) và `UNSUPPORTED_MEDIA_TYPE` (415) của ADR-0020; mô tả
trong `errors.md` sửa thành "vượt ngưỡng dung lượng của loại ảnh tương ứng" và chuyển hai mã sang nhóm
chung "Tệp ảnh". Thiếu trường `file` vẫn là `VALIDATION_ERROR`.

### 5. Không đổi

`schema.sql`, `erd.md`, `data-dictionary.md`, `mqtt.md`: cột `logo_url` đã đủ, không cần migration.
Kiosk chưa hiển thị logo thương hiệu; ADR này không thêm chỗ hiển thị mới.

## Hệ quả

- **Contract:** `openapi.yaml` thêm 2 thao tác và mô tả cho `logoUrl`; `constraints.md` thêm 2 hằng;
  `errors.md` sửa mô tả 2 mã. Chạy `npm run spec:generate` và `make test-contract` sau khi sửa.
- **API:** module BND thêm `BrandLogoService` và 2 endpoint; module PRD chuyển sang hàm dùng chung,
  hành vi không đổi.
- **Web quản trị:** trang Hồ sơ thương hiệu thay ô URL bằng ô chọn ảnh có xem trước (kiểm tra loại và
  dung lượng ở trình duyệt); bấm Lưu thì lưu thông tin trước rồi upload hoặc xóa logo.
- **Test:** `test_FR_BND_06_*` chạy trên driver `local`: upload hợp lệ, sai loại (gồm tệp đổi đuôi),
  quá dung lượng, xóa logo, tài khoản nền tảng không gọi được. Test web cho ô chọn logo.
