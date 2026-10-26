import { Module } from '@nestjs/common';
import { AudController } from './aud.http.js';
import { AudQueries } from './aud.queries.js';
import { AudService } from './aud.service.js';

@Module({
  controllers: [AudController],
  providers: [AudQueries, AudService],
  exports: [AudQueries, AudService],
})
export class AudModule {}
