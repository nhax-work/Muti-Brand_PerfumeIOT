import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './alr.http.js';
import { AlrQueries } from './alr.queries.js';
import { AlrService, ConsoleEmailProvider, EMAIL_PROVIDER } from './alr.service.js';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    AlrQueries,
    ConsoleEmailProvider,
    {
      provide: EMAIL_PROVIDER,
      useClass: ConsoleEmailProvider,
    },
    AlrService,
  ],
  exports: [AlrService, AlrQueries, EMAIL_PROVIDER],
})
export class AlrModule {}
