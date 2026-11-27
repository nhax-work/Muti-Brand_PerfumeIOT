-- Bảo trì định kỳ theo từng máy: gán nhân viên cố định, chu kỳ (ngày) và mốc bảo trì tiếp theo.
ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS periodic_maintenance_staff_id uuid REFERENCES users (id),
  ADD COLUMN IF NOT EXISTS periodic_maintenance_interval_days int NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS next_periodic_maintenance_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_periodic_maintenance_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_periodic_reminder_for timestamptz;

CREATE INDEX IF NOT EXISTS idx_machines_periodic_due
  ON machines (next_periodic_maintenance_at)
  WHERE periodic_maintenance_staff_id IS NOT NULL AND next_periodic_maintenance_at IS NOT NULL;
