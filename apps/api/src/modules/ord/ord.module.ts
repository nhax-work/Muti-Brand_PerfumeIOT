import { Module } from '@nestjs/common';
import { OrdHttp } from './ord.http.js';
import { OrdQueries } from './ord.queries.js';
import { OrdService } from './ord.service.js';

@Module({
  controllers: [OrdHttp],
  providers: [OrdService, OrdQueries],
  exports: [OrdService],
})
export class OrdModule {}
