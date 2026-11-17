/**
 * Bằng chứng camera an ninh độc lập với máy (ADR-0032, FR-ORD-38, 39, FR-INV-38, 39).
 *
 * Camera ghi liên tục lên đầu ghi riêng; hệ thống KHÔNG kết nối camera. EVD chỉ làm ba việc:
 *   1. chỉ ra khung giờ cần tua (từ dữ liệu đơn / phiếu nạp, nới CAMERA_WINDOW_PADDING_SEC);
 *   2. nhận đoạn trích người tải lên — khoảng ghi phải giao khung giờ, lưu SHA-256, kho riêng tư;
 *   3. cho đúng người xem qua đường dẫn ký có hạn, mỗi lần cấp đường dẫn ghi AuditLog.
 *
 * Ràng buộc chống "tự làm chứng cho mình": bằng chứng phiếu nạp không do chính người nạp tải lên, và
 * Inventory Staff không xem được (ADR-0032 mục 3).
 */

import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { DEFAULT_LOCALE, translate } from '@scentstation/i18n';
import {
  detectImageKind,
  normalizeImage,
  PRIVATE_MEDIA_STORAGE,
  type PrivateMediaStorage,
} from '../../adapters/media/index.js';
import { AuditService } from '../../shared/audit/index.js';
import { CLOCK, type Clock } from '../../shared/clock.js';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import { AppError, invalidField } from '../../shared/errors/index.js';
import { formatVnDateTime } from '../../shared/format/index.js';
import type { RequestOrigin } from '../../shared/http/request-origin.js';
import { PerMinuteRateLimiter } from '../../shared/http/rate-limiter.js';
import type { BrandScope } from '../../shared/scoping/index.js';
import type { FootageRequestStatus } from '../../shared/db/types.generated.js';
import { AlrService } from '../alr/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import { isValidClaimViewKey, normalizeClaimCode } from '../ord/index.js';
import {
  EvdQueries,
  type EvidenceRecord,
  type EvidenceTarget,
  type FootageRequestRecord,
  type MachineInfo,
} from './evd.queries.js';
import {
  fileUrlKey,
  isMp4,
  overlaps,
  padWindow,
  parseRange,
  signFileUrl,
  toRealTime,
  verifyFileUrl,
  type TimeWindow,
} from './evidence-rules.js';

type CameraEvidence = Schema<'CameraEvidence'>;
type PublicCameraEvidence = Schema<'PublicCameraEvidence'>;
type EvidenceWindow = Schema<'EvidenceWindow'>;
type FootageRequest = Schema<'FootageRequest'>;

export interface EvidenceUpload {
  readonly cameraLabel: string;
  /** Khoảng ghi theo giờ trên hình — chưa trừ độ lệch. */
  readonly recordedFrom: Date;
  readonly recordedTo: Date;
  readonly clockOffsetSec: number;
  readonly note?: string | undefined;
}

/** Quyền của nhân sự nền tảng xử lý bằng chứng phiếu nạp (Operations Staff, Super Admin). */
export const MACHINE_OPERATE = 'machine.operate';
const JOB_BATCH = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class EvdService {
  private readonly logger = new Logger('EVD');
  private readonly urlKey: Buffer;
  private readonly publicLimiter: PerMinuteRateLimiter;

  constructor(
    @Inject(EvdQueries) private readonly queries: EvdQueries,
    @Inject(PRIVATE_MEDIA_STORAGE) private readonly storage: PrivateMediaStorage,
    @Inject(AlrService) private readonly alr: AlrService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.urlKey = fileUrlKey(config.jwtSecret);
    // Cùng ngưỡng với tra cứu phiếu (ADR-0031): trang tra cứu gọi cả hai.
    this.publicLimiter = new PerMinuteRateLimiter(clock, () =>
      config.constraint('REFUND_CLAIM_LOOKUP_RATE_LIMIT_PER_MIN'),
    );
  }

  // -----------------------------------------------------------------------------------
  // Phiếu khiếu nại (FR-ORD-38)
  // -----------------------------------------------------------------------------------

  async claimWindow(claimId: string): Promise<EvidenceWindow> {
    const claim = await this.requireClaim(claimId);
    return this.windowDto(claim, this.claimWindowOf(claim));
  }

  async listClaimEvidence(actor: AuthenticatedUser, claimId: string) {
    const claim = await this.requireClaim(claimId);
    return this.listFor(actor, { kind: 'CLAIM', id: claim.id }, claim.brandId);
  }

  async addClaimEvidence(
    actor: AuthenticatedUser,
    claimId: string,
    upload: EvidenceUpload,
    data: Buffer,
  ): Promise<CameraEvidence> {
    const claim = await this.requireClaim(claimId);
    if (claim.assignedTo !== actor.userId) {
      throw new AppError('CLAIM_NOT_ASSIGNED', 'ord.claimNotAssigned');
    }
    if (claim.status !== 'OPEN') throw new AppError('EVIDENCE_TARGET_CLOSED', 'evd.targetClosed');
    return this.store(
      actor,
      { kind: 'CLAIM', id: claim.id },
      claim.brandId,
      this.claimWindowOf(claim),
      upload,
      data,
    );
  }

  // -----------------------------------------------------------------------------------
  // Phiếu nạp (FR-INV-38)
  // -----------------------------------------------------------------------------------

  async refillWindow(sessionId: string): Promise<EvidenceWindow> {
    const session = await this.requireRefill(sessionId);
    return this.windowDto(session, this.refillWindowOf(session));
  }

  async listRefillEvidence(actor: AuthenticatedUser, scope: BrandScope, sessionId: string) {
    const session = await this.requireRefill(sessionId);
    this.assertCanViewRefill(actor, scope, session.brandId);
    return this.listFor(actor, { kind: 'REFILL', id: session.id }, session.brandId);
  }

  async addRefillEvidence(
    actor: AuthenticatedUser,
    sessionId: string,
    upload: EvidenceUpload,
    data: Buffer,
  ): Promise<CameraEvidence> {
    const session = await this.requireRefill(sessionId);
    if (session.performedBy === actor.userId) {
      throw new AppError('EVIDENCE_SELF_REVIEW', 'evd.selfReview');
    }
    return this.store(
      actor,
      { kind: 'REFILL', id: session.id },
      session.brandId,
      this.refillWindowOf(session),
      upload,
      data,
    );
  }

  // -----------------------------------------------------------------------------------
  // Gỡ bằng chứng tải nhầm (ADR-0032 mục 8)
  // -----------------------------------------------------------------------------------

  async remove(
    actor: AuthenticatedUser,
    evidenceId: string,
    reason: string,
  ): Promise<CameraEvidence> {
    const at = this.clock.now();
    const record = await this.queries.transaction(async (tx) => {
      const evidence = await this.queries.findEvidence(evidenceId, tx);
      if (!evidence) throw new AppError('NOT_FOUND', 'evd.evidenceNotFound');
      const target = targetOf(evidence);
      await this.queries.lockTarget(target, tx);
      if (evidence.uploadedBy !== actor.userId) {
        throw new AppError('FORBIDDEN_SCOPE', 'evd.notUploader');
      }
      if (evidence.removedAt || !evidence.storageKey) {
        throw new AppError('EVIDENCE_TARGET_CLOSED', 'evd.targetClosed');
      }
      let owner: string;
      if (target.kind === 'CLAIM') {
        const claim = await this.queries.findClaimTarget(target.id, tx);
        if (!claim || claim.status !== 'OPEN') {
          throw new AppError('EVIDENCE_TARGET_CLOSED', 'evd.targetClosed');
        }
        owner = claim.brandId;
      } else {
        const session = await this.queries.findRefillTarget(target.id, tx);
        if (!session || (await this.queries.hasClosedFootageRequest(target.id, tx))) {
          throw new AppError('EVIDENCE_TARGET_CLOSED', 'evd.targetClosed');
        }
        owner = session.brandId;
      }
      await this.queries.markRemoved(evidenceId, { by: actor.userId, at, reason }, tx);
      await this.audit.log(
        {
          actorType: 'USER',
          actorId: actor.userId,
          brandId: owner,
          action: 'evd.evidence.removed',
          targetType: 'CameraEvidence',
          targetId: evidenceId,
          severity: 'WARNING',
          before: { storageKey: evidence.storageKey, sha256: evidence.sha256 },
          after: { removedReason: reason },
        },
        tx,
      );
      return evidence;
    });
    // Xóa tệp sau khi commit: lỗi kho không làm mất dấu vết đã gỡ trong CSDL.
    await this.storage
      .delete(record.storageKey!)
      .catch((e: unknown) =>
        this.logger.warn(`Không xóa được tệp bằng chứng ${evidenceId}: ${String(e)}`),
      );
    const updated = await this.queries.findEvidence(evidenceId);
    return this.toDto(updated!, null);
  }

  // -----------------------------------------------------------------------------------
  // Khách xem bằng chứng (FR-ORD-39)
  // -----------------------------------------------------------------------------------

  async publicClaimEvidence(
    rawCode: string,
    key: string,
    origin: RequestOrigin,
  ): Promise<{ items: PublicCameraEvidence[] }> {
    if (!this.publicLimiter.tryAcquire(origin.ip ?? 'unknown')) {
      throw new AppError('RATE_LIMITED', 'ord.claimLookupRateLimited');
    }
    const secret = this.config.refundClaimTokenSecret;
    const code = normalizeClaimCode(rawCode);
    const claim = code ? await this.queries.findClaimIdByCode(code) : null;
    // Sai mã, sai khóa, phiếu chưa bị từ chối: cùng một câu trả lời.
    if (
      !claim ||
      !secret ||
      claim.status !== 'REJECTED' ||
      !isValidClaimViewKey(secret, claim.id, key)
    ) {
      throw new AppError('NOT_FOUND', 'ord.claimNotFound');
    }
    const now = this.clock.now();
    const ttl = this.config.constraint('CAMERA_EVIDENCE_URL_TTL_SEC');
    const items = (await this.queries.listEvidence({ kind: 'CLAIM', id: claim.id }))
      .filter((e) => e.storageKey !== null)
      .map((e) => {
        const signed = signFileUrl(this.urlKey, e.id, now, ttl);
        return {
          id: e.id,
          kind: e.kind,
          contentType: e.contentType,
          recordedFrom: e.recordedFrom.toISOString(),
          recordedTo: e.recordedTo.toISOString(),
          url: signed.url,
          urlExpiresAt: signed.expiresAt.toISOString(),
        };
      });
    await this.audit.log({
      actorType: 'ANONYMOUS',
      brandId: claim.brandId,
      action: 'evd.evidence.viewed',
      targetType: 'RefundClaim',
      targetId: claim.id,
      sourceIp: origin.ip,
      userAgent: origin.userAgent,
      metadata: { evidenceIds: items.map((i) => i.id), viewer: 'CUSTOMER' },
    });
    return { items };
  }

  /** Phục vụ tệp qua đường dẫn ký. Sai chữ ký, hết hạn, tệp đã gỡ/xóa: NOT_FOUND như nhau. */
  async openFile(
    evidenceId: string,
    exp: number,
    sig: string,
    rangeHeader: string | undefined,
  ): Promise<
    | {
        status: 200 | 206;
        body: Buffer;
        contentType: string;
        size: number;
        range?: { start: number; end: number };
      }
    | { status: 416; size: number }
  > {
    if (!verifyFileUrl(this.urlKey, evidenceId, exp, sig, this.clock.now())) {
      throw new AppError('NOT_FOUND', 'evd.evidenceNotFound');
    }
    const evidence = await this.queries.findEvidence(evidenceId);
    if (!evidence?.storageKey) throw new AppError('NOT_FOUND', 'evd.evidenceNotFound');
    const body = await this.storage.get(evidence.storageKey);
    if (!body) throw new AppError('NOT_FOUND', 'evd.evidenceNotFound');
    const range = parseRange(rangeHeader, body.length);
    if (range === 'unsatisfiable') return { status: 416, size: body.length };
    if (!range) return { status: 200, body, contentType: evidence.contentType, size: body.length };
    return {
      status: 206,
      body: body.subarray(range.start, range.end + 1),
      contentType: evidence.contentType,
      size: body.length,
      range,
    };
  }

  // -----------------------------------------------------------------------------------
  // Yêu cầu trích hình phiếu nạp (FR-INV-39)
  // -----------------------------------------------------------------------------------

  async createFootageRequest(
    actor: AuthenticatedUser,
    scope: BrandScope,
    sessionId: string,
    reason: string,
  ): Promise<FootageRequest> {
    if (scope.kind !== 'BRAND') throw new AppError('FORBIDDEN_SCOPE', 'evd.brandAccountOnly');
    const session = await this.requireRefill(sessionId);
    if (session.brandId !== scope.brandId) {
      throw new AppError('FORBIDDEN_SCOPE', 'common.outOfScope');
    }
    const now = this.clock.now();
    const maxDays = this.config.constraint('CAMERA_FOOTAGE_REQUEST_MAX_DAYS');
    if (now.getTime() - session.startedAt.getTime() > maxDays * DAY_MS) {
      throw new AppError('FOOTAGE_REQUEST_EXPIRED', 'evd.footageRequestExpired', { days: maxDays });
    }
    const id = await this.queries.transaction(async (tx) => {
      const created = await this.queries.insertFootageRequest(
        {
          refillSessionId: session.id,
          brandId: session.brandId,
          reason,
          requestedBy: actor.userId,
          at: now,
        },
        tx,
      );
      if (!created) {
        throw new AppError('FOOTAGE_REQUEST_ALREADY_OPEN', 'evd.footageRequestAlreadyOpen');
      }
      await this.audit.log(
        {
          actorType: 'USER',
          actorId: actor.userId,
          brandId: session.brandId,
          action: 'evd.footage_request.created',
          targetType: 'FootageRequest',
          targetId: created,
          metadata: { refillSessionId: session.id },
        },
        tx,
      );
      const params = {
        brand: session.brandName,
        slot: session.slotNumber,
        machine: session.machineName,
        startedAt: formatVnDateTime(session.startedAt),
        reason,
      };
      await this.alr.notifyPermissionHolders(
        tx,
        {
          brandId: session.brandId,
          type: 'FOOTAGE_REQUESTED',
          subject: translate(DEFAULT_LOCALE, 'evd.footageRequestedSubject', params),
          content: translate(DEFAULT_LOCALE, 'evd.footageRequestedContent', params),
          referenceId: created,
          at: now,
        },
        MACHINE_OPERATE,
      );
      return created;
    });
    return this.footageDto((await this.queries.findFootageRequest(id))!);
  }

  async listFootageRequests(
    actor: AuthenticatedUser,
    scope: BrandScope,
    filter: {
      page: number;
      pageSize: number;
      status?: FootageRequestStatus | undefined;
      refillSessionId?: string | undefined;
    },
  ): Promise<{ items: FootageRequest[]; total: number }> {
    if (scope.kind !== 'BRAND' && !actor.permissions.has(MACHINE_OPERATE)) {
      throw new AppError('FORBIDDEN_SCOPE', 'auth.missingPermission');
    }
    const { items, total } = await this.queries.listFootageRequests({
      ...filter,
      brandId: scope.kind === 'BRAND' ? scope.brandId : undefined,
    });
    return { items: items.map((r) => this.footageDto(r)), total };
  }

  async resolveFootageRequest(
    actor: AuthenticatedUser,
    id: string,
    input: { outcome: 'FULFILLED' | 'UNAVAILABLE'; note?: string | undefined },
  ): Promise<FootageRequest> {
    const note = input.note?.trim() || null;
    if (input.outcome === 'UNAVAILABLE' && !note) {
      throw invalidField('note', 'evd.footageNoteRequired');
    }
    const at = this.clock.now();
    await this.queries.transaction(async (tx) => {
      await this.queries.lockFootageRequest(id, tx);
      const request = await this.queries.findFootageRequest(id, tx);
      if (!request) throw new AppError('NOT_FOUND', 'evd.footageRequestNotFound');
      if (request.status !== 'OPEN') {
        throw new AppError('EVIDENCE_TARGET_CLOSED', 'evd.footageRequestClosed');
      }
      if (
        input.outcome === 'FULFILLED' &&
        (await this.queries.countActiveEvidence(
          { kind: 'REFILL', id: request.refillSessionId },
          tx,
        )) === 0
      ) {
        throw new AppError('EVIDENCE_REQUIRED', 'evd.footageNeedsEvidence');
      }
      await this.queries.resolveFootageRequest(
        id,
        { status: input.outcome, note, by: actor.userId, at },
        tx,
      );
      await this.audit.log(
        {
          actorType: 'USER',
          actorId: actor.userId,
          brandId: request.brandId,
          action: 'evd.footage_request.resolved',
          targetType: 'FootageRequest',
          targetId: id,
          before: { status: 'OPEN' },
          after: { status: input.outcome, note },
        },
        tx,
      );
      const params = {
        slot: request.slotNumber,
        machine: request.machineName,
        note: note ?? '',
      };
      const fulfilled = input.outcome === 'FULFILLED';
      await this.alr.notifyUsers(
        tx,
        {
          brandId: request.brandId,
          type: fulfilled ? 'FOOTAGE_FULFILLED' : 'FOOTAGE_UNAVAILABLE',
          subject: translate(
            DEFAULT_LOCALE,
            fulfilled ? 'evd.footageFulfilledSubject' : 'evd.footageUnavailableSubject',
            params,
          ),
          content: translate(
            DEFAULT_LOCALE,
            fulfilled ? 'evd.footageFulfilledContent' : 'evd.footageUnavailableContent',
            params,
          ),
          referenceId: request.refillSessionId,
          at,
        },
        [request.requestedBy],
      );
    });
    return this.footageDto((await this.queries.findFootageRequest(id))!);
  }

  // -----------------------------------------------------------------------------------
  // Job xóa theo hạn (ADR-0032 mục 9)
  // -----------------------------------------------------------------------------------

  async runMaintenance(): Promise<{ purged: number }> {
    const now = this.clock.now();
    const claimClosedBefore = new Date(
      now.getTime() - this.config.constraint('REFUND_CLAIM_CONTACT_RETENTION_DAYS') * DAY_MS,
    );
    const refillUploadedBefore = new Date(
      now.getTime() - this.config.constraint('CAMERA_REFILL_EVIDENCE_RETENTION_DAYS') * DAY_MS,
    );
    let purged = 0;
    for (const item of await this.queries.listPurgeable(
      claimClosedBefore,
      refillUploadedBefore,
      JOB_BATCH,
    )) {
      try {
        await this.storage.delete(item.storageKey);
        await this.queries.markPurged(item.id, now);
        purged += 1;
      } catch (e: unknown) {
        // Để lần quét sau thử lại — dòng còn storage_key nên vẫn nằm trong danh sách.
        this.logger.warn(`Không xóa được tệp bằng chứng ${item.id}: ${String(e)}`);
      }
    }
    return { purged };
  }

  // -----------------------------------------------------------------------------------
  // Nội bộ
  // -----------------------------------------------------------------------------------

  private claimWindowOf(claim: { windowStart: Date; windowEnd: Date }): TimeWindow {
    return padWindow(
      claim.windowStart,
      claim.windowEnd,
      this.config.constraint('CAMERA_WINDOW_PADDING_SEC'),
    );
  }

  private refillWindowOf(session: { startedAt: Date; completedAt: Date | null }): TimeWindow {
    // Phiếu còn mở: tới hiện tại — đang nạp thì hình cũng đang được ghi.
    const end = session.completedAt ?? this.clock.now();
    return padWindow(session.startedAt, end, this.config.constraint('CAMERA_WINDOW_PADDING_SEC'));
  }

  private windowDto(machine: MachineInfo, window: TimeWindow): EvidenceWindow {
    return {
      machineId: machine.machineId,
      machineName: machine.machineName,
      cameraLabel: machine.cameraLabel,
      from: window.from.toISOString(),
      to: window.to.toISOString(),
    };
  }

  private async requireClaim(id: string) {
    const claim = await this.queries.findClaimTarget(id);
    if (!claim) throw new AppError('NOT_FOUND', 'ord.claimNotFound');
    return claim;
  }

  private async requireRefill(id: string) {
    const session = await this.queries.findRefillTarget(id);
    if (!session) throw new AppError('NOT_FOUND', 'evd.refillNotFound');
    return session;
  }

  /** Brand Admin: chỉ phiếu của thương hiệu mình. Nhân sự nền tảng: cần machine.operate. */
  private assertCanViewRefill(actor: AuthenticatedUser, scope: BrandScope, brandId: string): void {
    if (scope.kind === 'BRAND') {
      if (scope.brandId !== brandId) throw new AppError('FORBIDDEN_SCOPE', 'common.outOfScope');
      return;
    }
    if (!actor.permissions.has(MACHINE_OPERATE)) {
      throw new AppError('FORBIDDEN_SCOPE', 'auth.missingPermission');
    }
  }

  private async listFor(actor: AuthenticatedUser, target: EvidenceTarget, brandId: string) {
    const now = this.clock.now();
    const records = await this.queries.listEvidence(target);
    const items = records.map((r) => this.toDto(r, now));
    const shown = records.filter((r) => r.storageKey !== null).map((r) => r.id);
    if (shown.length > 0) {
      await this.audit.log({
        actorType: 'USER',
        actorId: actor.userId,
        brandId,
        action: 'evd.evidence.viewed',
        targetType: target.kind === 'CLAIM' ? 'RefundClaim' : 'RefillSession',
        targetId: target.id,
        metadata: { evidenceIds: shown },
      });
    }
    return { items, maxItems: this.config.constraint('CAMERA_EVIDENCE_MAX_PER_TARGET') };
  }

  private async store(
    actor: AuthenticatedUser,
    target: EvidenceTarget,
    brandId: string,
    window: TimeWindow,
    upload: EvidenceUpload,
    data: Buffer,
  ): Promise<CameraEvidence> {
    if (upload.recordedTo.getTime() <= upload.recordedFrom.getTime()) {
      throw invalidField('recordedTo', 'evd.recordedRangeInvalid');
    }
    const real = toRealTime(
      { from: upload.recordedFrom, to: upload.recordedTo },
      upload.clockOffsetSec,
    );
    if (!overlaps(real, window)) throw invalidField('recordedFrom', 'evd.recordedOutsideWindow');

    const file = await this.prepareFile(data);
    const id = randomUUID();
    const key = `evidence/${target.kind.toLowerCase()}/${target.id}/${id}.${file.extension}`;
    const max = this.config.constraint('CAMERA_EVIDENCE_MAX_PER_TARGET');
    const now = this.clock.now();

    try {
      await this.queries.transaction(async (tx) => {
        await this.queries.lockTarget(target, tx);
        if ((await this.queries.countEvidence(target, tx)) >= max) {
          throw new AppError('EVIDENCE_LIMIT_REACHED', 'evd.evidenceLimitReached', { max });
        }
        // Ghi tệp trong transaction: lỗi kho thì không có dòng trỏ tới tệp không tồn tại.
        await this.storage.put(key, file.body, file.contentType);
        await this.queries.insertEvidence(
          {
            id,
            target,
            kind: file.kind,
            storageKey: key,
            contentType: file.contentType,
            sizeBytes: file.body.length,
            sha256: file.sha256,
            cameraLabel: upload.cameraLabel,
            recordedFrom: real.from,
            recordedTo: real.to,
            clockOffsetSec: upload.clockOffsetSec,
            note: upload.note?.trim() || null,
            uploadedBy: actor.userId,
            uploadedAt: now,
          },
          tx,
        );
        await this.audit.log(
          {
            actorType: 'USER',
            actorId: actor.userId,
            brandId,
            action: 'evd.evidence.uploaded',
            targetType: target.kind === 'CLAIM' ? 'RefundClaim' : 'RefillSession',
            targetId: target.id,
            metadata: {
              evidenceId: id,
              kind: file.kind,
              sha256: file.sha256,
              sizeBytes: file.body.length,
              recordedFrom: real.from.toISOString(),
              recordedTo: real.to.toISOString(),
              clockOffsetSec: upload.clockOffsetSec,
            },
          },
          tx,
        );
      });
    } catch (err) {
      // Transaction hỏng sau khi đã ghi tệp: dọn tệp mồ côi.
      await this.storage.delete(key).catch(() => undefined);
      throw err;
    }
    return this.toDto((await this.queries.findEvidence(id))!, now);
  }

  /** MP4 lưu nguyên trạng; ảnh mã hóa lại sang WebP và bỏ EXIF (normalizeImage). */
  private async prepareFile(data: Buffer): Promise<{
    kind: 'VIDEO' | 'IMAGE';
    body: Buffer;
    contentType: string;
    extension: string;
    sha256: string;
  }> {
    if (isMp4(data)) {
      return {
        kind: 'VIDEO',
        body: data,
        contentType: 'video/mp4',
        extension: 'mp4',
        sha256: sha256(data),
      };
    }
    if (detectImageKind(data)) {
      const maxBytes = this.config.constraint('CAMERA_IMAGE_MAX_BYTES');
      if (data.length > maxBytes) {
        throw new AppError('FILE_TOO_LARGE', 'evd.fileTooLarge', {
          maxMb: Math.floor(maxBytes / (1024 * 1024)),
        });
      }
      const image = await normalizeImage(
        data,
        this.config.constraint('CAMERA_IMAGE_MAX_EDGE_PX'),
        'evd.fileUnsupported',
      );
      return {
        kind: 'IMAGE',
        body: image.body,
        contentType: 'image/webp',
        extension: 'webp',
        sha256: sha256(image.body),
      };
    }
    throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'evd.fileUnsupported');
  }

  private toDto(record: EvidenceRecord, now: Date | null): CameraEvidence {
    const signed =
      record.storageKey && now
        ? signFileUrl(
            this.urlKey,
            record.id,
            now,
            this.config.constraint('CAMERA_EVIDENCE_URL_TTL_SEC'),
          )
        : null;
    return {
      id: record.id,
      kind: record.kind,
      contentType: record.contentType,
      sizeBytes: record.sizeBytes,
      sha256: record.sha256,
      cameraLabel: record.cameraLabel,
      recordedFrom: record.recordedFrom.toISOString(),
      recordedTo: record.recordedTo.toISOString(),
      clockOffsetSec: record.clockOffsetSec,
      note: record.note,
      uploadedBy: record.uploadedBy,
      uploadedAt: record.uploadedAt.toISOString(),
      removedAt: record.removedAt?.toISOString() ?? null,
      removedReason: record.removedReason,
      purgedAt: record.purgedAt?.toISOString() ?? null,
      url: signed?.url ?? null,
      urlExpiresAt: signed?.expiresAt.toISOString() ?? null,
    };
  }

  private footageDto(r: FootageRequestRecord): FootageRequest {
    return {
      id: r.id,
      refillSessionId: r.refillSessionId,
      brandId: r.brandId,
      brandName: r.brandName,
      machineName: r.machineName,
      slotNumber: r.slotNumber,
      sessionStartedAt: r.sessionStartedAt.toISOString(),
      status: r.status,
      reason: r.reason,
      requestedBy: r.requestedBy,
      responseNote: r.responseNote,
      resolvedBy: r.resolvedBy,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
    };
  }
}

function targetOf(evidence: EvidenceRecord): EvidenceTarget {
  return evidence.refundClaimId
    ? { kind: 'CLAIM', id: evidence.refundClaimId }
    : { kind: 'REFILL', id: evidence.refillSessionId! };
}

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}
