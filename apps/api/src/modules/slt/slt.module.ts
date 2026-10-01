import { Module } from '@nestjs/common';
import { SltController } from './slt.http.js';
import { SltQueries } from './slt.queries.js';
import { SltService } from './slt.service.js';

@Module({
  controllers: [SltController],
  providers: [SltService, SltQueries],
  exports: [SltService],
})
export class SltModule {}
