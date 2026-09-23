/**
 * RÀNG BUỘC CSDL — test nghiệm thu, chạy thẳng vào Postgres, KHÔNG qua API.
 *
 * Vì sao không qua API: `spec/PROJECT.md` Mục 5 (Review Agent) và `spec/modules/SLT.md` FR-SLT-02
 * đòi bất biến "một hợp đồng hiệu lực mỗi slot" phải được cưỡng chế bằng partial unique index ở
 * tầng CSDL, **không** bằng kiểm tra ở tầng ứng dụng (NFR-DAT-07). Gọi qua API thì một câu `if`
 * trong service cũng làm test xanh, và bất biến vẫn thủng khi có hai request đồng thời.
 *
 * Vì thế mọi khẳng định ở đây soi **mã lỗi Postgres kèm tên ràng buộc**: xóa index đi mà service
 * vẫn chặn thì test phải đỏ.
 *
 * Mỗi test tự dựng dữ liệu tối thiểu trong một transaction rồi ROLLBACK — không để lại gì, không
 * cần dọn, và không phụ thuộc thứ tự chạy.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openRawClient } from './helpers/db.js';

let client: pg.Client;

beforeAll(async () => {
  client = await openRawClient();
});

afterAll(async () => {
  await client?.end();
});

/** Lỗi Postgres mà `pg` ném ra, thu gọn còn đúng phần test cần khẳng định. */
interface PgFailure {
  readonly code: string;
  readonly constraint: string | undefined;
  readonly message: string;
}

/**
 * Chạy `run` và đợi nó hỏng.
 *
 * Bọc trong SAVEPOINT vì Postgres hủy toàn bộ transaction sau một câu lệnh lỗi — không có điểm
 * lưu thì mọi khẳng định tiếp theo (ví dụ "slot vẫn còn nguyên") đều chết vì
 * "current transaction is aborted" chứ không phải vì ràng buộc sai.
 */
async function expectFailure(run: () => Promise<unknown>): Promise<PgFailure> {
  const savepoint = `sp_${randomUUID().replace(/-/g, '')}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    await run();
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    const e = error as { code?: string; constraint?: string; message?: string };
    return { code: e.code ?? '', constraint: e.constraint, message: e.message ?? '' };
  }
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  throw new Error('Mong đợi CSDL từ chối, nhưng câu lệnh chạy thành công');
}

interface Scenario {
  readonly brandId: string;
  readonly otherBrandId: string;
  readonly userId: string;
  readonly machineId: string;
  readonly slotId: string;
  readonly productId: string;
  readonly rentalId: string;
}

/**
 * Dựng một slot có sẵn một hợp đồng ACTIVE — bối cảnh chung của gần hết các test dưới đây.
 * Chạy trong transaction đang mở của lời gọi; người gọi chịu trách nhiệm ROLLBACK.
 */
async function givenSlotWithActiveRental(c: pg.Client): Promise<Scenario> {
  const tag = randomUUID().slice(0, 8);
  const brandId = randomUUID();
  const otherBrandId = randomUUID();
  const userId = randomUUID();
  const locationId = randomUUID();
  const machineId = randomUUID();
  const slotId = randomUUID();
  const productId = randomUUID();
  const rentalId = randomUUID();

  await c.query(
    `INSERT INTO brands (id, code, name, status)
     VALUES ($1, $2, 'Thuong hieu rang buoc', 'ACTIVE'), ($3, $4, 'Thuong hieu khac', 'ACTIVE')`,
    [brandId, `CST_${tag}`, otherBrandId, `CST_OTHER_${tag}`],
  );
  await c.query(
    `INSERT INTO users (id, brand_id, email, password_hash, full_name, status)
     VALUES ($1, NULL, $2, 'khong-phai-bam-that', 'Nguoi tao', 'ACTIVE')`,
    [userId, `constraint.${tag}@test.local`],
  );
  await c.query(
    `INSERT INTO locations (id, code, name, status) VALUES ($1, $2, 'Dia diem', 'ACTIVE')`,
    [locationId, `CST_LOC_${tag}`],
  );
  await c.query(
    `INSERT INTO machines (id, location_id, serial_number, display_name)
     VALUES ($1, $2, $3, 'May rang buoc')`,
    [machineId, locationId, `CST-${tag}`],
  );
  await c.query(
    `INSERT INTO machine_slots (id, machine_id, slot_number, status)
     VALUES ($1, $2, 1, 'AVAILABLE')`,
    [slotId, machineId],
  );
  await c.query(
    `INSERT INTO fragrance_products (id, brand_id, sku, name, default_price, currency, status)
     VALUES ($1, $2, $3, 'San pham', '35000.0000', 'VND', 'ACTIVE')`,
    [productId, brandId, `CST-SKU-${tag}`],
  );
  await c.query(
    `INSERT INTO slot_rentals (id, slot_id, brand_id, fragrance_product_id, product_assigned_at,
                               status, starts_at, ends_at, price_per_spray, currency, created_by)
     VALUES ($1, $2, $3, $4, now(), 'ACTIVE',
             now() - interval '30 days', now() + interval '335 days', '35000.0000', 'VND', $5)`,
    [rentalId, slotId, brandId, productId, userId],
  );

  return { brandId, otherBrandId, userId, machineId, slotId, productId, rentalId };
}

async function insertRental(
  c: pg.Client,
  s: Scenario,
  opts: { status: string; startsAt: string; endsAt: string; brandId?: string },
): Promise<void> {
  await c.query(
    `INSERT INTO slot_rentals (id, slot_id, brand_id, fragrance_product_id, product_assigned_at,
                               status, starts_at, ends_at, price_per_spray, currency, created_by)
     VALUES ($1, $2, $3, $4, now(), $5, ${opts.startsAt}, ${opts.endsAt}, '35000.0000', 'VND', $6)`,
    [randomUUID(), s.slotId, opts.brandId ?? s.brandId, s.productId, opts.status, s.userId],
  );
}

/** Chạy `body` trong một transaction rồi ROLLBACK, dù kết quả thế nào. */
async function inRolledBackTransaction(body: (s: Scenario) => Promise<void>): Promise<void> {
  await client.query('BEGIN');
  try {
    const scenario = await givenSlotWithActiveRental(client);
    await body(scenario);
  } finally {
    await client.query('ROLLBACK');
  }
}

// ===========================================================================================
// 1. Hai hợp đồng hiệu lực trên cùng một slot
// ===========================================================================================

describe('một hợp đồng hiệu lực trên mỗi slot', () => {
  /**
   * FR-SLT-02 AC1 + AC4: hợp đồng ACTIVE thứ hai trên cùng slot bị chặn — và bị chặn bởi
   * `uq_slot_active_rental`, tức bởi CSDL, nên hai request đồng thời cũng chỉ một cái qua.
   */
  it('test_FR_SLT_02_reject_occupied_slot', async () => {
    await inRolledBackTransaction(async (s) => {
      // Kỳ hạn tách hẳn khỏi hợp đồng đang chạy để CÔ LẬP đúng `uq_slot_active_rental`. Dùng cùng kỳ
      // hạn thì `excl_slot_rental_overlap` cũng bị vi phạm, mà Postgres không bảo đảm cái nào báo
      // trước — khẳng định sẽ phụ thuộc vào thứ tự tạo chỉ mục chứ không vào bất biến.
      const failure = await expectFailure(() =>
        insertRental(client, s, {
          status: 'ACTIVE',
          startsAt: `now() + interval '400 days'`,
          endsAt: `now() + interval '500 days'`,
        }),
      );

      expect(failure.code).toBe('23505'); // unique_violation
      expect(failure.constraint).toBe('uq_slot_active_rental');
    });
  });

  /**
   * Cùng AC1 nhưng ở ca thực tế nhất: trùng luôn kỳ hạn. Lúc này hai ràng buộc cùng bị vi phạm nên
   * chỉ đòi đúng một điều: CSDL từ chối, và từ chối bằng một trong hai ràng buộc có tên — không
   * phải bằng một lỗi nào khác.
   */
  it('test_FR_SLT_02_reject_occupied_slot_same_period', async () => {
    await inRolledBackTransaction(async (s) => {
      const failure = await expectFailure(() =>
        insertRental(client, s, {
          status: 'ACTIVE',
          startsAt: `now() - interval '30 days'`,
          endsAt: `now() + interval '335 days'`,
        }),
      );

      expect(['23505', '23P01']).toContain(failure.code);
      expect(['uq_slot_active_rental', 'excl_slot_rental_overlap']).toContain(failure.constraint);
    });
  });

  /**
   * FR-SLT-02: index phủ CẢ BỐN trạng thái chiếm dụng, không riêng ACTIVE. Thiếu LIQUIDATED là
   * slot đang bán hàng thanh lý vẫn cho thuê chồng lên (FR-EXP-17).
   */
  it('test_FR_SLT_02_all_occupying_statuses_block_a_new_rental', async () => {
    for (const status of ['ACTIVE', 'EXPIRING', 'GRACE', 'LIQUIDATED']) {
      await inRolledBackTransaction(async (s) => {
        const failure = await expectFailure(() =>
          insertRental(client, s, {
            status,
            // Kỳ hạn tách rời hẳn để chắc chắn thứ chặn là unique index, không phải ràng buộc
            // chống chồng lấn thời gian ở test dưới.
            startsAt: `now() + interval '400 days'`,
            endsAt: `now() + interval '500 days'`,
          }),
        );
        expect(failure.constraint, `trạng thái ${status} phải bị chặn`).toBe(
          'uq_slot_active_rental',
        );
      });
    }
  });

  /** FR-SLT-02 AC3: hợp đồng cũ đã CLOSED/TERMINATED thì slot cho thuê lại được. */
  it('test_FR_SLT_02_closed_rental_frees_the_slot', async () => {
    for (const closedStatus of ['CLOSED', 'TERMINATED']) {
      await inRolledBackTransaction(async (s) => {
        await client.query(`UPDATE slot_rentals SET status = $1 WHERE id = $2`, [
          closedStatus,
          s.rentalId,
        ]);

        await insertRental(client, s, {
          status: 'ACTIVE',
          startsAt: `now() + interval '400 days'`,
          endsAt: `now() + interval '500 days'`,
        });

        const rows = await client.query<{ count: string }>(
          `SELECT count(*) AS count FROM slot_rentals
            WHERE slot_id = $1 AND status = 'ACTIVE'`,
          [s.slotId],
        );
        expect(rows.rows[0]?.count).toBe('1');
      });
    }
  });

  /**
   * Chống chồng lấn kỳ hạn, kể cả với hợp đồng DRAFT chưa hiệu lực — `excl_slot_rental_overlap`.
   * Đây là ràng buộc RIÊNG, không phải unique index ở trên: đặt chỗ trước cho hai thương hiệu vào
   * cùng một khoảng thời gian phải hỏng ngay lúc ghi.
   */
  it('test_FR_SLT_02_overlapping_draft_rentals_rejected', async () => {
    await inRolledBackTransaction(async (s) => {
      await insertRental(client, s, {
        status: 'DRAFT',
        startsAt: `now() + interval '400 days'`,
        endsAt: `now() + interval '500 days'`,
      });

      const failure = await expectFailure(() =>
        insertRental(client, s, {
          status: 'DRAFT',
          startsAt: `now() + interval '450 days'`,
          endsAt: `now() + interval '550 days'`,
          brandId: s.otherBrandId,
        }),
      );
      expect(failure.code).toBe('23P01'); // exclusion_violation
      expect(failure.constraint).toBe('excl_slot_rental_overlap');
    });
  });

  /** Đối chứng: hai DRAFT KHÔNG chồng kỳ hạn là hợp lệ — đặt chỗ nối tiếp nhau vẫn phải làm được. */
  it('test_FR_SLT_02_non_overlapping_draft_rentals_allowed', async () => {
    await inRolledBackTransaction(async (s) => {
      await insertRental(client, s, {
        status: 'DRAFT',
        startsAt: `now() + interval '400 days'`,
        endsAt: `now() + interval '500 days'`,
      });
      await insertRental(client, s, {
        status: 'DRAFT',
        startsAt: `now() + interval '500 days'`,
        endsAt: `now() + interval '600 days'`,
      });

      const rows = await client.query<{ count: string }>(
        `SELECT count(*) AS count FROM slot_rentals WHERE slot_id = $1 AND status = 'DRAFT'`,
        [s.slotId],
      );
      expect(rows.rows[0]?.count).toBe('2');
    });
  });
});

// ===========================================================================================
// 2. Đơn hàng thiếu revenue_owner
// ===========================================================================================

describe('chủ sở hữu doanh thu của đơn hàng', () => {
  const insertOrder = async (s: Scenario, revenueOwnerSql: string, tag: string): Promise<void> => {
    await client.query(
      `INSERT INTO orders (id, brand_id, slot_rental_id, revenue_owner, machine_id, slot_id,
                           fragrance_product_id, product_name_snapshot, amount, currency, status,
                           payment_reference, idempotency_key, expires_at)
       VALUES ($1, $2, $3, ${revenueOwnerSql}, $4, $5, $6, 'San pham', '35000.0000', 'VND',
               'CREATED', $7, $8, now() + interval '15 minutes')`,
      [
        randomUUID(),
        s.brandId,
        s.rentalId,
        s.machineId,
        s.slotId,
        s.productId,
        `PAY-${tag}`,
        `IDEM-${tag}`,
      ],
    );
  };

  /**
   * FR-REV-01: mỗi đơn PHẢI có chủ sở hữu doanh thu tại thời điểm tạo.
   *
   * Cột cố ý KHÔNG có DEFAULT: có mặc định thì một luồng quên gán sẽ lặng lẽ ghi 'BRAND', và đơn
   * sau thanh lý sẽ lọt về màn hình của thương hiệu cũ (FR-REV-06, FR-EXP-20). Vắng mặt phải là
   * lỗi ồn ào ở CSDL.
   */
  it('test_FR_REV_01_order_requires_revenue_owner', async () => {
    await inRolledBackTransaction(async (s) => {
      const failure = await expectFailure(() => insertOrder(s, 'DEFAULT', 'no-owner'));

      expect(failure.code).toBe('23502'); // not_null_violation
      expect(failure.message).toContain('revenue_owner');
    });
  });

  /** FR-REV-01: miền giá trị đóng — chỉ BRAND hoặc PLATFORM, cưỡng chế bằng kiểu enum. */
  it('test_FR_REV_01_revenue_owner_rejects_value_outside_enum', async () => {
    await inRolledBackTransaction(async (s) => {
      const failure = await expectFailure(() => insertOrder(s, `'AFFILIATE'`, 'bad-owner'));

      expect(failure.code).toBe('22P02'); // invalid_text_representation
      expect(failure.message).toContain('revenue_owner_type');
    });
  });

  /**
   * FR-REV-01 / BR-012: đơn không thể trỏ tới hợp đồng của thương hiệu khác.
   * `fk_order_rental_same_brand` nối (slot_rental_id, brand_id) nên cặp lệch nhau bị chặn — một
   * đơn "gán nhầm thương hiệu" là rò rỉ doanh thu, không chỉ là dữ liệu bẩn.
   */
  it('test_FR_REV_01_order_brand_must_match_its_rental', async () => {
    await inRolledBackTransaction(async (s) => {
      const failure = await expectFailure(() =>
        client.query(
          `INSERT INTO orders (id, brand_id, slot_rental_id, revenue_owner, machine_id, slot_id,
                               fragrance_product_id, product_name_snapshot, amount, currency,
                               status, payment_reference, idempotency_key, expires_at)
           VALUES ($1, $2, $3, 'BRAND', $4, $5, $6, 'San pham', '35000.0000', 'VND',
                   'CREATED', $7, $8, now() + interval '15 minutes')`,
          [
            randomUUID(),
            s.otherBrandId, // thương hiệu khác với chủ hợp đồng
            s.rentalId,
            s.machineId,
            s.slotId,
            s.productId,
            `PAY-mismatch-${s.slotId.slice(0, 8)}`,
            `IDEM-mismatch-${s.slotId.slice(0, 8)}`,
          ],
        ),
      );

      expect(failure.code).toBe('23503'); // foreign_key_violation
      expect(failure.constraint).toBe('fk_order_rental_same_brand');
    });
  });
});

// ===========================================================================================
// 3. Xóa slot đang có hợp đồng
// ===========================================================================================

describe('xóa slot đang có hợp đồng', () => {
  /**
   * Toàn vẹn tham chiếu: slot đang được hợp đồng trỏ tới thì không xóa cứng được.
   * Ứng dụng chỉ xóa mềm (SLOT_OCCUPIED, 409) — nhưng một script chạy tay hay một migration cẩu
   * thả thì không đi qua ứng dụng, nên ràng buộc phải nằm ở CSDL.
   */
  it('test_FR_SLT_02_slot_delete_blocked_by_active_rental', async () => {
    await inRolledBackTransaction(async (s) => {
      const failure = await expectFailure(() =>
        client.query(`DELETE FROM machine_slots WHERE id = $1`, [s.slotId]),
      );

      expect(failure.code).toBe('23503'); // foreign_key_violation
      expect(failure.message).toContain('slot_rentals');

      // Slot vẫn còn nguyên: lệnh xóa bị chặn chứ không xóa một phần.
      const rows = await client.query<{ count: string }>(
        `SELECT count(*) AS count FROM machine_slots WHERE id = $1`,
        [s.slotId],
      );
      expect(rows.rows[0]?.count).toBe('1');
    });
  });

  /**
   * Chặn phải là NO ACTION/RESTRICT, TUYỆT ĐỐI không phải CASCADE.
   *
   * Nếu ai đó "sửa cho tiện" thành ON DELETE CASCADE thì test ở trên vẫn xanh theo kiểu khác: lệnh
   * xóa thành công và kéo theo cả hợp đồng lẫn đơn hàng. Vì thế soi thẳng `pg_constraint`:
   * `confdeltype = 'a'` là NO ACTION, `'r'` là RESTRICT; `'c'` là CASCADE và phải đỏ.
   */
  it('test_FR_SLT_02_no_foreign_key_cascades_from_slot', async () => {
    const rows = await client.query<{ conname: string; confdeltype: string }>(
      `SELECT c.conname, c.confdeltype
         FROM pg_constraint c
         JOIN pg_class child  ON child.oid  = c.conrelid
         JOIN pg_class parent ON parent.oid = c.confrelid
        WHERE c.contype = 'f' AND parent.relname = 'machine_slots'`,
    );

    expect(rows.rowCount).toBeGreaterThan(0);
    const cascading = rows.rows.filter((r) => r.confdeltype !== 'a' && r.confdeltype !== 'r');
    expect(cascading.map((r) => r.conname)).toEqual([]);
  });
});
