/**
 * Sinh `spec/contracts/data-dictionary.md` từ CSDL đã áp migration.
 *
 * Vì sao sinh tự động thay vì viết tay: data dictionary và schema.sql mô tả cùng một thứ. Viết tay
 * hai lần nghĩa là sớm muộn chúng sẽ lệch nhau, và người đọc không có cách nào biết bên nào đúng.
 * Sinh từ CSDL thật (vốn dựng bằng chính migration sinh từ schema.sql) thì lệch là không thể.
 *
 * Phần mô tả từng cột lấy từ `COMMENT ON` trong schema.sql — muốn bổ sung mô tả thì thêm COMMENT
 * ở đó, không sửa file markdown sinh ra.
 *
 *   DATABASE_URL=... npx tsx scripts/gen-data-dictionary.ts
 *
 * Chạy lại sau mỗi migration đổi schema. Lưu ý: data-dictionary.md là contract đóng băng, nên
 * migration đổi schema phải có ADR duyệt trước (spec/contracts/README.md).
 */

import { writeFile } from 'node:fs/promises';
import pg from 'pg';
import 'dotenv/config';

const { Client } = pg;

/** Nhóm bảng theo TableGroup của seed_document/DB_DIAGRAM_MERMAID.md, giữ đúng thứ tự. */
const GROUPS: { title: string; intro: string; tables: string[] }[] = [
  {
    title: 'Identity và Brands',
    intro:
      'Thương hiệu, tài khoản, vai trò và phiên đăng nhập. Vai trò là dữ liệu chứ không phải enum: ' +
      'đổi tập vai trò chỉ cần sửa dữ liệu seed, không cần migration.',
    tables: [
      'brands',
      'users',
      'roles',
      'permissions',
      'user_roles',
      'role_permissions',
      'refresh_sessions',
    ],
  },
  {
    title: 'Catalog và Machines',
    intro:
      'Địa điểm, máy, slot, danh mục sản phẩm và hợp đồng thuê slot. `machines` KHÔNG có `brand_id` ' +
      '— đường duy nhất nối thương hiệu với máy là `slot_rentals` (BR-003, BR-012).',
    tables: [
      'locations',
      'fragrance_products',
      'machines',
      'machine_slots',
      'machine_status_histories',
      'slot_rental_requests',
      'slot_rentals',
    ],
  },
  {
    title: 'Inventory',
    intro:
      'Khai báo gửi hàng, lô nhập, chai, phiên nạp và điều chỉnh tồn kho. `refill_sessions` chính ' +
      'là phiếu nạp của FR-INV-29..31, không phải một bảng riêng.',
    tables: [
      'brand_shipment_declarations',
      'inventory_batches',
      'bottles',
      'refill_sessions',
      'inventory_adjustments',
    ],
  },
  {
    title: 'Orders và Payments',
    intro:
      'Đơn hàng, thanh toán, lệnh xịt và tương tác kiosk. Ba ràng buộc duy nhất ở nhóm này ' +
      '(`uq_payment_event`, `uq_order_active_command`, `dispense_results.command_id`) là toàn bộ cơ ' +
      'chế giữ cho BR-002 "một giao dịch một lượt xịt" đúng.',
    tables: [
      'orders',
      'order_status_histories',
      'payments',
      'payment_events',
      'dispense_commands',
      'dispense_results',
      'kiosk_interaction_events',
    ],
  },
  {
    title: 'Operations',
    intro:
      'Cảnh báo, bảo trì, yêu cầu bổ sung, thông báo và nhật ký kiểm toán. `alerts.brand_id` và ' +
      '`maintenance_tickets.brand_id` gần như luôn NULL — danh sách thương hiệu bị ảnh hưởng suy ra ' +
      'lúc đọc bằng join `slot_rentals` (FR-ALR-09, FR-MNT-07).',
    tables: [
      'alerts',
      'maintenance_tickets',
      'maintenance_activities',
      'refill_requests',
      'notifications',
      'audit_logs',
    ],
  },
  {
    title: 'Device và IoT',
    intro:
      'Thông tin xác thực thiết bị, sự kiện và telemetry. Cấu trúc bản tin trên đường truyền nằm ở ' +
      '`spec/contracts/mqtt.md`.',
    tables: ['device_credentials', 'device_events', 'sensor_readings'],
  },
];

interface ColumnRow {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  description: string | null;
}

interface SimpleRow {
  table_name: string;
  name: string;
  definition: string;
}

interface EnumRow {
  enum_name: string;
  values: string[];
}

async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('Thiếu DATABASE_URL. Sao chép .env.example thành .env trước khi chạy.');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const columns = await client.query<ColumnRow>(`
      SELECT c.relname AS table_name,
             a.attname AS column_name,
             format_type(a.atttypid, a.atttypmod) AS data_type,
             CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable,
             pg_get_expr(d.adbin, d.adrelid) AS column_default,
             col_description(c.oid, a.attnum) AS description
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY c.relname, a.attnum
    `);

    const constraints = await client.query<SimpleRow>(`
      SELECT c.relname AS table_name,
             con.conname AS name,
             pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
      ORDER BY c.relname, con.conname
    `);

    const indexes = await client.query<SimpleRow>(`
      SELECT tablename AS table_name, indexname AS name, indexdef AS definition
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);

    const enums = await client.query<EnumRow>(`
      -- ::text bắt buộc: enumlabel có kiểu "name", driver pg không parse mảng "name[]"
      -- thành JS array mà trả về nguyên chuỗi '{A,B,C}'.
      SELECT t.typname AS enum_name, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS values
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      GROUP BY t.typname
      ORDER BY t.typname
    `);

    const tableComments = await client.query<{ table_name: string; description: string | null }>(`
      SELECT c.relname AS table_name, obj_description(c.oid) AS description
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `);

    const markdown = render(
      columns.rows,
      constraints.rows,
      indexes.rows,
      enums.rows,
      new Map(tableComments.rows.map((r) => [r.table_name, r.description])),
    );

    await writeFile('spec/contracts/data-dictionary.md', markdown, 'utf8');
    console.log('Đã ghi spec/contracts/data-dictionary.md');
  } finally {
    await client.end();
  }
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = map.get(k);
    if (bucket) bucket.push(row);
    else map.set(k, [row]);
  }
  return map;
}

/** Bảng Markdown vỡ nếu ô chứa `|` hoặc xuống dòng. */
function cell(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/\|/g, '\\|')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

function render(
  columns: ColumnRow[],
  constraints: SimpleRow[],
  indexes: SimpleRow[],
  enums: EnumRow[],
  tableComments: Map<string, string | null>,
): string {
  const columnsByTable = groupBy(columns, (r) => r.table_name);
  const constraintsByTable = groupBy(constraints, (r) => r.table_name);
  const indexesByTable = groupBy(indexes, (r) => r.table_name);

  const out: string[] = [];

  out.push('# Từ điển dữ liệu');
  out.push('');
  out.push('> **CONTRACT ĐÓNG BĂNG — SINH TỰ ĐỘNG. Không sửa file này bằng tay.**');
  out.push('>');
  out.push(
    '> Sinh bằng `npx tsx scripts/gen-data-dictionary.ts` từ CSDL đã áp migration. Muốn đổi mô tả ' +
      'một cột: thêm `COMMENT ON` trong `spec/contracts/schema.sql` rồi chạy lại script. Muốn đổi ' +
      'cấu trúc: viết ADR trong `spec/decisions/`, TV1 duyệt (`spec/contracts/README.md`).',
  );
  out.push('');
  out.push(
    'Sơ đồ quan hệ: `spec/contracts/erd.md` · Lược đồ thi hành: `spec/contracts/schema.sql`',
  );
  out.push('');
  out.push('## Quy ước chung');
  out.push('');
  out.push('| | |');
  out.push('|---|---|');
  out.push('| Khóa chính | `uuid`, mặc định `gen_random_uuid()` |');
  out.push('| Thời điểm | `timestamptz`, lưu ở UTC (NFR-DAT-01) |');
  out.push('| Tiền tệ | `numeric(19,4)`, không dùng dấu phẩy động (NFR-DAT-02, ADR-0002) |');
  out.push('| Thể tích | `numeric(14,4)` mililít |');
  out.push('| Loại tiền | `char(3)` mã ISO-4217, mặc định `VND` |');
  out.push('');
  out.push(`Tổng: **${columnsByTable.size} bảng**, **${enums.length} kiểu enum**.`);
  out.push('');
  out.push('---');
  out.push('');

  // Enum
  out.push('## Kiểu enum');
  out.push('');
  out.push('| Kiểu | Giá trị |');
  out.push('|---|---|');
  for (const e of enums) {
    out.push(`| \`${e.enum_name}\` | ${e.values.map((v) => `\`${v}\``).join(' · ')} |`);
  }
  out.push('');
  out.push('---');
  out.push('');

  // Bảng theo nhóm
  const covered = new Set<string>();
  for (const group of GROUPS) {
    out.push(`## Nhóm ${group.title}`);
    out.push('');
    out.push(group.intro);
    out.push('');

    for (const tableName of group.tables) {
      covered.add(tableName);
      const cols = columnsByTable.get(tableName);
      if (!cols) {
        throw new Error(`Bảng ${tableName} có trong nhóm nhưng không có trong CSDL`);
      }
      out.push(...renderTable(tableName, cols, constraintsByTable, indexesByTable, tableComments));
    }
  }

  // Bảng nào chưa được xếp nhóm thì phải lộ ra, không im lặng bỏ qua.
  const orphans = [...columnsByTable.keys()].filter((t) => !covered.has(t) && t !== 'pgmigrations');
  if (orphans.length > 0) {
    out.push('## Bảng chưa xếp nhóm');
    out.push('');
    out.push(
      'Những bảng sau có trong CSDL nhưng chưa được xếp vào nhóm nào trong ' +
        '`scripts/gen-data-dictionary.ts`. Bổ sung vào `GROUPS` rồi sinh lại.',
    );
    out.push('');
    for (const tableName of orphans) {
      out.push(
        ...renderTable(
          tableName,
          columnsByTable.get(tableName) ?? [],
          constraintsByTable,
          indexesByTable,
          tableComments,
        ),
      );
    }
  }

  return out.join('\n') + '\n';
}

function renderTable(
  tableName: string,
  cols: ColumnRow[],
  constraintsByTable: Map<string, SimpleRow[]>,
  indexesByTable: Map<string, SimpleRow[]>,
  tableComments: Map<string, string | null>,
): string[] {
  const out: string[] = [];

  out.push(`### \`${tableName}\``);
  out.push('');

  const tableComment = tableComments.get(tableName);
  if (tableComment) {
    out.push(cell(tableComment));
    out.push('');
  }

  out.push('| Cột | Kiểu | Null | Mặc định | Mô tả |');
  out.push('|---|---|---|---|---|');
  for (const c of cols) {
    const nullable = c.is_nullable === 'YES' ? 'có' : '—';
    const def = c.column_default ? `\`${cell(c.column_default)}\`` : '';
    out.push(
      `| \`${c.column_name}\` | \`${cell(c.data_type)}\` | ${nullable} | ${def} | ${cell(c.description)} |`,
    );
  }
  out.push('');

  const checks = (constraintsByTable.get(tableName) ?? []).filter(
    (c) => c.definition.startsWith('CHECK') || c.definition.startsWith('EXCLUDE'),
  );
  if (checks.length > 0) {
    out.push('**Ràng buộc kiểm tra**');
    out.push('');
    for (const c of checks) {
      out.push(`- \`${c.name}\` — \`${cell(c.definition)}\``);
    }
    out.push('');
  }

  // Khóa ngoại là phần quan trọng nhất của một từ điển dữ liệu — nó cho biết bảng này nối vào
  // đâu. Riêng các FK tên *_same_brand là ràng buộc cùng thương hiệu (schema.sql §10b), chặn ở
  // tầng CSDL việc gán brand_id của thương hiệu này lên bản ghi trỏ tới tài nguyên của thương
  // hiệu khác (BR-012).
  const foreignKeys = (constraintsByTable.get(tableName) ?? []).filter((c) =>
    c.definition.startsWith('FOREIGN KEY'),
  );
  if (foreignKeys.length > 0) {
    out.push('**Khóa ngoại**');
    out.push('');
    for (const fk of foreignKeys) {
      const sameBrand = fk.name.endsWith('_same_brand') ? ' — *ràng buộc cùng thương hiệu*' : '';
      out.push(`- \`${fk.name}\` — \`${cell(fk.definition)}\`${sameBrand}`);
    }
    out.push('');
  }

  const idx = indexesByTable.get(tableName) ?? [];
  if (idx.length > 0) {
    out.push('**Index**');
    out.push('');
    for (const i of idx) {
      // Bỏ phần dài dòng `CREATE [UNIQUE] INDEX <tên> ON public.<bảng>` cho dễ đọc.
      const short = i.definition.replace(/^CREATE (UNIQUE )?INDEX \S+ ON public\.\S+\s*/, '');
      out.push(
        `- \`${i.name}\`${/^CREATE UNIQUE/.test(i.definition) ? ' (UNIQUE)' : ''} — \`${cell(short)}\``,
      );
    }
    out.push('');
  }

  return out;
}

await main();
