# ScentStation — các lệnh chuẩn. Agent và CI đều dùng file này.
.PHONY: help up wait-db down logs reset migrate seed test test-unit test-integration \
        test-contract test-e2e check-traceability lint fmt check

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	 awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

up:                    ## Dựng hạ tầng (db, redis, mqtt)
	docker compose up -d
	@$(MAKE) --no-print-directory wait-db
	@docker compose ps

# Chờ THẬT, không chỉ in "Chờ healthcheck..." rồi chạy tiếp. `make reset && make migrate` là lệnh
# kiểm migration chuẩn của dự án (spec/PROJECT.md §3); thiếu bước chờ này thì trên máy nguội
# migrate sẽ chạy trước khi Postgres mở cổng và fail với lỗi kết nối khó hiểu.
wait-db:
	@echo "Chờ Postgres sẵn sàng..."
	@i=0; while [ $$i -lt 60 ]; do \
		if [ "$$(docker inspect -f '{{.State.Health.Status}}' scent-db 2>/dev/null)" = "healthy" ]; then \
			echo "  scent-db healthy"; exit 0; \
		fi; \
		i=$$((i+1)); sleep 2; \
	done; \
	echo "  scent-db không healthy sau 120 giây — xem 'make logs'"; exit 1

down:                  ## Dừng hạ tầng
	docker compose down

logs:                  ## Xem log
	docker compose logs -f

reset:                 ## XÓA SẠCH dữ liệu và dựng lại
	docker compose down -v
	@$(MAKE) --no-print-directory up

migrate:               ## Chạy migration (node-pg-migrate, xem docs/MIGRATIONS.md)
	npm run db:migrate

seed:                  ## Nạp dữ liệu mẫu: 1 máy, 4 slot, 2 brand mỗi bên 2 slot
	npm run db:seed

test: test-unit test-integration test-contract  ## Toàn bộ test (trừ e2e)

test-unit:             ## Test logic thuần
	npm run test:unit

test-integration:      ## Test có CSDL thật
	npm run test:integration

test-contract:         ## Kiểm hiện thực khớp openapi.yaml và mqtt.md
	npm run check:openapi
	npm run test:contract

test-e2e:              ## Test đầu-cuối với Device Simulator
	@echo "TODO tuần 5: cần scripts/device-simulator.ts"

check-traceability:    ## FR ưu tiên M nào chưa có test
	npm run check:traceability

lint:                  ## Kiểm tra style
	npm run lint

fmt:                   ## Tự format
	npm run fmt

check: lint test check-traceability  ## Chạy đúng những gì CI chạy
