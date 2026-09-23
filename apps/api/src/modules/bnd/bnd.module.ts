import { Module } from '@nestjs/common';
import { BndController } from './bnd.http.js';
import { BndQueries } from './bnd.queries.js';
import { BndService } from './bnd.service.js';

@Module({
  controllers: [BndController],
  providers: [BndService, BndQueries],
  exports: [BndService],
})
export class BndModule {}
