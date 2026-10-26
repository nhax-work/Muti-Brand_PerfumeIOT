import { Module } from '@nestjs/common';
import { SltCompensationModule } from '../slt/index.js';
import {
  BottlesController,
  InventoryBatchesController,
  RefillSessionsController,
  ShipmentDeclarationsController,
} from './inv.http.js';
import { InvQueries } from './inv.queries.js';
import { InvService } from './inv.service.js';

@Module({
  // Chai hư hỏng sinh khoản bồi thường trong cùng transaction (FR-SLT-44, ADR-0018).
  imports: [SltCompensationModule],
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
