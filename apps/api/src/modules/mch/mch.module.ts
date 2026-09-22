import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/index.js';
import { LocationsController, MachinesController, SlotsController } from './mch.http.js';
import { MchQueries } from './mch.queries.js';
import { MchService } from './mch.service.js';

@Module({
  imports: [AuthModule],
  controllers: [LocationsController, MachinesController, SlotsController],
  providers: [MchQueries, MchService],
  exports: [MchService, MchQueries],
})
export class MchModule {}
