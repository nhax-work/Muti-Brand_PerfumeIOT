/**
 * Cửa vào scheduler (ADR-0003). Hiện chạy chung tiến trình với HTTP.
 *
 * Mọi job đều chịu được chạy trễ hay chạy bù sau downtime: chúng quét trạng thái trong CSDL theo
 * mốc thời gian, không dựa vào việc đã chạy đúng giờ.
 */

import { Logger, type INestApplicationContext } from '@nestjs/common';
import { AlrService } from '../modules/alr/index.js';
import { DspJobs } from '../modules/dsp/index.js';
import { OrdService, RefundClaimsService } from '../modules/ord/index.js';
import { RevService } from '../modules/rev/index.js';
import { SltJobs } from '../modules/slt/index.js';
import { IotMqttGateway } from '../modules/iot/iot.mqtt.js';

/** Nhịp điều phối lệnh xịt — đủ nhanh cho WEBHOOK_TO_ARMED_MAX_SEC (NFR-PER-03). */
const DSP_TICK_MS = 1000;
/** Quét đơn quá hạn thanh toán (FR-ORD-16); kiosk poll cũng tự chuyển EXPIRED nên không cần dày. */
const ORDER_EXPIRY_TICK_MS = 30_000;
/** Quét phiên thuê slot quá hạn giữ chỗ (FR-SLT-39). */
const RENTAL_CHECKOUT_EXPIRY_TICK_MS = 60_000;
/**
 * Phiếu khiếu nại hoàn tiền: hết hạn, cảnh báo quá SLA, xóa liên hệ (FR-ORD-31, 32). Các mốc tính
 * bằng giờ và ngày nên năm phút một lần là đủ.
 */
const REFUND_CLAIM_TICK_MS = 5 * 60_000;
/**
 * Kỳ chi trả doanh thu: cộng dồn DRAFT, chốt CONFIRMED khi hết tháng (FR-SLT-52). Số DRAFT là số tạm
 * nên trễ vài phút không sao; mốc chốt kỳ tính theo dữ liệu nên chạy trễ vẫn đúng.
 */
const PAYOUT_TICK_MS = 5 * 60_000;
/**
 * Gửi email thông báo tiền/hàng đã xếp hàng (FR-ALR-16, ADR-0017). Khoảng thử lại do
 * EMAIL_RETRY_INTERVAL_MIN quyết định ở truy vấn; nhịp này chỉ cần đủ nhanh cho email mới.
 */
const EMAIL_TICK_MS = 30_000;

export interface SchedulerOptions {
  /** Chạy vòng điều phối lệnh xịt — chỉ bật khi đã kết nối MQTT. */
  readonly dispense: boolean;
}

/** @returns hàm dừng mọi job */
export function startScheduler(
  app: INestApplicationContext,
  options: SchedulerOptions,
): () => void {
  const logger = new Logger('Scheduler');
  const timers: NodeJS.Timeout[] = [];

  if (options.dispense) {
    const dsp = app.get(DspJobs);
    const iot = app.get(IotMqttGateway);
    let deviceTickRunning = false;
    const tickDevices = async () => {
      if (deviceTickRunning) return;
      deviceTickRunning = true;
      try {
        // Publish cấu hình trước lệnh đầu tiên: ESP boot ở DISABLED cho tới khi nhận config.
        const configPublished = await iot.tick();
        await dsp.tick(configPublished);
      } finally {
        deviceTickRunning = false;
      }
    };
    void tickDevices();
    timers.push(setInterval(() => void tickDevices(), DSP_TICK_MS));
  }

  const orders = app.get(OrdService);
  let expiring = false;
  timers.push(
    setInterval(() => {
      if (expiring) return;
      expiring = true;
      orders
        .expireOverdueOrders()
        .then((n) => n > 0 && logger.log(`Đã chuyển ${n} đơn quá hạn thanh toán sang EXPIRED`))
        .catch((e: unknown) => logger.error(`Quét đơn quá hạn lỗi: ${String(e)}`))
        .finally(() => (expiring = false));
    }, ORDER_EXPIRY_TICK_MS),
  );

  const slt = app.get(SltJobs);
  let cancellingCheckouts = false;
  timers.push(
    setInterval(() => {
      if (cancellingCheckouts) return;
      cancellingCheckouts = true;
      slt
        .cancelExpiredCheckouts()
        .then((n) => n > 0 && logger.log(`Đã hủy ${n} phiên thuê slot quá hạn giữ chỗ`))
        .catch((e: unknown) => logger.error(`Hủy phiên thuê slot quá hạn lỗi: ${String(e)}`))
        .finally(() => (cancellingCheckouts = false));
    }, RENTAL_CHECKOUT_EXPIRY_TICK_MS),
  );

  let activatingStockingOverdue = false;
  const activateStockingOverdue = () => {
    if (activatingStockingOverdue) return;
    activatingStockingOverdue = true;
    slt
      .autoActivateStockingOverdue()
      .then((n) => n > 0 && logger.log(`Đã tự kích hoạt ${n} hóa đơn quá hạn lưu kho`))
      .catch((e: unknown) => logger.error(`Tự kích hoạt hóa đơn quá hạn lỗi: ${String(e)}`))
      .finally(() => (activatingStockingOverdue = false));
  };
  // Chạy ngay khi khởi động để bù hóa đơn quá hạn trong lúc dịch vụ tắt (FR-SLT-42 AC2).
  activateStockingOverdue();
  timers.push(setInterval(activateStockingOverdue, RENTAL_CHECKOUT_EXPIRY_TICK_MS));

  let handlingExpiry = false;
  const handleExpiryJobs = () => {
    if (handlingExpiry) return;
    handlingExpiry = true;
    Promise.all([
      slt.scanExpiringRentals(),
      slt.sendExpiringNotices(),
      slt.autoTransitionToGrace(),
      slt.calculateDailyGraceFees(),
      slt.autoTransitionToLiquidated(),
    ])
      .then(([expiringCount, noticesCount, graceCount, feeCount, liquidatedCount]) => {
        if (expiringCount > 0) logger.log(`Đã chuyển ${expiringCount} hóa đơn sang EXPIRING`);
        if (noticesCount > 0) logger.log(`Đã gửi ${noticesCount} thông báo hết hạn T-7/T-3`);
        if (graceCount > 0) logger.log(`Đã xử lý ${graceCount} hóa đơn chuyển GRACE/RENEWED`);
        if (feeCount > 0) logger.log(`Đã tính phí lưu kho ân hạn cho ${feeCount} hóa đơn`);
        if (liquidatedCount > 0) logger.log(`Đã chuyển ${liquidatedCount} hóa đơn sang thanh lý`);
      })
      .catch((e: unknown) => logger.error(`Quét hết hạn và ân hạn lỗi: ${String(e)}`))
      .finally(() => (handlingExpiry = false));
  };
  // Chạy ngay khi khởi động để bù kiểm tra hết hạn / ân hạn trong lúc dịch vụ tắt
  handleExpiryJobs();
  timers.push(setInterval(handleExpiryJobs, RENTAL_CHECKOUT_EXPIRY_TICK_MS));

  const claims = app.get(RefundClaimsService);
  let maintainingClaims = false;
  timers.push(
    setInterval(() => {
      if (maintainingClaims) return;
      maintainingClaims = true;
      claims
        .runMaintenance()
        .then(({ expired, alerted, contactsPurged }) => {
          if (expired + alerted + contactsPurged > 0) {
            logger.log(
              `Phiếu khiếu nại: ${expired} hết hạn, ${alerted} cảnh báo quá SLA, ${contactsPurged} xóa liên hệ`,
            );
          }
        })
        .catch((e: unknown) => logger.error(`Bảo trì phiếu khiếu nại lỗi: ${String(e)}`))
        .finally(() => (maintainingClaims = false));
    }, REFUND_CLAIM_TICK_MS),
  );

  const rev = app.get(RevService);
  let refreshingPayouts = false;
  const refreshPayouts = () => {
    if (refreshingPayouts) return;
    refreshingPayouts = true;
    rev
      .refreshPayouts()
      .catch((e: unknown) => logger.error(`Cập nhật kỳ chi trả lỗi: ${String(e)}`))
      .finally(() => (refreshingPayouts = false));
  };
  // Chạy ngay khi khởi động để bù kỳ lỡ chốt trong lúc dịch vụ tắt.
  refreshPayouts();
  timers.push(setInterval(refreshPayouts, PAYOUT_TICK_MS));

  const alr = app.get(AlrService);
  let dispatchingEmails = false;
  const dispatchEmails = () => {
    if (dispatchingEmails) return;
    dispatchingEmails = true;
    alr
      .dispatchDueEmails()
      .then(({ sent, failed }) => {
        if (sent + failed > 0) logger.log(`Email thông báo: ${sent} đã gửi, ${failed} lỗi`);
      })
      .catch((e: unknown) => logger.error(`Gửi email thông báo lỗi: ${String(e)}`))
      .finally(() => (dispatchingEmails = false));
  };
  // Chạy ngay khi khởi động để gửi bù email xếp hàng trong lúc dịch vụ tắt.
  dispatchEmails();
  timers.push(setInterval(dispatchEmails, EMAIL_TICK_MS));

  logger.log(
    `Đã bật job: hết hạn đơn, hết hạn phiên thuê slot, tự kích hoạt hóa đơn quá hạn lưu kho, phiếu khiếu nại, kỳ chi trả, gửi email${options.dispense ? ', điều phối lệnh xịt' : ''}`,
  );
  return () => timers.forEach(clearInterval);
}
