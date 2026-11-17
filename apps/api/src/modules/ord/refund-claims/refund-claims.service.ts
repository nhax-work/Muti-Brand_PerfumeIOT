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
 *
 * Khách theo dõi phiếu bằng mã khiếu nại và email (ADR-0031, FR-ORD-36, FR-ORD-37): email gửi SAU
 * khi transaction đã commit, gửi lỗi chỉ ghi log và AuditLog — không làm hỏng thao tác.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import {
  DEFAULT_LOCALE,
  LOCALES,
  translate,
  type Locale,
  type MessageKey,
} from '@scentstation/i18n';
import { AuditService } from '../../../shared/audit/index.js';
import { CLOCK, type Clock } from '../../../shared/clock.js';
import { APP_CONFIG, type AppConfig } from '../../../shared/config/index.js';
import { decryptJson, encryptJson, PII_KEY_VERSION } from '../../../shared/crypto/pii-cipher.js';
import { AppError, invalidField } from '../../../shared/errors/index.js';
import { formatAmount, formatVnDateTime } from '../../../shared/format/index.js';
import type { RequestOrigin } from '../../../shared/http/request-origin.js';
import { PerMinuteRateLimiter } from '../../../shared/http/rate-limiter.js';
import type { RefundClaimStatus } from '../../../shared/db/types.generated.js';
import { AlrService } from '../../alr/index.js';
import type { AuthenticatedUser } from '../../auth/index.js';
import { OrdService } from '../ord.service.js';
import {
  claimTokenFor,
  claimViewKeyFor,
  formatClaimCode,
  generateClaimCode,
  isValidClaimToken,
  normalizeClaimCode,
  refundablePartsOf,
} from './claimability.js';
import {
  REFUND_CLAIM_MAILER,
  type ClaimOutcome,
  type RefundClaimMailer,
} from './refund-claim-mailer.js';
import { RefundClaimsQueries, type RefundClaimRecord } from './refund-claims.queries.js';

export interface ClaimSubmission {
  readonly orderId: string;
  readonly claimToken: string;
  /** Email nhận mã khiếu nại và kết quả (ADR-0031). */
  readonly contact: string;
  readonly locale?: Locale | undefined;
  readonly refundAccount: {
    readonly bankBin: string;
    readonly accountNumber: string;
    readonly accountName: string;
  };
}

type RefundClaim = Schema<'RefundClaim'>;
type RefundClaimReceipt = Schema<'RefundClaimReceipt'>;
type RefundClaimTracking = Schema<'RefundClaimTracking'>;
type RefundAccountView = Schema<'RefundAccountView'>;

interface AccountSecret {
  readonly bankBin: string;
  readonly accountNumber: string;
  readonly accountName: string;
}

const JOB_BATCH = 100;
/** Số lần thử lại khi mã khiếu nại sinh ra trùng mã đã có — xác suất ~ số phiếu / 2^50. */
const CODE_ATTEMPTS = 3;
/** Đủ để phân biệt email với số điện thoại của phiếu tạo trước ADR-0031; định dạng đã kiểm lúc nhận. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+$/;
/** Quyền xử lý phiếu khiếu nại và đơn cần kiểm tra (FR-ORD-20) — người nhận phiếu mới. */
const ORDER_REFUND = 'order.refund';

@Injectable()
export class RefundClaimsService {
  private readonly logger = new Logger('ORD/refund-claims');
  private readonly limiter: PerMinuteRateLimiter;
  private readonly lookupLimiter: PerMinuteRateLimiter;

  constructor(
    @Inject(RefundClaimsQueries) private readonly queries: RefundClaimsQueries,
    @Inject(OrdService) private readonly orders: OrdService,
    @Inject(AlrService) private readonly alr: AlrService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(REFUND_CLAIM_MAILER) private readonly mailer: RefundClaimMailer,
  ) {
    this.limiter = new PerMinuteRateLimiter(clock, () =>
      config.constraint('REFUND_CLAIM_RATE_LIMIT_PER_MIN'),
    );
    this.lookupLimiter = new PerMinuteRateLimiter(clock, () =>
      config.constraint('REFUND_CLAIM_LOOKUP_RATE_LIMIT_PER_MIN'),
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
    const claim = await this.withFreshCode((publicCode) =>
      this.queries.transaction(async (tx) => {
        const created = await this.queries.insert(
          {
            publicCode,
            locale: input.locale ?? DEFAULT_LOCALE,
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
        // Phiếu có hạn REFUND_CLAIM_SLA_HOURS — báo người xử lý ngay, không đợi tới lúc quá hạn.
        await this.alr.notifyPermissionHolders(
          tx,
          this.claimNotice(created, 'REFUND_CLAIM_SUBMITTED', 'ord.claimSubmitted', now),
          ORDER_REFUND,
        );
        return created;
      }),
    );
    if (!claim) throw new AppError('CLAIM_ALREADY_OPEN', 'ord.claimAlreadyOpen');

    await this.notifyCustomer(claim.id, 'RECEIPT');
    return {
      id: claim.id,
      code: formatClaimCode(claim.publicCode),
      status: claim.status,
      amount: claim.amount,
      currency: claim.currency as RefundClaimReceipt['currency'],
      createdAt: claim.createdAt.toISOString(),
    };
  }

  /** FR-ORD-36: tiến độ cho khách — không có tài khoản, liên hệ hay tên nhân viên. */
  async track(rawCode: string, origin: RequestOrigin): Promise<RefundClaimTracking> {
    if (!this.lookupLimiter.tryAcquire(origin.ip ?? 'unknown')) {
      throw new AppError('RATE_LIMITED', 'ord.claimLookupRateLimited');
    }
    const code = normalizeClaimCode(rawCode);
    // Sai định dạng và không tồn tại: cùng một câu trả lời.
    const claim = code ? await this.queries.findByCode(code) : null;
    if (!claim) throw new AppError('NOT_FOUND', 'ord.claimNotFound');

    const open = claim.status === 'OPEN';
    const rejected = claim.status === 'REJECTED';
    return {
      code: formatClaimCode(claim.publicCode),
      status: claim.status,
      stage: open ? (claim.assignedAt ? 'PROCESSING' : 'RECEIVED') : claim.status,
      amount: claim.amount,
      currency: claim.currency as RefundClaimTracking['currency'],
      createdAt: claim.createdAt.toISOString(),
      dueAt: open ? this.slaDueAt(claim).toISOString() : null,
      closedAt: claim.closedAt?.toISOString() ?? null,
      payoutReference: claim.status === 'REFUNDED' ? claim.payoutReference : null,
      resolutionNote: rejected ? claim.resolutionNote : null,
      hasEvidence: rejected && (await this.queries.countEvidence(claim.id)).stored > 0,
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
      code?: string | undefined;
    },
  ): Promise<{ items: RefundClaim[]; total: number }> {
    let publicCode: string | undefined;
    if (filter.code !== undefined) {
      const normalized = normalizeClaimCode(filter.code);
      // Mã sai định dạng thì không phiếu nào khớp — trả danh sách rỗng, không báo lỗi.
      if (!normalized) return { items: [], total: 0 };
      publicCode = normalized;
    }
    const { items, total } = await this.queries.list({
      page: filter.page,
      pageSize: filter.pageSize,
      status: filter.status,
      assignedTo: filter.assignedToMe ? actor.userId : undefined,
      publicCode,
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
      // Tự nhận việc thì không cần báo chính mình; giao lại cho cùng người cũng không báo lần hai.
      if (assigneeId !== actor.userId && assigneeId !== claim.assignedTo) {
        await this.alr.notifyUsers(
          tx,
          this.claimNotice(claim, 'REFUND_CLAIM_ASSIGNED', 'ord.claimAssigned', at),
          [assigneeId],
        );
      }
    });
    return this.get(id);
  }

  /** Nội dung thông báo về một phiếu — hạn xử lý tính từ lúc khách gửi (FR-ORD-31). */
  private claimNotice(
    claim: Pick<
      RefundClaimRecord,
      'id' | 'orderId' | 'brandId' | 'amount' | 'currency' | 'createdAt'
    >,
    type: string,
    key: 'ord.claimSubmitted' | 'ord.claimAssigned',
    at: Date,
  ) {
    const slaMs = this.config.constraint('REFUND_CLAIM_SLA_HOURS') * 60 * 60 * 1000;
    const params = {
      amount: formatAmount(claim.amount),
      currency: claim.currency,
      orderId: claim.orderId,
      deadline: formatVnDateTime(new Date(claim.createdAt.getTime() + slaMs)),
    };
    return {
      brandId: claim.brandId,
      type,
      subject: translate(DEFAULT_LOCALE, `${key}Subject` as MessageKey, params),
      content: translate(DEFAULT_LOCALE, `${key}Content` as MessageKey, params),
      referenceId: claim.id,
      at,
    };
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
    await this.notifyCustomer(id, 'CLOSED');
    return this.get(id);
  }

  async reject(actor: AuthenticatedUser, id: string, reason: string): Promise<RefundClaim> {
    await this.closeAsAssignee(actor, id, async (claim, tx, at) => {
      // FR-ORD-38 (ADR-0032): khách nói không nhận được lượt xịt mà dữ liệu máy không đủ tin — muốn bác
      // thì phải có hình camera độc lập. Chỉ khiếu nại chuyển khoản thừa thì bằng chứng là sao kê.
      if (claim.refundOrder && (await this.queries.countEvidence(claim.id, tx)).active === 0) {
        throw new AppError('EVIDENCE_REQUIRED', 'evd.evidenceRequired');
      }
      // Đã có người xem và quyết không hoàn — đơn rời danh sách kiểm tra thủ công.
      await this.orders.clearManualReview(tx, claim.orderId);
      await this.queries.close(
        id,
        { status: 'REJECTED', at, resolvedBy: actor.userId, resolutionNote: reason },
        tx,
      );
      return { action: 'ord.refund_claim.rejected', after: { status: 'REJECTED', reason } };
    });
    await this.notifyCustomer(id, 'CLOSED');
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
      if (closed) {
        expired += 1;
        await this.notifyCustomer(id, 'CLOSED');
      }
    }

    let alerted = 0;
    const slaBefore = new Date(
      now.getTime() - this.config.constraint('REFUND_CLAIM_SLA_HOURS') * 60 * 60 * 1000,
    );
    // Chống trùng bằng uq_alert_dedup_unresolved (FR-ALR-07): còn cảnh báo chưa xử lý thì không tạo thêm.
    for (const breach of await this.queries.listSlaBreaches(slaBefore)) {
      const raised = await this.alr.raiseAlert(
        {
          brandId: breach.brandId,
          machineId: breach.machineId,
          type: 'REFUND_CLAIM_SLA_BREACHED',
          severity: 'HIGH',
          deduplicationKey: `REFUND_CLAIM_SLA:${breach.id}`,
          title: 'Phiếu khiếu nại hoàn tiền quá hạn xử lý',
          description: `Phiếu ${breach.id} mở từ ${breach.createdAt.toISOString()} chưa được xử lý (BR-002).`,
          at: now,
        },
        undefined,
        'IGNORE',
      );
      if (raised) alerted += 1;
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

  /**
   * Thử lại khi mã khiếu nại vừa sinh trùng mã đã có (uq_refund_claim_public_code). Lỗi trùng làm hỏng
   * transaction nên phải chạy lại cả transaction, không chỉ câu INSERT.
   */
  private async withFreshCode<T>(work: (publicCode: string) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await work(generateClaimCode());
      } catch (err: unknown) {
        if (attempt >= CODE_ATTEMPTS || !isPublicCodeConflict(err)) throw err;
      }
    }
  }

  /**
   * FR-ORD-37: email cho khách, gửi sau khi transaction đã commit. Không bao giờ ném — khách vẫn có
   * mã trên màn hình và tra cứu được. Không gửi khi liên hệ đã bị xóa hoặc là số điện thoại (phiếu
   * tạo trước ADR-0031). AuditLog ghi kết quả, KHÔNG ghi địa chỉ email.
   */
  private async notifyCustomer(claimId: string, kind: 'RECEIPT' | 'CLOSED'): Promise<void> {
    const { refundAccountEncKey: key, refundClaimTokenSecret: secret } = this.config;
    if (!key || !secret) return;
    try {
      const claim = await this.queries.findById(claimId);
      const secrets = await this.queries.findSecretsById(claimId);
      if (!claim || !secrets?.contact) return;
      const to = decryptJson<string>(key, secrets.contact);
      if (!LOOKS_LIKE_EMAIL.test(to)) return;

      const locale = toLocale(claim.locale);
      const code = formatClaimCode(claim.publicCode);
      const link =
        `${this.config.adminWebBaseUrl}/claim/status?code=${encodeURIComponent(code)}` +
        `&key=${encodeURIComponent(claimViewKeyFor(secret, claim.id))}`;
      const delivered =
        kind === 'RECEIPT'
          ? await this.mailer.sendReceipt({
              to,
              locale,
              code,
              amount: formatAmount(claim.amount),
              currency: claim.currency,
              deadline: formatVnDateTime(this.slaDueAt(claim)),
              link,
            })
          : await this.mailer.sendClosed({
              to,
              locale,
              code,
              outcome: claim.status as ClaimOutcome,
              link,
            });

      await this.audit.log({
        actorType: 'SYSTEM',
        brandId: claim.brandId,
        action: 'ord.refund_claim.customer_notified',
        targetType: 'RefundClaim',
        targetId: claim.id,
        severity: delivered ? 'INFO' : 'WARNING',
        metadata: { kind, status: claim.status, delivered },
      });
    } catch (err: unknown) {
      this.logger.warn(
        `Không gửi được email ${kind} cho phiếu ${claimId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private slaDueAt(claim: Pick<RefundClaimRecord, 'createdAt'>): Date {
    const slaMs = this.config.constraint('REFUND_CLAIM_SLA_HOURS') * 60 * 60 * 1000;
    return new Date(claim.createdAt.getTime() + slaMs);
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
    return {
      id: claim.id,
      code: formatClaimCode(claim.publicCode),
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
      slaDueAt: this.slaDueAt(claim).toISOString(),
    };
  }
}

function toLocale(value: string): Locale {
  return (LOCALES as readonly string[]).includes(value) ? (value as Locale) : DEFAULT_LOCALE;
}

/** 23505 trên đúng ràng buộc mã khiếu nại — trùng đơn (uq_refund_claim_order) đã xử lý bằng ON CONFLICT. */
function isPublicCodeConflict(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string } | null;
  return e?.code === '23505' && e.constraint === 'uq_refund_claim_public_code';
}
