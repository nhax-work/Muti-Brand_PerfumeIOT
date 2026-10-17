-- Up Migration
--
-- ADR-0015 mục 3: Mỗi máy tối đa một đơn ở CREATED / PENDING_PAYMENT.
-- Đơn thứ hai bị từ chối MACHINE_BUSY.
--

CREATE UNIQUE INDEX uq_machine_open_order ON orders (machine_id)
    WHERE status IN ('CREATED', 'PENDING_PAYMENT');

-- Down Migration
DROP INDEX IF EXISTS uq_machine_open_order;
