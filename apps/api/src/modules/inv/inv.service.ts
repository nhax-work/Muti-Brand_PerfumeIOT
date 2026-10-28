/**
 * Nghiệp vụ tồn kho: khai báo gửi hàng (FR-INV-22 ÷ 28), giấy tờ chính hãng của lô (FR-INV-33 ÷ 35),
 * đăng ký chai (FR-INV-02), phiếu nạp (FR-INV-29 ÷ 32). Hợp đồng dữ liệu theo
 * spec/contracts/openapi.yaml và ADR-0017.
 *
 * Mỗi thao tác ghi chạy trong MỘT transaction, khóa bản ghi bị đổi trước khi kiểm điều kiện — hai
 * người bấm cùng lúc thì người sau thấy trạng thái người trước để lại, không đi qua cả hai.
 *
 *   mở phiếu nạp ─tx─▶ khóa máy + slot → máy rảnh? → hóa đơn đã thanh toán? → ghi phiếu
 *   đóng phiếu   ─tx─▶ khóa phiếu + chai → chai trong kho, đúng chủ, đúng sản phẩm, lô đã duyệt
 *                      → chai cũ rời slot → chai mới INSTALLED → phiếu COMPLETED
 *
 * Phiếu nạp mở thì cả máy dừng nhận đơn — chốt chặn nằm ở ORD/DSP (`openRefillSessionOn`), module
 * này chỉ ghi phiếu.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { DEFAULT_LOCALE, translate } from '@scentstation/i18n';
import type { Kysely } from 'kysely';
import { AuditService } from '../../shared/audit/index.js';
import { CLOCK, type Clock } from '../../shared/clock.js';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import type { DB } from '../../shared/db/index.js';
import type {
  BatchAuthenticityStatus,
  BottleStatus,
  RefillStatus,
  ShipmentDeclarationStatus,
} from '../../shared/db/types.generated.js';
import { AppError, invalidField, notFoundFor } from '../../shared/errors/index.js';
import type { BrandScope } from '../../shared/scoping/index.js';
import { AlrService } from '../alr/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import { SltService } from '../slt/index.js';
import {
  InvQueries,
  type BatchRecord,
  type BottleRecord,
  type RefillSessionRecord,
  type ShipmentRecord,
} from './inv.queries.js';

export type ShipmentDeclaration = Schema<'ShipmentDeclaration'>;
export type InventoryBatch = Schema<'InventoryBatch'>;
export type Bottle = Schema<'Bottle'>;
export type RefillSession = Schema<'RefillSession'>;

/** Bỏ trống `documentType` thì coi là hóa đơn mua hàng (openapi `AuthenticityDocumentSubmit`). */
const DEFAULT_DOCUMENT_TYPE = 'PURCHASE_INVOICE';

export interface DeclareShipmentInput {
  readonly fragranceProductId: string;
  readonly declaredQuantity: number;
  readonly declaredBottleVolumeMl: number;
  readonly expectedShipDate?: string | undefined;
}

export interface ReceiveShipmentInput {
  readonly receivedQuantity: number;
  readonly batchNumber: string;
  readonly expiresAt?: Date | undefined;
  readonly discrepancyNotes?: string | undefined;
}

export interface RegisterBottleInput {
  readonly batchId: string;
  readonly identifier: string;
  readonly initialVolumeMl: number;
  readonly emptyWeightG?: number | undefined;
  readonly expiresAt?: Date | undefined;
}

export interface OpenRefillInput {
  readonly slotId: string;
  readonly beforeWeightG?: number | undefined;
}

export interface CloseRefillInput {
  readonly newBottleId: string;
  readonly afterWeightG?: number | undefined;
  readonly notes?: string | undefined;
}

type Executor = Kysely<DB>;

@Injectable()
export class InvService {
  constructor(
    @Inject(InvQueries) private readonly queries: InvQueries,
    @Inject(SltService) private readonly slt: SltService,
    @Inject(AlrService) private readonly alr: AlrService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // -----------------------------------------------------------------------------------
  // Khai báo gửi hàng (FR-INV-22 ÷ 28)
  // -----------------------------------------------------------------------------------

  async listShipments(
    scope: BrandScope,
    filter: {
      readonly page: number;
      readonly pageSize: number;
      readonly status?: ShipmentDeclarationStatus | undefined;
    },
  ): Promise<{ items: ShipmentDeclaration[]; total: number }> {
    const { items, total } = await this.queries.listShipments(scope, filter);
    return { items: items.map(toShipmentDto), total };
  }

  /**
   * FR-INV-22, 23, 28: Brand Admin khai báo; sản phẩm phải thuộc thương hiệu mình (AC2). Thông báo
   * cho Inventory Staff trong cùng transaction — khai báo không lưu được thì không có thông báo.
   */
  async declareShipment(
    actor: AuthenticatedUser,
    scope: BrandScope,
    input: DeclareShipmentInput,
  ): Promise<ShipmentDeclaration> {
    if (scope.kind !== 'BRAND') throw new AppError('FORBIDDEN_SCOPE', 'inv.brandAccountOnly');

    const id = await this.queries.transaction(async (tx) => {
      // Sản phẩm không tồn tại và sản phẩm của thương hiệu khác trả cùng một mã — không lộ sự tồn tại.
      const productBrand = await this.queries.findProductBrand(input.fragranceProductId, tx);
      if (productBrand !== scope.brandId) {
        throw new AppError('PRODUCT_NOT_OWNED', 'inv.productNotOwned');
      }
      const now = this.clock.now();
      const shipmentId = await this.queries.insertShipment(
        {
          brandId: scope.brandId,
          fragranceProductId: input.fragranceProductId,
          declaredQuantity: input.declaredQuantity,
          declaredBottleVolumeMl: input.declaredBottleVolumeMl,
          expectedShipDate: input.expectedShipDate ?? null,
          declaredBy: actor.userId,
        },
        tx,
      );
      const shipment = (await this.queries.findShipment(shipmentId, tx))!;
      const params = { product: shipment.productName, quantity: shipment.declaredQuantity };
      await this.queries.insertInAppNotifications(
        {
          brandId: scope.brandId,
          recipients: await this.queries.findActiveInventoryStaff(tx),
          type: 'SHIPMENT_DECLARED',
          subject: translate(DEFAULT_LOCALE, 'inv.newShipmentSubject', params),
          content: translate(DEFAULT_LOCALE, 'inv.newShipmentContent', params),
          referenceId: shipmentId,
          at: now,
        },
        tx,
      );
      await this.audit.log(
        {
          actorType: 'USER',
          actorId: actor.userId,
          brandId: scope.brandId,
          action: 'inv.shipment.declared',
          targetType: 'ShipmentDeclaration',
          targetId: shipmentId,
          after: {
            fragranceProductId: input.fragranceProductId,
            declaredQuantity: input.declaredQuantity,
          },
        },
        tx,
      );
      return shipmentId;
    });
    return toShipmentDto((await this.queries.findShipment(id))!);
  }

  /**
   * FR-INV-24, 25, 26: tiếp nhận và đối chiếu. Cập nhật khai báo và tạo lô trong CÙNG transaction
   * (FR-INV-26 AC1); nhận 0 chai thì không tạo lô (FR-INV-25 AC3).
   */
  async receiveShipment(
    actor: AuthenticatedUser,
    shipmentId: string,
    input: ReceiveShipmentInput,
  ): Promise<{ declaration: ShipmentDeclaration; batch: InventoryBatch | null }> {
    const batchId = await this.queries.transaction(async (tx) => {
      const shipment = await this.queries.lockShipment(shipmentId, tx);
      if (!shipment) throw new AppError('NOT_FOUND', 'inv.shipmentNotFound');
      if (shipment.status !== 'DECLARED') {
        throw new AppError('SHIPMENT_ALREADY_PROCESSED', 'inv.shipmentAlreadyProcessed');
      }

      const discrepancy = input.receivedQuantity !== shipment.declaredQuantity;
      const notes = input.discrepancyNotes?.trim() || null;
      if (discrepancy && !notes) {
        throw invalidField('discrepancyNotes', 'inv.discrepancyNotesRequired');
      }

      const now = this.clock.now();
      await this.queries.markShipmentReceived(
        shipment.id,
        {
          status: discrepancy ? 'DISCREPANCY' : 'RECEIVED',
          receivedQuantity: input.receivedQuantity,
          discrepancyNotes: discrepancy ? notes : null,
          receivedBy: actor.userId,
          receivedAt: now,
        },
        tx,
      );

      let createdBatchId: string | null = null;
      if (input.receivedQuantity > 0) {
        try {
          createdBatchId = await this.queries.insertBatch(
            {
              brandId: shipment.brandId,
              fragranceProductId: shipment.fragranceProductId,
              sourceDeclarationId: shipment.id,
              batchNumber: input.batchNumber.trim(),
              receivedAt: now,
              expiresAt: input.expiresAt ?? null,
              quantityReceived: input.receivedQuantity,
              createdBy: actor.userId,
            },
            tx,
          );
        } catch (error) {
          if (uniqueViolation(error) === 'uq_batch_brand_product_number') {
            throw invalidField('batchNumber', 'inv.batchNumberTaken');
          }
          throw error;
        }
      }

      await this.audit.log(
        {
          actorType: 'USER',
          actorId: actor.userId,
          brandId: shipment.brandId,
          action: discrepancy ? 'inv.shipment.discrepancy' : 'inv.shipment.received',
          targetType: 'ShipmentDeclaration',
          targetId: shipment.id,
          severity: discrepancy ? 'WARNING' : 'INFO',
          before: { status: shipment.status },
          after: {
            status: discrepancy ? 'DISCREPANCY' : 'RECEIVED',
            receivedQuantity: input.receivedQuantity,
            batchId: createdBatchId,
          },
        },
        tx,
      );
      return createdBatchId;
    });

    const declaration = toShipmentDto((await this.queries.findShipment(shipmentId))!);
    const batch = batchId ? await this.queries.findBatch(batchId, { kind: 'UNRESTRICTED' }) : null;
    return { declaration, batch: batch ? toBatchDto(batch) : null };
  }

  // -----------------------------------------------------------------------------------
  // Lô và giấy tờ chính hãng (FR-INV-01, 33 ÷ 35)
  // -----------------------------------------------------------------------------------

  async listBatches(
    scope: BrandScope,
    filter: {
      readonly page: number;
      readonly pageSize: number;
      readonly fragranceProductId?: string | undefined;
      readonly authenticityStatus?: BatchAuthenticityStatus | undefined;
    },
  ): Promise<{ items: InventoryBatch[]; total: number }> {
    const { items, total } = await this.queries.listBatches(scope, filter);
    return { items: items.map(toBatchDto), total };
  }

  /**
   * FR-INV-33: Brand Admin nộp giấy tờ cho lô của mình. Lô của thương hiệu khác trả như không tồn
   * tại (FR-AUTH-08 AC2 — `notFoundFor` cho Brand Admin là FORBIDDEN_SCOPE).
   */
  async submitAuthenticity(
    actor: AuthenticatedUser,
    scope: BrandScope,
    batchId: string,
    input: { readonly documentUrl: string; readonly documentType?: string | undefined },
  ): Promise<InventoryBatch> {
    if (scope.kind !== 'BRAND') throw new AppError('FORBIDDEN_SCOPE', 'inv.brandAccountOnly');

    await this.queries.transaction(async (tx) => {
      const batch = await this.queries.lockBatch(batchId, scope, tx);
      if (!batch) throw notFoundFor(actor);
      if (batch.status === 'APPROVED') {
        throw new AppError('AUTHENTICITY_NOT_PENDING', 'inv.authenticityAlreadyApproved');
      }

      const now = this.clock.now();
      const stockingDays = this.config.constraint('RENTAL_MAX_STOCKING_DAYS');
      if (!(await this.queries.brandCanStillStock(batch.brandId, now, stockingDays, tx))) {
        throw new AppError('DOCUMENT_SUBMISSION_EXPIRED', 'inv.documentSubmissionExpired', {
          days: stockingDays,
        });
      }

      const documentType = input.documentType?.trim() || DEFAULT_DOCUMENT_TYPE;
      await this.queries.submitAuthenticity(
        batch.id,
        {
          documentUrl: input.documentUrl.trim(),
          documentType,
          submittedBy: actor.userId,
          submittedAt: now,
        },
        tx,
      );
      await this.audit.log(
        {
          actorType: 'USER',
          actorId: actor.userId,
          brandId: batch.brandId,
          action: 'inv.batch.authenticity_submitted',
          targetType: 'InventoryBatch',
          targetId: batch.id,
          before: { authenticityStatus: batch.status },
          after: { authenticityStatus: 'PENDING', documentType },
        },
        tx,
      );
    });
    return toBatchDto((await this.queries.findBatch(batchId, scope))!);
  }

  /** FR-INV-34 AC1: chỉ duyệt lô đang PENDING — lô chưa nộp giấy tờ thì không duyệt được. */
  approveAuthenticity(actor: AuthenticatedUser, batchId: string): Promise<InventoryBatch> {
    return this.reviewAuthenticity(actor, batchId, 'APPROVED', null);
  }

  /** FR-INV-34 AC2, AC3: lý do bắt buộc. */
  rejectAuthenticity(
    actor: AuthenticatedUser,
    batchId: string,
    reason: string | undefined,
  ): Promise<InventoryBatch> {
    const trimmed = reason?.trim();
    if (!trimmed) throw new AppError('REASON_REQUIRED', 'inv.reasonRequired');
    return this.reviewAuthenticity(actor, batchId, 'REJECTED', trimmed);
  }

  private async reviewAuthenticity(
    actor: AuthenticatedUser,
    batchId: string,
    status: 'APPROVED' | 'REJECTED',
    reason: string | null,
  ): Promise<InventoryBatch> {
    const unrestricted: BrandScope = { kind: 'UNRESTRICTED' };
    await this.queries.transaction(async (tx) => {
      const batch = await this.queries.lockBatch(batchId, unrestricted, tx);
      if (!batch) throw new AppError('NOT_FOUND', 'inv.batchNotFound');
      if (batch.status !== 'PENDING') {
        throw new AppError('AUTHENTICITY_NOT_PENDING', 'inv.authenticityNotPending');
      }

      const now = this.clock.now();
      await this.queries.reviewAuthenticity(
        batch.id,
        { status, verifiedBy: actor.userId, verifiedAt: now, rejectionReason: reason },
        tx,
      );
      const detail = (await this.queries.findBatch(batch.id, unrestricted, tx))!;
      const message =
        status === 'APPROVED'
          ? {
              type: 'BATCH_AUTHENTICITY_APPROVED',
              subject: translate(DEFAULT_LOCALE, 'inv.authenticityApprovedSubject', {
                batch: detail.batchNumber,
              }),
              content: translate(DEFAULT_LOCALE, 'inv.authenticityApprovedContent', {
                batch: detail.batchNumber,
                product: detail.productName,
              }),
            }
          : {
              type: 'BATCH_AUTHENTICITY_REJECTED',
              subject: translate(DEFAULT_LOCALE, 'inv.authenticityRejectedSubject', {
                batch: detail.batchNumber,
              }),
              content: translate(DEFAULT_LOCALE, 'inv.authenticityRejectedContent', {
                batch: detail.batchNumber,
                product: detail.productName,
                reason: reason ?? '',
              }),
            };
      // Kết quả duyệt quyết định lô có được lắp hay không — gửi cả email (FR-INV-34, FR-ALR-16).
      await this.alr.notifyBrandAdmins(tx, {
        brandId: batch.brandId,
        ...message,
        referenceId: batch.id,
        at: now,
      });
      await this.audit.log(
        {
          actorType: 'USER',
          actorId: actor.userId,
          brandId: batch.brandId,
          action:
            status === 'APPROVED'
              ? 'inv.batch.authenticity_approved'
              : 'inv.batch.authenticity_rejected',
          targetType: 'InventoryBatch',
          targetId: batch.id,
          before: { authenticityStatus: batch.status },
          after: { authenticityStatus: status, ...(reason ? { reason } : {}) },
        },
        tx,
      );
    });
    return toBatchDto((await this.queries.findBatch(batchId, unrestricted))!);
  }

  // -----------------------------------------------------------------------------------
  // Chai (FR-INV-02, 04)
  // -----------------------------------------------------------------------------------

  async listBottles(
    scope: BrandScope,
    filter: {
      readonly page: number;
      readonly pageSize: number;
      readonly status?: BottleStatus | undefined;
      readonly batchId?: string | undefined;
    },
  ): Promise<{ items: Bottle[]; total: number }> {
    const { items, total } = await this.queries.listBottles(scope, filter);
    return { items: items.map(toBottleDto), total };
  }

  /** FR-INV-02: chai lấy thương hiệu và sản phẩm từ lô; mã định danh duy nhất trong thương hiệu. */
  async registerBottle(actor: AuthenticatedUser, input: RegisterBottleInput): Promise<Bottle> {
    const id = await this.queries.transaction(async (tx) => {
      const batch = await this.queries.findBatchForBottle(input.batchId, tx);
      if (!batch) throw invalidField('batchId', 'inv.batchNotFound');
      let bottleId: string;
      try {
        bottleId = await this.queries.insertBottle(
          {
            brandId: batch.brandId,
            batchId: input.batchId,
            fragranceProductId: batch.fragranceProductId,
            identifier: input.identifier.trim(),
            initialVolumeMl: input.initialVolumeMl,
            emptyWeightG: input.emptyWeightG ?? null,
            expiresAt: input.expiresAt ?? batch.expiresAt,
          },
          tx,
        );
      } catch (error) {
        if (uniqueViolation(error) === 'uq_bottle_brand_identifier') {
          throw invalidField('identifier', 'inv.bottleIdentifierTaken');
        }
        throw error;
      }
      await this.audit.log(
        {
          actorType: 'USER',
          actorId: actor.userId,
          brandId: batch.brandId,
          action: 'inv.bottle.registered',
          targetType: 'Bottle',
          targetId: bottleId,
          after: { batchId: input.batchId, identifier: input.identifier.trim() },
        },
        tx,
      );
      return bottleId;
    });
    return toBottleDto((await this.queries.findBottle(id))!);
  }

  // -----------------------------------------------------------------------------------
  // Phiếu nạp (FR-INV-29 ÷ 32)
  // -----------------------------------------------------------------------------------

  async listRefillSessions(
    scope: BrandScope,
    filter: {
      readonly page: number;
      readonly pageSize: number;
      readonly machineId?: string | undefined;
      readonly status?: RefillStatus | undefined;
    },
  ): Promise<{ items: RefillSession[]; total: number }> {
    const { items, total } = await this.queries.listRefillSessions(scope, filter);
    return { items: items.map(toRefillDto), total };
  }

  /**
   * FR-INV-29, 32: máy suy từ slot. Thứ tự kiểm: slot tồn tại → máy rảnh (MACHINE_BUSY) → slot có
   * hóa đơn đã thanh toán (RENTAL_NOT_ACTIVE) → slot chưa có phiếu mở (REFILL_SESSION_OPEN).
   */
  async openRefillSession(
    actor: AuthenticatedUser,
    input: OpenRefillInput,
  ): Promise<RefillSession> {
    const id = await this.queries
      .transaction(async (tx) => {
        const slot = await this.queries.lockSlotAndMachine(input.slotId, tx);
        if (!slot) throw invalidField('slotId', 'inv.slotNotFound');
        if (await this.queries.machineIsBusy(slot.machineId, tx)) {
          throw new AppError('MACHINE_BUSY', 'inv.machineBusy');
        }
        const rental = await this.queries.findStockableRental(slot.id, tx);
        if (!rental) throw new AppError('RENTAL_NOT_ACTIVE', 'inv.rentalNotStockable');
        if (await this.queries.slotHasOpenRefillSession(slot.id, tx)) {
          throw new AppError('REFILL_SESSION_OPEN', 'inv.refillSessionOpen');
        }

        const now = this.clock.now();
        const sessionId = await this.queries.insertRefillSession(
          {
            brandId: rental.brandId,
            machineId: slot.machineId,
            slotId: slot.id,
            oldBottleId: slot.activeBottleId,
            performedBy: actor.userId,
            beforeWeightG: input.beforeWeightG ?? null,
            startedAt: now,
          },
          tx,
        );
        await this.audit.log(
          {
            actorType: 'USER',
            actorId: actor.userId,
            brandId: rental.brandId,
            action: 'inv.refill.opened',
            targetType: 'RefillSession',
            targetId: sessionId,
            after: { machineId: slot.machineId, slotId: slot.id, rentalId: rental.id },
          },
          tx,
        );
        return sessionId;
      })
      .catch((error: unknown) => {
        // Hai người mở cùng lúc: cả hai qua bước kiểm, CSDL chỉ cho một phiếu STARTED mỗi slot.
        if (uniqueViolation(error) === 'uq_slot_open_refill_session') {
          throw new AppError('REFILL_SESSION_OPEN', 'inv.refillSessionOpen');
        }
        throw error;
      });
    return toRefillDto((await this.queries.findRefillSession(id))!);
  }

  /**
   * FR-INV-31, 35 (FR-INV-06, 07, 08, 13, 14): đóng phiếu, lắp chai mới. Checklist đã được tầng HTTP
   * buộc là `true` (openapi `RefillSessionClose`).
   */
  async closeRefillSession(
    actor: AuthenticatedUser,
    sessionId: string,
    input: CloseRefillInput,
  ): Promise<RefillSession> {
    await this.queries.transaction(async (tx) => {
      const session = await this.queries.lockRefillSession(sessionId, tx);
      if (!session) throw new AppError('NOT_FOUND', 'inv.refillSessionNotFound');
      if (session.status !== 'STARTED') {
        throw new AppError('REFILL_SESSION_NOT_OPEN', 'inv.refillSessionNotOpen');
      }

      const slot = (await this.queries.lockSlotAndMachine(session.slotId, tx))!;
      const rental = await this.queries.findStockableRental(slot.id, tx);
      if (!rental || rental.brandId !== session.brandId) {
        throw new AppError('RENTAL_NOT_ACTIVE', 'inv.rentalNotStockable');
      }

      const now = this.clock.now();
      const bottle = await this.assertInstallable(tx, input.newBottleId, rental, now);

      const oldBottleId = slot.activeBottleId;
      if (oldBottleId && oldBottleId !== bottle.id) {
        await this.queries.removeBottle(oldBottleId, now, tx);
      }
      await this.queries.installBottle(
        bottle.id,
        { at: now, measuredWeightG: input.afterWeightG ?? null },
        tx,
      );
      await this.queries.setSlotBottle(slot, bottle, tx);
      await this.queries.completeRefillSession(
        session.id,
        {
          oldBottleId,
          newBottleId: bottle.id,
          afterWeightG: input.afterWeightG ?? null,
          notes: input.notes?.trim() || null,
          completedAt: now,
        },
        tx,
      );
      // FR-SLT-24: kích hoạt hóa đơn khi lắp chai đầu tiên trong cùng tx với việc đóng phiếu nạp.
      await this.slt.activateOnFirstBottleInstall(rental.id, now, actor, tx);
      await this.audit.log(
        {
          actorType: 'USER',
          actorId: actor.userId,
          brandId: session.brandId,
          action: 'inv.refill.closed',
          targetType: 'RefillSession',
          targetId: session.id,
          before: { status: 'STARTED', activeBottleId: oldBottleId },
          after: { status: 'COMPLETED', activeBottleId: bottle.id, rentalId: rental.id },
        },
        tx,
      );
    });
    return toRefillDto((await this.queries.findRefillSession(sessionId))!);
  }

  /** Chai lắp được vào slot của `rental` — thứ tự kiểm theo ADR-0017 mục 2 và FR-INV-06 ÷ 08, 35. */
  private async assertInstallable(
    tx: Executor,
    bottleId: string,
    rental: { readonly brandId: string; readonly fragranceProductId: string | null },
    now: Date,
  ) {
    const bottle = await this.queries.lockBottleForInstall(bottleId, tx);
    if (!bottle) throw invalidField('newBottleId', 'inv.bottleNotFound');
    if (bottle.brandId !== rental.brandId || bottle.owner !== 'BRAND') {
      throw new AppError('BOTTLE_NOT_OWNED', 'inv.bottleNotOwned');
    }
    if (bottle.status !== 'IN_STOCK') {
      throw new AppError('BOTTLE_NOT_IN_STOCK', 'inv.bottleNotInStock');
    }
    if (bottle.expiresAt !== null && bottle.expiresAt <= now) {
      throw new AppError('BOTTLE_EXPIRED', 'inv.bottleExpired');
    }
    // Slot chưa cấu hình sản phẩm thì chưa biết chai nào đúng — buộc thương hiệu cấu hình trước.
    if (rental.fragranceProductId !== bottle.fragranceProductId) {
      throw new AppError('PRODUCT_MISMATCH', 'inv.productMismatch');
    }
    if (bottle.batchAuthenticity !== 'APPROVED') {
      throw new AppError('BATCH_NOT_APPROVED', 'inv.batchNotApproved');
    }
    return bottle;
  }
}

// -------------------------------------------------------------------------------------
// DTO theo openapi
// -------------------------------------------------------------------------------------

function iso(date: Date | null): string | null {
  return date === null ? null : date.toISOString();
}

export function toShipmentDto(r: ShipmentRecord): ShipmentDeclaration {
  return {
    id: r.id,
    brandId: r.brandId,
    fragranceProductId: r.fragranceProductId,
    productName: r.productName,
    declaredQuantity: r.declaredQuantity,
    declaredBottleVolumeMl: Number(r.declaredBottleVolumeMl),
    expectedShipDate: r.expectedShipDate,
    status: r.status,
    receivedQuantity: r.receivedQuantity,
    discrepancyNotes: r.discrepancyNotes,
    receivedBy: r.receivedBy,
    receivedAt: iso(r.receivedAt),
    resultingBatchId: r.resultingBatchId,
    createdAt: r.createdAt.toISOString(),
  };
}

export function toBatchDto(r: BatchRecord): InventoryBatch {
  return {
    id: r.id,
    brandId: r.brandId,
    fragranceProductId: r.fragranceProductId,
    productName: r.productName,
    sourceDeclarationId: r.sourceDeclarationId,
    batchNumber: r.batchNumber,
    receivedAt: r.receivedAt.toISOString(),
    expiresAt: iso(r.expiresAt),
    quantityReceived: r.quantityReceived,
    authenticityStatus: r.authenticityStatus,
    authenticityDocumentUrl: r.authenticityDocumentUrl,
    authenticityDocumentType: r.authenticityDocumentType,
    authenticitySubmittedAt: iso(r.authenticitySubmittedAt),
    authenticityVerifiedAt: iso(r.authenticityVerifiedAt),
    authenticityRejectionReason: r.authenticityRejectionReason,
  };
}

export function toBottleDto(r: BottleRecord): Bottle {
  return {
    id: r.id,
    brandId: r.brandId,
    owner: r.owner,
    batchId: r.batchId,
    fragranceProductId: r.fragranceProductId,
    identifier: r.identifier,
    status: r.status,
    initialVolumeMl: Number(r.initialVolumeMl),
    currentEstimatedMl: Number(r.currentEstimatedMl),
    installedSlotId: r.installedSlotId,
    expiresAt: iso(r.expiresAt),
    sourceRentalId: r.sourceRentalId,
    liquidatedAt: iso(r.liquidatedAt),
    bottleReturnId: r.bottleReturnId,
  };
}

export function toRefillDto(r: RefillSessionRecord): RefillSession {
  return {
    id: r.id,
    brandId: r.brandId,
    machineId: r.machineId,
    slotId: r.slotId,
    oldBottleId: r.oldBottleId,
    newBottleId: r.newBottleId,
    performedBy: r.performedBy,
    status: r.status,
    checklistCompleted: r.checklistCompleted,
    beforeWeightG: r.beforeWeightG === null ? null : Number(r.beforeWeightG),
    afterWeightG: r.afterWeightG === null ? null : Number(r.afterWeightG),
    notes: r.notes,
    startedAt: r.startedAt.toISOString(),
    completedAt: iso(r.completedAt),
  };
}

function uniqueViolation(error: unknown): string | null {
  const e = error as { code?: string; constraint?: string };
  return e.code === '23505' ? (e.constraint ?? null) : null;
}
