/**
 * Unit test cho SmtpEmailProvider và factory lựa chọn provider (FR-USR-07, FR-ALR-16).
 */

import { describe, expect, it, vi } from 'vitest';
import nodemailer from 'nodemailer';
import type { AppConfig, SmtpConfig } from '../../apps/api/src/shared/config/index.js';
import { SmtpEmailProvider } from '../../apps/api/src/modules/alr/smtp-email.provider.js';

function fakeConfig(smtp: SmtpConfig | null = null): AppConfig {
  return {
    env: 'development',
    smtp,
    constraint: () => 24 as never,
  } as unknown as AppConfig;
}

describe('SmtpEmailProvider', () => {
  it('trả về lỗi SMTP_NOT_CONFIGURED khi không có cấu hình smtp trong AppConfig', async () => {
    const config = fakeConfig(null);
    const provider = new SmtpEmailProvider(config);

    const res = await provider.send({
      to: 'test@example.com',
      subject: 'Test subject',
      text: 'Test content',
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('SMTP_NOT_CONFIGURED');
  });

  it('gửi email thành công qua nodemailer transporter khi có cấu hình smtp', async () => {
    const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'smtp-msg-12345' });
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: mockSendMail,
    } as unknown as ReturnType<typeof nodemailer.createTransport>);

    const smtpConfig: SmtpConfig = {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      user: 'scentstation.sender@gmail.com',
      pass: 'sample-app-password',
      from: '"ScentStation" <scentstation.sender@gmail.com>',
    };

    const config = fakeConfig(smtpConfig);
    const provider = new SmtpEmailProvider(config);

    const res = await provider.send({
      to: 'recipient@example.com',
      subject: 'Xác minh tài khoản',
      text: 'Nội dung thư',
    });

    expect(mockSendMail).toHaveBeenCalledWith({
      from: '"ScentStation" <scentstation.sender@gmail.com>',
      to: 'recipient@example.com',
      subject: 'Xác minh tài khoản',
      text: 'Nội dung thư',
      html: undefined,
    });
    expect(res.success).toBe(true);
    expect(res.providerMessageId).toBe('smtp-msg-12345');
  });

  it('bắt ngoại lệ và trả về success = false khi nodemailer ném lỗi kết nối mạng', async () => {
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: vi.fn().mockRejectedValue(new Error('ETIMEDOUT: Connection timed out')),
    } as unknown as ReturnType<typeof nodemailer.createTransport>);

    const smtpConfig: SmtpConfig = {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      user: 'scentstation.sender@gmail.com',
      pass: 'sample-app-password',
      from: '"ScentStation" <scentstation.sender@gmail.com>',
    };

    const config = fakeConfig(smtpConfig);
    const provider = new SmtpEmailProvider(config);

    const res = await provider.send({
      to: 'recipient@example.com',
      subject: 'Thử kết nối',
      text: 'Thử nội dung',
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('ETIMEDOUT');
  });
});
