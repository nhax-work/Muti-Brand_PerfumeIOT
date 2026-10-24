/**
 * Kỳ chi trả doanh thu (FR-SLT-52..54, ADR-0013 mục 3), bảng đối soát (FR-SLT-17, 18, FR-REV-05) và
 * doanh thu tách hai nguồn (FR-REV-04).
 *
 * Vòng đời kỳ:
 *   job refreshPayouts ─tx─▶ DRAFT cộng dồn lại từ đầu; tháng đã hết → CONFIRMED (khóa số)
 *   Brand Admin dispute ─▶ khiếu nại trên kỳ CONFIRMED (mỗi kỳ một lần)
 *   Super Admin dispute-response ─▶ trả lời khiếu nại
 *   Super Admin pay (xác thực lại) ─▶ PAID kèm mã giao dịch — chỉ khi đã xác minh pháp nhân, có tài
 *                                      khoản nhận tiền và không còn khiếu nại chưa trả lời
 *
 * CSDL giữ cùng các bất biến bằng CHECK (`chk_payout_paid`, `chk_payout_dispute_on_confirmed`,
 * `chk_payout_paid_dispute_resolved`…); service kiểm trước để trả đúng mã lỗi cho người dùng.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { DEFAULT_LOCALE, translate, type MessageKey } from '@scentstation/i18n';
import type { Kysely } from 'kysely';
import { AuditService } from '../../shared/audit/index.js';
import { CLOCK, type Clock } from '../../shared/clock.js';
import type { DB } from '../../shared/db/index.js';
import { AppError, invalidField, notFoundFor } from '../../shared/errors/index.js';
import type { BrandScope } from '../../shared/scoping/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import {
  RevQueries,
  type PayoutFilter,
  type PayoutRecord,
  type SettlementLineRecord,
} from './rev.queries.js';

type BrandPayout = Schema<'BrandPayout'>;
type Settlement = Schema<'Settlement'>;
type RevenueSplit = Schema<'RevenueSplit'>;

const DEFAULT_CURRENCY = 'VND';
/** Việt Nam không có giờ mùa hè — lệch cố định UTC+7. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const ZERO = '0.0000';

export interface SettlementQuery {
  readonly brandId?: string | undefined;
  readonly periodStart: string;
  readonly periodEnd: string;
}

@Injectable()
export class RevService {
  private readonly logger = new Logger('REV');

  constructor(
    @Inject(RevQueries) private readonly queries: RevQueries,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // -----------------------------------------------------------------------------------
  // Job (FR-SLT-52 AC3, AC4)
  // -----------------------------------------------------------------------------------

  /**
   * Tính lại kỳ DRAFT rồi chốt kỳ của tháng đã hết, trong một transaction. Quét theo dữ liệu nên chạy
   * trễ hay chạy bù sau downtime đều cho cùng kết quả.
   */
  async refreshPayouts(): Promise<{ readonly refreshed: number; readonly confirmed: number }> {
    const now = this.clock.now();
    const result = await this.queries.transaction(async (tx) => {
      const refreshed = await this.queries.refreshDraftPayouts(tx);
      const confirmed = await this.queries.confirmEndedPeriods(now, tx);
      return { refreshed, confirmed };
    });
    if (result.confirmed > 0)
      this.logger.log(`Đã chốt ${result.confirmed} kỳ chi trả sang CONFIRMED`);
    return result;
  }

  // -----------------------------------------------------------------------------------
  // Kỳ chi trả
  // -----------------------------------------------------------------------------------

  async listPayouts(
    scope: BrandScope,
    filter: PayoutFilter,
  ): Promise<{ items: BrandPayout[]; total: number }> {
    const { items, total } = await this.queries.listPayouts(scope, filter);
    return { items: items.map(toPayoutDto), total };
  }

  async getPayout(actor: AuthenticatedUser, scope: BrandScope, id: string): Promise<BrandPayout> {
    const payout = await this.queries.findPayout(scope, id);
    if (!payout) throw notFoundFor(actor);
    return toPayoutDto(payout);
  }

  /** FR-SLT-53, FR-SLT-54 AC2: Super Admin ghi nhận đã chuyển khoản. Xác thực lại ở controller. */
  async pay(actor: AuthenticatedUser, id: string, transferReference: string): Promise<BrandPayout> {
    const updated = await this.queries.transaction(async (tx) => {
      const payout = await this.queries.lockPayout({ kind: 'UNRESTRICTED' }, id, tx);
      if (!payout) throw notFoundFor(actor);
      if (payout.status !== 'CONFIRMED') {
        throw new AppError('RENTAL_NOT_ACTIVE', 'rev.payoutNotConfirmed');
      }
      if (payout.disputedAt !== null && payout.disputeResolvedAt === null) {
        throw new AppError('RENTAL_NOT_ACTIVE', 'rev.payoutDisputeOpen');
      }
      const readiness = await this.queries.brandPayoutReadiness(payout.brandId, tx);
      if (!readiness?.verified || !readiness.hasPayoutAccount) {
        throw new AppError('BRAND_NOT_VERIFIED', 'rev.brandNotVerified');
      }

      const now = this.clock.now();
      await this.queries.markPaid(id, { transferReference, paidBy: actor.userId, at: now }, tx);
      await this.audit.log(
        {
          actorType: 'USER',
          actorId: actor.userId,
          brandId: payout.brandId,
          action: 'rev.payout.paid',
          targetType: 'brand_payout',
          targetId: id,
          severity: 'HIGH',
          before: { status: payout.status },
          after: { status: 'PAID', transferReference },
          metadata: { periodMonth: payout.periodMonth, amount: payout.amount },
        },
        tx,
      );
      await this.notifyBrandAdmins(tx, payout, 'PAYOUT_PAID', 'rev.payoutPaid', now);
      return this.queries.lockPayout({ kind: 'UNRESTRICTED' }, id, tx);
    });
    return toPayoutDto(updated!);
  }

  /** FR-SLT-54 AC1: Brand Admin khiếu nại số liệu kỳ CONFIRMED của thương hiệu mình. */
  async dispute(
    actor: AuthenticatedUser,
    scope: BrandScope,
    id: string,
    note: string,
  ): Promise<BrandPayout> {
    // Khiếu nại là lời của thương hiệu — tài khoản nền tảng không gửi thay được.
    if (scope.kind !== 'BRAND') throw new AppError('FORBIDDEN_SCOPE', 'rev.disputeBrandOnly');
    const updated = await this.queries.transaction(async (tx) => {
      const payout = await this.queries.lockPayout(scope, id, tx);
      if (!payout) throw notFoundFor(actor);
      if (payout.status !== 'CONFIRMED' || payout.disputedAt !== null) {
        throw new AppError('RENTAL_NOT_ACTIVE', 'rev.disputeNotAllowed');
      }
      const now = this.clock.now();
      await this.queries.markDisputed(id, { note, by: actor.userId, at: now }, tx);
      await this.audit.log(
        {
          actorType: 'USER',
          actorId: actor.userId,
          brandId: payout.brandId,
          action: 'rev.payout.disputed',
          targetType: 'brand_payout',
          targetId: id,
          severity: 'WARNING',
          metadata: { periodMonth: payout.periodMonth },
        },
        tx,
      );
      const params = { period: payout.periodMonth.slice(0, 7) };
      for (const userId of await this.queries.activeUserIdsWithRole(
        'PLATFORM_SUPER_ADMIN',
        null,
        tx,
      )) {
        await this.queries.insertNotification(
          {
            brandId: payout.brandId,
            recipientUserId: userId,
            type: 'PAYOUT_DISPUTED',
            subject: translate(DEFAULT_LOCALE, 'rev.payoutDisputedSubject', params),
            content: translate(DEFAULT_LOCALE, 'rev.payoutDisputedContent', params),
            at: now,
          },
          tx,
        );
      }
      return this.queries.lockPayout(scope, id, tx);
    });
    return toPayoutDto(updated!);
  }

  /** FR-SLT-54 AC3: Super Admin trả lời khiếu nại — sau đó kỳ mới được chuyển PAID. */
  async respondToDispute(
    actor: AuthenticatedUser,
    id: string,
    response: string,
  ): Promise<BrandPayout> {
    const updated = await this.queries.transaction(async (tx) => {
      const payout = await this.queries.lockPayout({ kind: 'UNRESTRICTED' }, id, tx);
      if (!payout) throw notFoundFor(actor);
      if (payout.disputedAt === null || payout.disputeResolvedAt !== null) {
        throw new AppError('RENTAL_NOT_ACTIVE', 'rev.noOpenDispute');
      }
      const now = this.clock.now();
      await this.queries.markDisputeResolved(id, { response, by: actor.userId, at: now }, tx);
      await this.audit.log(
        {
          actorType: 'USER',
          actorId: actor.userId,
          brandId: payout.brandId,
          action: 'rev.payout.dispute_answered',
          targetType: 'brand_payout',
          targetId: id,
          severity: 'INFO',
          metadata: { periodMonth: payout.periodMonth },
        },
        tx,
      );
      await this.notifyBrandAdmins(
        tx,
        payout,
        'PAYOUT_DISPUTE_ANSWERED',
        'rev.payoutDisputeAnswered',
        now,
      );
      return this.queries.lockPayout({ kind: 'UNRESTRICTED' }, id, tx);
    });
    return toPayoutDto(updated!);
  }

  // -----------------------------------------------------------------------------------
  // Bảng đối soát và tách doanh thu
  // -----------------------------------------------------------------------------------

  /** FR-SLT-17, FR-SLT-18, FR-REV-05. Brand Admin luôn lấy thương hiệu mình, bỏ qua `brandId`. */
  async settlement(scope: BrandScope, query: SettlementQuery): Promise<Settlement> {
    const brandId = scope.kind === 'BRAND' ? scope.brandId : query.brandId;
    if (!brandId) throw invalidField('brandId', 'rev.brandIdRequired');
    if (query.periodEnd < query.periodStart) {
      throw invalidField('periodEnd', 'rev.periodEndBeforeStart');
    }
    const lines = await this.queries.settlementLines(brandId, query.periodStart, query.periodEnd);
    return {
      brandId,
      periodStart: query.periodStart,
      periodEnd: query.periodEnd,
      currency: DEFAULT_CURRENCY,
      lines: lines.map(toSettlementLine),
      totals: {
        orderCount: lines.reduce((n, l) => n + l.orderCount, 0),
        sprayRevenue: sumMoney(lines.map((l) => l.sprayRevenue)),
        amountDue: sumMoney(lines.map((l) => l.sprayRevenue)),
        fixedFee: ZERO,
        revenueShareAmount: ZERO,
        graceFee: ZERO,
      },
    };
  }

  /**
   * FR-REV-04. Mặc định từ đầu tháng hiện tại (giờ Việt Nam) tới hiện tại. Quyền `revenue.manage` chỉ
   * Super Admin có; kiểm phạm vi thêm một lần để tài khoản thương hiệu không bao giờ thấy phần PLATFORM
   * dù được cấp nhầm quyền (FR-REV-06).
   */
  async revenueSplit(
    scope: BrandScope,
    filter: {
      readonly from?: Date | undefined;
      readonly to?: Date | undefined;
      readonly machineId?: string | undefined;
    },
  ): Promise<RevenueSplit> {
    if (scope.kind !== 'UNRESTRICTED') {
      throw new AppError('FORBIDDEN_SCOPE', 'common.outOfScope');
    }
    const now = this.clock.now();
    const to = filter.to ?? now;
    const from = filter.from ?? vnMonthStart(now);
    if (to <= from) throw invalidField('to', 'rev.periodEndBeforeStart');
    const split = await this.queries.revenueSplit({ from, to, machineId: filter.machineId });
    return {
      periodStart: vnDate(from),
      periodEnd: vnDate(new Date(to.getTime() - 1)),
      currency: DEFAULT_CURRENCY,
      ...split,
    };
  }

  private async notifyBrandAdmins(
    tx: Kysely<DB>,
    payout: PayoutRecord,
    type: string,
    keyPrefix: 'rev.payoutPaid' | 'rev.payoutDisputeAnswered',
    at: Date,
  ): Promise<void> {
    const params = { period: payout.periodMonth.slice(0, 7) };
    for (const userId of await this.queries.activeUserIdsWithRole(
      'BRAND_ADMIN',
      payout.brandId,
      tx,
    )) {
      await this.queries.insertNotification(
        {
          brandId: payout.brandId,
          recipientUserId: userId,
          type,
          subject: translate(DEFAULT_LOCALE, `${keyPrefix}Subject` as MessageKey, params),
          content: translate(DEFAULT_LOCALE, `${keyPrefix}Content` as MessageKey, params),
          at,
        },
        tx,
      );
    }
  }
}

function toPayoutDto(p: PayoutRecord): BrandPayout {
  return {
    id: p.id,
    brandId: p.brandId,
    periodMonth: p.periodMonth,
    status: p.status,
    currency: p.currency as BrandPayout['currency'],
    orderCount: p.orderCount,
    amount: p.amount,
    confirmedAt: p.confirmedAt?.toISOString() ?? null,
    paidAt: p.paidAt?.toISOString() ?? null,
    transferReference: p.transferReference,
    disputeNote: p.disputeNote,
    disputedAt: p.disputedAt?.toISOString() ?? null,
    disputeResponse: p.disputeResponse,
    disputeResolvedAt: p.disputeResolvedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

function toSettlementLine(l: SettlementLineRecord): Settlement['lines'][number] {
  return {
    rentalId: l.rentalId,
    slotId: l.slotId,
    machineId: l.machineId,
    orderCount: l.orderCount,
    sprayRevenue: l.sprayRevenue,
    amountDue: l.sprayRevenue,
    fixedFee: ZERO,
    revenueShareAmount: ZERO,
    graceFee: ZERO,
  };
}

/** Cộng chuỗi tiền `numeric(19,4)` không qua số thực — đổi sang phần vạn đồng bằng BigInt. */
function sumMoney(values: readonly string[]): string {
  const total = values.reduce((acc, v) => {
    const [whole = '0', frac = ''] = v.split('.');
    return acc + BigInt(whole + frac.padEnd(4, '0').slice(0, 4));
  }, 0n);
  const negative = total < 0n;
  const digits = (negative ? -total : total).toString().padStart(5, '0');
  return `${negative ? '-' : ''}${digits.slice(0, -4)}.${digits.slice(-4)}`;
}

/** Ngày đầu tháng chứa `at`, theo giờ Việt Nam, dưới dạng mốc UTC. */
function vnMonthStart(at: Date): Date {
  const local = new Date(at.getTime() + VN_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - VN_OFFSET_MS);
}

/** `YYYY-MM-DD` của mốc `at` theo giờ Việt Nam. */
function vnDate(at: Date): string {
  return new Date(at.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}
