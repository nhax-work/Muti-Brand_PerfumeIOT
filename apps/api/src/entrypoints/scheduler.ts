/**
 * Cửa vào scheduler (ADR-0003). Hiện chạy chung tiến trình với HTTP.
 *
 * Mọi job đều chịu được chạy trễ hay chạy bù sau downtime: chúng quét trạng thái trong CSDL theo
 * mốc thời gian, không dựa vào việc đã chạy đúng giờ.
 */

import { Logger, type INestApplicationContext } from '@nestjs/common';
import { DspJobs } from '../modules/dsp/index.js';
import { OrdService } from '../modules/ord/index.js';
import { SltJobs } from '../modules/slt/index.js';

/** Nhịp điều phối lệnh xịt — đủ nhanh cho WEBHOOK_TO_ARMED_MAX_SEC (NFR-PER-03). */
const DSP_TICK_MS = 1000;
/** Quét đơn quá hạn thanh toán (FR-ORD-16); kiosk poll cũng tự chuyển EXPIRED nên không cần dày. */
const ORDER_EXPIRY_TICK_MS = 30_000;
/** Quét phiên thuê slot quá hạn giữ chỗ (FR-SLT-39). */
const RENTAL_CHECKOUT_EXPIRY_TICK_MS = 60_000;

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
    timers.push(setInterval(() => void dsp.tick(), DSP_TICK_MS));
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

  logger.log(
    `Đã bật job: hết hạn đơn, hết hạn phiên thuê slot${options.dispense ? ', điều phối lệnh xịt' : ''}`,
  );
  return () => timers.forEach(clearInterval);
}
