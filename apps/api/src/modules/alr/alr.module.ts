import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './alr.http.js';
import { AlrQueries } from './alr.queries.js';
import { AlrService } from './alr.service.js';

/**
 * @Global: mọi module nghiệp vụ gửi thông báo tiền/hàng qua `AlrService.notifyBrandAdmins`. Email gửi
 * qua `EMAIL_PROVIDER` của `EmailModule` (adapters/email).
 */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [AlrQueries, AlrService],
  exports: [AlrService],
})
export class AlrModule {}
