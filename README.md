# Chạy dự án ở máy local — Hướng dẫn cho người mới

Tài liệu này giải thích **cách dựng database (và các dịch vụ đi kèm) trên máy của bạn** bằng Docker Compose, theo cách dễ hiểu nhất có thể. Đọc xong là chạy được, không cần biết Docker trước.

---

## 1. Docker Compose là gì, hiểu đơn giản

Coi `docker-compose.yml` như một **công thức nấu ăn**: nó ghi "cần 1 nồi Postgres, 1 nồi Redis, 1 nồi MQTT...". Khi bạn gõ lệnh `docker compose up`, máy bạn sẽ tự tải và bật các "nồi" đó lên — **trên chính máy bạn**, không đụng vào máy ai khác.

Điều quan trọng cần nhớ:

> **Database bằng Docker Compose là của riêng từng người.** Máy bạn có một DB, máy đồng đội có một DB khác. Hai DB này *không tự động giống nhau* — ban đầu cả hai đều **trống trơn**, không có bảng nào cả.

Vậy làm sao để DB của mọi người giống nhau? Câu trả lời ở mục 4.

---

## 2. Chuẩn bị lần đầu (chỉ làm 1 lần)

**Bước 1 — Cài Docker Desktop** (nếu chưa có): tải tại docker.com, cài xong nhớ mở app Docker Desktop lên và để nó chạy nền.

**Bước 2 — Tạo file cấu hình riêng của bạn:**

```bash
cp .env.example .env
```

File `.env` chứa các thông tin như tên user DB, mật khẩu, cổng kết nối... File này **không được commit lên git** (đã có trong `.gitignore` rồi, nên bạn không cần lo). Mỗi người tự có file `.env` riêng, thường copy y nguyên từ `.env.example` là chạy được, không cần sửa gì.

---

## 3. Bật hạ tầng lên

Từ thư mục gốc của repo, chạy:

```bash
make up
```

(Lệnh này thực chất chỉ là `docker compose up -d` — `make` là cách gõ tắt cho gọn.)

Lần đầu sẽ hơi lâu vì máy phải tải các "nồi" (image) về. Sau khi xong, kiểm tra mọi thứ đã bật chưa:

```bash
docker compose ps
```

Bạn sẽ thấy 5 dịch vụ:

| Dịch vụ | Là gì | Cổng mặc định |
|---|---|---|
| `db` | Database chính, dùng khi code | `localhost:5432` |
| `db-test` | Database riêng chỉ dùng khi chạy test tự động | `localhost:5433` |
| `redis` | Bộ nhớ đệm / hàng đợi | `localhost:6379` |
| `mqtt` | Máy chủ nhận tin nhắn từ thiết bị IoT | `localhost:1883` |
| `adminer` | Trang web xem DB bằng giao diện, đỡ phải gõ SQL | `localhost:8080` |

Muốn xem DB đang có gì bằng giao diện web, mở trình duyệt vào `http://localhost:8080`, đăng nhập bằng thông tin trong file `.env` (server = `db`, user/password/database lấy từ `.env`).

**Tắt hạ tầng khi không dùng nữa:**

```bash
make down
```

Dữ liệu vẫn được giữ lại (không mất), lần sau `make up` lại là có tiếp.

---

## 4. Vì sao cần "một người code trước" — và các bạn khác làm gì sau đó

Đây là phần quan trọng nhất, trả lời đúng câu hỏi bạn đang thắc mắc.

Khi mới `make up`, DB của bạn **trống hoàn toàn** — chưa có bảng `user`, `order`, `slot`... gì cả. Ai `up` lên cũng ra một DB trống giống hệt nhau về *cấu trúc rỗng*, nhưng chưa có *cấu trúc bảng (schema)* bên trong.

Vậy quy trình đúng là:

1. **Một bạn (TV1, theo phân công trong `spec/contracts/README.md`) là người viết schema đầu tiên.** Bạn ấy thiết kế bảng, cột, ràng buộc... trong file `spec/contracts/schema.sql`, dựa theo mô hình dữ liệu đã thống nhất ở `spec/glossary.md` và `spec/contracts/erd.md`.
2. Bạn ấy **không gõ tay vào DB của mình rồi thôi** — mà biến thiết kế đó thành **migration**: một tập lệnh có thể chạy lại được để "dựng" đúng các bảng đó lên bất kỳ DB trống nào.
3. Migration này được **commit vào git**. Đây là phần quan trọng: cái mọi người chia sẻ với nhau là **file migration**, chứ không phải database thật.
4. Từ lúc đó, mỗi bạn khác chỉ cần:

```bash
git pull          # lấy migration mới nhất
make up           # dựng DB trống (nếu chưa có)
make migrate      # cho migration "chạy" lên DB của mình -> tự sinh đúng các bảng
make seed         # (tuỳ chọn) nạp thêm dữ liệu mẫu để test cho dễ
```

Sau bước này, DB của bạn sẽ có **cấu trúc bảng giống hệt** DB của TV1 và mọi người khác — dù dữ liệu bên trong (do mỗi người tự thêm khi code/test) có thể khác nhau, điều đó không sao vì đó chỉ là dữ liệu thử.

> Ví dụ dễ hình dung: file migration giống như **bản vẽ thiết kế tủ**. Ai cũng tự đóng tủ ở nhà mình (tự tạo DB riêng), nhưng vì dùng chung một bản vẽ nên tủ ai cũng giống nhau về hình dạng, ngăn kéo. Đồ đựng bên trong tủ (dữ liệu) thì mỗi người khác nhau, không quan trọng.

**Mỗi khi có ai thêm/sửa bảng về sau:** người đó viết migration mới → commit. Người khác `git pull` xong nhớ chạy lại `make migrate` để đồng bộ. **Tuyệt đối không tự ý sửa tay cấu trúc DB của mình** rồi mong người khác tự giống — làm vậy sẽ sớm bị lệch, dẫn đến lỗi khó hiểu ("chạy ở máy tôi thì được mà").

### Chuẩn bị thêm cho lần đầu

`make migrate` và `make seed` đã chạy được thật (công cụ: **node-pg-migrate**, migration viết bằng
SQL thuần — chi tiết ở [docs/MIGRATIONS.md](docs/MIGRATIONS.md)). Trước lần chạy đầu tiên, làm thêm
hai việc:

**1. Cài thư viện Node** (chỉ một lần, và mỗi khi `package.json` đổi):

```bash
npm install
```

**2. Bổ sung hai dòng vào file `.env` của bạn** — `.env.example` đã có sẵn, nhưng nếu bạn tạo `.env`
từ trước thì nó còn thiếu:

```
DATABASE_URL=postgresql://scent:scent_dev@localhost:5432/scentstation
SEED_DEFAULT_PASSWORD=doi_gia_tri_nay
```

`DATABASE_URL` phải khớp với `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT` trong cùng file.
`SEED_DEFAULT_PASSWORD` là mật khẩu cho các tài khoản mẫu — script seed **không chạy** nếu thiếu
biến này, vì không được hardcode mật khẩu trong mã nguồn.

---

## 5. Các lệnh hay dùng

| Lệnh | Tác dụng |
|---|---|
| `make up` | Bật db, redis, mqtt, adminer |
| `make down` | Tắt, nhưng **giữ lại** dữ liệu |
| `make logs` | Xem log của tất cả dịch vụ, để debug khi lỗi |
| `make reset` | **Xoá sạch** dữ liệu và dựng lại từ đầu — chỉ dùng khi DB của bạn bị lỗi lung tung, không cứu được |
| `make migrate` | Dựng cấu trúc bảng mới nhất lên DB của bạn |
| `make seed` | Nạp dữ liệu mẫu: 1 máy, 4 slot, 2 thương hiệu mỗi bên 2 slot |
| `make lint` | Kiểm tra style và kiểu dữ liệu |
| `make test` | Chạy toàn bộ test (trừ e2e) |

---

## 6. Lỗi hay gặp

**"Port đã được sử dụng" / port already in use:** máy bạn đang có chương trình khác dùng cổng đó (ví dụ Postgres cài sẵn dùng cổng 5432). Sửa bằng cách đổi số cổng trong file `.env` của riêng bạn, ví dụ `DB_PORT=5434`, rồi `make down` && `make up` lại.

**Docker Desktop chưa mở:** phải mở app Docker Desktop trước, để nó chạy nền, rồi mới chạy được `make up`.

**Muốn xoá hết làm lại từ đầu vì DB bị rối:** `make reset`. Lưu ý lệnh này xoá sạch dữ liệu trong DB của bạn (không ảnh hưởng người khác).
