# Backend ScentStation cho môi trường staging: HTTP + MQTT + scheduler trong một tiến trình (ADR-0003).
#
# Chạy thẳng mã TypeScript bằng tsx, giống `npm run dev -w @scentstation/api`: hai package nội bộ
# (@scentstation/contracts, @scentstation/i18n) export file .ts nên `node dist/...` không nạp được.
# Image này cũng dùng để chạy migration và seed (xem infra/staging/deploy.sh).
FROM node:22.15.1-bookworm-slim

WORKDIR /app

# Chép package.json trước để lớp `npm ci` được cache khi chỉ mã nguồn thay đổi.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/admin-web/package.json apps/admin-web/
COPY apps/kiosk/package.json apps/kiosk/
COPY packages/contracts/package.json packages/contracts/
COPY packages/i18n/package.json packages/i18n/
# `prepare` của @scentstation/contracts sinh lại kiểu từ openapi.yaml ngay trong lúc npm ci.
COPY spec/contracts/openapi.yaml spec/contracts/
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY packages packages
COPY apps/api apps/api
COPY migrations migrations
COPY scripts scripts

# Ảnh sản phẩm khi MEDIA_STORAGE_DRIVER=local. Volume mới gắn vào đây nhận quyền của thư mục này,
# nên tiến trình chạy bằng user `node` vẫn ghi được.
RUN mkdir -p /data/media && chown node:node /data/media

ENV NODE_ENV=production
USER node
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["/app/node_modules/.bin/tsx", "src/entrypoints/http.ts"]
