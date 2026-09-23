/**
 * Thông báo kiểm dữ liệu vào.
 *
 * `invalidPayload` là thông điệp mức yêu cầu; các khóa còn lại gắn vào từng trường trong
 * `details.fields[]`. Chúng thay cho message mặc định tiếng Anh của zod ("Required",
 * "Invalid uuid", ...) — trước đây lọt thẳng ra phản hồi và làm lai ngôn ngữ.
 */
export const validation = {
  invalidPayload: 'Dữ liệu gửi lên không hợp lệ',
  required: 'Bắt buộc nhập',
  invalidType: 'Sai kiểu dữ liệu',
  invalidFormat: 'Định dạng không hợp lệ',
  invalidEmail: 'Email không hợp lệ',
  invalidUuid: 'Định danh không hợp lệ',
  invalidUrl: 'Đường dẫn không hợp lệ',
  invalidEnum: 'Giá trị không nằm trong danh sách cho phép',
  tooSmall: 'Giá trị nhỏ hơn mức cho phép',
  tooBig: 'Giá trị lớn hơn mức cho phép',
  notANumber: 'Phải là một số',
  priceFormat: 'Giá phải là chuỗi số thập phân',
} as const;
