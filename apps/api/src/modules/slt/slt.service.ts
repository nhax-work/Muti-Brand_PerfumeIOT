/**
 * Đọc hóa đơn thuê slot (FR-SLT-15, FR-SLT-41; ADR-0006, ADR-0008).
 *
 * Tầng nghiệp vụ độc lập hoàn toàn với HTTP (QT2, ADR-0003).
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { AuditService } from '../../shared/audit/index.js';
import { CLOCK, type Clock } from '../../shared/clock.js';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import { DATABASE, type Database } from '../../shared/db/index.js';
import { AppError, invalidField, notFoundFor } from '../../shared/errors/index.js';
import type { BrandScope } from '../../shared/scoping/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import { MchQueries } from '../mch/mch.queries.js';
import { newPaymentReference, PaymentService, type PaymentIntent } from '../ord/index.js';
import { CatalogQueries } from './catalog.queries.js';
import { toPlanDto } from './catalog.service.js';
import {
  SltQueries,
  stageOf,
  type CheckoutCreateItemData,
  type RentalCheckoutRecord,
  type SlotRentalFilter,
  type SlotRentalRecord,
} from './slt.queries.js';

type SlotRental = Schema<'SlotRental'>;
type RentalCheckout = Schema<'RentalCheckout'>;
type RentalQuote = Schema<'RentalQuote'>;
type RentalInvoice = Schema<'RentalInvoice'>;
type RentalPaymentIntent = Schema<'RentalPaymentIntent'>;

@Injectable()
export class SltService {
  constructor(
    @Inject(SltQueries) private readonly queries: SltQueries,
    @Inject(CatalogQueries) private readonly catalogQueries: CatalogQueries,
    @Inject(MchQueries) private readonly mchQueries: MchQueries,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PaymentService) private readonly payments: PaymentService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

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

  /** FR-SLT-34: Xem bảng giá các gói cho slot đã chọn. */
  async getQuote(actor: AuthenticatedUser, slotId: string): Promise<RentalQuote> {
    const slot = await this.mchQueries.findSlotById(slotId);
    if (!slot) throw notFoundFor(actor);

    if (!slot.monthlyRentPrice) {
      throw invalidField('slotId', 'slt.slotNotForRent');
    }

    if (slot.currentRentalId) {
      throw new AppError('SLOT_OCCUPIED', 'slt.slotOccupied');
    }

    const [packages, plans] = await Promise.all([
      this.catalogQueries.listPackages(true),
      this.catalogQueries.listPlans(true),
    ]);

    const monthlyPrice = Number(slot.monthlyRentPrice);

    return {
      slotId: slot.id,
      monthlyRentPrice: slot.monthlyRentPrice,
      currency: 'VND',
      packages: packages.map((pkg) => {
        const duration = pkg.duration_months;
        const discount = Number(pkg.discount_percent);
        const listAmount = (monthlyPrice * duration).toFixed(4);
        const rentAmount = (monthlyPrice * duration * (1 - discount / 100)).toFixed(4);

        return {
          rentalPackageId: pkg.id,
          name: pkg.name,
          durationMonths: duration,
          discountPercent: discount,
          listAmount,
          rentAmount,
        };
      }),
      storagePlans: plans.map(toPlanDto),
    };
  }

  /** FR-SLT-35, FR-SLT-36, FR-SLT-33: Chọn dịch vụ và giữ chỗ một hoặc nhiều slot (ADR-0008). */
  async createCheckout(
    actor: AuthenticatedUser,
    scope: BrandScope,
    input: { items: Array<{ slotId: string; rentalPackageId: string; storagePlanId: string }> },
  ): Promise<RentalCheckout> {
    if (scope.kind !== 'BRAND' || !scope.brandId) {
      throw new AppError('FORBIDDEN_SCOPE', 'common.outOfScope');
    }

    if (!input.items || input.items.length === 0) {
      throw invalidField('items', 'slt.emptyCart');
    }

    const slotIds = input.items.map((i) => i.slotId);
    if (new Set(slotIds).size !== slotIds.length) {
      throw invalidField('items', 'slt.duplicateSlotInCart');
    }

    const [packages, plans] = await Promise.all([
      this.catalogQueries.listPackages(true),
      this.catalogQueries.listPlans(true),
    ]);

    const packageMap = new Map(packages.map((p) => [p.id, p]));
    const planMap = new Map(plans.map((p) => [p.id, p]));

    const itemDatas: CheckoutCreateItemData[] = [];
    let checkoutTotal = 0;
    const t0 = new Date();

    for (const item of input.items) {
      if (!item.storagePlanId) {
        throw invalidField('storagePlanId', 'slt.storagePlanRequired');
      }

      const pkg = packageMap.get(item.rentalPackageId);
      if (!pkg) {
        throw invalidField('rentalPackageId', 'slt.packageNotFoundOrInactive');
      }

      const plan = planMap.get(item.storagePlanId);
      if (!plan) {
        throw invalidField('storagePlanId', 'slt.planNotFoundOrInactive');
      }

      const slot = await this.mchQueries.findSlotById(item.slotId);
      if (!slot || !slot.monthlyRentPrice) {
        throw invalidField('slotId', 'slt.slotNotForRent');
      }

      const duration = pkg.duration_months;
      const discount = Number(pkg.discount_percent);
      const monthlyRent = Number(slot.monthlyRentPrice);

      const rentAmount = (monthlyRent * duration * (1 - discount / 100)).toFixed(4);
      const storageAmount = (Number(plan.monthly_price) * duration).toFixed(4);
      const itemTotal = (Number(rentAmount) + Number(storageAmount)).toFixed(4);
      checkoutTotal += Number(itemTotal);

      const endsAt = new Date(t0);
      endsAt.setDate(endsAt.getDate() + this.config.constraint('RENTAL_MAX_STOCKING_DAYS'));
      endsAt.setMonth(endsAt.getMonth() + duration);

      itemDatas.push({
        slotId: slot.id,
        rentalPackageId: pkg.id,
        storagePlanId: plan.id,
        durationMonths: duration,
        monthlyRentPrice: slot.monthlyRentPrice,
        discountPercent: String(discount),
        storageMonthlyPrice: plan.monthly_price,
        storageCoveragePercent: String(plan.coverage_percent),
        storageCoverageCap: plan.coverage_cap,
        rentAmount,
        storageAmount,
        totalAmount: itemTotal,
        startsAt: t0,
        endsAt,
      });
    }

    const holdExpiresAt = new Date(
      t0.getTime() + this.config.constraint('RENTAL_CHECKOUT_HOLD_MIN') * 60 * 1000,
    );

    const result = await this.queries.createCheckoutTx({
      brandId: scope.brandId,
      createdBy: actor.userId,
      holdExpiresAt,
      totalAmount: checkoutTotal.toFixed(4),
      items: itemDatas,
    });

    if ('occupied' in result) {
      throw new AppError('SLOT_OCCUPIED', 'slt.slotOccupied');
    }

    const dto = toCheckoutDto(result.checkout, result.items);

    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      action: 'slt.rental_checkout.created',
      targetType: 'RentalCheckout',
      targetId: dto.id,
      after: dto,
    });

    return dto;
  }

  /** GET /rental-checkouts/{id}: Chi tiết phiên thanh toán thuê slot. */
  async getCheckout(
    actor: AuthenticatedUser,
    scope: BrandScope,
    id: string,
  ): Promise<RentalCheckout> {
    const record = await this.queries.findCheckoutById(scope, id);
    if (!record) throw notFoundFor(actor);
    return toCheckoutDto(record.checkout, record.items);
  }

  /** Chủ động hủy phiên thanh toán chưa trả và giải phóng slot ngay lập tức. */
  async cancelCheckout(
    actor: AuthenticatedUser,
    scope: BrandScope,
    id: string,
  ): Promise<RentalCheckout> {
    const now = this.clock.now();
    await this.db.transaction().execute(async (tx) => {
      const checkout = await this.queries.lockCheckoutById(id, tx);
      if (!checkout) throw notFoundFor(actor);

      if (scope.kind === 'BRAND' && checkout.brandId !== scope.brandId) {
        throw new AppError('FORBIDDEN_SCOPE', 'common.outOfScope');
      }

      if (checkout.paidAt !== null) {
        throw new AppError('RENTAL_NOT_ACTIVE', 'slt.rentalNotActive');
      }

      if (checkout.cancelledAt === null) {
        await this.payments.expirePending({ rentalCheckoutId: checkout.id }, tx);
        await this.queries.cancelCheckoutAndRentals(checkout.id, now, tx);

        await this.audit.log(
          {
            actorType: 'USER',
            actorId: actor.userId,
            brandId: checkout.brandId,
            action: 'slt.checkout.cancelled_by_user',
            targetType: 'RentalCheckout',
            targetId: checkout.id,
            severity: 'INFO',
            before: { status: 'AWAITING_PAYMENT' },
            after: { status: 'CANCELLED', cancelledAt: now },
          },
          tx,
        );
      }
    });

    return this.getCheckout(actor, scope, id);
  }

  /** FR-SLT-37: Thanh toán phiên thanh toán thuê slot. */
  async payCheckout(
    actor: AuthenticatedUser,
    scope: BrandScope,
    id: string,
  ): Promise<RentalPaymentIntent> {
    try {
      const result = await this.db.transaction().execute(async (tx) => {
        const checkout = await this.queries.lockCheckoutById(id, tx);
        if (!checkout) {
          throw notFoundFor(actor);
        }

        if (scope.kind === 'BRAND' && checkout.brandId !== scope.brandId) {
          throw new AppError('FORBIDDEN_SCOPE', 'common.outOfScope');
        }

        const now = this.clock.now();
        if (
          checkout.paidAt !== null ||
          checkout.cancelledAt !== null ||
          now.getTime() > checkout.holdExpiresAt.getTime()
        ) {
          throw new AppError('RENTAL_NOT_ACTIVE', 'slt.rentalNotActive');
        }

        const existing = await this.payments.findPendingIntent(
          { rentalCheckoutId: checkout.id },
          tx,
        );
        if (existing) {
          return { intent: existing, holdExpiresAt: checkout.holdExpiresAt };
        }

        const reference = newPaymentReference('CHK', now, 'Asia/Ho_Chi_Minh');
        const created = await this.payments.createPending(
          {
            brandId: checkout.brandId,
            target: { rentalCheckoutId: checkout.id },
            reference,
            amount: checkout.totalAmount,
            currency: checkout.currency,
            expiresAt: checkout.holdExpiresAt,
            description: `ScentStation thuê slot ${reference}`,
          },
          tx,
        );

        return { intent: created, holdExpiresAt: checkout.holdExpiresAt };
      });

      return toPaymentIntentDto(result.intent, result.holdExpiresAt, id);
    } catch (err: unknown) {
      // AC3: Bắt lỗi 23505 (uq_checkout_payment_pending) do 2 yêu cầu đồng thời
      const isUniqueViolation =
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === '23505';

      if (isUniqueViolation) {
        const checkout = await this.queries.findCheckoutRecordById(id);
        if (checkout) {
          const fallback = await this.payments.findPendingIntent({ rentalCheckoutId: id });
          if (fallback) {
            return toPaymentIntentDto(fallback, checkout.holdExpiresAt, id);
          }
        }
      }
      throw err;
    }
  }

  /** FR-SLT-40: Xem hóa đơn thuê slot. */
  async getInvoice(
    actor: AuthenticatedUser,
    scope: BrandScope,
    id: string,
  ): Promise<RentalInvoice> {
    const inv = await this.queries.findInvoiceDetailById(scope, id);
    if (!inv) throw notFoundFor(actor);

    return {
      rentalId: inv.rentalId,
      checkoutId: inv.checkoutId,
      invoiceNumber: inv.invoiceNumber,
      stage: stageOf(inv.status, inv.paidAt),
      brandId: inv.brandId,
      slotId: inv.slotId,
      slotNumber: inv.slotNumber,
      machineId: inv.machineId,
      machineDisplayName: inv.machineDisplayName,
      locationName: inv.locationName,
      rentalPackage: {
        name: inv.packageName ?? '',
        durationMonths: inv.durationMonths ?? 0,
        discountPercent: num(inv.discountPercent) ?? 0,
      },
      storagePlan: {
        name: inv.planName ?? '',
        monthlyPrice: inv.storageMonthlyPrice ?? '0.0000',
        coveragePercent: num(inv.storageCoveragePercent) ?? 0,
        coverageCap: inv.storageCoverageCap ?? '0.0000',
      },
      durationMonths: inv.durationMonths ?? 0,
      monthlyRentPrice: inv.monthlyRentPrice ?? '0.0000',
      discountPercent: num(inv.discountPercent) ?? 0,
      rentAmount: inv.rentAmount ?? '0.0000',
      storageAmount: inv.storageAmount ?? '0.0000',
      graceFeeAmount: inv.graceFeeAmount ?? '0.0000',
      totalAmount: inv.totalAmount ?? '0.0000',
      currency: inv.currency,
      holdExpiresAt: iso(inv.holdExpiresAt),
      paidAt: iso(inv.paidAt),
      startsAt: iso(inv.startsAt),
      endsAt: iso(inv.endsAt),
    };
  }

  /** FR-SLT-27, FR-SLT-28: Gán hoặc đổi sản phẩm cho slot. */
  async assignProduct(
    actor: AuthenticatedUser,
    scope: BrandScope,
    id: string,
    fragranceProductId: string,
  ): Promise<SlotRental> {
    const rental = await this.queries.findById(scope, id);
    if (!rental) throw notFoundFor(actor);

    if (!rental.paidAt || ['CLOSED', 'TERMINATED', 'CANCELLED'].includes(rental.status)) {
      throw new AppError('RENTAL_NOT_ACTIVE', 'slt.rentalNotActive');
    }

    const product = await this.queries.findProductById(fragranceProductId);
    if (!product) throw notFoundFor(actor);

    if (product.brandId !== rental.brandId) {
      throw new AppError('PRODUCT_NOT_OWNED', 'slt.productNotOwned');
    }

    if (product.status === 'DISCONTINUED') {
      throw invalidField('fragranceProductId', 'slt.productDiscontinued');
    }

    const updated = await this.queries.updateProduct(scope, id, fragranceProductId);
    const dto = toDto(updated!);

    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      action: 'slt.slot_rental.product_assigned',
      targetType: 'SlotRental',
      targetId: id,
      before: { fragranceProductId: rental.fragranceProductId },
      after: { fragranceProductId },
    });

    return dto;
  }

  /** FR-SLT-08: Đặt giá mỗi lượt xịt. */
  async setPricePerSpray(
    actor: AuthenticatedUser,
    scope: BrandScope,
    id: string,
    pricePerSpray: string,
  ): Promise<SlotRental> {
    const rental = await this.queries.findById(scope, id);
    if (!rental) throw notFoundFor(actor);

    if (!rental.paidAt || ['CLOSED', 'TERMINATED', 'CANCELLED'].includes(rental.status)) {
      throw new AppError('RENTAL_NOT_ACTIVE', 'slt.rentalNotActive');
    }

    const numericPrice = Number(pricePerSpray);
    if (isNaN(numericPrice) || numericPrice <= 0) {
      throw invalidField('pricePerSpray', 'slt.invalidPricePerSpray');
    }

    const formattedPrice = numericPrice.toFixed(4);
    const updated = await this.queries.updatePricePerSpray(scope, id, formattedPrice);
    const dto = toDto(updated!);

    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      action: 'slt.slot_rental.price_set',
      targetType: 'SlotRental',
      targetId: id,
      before: { pricePerSpray: rental.pricePerSpray },
      after: { pricePerSpray: formattedPrice },
    });

    return dto;
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

function toCheckoutDto(checkout: RentalCheckoutRecord, items: SlotRentalRecord[]): RentalCheckout {
  const stage = checkout.paidAt ? 'PAID' : checkout.cancelledAt ? 'CANCELLED' : 'AWAITING_PAYMENT';

  return {
    id: checkout.id,
    brandId: checkout.brandId,
    stage,
    currency: checkout.currency,
    totalAmount: checkout.totalAmount,
    holdExpiresAt: checkout.holdExpiresAt.toISOString(),
    paidAt: iso(checkout.paidAt),
    cancelledAt: iso(checkout.cancelledAt),
    createdAt: checkout.createdAt.toISOString(),
    invoices: items.map(toDto),
  };
}

function toPaymentIntentDto(
  intent: PaymentIntent,
  holdExpiresAt: Date,
  checkoutId: string,
): RentalPaymentIntent {
  return {
    paymentId: intent.paymentId,
    checkoutId,
    amount: intent.amount,
    currency: intent.currency,
    status: intent.status,
    checkoutUrl: intent.checkoutUrl,
    qrPayload: intent.qrPayload,
    expiresAt: holdExpiresAt.toISOString(),
  };
}
