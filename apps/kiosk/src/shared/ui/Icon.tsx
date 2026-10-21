import type { CSSProperties } from 'react';

/**
 * Bộ icon nét mảnh vẽ bằng SVG, thay font Material Symbols: font icon tải từ CDN, mất mạng là hiện
 * thành chữ ("west", "close"…). Icon chỉ để trang trí — nghĩa luôn nằm ở nhãn chữ hoặc aria-label của
 * nút chứa nó.
 */
const PATHS = {
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  timerOff: 'M10 2h4M12 10v3M4 4l16 16M7.4 7.6A8 8 0 0 0 18.4 18.6M10 6.2A8 8 0 0 1 19.8 16',
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
