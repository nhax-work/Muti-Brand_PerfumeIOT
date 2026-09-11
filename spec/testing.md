# Quy ước kiểm thử

## Đặt tên

```
test_FR_<MODULE>_<số>_<mô_tả_ngắn>
```

Ví dụ: `test_FR_ORD_15_webhook_idempotent`, `test_FR_SLT_02_reject_occupied_slot`

Script `scripts/check_traceability.py` quét theo đúng quy ước này. Sai tên thì FR bị coi là
chưa có test và CI fail.

## Phân tầng

| Thư mục | Nội dung |
|---|---|
| `tests/unit/` | Logic thuần: tính phí, chuyển trạng thái, kiểm chữ ký |
| `tests/integration/` | Có CSDL thật: ràng buộc, transaction, tranh chấp đồng thời |
| `tests/contract/` | Hiện thực khớp `openapi.yaml` và `mqtt.md` |
| `tests/e2e/` | Luồng đầu-cuối với Device Simulator |

## Bảy nhóm test người tự viết, không giao agent

| Nhóm | File |
|---|---|
| Idempotency webhook | `tests/integration/test_webhook_idempotency.py` |
| Cô lập mức slot | `tests/integration/test_slot_isolation.py` |
| `revenue_owner` | `tests/integration/test_revenue_attribution.py` |
| Unique constraint slot | `tests/integration/test_slot_constraint.py` |
| TTL lệnh xịt | `tests/e2e/test_command_ttl.py` |
| Hard timeout firmware | kiểm thử trên phần cứng thật, ghi vào Test Report |
| Job chuyển trạng thái | `tests/integration/test_rental_scheduler.py` |

## Cổng CI

| Cổng | Điều kiện |
|---|---|
| Traceability | 100% FR ưu tiên M có test mang đúng mã |
| Coverage | ≥60% cho ORD, DSP, SLT, EXP, REV, INV |
| Contract | Không lệch `openapi.yaml` |
| Review | Mọi PR có người duyệt, kể cả PR do AI sinh |
