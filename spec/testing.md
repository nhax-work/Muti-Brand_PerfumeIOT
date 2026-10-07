# Quy ước kiểm thử

## Đặt tên

```
test_FR_<MODULE>_<số>_<mô_tả_ngắn>
```

Ví dụ: `test_FR_ORD_15_webhook_idempotent`, `test_FR_SLT_02_reject_occupied_slot`

Script `scripts/check-traceability.mjs` quét theo đúng quy ước này. Sai tên thì FR bị coi là
chưa có test và CI fail.

## Phân tầng

| Thư mục | Nội dung |
|---|---|
| `tests/unit/` | Logic thuần: tính phí, chuyển trạng thái, kiểm chữ ký |
| `tests/integration/` | Có CSDL thật: ràng buộc, transaction, tranh chấp đồng thời |
| `tests/contract/` | Hiện thực khớp `openapi.yaml` và `mqtt.md` |
| `tests/e2e/` | Luồng đầu-cuối với Device Simulator |

Test integration và e2e chạy **tuần tự từng file** (`--no-file-parallelism`). Các file dùng chung
một CSDL test, và job DSP (`armQueuedOrders`, `sweepTimeouts`) quét mọi máy, nên chạy song song thì
file này sẽ ghi lệnh lên đơn của file kia.

## Bảy nhóm test trọng yếu

Đây là những bất biến dễ sai nhất và tốn kém nhất nếu sai. Agent **được** viết và sửa test của cả bảy
nhóm (ADR-0010 bỏ quy định "người tự viết" trước đây). Đổi lại:

- test mang đúng mã FR của ca nó chứng minh, theo quy ước đặt tên ở trên;
- test phải đi qua chính cơ chế cần chứng minh: ràng buộc CSDL thật, webhook có chữ ký, simulator
  kiểm chữ ký/TTL. Mock đúng chỗ đó thì test vô nghĩa;
- PR thêm hoặc sửa test trọng yếu phải có người review riêng phần test, đối chiếu từng assert với AC.

| Nhóm | File | Trạng thái |
|---|---|---|
| Idempotency webhook | `tests/integration/test_webhook_idempotency.test.ts` | có |
| Cô lập mức slot | `tests/integration/test_slot_isolation.test.ts` | có |
| `revenue_owner` | `tests/integration/test_revenue_attribution.test.ts` | chưa có |
| Unique constraint slot | `tests/integration/test_slot_constraint.test.ts` | có |
| TTL lệnh xịt | `tests/e2e/test_command_ttl.test.ts` | có |
| Hard timeout firmware | kiểm thử trên phần cứng thật, ghi vào Test Report | — |
| Job chuyển trạng thái | `tests/integration/test_rental_scheduler.test.ts` | chưa có |

## Cổng CI

| Cổng | Điều kiện |
|---|---|
| Traceability | 100% FR ưu tiên M có test mang đúng mã |
| Coverage | ≥60% cho ORD, DSP, SLT, EXP, REV, INV |
| Contract | Không lệch `openapi.yaml` |
| Review | Mọi PR có người duyệt, kể cả PR do AI sinh |
