/**
 * Kiểm sơ bộ mã khiếu nại trước khi gọi API (ADR-0031) — cùng quy tắc với
 * `normalizeClaimCode` ở API: bỏ dấu gạch, khoảng trắng, tiền tố KN; I/L là 1, O là 0. Máy chủ vẫn
 * là nơi quyết định; hàm này chỉ để báo sai định dạng ngay, không tốn một lượt tra cứu bị giới hạn.
 */
export function looksLikeClaimCode(input: string): boolean {
  let code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.length === 12 && code.startsWith('KN')) code = code.slice(2);
  code = code.replace(/[IL]/g, '1').replace(/O/g, '0');
  return /^[0-9A-HJKMNP-TV-Z]{10}$/.test(code);
}
