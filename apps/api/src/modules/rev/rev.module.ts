import { Module } from '@nestjs/common';
import { BrandPayoutsController, RevenueController } from './rev.http.js';
import { RevQueries } from './rev.queries.js';
import { RevService } from './rev.service.js';

@Module({
  controllers: [BrandPayoutsController, RevenueController],
  providers: [RevQueries, RevService],
  exports: [RevService],
})
export class RevModule {}
