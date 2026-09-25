/**
 * Quản lý Hợp đồng thuê Slot (FR-SLT-01..29).
 *
 * Tầng nghiệp vụ độc lập hoàn toàn với HTTP (QT2, ADR-0003).
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { AuditService } from '../../shared/audit/index.js';
import { AppError, notFoundFor } from '../../shared/errors/index.js';
import type { BrandScope } from '../../shared/scoping/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import {
  SltQueries,
  type SlotRentalFilter,
  type SlotRentalRecord,
  type SlotRentalStatus,
} from './slt.queries.js';

type SlotRental = Schema<'SlotRental'>;

export interface CreateSlotRentalInput {
  readonly slotId: string;
  readonly brandId: string;
  readonly fragranceProductId?: string;
  readonly requestId?: string;
  readonly previousRentalId?: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly pricePerSpray: string;
  readonly currency?: string;
  readonly fixedFee?: string;
  readonly revenueSharePercent?: number;
}

type Queries = Pick<SltQueries, 'list' | 'findById' | 'create' | 'updateStatus'>;
type Audit = Pick<AuditService, 'log'>;

@Injectable()
export class SltService {
  constructor(
    @Inject(SltQueries) private readonly queries: Queries,
    @Inject(AuditService) private readonly audit: Audit,
  ) {}

  async list(
    actor: AuthenticatedUser,
    scope: BrandScope,
    filter: SlotRentalFilter,
  ): Promise<{ items: SlotRental[]; total: number }> {
    const { items, total } = await this.queries.list(scope, filter);
    return { items: items.map(toDto), total };
  }

  async get(actor: AuthenticatedUser, scope: BrandScope, id: string): Promise<SlotRental> {
    const record = await this.queries.findById(scope, id);
    if (!record) throw notFoundFor(actor);
    return toDto(record);
  }

  async create(actor: AuthenticatedUser, input: CreateSlotRentalInput): Promise<SlotRental> {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);

    if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      throw new AppError('INVALID_RENTAL_PERIOD', 'slt.invalidRentalPeriod');
    }

    const fixedFee = Number(input.fixedFee ?? 0);
    const revShare = input.revenueSharePercent ?? 0;
    if (fixedFee < 0 || revShare < 0 || revShare > 100) {
      throw new AppError('VALIDATION_ERROR', 'slt.financialsInvalid');
    }

    const now = new Date();
    // FR-SLT-01: DRAFT nếu startsAt > now, ACTIVE nếu startsAt <= now <= endsAt
    const initialStatus: SlotRentalStatus = startsAt > now ? 'DRAFT' : 'ACTIVE';

    try {
      const id = await this.queries.create({
        slotId: input.slotId,
        brandId: input.brandId,
        fragranceProductId: input.fragranceProductId,
        requestId: input.requestId,
        previousRentalId: input.previousRentalId,
        status: initialStatus,
        startsAt,
        endsAt,
        pricePerSpray: input.pricePerSpray,
        currency: input.currency ?? 'VND',
        fixedFee: input.fixedFee ?? '0',
        revenueSharePercent: input.revenueSharePercent ?? 0,
        createdBy: actor.userId,
      });

      await this.audit.log({
        actorType: 'USER',
        actorId: actor.userId,
        action: 'slt.rental.created',
        targetType: 'SlotRental',
        targetId: id,
        after: { id, slotId: input.slotId, brandId: input.brandId, status: initialStatus },
      });

      const record = await this.queries.findById({ kind: 'UNRESTRICTED' }, id);
      return toDto(record!);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new AppError('SLOT_OCCUPIED', 'slt.slotOccupied');
      }
      throw error;
    }
  }

  async activate(actor: AuthenticatedUser, scope: BrandScope, id: string): Promise<SlotRental> {
    const record = await this.queries.findById(scope, id);
    if (!record) throw notFoundFor(actor);

    if (record.status !== 'DRAFT') {
      throw new AppError('VALIDATION_ERROR', 'slt.invalidStatusTransition');
    }

    try {
      await this.queries.updateStatus(id, 'ACTIVE');

      await this.audit.log({
        actorType: 'USER',
        actorId: actor.userId,
        action: 'slt.rental.activated',
        targetType: 'SlotRental',
        targetId: id,
        before: { status: 'DRAFT' },
        after: { status: 'ACTIVE' },
      });

      const updated = await this.queries.findById(scope, id);
      return toDto(updated!);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new AppError('SLOT_OCCUPIED', 'slt.slotOccupied');
      }
      throw error;
    }
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  const e = error as { code?: string; constraint?: string; message?: string };
  return (
    e.code === '23505' ||
    e.constraint === 'uq_slot_active_rental' ||
    (typeof e.message === 'string' && e.message.includes('uq_slot_active_rental'))
  );
}

function toDto(record: SlotRentalRecord): SlotRental {
  return {
    id: record.id,
    slotId: record.slotId,
    machineId: record.machineId,
    brandId: record.brandId,
    fragranceProductId: record.fragranceProductId,
    productAssignedAt: record.productAssignedAt ? record.productAssignedAt.toISOString() : null,
    requestId: record.requestId,
    previousRentalId: record.previousRentalId,
    status: record.status,
    startsAt: record.startsAt.toISOString(),
    endsAt: record.endsAt.toISOString(),
    graceEndsAt: record.graceEndsAt ? record.graceEndsAt.toISOString() : null,
    pricePerSpray: record.pricePerSpray,
    currency: record.currency,
    fixedFee: record.fixedFee,
    revenueSharePercent: record.revenueSharePercent,
    terminatedReason: record.terminatedReason,
    createdAt: record.createdAt.toISOString(),
  };
}
