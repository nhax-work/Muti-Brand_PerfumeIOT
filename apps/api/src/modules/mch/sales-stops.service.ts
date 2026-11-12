/**
 * Máy đang dừng nhận đơn (ADR-0028) — cho banner đầu trang của web quản trị.
 *
 * Lý do tính bằng `salesStopReason` của ORD, đúng hàm kiosk dùng khi tạo đơn: banner báo "dừng bán"
 * khi và chỉ khi kiosk thật sự từ chối đơn. SQL chỉ lọc sơ bộ những máy có thể đang dừng và lấy mốc
 * thời gian; quyết định cuối nằm ở hàm dùng chung.
 *
 * Phạm vi: tài khoản nền tảng thấy mọi máy kèm phiếu nạp đang mở (ai mở, slot nào, từ lúc nào);
 * Brand Admin chỉ thấy máy có slot mình đang khai thác (BR-012) và lý do chung — người mở phiếu là
 * thông tin nội bộ của nền tảng.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { sql } from 'kysely';
import { DATABASE, type Database } from '../../shared/db/index.js';
import type {
  MachineConnectionStatus,
  MachineOperatingMode,
} from '../../shared/db/types.generated.js';
import { brandHoldsSlotNow, type BrandScope } from '../../shared/scoping/index.js';
import { openRefillSessionOn, salesStopReason } from '../ord/index.js';

export type MachineSalesStop = Schema<'MachineSalesStop'>;

interface Row {
  readonly machine_id: string;
  readonly machine_name: string;
  readonly serial_number: string;
  readonly location_name: string;
  readonly status: MachineConnectionStatus;
  readonly operating_mode: MachineOperatingMode;
  readonly last_seen_at: Date | null;
  readonly mode_since: Date | null;
  readonly has_open_refill_session: boolean;
  readonly refill_session_id: string | null;
  readonly refill_slot_number: number | null;
  readonly refill_performed_by: string | null;
  readonly refill_started_at: Date | null;
}

@Injectable()
export class SalesStopsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(scope: BrandScope): Promise<MachineSalesStop[]> {
    const holdsSlot =
      scope.kind === 'UNRESTRICTED'
        ? sql`true`
        : sql`EXISTS (SELECT 1 FROM machine_slots hs
                       WHERE hs.machine_id = m.id AND ${brandHoldsSlotNow(scope, 'hs.id')})`;
    const { rows } = await sql<Row>`
      SELECT m.id             AS machine_id,
             m.display_name   AS machine_name,
             m.serial_number,
             l.name           AS location_name,
             m.status,
             m.operating_mode,
             m.last_seen_at,
             (SELECT max(h.occurred_at) FROM machine_status_histories h
               WHERE h.machine_id = m.id AND h.to_operating_mode = m.operating_mode) AS mode_since,
             ${openRefillSessionOn('m.id')} AS has_open_refill_session,
             rs.id            AS refill_session_id,
             ms.slot_number   AS refill_slot_number,
             u.full_name      AS refill_performed_by,
             rs.started_at    AS refill_started_at
        FROM machines m
        JOIN locations l ON l.id = m.location_id
        LEFT JOIN LATERAL (
          SELECT r.id, r.slot_id, r.performed_by, r.started_at FROM refill_sessions r
           WHERE r.machine_id = m.id AND r.status = 'STARTED'
           ORDER BY r.started_at
           LIMIT 1
        ) rs ON true
        LEFT JOIN machine_slots ms ON ms.id = rs.slot_id
        LEFT JOIN users u ON u.id = rs.performed_by
       WHERE (m.status <> 'ONLINE' OR m.operating_mode <> 'NORMAL' OR rs.id IS NOT NULL)
         AND ${holdsSlot}
       ORDER BY m.display_name`.execute(this.db);

    const items: MachineSalesStop[] = [];
    for (const r of rows) {
      const reason = salesStopReason({
        status: r.status,
        operatingMode: r.operating_mode,
        hasOpenRefillSession: r.has_open_refill_session,
      });
      if (reason === null) continue;
      const since =
        reason === 'OFFLINE'
          ? r.last_seen_at
          : reason === 'REFILL_SESSION'
            ? r.refill_started_at
            : r.mode_since;
      items.push({
        machineId: r.machine_id,
        machineName: r.machine_name,
        serialNumber: r.serial_number,
        locationName: r.location_name,
        reason,
        since: since?.toISOString() ?? null,
        ...(scope.kind === 'UNRESTRICTED' && r.refill_session_id !== null
          ? {
              refillSession: {
                id: r.refill_session_id,
                slotNumber: r.refill_slot_number ?? 0,
                performedByName: r.refill_performed_by ?? '',
                startedAt: r.refill_started_at!.toISOString(),
              },
            }
          : {}),
      });
    }
    return items;
  }
}
