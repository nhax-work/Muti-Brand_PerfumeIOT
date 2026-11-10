#!/bin/sh
# Khởi động Mosquitto bằng chứng chỉ Let's Encrypt mà Caddy đã xin cho $MQTT_PUBLIC_HOST.
#
# Caddy lưu chứng chỉ trong volume dữ liệu của nó với quyền chỉ root đọc được, còn Mosquitto chạy
# bằng user `mosquitto`. Vì vậy script chép chứng chỉ sang /mosquitto/certs (entrypoint gốc của
# image sẽ chown thư mục /mosquitto). Caddy gia hạn chứng chỉ trước hạn khoảng 30 ngày; khi file
# đổi, script dừng Mosquitto và thoát để Docker (restart: unless-stopped) khởi động lại với
# chứng chỉ mới.
set -eu

host="${MQTT_PUBLIC_HOST:?Thiếu MQTT_PUBLIC_HOST}"
src_dir=/caddy-data/caddy/certificates

find_file() {
  find "$src_dir" -type f -name "$host.$1" 2>/dev/null | head -n 1
}

echo "Chờ Caddy cấp chứng chỉ cho $host..."
while [ -z "$(find_file crt)" ] || [ -z "$(find_file key)" ]; do
  sleep 5
done

crt="$(find_file crt)"
key="$(find_file key)"
mkdir -p /mosquitto/certs
cp "$crt" /mosquitto/certs/server.crt
cp "$key" /mosquitto/certs/server.key
chmod 600 /mosquitto/certs/server.key
# Mosquitto 2 cảnh báo (và bản sau sẽ từ chối) passwd/acl mà user khác đọc được.
chmod 0700 /mosquitto/secrets/passwd /mosquitto/secrets/acl
fingerprint="$(md5sum < "$crt")"
echo "Đã nạp chứng chỉ: $crt"

/docker-entrypoint.sh /usr/sbin/mosquitto -c /mosquitto/config/mosquitto.conf &
pid=$!
trap 'kill "$pid" 2>/dev/null; wait "$pid"; exit 0' TERM INT

while kill -0 "$pid" 2>/dev/null; do
  sleep 3600 &
  wait $!
  if [ "$(md5sum < "$crt")" != "$fingerprint" ]; then
    echo "Chứng chỉ đã được gia hạn — khởi động lại Mosquitto."
    kill "$pid"
    wait "$pid" || true
    exit 1
  fi
done
wait "$pid"
