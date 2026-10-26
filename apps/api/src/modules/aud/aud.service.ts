/**
 * Truy vết đầu-cuối một đơn hàng (FR-AUD-11, BR-008): đơn → thanh toán → lệnh xịt → kết quả thiết bị
 * → thay đổi tồn kho → hóa đơn thuê → nhật ký. Phục vụ khiếu nại của khách và tranh chấp với thương
 * hiệu, nên chỉ tài khoản có `audit.read` (Super Admin) — kiểm ở controller.
 *
 * Đơn và hóa đơn lấy qua service của ORD và SLT (QT3) để DTO trùng đúng `GET /orders/{id}` và
 * `GET /slot-rentals/{id}`; phần còn lại là truy vấn chỉ đọc của module này.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import type { BrandScope } from '../../shared/scoping/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import { OrdService } from '../ord/index.js';
import { SltService } from '../slt/index.js';
import { AudQueries } from './aud.queries.js';

export type OrderTrace = Schema<'OrderTrace'>;

/** Truy vết là việc của nền tảng — thấy mọi thương hiệu (FR-BND-07). */
const PLATFORM: BrandScope = { kind: 'UNRESTRICTED' };

@Injectable()
export class AudService {
  constructor(
    @Inject(AudQueries) private readonly queries: AudQueries,
    @Inject(OrdService) private readonly orders: OrdService,
    @Inject(SltService) private readonly rentals: SltService,
  ) {}

  async orderTrace(actor: AuthenticatedUser, orderId: string): Promise<OrderTrace> {
    // Không có đơn → NOT_FOUND từ ORD (notFoundFor).
    const order = await this.orders.get(actor, PLATFORM, orderId);
    const [slotRental, statusHistory, payments, dispenseCommands, inventoryAdjustments] =
      await Promise.all([
        this.rentals.get(actor, PLATFORM, order.slotRentalId),
        this.queries.statusHistory(order.id),
        this.queries.payments(order.id),
        this.queries.dispenseCommands(order.id),
        this.queries.inventoryAdjustments({
          id: order.id,
          slotId: order.slotId,
          createdAt: new Date(order.createdAt),
        }),
      ]);
    const auditLogs = await this.queries.auditLogs([
      order.id,
      ...payments.map((p) => p.id),
      ...dispenseCommands.map((c) => c.id),
    ]);
    return {
      order,
      slotRental,
      statusHistory,
      payments,
      dispenseCommands,
      inventoryAdjustments,
      auditLogs,
    };
  }
}
