/**
 * Đối chiếu màn hình: mọi endpoint trong spec/contracts/openapi.yaml × endpoint backend đã hiện thực
 * (decorator NestJS trong apps/api/src) × endpoint web quản trị và kiosk đang gọi (`api.GET('…')`).
 *
 * In theo tag những endpoint CHƯA có màn hình gọi tới: `BE` = backend đã có (thiếu màn hình),
 * `--` = backend cũng chưa có. Endpoint `deprecated` bị bỏ qua. Gate 5 yêu cầu không còn dòng `BE`
 * cho endpoint mà một vai trò cần thao tác (docs/LO_TRINH_AI_HARNESS_13_TUAN.md, [UI-16/10]).
 *
 *   npm run check:screens
 *
 * Endpoint chỉ máy gọi (webhook, kiosk tương tác, refresh token…) vẫn hiện trong danh sách — người đọc
 * tự loại; script chỉ đối chiếu, không biết endpoint nào cần người dùng.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';

const root = process.argv[2] ?? '.';
const doc = load(readFileSync(join(root, 'spec/contracts/openapi.yaml'), 'utf8'));

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const norm = (p) =>
  p
    .replace(/\{[^}]+\}/g, '{}')
    .replace(/:[A-Za-z]+/g, '{}')
    .replace(/\/$/, '');

// 1. Contract
const contract = [];
for (const [path, item] of Object.entries(doc.paths)) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const op = item[method];
    if (!op) continue;
    const fr = (op.description ?? '').match(/FR-[A-Z]+-\d+/)?.[0] ?? '';
    contract.push({
      key: `${method.toUpperCase()} ${norm(path)}`,
      path,
      method: method.toUpperCase(),
      tag: op.tags?.[0] ?? '',
      fr,
      deprecated: Boolean(op.deprecated),
      summary: op.summary ?? '',
    });
  }
}

// 2. Backend (NestJS decorators)
const backend = new Set();
for (const file of walk(join(root, 'apps/api/src')).filter((f) => f.endsWith('.ts'))) {
  const src = readFileSync(file, 'utf8');
  const parts = src.split(/@Controller\(/).slice(1);
  for (const part of parts) {
    const prefix = part.match(/^\s*'([^']*)'/)?.[1] ?? '';
    for (const m of part.matchAll(/@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)')?\s*\)/g)) {
      const sub = m[2] ?? '';
      backend.add(`${m[1].toUpperCase()} ${norm(`/${prefix}${sub ? `/${sub}` : ''}`)}`);
    }
  }
}

// 3. Frontend calls
const front = new Map();
for (const app of ['admin-web', 'kiosk']) {
  for (const file of walk(join(root, `apps/${app}/src`)).filter(
    (f) => /\.(ts|tsx)$/.test(f) && !f.includes('.test.'),
  )) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/api\.(GET|POST|PUT|PATCH|DELETE)\(\s*'([^']+)'/g)) {
      front.set(`${m[1]} ${norm(m[2])}`, app);
    }
  }
}

const rows = contract.map((c) => ({ ...c, be: backend.has(c.key), fe: front.get(c.key) ?? '' }));
const byTag = {};
for (const r of rows) (byTag[r.tag] ??= []).push(r);
for (const [tag, list] of Object.entries(byTag)) {
  const live = list.filter((r) => !r.deprecated);
  console.log(
    `\n## ${tag}  (contract ${live.length} · backend ${live.filter((r) => r.be).length} · UI ${live.filter((r) => r.fe).length})`,
  );
  for (const r of live) {
    if (r.fe) continue;
    console.log(
      `  ${r.be ? 'BE ' : '-- '} ${r.method.padEnd(6)} ${r.path.padEnd(48)} ${r.fr.padEnd(11)} ${r.summary}`,
    );
  }
}
