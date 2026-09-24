# Hướng dẫn frontend — `apps/admin-web` và `apps/kiosk`

Tài liệu này chi tiết hóa phần client của ADR-0003 (`spec/decisions/0003-to-chuc-ma-nguon.md`),
không thay đổi quyết định nào trong đó. Đọc ADR-0003 trước, rồi đọc file này trước khi viết màn
hình đầu tiên.

## 1. Stack

| Vai trò | Chọn | Ghi chú |
|---|---|---|
| Build / dev server | Vite | Mỗi app một `vite.config.ts`; `/api` được proxy sang `http://localhost:3000` |
| UI | React 19 + TypeScript strict | `tsconfig.json` của app kế thừa tsconfig gốc, đổi sang `moduleResolution: Bundler` |
| Router | React Router 7 (data router) | Route khai báo tập trung ở `src/app/router.tsx`, màn hình nạp lười |
| Server state | TanStack Query | Không dùng Redux/Zustand; state cục bộ dùng `useState`, state toàn app dùng Context nhỏ |
| HTTP | `openapi-fetch` | Kiểu suy thẳng từ `@scentstation/contracts` (sinh từ `openapi.yaml`) |
| Component admin | Ant Design 6 | Locale antd đổi theo ngôn ngữ đang chọn |
| Component kiosk | CSS Modules tự viết | Nhẹ, chữ to, vùng chạm lớn; không kéo antd vào kiosk |
| Test | Vitest + Testing Library (jsdom) | Test đặt cạnh file: `*.test.ts(x)` trong `src/` |

## 2. Cây thư mục

```
apps/admin-web/src/
  main.tsx
  app/                     # lắp ráp: provider, router, layout, guard, menu
    providers.tsx
    router.tsx
    navigation.tsx         # menu trái + vai trò được thấy
    layouts/               # AdminLayout, AuthLayout
    guards/                # RequireAuth, RequireRole
  routes/                  # MỖI MÀN HÌNH MỘT THƯ MỤC
    login/
      LoginPage.tsx        # export default — router nạp lười
      useLogin.ts          # hook riêng của màn hình
    dashboard/
    not-found/
  shared/                  # thứ dùng ở ≥ 2 màn hình
    api/                   # client, unwrap, errorMessage
    auth/                  # phiên đăng nhập, useAuth, useReauth
    i18n/                  # I18nProvider, useI18n
    config.ts              # chỗ duy nhất đọc import.meta.env
  styles/

apps/kiosk/src/
  main.tsx
  app/
    KioskShell.tsx         # đổi ngôn ngữ, tự về trang chủ, màn hình tạm ngưng
    router.tsx
    route-handle.ts        # handle.keepAwake cho màn hình không được bị reset
  screens/                 # MỖI MÀN HÌNH MỘT THƯ MỤC
    home/
    out-of-service/
  shared/
    api/                   # client, useKioskCatalog, errors
    hooks/                 # useIdleReset, useOutOfService
    i18n/
    config/                # config + constraints.generated.ts
  styles/global.css        # token giao diện kiosk
```

Một màn hình lớn dần theo khuôn:

```
routes/slot-rentals/
  SlotRentalsPage.tsx      # component trang, export default
  api.ts                   # useQuery/useMutation của màn hình này
  columns.tsx              # cột bảng antd
  components/              # component chỉ màn hình này dùng
```

## 3. Năm quy tắc

**FE1 — Màn hình là đơn vị tổ chức.** Code chỉ một màn hình dùng thì nằm trong thư mục màn hình đó.
Khi màn hình thứ hai cần tới, mới chuyển lên `shared/`. Không tạo sẵn `shared/components/` rỗng
"để dành".

**FE2 — Màn hình không import ruột màn hình khác.** `routes/a/` không import từ `routes/b/`; chỉ
import `shared/`. Giống QT3 phía server: giữ cho từng màn hình sửa hoặc xóa được mà không kéo theo
màn hình khác. Ngoại lệ: tầng `app/` được import màn hình (router, guard trả trang 404).

**FE3 — Mọi lời gọi API đi qua `shared/api`.** Dùng `api.GET/POST/...` bọc trong `unwrap(...)`;
không `fetch` tay, không tự khai báo kiểu DTO. Contract đổi thì `npm run contracts:generate` và
`tsc` chỉ ra mọi chỗ phải sửa.

```ts
const machines = await unwrap(api.GET('/machines', { params: { query: { page: 1 } } }));
```

**FE4 — Không viết chuỗi hiển thị thẳng vào component** (NFR-USA-07). Dùng `t('ns.key')` từ
`useI18n()`. Thêm khóa vào `packages/i18n/src/vi/` **và** `packages/i18n/src/en/index.ts` trong
cùng commit — thiếu bản tiếng Anh là `tsc` đỏ. Nhãn dùng chung đặt ở namespace `ui`, nhãn riêng
kiosk ở `kiosk`. Tên và mô tả sản phẩm do thương hiệu nhập thì hiển thị nguyên văn, không dịch.

**FE5 — Hiển thị trạng thái máy chủ trả về, không tự tính nghiệp vụ** (QT5). Slot mua được hay
không đọc `item.available`; trạng thái hợp đồng, đơn, lệnh xịt đọc đúng trường trạng thái. Ẩn
menu/nút theo vai trò chỉ là trải nghiệm — máy chủ mới là nơi chặn quyền và cô lập dữ liệu.

## 4. Các cơ chế đã dựng sẵn

### Lỗi API

`unwrap` ném `ApiRequestError` (`status = 0` khi không tới được máy chủ). Hiển thị bằng
`errorMessage(error, t)`, tra theo thứ tự của ADR-0003: `details.messageKey` → catalog ngôn ngữ
đang chọn → `message` của máy chủ → `common.internalError`. UI giữ đối tượng lỗi chứ không giữ
chuỗi đã dịch, nên đổi ngôn ngữ thì thông báo đang hiện cũng đổi theo.

### Đăng nhập (admin)

- Access token chỉ nằm trong bộ nhớ; refresh token ở `sessionStorage` để F5 không mất phiên. Đánh
  đổi: XSS đọc được refresh token. Contract trả token trong thân phản hồi, nên muốn dùng cookie
  httpOnly thì phải đổi contract qua ADR.
- Gặp 401, client tự refresh **một lần** rồi gọi lại. Nhiều request cùng 401 dùng chung một lần
  refresh vì backend xoay vòng refresh token (FR-AUTH-02).
- Đăng xuất xóa toàn bộ cache TanStack Query.

### Xác thực lại (FR-AUTH-09)

Hoàn tiền, điều chỉnh tồn kho, xịt chẩn đoán, thanh lý, đổi cấu hình máy:

```ts
const requestReauth = useReauth();
const reauthToken = await requestReauth(); // mở hộp nhập mật khẩu; Hủy → ReauthCancelled
await unwrap(api.POST('/orders/{id}/refund', {
  params: { path: { id }, header: { 'X-Reauth-Token': reauthToken } },
  body,
}));
```

### Phân quyền giao diện (admin)

Màn hình giới hạn vai trò bọc `<RequireRole allow={['PLATFORM_SUPER_ADMIN']}>` trong component
trang, và thêm `roles` tương ứng ở `app/navigation.tsx`.

### Kiosk

- **Tự về trang chủ** sau `KIOSK_IDLE_TIMEOUT_SEC` không thao tác (NFR-USA-02), đồng thời trả ngôn
  ngữ về mặc định cho khách sau. Màn hình thanh toán và đang xịt phải gắn
  `handle: { keepAwake: true }` trong router để không bị reset giữa chừng.
- **Màn hình tạm ngưng** (FR-IOT-13) thay toàn bộ nội dung khi không lấy được danh mục, khi máy
  không ở chế độ `NORMAL`, hoặc khi máy `OFFLINE`. Danh mục được hỏi lại theo chu kỳ
  `HEARTBEAT_INTERVAL_SEC`.
- **Cỡ chữ** mọi token tính từ `--kiosk-min-font`, gán từ `KIOSK_MIN_FONT_PX` lúc khởi động
  (NFR-USA-04). Không viết `font-size` nhỏ hơn `var(--font-body)`.
- **Số serial máy** lấy từ `?serial=` trên URL, rồi tới `VITE_MACHINE_SERIAL`.
- Ngưỡng thời gian đọc từ `shared/config/constraints.generated.ts`, sinh bởi
  `npm run spec:generate` — không sửa tay, không hardcode (spec/PROJECT.md Mục 3).

## 5. Lệnh

| Lệnh | Làm gì |
|---|---|
| `npm run admin:dev` | Web quản trị ở `http://localhost:5173` (cần `npm run api:dev`) |
| `npm run kiosk:dev` | Kiosk ở `http://localhost:5174/?serial=<số serial>` |
| `npm run test:web` | Test của hai app |
| `npm run lint` | ESLint + typecheck gốc, api và hai app |
| `npm run build -w @scentstation/admin-web` | Build bản phát hành (tương tự cho kiosk) |

## 6. Thêm một màn hình mới — checklist

1. Tạo `routes/<màn-hình>/` (admin) hoặc `screens/<màn-hình>/` (kiosk), component trang
   `export default`.
2. Khai báo route trong `app/router.tsx` bằng `lazy`.
3. Admin: thêm mục menu ở `app/navigation.tsx`; giới hạn vai trò thì bọc `RequireRole`.
4. Thêm khóa i18n vào cả `vi` và `en`.
5. Gọi API qua `shared/api` + `unwrap`; hiện lỗi bằng `errorMessage`.
6. Thao tác nhạy cảm (FR-AUTH-09) dùng `useReauth`.
7. `npm run lint && npm run test:web`.
