# Quy tắc giao diện chung — admin-web, kiosk, landing

> Bộ quy tắc thiết kế dùng chung cho **mọi người và mọi coding agent** sửa giao diện ScentStation:
> màu, chữ, khoảng cách, thành phần, màu trạng thái, giọng văn. Ai sửa màn nào cũng theo cùng một bộ
> này để hai phiên làm việc song song cho ra cùng một kết quả nhìn.
>
> Đọc kèm `docs/HUONG_DAN_FRONTEND.md` (cấu trúc thư mục, quy tắc FE1–FE5, gọi API, i18n). File này
> không lặp lại phần đó, chỉ chốt phần nhìn.
>
> Giá trị dưới đây lấy theo thứ đang có trong code (kiểm 2026-11-11), không đặt ra kiểu mới. Chỗ code
> còn lệch ghi ở mục 6.

## 0. Phạm vi trong giai đoạn đóng băng code

Từ 08/11 code đã đóng băng. Chỉnh giao diện được làm trong ranh giới:

- **Được:** đổi bố cục, màu, chữ, khoảng cách, thứ tự cột, nhãn, thông báo rỗng/lỗi, tách component
  hiển thị dùng chung.
- **Không:** đổi lời gọi API, thêm endpoint, đổi luồng nghiệp vụ, tự tính trạng thái phía web (FE5),
  bỏ bước xác thực lại (`useReauth`), bỏ `RequireRole`, đổi route.
- Test cạnh file phải xanh. Đổi nhãn hay cấu trúc làm test cũ đỏ thì sửa test theo, không xóa test.

## 1. Quy tắc chung cho cả ba app

### 1.1 Nguồn giá trị duy nhất

| App | Màu, font, khoảng cách, bo góc đặt ở |
|---|---|
| `apps/admin-web` | `theme.token` của `ConfigProvider` (`src/app/providers.tsx`) + biến `:root` trong `src/styles/global.css` |
| `apps/kiosk` | biến `:root` trong `src/styles/global.css` |
| `apps/landing` | biến `:root` ở đầu `styles.css` |

Component, CSS module và phần còn lại của file CSS **chỉ tham chiếu biến**, không viết mã hex, cỡ chữ
hay bóng rời. Cần giá trị mới thì thêm biến vào đúng chỗ trên, đặt tên theo vai trò (`--line`,
`--action`), không theo màu (`--gray-2`).

**Kiosk và landing dùng chung** font (Playfair Display + Be Vietnam Pro), màu đèn nút `--accent` và bộ
chuyển động `--dur` / `--ease` / `--shift`. Đổi một trong các giá trị này ở một bên thì đổi bên kia
trong cùng thay đổi. Riêng màu nền, chữ, nút và bo góc của landing theo cột ảnh trang đăng nhập web
quản trị (nền đen, góc vuông — mục 4), không theo kiosk.

### 1.2 Chữ và giọng văn

- Admin và kiosk: mọi chuỗi hiển thị qua `packages/i18n`, thêm cả `vi` và `en` cùng lúc (FE4). Khóa mới
  thêm vào **cuối** namespace (`ui` cho admin, `kiosk` cho kiosk), không sắp xếp lại khóa có sẵn — để
  hai người cùng thêm khóa không xung đột merge.
- Landing: chữ viết thẳng trong HTML (landing là trang tĩnh, không đi qua i18n). Hai bản: tiếng Việt
  `index.html` (`/`) và tiếng Anh `en/index.html` (`/en/`) — sửa nội dung một bản thì sửa bản kia trong
  cùng thay đổi.
- **Viết hoa chữ đầu câu**, không Viết Hoa Mọi Chữ. Nhãn nút là động từ: "Tạo phiếu", "Gia hạn",
  "Lưu", "Đăng ký thương hiệu" — không "OK", "Submit".
- Admin: xưng hô trung tính, không "bạn/quý khách". Kiosk và landing nói với khách: ngắn, một ý mỗi
  dòng ("Bấm nút đang sáng", "Quét mã để thanh toán").
- Không hiện cho người dùng: mã lỗi (`MACHINE_BUSY`), tên trường kỹ thuật, UUID, tên file, mã HTTP. Lỗi
  API đi qua `errorMessage(err, t)` để ra câu tiếng Việt.
- Số tiền dùng `formatVnd` (`25.000 ₫`), ngày giờ dùng `formatDateTime` — không tự định dạng. Ô không có
  dữ liệu hiện `—`.
- Tên và mô tả sản phẩm do thương hiệu nhập hiển thị nguyên văn, không dịch, không đổi hoa thường.
- Nội dung khớp nghiệp vụ hiện hành: thuê slot theo gói 3/6/12 tháng trả trước, không hoàn tiền gói
  thuê, khách **bấm nút** để nhận lượt xịt, thanh toán bằng QR PayOS. Không dùng "ăn chia doanh thu",
  "hợp đồng thuê", "xịt ngay sau thanh toán" (đã lỗi thời, `spec/PROJECT.md`).

### 1.3 Cô lập dữ liệu trên giao diện

Brand Admin không bao giờ thấy tên, sản phẩm hay sự tồn tại của thương hiệu khác (BR-012). Slot của bên
khác hiện là **"Không khả dụng"**, không kèm tên, logo, sản phẩm, giá hay tooltip. Đổi bố cục màn có
slot (Slot trống, Chi tiết máy, Slot của tôi) phải giữ nguyên quy tắc này. Landing không nêu tên hay
logo thương hiệu thật khi chưa có đồng ý.

### 1.4 Thư viện

- Admin: chỉ **Ant Design** và `@ant-design/icons`.
- Kiosk: CSS module + token, icon qua `shared/ui/Icon.tsx`.
- Landing: HTML/CSS thuần, không JavaScript, không framework, không build (hỏi đáp mở/đóng dùng
  `<details>`). Không chuyển sang React/Vite khi chưa có nhu cầu tương tác hoặc dữ liệu động.
- Không thêm thư viện UI, CSS framework, bộ icon hay font mới.

### 1.5 Định dạng file

Chỉ chạy `npx prettier --write <file đã sửa>`, không chạy cho cả thư mục (repo để `autocrlf=true`,
prettier cả thư mục sinh hàng trăm thay đổi giả). Commit theo Conventional Commits, mô tả tiếng Việt:
`fix(admin-web): …`, `feat(kiosk): …`, `fix(landing): …`.

## 2. Web quản trị (`apps/admin-web`)

### 2.1 Token

| Token | Giá trị | Dùng cho |
|---|---|---|
| Màu chính — `colorPrimary` / `--color-primary` | `#0284c7` | Nút chính, liên kết, mục menu đang chọn |
| Nền trang — `--bg-main` | `#f8fafc` | Nền vùng nội dung |
| Nền menu trái — `--sider-bg` + `SIDER_THEME` (`src/app/theme.ts`) | `#111111` | Chỉ thanh menu; than chì cùng nền landing và favicon. Đổi thì đổi cả hai chỗ, không menu và nền bên dưới lệch màu |
| Chữ chính | `#1e293b` | Thân bài |
| Chữ phụ | `Typography.Text type="secondary"` | Mô tả, chú thích — không tự đặt màu xám |
| Trực tuyến / chập chờn / ngoại tuyến | `--color-online` `#10b981` · `--color-unstable` `#f59e0b` · `--color-offline` `#94a3b8` | Chấm trạng thái kết nối máy |
| Font | Plus Jakarta Sans (nạp ở `index.html`) | Toàn bộ admin |
| Bo góc | `--radius-lg` 12px cho Card, `--radius-xl` 16px cho khối lớn; mặc định antd cho nút, ô nhập | |
| Bóng | `--shadow-sm`, `--shadow-md`, `--shadow-lg` | Không tự viết `box-shadow` |

Màu chức năng lấy từ antd: `success`, `warning`, `error`, `Typography.Text type="danger"`. Không dùng
`#1677ff` (xanh mặc định của antd, lệch với màu chính).

### 2.2 Khung một trang

Mọi trang danh sách theo một khung:

```tsx
<Space direction="vertical" size="large" style={{ width: '100%' }}>
  {/* Hàng tiêu đề: tiêu đề + mô tả bên trái, hành động chính bên phải */}
  <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
    <div>
      <Typography.Title level={3} style={{ margin: 0 }}>{t('ui.xxx')}</Typography.Title>
      <Typography.Text type="secondary">{t('ui.xxxSubtitle')}</Typography.Text>
    </div>
    <Button type="primary" icon={<PlusOutlined />}>{t('ui.xxxCreate')}</Button>
  </Space>

  {/* (Tuỳ trang) hàng KPI: Row gutter={[16, 16]} + Col + Statistic trong Card */}

  {/* Bộ lọc + bảng trong một Card */}
  <Card>
    {/* bộ lọc */}
    <Table … />
  </Card>
</Space>
```

- **Tiêu đề trang:** `Typography.Title level={3}`, luôn có, kèm một dòng mô tả `type="secondary"`.
  Tiêu đề khối con: `Card title` hoặc `level={5}`. Không dùng `level={2}` hay `level={4}`.
- **Một nút `type="primary"` mỗi khu vực.** Hành động khác là nút mặc định hoặc `type="link"`.
- Icon trên nút lấy từ `@ant-design/icons`, kiểu `Outlined`; icon đứng trước chữ.
- Trang chi tiết: nút quay lại (`ArrowLeftOutlined`, `type="text"`) bên trái tiêu đề; thông tin chính
  trong `Descriptions bordered` đặt trong Card.
- Khoảng cách giữa khối: `Space size="large"` (24px) hoặc `Row gutter={[16, 16]}`; không đặt `margin` lẻ.
- Trang có nhiều phần cùng cấp thì dùng `Tabs` trong trang, không tách thành nhiều mục menu.

### 2.3 Bảng và bộ lọc

- `Table` có `rowKey="id"`, `size="middle"`, phân trang máy chủ (`pagination` đọc `total` từ API).
- Bộ lọc nằm trên bảng, trong cùng Card, xếp ngang bằng `Space wrap`; ô tìm kiếm đứng đầu, nút "Xóa
  lọc" đứng cuối.
- Cột **tiền** canh phải, `formatVnd`. Cột **thời gian** `formatDateTime`.
- **Không hiện UUID thô.** Tên máy, slot, lô, thương hiệu, nhân viên lấy qua `useNameLookups()`
  (`shared/lookups.ts`). Mã nghiệp vụ (số hóa đơn, mã đơn) hiện nguyên, chữ đậm.
- Cột hành động ở cuối, tiêu đề trống, nút `type="link"` `size="small"`.
- Bảng rỗng: `locale={{ emptyText: t('ui.xxxEmpty') }}` với câu nói rõ vì sao rỗng ("Chưa có yêu cầu
  bổ sung nào"), không để "No data".
- Bảng nhiều cột: `scroll={{ x: 'max-content' }}`, không để tràn trang.

### 2.4 Màu trạng thái — theo nghĩa

Cùng một nghĩa thì cùng một màu ở mọi màn. Chọn theo nhóm nghĩa, không theo cảm tính:

| Nhóm nghĩa | Màu `Tag` | Ví dụ trạng thái |
|---|---|---|
| Xong, tốt, hoạt động bình thường | `green` | `DISPENSED`, `PAID` (chi trả, bồi thường), `ACTIVE`, `ONLINE`, `RESOLVED` |
| Hệ thống đang xử lý, chờ máy | `blue` | `PAID` (đơn — chờ lệnh), `DISPENSE_REQUESTED`, `CONFIRMED`, `NORMAL`, `AWAITING_STOCK` |
| Chờ **người** làm gì, sắp tới hạn | `gold` | `PENDING_PAYMENT`, `AWAITING_PAYMENT`, `EXPIRING`, `DRAINING`, `PENDING` |
| Cần chú ý, đang trong vùng rủi ro | `orange` | `GRACE`, `REFUND_PENDING`, `MAINTENANCE`, cảnh báo mức vừa |
| Lỗi, thất bại, cần can thiệp | `red` | `FAILED`, cảnh báo mức cao, cần kiểm tra thủ công |
| Kết thúc trung tính (hết hạn, hủy, đóng, nháp) | `default` | `EXPIRED`, `CANCELLED`, `ENDED`, `CLOSED`, `OFFLINE`, `DRAFT` |
| Kết thúc có chuyển tiền hoặc quyền sở hữu | `purple` | `REFUNDED`, `LIQUIDATED`, `FORFEITED` |

- Chỉ dùng bảy màu trên; không `magenta`, `cyan`, `geekblue`, `lime`, `volcano`.
- Trạng thái mới chưa có trong bảng: xếp vào nhóm nghĩa gần nhất, rồi bổ sung vào bảng này.
- Bảng màu trạng thái đặt **một chỗ** trong `shared/`; màn hình không tự khai báo `STATUS_COLOR` riêng.
- Nhãn trạng thái lấy từ i18n (`codeLabel(t, ns, code)` hoặc khóa riêng), không hiện mã tiếng Anh.

### 2.5 Biểu mẫu, hộp thoại, ngăn kéo

- **Modal** cho tạo/sửa ngắn (≤ 6 trường) và xác nhận. **Drawer** bên phải, `width={640}`, cho xem chi
  tiết một dòng hoặc biểu mẫu dài. Không lồng Modal trong Modal.
- `Form layout="vertical"`; trường bắt buộc dùng `rules={[{ required: true, message: t(…) }]}` để có
  dấu `*` tự động. Gợi ý dưới ô dùng `extra`, không viết thêm `Text` rời.
- Footer: **Hủy bên trái, nút chính bên phải**; nút chính nói rõ việc ("Tạo phiếu", "Xác nhận chi trả").
- Thao tác không hoàn tác được (thanh lý, chấm dứt, thu hồi khóa, ghi nhận chi trả): nút `danger`, hỏi
  lại bằng `Popconfirm` hoặc Modal xác nhận; FR yêu cầu xác thực lại thì qua `useReauth`.
- Thông báo kết quả: `App.useApp().message` — `message.success(…)`, `message.error(errorMessage(err, t))`.
  Không dùng `alert()`, `window.confirm()`.

### 2.6 Đang tải, rỗng, lỗi

| Tình huống | Hiển thị |
|---|---|
| Đang tải lần đầu | `Table loading` / `Card loading` / `Skeleton` — không để trang trắng |
| Đang gửi | Nút `loading`, không khóa cả trang |
| Lỗi gọi API | `Alert type="error" showIcon` trên nội dung, nội dung `errorMessage(err, t)` |
| Không có dữ liệu | `Empty` hoặc `emptyText` có câu giải thích |
| Không có quyền | Do `RequireRole` lo — màn hình không tự viết |
| Không tìm thấy | `Result status="404"` có nút quay về danh sách |

### 2.7 Kích thước màn hình

- Admin thiết kế cho **≥ 1280px**, dùng được ở 1024px (menu thu gọn).
- Trang công khai `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`,
  `/claim` mở trên điện thoại — phải dùng được ở **360px**.

### 2.8 Style viết tay

- **Không thêm `style={{…}}` có màu, cỡ chữ hay bóng.** Dùng prop antd (`type`, `strong`, `size`,
  `danger`) hoặc thêm class vào `styles/global.css`.
- `style` chỉ chấp nhận cho bố cục: `width: '100%'`, `margin: 0` trên tiêu đề, `justifyContent`.
- Class mới đặt tên theo khối: `.<khối>-<phần>` (như `.slot-bay-card`, `.kpi-card` đã có).

## 3. Kiosk (`apps/kiosk`)

Kiosk thiết kế cho màn ngang **1280×800** (hiển thị tốt tới 1920×1200), chạm bằng tay, đọc ở 60cm.

### 3.1 Token

| Nhóm | Biến | Quy tắc |
|---|---|---|
| Nền, mặt | `--bg` `#ffffff`, `--surface`, `--surface-2` `#f3f3f3` | Trắng tinh. Không nền kem, nền ấm, nền xám đậm |
| Chữ | `--text` `#111111`, `--text-muted` `#5c5c5c` | |
| Viền | `--line` | Đường kẻ, viền thẻ |
| Nút chính | `--action` `#111111` / `--on-action` `#ffffff` | Nút đen chữ trắng |
| Nhấn | `--accent` `#c9a46a`, `--accent-ink` `#7a5a28` | **Chỉ** cho thứ gắn với đèn nút vật lý: số nút, vòng sáng ở màn bấm nút. Không dùng trang trí |
| Lỗi | `--danger` | |
| QR | `--qr-fg` trên `--qr-bg` | Luôn đen trên trắng để app ngân hàng quét được |
| Lớp mờ | `--scrim` | Sau hộp xác nhận |
| Font | `--font-serif` Playfair Display (tên sản phẩm, tiêu đề) · `--font-sans` Be Vietnam Pro (còn lại) | Số luôn `lining-nums` (đã đặt ở `body`) |
| Cỡ chữ | `--fs-display` 56 · `--fs-h1` 40 · `--fs-h2` 28 · `--fs-body` 22 · `--fs-small`, `--fs-caps` = `KIOSK_MIN_FONT_PX` | Không cỡ nào nhỏ hơn `--fs-small` (NFR-USA-04) |
| Khoảng cách | `--sp-1` 8 … `--sp-10` 80, lề màn `--gutter` | Lưới 8px |
| Bo góc | `--radius` 4px | Kiosk vuông vức hơn admin, đó là chủ ý |
| Chạm | `--touch-min` 56px | Mọi thứ bấm được tối thiểu 56×56 |
| Header | `--header-h` | |
| Chuyển động | `--dur` 320ms, `--ease`, `--shift` 8px | |

Bản tối (`data-theme="dark"`) đã có sẵn token; mặc định là bản sáng. Không thêm màu ngoài bảng này.

### 3.2 Bố cục và tương tác

- **Không màn nào cuộn dọc.** Chiều cao tính theo `100dvh` trừ `--header-h`. Kiểm ở **1280×800** và
  **1024×600**.
- Không dùng hover làm trạng thái duy nhất — màn cảm ứng không có hover. Trạng thái nhấn dùng `:active`.
- **Chuyển động:** chỉ fade + dịch `--shift` trong `--dur` với `--ease`; không nảy, xoay, phóng to.
- Danh mục giữ **băng sản phẩm trôi chậm, tự lặp, vẫn vuốt được** — không đổi thành cuộn tĩnh.
- Mỗi màn một hành động chính (nút `--action`), hành động phụ là nút viền hoặc chữ.
- Không đổi luồng màn: `/`, `/catalog`, `/products/:slot`, `/checkout/:slot` dùng chung `CatalogScreen`
  để đơn đang thanh toán không mất khi đổi URL.
- Ảnh trong `docs/stitch-screens/` chỉ để tham khảo không khí; màn giỏ hàng và thanh toán NFC/POS trong
  đó **không thuộc phạm vi** (một đơn một lượt, chỉ PayOS QR).

## 4. Landing (`apps/landing`)

Trang giới thiệu tĩnh ở tên miền gốc: `index.html` (tiếng Việt, `/`) + `en/index.html` (tiếng Anh,
`/en/`) + `styles.css` + ảnh, không JavaScript, không build. Caddy phục vụ nguyên thư mục (`infra/staging/web.Dockerfile`), nên sửa file là xong, không
có bước build nào.

**Người đọc** — thương hiệu nước hoa đang cân nhắc thuê slot. Trang quảng bá việc thuê slot (lợi ích,
cách hợp tác, gói thuê, hỏi đáp cho thương hiệu); phần trải nghiệm của khách chỉ để thương hiệu hình
dung sản phẩm của mình được bán thế nào. Mọi câu chữ phải khớp nghiệp vụ hiện hành (mục 1.2): giá lượt
xịt đặt **theo sản phẩm**, nền tảng không lấy phần trăm tiền lượt xịt, thời hạn tính từ lúc lắp chai đầu
tiên. Không nêu số liệu, khách hàng hay địa điểm chưa có thật, không ghi giá gói cụ thể (giá niêm yết
theo từng slot).

**Nhận diện** — cùng ngôn ngữ với cột ảnh ở trang đăng nhập web quản trị: nền than chì trung tính
(`--bg` `#111111`, không đen tuyền, không ngả ấm), chữ trắng,
nút chính trắng chữ đen, góc vuông (`--radius: 0`), nhãn chữ in nhỏ giãn rộng có gạch dẫn (`.eyebrow`),
đường kẻ mảnh `--line` thay cho khung và bóng. Tiêu đề Playfair Display nét mảnh (400, có thể nhấn một
cụm bằng `<em>` nghiêng màu `--text-muted`), nội dung Be Vietnam Pro, đoạn dẫn nét 300. `--accent` chỉ
gắn với hình ảnh đèn nút. Ảnh máy đầu trang (`machine.webp`, đã tách nền) đặt trên quầng sáng `--halo`,
viền sáng mờ `--photo-glow`; dưới 960px ảnh xuống dưới phần chữ. Thêm riêng
`--container` 1120px (khung nội dung tối đa).

**Logo** — chữ SS lồng nhau. Trên nền tối dùng bản trắng `images/logo-mark.webp` (class `.brand-logo`,
cao 30px ở header, 24px ở footer) đứng trước chữ ScentStation; dưới 380px header chỉ giữ logo. Biểu
tượng tab trình duyệt: `favicon.ico`, `favicon-32.png`, `icon-192.png`, `apple-touch-icon.png` (chữ SS
trắng trên ô vuông bo góc màu `--bg`). Web quản trị và kiosk dùng cùng bộ favicon (trong `public/` của từng app)
và cùng logo `src/assets/logo-mark.webp`, hiển thị bằng mặt nạ CSS tô `currentColor` (class `.brand-logo`
ở admin, `styles.logo` ở kiosk) nên tự trắng trên nền tối, đen trên nền sáng.

Thanh điều hướng trải hết chiều ngang (lề `--header-pad`, không bó trong `--container`): chữ
ScentStation sát trái, nút sát phải, menu cách đều hai bên. Dưới 1180px ẩn menu.

**Thành phần** — dùng lại class có sẵn trong `styles.css`, không tạo kiểu nút mới:

| Class | Dùng cho |
|---|---|
| `.btn .btn-primary` | Nút trắng — hành động chính ("Đăng ký thương hiệu") |
| `.btn .btn-outline` | Nút viền mảnh — hành động phụ ("Xem cách hoạt động", "Đăng nhập") |
| `.btn-small` | Thêm vào nút trong header |
| `.link-quiet` | Liên kết chữ phụ ("Đăng nhập" ở header) |
| `.section-head` | Nhãn `.eyebrow` + `h2` + `.lead` mở đầu mỗi khối |
| `.features` / `.feature` | Lưới lợi ích 3 cột, ngăn bằng đường kẻ mảnh, tự đánh số 01, 02… |
| `.timeline` / `.tl-item` | Các bước theo trình tự: trục dọc ở giữa, thẻ `.tl-card` so le trái/phải, ô số `.tl-node` (bước cuối `.tl-node-lit` màu đèn nút), nhãn `.tl-tag`; dưới 760px trục sang trái |
| `.plans` / `.plan` | Thẻ gói thuê 3 · 6 · 12 tháng, kèm `.plan-notes` |

Khối nội dung mới theo khung có sẵn: `<section class="section">` (hoặc `section section-alt` cho khối
nền `--surface` xen kẽ), có `id` để menu nhảy tới và `aria-labelledby` trỏ vào tiêu đề `h2` của khối.

**Bố cục và hiệu năng**

- Dùng được từ **360px** tới màn rộng; khung `--container`, lề `--gutter`.
- Một trang, cuộn dọc; menu header nhảy tới khối bằng `#anchor`.
- Ảnh đặt trong `apps/landing/images/`, tên file chữ thường nối gạch ngang, định dạng WebP đã nén
  (dưới khoảng 200 KB), gọi bằng `/images/…` để hai bản ngôn ngữ dùng chung. Không để file gốc PNG/JPG
  dung lượng lớn trong thư mục này — Caddy phục vụ nguyên thư mục nên ai cũng tải được. Ảnh bối cảnh
  không được lộ logo hay biển hiệu thương hiệu thật (cắt hoặc làm mờ trước khi dùng). Ảnh chụp ở nơi
  sáng dùng `filter: var(--photo-tone)` để dịu lại trên nền tối.
- Ảnh có `width`/`height` và `loading="lazy"` (trừ ảnh đầu trang). Chuyển động chỉ bằng CSS, chỉ fade +
  dịch dọc, không nảy, tắt khi `prefers-reduced-motion`. Phản hồi nhỏ (hover, mở hỏi đáp) dùng `--dur` /
  `--ease` / `--shift` như kiosk. Nội dung hiện ra khi vào trang và khi cuộn tới dùng `--reveal-dur`,
  `--reveal-shift` (64px), `--reveal-stagger`; các ô cùng hàng hiện lần lượt. Riêng timeline: thẻ dịch
  ngang về phía trục, trục sáng dần xuống theo tiến độ cuộn.
  Quầng sáng sau ảnh máy ở đầu trang (`.hero-visual::before`, token `--glow`, `--glow-dur`) sáng lên
  rồi dịu xuống chậm rãi bằng độ trong suốt, đứng yên khi `prefers-reduced-motion`. Hiện dần khi cuộn dùng
  `animation-timeline: view()` bọc trong `@supports`: trình duyệt chưa hỗ trợ thì hiện nội dung ngay,
  không cần JavaScript.
- Không gọi API. Trang chỉ chứa nội dung giới thiệu và liên kết sang web quản trị.

**Truy cập** — giữ liên kết "Bỏ qua tới nội dung", một `h1` duy nhất, ảnh có `alt`, hỏi đáp dùng
`<details>`/`<summary>` để mở được bằng bàn phím, tương phản chữ đủ đọc.

**Liên kết** `/login` và `/register` trỏ sang web quản trị — không đổi đường dẫn. Tài nguyên dùng
đường dẫn tuyệt đối (`/styles.css`, `/machine.webp`) để hai bản dùng chung.

**Hai ngôn ngữ** — hai trang tĩnh có cùng cấu trúc, cùng class; chỉ khác chữ, `lang`, `id` của khối
(`#loi-ich` ↔ `#benefits`…). Chuyển ngôn ngữ bằng `.lang-switch` (VI | EN) trên header, mục đang xem có
`aria-current="page"`; mỗi trang khai báo bản kia bằng `<link rel="alternate" hreflang>`. Nút đăng ký
trên header có `.label-long` / `.label-short` ("Đăng ký" / "Register") cho màn từ 760px trở xuống.

## 5. Checklist trước khi mở PR giao diện

- [ ] Không có mã hex, cỡ chữ, bóng viết rời — chỉ tham chiếu token (mục 1.1)
- [ ] Đổi font, `--accent` hay chuyển động ở kiosk thì đã đổi theo ở landing, và ngược lại
- [ ] Admin: tiêu đề `level={3}` có mô tả, một nút primary mỗi khu vực, màu trạng thái đúng bảng 2.4
- [ ] Không UUID thô, không mã lỗi; ô rỗng `—`; tiền và ngày qua `formatVnd` / `formatDateTime`
- [ ] Có trạng thái đang tải, rỗng, lỗi
- [ ] Chuỗi mới có cả `vi` và `en`, thêm ở cuối namespace
- [ ] Kiosk: xem ở 1280×800 và 1024×600, không cuộn, chữ không nhỏ hơn `--fs-small`, vùng chạm ≥ 56px
- [ ] Trang công khai admin và landing: xem ở 360px
- [ ] Landing: chỉ dùng class nút có sẵn, không thêm JavaScript, chuyển động tắt khi `prefers-reduced-motion`
- [ ] `npm run lint && npm run test:web` xanh
- [ ] Chỉ prettier các file đã sửa
- [ ] Mô tả PR có ảnh chụp trước/sau

## 6. Chỗ code đang lệch quy tắc — sửa dần (kiểm 2026-11-11)

Việc 1–2 là nền tảng, làm trước để các thay đổi màn hình dựa vào.

1. **Admin chưa có theme antd.** `app/providers.tsx` không truyền `theme` vào `ConfigProvider`, nên nút
   chính đang là `#1677ff` trong khi CSS dùng `#0284c7`. Thêm
   `theme={{ token: { colorPrimary: '#0284c7', fontFamily: …, borderRadius: … } }}`.
2. **Bảng màu trạng thái bị chép nhiều nơi và lệch nghĩa.** Màu trạng thái máy khai báo lặp ở
   `MachinesPage.tsx`, `MachineDetailPage.tsx`, `machines/columns.tsx`; `magenta` vừa là `FORFEITED`
   (đơn) vừa là `GRACE` (hóa đơn), `red` vừa là `FAILED` vừa là `CANCELLED`, có màn dùng `cyan`,
   `geekblue`. Gom về một map trong `shared/` theo bảng 2.4.
3. **545 chỗ `style={{…}}`** trong `admin-web/src/routes/`, kèm khoảng 20 mã hex khác nhau (`#e2e8f0`,
   `#64748b`, `#888`, `#aaa`, `#1677ff`…). Sửa khi chạm vào màn đó, không cần một lần dọn hết.
4. **Tiêu đề trang admin chưa đồng nhất:** phần lớn `level={3}`, một số trang `level={2}` hoặc `4`.
5. ~~Token landing lệch kiosk~~ — không còn áp dụng: landing chuyển sang nền đen theo trang đăng nhập
   (mục 4).
