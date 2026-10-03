/**
 * Truy vấn CSDL cho module ORD / Kiosk (FR-ORD-01, FR-ORD-02, FR-RPT-06).
 */

import { Inject, Injectable } from '@nestjs/common';
import type { components } from '@scentstation/contracts';
import { DATABASE, type Database } from '../../shared/db/index.js';

export type KioskCatalog = components['schemas']['KioskCatalog'];
export type KioskCatalogItem = components['schemas']['KioskCatalogItem'];

export interface KioskInteractionEventInput {
  eventId: string;
  eventType: 'PRODUCT_IMPRESSION' | 'PRODUCT_SELECTED';
  slotId: string;
  kioskSessionId: string;
  occurredAt: string;
}

@Injectable()
export class OrdQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Lấy danh mục kiosk theo số serial máy (FR-ORD-01, FR-ORD-02).
   */
  async getKioskCatalog(serialNumber: string): Promise<KioskCatalog | null> {
    const machine = await this.db
      .selectFrom('machines')
      .where('serial_number', '=', serialNumber)
      .select(['id', 'serial_number', 'status', 'operating_mode'])
      .executeTakeFirst();

    if (!machine) {
      return null;
    }

    const slots = await this.db
      .selectFrom('machine_slots')
      .where('machine_id', '=', machine.id)
      .select(['id', 'slot_number', 'status'])
      .orderBy('slot_number', 'asc')
      .execute();

    const now = new Date();
    const items: KioskCatalogItem[] = [];

    for (const slot of slots) {
      // Tìm hợp đồng thuê slot đang ACTIVE và còn hiệu lực
      const rental = await this.db
        .selectFrom('slot_rentals')
        .innerJoin('brands', 'brands.id', 'slot_rentals.brand_id')
        .innerJoin(
          'fragrance_products',
          'fragrance_products.id',
          'slot_rentals.fragrance_product_id',
        )
        .where('slot_rentals.slot_id', '=', slot.id)
        .where('slot_rentals.status', '=', 'ACTIVE')
        .where('slot_rentals.starts_at', '<=', now)
        .where('slot_rentals.ends_at', '>=', now)
        .where('brands.status', '=', 'ACTIVE')
        .where('fragrance_products.status', '=', 'ACTIVE')
        .select([
          'slot_rentals.id as rental_id',
          'slot_rentals.price_per_spray',
          'slot_rentals.currency',
          'brands.name as brand_name',
          'fragrance_products.id as product_id',
          'fragrance_products.name as product_name',
          'fragrance_products.description as product_description',
          'fragrance_products.image_url as product_image_url',
          'fragrance_products.fragrance_notes as product_fragrance_notes',
        ])
        .executeTakeFirst();

      const isAvailable =
        slot.status === 'AVAILABLE' && rental !== undefined && rental.price_per_spray !== null;

      if (rental) {
        items.push({
          slotId: slot.id,
          slotNumber: slot.slot_number,
          available: isAvailable,
          brandName: rental.brand_name,
          product: {
            id: rental.product_id,
            name: rental.product_name,
            description: rental.product_description,
            imageUrl: rental.product_image_url,
            fragranceNotes:
              (rental.product_fragrance_notes as Record<string, unknown> | null) ?? null,
          },
          pricePerSpray: rental.price_per_spray,
          currency: rental.currency,
        });
      } else {
        // Slot hoàn toàn trống không có hợp đồng thuê
        items.push({
          slotId: slot.id,
          slotNumber: slot.slot_number,
          available: false,
          brandName: null,
          product: null,
          pricePerSpray: null,
          currency: 'VND',
        });
      }
    }

    return {
      machineSerial: machine.serial_number,
      machineStatus: machine.status,
      operatingMode: machine.operating_mode,
      items,
    };
  }

  /**
   * Lưu các sự kiện tương tác trên kiosk (FR-RPT-06, BR-007).
   */
  async recordKioskInteractions(events: KioskInteractionEventInput[]): Promise<void> {
    for (const event of events) {
      const slot = await this.db
        .selectFrom('machine_slots')
        .where('id', '=', event.slotId)
        .select(['machine_id'])
        .executeTakeFirst();

      if (!slot) continue;

      const rental = await this.db
        .selectFrom('slot_rentals')
        .where('slot_id', '=', event.slotId)
        .where('fragrance_product_id', 'is not', null)
        .select(['id', 'brand_id', 'fragrance_product_id'])
        .orderBy('created_at', 'desc')
        .executeTakeFirst();

      if (!rental || !rental.fragrance_product_id) continue;

      await this.db
        .insertInto('kiosk_interaction_events')
        .values({
          event_id: event.eventId,
          event_type: event.eventType,
          brand_id: rental.brand_id,
          slot_rental_id: rental.id,
          machine_id: slot.machine_id,
          slot_id: event.slotId,
          fragrance_product_id: rental.fragrance_product_id,
          kiosk_session_id: event.kioskSessionId,
          occurred_at: new Date(event.occurredAt),
        })
        .onConflict((oc) => oc.column('event_id').doNothing())
        .execute();
    }
  }
}
