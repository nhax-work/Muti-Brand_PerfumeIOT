import { createContext, useContext, useEffect } from 'react';

/**
 * Màn con báo cho khung kiosk (KioskShell) đổi header: `dark` = header nền tối cùng màn, ẩn nút
 * đổi ngôn ngữ — dùng ở màn nhấn nút, khi cả màn chuyển nền tối để khách nhận ra đèn đã sáng.
 */
export const ShellChromeContext = createContext<(dark: boolean) => void>(() => {});

/** Header tối trong lúc màn gọi hook này còn hiện và `dark` = true; rời màn là trả lại header sáng. */
export function useDarkShell(dark: boolean): void {
  const setDark = useContext(ShellChromeContext);
  useEffect(() => {
    setDark(dark);
    return () => setDark(false);
  }, [dark, setDark]);
}
