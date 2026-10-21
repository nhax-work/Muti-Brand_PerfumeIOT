import styles from './steps.module.css';

/** Máy ít nhất 4 nút; slot lớn hơn thì vẽ thêm cho tới số đó (tối đa 6 để nút còn đủ to). */
const MIN_BUTTONS = 4;
const MAX_BUTTONS = 6;

/** HÌNH TẠM bước 02: hàng nút trên máy, nút số {slot} sáng màu đèn, ngón tay nhấn xuống nút đó. */
export function PressLitButton({ slot }: { slot: number }) {
  const count = Math.min(MAX_BUTTONS, Math.max(MIN_BUTTONS, slot));
  const pitch = 132 / count;
  const cx = (n: number) => 14 + pitch * (n - 0.5);
  const target = Math.min(slot, count);

  return (
    <svg className={styles.art} viewBox="0 0 160 120" aria-hidden="true">
      {/* Mặt máy */}
      <rect x="8" y="66" width="144" height="44" rx="4" />
      {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
        <g key={n}>
          <circle cx={cx(n)} cy="88" r="9" className={n === target ? styles.lit : undefined} />
          <text
            x={cx(n)}
            y="92"
            className={n === target ? `${styles.label} ${styles.litLabel}` : styles.label}
          >
            {n}
          </text>
        </g>
      ))}
      {/* Ngón tay từ trên xuống, dừng trên mặt nút */}
      <path
        className={styles.finger}
        d={`M${cx(target) - 7} 4v64a7 7 0 0 0 14 0V4M${cx(target) - 4} 62h8`}
      />
    </svg>
  );
}
