/**
 * Unit test cho module ORD / Kiosk (FR-ORD-01, FR-ORD-02, FR-RPT-06).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { OrdService } from '../../apps/api/src/modules/ord/ord.service.js';
import type {
  KioskCatalog,
  KioskInteractionEventInput,
  OrdQueries,
} from '../../apps/api/src/modules/ord/ord.queries.js';
import { AppError } from '../../apps/api/src/shared/errors/index.js';

class FakeOrdQueries {
  catalogs = new Map<string, KioskCatalog>();
  recordedEvents: KioskInteractionEventInput[] = [];

  async getKioskCatalog(serialNumber: string): Promise<KioskCatalog | null> {
    return this.catalogs.get(serialNumber) ?? null;
  }

  async recordKioskInteractions(events: KioskInteractionEventInput[]): Promise<void> {
    this.recordedEvents.push(...events);
  }
}

describe('OrdService — Kiosk Catalog & Interactions (FR-ORD-01, FR-ORD-02, FR-RPT-06)', () => {
  let queries: FakeOrdQueries;
  let service: OrdService;

  beforeEach(() => {
    queries = new FakeOrdQueries();
    service = new OrdService(queries as unknown as OrdQueries);
  });

  it('test_FR_ORD_01_getKioskCatalog_success — trả về danh mục đầy đủ theo số serial của máy', async () => {
    const mockCatalog: KioskCatalog = {
      machineSerial: 'M001',
      machineStatus: 'ONLINE',
      operatingMode: 'NORMAL',
      items: [
        {
          slotId: 'slot-1',
          slotNumber: 1,
          available: true,
          brandName: 'Maison Aurore',
          product: {
            id: 'prod-1',
            name: 'Aurore Matinale',
            description: 'Hương buổi sáng',
            imageUrl: 'https://example.com/aurore.png',
            fragranceNotes: { top: ['Bergamot'] },
          },
          pricePerSpray: '35000.0000',
          currency: 'VND',
        },
        {
          slotId: 'slot-2',
          slotNumber: 2,
          available: false,
          brandName: null,
          product: null,
          pricePerSpray: null,
          currency: 'VND',
        },
      ],
    };

    queries.catalogs.set('M001', mockCatalog);

    const result = await service.getKioskCatalog('M001');

    expect(result.machineSerial).toBe('M001');
    expect(result.machineStatus).toBe('ONLINE');
    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.available).toBe(true);
    expect(result.items[0]!.brandName).toBe('Maison Aurore');
    expect(result.items[0]!.product?.name).toBe('Aurore Matinale');
    expect(result.items[1]!.available).toBe(false);
    expect(result.items[1]!.product).toBeNull();
  });

  it('test_FR_ORD_01_getKioskCatalog_notFound — ném NOT_FOUND mch.machineNotFound khi serial không tồn tại', async () => {
    await expect(service.getKioskCatalog('UNKNOWN')).rejects.toThrowError(AppError);
    await expect(service.getKioskCatalog('UNKNOWN')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      messageKey: 'mch.machineNotFound',
    });
  });

  it('test_FR_RPT_06_recordKioskInteractions — tiếp nhận và lưu các sự kiện tương tác', async () => {
    const events: KioskInteractionEventInput[] = [
      {
        eventId: 'evt-1',
        eventType: 'PRODUCT_IMPRESSION',
        slotId: 'slot-1',
        kioskSessionId: 'sess-1',
        occurredAt: new Date().toISOString(),
      },
      {
        eventId: 'evt-2',
        eventType: 'PRODUCT_SELECTED',
        slotId: 'slot-1',
        kioskSessionId: 'sess-1',
        occurredAt: new Date().toISOString(),
      },
    ];

    await service.recordKioskInteractions(events);

    expect(queries.recordedEvents).toHaveLength(2);
    expect(queries.recordedEvents[0]!.eventType).toBe('PRODUCT_IMPRESSION');
    expect(queries.recordedEvents[1]!.eventType).toBe('PRODUCT_SELECTED');
  });
});
