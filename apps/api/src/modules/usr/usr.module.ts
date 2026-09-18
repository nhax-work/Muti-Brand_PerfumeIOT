import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/index.js';
import { UsrController } from './usr.http.js';
import { UsrQueries } from './usr.queries.js';
import { UsrService } from './usr.service.js';

@Module({
  imports: [AuthModule],
  controllers: [UsrController],
  providers: [UsrQueries, UsrService],
})
export class UsrModule {}
