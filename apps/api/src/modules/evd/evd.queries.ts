/**
 * Truy vấn bằng chứng camera (ADR-0032). EVD sở hữu `camera_evidence` và `footage_requests`; các bảng
 * khác (refund_claims, orders, dispense_commands, refill_sessions, machines…) chỉ được ĐỌC ở đây
 * (spec/PROJECT.md §3 — đọc chéo trong *.queries.ts được phép).
 */

import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Transaction } from 'kysely';
import { DATABASE, type Database, type DB } from '../../shared/db/index.js';
import type {
  EvidenceKind,
  FootageRequestStatus,
  RefillStatus,
  RefundClaimStatus,
} from '../../shared/db/types.generated.js';

type Executor = Kysely<DB>;

export type EvidenceTarget =
  | { readonly kind: 'CLAIM'; readonly id: string }
  | { readonly kind: 'REFILL'; readonly id: string };

export interface MachineInfo {
  readonly machineId: string;
  readonly machineName: string;
  readonly cameraLabel: string | null;
}

export interface ClaimTarget extends MachineInfo {
  readonly id: string;
  readonly brandId: string;
  readonly status: RefundClaimStatus;
  readonly assignedTo: string | null;
  readonly refundOrder: boolean;
  /** Đầu khung giờ: lúc đơn trả tiền (đơn chưa trả thì lúc tạo đơn). */
  readonly windowStart: Date;
  /** Cuối khung giờ: mốc muộn nhất giữa kết quả lệnh xịt và lần cập nhật đơn cuối. */
  readonly windowEnd: Date;
}

export interface RefillTarget extends MachineInfo {
  readonly id: string;
  readonly brandId: string;
  readonly brandName: string;
  readonly status: RefillStatus;
  readonly performedBy: string;
  readonly slotNumber: number;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
}

export interface EvidenceRecord {
  readonly id: string;
  readonly refundClaimId: string | null;
  readonly refillSessionId: string | null;
  readonly kind: EvidenceKind;
  readonly storageKey: string | null;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly cameraLabel: string;
  readonly recordedFrom: Date;
  readonly recordedTo: Date;
  readonly clockOffsetSec: number;
  readonly note: string | null;
  readonly uploadedBy: string;
  readonly uploadedAt: Date;
  readonly removedAt: Date | null;
  readonly removedReason: string | null;
  readonly purgedAt: Date | null;
}

export interface NewEvidence {
  readonly id: string;
  readonly target: EvidenceTarget;
  readonly kind: EvidenceKind;
  readonly storageKey: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly cameraLabel: string;
  readonly recordedFrom: Date;
  readonly recordedTo: Date;
  readonly clockOffsetSec: number;
  readonly note: string | null;
  readonly uploadedBy: string;
  readonly uploadedAt: Date;
}

export interface FootageRequestRecord {
  readonly id: string;
  readonly refillSessionId: string;
  readonly brandId: string;
  readonly brandName: string;
  readonly machineName: string;
  readonly slotNumber: number;
  readonly sessionStartedAt: Date;
  readonly status: FootageRequestStatus;
  readonly reason: string;
  readonly requestedBy: string;
  readonly responseNote: string | null;
  readonly resolvedBy: string | null;
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;
}

@Injectable()
export class EvdQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  transaction<T>(work: (tx: Transaction<DB>) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(work);
  }

  /**
   * Khóa theo hồ sơ trong `tx` — hai người tải cùng lúc không vượt CAMERA_EVIDENCE_MAX_PER_TARGET.
   * Dùng advisory lock thay vì SELECT … FOR UPDATE trên bảng của module khác.
   */
  async lockTarget(target: EvidenceTarget, tx: Executor): Promise<void> {
    await sql`SELECT pg_advisory_xact_lock(hashtext(${`evd:${target.kind}:${target.id}`}))`.execute(
      tx,
    );
  }

  // -----------------------------------------------------------------------------------
  // Hồ sơ đích (đọc chéo)
  // -----------------------------------------------------------------------------------

  async findClaimTarget(
    claimId: string,
    executor: Executor = this.db,
  ): Promise<ClaimTarget | null> {
    const row = await executor
      .selectFrom('refund_claims as rc')
      .innerJoin('orders as o', 'o.id', 'rc.order_id')
      .innerJoin('machines as m', 'm.id', 'o.machine_id')
      .select([
        'rc.id',
        'rc.brand_id',
        'rc.status',
        'rc.assigned_to',
        'rc.refund_order',
        'm.id as machine_id',
        'm.display_name',
        'm.camera_label',
        'o.paid_at',
        'o.created_at as order_created_at',
        'o.updated_at as order_updated_at',
      ])
      .select((eb) =>
        eb
          .selectFrom('dispense_commands as dc')
          .whereRef('dc.order_id', '=', 'o.id')
          .select((e) => e.fn.max('dc.completed_at').as('last'))
          .as('command_completed_at'),
      )
      .where('rc.id', '=', claimId)
      .executeTakeFirst();
    if (!row) return null;
    const start = row.paid_at ?? row.order_created_at;
    const commandEnd = row.command_completed_at ? new Date(row.command_completed_at) : null;
    const end =
      commandEnd && commandEnd.getTime() > row.order_updated_at.getTime()
        ? commandEnd
        : row.order_updated_at;
    return {
      id: row.id,
      brandId: row.brand_id,
      status: row.status,
      assignedTo: row.assigned_to,
      refundOrder: row.refund_order,
      machineId: row.machine_id,
      machineName: row.display_name,
      cameraLabel: row.camera_label,
      windowStart: start,
      windowEnd: end.getTime() > start.getTime() ? end : start,
    };
  }

  /** Phiếu theo mã khiếu nại đã chuẩn hóa — cho khách xem bằng chứng (FR-ORD-39). */
  async findClaimIdByCode(
    publicCode: string,
  ): Promise<{ id: string; status: RefundClaimStatus; brandId: string } | null> {
    const row = await this.db
      .selectFrom('refund_claims')
      .select(['id', 'status', 'brand_id'])
      .where('public_code', '=', publicCode)
      .executeTakeFirst();
    return row ? { id: row.id, status: row.status, brandId: row.brand_id } : null;
  }

  async findRefillTarget(
    sessionId: string,
    executor: Executor = this.db,
  ): Promise<RefillTarget | null> {
    const row = await executor
      .selectFrom('refill_sessions as rs')
      .innerJoin('machines as m', 'm.id', 'rs.machine_id')
      .innerJoin('machine_slots as ms', 'ms.id', 'rs.slot_id')
      .innerJoin('brands as b', 'b.id', 'rs.brand_id')
      .select([
        'rs.id',
        'rs.brand_id',
        'b.name as brand_name',
        'rs.status',
        'rs.performed_by',
        'ms.slot_number',
        'rs.started_at',
        'rs.completed_at',
        'm.id as machine_id',
        'm.display_name',
        'm.camera_label',
      ])
      .where('rs.id', '=', sessionId)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: row.id,
      brandId: row.brand_id,
      brandName: row.brand_name,
      status: row.status,
      performedBy: row.performed_by,
      slotNumber: row.slot_number,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      machineId: row.machine_id,
      machineName: row.display_name,
      cameraLabel: row.camera_label,
    };
  }

  // -----------------------------------------------------------------------------------
  // camera_evidence
  // -----------------------------------------------------------------------------------

  /** Mọi dòng của hồ sơ, kể cả đã gỡ — giới hạn CAMERA_EVIDENCE_MAX_PER_TARGET đếm cả chúng. */
  async countEvidence(target: EvidenceTarget, executor: Executor = this.db): Promise<number> {
    const row = await executor
      .selectFrom('camera_evidence')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where(targetColumn(target), '=', target.id)
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }

  /** Bằng chứng còn hiệu lực (chưa gỡ) — điều kiện từ chối phiếu và đóng yêu cầu trích hình. */
  async countActiveEvidence(target: EvidenceTarget, executor: Executor = this.db): Promise<number> {
    const row = await executor
      .selectFrom('camera_evidence')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where(targetColumn(target), '=', target.id)
      .where('removed_by', 'is', null)
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }

  async insertEvidence(evidence: NewEvidence, tx: Executor): Promise<void> {
    await tx
      .insertInto('camera_evidence')
      .values({
        id: evidence.id,
        refund_claim_id: evidence.target.kind === 'CLAIM' ? evidence.target.id : null,
        refill_session_id: evidence.target.kind === 'REFILL' ? evidence.target.id : null,
        kind: evidence.kind,
        storage_key: evidence.storageKey,
        content_type: evidence.contentType,
        size_bytes: evidence.sizeBytes,
        sha256: evidence.sha256,
        camera_label: evidence.cameraLabel,
        recorded_from: evidence.recordedFrom,
        recorded_to: evidence.recordedTo,
        clock_offset_sec: evidence.clockOffsetSec,
        note: evidence.note,
        uploaded_by: evidence.uploadedBy,
        uploaded_at: evidence.uploadedAt,
      })
      .execute();
  }

  async listEvidence(target: EvidenceTarget): Promise<EvidenceRecord[]> {
    const rows = await this.db
      .selectFrom('camera_evidence')
      .selectAll()
      .where(targetColumn(target), '=', target.id)
      .orderBy('uploaded_at')
      .orderBy('id')
      .execute();
    return rows.map(toEvidence);
  }

  async findEvidence(id: string, executor: Executor = this.db): Promise<EvidenceRecord | null> {
    const row = await executor
      .selectFrom('camera_evidence')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toEvidence(row) : null;
  }

  async markRemoved(
    id: string,
    change: { by: string; at: Date; reason: string },
    tx: Executor,
  ): Promise<void> {
    await tx
      .updateTable('camera_evidence')
      .set({
        storage_key: null,
        removed_by: change.by,
        removed_at: change.at,
        removed_reason: change.reason,
      })
      .where('id', '=', id)
      .where('removed_by', 'is', null)
      .execute();
  }

  /**
   * Tệp tới hạn xóa (ADR-0032 mục 9): bằng chứng phiếu khiếu nại đã đóng quá `claimClosedBefore`,
   * bằng chứng phiếu nạp tải lên trước `refillUploadedBefore`. Quét theo mốc — chạy bù được sau downtime.
   */
  async listPurgeable(
    claimClosedBefore: Date,
    refillUploadedBefore: Date,
    limit: number,
  ): Promise<{ id: string; storageKey: string }[]> {
    const rows = await this.db
      .selectFrom('camera_evidence as ce')
      .leftJoin('refund_claims as rc', 'rc.id', 'ce.refund_claim_id')
      .select(['ce.id', 'ce.storage_key'])
      .where('ce.storage_key', 'is not', null)
      .where((eb) =>
        eb.or([
          eb.and([
            eb('ce.refund_claim_id', 'is not', null),
            eb('rc.status', '<>', 'OPEN'),
            eb('rc.closed_at', '<=', claimClosedBefore),
          ]),
          eb.and([
            eb('ce.refill_session_id', 'is not', null),
            eb('ce.uploaded_at', '<=', refillUploadedBefore),
          ]),
        ]),
      )
      .orderBy('ce.uploaded_at')
      .limit(limit)
      .execute();
    return rows.map((r) => ({ id: r.id, storageKey: r.storage_key! }));
  }

  async markPurged(id: string, at: Date): Promise<void> {
    await this.db
      .updateTable('camera_evidence')
      .set({ storage_key: null, purged_at: at })
      .where('id', '=', id)
      .where('storage_key', 'is not', null)
      .execute();
  }

  // -----------------------------------------------------------------------------------
  // footage_requests
  // -----------------------------------------------------------------------------------

  /** @returns null nếu phiếu nạp đã có yêu cầu đang mở (uq_footage_request_open). */
  async insertFootageRequest(
    request: {
      refillSessionId: string;
      brandId: string;
      reason: string;
      requestedBy: string;
      at: Date;
    },
    tx: Executor,
  ): Promise<string | null> {
    const row = await tx
      .insertInto('footage_requests')
      .values({
        refill_session_id: request.refillSessionId,
        brand_id: request.brandId,
        reason: request.reason,
        requested_by: request.requestedBy,
        created_at: request.at,
      })
      .onConflict((oc) => oc.column('refill_session_id').where('status', '=', 'OPEN').doNothing())
      .returning('id')
      .executeTakeFirst();
    return row?.id ?? null;
  }

  async findFootageRequest(
    id: string,
    executor: Executor = this.db,
  ): Promise<FootageRequestRecord | null> {
    const row = await this.footageBase(executor).where('fr.id', '=', id).executeTakeFirst();
    return row ? toFootageRequest(row) : null;
  }

  async listFootageRequests(filter: {
    page: number;
    pageSize: number;
    brandId?: string | undefined;
    status?: FootageRequestStatus | undefined;
    refillSessionId?: string | undefined;
  }): Promise<{ items: FootageRequestRecord[]; total: number }> {
    let base = this.db.selectFrom('footage_requests as fr');
    if (filter.brandId) base = base.where('fr.brand_id', '=', filter.brandId);
    if (filter.status) base = base.where('fr.status', '=', filter.status);
    if (filter.refillSessionId) {
      base = base.where('fr.refill_session_id', '=', filter.refillSessionId);
    }
    const ids = base.select('fr.id');
    const [rows, count] = await Promise.all([
      this.footageBase(this.db)
        .where('fr.id', 'in', ids)
        .orderBy('fr.created_at', 'asc')
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize)
        .execute(),
      base.select((eb) => eb.fn.countAll<string>().as('total')).executeTakeFirstOrThrow(),
    ]);
    return { items: rows.map(toFootageRequest), total: Number(count.total) };
  }

  /** Phiếu nạp đã có yêu cầu trích hình nào đóng chưa — từ đó bằng chứng của phiếu không gỡ được. */
  async hasClosedFootageRequest(sessionId: string, executor: Executor = this.db): Promise<boolean> {
    const row = await executor
      .selectFrom('footage_requests')
      .select('id')
      .where('refill_session_id', '=', sessionId)
      .where('status', '<>', 'OPEN')
      .executeTakeFirst();
    return row !== undefined;
  }

  async lockFootageRequest(id: string, tx: Executor): Promise<void> {
    await tx.selectFrom('footage_requests').select('id').where('id', '=', id).forUpdate().execute();
  }

  async resolveFootageRequest(
    id: string,
    change: {
      status: Exclude<FootageRequestStatus, 'OPEN'>;
      note: string | null;
      by: string;
      at: Date;
    },
    tx: Executor,
  ): Promise<void> {
    await tx
      .updateTable('footage_requests')
      .set({
        status: change.status,
        response_note: change.note,
        resolved_by: change.by,
        resolved_at: change.at,
      })
      .where('id', '=', id)
      .where('status', '=', 'OPEN')
      .execute();
  }

  private footageBase(executor: Executor) {
    return executor
      .selectFrom('footage_requests as fr')
      .innerJoin('refill_sessions as rs', 'rs.id', 'fr.refill_session_id')
      .innerJoin('machines as m', 'm.id', 'rs.machine_id')
      .innerJoin('machine_slots as ms', 'ms.id', 'rs.slot_id')
      .innerJoin('brands as b', 'b.id', 'fr.brand_id')
      .select([
        'fr.id',
        'fr.refill_session_id',
        'fr.brand_id',
        'b.name as brand_name',
        'm.display_name as machine_name',
        'ms.slot_number',
        'rs.started_at',
        'fr.status',
        'fr.reason',
        'fr.requested_by',
        'fr.response_note',
        'fr.resolved_by',
        'fr.created_at',
        'fr.resolved_at',
      ]);
  }
}

function targetColumn(target: EvidenceTarget) {
  return target.kind === 'CLAIM' ? ('refund_claim_id' as const) : ('refill_session_id' as const);
}

function toEvidence(row: {
  id: string;
  refund_claim_id: string | null;
  refill_session_id: string | null;
  kind: EvidenceKind;
  storage_key: string | null;
  content_type: string;
  size_bytes: number;
  sha256: string;
  camera_label: string;
  recorded_from: Date;
  recorded_to: Date;
  clock_offset_sec: number;
  note: string | null;
  uploaded_by: string;
  uploaded_at: Date;
  removed_at: Date | null;
  removed_reason: string | null;
  purged_at: Date | null;
}): EvidenceRecord {
  return {
    id: row.id,
    refundClaimId: row.refund_claim_id,
    refillSessionId: row.refill_session_id,
    kind: row.kind,
    storageKey: row.storage_key,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    cameraLabel: row.camera_label,
    recordedFrom: row.recorded_from,
    recordedTo: row.recorded_to,
    clockOffsetSec: row.clock_offset_sec,
    note: row.note,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
    removedAt: row.removed_at,
    removedReason: row.removed_reason,
    purgedAt: row.purged_at,
  };
}

function toFootageRequest(row: {
  id: string;
  refill_session_id: string;
  brand_id: string;
  brand_name: string;
  machine_name: string;
  slot_number: number;
  started_at: Date;
  status: FootageRequestStatus;
  reason: string;
  requested_by: string;
  response_note: string | null;
  resolved_by: string | null;
  created_at: Date;
  resolved_at: Date | null;
}): FootageRequestRecord {
  return {
    id: row.id,
    refillSessionId: row.refill_session_id,
    brandId: row.brand_id,
    brandName: row.brand_name,
    machineName: row.machine_name,
    slotNumber: row.slot_number,
    sessionStartedAt: row.started_at,
    status: row.status,
    reason: row.reason,
    requestedBy: row.requested_by,
    responseNote: row.response_note,
    resolvedBy: row.resolved_by,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}
