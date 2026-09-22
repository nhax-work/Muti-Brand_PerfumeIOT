import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/index.js';
import {
  AvailableSlotsController,
  LocationsController,
  MachinesController,
  SlotsController,
} from './mch.http.js';
import { MchQueries } from './mch.queries.js';
import { MchService } from './mch.service.js';

@Module({
  imports: [AuthModule],
  // AvailableSlotsController đứng trước SlotsController: `/slots/available` phải khớp trước `/slots/:id`.
  controllers: [LocationsController, MachinesController, AvailableSlotsController, SlotsController],
  providers: [MchQueries, MchService],
  exports: [MchService, MchQueries],
})
export class MchModule {}
