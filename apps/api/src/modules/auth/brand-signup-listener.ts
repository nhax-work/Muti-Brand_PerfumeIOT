/**
 * Cổng báo "thương hiệu tự đăng ký vừa xác minh email" (FR-USR-07, ADR-0013).
 *
 * Auth không import module thông báo — ALR import decorator của auth nên chiều ngược lại tạo vòng
 * import. Auth chỉ khai cổng; module ALR (@Global) cung cấp hiện thực báo Super Admin. Không cắm gì
 * (test đơn vị) thì xác minh email vẫn chạy bình thường.
 */

export interface BrandSignupListener {
  /**
   * Gọi đúng một lần, ngay sau khi tài khoản tự đăng ký xác minh email lần đầu. Lỗi ở đây không làm
   * hỏng việc xác minh — người gọi tự bắt.
   */
  onBrandEmailVerified(userId: string, at: Date): Promise<void>;
}

export const BRAND_SIGNUP_LISTENER = Symbol('BRAND_SIGNUP_LISTENER');
