#!/usr/bin/env bash
# Cấp tài khoản MQTT cho một máy trên staging (FR-IOT-08, FR-IOT-09).
#
#   bash infra/staging/mqtt-device.sh M002
#
# Tạo user machine-<serial> với mật khẩu ngẫu nhiên, thêm ACL chỉ cho topic của máy đó (khớp
# spec/contracts/mqtt.md và infra/mosquitto/config/acl.example), ghi thông số firmware vào
# $SECRETS_DIR/devices/<serial>.txt rồi khởi động lại broker để nạp tài khoản mới.
#
# passwd và acl được sửa bên trong container: sau lần khởi động đầu, broker chown thư mục
# mosquitto/ sang user của nó nên user trên VM không còn ghi trực tiếp được.
set -euo pipefail

serial="${1:?Thiếu serial máy, ví dụ M001}"
restart=true
[ "${2:-}" = "--no-restart" ] && restart=false

if ! [[ "$serial" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "Serial chỉ được gồm chữ, số, '-' và '_': $serial" >&2
  exit 1
fi

SECRETS_DIR="${SECRETS_DIR:-/opt/scentstation/secrets}"
here="$(cd "$(dirname "$0")" && pwd)"
user="machine-$serial"

mosq() { docker run --rm -i -v "$SECRETS_DIR/mosquitto:/s" eclipse-mosquitto:2.0.20 "$@"; }

if mosq grep -qx "user $user" /s/acl; then
  echo "Đã có tài khoản $user — bỏ qua." >&2
  exit 0
fi

umask 077
password="$(openssl rand -hex 16)"
mosq mosquitto_passwd -b /s/passwd "$user" "$password"

mosq sh -c 'cat >> /s/acl' <<EOF

user $user
topic write scentstation/$serial/heartbeat
topic write scentstation/$serial/telemetry
topic write scentstation/$serial/event
topic write scentstation/$serial/command/result
topic read  scentstation/$serial/command
topic read  scentstation/$serial/config
topic read  scentstation/$serial/test/command
topic write scentstation/$serial/test/result
EOF

# shellcheck disable=SC1091
. "$SECRETS_DIR/compose.env"
cat > "$SECRETS_DIR/devices/$serial.txt" <<EOF
// Dán vào arduino/<sketch>/config.h của máy $serial (file đó đã nằm trong .gitignore).
#define MACHINE_SERIAL "$serial"
#define MQTT_HOST "$MQTT_HOST"
#define MQTT_PORT 8883
#define MQTT_USERNAME "$user"
#define MQTT_PASSWORD "$password"
#define MQTT_USE_TLS true
#define DEV_ALLOW_UNSIGNED_COMMANDS false
#define COMMAND_PUBLIC_KEY_HEX "$COMMAND_PUBLIC_KEY_HEX"
// MQTT_ROOT_CA: chứng chỉ ISRG Root X1 — xem docs/DEPLOY_STAGING.md mục "Nối ESP32".
EOF

echo "Đã cấp $user. Thông số firmware: $SECRETS_DIR/devices/$serial.txt"
if $restart; then
  bash "$here/run.sh" restart mqtt
fi
