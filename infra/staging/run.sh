#!/usr/bin/env bash
# Lối tắt vận hành staging trên VM — tự truyền đúng file cấu hình cho docker compose.
#
#   bash infra/staging/run.sh ps                     # trạng thái các service
#   bash infra/staging/run.sh logs -f api            # xem log backend
#   bash infra/staging/run.sh seed                   # nạp dữ liệu mẫu (chỉ chạy trên CSDL trống)
#   bash infra/staging/run.sh pay-mock ORD-...       # xác nhận đã trả tiền khi PAYMENT_PROVIDER=mock
#   bash infra/staging/run.sh prepare-device M001    # chuyển máy sang thiết bị thật, in khóa công khai
#   bash infra/staging/run.sh psql                   # mở psql vào CSDL staging
#   bash infra/staging/run.sh sim-start M001 --press-after 5  # Device Simulator đóng vai máy M001
#   bash infra/staging/run.sh sim-stop M001          # dừng simulator (trước khi cắm ESP32 thật)
#   bash infra/staging/run.sh <lệnh compose bất kỳ>  # ví dụ: restart mqtt
set -euo pipefail

SECRETS_DIR="${SECRETS_DIR:-/opt/scentstation/secrets}"
cd "$(dirname "$0")"

compose() { docker compose --env-file "$SECRETS_DIR/compose.env" -f docker-compose.yml "$@"; }

case "${1:-}" in
  seed)
    compose run --rm -w /app api npm run db:seed
    ;;
  pay-mock)
    shift
    compose exec -w /app api npm run pay:mock -- "$@"
    ;;
  prepare-device)
    shift
    compose exec -w /app api npm run device:prepare -- "$@"
    ;;
  sim-start)
    # Chạy trong image backend: có sẵn khóa ký (kiểm chữ ký lệnh như firmware) và broker nội bộ.
    # KHÔNG chạy cùng lúc với ESP32 thật mang cùng serial — cả hai sẽ cùng trả lời một lệnh.
    shift
    serial="${1:-M001}"
    shift || true
    compose run -d --rm --no-deps --name "sim-$serial" -w /app api npm run sim -- --serial "$serial" "$@"
    echo "Xem log: docker logs -f sim-$serial"
    ;;
  sim-stop)
    docker stop "sim-${2:-M001}"
    ;;
  psql)
    # shellcheck disable=SC1091
    . "$SECRETS_DIR/compose.env"
    compose exec db psql -U "$DB_USER" -d "$DB_NAME"
    ;;
  *)
    compose "$@"
    ;;
esac
