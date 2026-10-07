# ADR-0010 — Bỏ quy định "test người tự viết": agent được viết cả bảy nhóm test trọng yếu

**Ngày:** 2026-10-07 · **Trạng thái:** đã duyệt · **Người quyết:** TV1

## Bối cảnh

Từ tuần 1, `spec/testing.md` và `spec/PROJECT.md` Mục 4 dành riêng bảy nhóm test cho người viết,
cấm agent sinh: idempotency webhook, cô lập mức slot, quy kết `revenue_owner`, unique constraint
slot, TTL lệnh xịt, hard timeout firmware, job chuyển trạng thái hóa đơn. ADR-0006, ADR-0007 và
ADR-0008 tiếp tục thêm ca vào các nhóm đó.

Tới tuần 5, quy định này gây ra hai vấn đề thật:

1. **Test không được viết.** Rà soát tuần 5 của TV1 cho thấy `tests/e2e/` vẫn trống,
   `test_webhook_idempotency` và `test_command_ttl` chưa có. Trong khi đó Gate 3 lại cần đúng các
   test này: webhook gửi lại 5 lần chỉ tạo 1 lệnh, không bấm thì `FORFEITED`. Code đã chạy nhưng các
   bất biến quan trọng nhất của hệ thống lại không có test nào chứng minh.
2. **Agent phải lách.** Unit test và integration test do agent viết đều phải ghi chú "KHÔNG có ở
   đây — thuộc nhóm người tự viết", và tránh dùng mã FR của các nhóm đó. Vì vậy `scripts/check-traceability.mjs`
   báo FR chưa có test, dù code đã hiện thực xong.

Mục đích ban đầu của quy định là để những bất biến dễ sai nhất được người hiểu nghiệp vụ kiểm. Cổng
CI "Review — mọi PR có người duyệt, kể cả PR do AI sinh" (`spec/testing.md`) đã đạt đúng mục đích
đó. Không cần thêm điều kiện "người phải tự gõ test".

## Phương án đã cân nhắc

1. **Giữ nguyên.** Bảy nhóm tiếp tục trống tới khi có người rảnh. Gate 3 không có bằng chứng tự động.
2. **Agent viết, người duyệt.** Bỏ lệnh cấm. Bảy nhóm vẫn là "nhóm test trọng yếu": PR thêm hoặc sửa
   test thuộc nhóm này phải được người review riêng phần test, đối chiếu với AC.
3. **Agent viết bản nháp ở thư mục riêng, người chép sang.** Thêm một bước thủ công mà không thêm
   kiểm soát nào so với phương án 2.

## Quyết định

Chọn **phương án 2**.

- Agent **được** viết và sửa test của cả bảy nhóm. Các nhóm này đổi tên thành **nhóm test trọng
  yếu**.
- Test trọng yếu đặt tên theo quy ước chung `test_FR_<MODULE>_<số>_<mô_tả_ngắn>` và mang đúng mã FR
  của ca mình chứng minh, để `check-traceability` đếm được.
- PR thêm hoặc sửa test trọng yếu phải có người review riêng phần test: assert có đúng AC không, có
  thực sự đi qua ràng buộc CSDL hay luồng thật không. Không được để test xanh nhờ mock bỏ qua chính
  cơ chế cần chứng minh.
- "Hard timeout firmware" vẫn kiểm trên phần cứng thật và ghi vào Test Report. Nhóm này không tự
  động hóa được, bất kể ai viết.

## Hệ quả

- Sửa `spec/testing.md`, `spec/PROJECT.md` (Mục 2, 4, 5), `docs/HUONG_DAN_BACKEND.md`,
  `docs/THANH_TOAN_WEBHOOK.md`, cùng các ghi chú "agent không sinh test" trong `spec/modules/AUTH.md`,
  `BND.md`, `DSP.md`, `SLT.md`.
- `spec/contracts/mqtt.md` §11 có câu "`tests/e2e/test_command_ttl.ts` là test người tự viết, agent
  không sinh". Câu này nằm ở phần hướng dẫn kiểm thử, không phải giao diện thiết bị ↔ nền tảng, nên
  được cập nhật theo ADR này. Không có topic, trường hay mã lỗi nào thay đổi.
- Các ADR cũ (0005–0009) giữ nguyên câu chữ "test người tự viết" vì là nhật ký lịch sử. Đọc theo
  nghĩa mới: đó là danh sách ca thuộc nhóm test trọng yếu.
- Test viết cùng ADR này:
  - `tests/integration/test_webhook_idempotency.test.ts`: FR-ORD-15 AC1–AC3, FR-SLT-38 AC4, và ca
    Gate 3 "gửi lại 5 lần chỉ tạo 1 lệnh".
  - `tests/e2e/test_command_ttl.test.ts`: TTL lệnh xịt, bấm sau khi hết giờ, chống phát lại, khởi
    động lại khi đèn đang sáng.
  - `tests/integration/test_dsp_dispatch.test.ts`: điều phối DSP. Phần này không thuộc nhóm trọng
    yếu nhưng trước đây chưa có test.
- Ba nhóm trọng yếu vẫn **chưa có test**: quy kết `revenue_owner` (`test_revenue_attribution`), job
  chuyển trạng thái hóa đơn (`test_rental_scheduler`) và hard timeout firmware (phần cứng).
