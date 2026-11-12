import { Module } from '@nestjs/common';
import { MntController } from './mnt.http.js';
import { MntQueries } from './mnt.queries.js';
import { MntService } from './mnt.service.js';

@Module({
  controllers: [MntController],
  providers: [MntQueries, MntService],
  exports: [MntQueries, MntService],
})
export class MntModule {}
