# Deploy môi trường staging

Staging là bản chạy thật trên internet để cả nhóm test. Nhánh `dev` qua CI xanh thì tự deploy lên
VM. Toàn bộ hệ thống chạy bằng một file docker compose (NFR-MTN-03):
[`infra/staging/docker-compose.yml`](../infra/staging/docker-compose.yml).

| Địa chỉ | Dùng cho |
|---|---|
| https://admin.scentstation.id.vn | Web quản trị (Super Admin, nhân sự, Brand Admin) |
| https://kiosk.scentstation.id.vn/?serial=M001 | Màn hình kiosk của máy `M001` |
| https://api.scentstation.id.vn | API: webhook PayOS, ảnh sản phẩm, Swagger tại `/api/docs` |
| `mqtt.scentstation.id.vn:8883` | Broker MQTT có TLS cho ESP32 và Device Simulator |
| https://scentstation.id.vn | Chuyển hướng sang web quản trị |

```
VM Azure (Ubuntu 24.04, 2 vCPU / 4GB)
├─ web   Caddy: HTTPS tự động, phục vụ admin-web + kiosk, chuyển /api sang api
├─ api   Node 22: HTTP + MQTT + scheduler trong một tiến trình (ADR-0003)
├─ db    PostgreSQL 16 — không mở cổng ra ngoài
└─ mqtt  Mosquitto 2: cổng 8883 có TLS + tài khoản riêng từng máy
```

Bí mật (mật khẩu CSDL, khóa ký lệnh, khóa PayOS…) nằm trong `/opt/scentstation/secrets` trên VM,
**không bao giờ** vào repo.

## 1. Trỏ tên miền (một lần)

Trong trang quản lý DNS của `scentstation.id.vn` (tenten.vn), tạo 5 bản ghi **A** cùng trỏ về IP
của VM `104.208.90.228`:

| Tên | Loại | Giá trị |
|---|---|---|
| `@` | A | 104.208.90.228 |
| `admin` | A | 104.208.90.228 |
| `kiosk` | A | 104.208.90.228 |
| `api` | A | 104.208.90.228 |
| `mqtt` | A | 104.208.90.228 |

Kiểm tra từ máy mình: `nslookup admin.scentstation.id.vn` phải ra đúng IP. DNS có thể mất vài phút
đến vài giờ mới cập nhật. **Phải xong bước này trước khi deploy**, vì Caddy cần tên miền trỏ đúng
mới xin được chứng chỉ HTTPS.

## 2. Mở cổng trên Azure (một lần)

VM → **Networking** → kiểm tra có các inbound rule cho TCP **22, 80, 443, 8883**. Thiếu cổng nào
thì *Create port rule → Inbound port rule* để thêm.

## 3. Cài VM (một lần)

SSH vào VM rồi chạy lần lượt.

**Swap 2GB** — build web cần nhiều RAM, thiếu swap dễ bị kill giữa chừng:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**Docker** (theo kho apt chính thức của Docker):

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Thoát SSH rồi vào lại để quyền `docker` có hiệu lực, kiểm tra bằng `docker ps`.

**Lấy mã nguồn:**

```bash
sudo mkdir -p /opt/scentstation && sudo chown "$USER": /opt/scentstation
git clone https://github.com/nhax-work/Muti-Brand_PerfumeIOT.git /opt/scentstation/app
cd /opt/scentstation/app
git checkout --detach origin/dev
```

**Tạo bí mật** — tham số là tên miền, email nhận thông báo SSL, và serial các máy cần nối:

```bash
bash infra/staging/init-secrets.sh scentstation.id.vn email-cua-ban@example.com M001
```

Script không in bí mật ra màn hình. Muốn dùng PayOS thật hoặc gửi email thật thì điền vào
`/opt/scentstation/secrets/api.env` ngay bây giờ (xem mục 6). Để nguyên cũng chạy được.

**Deploy lần đầu và nạp dữ liệu mẫu:**

```bash
bash infra/staging/deploy.sh
bash infra/staging/run.sh seed
```

Lần đầu build mất khoảng 5–10 phút. Xong thì mở https://admin.scentstation.id.vn. Seed in danh sách
tài khoản mẫu; mật khẩu chung nằm ở `SEED_DEFAULT_PASSWORD`:

```bash
grep SEED_DEFAULT_PASSWORD /opt/scentstation/secrets/api.env
```

`seed` chỉ chạy **một lần** trên CSDL trống.

## 4. Bật tự deploy từ GitHub (một lần)

Tạo khóa SSH riêng cho GitHub Actions **trên VM** (không dùng file `.pem` cá nhân):

```bash
ssh-keygen -t ed25519 -N "" -C github-actions-staging -f ~/.ssh/github_deploy
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/github_deploy        # nội dung này là STAGING_SSH_KEY
```

Trên máy mình (PowerShell), lấy dấu vân tay của VM:

```powershell
ssh-keyscan -t ed25519 104.208.90.228   # dòng in ra là STAGING_SSH_KNOWN_HOSTS
```

**Chủ repo** (`nhax-work`) vào GitHub → *Settings → Secrets and variables → Actions → New repository
secret*, tạo 4 secret:

| Secret | Giá trị |
|---|---|
| `STAGING_SSH_HOST` | `104.208.90.228` |
| `STAGING_SSH_USER` | `azureuser` |
| `STAGING_SSH_KEY` | Toàn bộ nội dung `~/.ssh/github_deploy`, kể cả dòng BEGIN/END |
| `STAGING_SSH_KNOWN_HOSTS` | Dòng in ra từ `ssh-keyscan` |

Từ đó, mỗi lần merge vào `dev` và CI xanh, job **Deploy staging** tự chạy. Chưa có secret thì job
chỉ cảnh báo và bỏ qua, CI không bị đỏ.

## 5. Vận hành hằng ngày

Mọi lệnh chạy trên VM, trong `/opt/scentstation/app`:

| Việc | Lệnh |
|---|---|
| Xem trạng thái | `bash infra/staging/run.sh ps` |
| Xem log backend | `bash infra/staging/run.sh logs -f --tail 200 api` |
| Deploy tay bản `dev` mới nhất | `git fetch origin dev && git checkout --detach origin/dev && bash infra/staging/deploy.sh` |
| Khởi động lại một service | `bash infra/staging/run.sh restart api` |
| Mở psql | `bash infra/staging/run.sh psql` |
| Sao lưu CSDL | `bash infra/staging/run.sh exec -T db pg_dump -U scent scentstation \| gzip > ~/backup-$(date +%F).sql.gz` |
| Thêm máy mới | `bash infra/staging/mqtt-device.sh M002` |

**Xem CSDL bằng DBeaver.** CSDL chỉ nghe trên `127.0.0.1` của VM, internet không tới được; DBeaver
tự mở đường hầm SSH. *New Database Connection → PostgreSQL*:

| Tab | Ô | Giá trị |
|---|---|---|
| Main | Host / Port | `localhost` / `5432` |
| Main | Database / Username | `scentstation` / `scent` |
| Main | Password | `grep DB_PASSWORD /opt/scentstation/secrets/compose.env` (chạy trên VM) |
| SSH | Use SSH Tunnel | Bật |
| SSH | Host / Port / User | `104.208.90.228` / `22` / `azureuser` |
| SSH | Authentication | Public Key, chọn file `.pem` dùng để SSH vào VM |

Không cài DBeaver thì dùng `run.sh psql`.

## 6. Thanh toán và email

**Thanh toán.** Mặc định `PAYMENT_PROVIDER=mock`: test không tốn tiền. Kiosk hiện mã tham chiếu
đơn (`ORD-…`), web quản trị hiện mã phiên thuê slot (`CHK-…`). Người có quyền SSH xác nhận trả tiền:

```bash
bash infra/staging/run.sh pay-mock ORD-20261110-XXXXXX
```

Chuyển sang PayOS thật (tiền thật — PayOS không có sandbox, xem [PAYOS.md](PAYOS.md)): trong
`/opt/scentstation/secrets/api.env` đặt `PAYMENT_PROVIDER=payos`, điền `PAYOS_CLIENT_ID`,
`PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`; chạy `bash infra/staging/run.sh up -d api`; rồi trên
my.payos.vn đặt Webhook URL `https://api.scentstation.id.vn/api/v1/webhooks/payments/payos`.
PayOS gửi giao dịch mẫu để kiểm URL — backend trả 200 (`UNKNOWN_REFERENCE`) là đúng.

**Email.** Để trống `SMTP_HOST` thì email chỉ ghi log. Muốn test luồng đăng ký thương hiệu mà
chưa có SMTP, đặt `DEV_LOG_EMAIL_VERIFICATION_TOKEN=true` rồi lấy token bằng
`bash infra/staging/run.sh logs api | grep -i verif`. Có SMTP (ví dụ Gmail + App Password) thì điền
`SMTP_*` và để biến kia là `false`.

Sau khi sửa `api.env`: `bash infra/staging/run.sh up -d api`.

## 7. Nối ESP32 và Device Simulator

`init-secrets.sh` / `mqtt-device.sh` ghi thông số cho từng máy vào
`/opt/scentstation/secrets/devices/<serial>.txt`: host, cổng 8883, tài khoản MQTT riêng, khóa công
khai kiểm chữ ký lệnh. Chép các dòng đó vào `arduino/<sketch>/config.h` (đã nằm trong
`.gitignore`).

`MQTT_ROOT_CA` là chứng chỉ gốc **ISRG Root X1** của Let's Encrypt
(https://letsencrypt.org/certs/isrgrootx1.pem). Lệnh sau in sẵn cả dòng `#define MQTT_ROOT_CA`
dạng chuỗi C; dùng nó **thay** dòng `#define MQTT_ROOT_CA ""` trong `config.h`:

```bash
echo '#define MQTT_ROOT_CA \'
curl -fsSL https://letsencrypt.org/certs/isrgrootx1.pem | tr -d '\r' | sed 's/.*/"&\\n" \\/' | sed '$ s/ \\$//'
```

Dòng cuối không được có dấu `\` — nếu có, trình biên dịch nối luôn dòng `#define` kế tiếp vào chứng
chỉ. Cuối cùng chuyển máy sang thiết bị thật trong CSDL:

```bash
bash infra/staging/run.sh prepare-device M001
```

**Không có phần cứng?** Máy không gửi heartbeat thì hệ thống coi là `OFFLINE` và kiosk hiện
"Máy đang tạm ngưng phục vụ". Cho Device Simulator đóng vai máy, chạy ngay trên VM:

```bash
bash infra/staging/run.sh sim-start M001 --press-after 5   # tự "bấm nút" 5 giây sau khi đèn sáng
docker logs -f sim-M001                                    # xem simulator nhận lệnh, xịt
bash infra/staging/run.sh sim-stop M001                    # dừng trước khi cắm ESP32 thật
```

Bỏ `--press-after 5` thì simulator không tự bấm — đơn hết giờ chờ bấm sẽ `FORFEITED`. Các cờ khác
(giả lỗi, cửa mở…) xem đầu file `scripts/device-simulator.ts`.

## Khi có sự cố

| Triệu chứng | Kiểm tra |
|---|---|
| Trình duyệt báo lỗi chứng chỉ | DNS đã trỏ đúng chưa; `run.sh logs web` xem Caddy xin chứng chỉ có lỗi không |
| ESP32 không kết nối MQTT | `run.sh logs mqtt`; cổng 8883 đã mở trên Azure chưa; `MQTT_ROOT_CA` đúng ISRG Root X1 chưa |
| `mqtt` đứng ở "Chờ Caddy cấp chứng chỉ" | Service `web` phải chạy và `mqtt.scentstation.id.vn` phải trỏ đúng IP |
| Build bị kill | Kiểm tra swap: `free -h` |
| API không khởi động | `run.sh logs api` — backend báo rõ biến nào thiếu hoặc sai |
