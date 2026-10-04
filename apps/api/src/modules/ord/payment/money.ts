/**
 * So số tiền chính xác tuyệt đối (FR-ORD-14, NFR-DAT-02).
 *
 * Tiền đi qua API và CSDL dưới dạng chuỗi thập phân tối đa 4 chữ số lẻ (`numeric(19,4)`, schema
 * `Money`). `Number('35000.0000') === Number('35000')` thì đúng, nhưng số lớn hoặc số lẻ nhiều chữ số
 * thì float làm tròn — so tiền thanh toán bằng float là mở cửa cho AMOUNT_MISMATCH sai. Đổi về số
 * nguyên đơn vị 1/10000 bằng BigInt rồi mới so.
 */

const MONEY_PATTERN = /^(\d+)(?:\.(\d{1,4}))?$/;

/** `null` nếu chuỗi không đúng định dạng `Money` (số âm cũng không hợp lệ ở đây). */
export function toMinorUnits(amount: string): bigint | null {
  const match = MONEY_PATTERN.exec(amount.trim());
  if (!match) return null;
  const whole = match[1] ?? '0';
  const fraction = (match[2] ?? '').padEnd(4, '0');
  return BigInt(whole) * 10_000n + BigInt(fraction);
}

/** Hai số tiền bằng nhau theo giá trị, bất kể cách viết (`35000` = `35000.0000`). */
export function sameAmount(a: string, b: string): boolean {
  const left = toMinorUnits(a);
  const right = toMinorUnits(b);
  return left !== null && right !== null && left === right;
}
