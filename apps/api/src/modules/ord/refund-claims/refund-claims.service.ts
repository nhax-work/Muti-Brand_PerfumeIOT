/**
 * Phiếu khiếu nại hoàn tiền thủ công (ADR-0012, FR-ORD-20, FR-ORD-28 ÷ 32).
 *
 * PayOS không dùng API hoàn tiền tự động: khách quét QR sự cố trên kiosk, gửi phiếu kèm tài khoản
 * nhận hoàn tiền; Operations Staff được phân công chuyển khoản tay rồi ghi nhận. Ba bất biến về dữ
 * liệu cá nhân (NFR-DAT-04):
 *   - tài khoản và liên hệ chỉ nằm trong refund_claims, mã hóa ở tầng ứng dụng;
 *   - chỉ người được phân công giải mã, sau khi xác thực lại — mỗi lần ghi AuditLog KHÔNG kèm dữ liệu;
 *   - tài khoản bị xóa ngay khi phiếu đóng (CHECK ở CSDL), liên hệ xóa sau
 *     REFUND_CLAIM_CONTACT_RETENTION_DAYS.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { AuditService } from '../../../shared/audit/index.js';
import { CLOCK, type Clock } from '../../../shared/clock.js';
import { APP_CONFIG, type AppConfig } from '../../../shared/config/index.js';
import { decryptJson, encryptJson, PII_KEY_VERSION } from '../../../shared/crypto/pii-cipher.js';
import { AppError, invalidField } from '../../../shared/errors/index.js';
import type { RequestOrigin } from '../../../shared/http/request-origin.js';
import { PerMinuteRateLimiter } from '../../../shared/http/rate-limiter.js';
import type { RefundClaimStatus } from '../../../shared/db/types.generated.js';
import type { AuthenticatedUser } from '../../auth/index.js';
import { OrdService } from '../ord.service.js';
import { claimTokenFor, isValidClaimToken, refundablePartsOf } from './claimability.js';
import { RefundClaimsQueries, type RefundClaimRecord } from './refund-claims.queries.js';

export interface ClaimSubmission {
  readonly orderId: string;
  readonly claimToken: string;
  readonly contact: string;
  readonly refundAccount: {
    readonly bankBin: string;
    readonly accountNumber: string;
    readonly accountName: string;
  };
}

type RefundClaim = Schema<'RefundClaim'>;
type RefundClaimReceipt = Schema<'RefundClaimReceipt'>;
type RefundAccountView = Schema<'RefundAccountView'>;

interface AccountSecret {
  readonly bankBin: string;
  readonly accountNumber: string;
  readonly accountName: string;
}

const JOB_BATCH = 100;

@Injectable()
export class RefundClaimsService {
  private readonly logger = new Logger('ORD/refund-claims');
  private readonly limiter: PerMinuteRateLimiter;

  constructor(
    @Inject(RefundClaimsQueries) private readonly queries: RefundClaimsQueries,
    @Inject(OrdService) private readonly orders: OrdService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.limiter = new PerMinuteRateLimiter(clock, () =>
      config.constraint('REFUND_CLAIM_RATE_LIMIT_PER_MIN'),
    );
  }

  // -----------------------------------------------------------------------------------
  // Kiosk và khách (FR-ORD-28, FR-ORD-29)
  // -----------------------------------------------------------------------------------

  /** Mã khiếu nại cho QR sự cố; `null` nếu đơn không có gì để hoàn, đã có phiếu, hoặc chưa cấu hình. */
  async claimTokenForOrder(orderId: string): Promise<string | null> {
    const { refundAccountEncKey: key, refundClaimTokenSecret: secret } = this.config;
    if (!key || !secret) return null;
    const order = await this.queries.findClaimOrder(orderId);
    if (!order || order.hasClaim || !refundablePartsOf(order, order.extraTransfers)) return null;
    return claimTokenFor(secret, orderId);
  }

  async submit(input: ClaimSubmission, origin: RequestOrigin): Promise<RefundClaimReceipt> {
    if (!this.limiter.tryAcquire(origin.ip ?? 'unknown')) {
      throw new AppError('RATE_LIMITED', 'ord.claimRateLimited');
    }
    const { key, secret } = this.requireSecrets();

    // Mã sai, đơn không tồn tại: cùng một câu trả lời — không lộ đơn nào có thật.
    if (!isValidClaimToken(secret, input.orderId, input.claimToken)) {
      throw new AppError('NOT_FOUND', 'ord.claimNotFound');
    }
    const order = await this.queries.findClaimOrder(input.orderId);
    if (!order) throw new AppError('NOT_FOUND', 'ord.claimNotFound');
    if (order.hasClaim) throw new AppError('CLAIM_ALREADY_OPEN', 'ord.claimAlreadyOpen');
    const parts = refundablePartsOf(order, order.extraTransfers);
    if (!parts) throw new AppError('ORDER_NOT_CLAIMABLE', 'ord.orderNotClaimable');

    const now = this.clock.now();
    const claim = await this.queries.transaction(async (tx) => {
      const created = await this.queries.insert(
        {
          orderId: order.id,
          brandId: order.brandId,
          refundOrder: parts.refundOrder,
          amount: parts.amount,
          currency: order.currency,
          accountCiphertext: encryptJson(key, input.refundAccount satisfies AccountSecret),
          contactCiphertext: encryptJson(key, input.contact),
          keyVersion: PII_KEY_VERSION,
          consentedAt: now,
        },
        tx,
      );
      if (!created) return null;
      // AuditLog chỉ thêm, không xóa được (FR-AUD-09) — tuyệt đối không ghi tài khoản hay liên hệ.
      await this.audit.log(
        {
          actorType: 'ANONYMOUS',
          brandId: order.brandId,
          action: 'ord.refund_claim.created',
          targetType: 'RefundClaim',
          targetId: created.id,
          sourceIp: origin.ip,
          userAgent: origin.userAgent,
          metadata: {
            orderId: order.id,
            amount: parts.amount,
            refundOrder: parts.refundOrder,
            extraTransfers: parts.extraTransfers,
          },
        },
        tx,
      );
      return created;
    });
    if (!claim) throw new AppError('CLAIM_ALREADY_OPEN', 'ord.claimAlreadyOpen');

    return {
      id: claim.id,
      status: claim.status,
      amount: claim.amount,
      currency: claim.currency as RefundClaimReceipt['currency'],
      createdAt: claim.createdAt.toISOString(),
    };
  }

  // -----------------------------------------------------------------------------------
  // Operations Staff (FR-ORD-20, FR-ORD-30)
  // -----------------------------------------------------------------------------------

  async list(
    actor: AuthenticatedUser,
    filter: {
      page: number;
      pageSize: number;
      status?: RefundClaimStatus | undefined;
      assignedToMe?: boolean | undefined;
    },
  ): Promise<{ items: RefundClaim[]; total: number }> {
    const { items, total } = await this.queries.list({
      page: filter.page,
      pageSize: filter.pageSize,
      status: filter.status,
      assignedTo: filter.assignedToMe ? actor.userId : undefined,
    });
    return { items: items.map((c) => this.toDto(c)), total };
  }

  async get(id: string): Promise<RefundClaim> {
    return this.toDto(await this.requireClaim(id));
  }

  async assign(actor: AuthenticatedUser, id: string, assigneeId: string): Promise<RefundClaim> {
    if (!(await this.queries.isActiveOperationsStaff(assigneeId))) {
      throw invalidField('assigneeId', 'ord.assigneeNotOperations');
    }
    const at = this.clock.now();
    await this.queries.transaction(async (tx) => {
      const claim = await this.queries.lockById(id, tx);
      if (!claim) throw new AppError('NOT_FOUND', 'ord.claimNotFound');
      if (claim.status !== 'OPEN') throw new AppError('VALIDATION_ERROR', 'ord.claimClosed');
      await this.queries.assign(id, assigneeId, at, tx);
      await this.audit.log(
        {
          actorType: 'USER',
          actorId: actor.userId,
          brandId: claim.brandId,
          action: 'ord.refund_claim.assigned',
          targetType: 'RefundClaim',
          targetId: id,
          before: { assignedTo: claim.assignedTo },
          after: { assignedTo: assigneeId },
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** FR-ORD-30: chỉ người được phân công, đã xác thực lại (guard). */
  async viewAccount(
    actor: AuthenticatedUser,
    id: string,
    origin: RequestOrigin,
  ): Promise<RefundAccountView> {
    const { key } = this.requireSecrets();
    const claim = await this.requireClaim(id);
    if (claim.assignedTo !== actor.userId) {
      throw new AppError('CLAIM_NOT_ASSIGNED', 'ord.claimNotAssigned');
    }
    const secrets = await this.queries.findSecretsById(id);
    if (claim.status !== 'OPEN' || !secrets?.account) {
      throw new AppError('VALIDATION_ERROR', 'ord.claimClosed');
    }
    const account = decryptJson<AccountSecret>(key, secrets.account);
    const contact = secrets.contact ? decryptJson<string>(key, secrets.contact) : null;

    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      brandId: claim.brandId,
      action: 'ord.refund_claim.account_viewed',
      targetType: 'RefundClaim',
      targetId: id,
      severity: 'WARNING',
      sourceIp: origin.ip,
      userAgent: origin.userAgent,
    });
    return { ...account, contact };
  }

  async recordPayout(
    actor: AuthenticatedUser,
    id: string,
    input: { payoutReference: string; note?: string | undefined },
  ): Promise<RefundClaim> {
    await this.closeAsAssignee(actor, id, async (claim, tx, at) => {
      if (claim.refundOrder) {
        await this.orders.markRefunded(tx, claim.orderId, actor.userId, { refundClaimId: id });
      } else {
        await this.orders.clearManualReview(tx, claim.orderId);
      }
      await this.queries.close(
        id,
        {
          status: 'REFUNDED',
          at,
          resolvedBy: actor.userId,
          payoutReference: input.payoutReference,
          resolutionNote: input.note ?? null,
        },
        tx,
      );
      return {
        action: 'ord.refund_claim.refunded',
        after: { status: 'REFUNDED', payoutReference: input.payoutReference, amount: claim.amount },
      };
    });
    return this.get(id);
  }

  async reject(actor: AuthenticatedUser, id: string, reason: string): Promise<RefundClaim> {
    await this.closeAsAssignee(actor, id, async (claim, tx, at) => {
      // Đã có người xem và quyết không hoàn — đơn rời danh sách kiểm tra thủ công.
      await this.orders.clearManualReview(tx, claim.orderId);
      await this.queries.close(
        id,
        { status: 'REJECTED', at, resolvedBy: actor.userId, resolutionNote: reason },
        tx,
      );
      return { action: 'ord.refund_claim.rejected', after: { status: 'REJECTED', reason } };
    });
    return this.get(id);
  }

  // -----------------------------------------------------------------------------------
  // Job (FR-ORD-31, FR-ORD-32)
  // -----------------------------------------------------------------------------------

  /** Một nhịp: hết hạn phiếu bỏ quên, cảnh báo quá SLA, xóa liên hệ quá hạn giữ. */
  async runMaintenance(): Promise<{ expired: number; alerted: number; contactsPurged: number }> {
    const now = this.clock.now();
    const day = 24 * 60 * 60 * 1000;

    let expired = 0;
    const openedBefore = new Date(
      now.getTime() - this.config.constraint('REFUND_CLAIM_MAX_OPEN_DAYS') * day,
    );
    for (const id of await this.queries.listStaleOpenIds(openedBefore, JOB_BATCH)) {
      const closed = await this.queries.transaction(async (tx) => {
        const claim = await this.queries.lockById(id, tx);
        if (!claim || claim.status !== 'OPEN') return false;
        await this.queries.close(id, { status: 'EXPIRED', at: now, resolvedBy: null }, tx);
        await this.audit.log(
          {
            actorType: 'SYSTEM',
            brandId: claim.brandId,
            action: 'ord.refund_claim.expired',
            targetType: 'RefundClaim',
            targetId: id,
            severity: 'WARNING',
          },
          tx,
        );
        return true;
      });
      if (closed) expired += 1;
    }

    let alerted = 0;
    const slaBefore = new Date(
      now.getTime() - this.config.constraint('REFUND_CLAIM_SLA_HOURS') * 60 * 60 * 1000,
    );
    for (const breach of await this.queries.listSlaBreaches(slaBefore)) {
      if (await this.queries.raiseSlaAlert(breach, now)) alerted += 1;
    }

    const closedBefore = new Date(
      now.getTime() - this.config.constraint('REFUND_CLAIM_CONTACT_RETENTION_DAYS') * day,
    );
    const contactsPurged = await this.queries.purgeContacts(closedBefore, now);

    return { expired, alerted, contactsPurged };
  }

  // -----------------------------------------------------------------------------------
  // Nội bộ
  // -----------------------------------------------------------------------------------

  private async closeAsAssignee(
    actor: AuthenticatedUser,
    id: string,
    work: (
      claim: RefundClaimRecord,
      tx: Parameters<Parameters<RefundClaimsQueries['transaction']>[0]>[0],
      at: Date,
    ) => Promise<{ action: string; after: Record<string, unknown> }>,
  ): Promise<void> {
    const at = this.clock.now();
    await this.queries.transaction(async (tx) => {
      const claim = await this.queries.lockById(id, tx);
      if (!claim) throw new AppError('NOT_FOUND', 'ord.claimNotFound');
      if (claim.assignedTo !== actor.userId) {
        throw new AppError('CLAIM_NOT_ASSIGNED', 'ord.claimNotAssigned');
      }
      if (claim.status !== 'OPEN') throw new AppError('VALIDATION_ERROR', 'ord.claimClosed');
      const { action, after } = await work(claim, tx, at);
      await this.audit.log(
        {
          actorType: 'USER',
          actorId: actor.userId,
          brandId: claim.brandId,
          action,
          targetType: 'RefundClaim',
          targetId: id,
          before: { status: claim.status },
          after,
        },
        tx,
      );
    });
  }

  private async requireClaim(id: string): Promise<RefundClaimRecord> {
    const claim = await this.queries.findById(id);
    if (!claim) throw new AppError('NOT_FOUND', 'ord.claimNotFound');
    return claim;
  }

  private requireSecrets(): { key: Buffer; secret: string } {
    const { refundAccountEncKey: key, refundClaimTokenSecret: secret } = this.config;
    if (!key || !secret) throw new Error(this.missingSecretsMessage());
    return { key, secret };
  }

  private missingSecretsMessage(): string {
    const message =
      'Thiếu REFUND_ACCOUNT_ENC_KEY hoặc REFUND_CLAIM_TOKEN_SECRET — tính năng khiếu nại hoàn tiền đang tắt (ADR-0012).';
    this.logger.error(message);
    return message;
  }

  private toDto(claim: RefundClaimRecord): RefundClaim {
    const slaMs = this.config.constraint('REFUND_CLAIM_SLA_HOURS') * 60 * 60 * 1000;
    return {
      id: claim.id,
      orderId: claim.orderId,
      paymentReference: claim.paymentReference,
      status: claim.status,
      refundOrder: claim.refundOrder,
      amount: claim.amount,
      currency: claim.currency as RefundClaim['currency'],
      hasRefundAccount: claim.hasRefundAccount,
      assignedTo: claim.assignedTo,
      assignedAt: claim.assignedAt?.toISOString() ?? null,
      payoutReference: claim.payoutReference,
      resolutionNote: claim.resolutionNote,
      createdAt: claim.createdAt.toISOString(),
      closedAt: claim.closedAt?.toISOString() ?? null,
      slaDueAt: new Date(claim.createdAt.getTime() + slaMs).toISOString(),
    };
  }
}
