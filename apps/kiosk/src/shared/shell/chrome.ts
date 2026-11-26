import { createContext, useContext, useEffect } from 'react';

/**
 * Màn con báo cho khung kiosk (KioskShell) thu gọn header: `focus` = ẩn nút đổi ngôn ngữ — dùng ở
 * màn nhấn nút, khi khách chỉ cần nhìn số nút và đếm ngược, không được chạm nhầm.
 */
export const ShellChromeContext = createContext<(focus: boolean) => void>(() => {});

/** Thu gọn header trong lúc màn gọi hook này còn hiện và `focus` = true; rời màn là trả lại như cũ. */
export function useFocusShell(focus: boolean): void {
  const setFocus = useContext(ShellChromeContext);
  useEffect(() => {
    setFocus(focus);
    return () => setFocus(false);
  }, [focus, setFocus]);
}
