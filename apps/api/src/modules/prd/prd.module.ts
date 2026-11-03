import { Module } from '@nestjs/common';
import { PrdController } from './prd.http.js';
import { PrdQueries } from './prd.queries.js';
import { ProductImageService } from './product-image.service.js';
import { PrdService } from './prd.service.js';

@Module({
  controllers: [PrdController],
  providers: [PrdService, ProductImageService, PrdQueries],
  exports: [PrdService],
})
export class PrdModule {}
