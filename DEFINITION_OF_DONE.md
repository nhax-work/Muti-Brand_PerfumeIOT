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

## Quyết định còn lại của tuần 2

`npm run db:migrate` đang để TODO vì chưa chốt ORM. Ba lựa chọn:

| ORM | Ưu | Nhược với đồ án này |
|---|---|---|
| **Prisma** | Migration và type tốt nhất | Partial unique index phải viết SQL thô trong migration |
| **Drizzle** | SQL-first, khai báo được partial index trực tiếp | Hệ sinh thái nhỏ hơn |
| **TypeORM** | Quen thuộc | Migration hay lệch |

Dự án cần **4 partial unique index** (xem `spec/contracts/README.md`) — đó là cơ chế bảo đảm
idempotency và ràng buộc slot. Chọn ORM nào cũng phải kiểm tra viết được chúng trước khi chốt.
