/**
 * Unit test cho Module ALR — Hạ tầng Email & Bằng chứng thông báo đối soát pháp lý (FR-ALR-16, FR-SLT-43).
 * Khởi tạo AlrService trực tiếp với InMemory Fake Queries & Fake Email Provider (QT2, ADR-0003).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../../apps/api/src/modules/auth/principal.loader.js';
import type { BrandScope } from '../../apps/api/src/shared/scoping/index.js';
import {
  AlrService,
  type EmailProvider,
  type EmailSendOptions,
  type EmailSendResult,
} from '../../apps/api/src/modules/alr/alr.service.js';
import type {
  BrandAdminUser,
  NotificationFilter,
  NotificationRecord,
} from '../../apps/api/src/modules/alr/alr.queries.js';
import type { NotificationStatus } from '../../apps/api/src/shared/db/types.generated.js';

const BRAND_A = '11111111-1111-4111-8111-000000000001';
const BRAND_B = '22222222-2222-4222-8222-000000000002';
const USER_A1 = 'aaaa1111-1111-4111-8111-000000000001';
const USER_A2 = 'aaaa2222-1111-4111-8111-000000000002';
const USER_B1 = 'bbbb1111-2222-4222-8222-000000000001';

class FakeAlrQueries {
  notifications = new Map<string, NotificationRecord>();
  brandAdmins = new Map<string, BrandAdminUser[]>();
  private seq = 0;

  async createNotification(data: {
    brandId: string;
    recipientUserId: string;
    type: string;
    channel: string;
    subject: string;
    content: string;
    status: NotificationStatus;
    sentAt?: Date | null;
    createdAt?: Date;
  }): Promise<NotificationRecord> {
    const id = `notif-${++this.seq}`;
    const record: NotificationRecord = {
      id,
      brandId: data.brandId,
      brandName: data.brandId === BRAND_A ? 'Thương hiệu A' : 'Thương hiệu B',
      recipientUserId: data.recipientUserId,
      recipientEmail: `${data.recipientUserId}@example.com`,
      recipientName: `User ${data.recipientUserId}`,
      type: data.type,
      channel: data.channel,
      subject: data.subject,
      content: data.content,
      status: data.status,
      sentAt: data.sentAt ?? null,
      readAt: null,
      createdAt: data.createdAt ?? new Date(),
    };
    this.notifications.set(id, record);
    return record;
  }

  async updateNotificationStatus(
    id: string,
    status: NotificationStatus,
    sentAt: Date | null = null,
  ): Promise<void> {
    const existing = this.notifications.get(id);
    if (existing) {
      this.notifications.set(id, {
        ...existing,
        status,
        sentAt,
      });
    }
  }

  async findNotificationById(
    id: string,
    scope: BrandScope = { kind: 'UNRESTRICTED' },
  ): Promise<NotificationRecord | null> {
    const record = this.notifications.get(id);
    if (!record) return null;
    if (scope.kind === 'BRAND' && record.brandId !== scope.brandId) {
      return null;
    }
    return record;
  }

  async listNotifications(
    filter: NotificationFilter,
    scope: BrandScope = { kind: 'UNRESTRICTED' },
  ): Promise<{ items: NotificationRecord[]; total: number }> {
    let list = Array.from(this.notifications.values());

    if (scope.kind === 'BRAND') {
      list = list.filter((n) => n.brandId === scope.brandId);
    } else if (filter.brandId) {
      list = list.filter((n) => n.brandId === filter.brandId);
    }

    if (filter.channel) {
      list = list.filter((n) => n.channel === filter.channel);
    }
    if (filter.status) {
      list = list.filter((n) => n.status === filter.status);
    }

    const total = list.length;
    const start = (filter.page - 1) * filter.pageSize;
    const items = list.slice(start, start + filter.pageSize);
    return { items, total };
  }

  async findActiveBrandAdmins(brandId: string): Promise<BrandAdminUser[]> {
    return this.brandAdmins.get(brandId) ?? [];
  }
}

class FakeEmailProvider implements EmailProvider {
  sentEmails: EmailSendOptions[] = [];
  shouldFail = false;

  async send(options: EmailSendOptions): Promise<EmailSendResult> {
    this.sentEmails.push(options);
    if (this.shouldFail || options.to.includes('fail@')) {
      return {
        success: false,
        error: 'CONNECTION_FAILURE: Cannot connect to mail transfer agent',
      };
    }
    return {
      success: true,
      providerMessageId: `msg-${Date.now()}`,
    };
  }
}

function makeUser(role: string, brandId: string | null = null, id = 'user-test'): AuthenticatedUser {
  return {
    userId: id,
    email: `${id}@scentstation.local`,
    fullName: 'Test User',
    roles: [role as any],
    brandId,
    permissionVersion: 1,
    scope: brandId ? { type: 'BRAND', brandId } : { type: 'PLATFORM' },
    sessionId: 'session-test',
    mustChangePassword: false,
    permissions: new Set<string>(),
  };
}

describe('Module ALR — Hạ tầng Email & Bằng chứng gửi (FR-ALR-16, FR-SLT-43)', () => {
  let queries: FakeAlrQueries;
  let emailProvider: FakeEmailProvider;
  let service: AlrService;

  beforeEach(() => {
    queries = new FakeAlrQueries();
    emailProvider = new FakeEmailProvider();
    service = new AlrService(queries as any, emailProvider);

    queries.brandAdmins.set(BRAND_A, [
      { id: USER_A1, email: 'admin1@brand-a.vn', fullName: 'Admin 1 Brand A' },
      { id: USER_A2, email: 'admin2@brand-a.vn', fullName: 'Admin 2 Brand A' },
    ]);
    queries.brandAdmins.set(BRAND_B, [
      { id: USER_B1, email: 'admin1@brand-b.vn', fullName: 'Admin 1 Brand B' },
    ]);
  });

  describe('FR-ALR-16 AC1 & AC2: Gửi email và lưu vết bằng chứng đối soát pháp lý', () => {
    it('gửi email thành công lưu trạng thái SENT và thời điểm sent_at', async () => {
      const result = await service.sendBrandEmailNotification({
        brandId: BRAND_A,
        recipientUserId: USER_A1,
        recipientEmail: 'admin1@brand-a.vn',
        type: 'RENTAL_CHECKOUT_PAID',
        subject: 'Xác nhận thanh toán',
        content: 'Nội dung thông báo thanh toán hợp đồng',
        referenceId: 'chk-123',
      });

      expect(result.status).toBe('SENT');
      expect(result.sentAt).toBeInstanceOf(Date);
      expect(emailProvider.sentEmails).toHaveLength(1);
      expect(emailProvider.sentEmails[0]!.to).toBe('admin1@brand-a.vn');
      expect(emailProvider.sentEmails[0]!.subject).toBe('Xác nhận thanh toán');

      // Kiểm tra lưu vết trong bảng notifications
      const saved = queries.notifications.get(result.id);
      expect(saved).toBeDefined();
      expect(saved?.status).toBe('SENT');
      expect(saved?.channel).toBe('EMAIL');
      expect(saved?.sentAt).toBeInstanceOf(Date);
    });

    it('FR-ALR-15 AC2 & FR-ALR-16 AC3: lỗi gửi email được ghi nhận FAILED an toàn mà không văng lỗi sập luồng', async () => {
      emailProvider.shouldFail = true;

      const result = await service.sendBrandEmailNotification({
        brandId: BRAND_A,
        recipientUserId: USER_A1,
        recipientEmail: 'fail@brand-a.vn',
        type: 'RENTAL_CHECKOUT_PAID',
        subject: 'Xác nhận thanh toán',
        content: 'Nội dung thông báo',
      });

      expect(result.status).toBe('FAILED');
      expect(result.sentAt).toBeNull();

      const saved = queries.notifications.get(result.id);
      expect(saved?.status).toBe('FAILED');
      expect(saved?.sentAt).toBeNull();
    });
  });

  describe('FR-SLT-43 AC1: Thông báo thanh toán thuê slot thành công', () => {
    it('gửi cả thông báo IN_APP lẫn EMAIL cho mọi Brand Admin ACTIVE của thương hiệu', async () => {
      const paidAt = new Date('2026-10-21T10:00:00Z');
      const records = await service.notifyRentalCheckoutPaid({
        brandId: BRAND_A,
        checkoutId: 'chk-999',
        invoiceNumbers: ['INV-2026-001', 'INV-2026-002'],
        paidAt,
      });

      // Thương hiệu A có 2 admin -> gửi 2 email
      expect(records).toHaveLength(2);
      expect(emailProvider.sentEmails).toHaveLength(2);
      expect(emailProvider.sentEmails.map((e) => e.to)).toEqual([
        'admin1@brand-a.vn',
        'admin2@brand-a.vn',
      ]);

      // Tổng số bản ghi trong bảng notifications: 2 IN_APP + 2 EMAIL = 4 bản ghi
      const allRows = Array.from(queries.notifications.values());
      expect(allRows).toHaveLength(4);

      const inAppRows = allRows.filter((r) => r.channel === 'IN_APP');
      const emailRows = allRows.filter((r) => r.channel === 'EMAIL');
      expect(inAppRows).toHaveLength(2);
      expect(emailRows).toHaveLength(2);

      expect(emailRows.every((r) => r.status === 'SENT')).toBe(true);
      expect(emailRows.every((r) => r.content.includes('INV-2026-001'))).toBe(true);
    });
  });

  describe('FR-ALR-16 AC3: Thử gửi lại email thất bại (retryNotification)', () => {
    it('thử gửi lại thành công khi trạng thái là FAILED', async () => {
      // Tạo một thông báo lỗi trước
      const failed = await queries.createNotification({
        brandId: BRAND_A,
        recipientUserId: USER_A1,
        type: 'RENTAL_CHECKOUT_PAID',
        channel: 'EMAIL',
        subject: 'Thanh toán lỗi',
        content: 'Thử lại gửi email',
        status: 'FAILED',
      });

      const brandAdmin = makeUser('BRAND_ADMIN', BRAND_A);
      const retried = await service.retryNotification(brandAdmin, failed.id);

      expect(retried.status).toBe('SENT');
      expect(retried.sentAt).toBeInstanceOf(Date);
      expect(emailProvider.sentEmails).toHaveLength(1);
    });

    it('từ chối gửi lại nếu thông báo không ở trạng thái FAILED', async () => {
      const sentNotif = await queries.createNotification({
        brandId: BRAND_A,
        recipientUserId: USER_A1,
        type: 'RENTAL_CHECKOUT_PAID',
        channel: 'EMAIL',
        subject: 'Đã gửi',
        content: 'Nội dung',
        status: 'SENT',
        sentAt: new Date(),
      });

      const brandAdmin = makeUser('BRAND_ADMIN', BRAND_A);
      await expect(service.retryNotification(brandAdmin, sentNotif.id)).rejects.toMatchObject({
        messageKey: 'alr.retryOnlyFailed',
      });
    });
  });

  describe('Cô lập dữ liệu theo phạm vi thương hiệu (FR-AUTH-07, BR-012)', () => {
    it('Brand Admin A không được xem hoặc tra cứu thông báo của Brand Admin B', async () => {
      // Tạo thông báo cho brand A và brand B
      const notifA = await queries.createNotification({
        brandId: BRAND_A,
        recipientUserId: USER_A1,
        type: 'RENTAL_CHECKOUT_PAID',
        channel: 'EMAIL',
        subject: 'Thương hiệu A',
        content: 'Nội dung A',
        status: 'SENT',
      });

      const notifB = await queries.createNotification({
        brandId: BRAND_B,
        recipientUserId: USER_B1,
        type: 'RENTAL_CHECKOUT_PAID',
        channel: 'EMAIL',
        subject: 'Thương hiệu B',
        content: 'Nội dung B',
        status: 'SENT',
      });

      const brandAdminA = makeUser('BRAND_ADMIN', BRAND_A);

      // Brand Admin A chỉ thấy thông báo của Brand A
      const listA = await service.listNotifications(brandAdminA, { page: 1, pageSize: 10 });
      expect(listA.items).toHaveLength(1);
      expect(listA.items[0]!.id).toBe(notifA.id);

      // Xem chi tiết của Brand A -> thành công
      const detailA = await service.getNotification(brandAdminA, notifA.id);
      expect(detailA.id).toBe(notifA.id);

      // Cố tình truy cập chi tiết của Brand B -> NOT_FOUND (bảo vệ rò rỉ dữ liệu)
      await expect(service.getNotification(brandAdminA, notifB.id)).rejects.toMatchObject({
        messageKey: 'alr.notificationNotFound',
      });
    });

    it('Platform Super Admin xem được danh sách thông báo của mọi thương hiệu', async () => {
      await queries.createNotification({
        brandId: BRAND_A,
        recipientUserId: USER_A1,
        type: 'RENTAL_CHECKOUT_PAID',
        channel: 'EMAIL',
        subject: 'A',
        content: 'A',
        status: 'SENT',
      });
      await queries.createNotification({
        brandId: BRAND_B,
        recipientUserId: USER_B1,
        type: 'RENTAL_CHECKOUT_PAID',
        channel: 'EMAIL',
        subject: 'B',
        content: 'B',
        status: 'SENT',
      });

      const platformAdmin = makeUser('PLATFORM_SUPER_ADMIN', null);
      const listAll = await service.listNotifications(platformAdmin, { page: 1, pageSize: 10 });
      expect(listAll.total).toBe(2);
    });
  });
});
