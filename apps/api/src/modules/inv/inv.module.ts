import { Module } from '@nestjs/common';
import {
  BottlesController,
  InventoryBatchesController,
  RefillSessionsController,
  ShipmentDeclarationsController,
} from './inv.http.js';
import { SltModule } from '../slt/index.js';
import { InvQueries } from './inv.queries.js';
import { InvService } from './inv.service.js';

@Module({
  imports: [SltModule],
  controllers: [
    ShipmentDeclarationsController,
    InventoryBatchesController,
    BottlesController,
    RefillSessionsController,
  ],
  providers: [InvQueries, InvService],
  exports: [InvService],
})
export class InvModule {}
