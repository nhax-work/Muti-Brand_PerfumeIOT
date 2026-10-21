import type { CSSProperties } from 'react';

/**
 * Bộ icon nét mảnh vẽ bằng SVG, thay font Material Symbols: font icon tải từ CDN, mất mạng là hiện
 * thành chữ ("west", "close"…). Icon chỉ để trang trí — nghĩa luôn nằm ở nhãn chữ hoặc aria-label của
 * nút chứa nó.
 */
const PATHS = {
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
  info: 'M12 11v6M12 7.5v.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  warning:
    'M12 9v4M12 16.5v.01M10.3 4.2L2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z',
  timerOff: 'M10 2h4M12 10v3M4 4l16 16M7.4 7.6A8 8 0 0 0 18.4 18.6M10 6.2A8 8 0 0 1 19.8 16',
  tool: 'M14.7 6.3a4 4 0 0 0-5.4 5.1L3 17.7 6.3 21l6.3-6.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 24,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
