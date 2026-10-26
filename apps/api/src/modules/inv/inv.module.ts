import { Module } from '@nestjs/common';
import { RfqModule } from '../rfq/index.js';
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
  // Chai hư hỏng sinh khoản bồi thường; phiếu nạp nối yêu cầu bổ sung — cùng transaction (ADR-0018).
  imports: [SltCompensationModule, RfqModule],
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
