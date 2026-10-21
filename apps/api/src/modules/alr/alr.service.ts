/**
 * Nghiệp vụ thông báo và hạ tầng email (FR-ALR-16, FR-SLT-43; ADR-0013).
 */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/principal.loader.js';
import { AppError } from '../../shared/errors/index.js';
import { hasPermission, resolveBrandScope } from '../../shared/scoping/index.js';
import {
  AlrQueries,
  type BrandAdminUser,
  type NotificationFilter,
  type NotificationRecord,
} from './alr.queries.js';

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
 * Provider email mặc định ghi nhận log an toàn và thành công cho dev/test.
 * Giả lập gửi thất bại nếu hòm thư chứa từ khóa "fail@" để phục vụ test resilience.
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
    this.logger.log(`[EMAIL DISPATCHED] To: ${options.to} | Subject: ${options.subject} | ID: ${messageId}`);
    return {
      success: true,
      providerMessageId: messageId,
    };
  }
}

@Injectable()
export class AlrService {
  private readonly logger = new Logger(AlrService.name);

  constructor(
    @Inject(AlrQueries) private readonly queries: AlrQueries,
    @Optional()
    @Inject(EMAIL_PROVIDER)
    private readonly emailProvider: EmailProvider = new ConsoleEmailProvider(),
  ) {}

  /**
   * FR-ALR-16 AC1 & AC2: Gửi email thông báo tiền/hàng và lưu vết bằng chứng đối soát pháp lý.
   * Chống gián đoạn luồng nghiệp vụ chính nếu email lỗi (FR-ALR-15 AC2).
   */
  async sendBrandEmailNotification(input: {
    brandId: string;
    recipientUserId: string;
    recipientEmail: string;
    type: string;
    subject: string;
    content: string;
    referenceId?: string;
  }): Promise<NotificationRecord> {
    // 1. Tạo bản ghi ban đầu với trạng thái PENDING
    const created = await this.queries.createNotification({
      brandId: input.brandId,
      recipientUserId: input.recipientUserId,
      type: input.type,
      channel: 'EMAIL',
      subject: input.subject,
      content: input.content,
      status: 'PENDING',
      createdAt: new Date(),
    });

    try {
      // 2. Gửi email qua nhà cung cấp
      const result = await this.emailProvider.send({
        to: input.recipientEmail,
        subject: input.subject,
        text: input.content,
        referenceId: input.referenceId,
      });

      if (result.success) {
        const sentAt = new Date();
        await this.queries.updateNotificationStatus(created.id, 'SENT', sentAt);
        return { ...created, status: 'SENT', sentAt };
      } else {
        this.logger.error(`Gửi email thất bại cho ${input.recipientEmail}: ${result.error}`);
        await this.queries.updateNotificationStatus(created.id, 'FAILED', null);
        return { ...created, status: 'FAILED' };
      }
    } catch (err: unknown) {
      // Bắt mọi ngoại lệ mạng để không làm hỏng transaction chính (FR-ALR-15 AC2, FR-ALR-16 AC3)
      this.logger.error(`Ngoại lệ khi gọi emailProvider.send cho ${input.recipientEmail}`, err);
      await this.queries.updateNotificationStatus(created.id, 'FAILED', null);
      return { ...created, status: 'FAILED' };
    }
  }

  /**
   * FR-SLT-43 AC1 & FR-ALR-16: Thông báo thanh toán phiên thuê slot thành công cho Brand Admin.
   * Gửi cả IN_APP lẫn EMAIL và lưu bằng chứng gửi.
   */
  async notifyRentalCheckoutPaid(params: {
    brandId: string;
    checkoutId: string;
    invoiceNumbers: string[];
    paidAt: Date;
  }): Promise<NotificationRecord[]> {
    const brandAdmins = await this.queries.findActiveBrandAdmins(params.brandId);
    if (brandAdmins.length === 0) {
      this.logger.warn(`Thương hiệu ${params.brandId} không có Brand Admin ACTIVE để gửi thông báo thanh toán.`);
      return [];
    }

    const invoiceListText = params.invoiceNumbers.join(', ');
    const subject = `[ScentStation] Xác nhận thanh toán thuê slot thành công (${invoiceListText})`;
    const content = `Kính gửi Quý đối tác,

Phiên thanh toán thuê slot của quý thương hiệu đã được hệ thống ScentStation xác nhận thành công.

Chi tiết thanh toán:
- Mã phiên thanh toán: ${params.checkoutId}
- Danh sách mã hóa đơn: ${invoiceListText}
- Thời điểm thanh toán: ${params.paidAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}

Các bước tiếp theo cần thực hiện:
1. Khai báo lô hàng gửi kho tại cổng quản trị thương hiệu (FR-INV-22).
2. Sau khi kho tiếp nhận và đối soát tem kiểm định, chai nước hoa sẽ được nạp vào các slot đã thuê.
3. Cấu hình slot và cài đặt giá trải nghiệm để sẵn sàng phục vụ khách hàng tại Kiosk.

Thông báo này được lưu trữ trong cơ sở dữ liệu làm bằng chứng đối soát pháp lý (FR-ALR-16, ADR-0013).

Trân trọng,
Hệ thống Quản trị ScentStation`;

    const records: NotificationRecord[] = [];

    for (const admin of brandAdmins) {
      // 1. Tạo thông báo IN_APP (FR-SLT-43)
      await this.queries.createNotification({
        brandId: params.brandId,
        recipientUserId: admin.id,
        type: 'RENTAL_CHECKOUT_PAID',
        channel: 'IN_APP',
        subject,
        content,
        status: 'SENT',
        sentAt: params.paidAt,
        createdAt: params.paidAt,
      });

      // 2. Gửi email và lưu bằng chứng đối soát (FR-ALR-16)
      const emailRecord = await this.sendBrandEmailNotification({
        brandId: params.brandId,
        recipientUserId: admin.id,
        recipientEmail: admin.email,
        type: 'RENTAL_CHECKOUT_PAID',
        subject,
        content,
        referenceId: params.checkoutId,
      });

      records.push(emailRecord);
    }

    return records;
  }

  /**
   * Tra cứu danh sách thông báo và bằng chứng gửi.
   * Áp dụng cô lập dữ liệu: Brand Admin chỉ thấy của thương hiệu mình (BR-012, FR-AUTH-07).
   */
  async listNotifications(
    actor: AuthenticatedUser,
    filter: NotificationFilter,
  ): Promise<{ items: NotificationRecord[]; total: number }> {
    const scope = resolveBrandScope(actor);
    return this.queries.listNotifications(filter, scope);
  }

  /**
   * Chi tiết một thông báo và bằng chứng gửi làm bằng chứng đối soát pháp lý.
   */
  async getNotification(actor: AuthenticatedUser, id: string): Promise<NotificationRecord> {
    const scope = resolveBrandScope(actor);
    const notification = await this.queries.findNotificationById(id, scope);
    if (!notification) {
      throw new AppError('NOT_FOUND', 'alr.notificationNotFound');
    }
    return notification;
  }

  /**
   * FR-ALR-16 AC3: Thử gửi lại thông báo email bị thất bại (FAILED).
   */
  async retryNotification(actor: AuthenticatedUser, id: string): Promise<NotificationRecord> {
    const scope = resolveBrandScope(actor);
    const notification = await this.queries.findNotificationById(id, scope);
    if (!notification) {
      throw new AppError('NOT_FOUND', 'alr.notificationNotFound');
    }

    if (notification.status !== 'FAILED') {
      throw new AppError('VALIDATION_ERROR', 'alr.retryOnlyFailed');
    }

    if (notification.channel !== 'EMAIL' || !notification.recipientEmail) {
      throw new AppError('VALIDATION_ERROR', 'alr.emailChannelRequired');
    }

    try {
      const result = await this.emailProvider.send({
        to: notification.recipientEmail,
        subject: notification.subject ?? 'Thông báo ScentStation',
        text: notification.content,
        referenceId: notification.id,
      });

      if (result.success) {
        const sentAt = new Date();
        await this.queries.updateNotificationStatus(id, 'SENT', sentAt);
        return { ...notification, status: 'SENT', sentAt };
      } else {
        return notification;
      }
    } catch (err: unknown) {
      this.logger.error(`Thử gửi lại email thất bại cho ${notification.recipientEmail}`, err);
      return notification;
    }
  }
}
