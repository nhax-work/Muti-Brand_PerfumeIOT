/**
 * Unit test cho chốt chặn cô lập dữ liệu (`apps/api/src/shared/scoping`, QT4 của ADR-0003).
 *
 * CỐ Ý KHÔNG đặt tên theo `test_FR_AUTH_07_*` hay `test_FR_AUTH_08_*`.
 *
 * Hai FR đó được nghiệm thu bằng `tests/integration/test_slot_isolation.py` — một trong 7 nhóm
 * test người tự viết (`spec/testing.md`), chạy trên CSDL thật với hai thương hiệu cùng một máy.
 * Nếu đặt tên theo mã FR ở đây, `check_traceability.py` sẽ báo FR-AUTH-07/08 "đã có test" và che
 * mất việc test tích hợp thật sự chưa được viết. Test dưới đây chỉ kiểm logic thuần của chốt chặn,
 * không chứng minh được endpoint nào cô lập đúng.
 */

import { describe, expect, it } from 'vitest';
import {
  brandOccupiesSlotNow,
  brandScopedByColumn,
  brandScopedBySlotAndTime,
  brandScopedOrders,
  resolveBrandScope,
  type BrandScope,
} from '../../apps/api/src/shared/scoping/brand-scope.js';
import type { Principal } from '../../apps/api/src/shared/scoping/principal.js';

const BRAND_A = '11111111-1111-4111-8111-000000000001';

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    userId: '33333333-3333-4333-8333-000000000001',
    brandId: null,
    roles: ['PLATFORM_SUPER_ADMIN'],
    permissions: new Set<string>(),
    permissionVersion: 1,
    scope: { type: 'PLATFORM' },
    ...overrides,
  };
}

/** Kysely dựng cây biểu thức; lấy SQL thô ra để khẳng định nội dung điều kiện. */
function sqlOf(expression: { toOperationNode(): unknown }): string {
  return JSON.stringify(expression.toOperationNode());
}

describe('resolveBrandScope', () => {
  it('tài khoản mức nền tảng (brandId null) không bị giới hạn phạm vi', () => {
    const scope = resolveBrandScope(principal({ brandId: null }));
    expect(scope).toEqual({ kind: 'UNRESTRICTED' });
  });

  it('tài khoản gắn thương hiệu bị giới hạn theo đúng thương hiệu đó', () => {
    const scope = resolveBrandScope(principal({ brandId: BRAND_A, roles: ['BRAND_ADMIN'] }));
    expect(scope).toEqual({ kind: 'BRAND', brandId: BRAND_A });
  });

  it('quyết định theo brandId chứ không theo vai trò', () => {
    // Một tài khoản có thể mang nhiều vai trò; chỉ việc gắn thương hiệu mới giới hạn phạm vi
    // (FR-AUTH-05). Vai trò nền tảng nhưng có brandId vẫn phải bị giới hạn.
    const scope = resolveBrandScope(
      principal({ brandId: BRAND_A, roles: ['OPERATIONS_STAFF', 'BRAND_ADMIN'] }),
    );
    expect(scope).toEqual({ kind: 'BRAND', brandId: BRAND_A });
  });
});

describe('điều kiện lọc cho tài khoản nền tảng', () => {
  const unrestricted: BrandScope = { kind: 'UNRESTRICTED' };

  it('mọi hàm đều trả điều kiện luôn đúng, không chèn tham số thương hiệu', () => {
    for (const expression of [
      brandScopedByColumn(unrestricted, 'p.brand_id'),
      brandScopedOrders(unrestricted),
      brandScopedBySlotAndTime(unrestricted, 'sr.slot_id', 'sr.measured_at'),
      brandOccupiesSlotNow(unrestricted, 'ms.id'),
    ]) {
      expect(sqlOf(expression)).not.toContain(BRAND_A);
    }
  });
});

describe('điều kiện lọc cho tài khoản thuộc thương hiệu', () => {
  const scoped: BrandScope = { kind: 'BRAND', brandId: BRAND_A };

  it('brandScopedOrders luôn kèm revenue_owner = BRAND', () => {
    // Đây là chỗ rò rỉ im lặng nếu quên: đơn sau thanh lý vẫn mang brand_id của thương hiệu cũ
    // nhưng doanh thu thuộc nền tảng (FR-EXP-20, FR-REV-06).
    const raw = sqlOf(brandScopedOrders(scoped));
    expect(raw).toContain('revenue_owner');
    expect(raw).toContain('BRAND');
    expect(raw).toContain(BRAND_A);
  });

  it('brandScopedBySlotAndTime nối qua slot_rentals và chặn theo kỳ hạn hợp đồng', () => {
    // FR-AUTH-07 AC3: cùng một slot phục vụ nhiều thương hiệu ở các kỳ hạn khác nhau, nên phải
    // so mốc thời gian của bản ghi với kỳ hạn, không chỉ so slot.
    const raw = sqlOf(brandScopedBySlotAndTime(scoped, 'sr.slot_id', 'sr.measured_at'));
    expect(raw).toContain('slot_rentals');
    expect(raw).toContain('starts_at');
    expect(raw).toContain('grace_ends_at');
    expect(raw).toContain(BRAND_A);
  });

  it('không hàm nào lọc qua bảng machines', () => {
    // machines KHÔNG có cột brand_id — một máy chứa slot của nhiều thương hiệu (BR-003, BR-012).
    for (const expression of [
      brandScopedByColumn(scoped, 'p.brand_id'),
      brandScopedOrders(scoped),
      brandScopedBySlotAndTime(scoped, 'sr.slot_id', 'sr.measured_at'),
      brandOccupiesSlotNow(scoped, 'ms.id'),
    ]) {
      expect(sqlOf(expression)).not.toContain('machines');
    }
  });

  it('brandOccupiesSlotNow chỉ xét trạng thái đang chiếm dụng slot', () => {
    const raw = sqlOf(brandOccupiesSlotNow(scoped, 'ms.id'));
    for (const status of ['ACTIVE', 'EXPIRING', 'GRACE', 'LIQUIDATED']) {
      expect(raw).toContain(status);
    }
    // DRAFT/RENEWED/CLOSED/TERMINATED không chiếm dụng slot (spec/glossary.md)
    expect(raw).not.toContain('TERMINATED');
  });
});
