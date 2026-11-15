import { Global, Module } from '@nestjs/common';
import { BRAND_SIGNUP_LISTENER } from '../auth/index.js';
import { AlertsController } from './alerts.http.js';
import { NotificationsController } from './alr.http.js';
import { AlrQueries } from './alr.queries.js';
import { AlrService } from './alr.service.js';

/**
 * @Global: mọi module nghiệp vụ gửi thông báo tiền/hàng qua `AlrService.notifyBrandAdmins`. Email gửi
 * qua `EMAIL_PROVIDER` của `EmailModule` (adapters/email). Cũng cung cấp `BRAND_SIGNUP_LISTENER` cho
 * auth — auth khai cổng chứ không import ALR, tránh vòng import.
 */
@Global()
@Module({
  controllers: [NotificationsController, AlertsController],
  providers: [AlrQueries, AlrService, { provide: BRAND_SIGNUP_LISTENER, useExisting: AlrService }],
  exports: [AlrService, BRAND_SIGNUP_LISTENER],
})
export class AlrModule {}
