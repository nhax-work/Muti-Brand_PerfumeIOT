/**
 * Unit test cho DefaultEmailVerificationSender (W7-23, FR-USR-07, ADR-0013).
 *
 * Kiểm tra:
 *   - Gửi thư xác minh qua kênh dùng chung EMAIL_PROVIDER với tiêu đề và nội dung từ packages/i18n.
 *   - Nội dung chứa link verify-email và số giờ hết hạn EMAIL_VERIFICATION_TOKEN_TTL_HOURS.
 *   - Không làm vỡ tiến trình đăng ký khi nhà cung cấp email gặp lỗi (resilience).
 *   - Xử lý cờ DEV_LOG_EMAIL_VERIFICATION_TOKEN và an toàn bảo mật token.
 */

import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../apps/api/src/shared/config/index.js';
import {
  DefaultEmailVerificationSender,
  LoggingEmailVerificationSender,
} from '../../apps/api/src/modules/auth/email-verification-sender.js';
import type {
  EmailProvider,
  EmailSendOptions,
  EmailSendResult,
} from '../../apps/api/src/modules/alr/alr.service.js';

function fakeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    env: 'development',
    port: 3000,
    databaseUrl: 'postgres://localhost:5432/test',
    jwtSecret: 'test-secret-min-32-characters-long-example',
    paymentProvider: 'mock',
    paymentWebhookSecret: null,
    payos: null,
    mqttUrl: null,
    dispenseSigningKey: null,
    swaggerEnabled: true,
    refundAccountEncKey: null,
    refundClaimTokenSecret: null,
    adminWebBaseUrl: 'https://admin.scentstation.vn',
    devLogEmailVerificationToken: false,
    constraint: (name: string) => {
      if (name === 'EMAIL_VERIFICATION_TOKEN_TTL_HOURS') return 24;
      return 0 as never;
    },
    ...overrides,
  } as unknown as AppConfig;
}

class FakeEmailProvider implements EmailProvider {
  sentOptions: EmailSendOptions[] = [];
  shouldFail = false;
  shouldThrow = false;

  async send(options: EmailSendOptions): Promise<EmailSendResult> {
    if (this.shouldThrow) {
      throw new Error('NETWORK_TIMEOUT: Mail server did not respond');
    }
    if (this.shouldFail) {
      return {
        success: false,
        error: 'SMTP_550: Mailbox unavailable',
      };
    }
    this.sentOptions.push(options);
    return {
      success: true,
      providerMessageId: 'fake-msg-id-123',
    };
  }
}

describe('DefaultEmailVerificationSender (W7-23)', () => {
  it('tương thích ngược: LoggingEmailVerificationSender trỏ tới DefaultEmailVerificationSender', () => {
    expect(LoggingEmailVerificationSender).toBe(DefaultEmailVerificationSender);
  });

  it('gửi email xác minh thành công qua EMAIL_PROVIDER với tiêu đề và nội dung từ i18n', async () => {
    const config = fakeConfig();
    const provider = new FakeEmailProvider();
    const sender = new DefaultEmailVerificationSender(config, provider);

    const email = 'brand@example.com';
    const rawToken = 'secret-token-xyz-123';

    await sender.sendVerificationEmail(email, rawToken);

    expect(provider.sentOptions).toHaveLength(1);
    const sent = provider.sentOptions[0]!;
    expect(sent.to).toBe(email);
    expect(sent.subject).toContain('ScentStation');
    expect(sent.text).toContain(
      'https://admin.scentstation.vn/verify-email?token=secret-token-xyz-123',
    );
    expect(sent.text).toContain('24 giờ');
  });

  it('không làm hỏng đăng ký khi provider trả về thất bại (success: false)', async () => {
    const config = fakeConfig();
    const provider = new FakeEmailProvider();
    provider.shouldFail = true;
    const sender = new DefaultEmailVerificationSender(config, provider);

    // Không được throw lỗi ra ngoài
    await expect(
      sender.sendVerificationEmail('fail@example.com', 'token-123'),
    ).resolves.toBeUndefined();
  });

  it('không làm hỏng đăng ký khi provider ném lỗi ngoại lệ mạng', async () => {
    const config = fakeConfig();
    const provider = new FakeEmailProvider();
    provider.shouldThrow = true;
    const sender = new DefaultEmailVerificationSender(config, provider);

    await expect(
      sender.sendVerificationEmail('error@example.com', 'token-123'),
    ).resolves.toBeUndefined();
  });

  it('hoạt động êm dịu khi không cấu hình emailProvider', async () => {
    const config = fakeConfig();
    const sender = new DefaultEmailVerificationSender(config, undefined);

    await expect(
      sender.sendVerificationEmail('nobackend@example.com', 'token-123'),
    ).resolves.toBeUndefined();
  });

  it('in link ra log console khi bật cờ DEV_LOG_EMAIL_VERIFICATION_TOKEN ở môi trường dev', async () => {
    const config = fakeConfig({ devLogEmailVerificationToken: true, env: 'development' });
    const provider = new FakeEmailProvider();
    const sender = new DefaultEmailVerificationSender(config, provider);

    // Spy vào Logger
    const logSpy = vi.spyOn(
      (sender as unknown as { logger: { log: (msg: string) => void } }).logger,
      'log',
    );

    await sender.sendVerificationEmail('brand@example.com', 'token-dev-456');

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://admin.scentstation.vn/verify-email?token=token-dev-456'),
    );
  });
});
