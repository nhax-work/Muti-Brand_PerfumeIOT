# Chạy thật với PayOS

Quyết định: `spec/decisions/0016-tich-hop-cong-thanh-toan-payos.md`.

**PayOS không có sandbox** — chỉ có API thật (`https://api-merchant.payos.vn`), tiền chuyển là tiền
thật. CI và test tích hợp dùng webhook mẫu ký bằng khóa test (`tests/integration/test_payos_webhook.test.ts`),
không gọi PayOS. Tài liệu này dành cho lượt chạy thật của nhóm, với **số tiền nhỏ**.

## 1. Chuẩn bị kênh thanh toán

1. Đăng nhập [my.payos.vn](https://my.payos.vn), tạo **kênh thanh toán** liên kết tài khoản ngân hàng của
   nhóm.
2. Lấy ba giá trị của kênh: **Client ID**, **API Key**, **Checksum Key**. Đây là bí mật — không commit,
   không gửi qua chat công khai (NFR-SEC-05).

## 2. Cấu hình `.env`

```env
PAYMENT_PROVIDER=payos
PAYOS_CLIENT_ID=<Client ID>
PAYOS_API_KEY=<API Key>
PAYOS_CHECKSUM_KEY=<Checksum Key>
# PayOS bắt buộc hai đường dẫn này khi tạo link; khách quét QR ở kiosk không dùng tới.
PAYOS_RETURN_URL=http://localhost:5173/rentals
PAYOS_CANCEL_URL=http://localhost:5173/rentals
# Để trống = API thật.
PAYOS_BASE_URL=
```

`PAYMENT_PROVIDER=payos` mà thiếu biến nào thì API báo lỗi ngay lúc khởi động. Muốn quay về cổng giả thì
đặt lại `PAYMENT_PROVIDER=mock` — webhook của các thanh toán PayOS đang dở vẫn xử lý được.

## 3. Mở webhook ra Internet và đăng ký với PayOS

PayOS phải gọi được `POST /api/v1/webhooks/payments/payos` từ Internet.

1. Chạy API (`npm run api:dev`), rồi mở một đường hầm tới cổng 3000, ví dụ:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
2. Trên my.payos.vn, mục cấu hình kênh thanh toán, nhập Webhook URL:
   `https://<địa-chỉ-đường-hầm>/api/v1/webhooks/payments/payos`
3. PayOS gửi một **giao dịch mẫu** để kiểm URL. Hệ thống trả `200` với `result = UNKNOWN_REFERENCE`
   (chữ ký đúng, mã đơn không có trong hệ thống — ADR-0016) nên PayOS lưu được URL.

Đường hầm đổi địa chỉ mỗi lần chạy lại thì phải đăng ký lại URL.

## 4. Lượt chạy thật

Đặt giá nhỏ để không tốn tiền: giá lượt xịt của slot thử khoảng **2.000đ**, giá thuê niêm yết của slot
thử thấp tương ứng. PayOS chỉ nhận **số tiền nguyên VND**.

| # | Việc | Kỳ vọng |
|---|---|---|
| 1 | Trên kiosk, chọn mùi, đồng ý điều khoản | Hiện mã QR VietQR; mã thanh toán trên màn vẫn dạng `ORD-…` |
| 2 | Quét QR bằng app ngân hàng | Nội dung chuyển khoản là mô tả ngắn 9 ký tự, ví dụ `ORDABC123`; số tiền điền sẵn |
| 3 | Chuyển khoản | Trong vài giây kiosk chuyển sang "Mời bấm nút số N"; đơn `PAID` |
| 4 | Chờ quá hạn đơn rồi mới quét một QR khác | App ngân hàng báo link hết hạn — PayOS từ chối nhận tiền sau `expiredAt` |
| 5 | Brand Admin: chọn slot, thanh toán phiên thuê bằng QR hoặc trang `checkoutUrl` | Phiên `paidAt`, mỗi hóa đơn có số `HD-…` |

Sau lượt chạy, kiểm CSDL:

```sql
-- Mỗi thanh toán PayOS: provider_reference là orderCode (số nguyên).
SELECT provider, provider_reference, status FROM payments WHERE provider = 'payos' ORDER BY created_at DESC LIMIT 5;

-- Không được có tài khoản người chuyển (NFR-DAT-04, ADR-0012 quy tắc 8).
SELECT count(*) FROM payment_events WHERE provider = 'payos' AND payload::text LIKE '%counterAccount%';
```

## 5. Hoàn tiền

Hệ thống **không** gọi API hoàn tiền của PayOS. Khách gặp sự cố thì quét QR sự cố trên kiosk và gửi
phiếu khiếu nại; Operations Staff chuyển khoản tay rồi ghi nhận mã giao dịch (ADR-0012). Tiền thử nghiệm
của lượt chạy trên cũng hoàn theo cách đó nếu cần.

## Chưa có

- Hủy link thanh toán khi khách hủy đơn trên kiosk (ADR-0015 mục 3).
- Tra trạng thái giao dịch ở PayOS để đối soát (FR-ORD-23).
