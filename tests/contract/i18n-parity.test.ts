/**
 * Hai catalog ngôn ngữ phải khớp nhau, và không chỗ nào trong apps/api còn viết chuỗi thẳng.
 *
 * Việc thiếu hay thừa KHÓA đã được hệ thống kiểu chặn: `packages/i18n/src/en/index.ts` khai báo
 * `SameKeysAs<typeof vi>` nên `npm run lint` đỏ ngay. File này lo ba thứ trình biên dịch không
 * nhìn thấy:
 *
 *   1. Bản dịch rỗng hoặc chỉ có khoảng trắng — kiểu vẫn là `string` nên tsc không ý kiến.
 *   2. Lệch bộ tham số `{...}` giữa hai ngôn ngữ — chỉ lộ ra khi dựng chuỗi lúc chạy thật.
 *   3. Chuỗi hướng người dùng viết thẳng tại chỗ ném lỗi, thay vì lấy từ catalog.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  catalogs,
  format,
  isMessageKey,
  LOCALES,
  MESSAGE_KEYS,
  translate,
  vi,
} from '../../packages/i18n/src/index.js';

const PLACEHOLDER = /\{(\w+)\}/g;

function placeholdersOf(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((m) => m[1] as string).sort();
}

function entriesOf(locale: (typeof LOCALES)[number]): [string, string][] {
  return Object.entries(catalogs[locale]).flatMap(([namespace, group]) =>
    Object.entries(group as Record<string, string>).map(
      ([name, text]) => [`${namespace}.${name}`, text] as [string, string],
    ),
  );
}

describe('catalog song ngữ', () => {
  it('không bản dịch nào bỏ trống', () => {
    for (const locale of LOCALES) {
      for (const [key, text] of entriesOf(locale)) {
        expect(text.trim(), `${locale}.${key} rỗng`).not.toBe('');
      }
    }
  });

  it('hai ngôn ngữ dùng đúng cùng một bộ tham số', () => {
    // Bản tiếng Anh viết `{serial}` trong khi tiếng Việt viết `{serialNumber}` sẽ in ra nguyên
    // chỗ giữ cho khách đọc. Trình biên dịch không thấy được vì cả hai đều là `string`.
    for (const [key, viText] of entriesOf('vi')) {
      const enText = entriesOf('en').find(([k]) => k === key)?.[1] as string;
      expect(placeholdersOf(enText), `lệch tham số ở khóa ${key}`).toEqual(placeholdersOf(viText));
    }
  });

  it('MESSAGE_KEYS liệt kê đúng mọi khóa và isMessageKey nhận diện được', () => {
    expect(MESSAGE_KEYS.length).toBe(entriesOf('vi').length);
    for (const key of MESSAGE_KEYS) {
      expect(isMessageKey(key)).toBe(true);
    }
    expect(isMessageKey('mch.khongTonTai')).toBe(false);
    expect(isMessageKey('mch')).toBe(false);
  });

  it('translate nội suy tham số và trả đúng ngôn ngữ được hỏi', () => {
    const withParam = translate('vi', 'mch.serialTaken', { serialNumber: 'M001' });
    expect(withParam).toContain('M001');
    expect(withParam).not.toContain('{serialNumber}');

    expect(translate('en', 'mch.machineNotFound')).not.toBe(vi.mch.machineNotFound);
    expect(translate('vi', 'mch.machineNotFound')).toBe(vi.mch.machineNotFound);
  });

  it('thiếu tham số thì giữ nguyên chỗ giữ, không in undefined', () => {
    expect(format('Máy {serialNumber} hỏng', {})).toBe('Máy {serialNumber} hỏng');
  });
});

// ---------------------------------------------------------------------------------------------

const API_SRC = join(process.cwd(), 'apps', 'api', 'src');

function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsFilesUnder(full);
    return entry.endsWith('.ts') ? [full] : [];
  });
}

describe('apps/api không viết chuỗi thẳng vào chỗ ném lỗi', () => {
  /**
   * `AppError` và `invalidField` nhận `MessageKey`, nên một chuỗi viết tay đã là lỗi biên dịch.
   * Test này chốt thêm một lớp: khóa truyền vào phải là khóa CÓ THẬT trong catalog.
   *
   * Nó bắt được trường hợp mà kiểu không bắt được — ai đó ép kiểu, hoặc dựng khóa bằng template
   * string rồi `as MessageKey`.
   */
  it('mọi khóa truyền cho AppError và invalidField đều tồn tại trong catalog', () => {
    // Cả hai hàm đều nhận khóa ở THAM SỐ THỨ HAI: `AppError(code, key)` và
    // `invalidField(path, key)`. Lời gọi truyền biến thay vì literal (ví dụ chính thân
    // `invalidField`) không khớp, và đó là điều mong muốn — chỗ đó đã có kiểu canh.
    const callSite = /(?:new AppError|invalidField)\(\s*'[^']*',\s*'([^']+)'/g;
    const offenders: string[] = [];

    for (const file of tsFilesUnder(API_SRC)) {
      const source = readFileSync(file, 'utf8');
      for (const [, key] of source.matchAll(callSite)) {
        if (!isMessageKey(key)) {
          offenders.push(`${file.replace(process.cwd(), '')} -> ${key}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
