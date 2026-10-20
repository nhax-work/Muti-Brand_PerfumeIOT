/**
 * Cổng gửi email xác minh (FR-USR-07, ADR-0013).
 *
 * Tách biệt interface để:
 *   - Production / Dev: gửi qua mailer thật hoặc in console nếu bật cờ dev.
 *   - Test / Integration: cắm test double lấy raw token mà không qua cờ dev hay mock private method.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';

export interface EmailVerificationSender {
  sendVerificationEmail(email: string, rawToken: string): Promise<void>;
}

export const EMAIL_VERIFICATION_SENDER = Symbol('EMAIL_VERIFICATION_SENDER');

@Injectable()
export class LoggingEmailVerificationSender implements EmailVerificationSender {
  private readonly logger = new Logger('EmailVerification');

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async sendVerificationEmail(email: string, rawToken: string): Promise<void> {
    // Chỉ log ra console khi bật cờ chuyên dụng ở dev và KHÔNG phải môi trường test
    if (this.config.devLogEmailVerificationToken && this.config.env !== 'test') {
      const link = `${this.config.adminWebBaseUrl}/verify-email?token=${encodeURIComponent(rawToken)}`;
      this.logger.log(`[DEV] Link xác minh email cho ${email}: ${link}`);
    }
  }
}
