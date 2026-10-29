/**
 * Scheduler quét thông báo nhắc nhở và thanh lý chai quá hạn nhận (FR-EXP-28, ADR-0014).
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ExpService } from './exp.service.js';

@Injectable()
export class ExpJobs {
  private readonly logger = new Logger('EXP/jobs');

  constructor(@Inject(ExpService) private readonly expService: ExpService) {}

  /**
   * Quét và gửi thông báo nhắc Brand Admin trước 3 ngày trước khi hết hạn nhận chai (FR-EXP-28).
   */
  async processReminders(): Promise<number> {
    try {
      const count = await this.expService.sendExpiringReminders();
      if (count > 0) {
        this.logger.log(`Đã gửi nhắc nhở cho ${count} phiếu trả hàng sắp hết hạn.`);
      }
      return count;
    } catch (err) {
      this.logger.error(`Lỗi khi quét gửi nhắc nhở phiếu trả hàng: ${String(err)}`);
      return 0;
    }
  }

  /**
   * Quét và tịch thu/thanh lý chai quá hạn RETURN_PICKUP_MAX_DAYS (FR-EXP-28).
   */
  async processForfeitures(): Promise<number> {
    try {
      const count = await this.expService.sweepOverdueForfeitures();
      if (count > 0) {
        this.logger.log(`Đã tịch thu/thanh lý cho ${count} phiếu trả hàng quá hạn nhận.`);
      }
      return count;
    } catch (err) {
      this.logger.error(`Lỗi khi quét tịch thu phiếu trả hàng quá hạn: ${String(err)}`);
      return 0;
    }
  }
}
