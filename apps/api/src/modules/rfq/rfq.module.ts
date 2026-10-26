import { Module } from '@nestjs/common';
import { RefillRequestsController } from './rfq.http.js';
import { RfqQueries } from './rfq.queries.js';
import { RfqService } from './rfq.service.js';

/**
 * Yêu cầu bổ sung (FR-RFQ-01 ÷ 12). Không import module nghiệp vụ nào (AlrService là @Global), nên INV
 * import được để nối phiếu nạp với yêu cầu mà không tạo vòng phụ thuộc.
 */
@Module({
  controllers: [RefillRequestsController],
  providers: [RfqQueries, RfqService],
  exports: [RfqService],
})
export class RfqModule {}
