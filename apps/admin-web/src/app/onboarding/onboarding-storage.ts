/** Nhớ trên trình duyệt rằng tài khoản này đã xem hướng dẫn; không cần lưu ở máy chủ. */
const doneKey = (userId: string) => `scentstation.admin.onboardingDone.${userId}`;

export function isOnboardingDone(userId: string): boolean {
  try {
    return window.localStorage.getItem(doneKey(userId)) === '1';
  } catch {
    return true; // Không đọc được bộ nhớ thì đừng bật hướng dẫn mỗi lần tải trang.
  }
}

export function markOnboardingDone(userId: string): void {
  try {
    window.localStorage.setItem(doneKey(userId), '1');
  } catch {
    // Trình duyệt chặn localStorage thì chỉ không nhớ được.
  }
}
