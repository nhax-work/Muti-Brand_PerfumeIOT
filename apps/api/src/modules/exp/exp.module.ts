/**
 * Module EXP — Trả hàng khi không gia hạn (FR-EXP-26 ÷ 28, ADR-0014).
 */

import { Module } from '@nestjs/common';
import { ExpHttp } from './exp.http.js';
import { ExpJobs } from './exp.jobs.js';
import { ExpQueries } from './exp.queries.js';
import { ExpService } from './exp.service.js';

@Module({
  controllers: [ExpHttp],
  providers: [ExpQueries, ExpService, ExpJobs],
  exports: [ExpQueries, ExpService, ExpJobs],
})
export class ExpModule {}
