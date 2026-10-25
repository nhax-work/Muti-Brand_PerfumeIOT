import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import { ConsoleEmailProvider, EMAIL_PROVIDER } from './email-provider.js';
import { SmtpEmailProvider } from './smtp-email.provider.js';

/**
 * Một kênh gửi email cho cả tiến trình — ALR gửi thông báo (FR-ALR-16), AUTH gửi email xác minh
 * (FR-USR-07). Có cấu hình SMTP thì gửi thật, không thì chỉ ghi log (ADR-0017 mục 4).
 */
@Global()
@Module({
  providers: [
    ConsoleEmailProvider,
    SmtpEmailProvider,
    {
      provide: EMAIL_PROVIDER,
      inject: [APP_CONFIG, ConsoleEmailProvider, SmtpEmailProvider],
      useFactory: (
        config: AppConfig,
        consoleProvider: ConsoleEmailProvider,
        smtp: SmtpEmailProvider,
      ) => (config.smtp ? smtp : consoleProvider),
    },
  ],
  exports: [EMAIL_PROVIDER],
})
export class EmailModule {}
