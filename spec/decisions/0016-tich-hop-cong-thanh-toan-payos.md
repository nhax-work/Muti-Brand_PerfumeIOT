# ADR-0016 — Tích hợp cổng thanh toán PayOS

**Ngày:** 2026-10-14 · **Trạng thái:** đã duyệt (2026-10-14) · **Người quyết:** TV1

## Bối cảnh

Lộ trình tuần 6: "Thay mock bằng sandbox thật · xác minh chữ ký, số tiền, mã tham chiếu — cho cả đơn
kiosk và hóa đơn thuê slot". Nhóm đã chọn PayOS (ADR-0012). Đối chiếu tài liệu API chính thức của PayOS
(payos.vn/docs) với thiết kế hiện tại, có bốn chỗ không khớp:

| # | PayOS | Thiết kế hiện tại |
|---|---|---|
| 1 | `orderCode` bắt buộc là **số nguyên**; webhook chỉ trả lại `orderCode` | Mã tham chiếu dạng chữ `ORD-YYYYMMDD-XXXXXX` / `CHK-…`, lưu ở `payments.provider_reference`; COMMENT của cột ghi "đơn kiosk: bằng `orders.payment_reference`" |
| 2 | Lúc đăng ký URL webhook (`POST /confirm-webhook` hoặc trên my.payos.vn), PayOS gửi một giao dịch mẫu và chỉ lưu URL nếu nhận được 2XX | FR-ORD-14 AC3: mã tham chiếu lạ trả **404** → PayOS coi xác nhận thất bại |
| 3 | **Không có môi trường sandbox** — chỉ có `https://api-merchant.payos.vn` | Lộ trình giả định có sandbox |
| 4 | Webhook kèm `counterAccountBankId`, `counterAccountBankName`, `counterAccountName`, `counterAccountNumber` — tài khoản ngân hàng của **người chuyển** | `payment_events.payload` lưu nguyên văn dữ liệu cổng gửi — trái NFR-DAT-04 (ADR-0012 quy tắc 8) |

## Quyết định

| # | Quyết định |
|---|---|
| 1 | **`orderCode` lưu ở `payments.provider_reference`.** Cổng được trả mã tham chiếu của chính nó khi tạo thanh toán; không có thì dùng mã hệ thống như cũ (cổng mock). Mã `ORD-…` hiển thị cho khách trên kiosk giữ nguyên ở `orders.payment_reference`. `uq_payment_provider_reference` vẫn bảo đảm mỗi mã một payment. Chỉ sửa COMMENT của cột (migration riêng), không đổi lược đồ |
| 2 | **Webhook có chữ ký đúng nhưng mã tham chiếu lạ → 200**, `result = UNKNOWN_REFERENCE`, vẫn ghi `payment_events` để đối soát (FR-ORD-23), không đổi dữ liệu nghiệp vụ. Chữ ký đúng nghĩa là do cổng gửi; trả 4xx chỉ khiến cổng gửi lại hoặc từ chối URL. Chữ ký sai vẫn 401 như cũ. `openapi.yaml`: `WebhookAck.result` thêm giá trị `UNKNOWN_REFERENCE` (danh sách mã HTTP của webhook vốn chỉ có 200/400/401, không đổi); sửa FR-ORD-14 AC3 trong `spec/modules/ORD.md` |
| 3 | **Kiểm thử không có sandbox:** CI dùng webhook mẫu ký bằng khóa test và giả lập phản hồi API PayOS; nhóm tự chạy một lượt thật với kênh thanh toán của nhóm, số tiền nhỏ, theo `docs/PAYOS.md`. Cổng `mock` giữ lại cho dev, test và Integration Day |
| 4 | **Adapter PayOS bỏ các trường `counterAccount*` khỏi dữ liệu trước khi trả cho tầng webhook lưu** — hiện thực ADR-0012 quy tắc 8. Chữ ký vẫn kiểm trên dữ liệu gốc |

### Chi tiết hiện thực

| Hạng mục | Cách làm |
|---|---|
| Ký yêu cầu tạo link | HMAC-SHA256 (khóa checksum) trên `amount=…&cancelUrl=…&description=…&orderCode=…&returnUrl=…`, hex |
| Kiểm chữ ký webhook | Sắp xếp khóa của `data` theo thứ tự chữ cái; null/undefined → chuỗi rỗng; mảng, đối tượng → JSON; nối `key=value` bằng `&`; HMAC-SHA256 hex; so trong thời gian hằng |
| `orderCode` | Số nguyên dương duy nhất, nhỏ hơn 2^53: mili giây hiện tại × 1000 + số ngẫu nhiên 0–999 |
| Số tiền | PayOS chỉ nhận số nguyên VND — số tiền có phần lẻ khác 0 thì từ chối tạo thanh toán |
| Mô tả chuyển khoản | Tối đa 9 ký tự (giới hạn của tài khoản không liên kết qua PayOS): 3 ký tự đầu của mã hệ thống + 6 ký tự cuối, ví dụ `ORDABC123` |
| Hạn thanh toán | `expiredAt` = hạn đơn hoặc hạn giữ chỗ của phiên (giây Unix) — tiền không về được sau hạn (P0-3 của bản rà soát) |
| Khóa chống trùng webhook | `eventId = <orderCode>:<reference>` — `reference` là mã giao dịch ngân hàng, cùng giao dịch gửi lại thì cùng khóa |
| Trạng thái | `success = true` và `data.code = "00"` → `SUCCEEDED`; còn lại → `FAILED` |
| Thời điểm giao dịch | `transactionDateTime` (`YYYY-MM-DD HH:mm:ss`, giờ Việt Nam) đọc theo `+07:00` |
| Cấu hình | `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `PAYOS_RETURN_URL`, `PAYOS_CANCEL_URL`, `PAYOS_BASE_URL` (mặc định API thật). `PAYMENT_PROVIDER=payos` mà thiếu thì API không khởi động. Ở production, `PAYMENT_WEBHOOK_SECRET` chỉ còn bắt buộc khi cổng không phải PayOS (PayOS dùng khóa checksum) |

## Hệ quả

- **Contract:** migration `1790936400000_payos-provider-reference-comment.sql` sửa COMMENT
  `payments.provider_reference`; `schema.sql`, `data-dictionary.md` theo. `openapi.yaml`:
  `WebhookAck.result` thêm `UNKNOWN_REFERENCE`. Không đổi bảng.
- **Đặc tả:** FR-ORD-14 AC3 (`spec/modules/ORD.md`) đổi 404 → 200 `UNKNOWN_REFERENCE` khi chữ ký đúng.
- **Chưa làm trong ADR này:** hủy link khi khách hủy đơn (ADR-0015 mục 3) và tra trạng thái giao dịch
  để đối soát (FR-ORD-23) — hai lời gọi `POST /v2/payment-requests/{id}/cancel` và
  `GET /v2/payment-requests/{id}` sẽ thêm vào adapter khi hiện thực các phần đó.
- **Rủi ro:** `orderCode` sinh theo thời gian có thể trùng khi tạo hai thanh toán cùng mili giây với cùng
  số ngẫu nhiên — xác suất rất nhỏ, và `uq_payment_provider_reference` chặn ở CSDL (người dùng nhận lỗi
  và thử lại).

## Nhật ký áp dụng — 2026-10-14

| Hạng mục | Đã làm |
|---|---|
| Adapter | `apps/api/src/modules/ord/payment/payos-gateway.ts`; đăng ký trong `payment.module.ts` khi đủ cấu hình |
| Cấu hình | `PAYOS_*` trong `app-config.ts`; `.env.example` cần người thêm (file được bảo vệ) |
| Webhook | Mã tham chiếu lạ có chữ ký đúng → 200 `UNKNOWN_REFERENCE` |
| Contract | Migration `1790936400000_payos-provider-reference-comment.sql`, `schema.sql`, `data-dictionary.md`; `openapi.yaml` `WebhookAck.result` |
| Đặc tả | FR-ORD-14 AC3 trong `spec/modules/ORD.md` |
| Tài liệu | `docs/PAYOS.md` — lượt chạy thật với số tiền nhỏ |
| Test | 8 unit (`payos-gateway.test.ts`), 5 integration (`test_payos_webhook.test.ts`) cho cả đơn kiosk và phiên thuê slot |

Đã kiểm: migration chạy `up`/`down`/`up` sạch; `pg_dump --schema-only` của CSDL nạp `schema.sql` trùng
CSDL chạy hết migration.
