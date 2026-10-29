/**
 * Yêu cầu bổ sung nước hoa (FR-RFQ-01 ÷ 12, ADR-0018 mục 2).
 *
 *   SUBMITTED ──accept──▶ ACCEPTED ──schedule──▶ SCHEDULED ──(phiếu nạp đóng)──▶ COMPLETED
 *       │                    │  ▲                    │
 *       └──reject──▶ REJECTED  └──────cancel─────────┴──▶ CANCELLED
 *
 * Thương hiệu tạo yêu cầu cho slot mình đang thuê; nhân sự nền tảng (`refill.fulfill`) duyệt, lên lịch,
 * hủy. INV gọi `linkToSession` lúc mở phiếu nạp và `completeForSession` lúc đóng phiếu — cùng
 * transaction với phiếu, nên yêu cầu không bao giờ COMPLETED khi phiếu chưa đóng (FR-RFQ-08, 09).
 *
 * Mỗi slot tối đa một yêu cầu đang mở — `uq_refill_request_open` ở CSDL (FR-RFQ-12); COMPLETED phải
 * có phiên nạp — `chk_refill_request_completed_has_session` (FR-RFQ-09 AC2).
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { DEFAULT_LOCALE, translate, type MessageKey } from '@scentstation/i18n';
import type { Kysely } from 'kysely';
import { AuditService } from '../../shared/audit/index.js';
import { CLOCK, type Clock } from '../../shared/clock.js';
import type { DB } from '../../shared/db/index.js';
import type { RefillRequestReason, RefillRequestStatus } from '../../shared/db/types.generated.js';
import { AppError, invalidField, notFoundFor } from '../../shared/errors/index.js';
import { HOLDING_RENTAL_STATUSES, type BrandScope } from '../../shared/scoping/index.js';
import { AlrService } from '../alr/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import {
  RfqQueries,
  type RefillRequestFilter,
  type RefillRequestRecord,
  type RequestableRental,
} from './rfq.queries.js';

export type RefillRequest = Schema<'RefillRequest'>;

type Executor = Kysely<DB>;

export interface CreateRefillRequestInput {
  readonly slotRentalId: string;
  readonly reason: RefillRequestReason;
  readonly note?: string | undefined;
}

/** Chuyển trạng thái hợp lệ (FR-RFQ-04). Trạng thái kết thúc không có lối ra. */
const TRANSITIONS: Readonly<Record<RefillRequestStatus, readonly RefillRequestStatus[]>> = {
  SUBMITTED: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: ['SCHEDULED', 'CANCELLED', 'COMPLETED'],
  // SCHEDULED → SCHEDULED là dời lịch.
  SCHEDULED: ['SCHEDULED', 'CANCELLED', 'COMPLETED'],
  REJECTED: [],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionRefillRequest(
  from: RefillRequestStatus,
  to: RefillRequestStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Hóa đơn cho nhận hàng: đang khai thác, hoặc đã thanh toán chờ nạp hàng (cùng luật mở phiếu nạp). */
function isStockable(rental: RequestableRental): boolean {
  if ((HOLDING_RENTAL_STATUSES as readonly string[]).includes(rental.status)) return true;
  return rental.status === 'DRAFT' && rental.paidAt !== null && rental.cancelledAt === null;
}

@Injectable()
export class RfqService {
  constructor(
    @Inject(RfqQueries) private readonly queries: RfqQueries,
    @Inject(AlrService) private readonly alr: AlrService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** FR-RFQ-01, 02, 05, 12. */
  async create(
    actor: AuthenticatedUser,
    scope: BrandScope,
    input: CreateRefillRequestInput,
  ): Promise<RefillRequest> {
    // Yêu cầu là lời của thương hiệu — tài khoản nền tảng không gửi thay (FR-RFQ-01).
    if (scope.kind !== 'BRAND') throw new AppError('FORBIDDEN_SCOPE', 'rfq.brandAccountOnly');

    const id = await this.queries
      .transaction(async (tx) => {
        const rental = await this.queries.findRental(scope, input.slotRentalId, tx);
        if (!rental) throw notFoundFor(actor);
        if (!isStockable(rental)) throw new AppError('RENTAL_NOT_ACTIVE', 'rfq.rentalNotActive');
        if (rental.fragranceProductId === null) {
          throw invalidField('slotRentalId', 'rfq.productNotConfigured');
        }
        if (await this.queries.slotHasOpenRequest(rental.slotId, tx)) {
          throw new AppError('REFILL_REQUEST_PENDING', 'rfq.requestPending');
        }

        const now = this.clock.now();
        const requestId = await this.queries.insert(
          {
            brandId: rental.brandId,
            slotRentalId: rental.id,
            slotId: rental.slotId,
            fragranceProductId: rental.fragranceProductId,
            reason: input.reason,
            note: input.note?.trim() || null,
            requestedBy: actor.userId,
            at: now,
          },
          tx,
        );
        await this.audit.log(
          {
            actorType: 'USER',
            actorId: actor.userId,
            brandId: rental.brandId,
            action: 'rfq.request.submitted',
            targetType: 'refill_request',
            targetId: requestId,
            after: { status: 'SUBMITTED', reason: input.reason, slotRentalId: rental.id },
          },
          tx,
        );
        const created = (await this.queries.find({ kind: 'UNRESTRICTED' }, requestId, tx))!;
        const params = {
          machine: created.machineSerial,
          slot: created.slotNumber,
          brand: created.brandName,
          product: created.productName,
        };
        await this.queries.insertInAppNotifications(
          {
            brandId: rental.brandId,
            recipients: await this.queries.staffRecipients(tx),
            type: 'REFILL_REQUEST_SUBMITTED',
            subject: translate(DEFAULT_LOCALE, 'rfq.newRequestSubject', params),
            content: translate(DEFAULT_LOCALE, 'rfq.newRequestContent', params),
            referenceId: requestId,
            at: now,
          },
          tx,
        );
        return requestId;
      })
      .catch((error: unknown) => {
        // Hai lần gửi cùng lúc: cả hai qua bước kiểm, CSDL chỉ giữ một yêu cầu mở mỗi slot.
        if (uniqueViolation(error) === 'uq_refill_request_open') {
          throw new AppError('REFILL_REQUEST_PENDING', 'rfq.requestPending');
        }
        throw error;
      });
    return toRefillRequestDto((await this.queries.find(scope, id))!);
  }

  /** FR-RFQ-04, 10: Brand Admin chỉ thấy yêu cầu của thương hiệu mình, mới nhất trước. */
  async list(
    scope: BrandScope,
    filter: RefillRequestFilter,
  ): Promise<{ items: RefillRequest[]; total: number }> {
    const { items, total } = await this.queries.list(scope, filter);
    return { items: items.map(toRefillRequestDto), total };
  }

  /** FR-RFQ-06 AC1. */
  accept(actor: AuthenticatedUser, id: string): Promise<RefillRequest> {
    return this.transition(actor, id, 'ACCEPTED', { reviewedBy: actor.userId }, 'rfq.accepted');
  }

  /** FR-RFQ-06 AC2, AC3: lý do bắt buộc. */
  reject(actor: AuthenticatedUser, id: string, reason: string): Promise<RefillRequest> {
    const trimmed = reason.trim();
    if (!trimmed) throw invalidField('reason', 'rfq.rejectionReasonRequired');
    return this.transition(
      actor,
      id,
      'REJECTED',
      { reviewedBy: actor.userId, rejectionReason: trimmed },
      'rfq.rejected',
      { reason: trimmed },
    );
  }

  /** FR-RFQ-07: mốc xử lý phải ở tương lai. */
  schedule(actor: AuthenticatedUser, id: string, scheduledAt: Date): Promise<RefillRequest> {
    if (scheduledAt <= this.clock.now()) {
      throw invalidField('scheduledAt', 'rfq.scheduleInPast');
    }
    return this.transition(actor, id, 'SCHEDULED', { scheduledAt }, 'rfq.scheduled', {
      at: scheduledAt.toISOString(),
    });
  }

  /** FR-RFQ-04 AC2. Yêu cầu đang gắn với phiếu nạp mở thì không hủy được — phiếu đang làm dở. */
  cancel(actor: AuthenticatedUser, id: string): Promise<RefillRequest> {
    return this.transition(actor, id, 'CANCELLED', {}, 'rfq.cancelled');
  }

  /**
   * FR-RFQ-08: gọi trong transaction mở phiếu nạp của INV. Yêu cầu phải cùng slot, đang ACCEPTED hoặc
   * SCHEDULED và chưa gắn phiếu nào.
   */
  async linkToSession(
    tx: Executor,
    input: { readonly requestId: string; readonly slotId: string; readonly sessionId: string },
  ): Promise<void> {
    const request = await this.queries.lock(input.requestId, tx);
    if (!request || request.slotId !== input.slotId) {
      throw invalidField('refillRequestId', 'rfq.requestNotForSlot');
    }
    if (!['ACCEPTED', 'SCHEDULED'].includes(request.status) || request.refillSessionId !== null) {
      throw invalidField('refillRequestId', 'rfq.requestNotLinkable');
    }
    await this.queries.linkSession(request.id, input.sessionId, this.clock.now(), tx);
  }

  /** FR-RFQ-09 AC1: gọi trong transaction đóng phiếu nạp — yêu cầu liên kết sang COMPLETED. */
  async completeForSession(tx: Executor, sessionId: string, actorId: string): Promise<void> {
    const now = this.clock.now();
    for (const request of await this.queries.lockOpenBySession(sessionId, tx)) {
      await this.queries.update(request.id, { status: 'COMPLETED', at: now }, tx);
      await this.audit.log(
        {
          actorType: 'USER',
          actorId,
          brandId: request.brandId,
          action: 'rfq.request.completed',
          targetType: 'refill_request',
          targetId: request.id,
          before: { status: request.status },
          after: { status: 'COMPLETED', refillSessionId: sessionId },
        },
        tx,
      );
      await this.notifyBrand(tx, request.id, 'rfq.completed', {}, now);
    }
  }

  private async transition(
    actor: AuthenticatedUser,
    id: string,
    to: RefillRequestStatus,
    fields: { reviewedBy?: string; rejectionReason?: string; scheduledAt?: Date },
    noticeKey: NoticeKey,
    noticeParams: Record<string, string> = {},
  ): Promise<RefillRequest> {
    await this.queries.transaction(async (tx) => {
      const request = await this.queries.lock(id, tx);
      if (!request) throw notFoundFor(actor);
      if (!canTransitionRefillRequest(request.status, to)) {
        throw new AppError('VALIDATION_ERROR', 'rfq.invalidTransition', {
          from: request.status,
          to,
        });
      }
      if (to === 'CANCELLED' && request.refillSessionId !== null) {
        throw new AppError('VALIDATION_ERROR', 'rfq.requestInProgress');
      }
      const now = this.clock.now();
      await this.queries.update(id, { status: to, at: now, ...fields }, tx);
      await this.audit.log(
        {
          actorType: 'USER',
          actorId: actor.userId,
          brandId: request.brandId,
          action: `rfq.request.${to.toLowerCase()}`,
          targetType: 'refill_request',
          targetId: id,
          before: { status: request.status },
          after: {
            status: to,
            ...(fields.rejectionReason ? { rejectionReason: fields.rejectionReason } : {}),
            ...(fields.scheduledAt ? { scheduledAt: fields.scheduledAt.toISOString() } : {}),
          },
        },
        tx,
      );
      await this.notifyBrand(tx, id, noticeKey, noticeParams, now);
    });
    return toRefillRequestDto((await this.queries.find({ kind: 'UNRESTRICTED' }, id))!);
  }

  /** Brand Admin theo dõi tiến trình yêu cầu của mình trong hộp thông báo (FR-RFQ-10). */
  private async notifyBrand(
    tx: Executor,
    id: string,
    key: NoticeKey,
    params: Record<string, string>,
    at: Date,
  ): Promise<void> {
    const request = (await this.queries.find({ kind: 'UNRESTRICTED' }, id, tx))!;
    const all = {
      ...params,
      machine: request.machineSerial,
      slot: request.slotNumber,
      product: request.productName,
    };
    await this.alr.notifyBrandAdmins(
      tx,
      {
        brandId: request.brandId,
        type: `REFILL_REQUEST_${request.status}`,
        subject: translate(DEFAULT_LOCALE, `${key}Subject` as MessageKey, all),
        content: translate(DEFAULT_LOCALE, `${key}Content` as MessageKey, all),
        referenceId: id,
        at,
      },
      ['IN_APP'],
    );
  }
}

type NoticeKey =
  'rfq.accepted' | 'rfq.rejected' | 'rfq.scheduled' | 'rfq.cancelled' | 'rfq.completed';

export function toRefillRequestDto(r: RefillRequestRecord): RefillRequest {
  return {
    id: r.id,
    brandId: r.brandId,
    brandName: r.brandName,
    slotRentalId: r.slotRentalId,
    slotId: r.slotId,
    slotNumber: r.slotNumber,
    machineId: r.machineId,
    machineSerial: r.machineSerial,
    fragranceProductId: r.fragranceProductId,
    productName: r.productName,
    reason: r.reason,
    status: r.status,
    requestedBy: r.requestedBy,
    reviewedBy: r.reviewedBy,
    rejectionReason: r.rejectionReason,
    scheduledAt: r.scheduledAt?.toISOString() ?? null,
    refillSessionId: r.refillSessionId,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function uniqueViolation(error: unknown): string | null {
  const e = error as { code?: string; constraint?: string };
  return e.code === '23505' ? (e.constraint ?? null) : null;
}
