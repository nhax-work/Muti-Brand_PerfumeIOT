/**
 * Trừ lượng còn lại sau lượt xịt thành công (FR-INV-09 ÷ 12, ADR-0019).
 *
 * DSP gọi TRONG transaction đóng lệnh (`tx`), một lần cho mỗi lệnh `SUCCEEDED`. Không mở transaction
 * mới, không commit/rollback.
 */

import type { Transaction } from 'kysely';
import type { DB } from '../../shared/db/index.js';

export interface DoseConsumer {
  consumeDose(tx: Transaction<DB>, slotId: string, at: Date): Promise<void>;
}

/**
 * Token DI. INV cung cấp qua module @Global (`modules/inv/dose-consumption.handler.ts`) để DSP không
 * import INV — INV đã import SLT, mà SLT kéo theo MCH → DSP, nên import ngược sẽ thành vòng.
 */
export const DOSE_CONSUMER = Symbol('DOSE_CONSUMER');
