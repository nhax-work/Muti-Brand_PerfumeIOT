# Đơn kiosk, thanh toán và webhook — hướng dẫn dùng cho tuần 5

Phần việc tuần 4 của TV1 (module `apps/api/src/modules/ord/`). Tài liệu này dành cho người **dùng**
phần đó: TV4 (màn hình kiosk), TV3 (thanh toán phiên thuê slot), TV1 tuần 5 (lệnh xịt).

Contract: `spec/contracts/openapi.yaml` (tag ORD) · Quyết định: ADR-0006, ADR-0008, ADR-0009.

---

## 1. Chuẩn bị máy

```bash
# .env — hai biến mới (đã có trong .env.example)
PAYMENT_PROVIDER=mock
PAYMENT_WEBHOOK_SECRET=<chuỗi bất kỳ ở máy dev>

make migrate     # có migration mới 1790757100000 (ADR-0008) và 1790760300000 (ADR-0009)
make seed        # chạy lại để có quyền mới `order.view` (Super Admin, Operations Staff, Brand Admin)
npm run api:dev
```

Chưa đặt `PAYMENT_WEBHOOK_SECRET` thì API vẫn chạy, nhưng mọi webhook bị từ chối vì sai chữ ký.

**Giả lập khách trả tiền** — thay cho quét QR thật cho tới khi có sandbox (tuần 6):

```bash
npm run pay:mock -- ORD-20261001-7KQ2MX                  # thành công
npm run pay:mock -- ORD-20261001-7KQ2MX --status FAILED  # cổng báo thất bại
npm run pay:mock -- ORD-20261001-7KQ2MX --amount 1000    # số tiền lệch → AMOUNT_MISMATCH
npm run pay:mock -- ORD-20261001-7KQ2MX --repeat 5       # gửi lại 5 lần (Gate 3)
```

Mã tham chiếu lấy từ `order.paymentReference` (kiosk) hoặc mã `CHK-…` của payment phiên thuê slot.

---

## 2. TV4 — màn hình kiosk

| Bước | Gọi | Ghi chú |
|---|---|---|
| Danh mục | `GET /kiosk/machines/{serial}/catalog` | `available=false` thì không có tên thương hiệu, sản phẩm, giá (BR-012). `machineStatus`/`operatingMode` khác ONLINE/NORMAL → hiện `kiosk.outOfServiceTitle` |
| Điều khoản bấm nút | — | FR-ORD-25: hiện TRƯỚC khi tạo đơn, số giây lấy từ `DISPENSE_PRESS_WINDOW_SEC` |
| Tạo đơn | `POST /kiosk/orders` + header `Idempotency-Key` | Sinh **một UUID cho mỗi lần khách bấm xác nhận**, giữ nguyên khi gửi lại do mạng chập chờn: gửi lại trả 200 với đúng đơn và QR cũ, không tạo đơn thứ hai |
| Hiện QR | `qrPayload`, đếm ngược tới `order.expiresAt` | Mock trả chuỗi `SCENTSTATION-MOCK|…`; sandbox tuần 6 trả chuỗi VietQR — vẽ QR từ chuỗi, đừng phân tích nó |
| Theo dõi | `GET /kiosk/orders/{id}/status` mỗi 1 giây | `PAID` → "Đã thanh toán"; `EXPIRED` → hết hạn, về màn hình chờ; `supportReference` khác null → màn hình sự cố FR-ORD-21 |

Lỗi khi tạo đơn — hiện `message`, hoặc dịch `details.messageKey` (khóa `ord.*` trong `packages/i18n`):

| `code` | Khi nào |
|---|---|
| `MACHINE_OFFLINE` | Máy OFFLINE/UNSTABLE |
| `MACHINE_IN_MAINTENANCE` | Máy MAINTENANCE/DISABLED |
| `SLOT_UNAVAILABLE` | Slot tạm hết, chưa cấu hình sản phẩm/giá, thương hiệu bị đình chỉ |
| `MACHINE_BUSY` | Máy đang chờ khách trước bấm nút (FR-ORD-24) — "Máy đang phục vụ khách khác" |
| `VALIDATION_ERROR` | Thiếu `Idempotency-Key`, hoặc dùng lại khóa cho slot khác |

Tuần 5, khi có lệnh xịt: `status = DISPENSE_REQUESTED` + `pressDeadline` khác null → "Mời bấm nút số
`slotNumber`" kèm đếm ngược; `PAID` mà `pressDeadline` null → "Đang chờ lượt" (FR-ORD-26).

---

## 3. TV3 — thanh toán phiên thuê slot (FR-SLT-37, FR-SLT-38)

Mọi thứ import từ `modules/ord/index.ts`. `PaymentModule` là `@Global`, inject là dùng được.

### 3.1. Tạo thanh toán — `POST /rental-checkouts/{id}/payments`

```ts
import { newPaymentReference, PaymentService } from '../ord/index.js';

// Trong transaction của bạn, sau khi khóa phiên và kiểm phiên còn chờ thanh toán, chưa quá hạn:
const existing = await this.payments.findPendingIntent({ rentalCheckoutId: checkout.id }, tx);
if (existing) return existing;                                  // FR-SLT-37 AC2
const reference = newPaymentReference('CHK', now, 'Asia/Ho_Chi_Minh'); // MỖI payment một mã mới
return this.payments.createPending(
  {
    brandId: checkout.brandId,
    target: { rentalCheckoutId: checkout.id },
    reference,
    amount: checkout.totalAmount,
    currency: checkout.currency,
    expiresAt: checkout.holdExpiresAt,
    description: `ScentStation thuê slot ${reference}`,
  },
  tx,
);
```

`PaymentIntent` trả về đủ để dựng `RentalPaymentIntent` của contract (`paymentId`, `amount`,
`qrPayload`, `checkoutUrl`…). Hai yêu cầu thanh toán cùng phiên đồng thời: cái thứ hai vi phạm
`uq_checkout_payment_pending` và làm hỏng transaction — bắt lỗi `23505`, rollback, rồi gọi lại
`findPendingIntent` ngoài transaction.

### 3.2. Nhận kết quả — hiện thực `RentalCheckoutPaymentHandler`

Sửa thân hàm trong **`modules/slt/checkout-payment.handler.ts`** (đang ném lỗi "chưa hiện thực"):

```ts
export interface RentalCheckoutPaymentHandler {
  onPaymentSucceeded(
    tx: Transaction<DB>,
    event: CheckoutPaymentSucceeded,
  ): Promise<CheckoutPaymentOutcome>;
}

interface CheckoutPaymentSucceeded {
  paymentId: string;
  checkoutId: string;          // payments.rental_checkout_id
  brandId: string;
  provider: string;
  providerTransactionId: string;
  amount: string;              // đã khớp payments.amount
  currency: string;
  paidAt: Date;                // lúc cổng ghi nhận — dùng cho paid_at
  receivedAt: Date;            // clock.now()
  paymentStatusBefore: 'PENDING' | 'FAILED' | 'EXPIRED';
}

type CheckoutPaymentOutcome =
  | { kind: 'PAID' }
  | { kind: 'REFUND_PENDING'; reason: 'CHECKOUT_CANCELLED' | 'CHECKOUT_ALREADY_PAID' };
```

| Webhook (ORD) đã làm trước khi gọi bạn | Bạn làm | Bạn KHÔNG làm |
|---|---|---|
| Kiểm chữ ký; chống trùng (`uq_payment_event`) — webhook trùng không bao giờ tới handler; khóa payment; đối chiếu số tiền và loại tiền (lệch → `AMOUNT_MISMATCH` trước khi gọi) | Khóa `rental_checkouts` FOR UPDATE. Phiên đã hủy → `REFUND_PENDING / CHECKOUT_CANCELLED`. Phiên đã trả bằng payment khác → `REFUND_PENDING / CHECKOUT_ALREADY_PAID`. Còn lại: `paid_at` cho phiên và **mọi** hóa đơn, mỗi hóa đơn một `invoice_number`, thông báo FR-SLT-43 → `PAID` | Đụng `payments`/`payment_events` (webhook cập nhật sau khi bạn trả kết quả); commit/rollback; nuốt lỗi để trả `PAID` |

Ném lỗi → cả webhook rollback, cổng gửi lại sau. Quên một hóa đơn → constraint trigger §10d từ chối
lúc COMMIT. Hợp đồng đầy đủ: `modules/ord/payment/rental-checkout-payment.port.ts`.

Thử: tạo phiên → tạo payment → `npm run pay:mock -- CHK-…`.

---

## 4. TV1 tuần 5 — lệnh xịt (DSP)

| Cần | Dùng |
|---|---|
| Tạo lệnh ngay khi đơn PAID | Điểm chờ sẵn trong `OrdService.settleOrderPayment` (comment "Tuần 5 (DSP)") |
| Đổi trạng thái đơn | `OrdService.lockOrder(tx, id)` rồi `OrdService.transition(tx, change, columns)` — điểm DUY NHẤT được đổi `orders.status`, tự ghi lịch sử |
| Chặn lệnh cho đơn không hợp lệ (FR-ORD-17) | `canCreateDispenseCommand(status)` |
| Job hết hạn đơn (FR-ORD-16) | `OrdService.expireOverdueOrders()` — cần cửa vào scheduler (chưa có, `HUONG_DAN_BACKEND.md` Mục 7). Hiện đơn được chuyển EXPIRED khi kiosk poll |
| Mock payment dùng chung | Đã có (`MockPaymentGateway`, `npm run pay:mock`). Sandbox tuần 6: thêm lớp hiện thực `PaymentGateway` vào `PaymentModule` |

---

## 5. Test người tự viết — chưa có, là của TV1

Agent không sinh các test này (`spec/testing.md`):

- **Idempotency webhook** (`tests/integration/test_webhook_idempotency.ts`): 2 webhook cùng `eventId`
  gửi SONG SONG → đúng một lần chuyển PAID, cái còn lại `WEBHOOK_ALREADY_PROCESSED`; chứng minh chỗ chặn
  là `uq_payment_event` (thử bỏ `onConflict` trong `PaymentQueries.claimEvent` thì test phải đỏ). Ca
  ADR-0008: phiên nhiều hóa đơn không được cấp số hóa đơn lần hai. `npm run pay:mock -- <mã> --repeat 5`
  là phiên bản tuần tự để thử tay.
- **Quy kết `revenue_owner`** (`tests/integration/test_revenue_attribution.ts`): slot LIQUIDATED →
  PLATFORM, còn lại BRAND (FR-REV-02); tạo đơn → thanh lý → đơn cũ vẫn BRAND (FR-REV-03 AC1);
  `UPDATE orders SET revenue_owner` bị từ chối với `chk_order_snapshot_immutable` (AC2, ADR-0009).
