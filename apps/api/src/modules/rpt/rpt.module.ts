import { Module } from '@nestjs/common';
import { RptController } from './rpt.http.js';
import { RptQueries } from './rpt.queries.js';
import { RptService } from './rpt.service.js';

@Module({
  controllers: [RptController],
  providers: [RptService, RptQueries],
  exports: [RptService],
})
export class RptModule {}
