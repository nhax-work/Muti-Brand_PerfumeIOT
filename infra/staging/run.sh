#!/usr/bin/env bash
# Lối tắt vận hành staging trên VM — tự truyền đúng file cấu hình cho docker compose.
#
#   bash infra/staging/run.sh ps                     # trạng thái các service
#   bash infra/staging/run.sh logs -f api            # xem log backend
#   bash infra/staging/run.sh seed                   # nạp dữ liệu mẫu (chỉ chạy trên CSDL trống)
#   bash infra/staging/run.sh pay-mock ORD-...       # xác nhận đã trả tiền khi PAYMENT_PROVIDER=mock
#   bash infra/staging/run.sh prepare-device M001    # chuyển máy sang thiết bị thật, in khóa công khai
#   bash infra/staging/run.sh psql                   # mở psql vào CSDL staging
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
  psql)
    # shellcheck disable=SC1091
    . "$SECRETS_DIR/compose.env"
    compose exec db psql -U "$DB_USER" -d "$DB_NAME"
    ;;
  *)
    compose "$@"
    ;;
esac
