# ScentStation — các lệnh chuẩn. Agent và CI đều dùng file này.
.PHONY: help up down logs reset migrate seed test test-unit test-integration \
        test-contract test-e2e check-traceability lint fmt check

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	 awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

up:                    ## Dựng hạ tầng (db, redis, mqtt)
	docker compose up -d
	@echo "Chờ healthcheck..."
	@docker compose ps

down:                  ## Dừng hạ tầng
	docker compose down

logs:                  ## Xem log
	docker compose logs -f

reset:                 ## XÓA SẠCH dữ liệu và dựng lại
	docker compose down -v
	docker compose up -d

migrate:               ## Chạy migration
	@echo "TODO tuần 2: thay bằng lệnh migrate của stack đã chọn"
	@echo "  vd: alembic upgrade head | npx prisma migrate deploy | dotnet ef database update"

seed:                  ## Nạp dữ liệu mẫu: 1 máy, 4 slot, 2 brand mỗi bên 2 slot
	@echo "TODO tuần 2: chạy scripts/seed.*"

test: test-unit test-integration test-contract  ## Toàn bộ test (trừ e2e)

test-unit:             ## Test logic thuần
	@echo "TODO tuần 2"

test-integration:      ## Test có CSDL thật
	@echo "TODO tuần 2"

test-contract:         ## Kiểm hiện thực khớp openapi.yaml và mqtt.md
	@echo "TODO tuần 2"

test-e2e:              ## Test đầu-cuối với Device Simulator
	@echo "TODO tuần 5"

check-traceability:    ## FR ưu tiên M nào chưa có test
	python3 scripts/check_traceability.py

lint:                  ## Kiểm tra style
	@echo "TODO tuần 2"

fmt:                   ## Tự format
	@echo "TODO tuần 2"

check: lint test check-traceability  ## Chạy đúng những gì CI chạy
