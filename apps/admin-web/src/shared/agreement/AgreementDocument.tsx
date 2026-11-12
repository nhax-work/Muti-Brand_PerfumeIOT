import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type AgreementBlock, parseAgreement } from './parseAgreement';

interface Props {
  /** Toàn văn hợp đồng hoặc phụ lục, đúng như máy chủ trả về. */
  content: string;
  /** Khung thấp hơn, lề hẹp hơn — dùng khi văn bản nằm trong Card thay vì hộp thoại. */
  compact?: boolean;
}

/** `**chữ đậm**` trong nội dung hiện thành chữ đậm; còn lại giữ nguyên văn. */
function renderInline(text: string): ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}

type Group =
  | { kind: 'meta'; items: Extract<AgreementBlock, { kind: 'meta' }>[] }
  | { kind: 'ordered'; items: Extract<AgreementBlock, { kind: 'ordered' }>[] }
  | { kind: 'bullet'; items: Extract<AgreementBlock, { kind: 'bullet' }>[] }
  | Exclude<AgreementBlock, { kind: 'meta' | 'ordered' | 'bullet' }>;

/** Dòng "Phiên bản: …" trong thông tin chung không hiện — mã phiên bản không cần cho người đọc. */
const HIDDEN_META_RE = /^(phiên bản|version)$/iu;

/** Gom các dòng thông tin chung / mục danh sách liền nhau thành một khối. */
function groupBlocks(blocks: AgreementBlock[]): Group[] {
  const groups: Group[] = [];
  for (const block of blocks) {
    if (block.kind === 'meta' && HIDDEN_META_RE.test(block.label)) continue;
    const last = groups[groups.length - 1];
    if (block.kind === 'meta' || block.kind === 'ordered' || block.kind === 'bullet') {
      if (last && last.kind === block.kind) {
        (last.items as AgreementBlock[]).push(block);
      } else {
        groups.push({ kind: block.kind, items: [block] } as Group);
      }
    } else {
      groups.push(block);
    }
  }
  return groups;
}

function renderGroup(group: Group, index: number): ReactNode {
  switch (group.kind) {
    case 'title':
      return (
        <header key={index} className="agreement-doc-head">
          <h2 className="agreement-doc-title">{renderInline(group.text)}</h2>
          <span className="agreement-doc-rule" aria-hidden />
        </header>
      );
    case 'meta':
      return (
        <dl key={index} className="agreement-doc-meta">
          {group.items.map((item, i) => (
            <Fragment key={i}>
              <dt>{item.label}</dt>
              <dd>{renderInline(item.value)}</dd>
            </Fragment>
          ))}
        </dl>
      );
    case 'article':
      return (
        <h3 key={index} className="agreement-doc-article">
          {group.label && <span className="agreement-doc-article-label">{group.label}</span>}
          <span className="agreement-doc-article-text">{renderInline(group.text)}</span>
        </h3>
      );
    case 'subheading':
      return (
        <h4 key={index} className="agreement-doc-subheading">
          {renderInline(group.text)}
        </h4>
      );
    case 'ordered':
      return (
        <ol key={index} className="agreement-doc-list">
          {group.items.map((item, i) => (
            <li key={i}>
              <span className="agreement-doc-list-marker">{item.marker}</span>
              <span>{renderInline(item.text)}</span>
            </li>
          ))}
        </ol>
      );
    case 'bullet':
      return (
        <ul key={index} className="agreement-doc-list">
          {group.items.map((item, i) => (
            <li key={i}>
              <span className="agreement-doc-list-marker" aria-hidden>
                •
              </span>
              <span>{renderInline(item.text)}</span>
            </li>
          ))}
        </ul>
      );
    case 'paragraph':
      return (
        <p key={index} className="agreement-doc-paragraph">
          {renderInline(group.text)}
        </p>
      );
  }
}

/**
 * Trình bày toàn văn hợp đồng khung / phụ lục như một trang văn bản: tiêu đề căn giữa, thông tin chung,
 * từng điều có nhãn riêng, danh sách thụt lề. Khung cuộn có lớp mờ ở đáy khi còn nội dung chưa đọc.
 */
export function AgreementDocument({ content, compact = false }: Props) {
  const groups = useMemo(() => groupBlocks(parseAgreement(content)), [content]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(true);

  const checkEnd = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 8);
  }, []);

  useEffect(() => {
    checkEnd();
  }, [checkEnd, content]);

  return (
    <div className={`agreement-paper${compact ? ' agreement-paper--compact' : ''}`}>
      <div ref={scrollRef} className="agreement-paper-scroll" onScroll={checkEnd} tabIndex={0}>
        <article className="agreement-doc">{groups.map(renderGroup)}</article>
      </div>
      {!atEnd && <div className="agreement-paper-fade" aria-hidden />}
    </div>
  );
}
