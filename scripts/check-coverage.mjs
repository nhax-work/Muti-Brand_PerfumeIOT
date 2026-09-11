// Cổng coverage cho module lõi (NFR-MTN-01)
// Đọc coverage/coverage-summary.json, yêu cầu >=60% cho 6 module quan trọng nhất.
import { readFileSync, existsSync } from 'node:fs';

const THRESHOLD = 60;
const CORE = ['ord', 'dsp', 'slt', 'exp', 'rev', 'inv'];
const FILE = 'coverage/coverage-summary.json';

if (!existsSync(FILE)) {
  console.error(`Khong tim thay ${FILE}. Bat json-summary reporter trong vitest config.`);
  process.exit(1);
}

const summary = JSON.parse(readFileSync(FILE, 'utf8'));
const failed = [];

for (const mod of CORE) {
  let covered = 0, total = 0;
  for (const [path, data] of Object.entries(summary)) {
    if (path === 'total') continue;
    if (!path.toLowerCase().includes(`/${mod}/`)) continue;
    covered += data.lines.covered;
    total += data.lines.total;
  }
  if (total === 0) {
    console.log(`  ${mod.toUpperCase().padEnd(4)} chua co code`);
    continue;
  }
  const pct = (covered / total) * 100;
  const ok = pct >= THRESHOLD;
  console.log(`  ${mod.toUpperCase().padEnd(4)} ${pct.toFixed(1).padStart(5)}%  ${ok ? 'OK' : 'THIEU'}`);
  if (!ok) failed.push(`${mod.toUpperCase()} ${pct.toFixed(1)}%`);
}

if (failed.length) {
  console.error(`\nDuoi nguong ${THRESHOLD}%: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`\nOK - moi module loi dat >=${THRESHOLD}%`);
