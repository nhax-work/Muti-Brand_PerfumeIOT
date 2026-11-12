import styles from './steps.module.css';

/** HÌNH TẠM bước 01: cổ tay nằm dưới vòi, mũi tên chỉ khoảng cách 10–15 cm. Không chạm vòi. */
export function WristUnderNozzle() {
  return (
    <svg className={styles.art} viewBox="0 0 160 120" aria-hidden="true">
      {/* Đầu máy và vòi xịt */}
      <rect x="62" y="6" width="36" height="16" rx="3" />
      <path d="M75 22v8h10v-8" />
      {/* Mũi tên hai đầu: khoảng cách vòi → cổ tay */}
      <g className={styles.gap}>
        <path d="M50 34v38" />
        <path d="M45 39l5-5 5 5M45 67l5 5 5-5" />
      </g>
      {/* Cẳng tay đưa vào từ mép phải, cổ tay ngay dưới vòi */}
      <g className={styles.wrist}>
        <path d="M156 78H90a12 12 0 0 0 0 24h66" />
        <path d="M112 78v24" />
      </g>
    </svg>
  );
}
