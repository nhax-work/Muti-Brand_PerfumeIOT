import { Module } from '@nestjs/common';
import { OrdModule } from '../ord/index.js';
import { SltModule } from '../slt/index.js';
import { AuditLogsController } from './aud.http.js';
import { AudQueries } from './aud.queries.js';
import { AudService } from './aud.service.js';

/** Không module nào import AUD, nên import ORD và SLT ở đây không tạo vòng phụ thuộc. */
@Module({
  imports: [OrdModule, SltModule],
  controllers: [AuditLogsController],
  providers: [AudQueries, AudService],
  exports: [AudService],
})
export class AudModule {}
