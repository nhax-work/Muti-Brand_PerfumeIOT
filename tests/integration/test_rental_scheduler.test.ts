/**
 * NHÓM TEST TRỌNG YẾU — job chuyển trạng thái hóa đơn (spec/testing.md, lộ trình tuần 8, TV1).
 *
 * Phần đã có job ở `SltJobs`: hủy phiên quá giờ giữ chỗ, có bù sau downtime (FR-SLT-39) — test ở
 * `tests/integration/test_slt_job_expiry.test.ts`.
 *
 * Ba job còn lại thuộc việc tuần 8 của TV3 (và TV4 cho FR-SLT-24/42) và CHƯA có hiện thực tại commit
 * này, nên các ca dưới đây để `it.todo` — vitest báo chúng là "todo" trong mọi lần chạy, không xanh
 * giả. Tên ca cố ý không theo mẫu `test_FR_…`: `scripts/check-traceability.mjs` đếm mọi chuỗi có mẫu
 * đó, kể cả trong `it.todo`, và sẽ tưởng các FR này đã có test.
 *
 * Khi job có mặt: đổi `it.todo` thành `it`, đặt lại tên `test_FR_<MODULE>_<số>_<mô_tả>`, và đi qua job
 * thật trên CSDL thật (không mock đồng hồ CSDL — tua `clock` của job và đặt mốc thời gian bằng SQL như
 * `test_slt_job_expiry.test.ts`). Mỗi job phải: idempotent khi chạy lại, bù đủ sau downtime, ghi
 * AuditLog, và không đụng hóa đơn của slot khác.
 */

import { describe, it } from 'vitest';

describe('Job tự kích hoạt hóa đơn sau RENTAL_MAX_STOCKING_DAYS (FR-SLT-42)', () => {
  it.todo(
    'FR-SLT-42 — hóa đơn DRAFT đã thanh toán, quá paid_at + RENTAL_MAX_STOCKING_DAYS mà chưa lắp chai: job chuyển ACTIVE, starts_at = mốc hết hạn nạp, ends_at = starts_at + duration_months, gửi thông báo hiệu lực (FR-SLT-43, FR-ALR-16)',
  );
  it.todo(
    'FR-SLT-42 — hóa đơn DRAFT chưa thanh toán hoặc đã CANCELLED, hoặc chưa tới hạn: job không đụng tới',
  );
  it.todo(
    'FR-SLT-42 — chạy bù sau downtime: hóa đơn quá hạn trong lúc dịch vụ tắt vẫn được kích hoạt với starts_at là mốc hết hạn, không phải lúc job chạy; chạy lại lần hai không đổi gì',
  );
});

describe('Job chuyển ân hạn (FR-EXP-06, FR-EXP-07)', () => {
  it.todo(
    'FR-EXP-06 — hóa đơn EXPIRING quá ends_at, không báo không gia hạn: job chuyển GRACE, grace_ends_at = ends_at + GRACE_PERIOD_DEFAULT_DAYS, gửi email vào ân hạn',
  );
  it.todo(
    'FR-EXP-07 — hóa đơn đã được Super Admin ấn định grace_ends_at riêng: job giữ nguyên mốc đó',
  );
  it.todo(
    'FR-EXP-23 — hóa đơn đã báo không gia hạn: job KHÔNG chuyển GRACE mà đi luồng trả hàng, không phí ân hạn',
  );
  it.todo(
    'FR-REV-02 — trong GRACE đơn mới vẫn quy kết BRAND; sau khi job thanh lý (LIQUIDATED) đơn mới quy kết PLATFORM — đi qua POST /kiosk/orders như test_revenue_attribution',
  );
});

describe('Job quá hạn nhận hàng trả về (FR-EXP-28)', () => {
  it.todo(
    'FR-EXP-28 — phiếu trả hàng quá pickup_deadline chưa bàn giao: job chuyển chai RETURNED_TO_BRAND sang sở hữu nền tảng như thanh lý, ghi forfeited_at, hóa đơn CLOSED',
  );
  it.todo(
    'FR-EXP-28 — còn 3 ngày tới pickup_deadline: job gửi nhắc đúng một lần (reminder_sent_at), chạy lại không gửi lần hai',
  );
  it.todo(
    'FR-EXP-28 — phiếu đã bàn giao (handed_over_at có giá trị) không bao giờ bị chuyển sở hữu; bù sau downtime cho phiếu quá hạn trong lúc dịch vụ tắt',
  );
});
