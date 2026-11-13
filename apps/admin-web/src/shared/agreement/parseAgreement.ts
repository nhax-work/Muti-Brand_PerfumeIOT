/**
 * Tách toàn văn hợp đồng (chuỗi thuần hoặc Markdown đơn giản) thành các khối để trình bày như văn bản
 * pháp lý. Chỉ đổi cách hiển thị — nội dung và `contentHash` máy chủ giữ nguyên.
 *
 * Nhận diện:
 * - `# Tiêu đề` hoặc dòng đầu viết hoa toàn bộ → tiêu đề văn bản.
 * - `ĐIỀU 1: Tên điều` / `Điều 1. Tên điều` / `## Tên mục` → đầu một điều.
 * - `### Tên mục con` → tiêu đề con.
 * - `Nhãn: giá trị` trước điều đầu tiên → thông tin chung (phiên bản, phạm vi áp dụng…).
 * - `1. …` / `1) …` → mục đánh số; `- …` / `* …` / `• …` → mục gạch đầu dòng.
 * - Còn lại là đoạn văn.
 */
export type AgreementBlock =
  | { kind: 'title'; text: string }
  | { kind: 'meta'; label: string; value: string }
  | { kind: 'article'; label: string | null; text: string }
  | { kind: 'subheading'; text: string }
  | { kind: 'ordered'; marker: string; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'paragraph'; text: string };

const ARTICLE_RE = /^(điều)\s+(\d+[a-z]?)\s*[:.\-–]?\s*(.*)$/iu;
const ORDERED_RE = /^(\d{1,3}[.)])\s+(.+)$/u;
const BULLET_RE = /^[-*•]\s+(.+)$/u;
const META_RE = /^([^:]{1,40}):\s+(.+)$/u;

function isAllCaps(line: string): boolean {
  return /\p{L}/u.test(line) && line === line.toLocaleUpperCase('vi');
}

export function parseAgreement(content: string): AgreementBlock[] {
  const blocks: AgreementBlock[] = [];
  let seenArticle = false;

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const heading = /^(#{1,6})\s+(.+)$/u.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      const text = heading[2]!.trim();
      if (level === 1) {
        blocks.push({ kind: 'title', text });
      } else if (level === 2) {
        seenArticle = true;
        const article = ARTICLE_RE.exec(text);
        blocks.push(
          article
            ? { kind: 'article', label: `${article[1]} ${article[2]}`, text: article[3]!.trim() }
            : { kind: 'article', label: null, text },
        );
      } else {
        blocks.push({ kind: 'subheading', text });
      }
      continue;
    }

    const article = ARTICLE_RE.exec(line);
    if (article) {
      seenArticle = true;
      blocks.push({
        kind: 'article',
        label: `${article[1]} ${article[2]}`,
        text: article[3]!.trim(),
      });
      continue;
    }

    if (blocks.length === 0 && isAllCaps(line)) {
      blocks.push({ kind: 'title', text: line });
      continue;
    }

    const ordered = ORDERED_RE.exec(line);
    if (ordered) {
      blocks.push({ kind: 'ordered', marker: ordered[1]!, text: ordered[2]! });
      continue;
    }

    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      blocks.push({ kind: 'bullet', text: bullet[1]! });
      continue;
    }

    const meta = seenArticle ? null : META_RE.exec(line);
    if (meta) {
      blocks.push({ kind: 'meta', label: meta[1]!.trim(), value: meta[2]!.trim() });
      continue;
    }

    blocks.push({ kind: 'paragraph', text: line });
  }

  return blocks;
}
