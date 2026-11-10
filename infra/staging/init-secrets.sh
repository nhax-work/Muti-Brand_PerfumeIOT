#!/usr/bin/env bash
# Tạo bí mật cho staging — chạy MỘT LẦN trên VM, trước lần deploy đầu tiên.
#
#   bash infra/staging/init-secrets.sh <tên-miền-gốc> <email-nhận-thông-báo-ssl> [serial máy ...]
#   bash infra/staging/init-secrets.sh scentstation.id.vn ban@example.com M001
#
# Kết quả nằm trong $SECRETS_DIR (mặc định /opt/scentstation/secrets), NGOÀI repo:
#   compose.env         biến cho docker compose (tên miền, mật khẩu CSDL, mật khẩu MQTT của backend)
#   api.env             bí mật của backend; PayOS và SMTP để trống, điền tay sau
#   mosquitto/passwd    tài khoản MQTT: scent-backend + machine-<serial> cho từng máy
#   mosquitto/acl       mỗi máy chỉ đọc/ghi topic của chính nó (FR-IOT-09)
#   devices/<serial>.txt  thông số nạp vào config.h của firmware
#
# Không ghi đè: đã có compose.env thì dừng. Thêm máy sau này dùng mqtt-device.sh.
set -euo pipefail

domain="${1:?Thiếu tên miền gốc, ví dụ scentstation.id.vn}"
acme_email="${2:?Thiếu email nhận thông báo chứng chỉ SSL}"
shift 2
serials=("$@")
[ ${#serials[@]} -eq 0 ] && serials=(M001)

SECRETS_DIR="${SECRETS_DIR:-/opt/scentstation/secrets}"
here="$(cd "$(dirname "$0")" && pwd)"

if [ -e "$SECRETS_DIR/compose.env" ]; then
  echo "Đã có $SECRETS_DIR/compose.env — không ghi đè. Xóa thư mục đó nếu thật sự muốn tạo lại." >&2
  exit 1
fi

umask 077
mkdir -p "$SECRETS_DIR/mosquitto" "$SECRETS_DIR/devices"

# Chỉ dùng ký tự hex để nhúng thẳng vào URL kết nối mà không phải mã hóa.
hex() { openssl rand -hex "$1"; }

db_password="$(hex 24)"
mqtt_backend_password="$(hex 24)"

# Khóa ký lệnh xịt Ed25519 (FR-DSP-04), ghi một dòng với "\n" — backend tự đổi lại thành xuống dòng.
signing_key_file="$(mktemp)"
openssl genpkey -algorithm ed25519 -out "$signing_key_file"
signing_key_pem="$(tr -d '\r' < "$signing_key_file")"
signing_key_one_line="${signing_key_pem//$'\n'/\\n}"
# 32 byte cuối của khóa công khai dạng DER = khóa thô, firmware nhận dạng hex (COMMAND_PUBLIC_KEY_HEX).
command_public_key_hex="$(openssl pkey -in "$signing_key_file" -pubout -outform DER | tail -c 32 | od -An -tx1 | tr -d ' \n')"
rm -f "$signing_key_file"

cat > "$SECRETS_DIR/compose.env" <<EOF
SECRETS_DIR=$SECRETS_DIR
ACME_EMAIL=$acme_email
APEX_HOST=$domain
ADMIN_HOST=admin.$domain
KIOSK_HOST=kiosk.$domain
API_HOST=api.$domain
MQTT_HOST=mqtt.$domain
# Kênh hỗ trợ hiện trên kiosk khi có sự cố (FR-ORD-21), ví dụ số Zalo. Để trống thì không hiện.
SUPPORT_CONTACT=
DB_USER=scent
DB_NAME=scentstation
DB_PASSWORD=$db_password
MQTT_BACKEND_PASSWORD=$mqtt_backend_password
COMMAND_PUBLIC_KEY_HEX=$command_public_key_hex
EOF

cat > "$SECRETS_DIR/api.env" <<EOF
# Bí mật của backend staging. DATABASE_URL, MQTT_URL, PORT, MEDIA_DIR, ADMIN_WEB_BASE_URL do
# docker-compose.yml đặt — không khai lại ở đây.

# development cho phép cổng thanh toán mock để test không tốn tiền. Khi đã điền đủ PayOS và SMTP,
# đổi thành production để backend kiểm tra đủ mọi bí mật lúc khởi động.
APP_ENV=development
SWAGGER_ENABLED=true

JWT_SECRET=$(hex 32)
DISPENSE_SIGNING_KEY=$signing_key_one_line
REFUND_ACCOUNT_ENC_KEY=$(openssl rand -base64 32)
REFUND_CLAIM_TOKEN_SECRET=$(hex 32)

# Mật khẩu chung của các tài khoản mẫu do db:seed tạo. Staging mở ra internet nên phải là chuỗi mạnh.
SEED_DEFAULT_PASSWORD=Scent-$(hex 6)!

# --- Thanh toán ---
# mock: kiosk hiện QR giả, xác nhận trả tiền bằng: bash infra/staging/run.sh pay-mock <mã-tham-chiếu>
# payos: điền 3 khóa PAYOS_* của kênh thanh toán rồi đăng ký webhook
#        https://api.$domain/api/v1/webhooks/payments/payos (docs/PAYOS.md)
PAYMENT_PROVIDER=mock
PAYMENT_WEBHOOK_SECRET=$(hex 32)
PAYOS_CLIENT_ID=
PAYOS_API_KEY=
PAYOS_CHECKSUM_KEY=
# PayOS bắt buộc khi tạo link; kiosk không dùng, phiên thuê slot tự trỏ về trang phiên (FR-SLT-37).
PAYOS_RETURN_URL=https://admin.$domain/rentals
PAYOS_CANCEL_URL=https://admin.$domain/rentals
PAYOS_BASE_URL=

# --- Email (xác minh email thương hiệu, thông báo) ---
# Để trống SMTP_HOST thì email chỉ ghi log; bật DEV_LOG_EMAIL_VERIFICATION_TOKEN để lấy token từ log.
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
DEV_LOG_EMAIL_VERIFICATION_TOKEN=false

# --- Ảnh sản phẩm (ADR-0020) ---
MEDIA_STORAGE_DRIVER=local
MEDIA_PUBLIC_BASE_URL=https://api.$domain/api/v1/media
EOF

cat > "$SECRETS_DIR/mosquitto/acl" <<EOF
# Sinh bởi infra/staging/init-secrets.sh — mỗi thiết bị chỉ truy cập topic của chính nó (FR-IOT-09).

user scent-backend
topic readwrite scentstation/#
EOF

docker run --rm -v "$SECRETS_DIR/mosquitto:/s" eclipse-mosquitto:2.0.20 \
  mosquitto_passwd -b -c /s/passwd scent-backend "$mqtt_backend_password"

for serial in "${serials[@]}"; do
  SECRETS_DIR="$SECRETS_DIR" bash "$here/mqtt-device.sh" "$serial" --no-restart
done

echo
echo "Đã tạo bí mật trong $SECRETS_DIR."
echo "Việc tiếp theo: điền PayOS/SMTP vào $SECRETS_DIR/api.env nếu cần, rồi chạy bash infra/staging/deploy.sh"
