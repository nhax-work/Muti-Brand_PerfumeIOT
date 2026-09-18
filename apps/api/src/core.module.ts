/**
 * Hạ tầng dùng chung cho mọi module: cấu hình, CSDL, đồng hồ, audit.
 *
 * Đánh dấu @Global để module nghiệp vụ không phải import lại. Module mới chỉ cần inject:
 *   @Inject(DATABASE) db: Database
 *   @Inject(APP_CONFIG) config: AppConfig
 *   @Inject(CLOCK) clock: Clock
 *   @Inject(AuditService) audit: AuditService
 */

import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { AuditService } from './shared/audit/index.js';
import { APP_CONFIG, loadConfig, type AppConfig } from './shared/config/index.js';
import { CLOCK, systemClock } from './shared/clock.js';
import { createDatabase, DATABASE, type Database } from './shared/db/index.js';

@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    {
      provide: DATABASE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => createDatabase(config.databaseUrl),
    },
    { provide: CLOCK, useValue: systemClock },
    AuditService,
  ],
  exports: [APP_CONFIG, DATABASE, CLOCK, AuditService],
})
export class CoreModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.destroy();
  }
}
