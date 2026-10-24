/**
 * Nhà cung cấp gửi email thực tế qua máy chủ SMTP (FR-USR-07, FR-ALR-16).
 * Sử dụng thư viện nodemailer. Tự động chuyển đổi nội dung text/html và ghi nhận MessageId.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import type { EmailProvider, EmailSendOptions, EmailSendResult } from './alr.service.js';

@Injectable()
export class SmtpEmailProvider implements EmailProvider {
  private readonly logger = new Logger(SmtpEmailProvider.name);
  private readonly transporter: Transporter | null = null;
  private readonly fromAddress: string;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    const smtp = config.smtp;
    if (smtp) {
      this.fromAddress = smtp.from;
      this.transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth:
          smtp.user && smtp.pass
            ? {
                user: smtp.user,
                pass: smtp.pass,
              }
            : undefined,
      });
      this.logger.log(`[SMTP] Đã khởi tạo SMTP transporter: ${smtp.host}:${smtp.port}`);
    } else {
      this.fromAddress = '"ScentStation" <no-reply@scentstation.vn>';
    }
  }

  async send(options: EmailSendOptions): Promise<EmailSendResult> {
    if (!this.transporter) {
      this.logger.warn(`[SMTP] Chưa cấu hình SMTP_HOST/SMTP_USER, không thể gửi tới ${options.to}`);
      return {
        success: false,
        error: 'SMTP_NOT_CONFIGURED: Chưa cấu hình máy chủ SMTP trong môi trường (.env)',
      };
    }

    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });

      this.logger.log(
        `[SMTP THÀNH CÔNG] Đã gửi email tới: ${options.to} | MessageId: ${info.messageId}`,
      );
      return {
        success: true,
        providerMessageId: info.messageId,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[SMTP LỖI] Gửi email thất bại tới ${options.to}: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }
}
