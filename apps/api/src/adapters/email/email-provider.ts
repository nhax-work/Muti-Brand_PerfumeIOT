/**
 * Kênh gửi email dùng chung cho thông báo (FR-ALR-16) và xác minh tài khoản (FR-USR-07).
 *
 * `EMAIL_PROVIDER` là `SmtpEmailProvider` khi có cấu hình SMTP, ngược lại là `ConsoleEmailProvider`
 * (chỉ ghi log — dev/test). Production bắt buộc có SMTP (app-config, ADR-0017 mục 4).
 *
 * Provider báo lỗi bằng `success: false` kèm phản hồi của dịch vụ; người gọi lưu phản hồi đó làm
 * bằng chứng (FR-ALR-16 AC2). Provider không tự thử lại — job ALR làm việc đó (AC3).
 */

import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';

export interface EmailSendOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  referenceId?: string;
}

export interface EmailSendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface EmailProvider {
  send(options: EmailSendOptions): Promise<EmailSendResult>;
}

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

/**
 * Provider mặc định khi chưa cấu hình SMTP: ghi log, không gửi thật.
 * Giả lập gửi thất bại nếu hòm thư chứa "fail@" hoặc "error@" để thử luồng lỗi ở máy dev.
 */
@Injectable()
export class ConsoleEmailProvider implements EmailProvider {
  private readonly logger = new Logger('EmailProvider');

  async send(options: EmailSendOptions): Promise<EmailSendResult> {
    if (options.to.includes('fail@') || options.to.includes('error@')) {
      this.logger.warn(`Giả lập gửi email thất bại tới: ${options.to} (${options.subject})`);
      return {
        success: false,
        error: 'SMTP_CONNECTION_REFUSED: Không thể kết nối tới máy chủ gửi thư',
      };
    }

    const messageId = `msg-${randomUUID()}`;
    this.logger.log(`[không gửi thật] Tới: ${options.to} | ${options.subject} | ${messageId}`);
    return { success: true, providerMessageId: messageId };
  }
}
