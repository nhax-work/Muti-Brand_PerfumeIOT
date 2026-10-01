/**
 * Dịch vụ nghiệp vụ module ORD (Kiosk Catalog & Interactions).
 */

import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../shared/errors/index.js';
import { OrdQueries, type KioskCatalog, type KioskInteractionEventInput } from './ord.queries.js';

@Injectable()
export class OrdService {
  constructor(@Inject(OrdQueries) private readonly ordQueries: OrdQueries) {}

  /**
   * Lấy danh mục hiển thị cho Kiosk theo serial máy (FR-ORD-01, FR-ORD-02).
   */
  async getKioskCatalog(serialNumber: string): Promise<KioskCatalog> {
    const catalog = await this.ordQueries.getKioskCatalog(serialNumber);
    if (!catalog) {
      throw new AppError('NOT_FOUND', 'mch.machineNotFound');
    }
    return catalog;
  }

  /**
   * Ghi nhận tương tác kiosk (FR-RPT-06).
   */
  async recordKioskInteractions(events: KioskInteractionEventInput[]): Promise<void> {
    await this.ordQueries.recordKioskInteractions(events);
  }
}
