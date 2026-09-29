-- Up Migration
--
-- ADR-0007 — bước 2/2: mỗi máy tối đa một lệnh xịt khách hàng đang hiệu lực (FR-DSP-26).
--
-- Với nút bấm vật lý, lệnh ACKNOWLEDGED nghĩa là đèn nút đang sáng chờ khách bấm. Hai lệnh CUSTOMER
-- cùng hiệu lực trên một máy nghĩa là hai nút sáng cùng lúc — người sau bấm được lượt của người trước.
-- Cưỡng chế ở CSDL, không chỉ ở code: đơn thanh toán sau giữ ở PAID ("chờ lượt") cho tới khi lệnh
-- trước kết thúc. Lệnh DIAGNOSTIC không chờ bấm nên không nằm trong ràng buộc.

CREATE UNIQUE INDEX uq_machine_active_customer_command ON dispense_commands (machine_id)
    WHERE command_type = 'CUSTOMER'
      AND status IN ('CREATED', 'SENT', 'ACKNOWLEDGED');

COMMENT ON COLUMN dispense_commands.expires_at IS
    'created_at + DISPENSE_CMD_TTL_SEC (FR-DSP-06): hạn để thiết bị NHẬN lệnh và sáng đèn nút. Thời '
    'gian khách được bấm là DISPENSE_PRESS_WINDOW_SEC, tính từ lúc sáng đèn (ADR-0007).';
COMMENT ON COLUMN dispense_commands.acknowledged_at IS
    'Lệnh CUSTOMER: lúc đèn nút của slot đích sáng, bắt đầu chờ khách bấm (FR-DSP-11, FR-DSP-21). '
    'Lệnh DIAGNOSTIC: lúc thiết bị nhận lệnh, kích hoạt ngay sau đó (FR-DSP-27).';


-- Down Migration

DROP INDEX IF EXISTS uq_machine_active_customer_command;
COMMENT ON COLUMN dispense_commands.expires_at IS 'created_at + DISPENSE_CMD_TTL_SEC (FR-DSP-06).';
COMMENT ON COLUMN dispense_commands.acknowledged_at IS NULL;
