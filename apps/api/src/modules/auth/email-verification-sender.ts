/**
 * Cổng gửi email xác minh (FR-USR-07, ADR-0013, W7-23).
 *
 * Tách biệt interface để:
 *   - Production / Dev: gửi qua mailer dùng chung (EMAIL_PROVIDER) hoặc in console nếu bật cờ dev.
 *   - Test / Integration: cắm test double lấy raw token mà không qua cờ dev hay mock private method.
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DEFAULT_LOCALE, translate } from '@scentstation/i18n';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import { EMAIL_PROVIDER, type EmailProvider } from '../../adapters/email/index.js';

export interface EmailVerificationSender {
  sendVerificationEmail(email: string, rawToken: string): Promise<void>;
}

export const EMAIL_VERIFICATION_SENDER = Symbol('EMAIL_VERIFICATION_SENDER');

@Injectable()
export class DefaultEmailVerificationSender implements EmailVerificationSender {
  private readonly logger = new Logger('EmailVerification');

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Optional()
    @Inject(EMAIL_PROVIDER)
    private readonly emailProvider?: EmailProvider,
  ) {}

  async sendVerificationEmail(email: string, rawToken: string): Promise<void> {
    const link = `${this.config.adminWebBaseUrl}/verify-email?token=${encodeURIComponent(rawToken)}`;

    // Chỉ log ra console khi bật cờ chuyên dụng ở dev và KHÔNG phải môi trường test
    if (this.config.devLogEmailVerificationToken && this.config.env !== 'test') {
      this.logger.log(`[DEV] Link xác minh email cho ${email}: ${link}`);
    }

    if (!this.emailProvider) {
      return;
    }

    const hours = this.config.constraint('EMAIL_VERIFICATION_TOKEN_TTL_HOURS');
    const subject = translate(DEFAULT_LOCALE, 'auth.verificationEmailSubject');
    const text = translate(DEFAULT_LOCALE, 'auth.verificationEmailBody', {
      link,
      hours,
    });

    try {
      const result = await this.emailProvider.send({
        to: email,
        subject,
        text,
      });

      if (!result.success) {
        this.logger.warn(`Gửi email xác minh thất bại cho ${email}: ${result.error}`);
      }
    } catch (err: unknown) {
      // Gửi lỗi thì chỉ ghi log cảnh báo, không làm hỏng đăng ký (W7-23)
      this.logger.warn(
        `Ngoại lệ khi gửi email xác minh cho ${email}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/** Tương thích ngược với tên cũ */
export { DefaultEmailVerificationSender as LoggingEmailVerificationSender };
