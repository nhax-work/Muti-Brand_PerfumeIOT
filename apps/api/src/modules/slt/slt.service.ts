/**
 * Đọc hóa đơn thuê slot (FR-SLT-15, FR-SLT-41; ADR-0006, ADR-0008).
 *
 * Tầng nghiệp vụ độc lập hoàn toàn với HTTP (QT2, ADR-0003).
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { notFoundFor } from '../../shared/errors/index.js';
import type { BrandScope } from '../../shared/scoping/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import {
  SltQueries,
  stageOf,
  type SlotRentalFilter,
  type SlotRentalRecord,
} from './slt.queries.js';

type SlotRental = Schema<'SlotRental'>;
type Queries = Pick<SltQueries, 'list' | 'findById'>;

@Injectable()
export class SltService {
  constructor(@Inject(SltQueries) private readonly queries: Queries) {}

  /** FR-SLT-41: Brand Admin chỉ thấy hóa đơn của mình (phạm vi qua `scope`, FR-BND-05). */
  async list(
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
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const num = (v: string | null): number | null => (v === null ? null : Number(v));

export function toDto(r: SlotRentalRecord): SlotRental {
  return {
    id: r.id,
    slotId: r.slotId,
    machineId: r.machineId,
    brandId: r.brandId,
    fragranceProductId: r.fragranceProductId,
    productAssignedAt: iso(r.productAssignedAt),
    requestId: r.requestId,
    previousRentalId: r.previousRentalId,
    status: r.status,
    stage: stageOf(r.status, r.paidAt),
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    graceEndsAt: iso(r.graceEndsAt),
    pricePerSpray: r.pricePerSpray,
    currency: r.currency,
    fixedFee: r.fixedFee,
    revenueSharePercent: Number(r.revenueSharePercent),
    terminatedReason: r.terminatedReason,
    checkoutId: r.checkoutId,
    invoiceNumber: r.invoiceNumber,
    rentalPackageId: r.rentalPackageId,
    storagePlanId: r.storagePlanId,
    durationMonths: r.durationMonths,
    monthlyRentPrice: r.monthlyRentPrice,
    discountPercent: num(r.discountPercent),
    storageMonthlyPrice: r.storageMonthlyPrice,
    storageCoveragePercent: num(r.storageCoveragePercent),
    storageCoverageCap: r.storageCoverageCap,
    rentAmount: r.rentAmount,
    storageAmount: r.storageAmount,
    graceFeeAmount: r.graceFeeAmount,
    totalAmount: r.totalAmount,
    holdExpiresAt: iso(r.holdExpiresAt),
    paidAt: iso(r.paidAt),
    cancelledAt: iso(r.cancelledAt),
    createdAt: r.createdAt.toISOString(),
  };
}
