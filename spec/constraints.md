# Ngưỡng số

**Đây là nguồn duy nhất.** Mọi giá trị dưới đây phải đọc từ cấu hình, không hardcode trong code.

## Thiết bị và kết nối

| Hằng | Giá trị | FR |
|---|---|---|
| `HEARTBEAT_INTERVAL_SEC` | 30 | FR-IOT-01 |
| `MACHINE_UNSTABLE_MISSED` | 2 | FR-IOT-02 |
| `MACHINE_OFFLINE_SEC` | 90 | FR-IOT-03 |
| `DEVICE_EVENT_BUFFER_MIN` | 500 | NFR-REL-05 |

## Đơn hàng và lệnh xịt

| Hằng | Giá trị | FR |
|---|---|---|
| `ORDER_PAYMENT_TTL_SEC` | 300 | FR-ORD-09 |
| `ORDER_STATUS_POLL_MAX_SEC` | 3 | FR-ORD-11 |
| `DISPENSE_CMD_TTL_SEC` | 60 | FR-DSP-06 |
| `DISPENSE_RESULT_TIMEOUT_SEC` | 60 | FR-DSP-18 |
| `WEBHOOK_TO_ACTUATION_MAX_SEC` | 5 | NFR-PER-03 |

## An toàn thiết bị

| Hằng | Giá trị | FR |
|---|---|---|
| `ACTUATOR_MAX_MS` | 800 | NFR-SAF-01 |
| `ACTUATOR_RUN_MS` | 500 | hiệu chuẩn theo từng slot |

`ACTUATOR_MAX_MS` là hard timeout ở firmware, nằm ngoài mọi logic nghiệp vụ.

## Xác thực

| Hằng | Giá trị | FR |
|---|---|---|
| `ACCESS_TOKEN_TTL_MIN` | 60 | FR-AUTH-02 |
| `REFRESH_TOKEN_TTL_DAYS` | 7 | FR-AUTH-02 |
| `LOGIN_LOCKOUT_ATTEMPTS` | 5 | FR-AUTH-03 |
| `LOGIN_LOCKOUT_MIN` | 15 | FR-AUTH-03 |
| `SESSION_REVOKE_MAX_SEC` | 60 | FR-AUTH-10 |

## Hợp đồng thuê slot

| Hằng | Giá trị | FR |
|---|---|---|
| `RENTAL_EXPIRING_DAYS` | 7 | FR-EXP-05 |
| `RENTAL_NOTICE_DAYS` | [7, 3] | FR-EXP-01, FR-EXP-02 |
| `GRACE_FEE_RATE_DEFAULT` | 0.05 | FR-EXP-10 |

`GRACE_FEE_RATE_DEFAULT` cấu hình theo từng hợp đồng. Phí = tỷ lệ × giá chai × số chai tồn.

## Tồn kho và cảnh báo

| Hằng | Giá trị | FR |
|---|---|---|
| `DOOR_OPEN_ALERT_MIN` | 5 | FR-ALR-03 |
| `CONSECUTIVE_FAIL_ALERT` | 3 | FR-ALR-04 |
| `LEAK_DETECT_THRESHOLD_PCT` | 20 | FR-INV-19 |
| `BATCH_EXPIRY_WARN_DAYS` | 30 | FR-INV-20 |
| `INVENTORY_TOLERANCE_PCT` | 10 | BR-005 |

## Kiosk và giới hạn

| Hằng | Giá trị | FR |
|---|---|---|
| `KIOSK_IDLE_TIMEOUT_SEC` | 60 | NFR-USA-02 |
| `KIOSK_MIN_FONT_PX` | 18 | NFR-USA-04 |
| `ORDER_RATE_LIMIT_PER_MIN` | 10 | NFR-SEC-06 |
| `KIOSK_SELECT_RESPONSE_MAX_MS` | 500 | NFR-PER-01 |
