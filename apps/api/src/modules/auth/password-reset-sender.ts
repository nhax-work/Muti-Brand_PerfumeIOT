/**
 * Cổng gửi email đặt lại mật khẩu (FR-AUTH-13, ADR-0030).
 *
 * Tách interface như `EmailVerificationSender` để:
 *   - Production / Dev: gửi qua mailer dùng chung (EMAIL_PROVIDER) hoặc in console nếu bật cờ dev.
 *   - Test: cắm test double lấy mã gốc mà không qua cờ dev.
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DEFAULT_LOCALE, translate } from '@scentstation/i18n';
import { EMAIL_PROVIDER, type EmailProvider } from '../../adapters/email/index.js';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';

export interface PasswordResetSender {
  sendPasswordResetEmail(email: string, rawToken: string): Promise<void>;
}

export const PASSWORD_RESET_SENDER = Symbol('PASSWORD_RESET_SENDER');

@Injectable()
export class DefaultPasswordResetSender implements PasswordResetSender {
  private readonly logger = new Logger('PasswordReset');

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Optional()
    @Inject(EMAIL_PROVIDER)
    private readonly emailProvider?: EmailProvider,
  ) {}

  async sendPasswordResetEmail(email: string, rawToken: string): Promise<void> {
    const link = `${this.config.adminWebBaseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

    // Cùng cờ dev với email xác minh: chỉ ở dev và KHÔNG phải môi trường test.
    if (this.config.devLogEmailVerificationToken && this.config.env !== 'test') {
      this.logger.log(`[DEV] Link đặt lại mật khẩu cho ${email}: ${link}`);
    }

    if (!this.emailProvider) return;

    const minutes = this.config.constraint('PASSWORD_RESET_TOKEN_TTL_MIN');
    try {
      const result = await this.emailProvider.send({
        to: email,
        subject: translate(DEFAULT_LOCALE, 'auth.passwordResetEmailSubject'),
        text: translate(DEFAULT_LOCALE, 'auth.passwordResetEmailBody', { link, minutes }),
      });
      if (!result.success) {
        this.logger.warn(`Gửi email đặt lại mật khẩu thất bại cho ${email}: ${result.error}`);
      }
    } catch (err: unknown) {
      // Không ném: câu trả lời cho người dùng phải giống nhau dù gửi được hay không (ADR-0030).
      this.logger.warn(
        `Ngoại lệ khi gửi email đặt lại mật khẩu cho ${email}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
