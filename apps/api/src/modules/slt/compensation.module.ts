import { Module } from '@nestjs/common';
import { StorageCompensationsController } from './compensation.http.js';
import { CompensationQueries } from './compensation.queries.js';
import { CompensationService } from './compensation.service.js';

/**
 * Bảo hiểm hàng hóa (FR-SLT-44 ÷ 46) tách khỏi `SltModule`: INV gọi `CompensationService` trong
 * transaction đánh dấu chai hư hỏng, còn `SltModule` kéo theo MCH → ORD/DSP. Module này không import
 * module nghiệp vụ nào (AlrService là @Global), nên INV import nó không tạo vòng phụ thuộc.
 */
@Module({
  controllers: [StorageCompensationsController],
  providers: [CompensationQueries, CompensationService],
  exports: [CompensationService],
})
export class SltCompensationModule {}
