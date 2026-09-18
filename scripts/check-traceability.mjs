// Kiểm tra mọi FR ưu tiên M đều có test mang đúng mã.
//
// Chạy: node scripts/check-traceability.mjs
// Exit 1 nếu còn FR ưu tiên M chưa có test tương ứng.
//
// Chuyển từ check_traceability.py sang Node để dự án chỉ còn một runtime duy nhất —
// trước đó CI phải cài setup-python chỉ để chạy đúng script này.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_DOC = join(ROOT, 'docs', 'FR_NFR_SCENTSTATION.md');
const TESTS = join(ROOT, 'tests');

// Dòng bảng FR trong đặc tả: | FR-AUTH-01 | ... | BR-003 | M |
// [A-Z]+ chứ không phải [A-Z]{3} — module AUTH có 4 chữ.
const FR_ROW = /^\|\s*(FR-[A-Z]+-\d+[a-z]?)\s*\|.*\|\s*([MSW])\s*\|/;

// Khớp cả hai phong cách:
//   Node/vitest : it("test_FR_ORD_15_webhook_idempotent", ...) / test('...') / it(`...`)
//   Python      : def test_FR_ORD_15_webhook_idempotent(...)   — còn sót ở tài liệu cũ
// Bắt buộc tên nằm sau "def " hoặc ngay sau dấu nháy, để một tên được nhắc trong lời giải thích
// không bị tính nhầm là đã có test.
const TEST_FN = /(?:def\s+|['"`])(test_FR_[A-Z]+_\d+[a-z]?_\w+)/g;

const SCANNED_EXTENSIONS = new Set(['.ts', '.js', '.mjs', '.py']);

/** Mọi FR ưu tiên M khai báo trong đặc tả. */
function collectRequired() {
  if (!existsSync(SPEC_DOC)) {
    console.error(`Khong tim thay ${SPEC_DOC}`);
    process.exit(1);
  }
  const required = new Set();
  for (const line of readFileSync(SPEC_DOC, 'utf8').split(/\r?\n/)) {
    const m = FR_ROW.exec(line.trim());
    if (m && m[2] === 'M') required.add(m[1]);
  }
  return required;
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (SCANNED_EXTENSIONS.has(extname(entry.name))) yield full;
  }
}

/** Mã FR đã được một test nào đó nhận trách nhiệm, suy từ tên test. */
function collectCovered() {
  const covered = new Set();
  if (!existsSync(TESTS)) return covered;
  for (const file of walk(TESTS)) {
    const content = readFileSync(file, 'utf8');
    for (const [, name] of content.matchAll(TEST_FN)) {
      // test_FR_ORD_15_mo_ta -> ['test','FR','ORD','15','mo','ta']
      const parts = name.split('_');
      covered.add(`FR-${parts[2]}-${parts[3]}`);
    }
  }
  return covered;
}

const required = collectRequired();
const covered = collectCovered();
const missing = [...required].filter((fr) => !covered.has(fr)).sort();

console.log(`FR uu tien M : ${required.size}`);
console.log(`Da co test   : ${required.size - missing.length}`);
console.log(`Con thieu    : ${missing.length}`);

if (missing.length > 0) {
  console.log('\nChua co test:');
  for (const fr of missing) console.log('  -', fr);
  process.exit(1);
}

console.log('\nOK - moi FR uu tien M deu co test.');
