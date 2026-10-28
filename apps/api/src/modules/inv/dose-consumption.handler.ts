/**
 * Trừ lượng còn lại sau lượt xịt thành công (FR-INV-09 ÷ 12, FR-ALR-02, ADR-0019). Máy không có load
 * cell: lượng còn lại = lượng ban đầu − Σ liều hiệu chuẩn của các lượt thành công.
 *
 * Chạy TRONG transaction đóng lệnh của DSP (`tx`). DSP chỉ gọi khi lệnh vừa chuyển `SUCCEEDED`, nên
 * RESULT gửi lại — bị bỏ qua vì lệnh đã đóng — không trừ lần hai.
 */

import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { DEFAULT_LOCALE, translate } from '@scentstation/i18n';
import type { Transaction } from 'kysely';
import type { DB } from '../../shared/db/index.js';
import { DOSE_CONSUMER, type DoseConsumer } from '../dsp/index.js';
import { InvQueries } from './inv.queries.js';

@Injectable()
export class InvDoseConsumer implements DoseConsumer {
  constructor(@Inject(InvQueries) private readonly queries: InvQueries) {}

  /**
   * Trừ một liều `calibrated_dosage_ml` khỏi chai đang lắp, khách hay chẩn đoán (FR-INV-10). Slot không
   * có chai hoặc chưa hiệu chuẩn thì không có gì để trừ. Cảnh báo chỉ sinh lúc vượt ngưỡng, không sinh
   * lại ở mỗi lượt sau đó (FR-INV-11, FR-INV-12).
   */
  async consumeDose(tx: Transaction<DB>, slotId: string, at: Date): Promise<void> {
    const stock = await this.queries.lockSlotStock(slotId, tx);
    if (!stock || stock.calibratedDosageMl === null) return;
    const dosage = toUnits(stock.calibratedDosageMl);
    if (dosage <= 0) return;

    const before = toUnits(stock.currentEstimatedMl);
    const after = Math.max(before - dosage, 0);
    const threshold =
      stock.lowStockThresholdMl === null ? null : toUnits(stock.lowStockThresholdMl);
    const empty = after < dosage;
    const low = threshold !== null && after < threshold;
    const remainingMl = fromUnits(after);

    // Chỉ chai đang bán đổi trạng thái theo lượng còn lại; trạng thái khác giữ nguyên.
    const selling = stock.bottleStatus === 'INSTALLED' || stock.bottleStatus === 'LOW';
    await this.queries.setBottleStock(
      stock.bottleId,
      {
        remainingMl,
        status: !selling ? stock.bottleStatus : empty ? 'EMPTY' : low ? 'LOW' : stock.bottleStatus,
      },
      tx,
    );
    await this.queries.setSlotStock(
      stock.slotId,
      {
        remainingMl,
        sprays: Math.floor(after / dosage),
        status: empty && stock.slotStatus === 'AVAILABLE' ? 'UNAVAILABLE' : stock.slotStatus,
      },
      tx,
    );

    const params = {
      slot: stock.slotNumber,
      remainingMl: Number(remainingMl),
      sprays: Math.floor(after / dosage),
      thresholdMl: threshold === null ? 0 : Number(fromUnits(threshold)),
      dosageMl: Number(stock.calibratedDosageMl),
    };
    const target = { brandId: stock.brandId, machineId: stock.machineId, slotId: stock.slotId, at };
    if (threshold !== null && low && before >= threshold) {
      await this.queries.raiseStockAlert(
        {
          ...target,
          type: 'LOW_STOCK',
          title: translate(DEFAULT_LOCALE, 'inv.lowStockAlertTitle', params),
          description: translate(DEFAULT_LOCALE, 'inv.lowStockAlertContent', params),
        },
        tx,
      );
    }
    if (empty && before >= dosage) {
      await this.queries.raiseStockAlert(
        {
          ...target,
          type: 'SLOT_EMPTY',
          title: translate(DEFAULT_LOCALE, 'inv.slotEmptyAlertTitle', params),
          description: translate(DEFAULT_LOCALE, 'inv.slotEmptyAlertContent', params),
        },
        tx,
      );
    }
  }
}

/** Lượng ml (numeric 4 chữ số thập phân) quy ra số nguyên phần vạn ml để cộng trừ không lệch số. */
function toUnits(ml: string): number {
  return Math.round(Number(ml) * 10_000);
}

function fromUnits(units: number): string {
  return (units / 10_000).toFixed(4);
}

/**
 * @Global để DspModule nhận được handler mà không import INV (tránh vòng file inv → slt → mch → dsp).
 */
@Global()
@Module({
  providers: [InvQueries, { provide: DOSE_CONSUMER, useClass: InvDoseConsumer }],
  exports: [DOSE_CONSUMER],
})
export class InvDoseConsumptionModule {}
