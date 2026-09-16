# Task 4 và 5 — Định nghĩa hoàn thành

## Task 4 — Docker Compose

Chạy lần lượt, tất cả phải xanh:

```bash
cp .env.example .env
docker compose up -d
docker compose ps                     # 5 service, state = healthy

# Postgres dev
docker exec scent-db psql -U scent -d scentstation -c "SHOW TIME ZONE;"   # phải là UTC

# Postgres test
docker exec scent-db-test psql -U scent -d scentstation_test -c "SELECT 1;"

# Redis
docker exec scent-redis redis-cli ping                  # PONG

# MQTT — mở 2 terminal
docker exec scent-mqtt mosquitto_sub -t 'scentstation/#' -v
docker exec scent-mqtt mosquitto_pub -t 'scentstation/M001/heartbeat' -m '{"ts":1}'

# Adminer
curl -sf http://localhost:8080 >/dev/null && echo OK

# Xóa sạch và dựng lại phải chạy được
docker compose down -v && docker compose up -d
```

Kiểm tra thêm:

- [ ] `.env` nằm trong `.gitignore`, `git status` không thấy nó
- [ ] Không có mật khẩu thật nào trong `docker-compose.yml`
- [ ] `docker compose down -v` rồi `up -d` không lỗi
- [ ] CSDL test chạy tmpfs: dữ liệu mất sau khi restart container

---

## Task 5 — CI

- [ ] Push một PR rác, thấy đủ 4 job chạy: lint, test, contract, spec
- [ ] Cố tình để lỗi TypeScript → job lint đỏ
- [ ] Cố tình sửa `spec/contracts/openapi.yaml` mà không thêm ADR → job spec đỏ
- [ ] Job test dựng được Postgres, Redis và Mosquitto, migration chạy xong
- [ ] Traceability chỉ **cảnh báo**, chưa chặn merge
- [ ] Bật branch protection cho `main`: bắt buộc 4 job xanh + 1 người duyệt
- [ ] Thời gian chạy toàn bộ CI dưới 5 phút

---

## Lịch bật cổng chặn merge

Sửa biến trong `.github/workflows/ci.yml` đúng tuần:

| Tuần | Bật |
|---|---|
| 2 | lint, test:unit |
| 3 | test:integration |
| 4 | test:contract |
| 6 | `ENFORCE_COVERAGE: 'true'` |
| 8 | `ENFORCE_TRACEABILITY: 'true'` |

Bật hết từ tuần 1 thì CI đỏ suốt 7 tuần và cả nhóm sẽ quen với việc bỏ qua CI đỏ.

---

## Quyết định tuần 2 — ĐÃ CHỐT

Công cụ migration: **node-pg-migrate**, migration viết bằng **SQL thuần**.

Ghi trong `spec/decisions/0002-chuan-dat-ten-va-kieu-du-lieu-csdl.md`. Ba lựa chọn ORM cân nhắc
trước đó (Prisma, Drizzle, TypeORM) đều phải viết SQL thô cho phần quan trọng nhất, nên lợi thế
type-safety không bù được việc file schema của ORM không phản ánh đúng schema thật.

Dự án cần những thứ sau, tất cả đều nằm trong `spec/contracts/schema.sql` §10–11 và đã được kiểm
là thực sự chặn (không chỉ tồn tại):

| Ràng buộc | FR |
|---|---|
| `uq_slot_active_rental` | FR-SLT-02, NFR-DAT-07 |
| `uq_payment_event` | FR-ORD-15 |
| `uq_order_active_command` | FR-DSP-05 |
| `uq_slot_active_bottle` | FR-MCH-07 |
| `excl_slot_rental_overlap` (EXCLUDE USING gist) | FR-SLT-05 |
| Trigger append-only cho `audit_logs` | FR-AUD-09, NFR-SEC-08 |

Lưu ý khi chạy `make migrate` lần đầu: cần `DATABASE_URL` trong `.env`; `make seed` cần thêm
`SEED_DEFAULT_PASSWORD`. Cả hai đã có trong `.env.example`.
