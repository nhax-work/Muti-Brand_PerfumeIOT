/**
 * Contract test: enum trong openapi.yaml phải trùng từng giá trị với enum trong schema.sql.
 *
 * Đây là chỗ hai contract dễ lệch nhất và lệch âm thầm nhất: thêm một giá trị enum vào CSDL mà
 * quên cập nhật OpenAPI thì không có gì báo lỗi cho tới khi client gặp giá trị lạ lúc chạy thật.
 *
 * Đọc schema.sql bằng regex chứ không nối vào CSDL, để test chạy được trong job `contract` của CI
 * (job đó không dựng Postgres).
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { load as loadYaml } from 'js-yaml';

/** Tên schema trong OpenAPI → tên kiểu enum trong PostgreSQL. */
const ENUM_MAP: Record<string, string> = {
  BrandStatus: 'brand_status',
  UserStatus: 'user_status',
  MachineConnectionStatus: 'machine_connection_status',
  MachineOperatingMode: 'machine_operating_mode',
  SlotStatus: 'slot_status',
  BottleStatus: 'bottle_status',
  RefillStatus: 'refill_status',
  OrderStatus: 'order_status',
  PaymentStatus: 'payment_status',
  CommandStatus: 'command_status',
  DispenseType: 'dispense_type',
  AlertSeverity: 'alert_severity',
  AlertStatus: 'alert_status',
  TicketStatus: 'ticket_status',
  TicketPriority: 'ticket_priority',
  NotificationStatus: 'notification_status',
  SlotRentalStatus: 'slot_rental_status',
  RevenueOwner: 'revenue_owner_type',
  KioskInteractionType: 'kiosk_interaction_type',
  RefillRequestStatus: 'refill_request_status',
  RefillRequestReason: 'refill_request_reason',
  SlotRentalRequestStatus: 'slot_rental_request_status',
  ShipmentDeclarationStatus: 'shipment_declaration_status',
  CredentialStatus: 'credential_status',
};

interface OpenApiDoc {
  components: { schemas: Record<string, { enum?: string[] }> };
}

function parseSqlEnums(sql: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const pattern = /CREATE TYPE\s+(\w+)\s+AS ENUM\s*\(([^)]*)\)/gis;
  for (const match of sql.matchAll(pattern)) {
    const name = match[1];
    const body = match[2];
    if (!name || !body) continue;
    const values = [...body.matchAll(/'([^']+)'/g)]
      .map((m) => m[1])
      .filter((v): v is string => v !== undefined);
    result.set(name, values);
  }
  return result;
}

const sqlEnums = parseSqlEnums(readFileSync('spec/contracts/schema.sql', 'utf8'));
const openapi = loadYaml(readFileSync('spec/contracts/openapi.yaml', 'utf8')) as OpenApiDoc;

describe('openapi.yaml khớp schema.sql', () => {
  it('schema.sql khai báo đủ 24 enum', () => {
    expect(sqlEnums.size).toBe(24);
  });

  it('mọi enum trong schema.sql đều có schema tương ứng trong openapi.yaml', () => {
    const mapped = new Set(Object.values(ENUM_MAP));
    const missing = [...sqlEnums.keys()].filter((name) => !mapped.has(name));
    expect(missing).toEqual([]);
  });

  it.each(Object.entries(ENUM_MAP))(
    'enum %s trùng giá trị và thứ tự với kiểu %s',
    (schemaName, sqlTypeName) => {
      const fromOpenApi = openapi.components.schemas[schemaName]?.enum;
      const fromSql = sqlEnums.get(sqlTypeName);

      expect(fromOpenApi, `openapi.yaml thiếu schema ${schemaName}`).toBeDefined();
      expect(fromSql, `schema.sql thiếu kiểu ${sqlTypeName}`).toBeDefined();
      expect(fromOpenApi).toEqual(fromSql);
    },
  );
});

describe('mã lỗi trong openapi.yaml nằm trong spec/errors.md', () => {
  // spec/errors.md là nguồn duy nhất; agent không được tự đặt mã mới (spec/PROJECT.md §3).
  const registry = new Set(
    [...readFileSync('spec/errors.md', 'utf8').matchAll(/\|\s*`([A-Z][A-Z0-9_]+)`\s*\|/g)]
      .map((m) => m[1])
      .filter((v): v is string => v !== undefined),
  );

  it('spec/errors.md đọc được và không rỗng', () => {
    expect(registry.size).toBeGreaterThan(20);
  });

  it('mọi mã lỗi xuất hiện trong ví dụ của openapi.yaml đều có trong registry', () => {
    const spec = readFileSync('spec/contracts/openapi.yaml', 'utf8');
    const used = new Set(
      [...spec.matchAll(/\bcode:\s*([A-Z][A-Z0-9_]{3,})\b/g)]
        .map((m) => m[1])
        .filter((v): v is string => v !== undefined),
    );
    const unknown = [...used].filter((code) => !registry.has(code));
    expect(unknown, `Mã lỗi không có trong spec/errors.md: ${unknown.join(', ')}`).toEqual([]);
  });
});
