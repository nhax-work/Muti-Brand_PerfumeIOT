import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/index.js';
import { DspModule } from '../dsp/index.js';
import { OrdModule } from '../ord/index.js';
import { MachineModeService } from './machine-mode.service.js';
import {
  AvailableSlotsController,
  LocationsController,
  MachineSalesStopsController,
  MachinesController,
  SlotsController,
} from './mch.http.js';
import { MchQueries } from './mch.queries.js';
import { MchService } from './mch.service.js';
import { SalesStopsService } from './sales-stops.service.js';

@Module({
  // ORD và DSP không import MCH, nên không tạo vòng phụ thuộc module.
  imports: [AuthModule, OrdModule, DspModule],
  // AvailableSlotsController đứng trước SlotsController: `/slots/available` phải khớp trước `/slots/:id`.
  controllers: [
    LocationsController,
    MachinesController,
    AvailableSlotsController,
    SlotsController,
    MachineSalesStopsController,
  ],
  providers: [MchQueries, MchService, MachineModeService, SalesStopsService],
  exports: [MchService, MchQueries],
})
export class MchModule {}
