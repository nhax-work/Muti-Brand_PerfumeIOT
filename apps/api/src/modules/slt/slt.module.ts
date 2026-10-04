import { Module } from '@nestjs/common';
import { MchModule } from '../mch/index.js';
import {
  RentalPackagesController,
  SlotRentPriceController,
  StoragePlansController,
} from './catalog.http.js';
import { CatalogQueries } from './catalog.queries.js';
import { CatalogService } from './catalog.service.js';
import { RentalCheckoutsController, SlotRentalQuoteController, SltController } from './slt.http.js';
import { SltQueries } from './slt.queries.js';
import { SltService } from './slt.service.js';

@Module({
  // MchModule: PUT /slots/{id}/rent-price trả MachineSlot dựng bằng MchService (FR-SLT-32).
  imports: [MchModule],
  controllers: [
    SltController,
    RentalCheckoutsController,
    SlotRentalQuoteController,
    RentalPackagesController,
    StoragePlansController,
    SlotRentPriceController,
  ],
  providers: [SltService, SltQueries, CatalogService, CatalogQueries],
  exports: [SltService, CatalogService],
})
export class SltModule {}
