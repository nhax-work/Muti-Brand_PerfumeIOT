#!/usr/bin/env bash
# Deploy bản đang checkout lên staging. Chạy trên VM, trong bản clone repo.
#
# Job `deploy-staging` của CI checkout đúng commit vừa qua CI trên nhánh dev rồi gọi script này.
# Deploy tay: git fetch origin dev && git checkout --detach origin/dev && bash infra/staging/deploy.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
run() { bash "$here/run.sh" "$@"; }

echo "==> Build image cho commit $(git -C "$here" rev-parse --short HEAD)"
run build

echo "==> Khởi động CSDL và broker"
run up -d --wait db
run up -d mqtt

echo "==> Chạy migration"
run run --rm --no-deps -w /app api npm run db:migrate

echo "==> Khởi động backend và web"
run up -d --remove-orphans

docker image prune -f > /dev/null
run ps
