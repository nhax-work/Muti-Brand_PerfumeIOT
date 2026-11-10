# Cổng vào staging: Caddy cấp HTTPS (Let's Encrypt), phục vụ landing page, bản build tĩnh của web
# quản trị và kiosk, rồi chuyển /api sang backend. Hai app gọi API bằng đường dẫn tương đối `/api/v1` nên cùng
# origin, không cần CORS.

FROM node:22.15.1-bookworm-slim AS build
WORKDIR /app

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
COPY apps/admin-web apps/admin-web
COPY apps/kiosk apps/kiosk

# Vite chỉ đưa biến có tiền tố VITE_ vào bundle; giá trị được chốt lúc build.
ARG VITE_CLAIM_PAGE_URL=
ARG VITE_SUPPORT_CONTACT=
ENV VITE_CLAIM_PAGE_URL=$VITE_CLAIM_PAGE_URL \
    VITE_SUPPORT_CONTACT=$VITE_SUPPORT_CONTACT
RUN npm run build -w @scentstation/admin-web -w @scentstation/kiosk

FROM caddy:2.8.4-alpine
COPY infra/staging/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/admin-web/dist /srv/admin
COPY --from=build /app/apps/kiosk/dist /srv/kiosk
# Landing page là HTML/CSS tĩnh, không qua bước build.
COPY apps/landing /srv/landing
