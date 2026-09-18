# Hướng dẫn viết module backend

Dành cho thành viên viết module nghiệp vụ trên nền đã dựng ở task Auth · RBAC · cô lập dữ liệu mức
slot. Đọc hết một lần trước khi viết module đầu tiên — mỗi mục ở đây chặn một lỗi có thật.

Quyết định kiến trúc đầy đủ ở `spec/decisions/0003-to-chuc-ma-nguon.md`. Tài liệu này là bản thực
hành của nó.

---

## 1. Chạy API ở máy mình

```bash
make up && make migrate && make seed     # lần đầu, hoặc sau khi có migration mới
npm run api:dev                          # http://localhost:3000/api/v1, tự nạp lại khi sửa code
```

API đọc `.env` ở gốc repo — cần `DATABASE_URL` và `JWT_SECRET`. Không cần khai báo 29 hằng ngưỡng:
chúng lấy thẳng từ `spec/constraints.md`.

Tài khoản mẫu do `make seed` tạo, mật khẩu là `SEED_DEFAULT_PASSWORD` trong `.env`:

| Email | Vai trò | Dùng để thử |
|---|---|---|
| `admin@scentstation.local` | Platform Super Admin | Mọi quyền |
| `ops@scentstation.local` | Operations Staff | Cảnh báo, bảo trì, xịt chẩn đoán |
| `inventory@scentstation.local` | Inventory Staff | Tồn kho, nạp |
| `admin@maison-aurore.local` | Brand Admin | Slot 1, 2 của máy M001 |
| `admin@huong-viet.local` | Brand Admin | Slot 3, 4 **cùng máy** — dùng để thử cô lập dữ liệu |

Tài khoản bị khóa vì thử sai 5 lần sẽ tự mở sau `LOGIN_LOCKOUT_MIN` phút; muốn mở ngay thì
`make reset && make migrate && make seed`.

---

## 2. Thêm một module

Thư mục đặt tên **đúng mã module in thường** — `modules/slt/`, `modules/ord/`. Không phải lựa chọn
phong cách: cổng coverage trong CI lọc theo chính chuỗi `/slt/`, `/ord/` (ADR-0003 QT1).

```
apps/api/src/modules/slt/
  slt.http.ts       # controller — mỏng: kiểm dữ liệu vào, gọi service
  slt.service.ts    # nghiệp vụ — KHÔNG biết HTTP là gì
  slt.queries.ts    # SQL của riêng module này
  slt.module.ts
  index.ts          # những gì module khác được phép gọi
```

Rồi thêm `SltModule` vào `imports` của `apps/api/src/app.module.ts`.

### Ba quy tắc không được phá

**Service không biết gì về HTTP.** Không nhận `req`, không trả `res`. Controller trích dữ liệu ra
rồi truyền xuống như tham số thường. Lý do: cùng một nghiệp vụ còn được gọi từ MQTT và scheduler, và
unit test phải khởi tạo được service mà không dựng server.

**Module gọi nhau qua `index.ts`.** Module `ord` cần hợp đồng thuê thì gọi service của `slt` qua
`modules/slt/index.ts`. Tuyệt đối không import `slt.queries.ts` từ module khác — làm vậy sáu tuần
sau không tách được gì.

**Luôn `@Inject(...)` tường minh.** Dev chạy bằng `tsx`, test chạy bằng `vitest` — cả hai dùng
esbuild, vốn không sinh metadata kiểu mà Nest dùng để tự đoán dependency. Thiếu `@Inject` thì Nest
inject `undefined` và lỗi chỉ lộ ra lúc chạy.

```ts
@Injectable()
export class SltService {
  constructor(
    @Inject(SltQueries) private readonly queries: SltQueries,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
}
```

`DATABASE`, `APP_CONFIG`, `CLOCK`, `AuditService` đã được cung cấp toàn cục — inject là dùng được.

---

## 3. Bảo vệ endpoint

**Mặc định mọi endpoint đều cần đăng nhập.** Guard toàn cục chạy trước mọi controller. Quên đánh dấu
thì endpoint bị khóa chứ không bị mở — sai theo hướng an toàn.

Import từ `modules/auth/index.ts`:

| Decorator | Khi nào |
|---|---|
| `@Public()` | Endpoint không cần đăng nhập — kiosk, webhook thanh toán |
| `@RequirePermissions('rental.manage')` | Cần quyền. Liệt kê nhiều quyền nghĩa là cần **đủ tất cả** |
| `@RequireReauth()` | Thao tác nhạy cảm — FR-AUTH-09 |
| `@CurrentUser()` | Lấy người dùng hiện tại vào tham số |
| `@CurrentBrandScope()` | Lấy phạm vi thương hiệu vào tham số — xem mục 4 |

```ts
@Controller('slot-rentals')
export class SltController {
  @Post()
  @RequirePermissions('rental.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) { ... }

  @Post(':id/liquidate')
  @RequirePermissions('rental.manage')
  @RequireReauth()
  liquidate(...) { ... }
}
```

Phân quyền dựa trên **mã quyền** trong bảng `permissions`, không dựa trên tên vai trò — vai trò là dữ
liệu, đổi được mà không đổi code. Danh sách quyền hiện có ở `scripts/seed.ts` (`PERMISSIONS`). Cần
quyền mới thì thêm vào seed và gán cho đúng vai trò.

**`@RequireReauth()` phải gắn trên đúng 9 endpoint** mà `openapi.yaml` khai báo header
`X-Reauth-Token`: hoàn tiền, điều chỉnh tồn kho, xịt chẩn đoán, thanh lý, và 5 endpoint đổi cấu hình
máy. Danh sách đầy đủ ở `spec/modules/AUTH.md` FR-AUTH-09 AC4.

---

## 4. Cô lập dữ liệu mức slot — phần quan trọng nhất

**Row-Level Security chưa bật.** Không có lưới đỡ ở CSDL. Một truy vấn quên điều kiện lọc là dữ liệu
thương hiệu này lộ sang thương hiệu khác trên cùng máy — đúng thứ BR-012 cấm.

Quy tắc: **không bao giờ tự viết `where brand_id = ...`**. Lấy phạm vi bằng `@CurrentBrandScope()`,
truyền xuống query, dựng điều kiện bằng các hàm trong `shared/scoping`:

```ts
// controller
@Get()
list(@CurrentBrandScope() scope: BrandScope) {
  return this.service.list(scope);
}

// queries
import { brandScopedOrders } from '../../shared/scoping/index.js';

listOrders(scope: BrandScope) {
  return this.db
    .selectFrom('orders')
    .selectAll()
    .where(brandScopedOrders(scope))
    .execute();
}
```

Tài khoản nền tảng nhận điều kiện luôn đúng, nên cùng một truy vấn phục vụ được cả Super Admin lẫn
Brand Admin.

### Chọn hàm nào

| Bảng | Hàm | Vì sao |
|---|---|---|
| `orders` | `brandScopedOrders(scope, 'o')` | Kèm `revenue_owner = 'BRAND'` — đơn sau thanh lý vẫn mang `brand_id` cũ nhưng thương hiệu không được thấy |
| Bảng có cột `brand_id` khác | `brandScopedByColumn(scope, 'p.brand_id')` | Ảnh chụp `brand_id` bất biến nên tự đúng theo thời gian |
| `sensor_readings`, `device_events` | `brandScopedBySlotAndTime(scope, 'sr.slot_id', 'sr.measured_at')` | Không có `brand_id`; cùng một slot phục vụ nhiều thương hiệu ở các kỳ khác nhau |
| Sơ đồ máy, cảnh báo mức máy | `brandOccupiesSlotNow(scope, 'ms.id')` | Chỉ xét hợp đồng đang hiệu lực |

**Không bao giờ lọc qua `machines`.** Bảng đó không có `brand_id` — một máy chứa slot của nhiều
thương hiệu.

### Tra theo id mà không thấy

```ts
const rental = await this.queries.findById(scope, id);
if (!rental) throw notFoundFor(user);
```

Luôn dùng `notFoundFor`, đừng tự chọn 403 hay 404. Người dùng thuộc thương hiệu phải nhận cùng một
phản hồi cho "tài nguyên của thương hiệu khác" và "không tồn tại" — khác nhau là lộ sự tồn tại
(FR-AUTH-08 AC2).

---

## 5. Lỗi, ngưỡng số, lược đồ — ba thứ sinh từ đặc tả

**Lỗi.** Chỉ ném `AppError` với mã có trong `spec/errors.md`:

```ts
throw new AppError('SLOT_OCCUPIED', 'Slot đang có hợp đồng hiệu lực');
```

Gõ một mã không có trong `errors.md` là **lỗi biên dịch** — HTTP status cũng lấy từ đó. Cần mã mới:
thêm vào `spec/errors.md` (việc cần duyệt, `spec/PROJECT.md` Mục 4), chạy `npm run spec:generate`.

**Ngưỡng số.** Không hardcode timeout, TTL, giới hạn:

```ts
const ttlSec = this.config.constraint('ORDER_PAYMENT_TTL_SEC');
```

Tên hằng cũng được kiểm kiểu. Nguồn là `spec/constraints.md`; đổi xong chạy `npm run spec:generate`.

**Lược đồ.** Kiểu của mọi bảng sinh từ CSDL đã migrate, nên `this.db.selectFrom('orders')` biết từng
cột. Thêm migration xong thì chạy `npm run db:types`. Di chuột vào một cột để xem ghi chú nghiệp vụ —
chúng lấy từ `COMMENT ON` trong `schema.sql`.

Quên chạy lệnh sinh thì `tests/contract/spec-constants.test.ts` báo đỏ trong CI.

---

## 6. Test

**Đặt tên theo mã FR** — script truy vết đếm theo đúng mẫu này:

```ts
it('test_FR_SLT_02_reject_occupied_slot', async () => { ... });
```

**Unit test khởi tạo service trực tiếp** với phụ thuộc giả, không dựng Nest, không cần CSDL. Xem mẫu
ở `tests/unit/auth.test.ts` (`FakeQueries`, `FakeClock`) và `tests/unit/usr.test.ts`. Luật phụ thuộc
thời gian thì dùng `FakeClock` và tua đồng hồ, đừng `setTimeout` chờ thật.

**Bảy nhóm test người tự viết** — agent không sinh, và đừng đặt mã FR tương ứng vào unit test của
mình, vì script truy vết sẽ tưởng FR đó đã có test: idempotency webhook, cô lập mức slot, quy kết
`revenue_owner`, unique constraint slot, TTL lệnh xịt, hard timeout firmware, job chuyển trạng thái
hợp đồng (`spec/testing.md`).

---

## 7. Những gì chưa có

| Việc | Ghi chú |
|---|---|
| Row-Level Security | Cần ADR riêng. Cho tới lúc đó mục 4 là lớp bảo vệ duy nhất |
| Thu hồi credential thiết bị (FR-AUTH-11 AC2) | Thuộc module MCH |
| Áp phạm vi LOCATION/MACHINE cho Operations Staff (FR-AUTH-12) | Ưu tiên S. `Principal.scope` đã suy ra sẵn, chưa module nào dùng |
| Cửa vào MQTT và scheduler | Đặt cạnh `entrypoints/http.ts`, gọi cùng các service |
| Giới hạn tần suất đăng nhập theo IP | Không có trong FR; khóa hiện tại theo tài khoản (FR-AUTH-03 AC4) |
