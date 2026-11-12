/**
 * Đường quay lại giữa các màn: modal cấu hình slot gửi người dùng sang tạo sản phẩm hay khai báo gửi
 * hàng, làm xong thì đưa về đúng slot đang cấu hình.
 */

/** Tham số URL mở lại modal cấu hình của một hóa đơn thuê slot. */
export const CONFIGURE_PARAM = 'configure';
/** Tham số URL chọn sẵn sản phẩm vừa tạo trong modal cấu hình. */
export const PRODUCT_PARAM = 'product';
export const RETURN_TO_PARAM = 'returnTo';

/**
 * Chỉ nhận đường dẫn nội bộ bắt đầu bằng một dấu "/". Không nhận "//host", "/\host" hay URL tuyệt đối,
 * để tham số `returnTo` không thành chỗ chuyển hướng ra trang ngoài (open redirect).
 */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return null;
  }
  return value;
}

/** Thêm hoặc thay tham số vào một đường dẫn nội bộ, giữ nguyên tham số đang có. */
export function withParams(path: string, params: Record<string, string>): string {
  const url = new URL(path, 'http://internal');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

/** Đường quay về màn hiện tại với modal cấu hình của `rentalId` mở sẵn. */
export function slotSetupReturnPath(pathname: string, rentalId: string): string {
  return withParams(pathname, { [CONFIGURE_PARAM]: rentalId });
}
