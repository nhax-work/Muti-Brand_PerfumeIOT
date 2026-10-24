import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import { NotificationsController } from './alr.http.js';
import { AlrQueries } from './alr.queries.js';
import { AlrService, ConsoleEmailProvider, EMAIL_PROVIDER } from './alr.service.js';
import { SmtpEmailProvider } from './smtp-email.provider.js';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    AlrQueries,
    ConsoleEmailProvider,
    SmtpEmailProvider,
    {
      provide: EMAIL_PROVIDER,
      useFactory: (
        config: AppConfig,
        consoleProvider: ConsoleEmailProvider,
        smtpProvider: SmtpEmailProvider,
      ) => {
        if (config.smtp) {
          return smtpProvider;
        }
        return consoleProvider;
      },
      inject: [APP_CONFIG, ConsoleEmailProvider, SmtpEmailProvider],
    },
    AlrService,
  ],
  exports: [AlrService, AlrQueries, EMAIL_PROVIDER, SmtpEmailProvider, ConsoleEmailProvider],
})
export class AlrModule {}
