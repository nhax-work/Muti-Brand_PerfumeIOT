/**
 * Số tiền bồi thường hàng hóa (FR-SLT-44 AC1, AC3):
 *
 *   min(coverage_percent × giá bán lẻ chai, hạn mức − phần đã bồi thường của hóa đơn)
 *
 * Tính trên chuỗi `numeric` bằng BigInt ở đơn vị phần vạn đồng — không qua số thực, cùng cách
 * `sumMoney` của REV (NFR-DAT-02). Phần tỷ lệ làm tròn nửa lên tới đồng: tiền chuyển khoản không có
 * phần lẻ dưới một đồng.
 */

const SCALE = 4;
const UNIT = 10n ** BigInt(SCALE);

/** `"1200000.5"` → phần vạn đồng. Chỉ nhận chuỗi số không âm như CSDL trả về. */
export function toUnits(value: string): bigint {
  const [whole = '0', frac = ''] = value.trim().split('.');
  return BigInt(whole) * UNIT + BigInt(frac.padEnd(SCALE, '0').slice(0, SCALE));
}

export function fromUnits(units: bigint): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(SCALE + 1, '0');
  return `${negative ? '-' : ''}${digits.slice(0, -SCALE)}.${digits.slice(-SCALE)}`;
}

export interface CompensationInput {
  /** `numeric(5,2)`, ví dụ `"60.00"`. */
  readonly coveragePercent: string;
  readonly retailPrice: string;
  readonly coverageCap: string;
  /** Tổng các khoản đã ghi cho cùng hóa đơn. */
  readonly usedCoverage: string;
}

/**
 * @returns số tiền dạng `numeric(19,4)`; `"0.0000"` khi hạn mức đã hết — người gọi không tạo khoản 0.
 */
export function compensationAmount(input: CompensationInput): string {
  // Tỷ lệ numeric(5,2) đổi ra phần trăm của phần trăm: 60.00% → 6000, tức tỷ lệ = 6000 / 10000.
  const basisPoints = toUnits(input.coveragePercent) / 100n;
  // giá (phần vạn đồng) × basisPoints = số phần vạn đồng × 10000. Chia 10000 × UNIT ra đồng, tròn nửa lên.
  const raw = toUnits(input.retailPrice) * basisPoints;
  const divisor = 10_000n * UNIT;
  const wholeDong = (raw + divisor / 2n) / divisor;
  const covered = wholeDong * UNIT;
  const remaining = toUnits(input.coverageCap) - toUnits(input.usedCoverage);
  const amount = covered < remaining ? covered : remaining;
  return fromUnits(amount > 0n ? amount : 0n);
}
