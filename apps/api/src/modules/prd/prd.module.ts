import { Module } from '@nestjs/common';
import { PrdController } from './prd.http.js';
import { PrdQueries } from './prd.queries.js';
import { PrdService } from './prd.service.js';

@Module({
  controllers: [PrdController],
  providers: [PrdService, PrdQueries],
  exports: [PrdService],
})
export class PrdModule {}
