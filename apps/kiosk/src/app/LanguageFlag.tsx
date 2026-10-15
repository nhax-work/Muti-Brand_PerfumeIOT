import { useId } from 'react';
import styles from './KioskShell.module.css';

/**
 * Cờ minh họa cho từng ngôn ngữ ở dropdown đổi ngôn ngữ. Vẽ SVG thay vì emoji cờ vì Windows không
 * hiển thị emoji cờ (chỉ ra chữ "VN"/"GB"). Cùng khung 3:2 để hai cờ thẳng hàng.
 */
export function LanguageFlag({ locale }: { locale: string }) {
  const uid = useId().replace(/[^\w-]/g, '');

  if (locale === 'vi') {
    return (
      <svg viewBox="0 0 30 20" className={styles.flag} aria-hidden="true">
        <rect width="30" height="20" fill="#da251d" />
        <polygon
          fill="#ffff00"
          points="15,4 16.35,8.15 20.71,8.15 17.18,10.71 18.53,14.85 15,12.29 11.47,14.85 12.82,10.71 9.29,8.15 13.65,8.15"
        />
      </svg>
    );
  }

  if (locale === 'en') {
    // Union Jack chuẩn 60×30, cắt giữa vào khung 3:2.
    return (
      <svg
        viewBox="0 0 60 30"
        preserveAspectRatio="xMidYMid slice"
        className={styles.flag}
        aria-hidden="true"
      >
        <clipPath id={`${uid}-t`}>
          <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
        </clipPath>
        <rect width="60" height="30" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#ffffff" strokeWidth="6" />
        <path
          d="M0,0 L60,30 M60,0 L0,30"
          clipPath={`url(#${uid}-t)`}
          stroke="#c8102e"
          strokeWidth="4"
        />
        <path d="M30,0 v30 M0,15 h60" stroke="#ffffff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" strokeWidth="6" />
      </svg>
    );
  }

  return null;
}
