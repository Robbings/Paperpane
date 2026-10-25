import { Fragment, type ReactNode } from 'react';
import './Markdown.css';

interface MarkdownProps {
  /** Untrusted text, e.g. model output. Only a small whitelist is rendered; nothing becomes HTML. */
  text: string;
  /** Renders a source marker written as [^label]; without it the label shows as plain text. */
  renderCitation?: (label: string) => ReactNode;
  className?: string;
}

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; text: string };

const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'p', text: joinLines(paragraph) });
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*```/.test(line)) {
      flush();
      const code: string[] = [];
      // An unclosed fence (still streaming) runs to the end.
      while (++i < lines.length && !/^\s*```/.test(lines[i]!)) code.push(lines[i]!);
      blocks.push({ kind: 'code', text: code.join('\n') });
    } else if (/^\s*$/.test(line)) {
      flush();
    } else if (/^#{1,6}\s/.test(line)) {
      flush();
      blocks.push({ kind: 'h', text: line.replace(/^#{1,6}\s+/, '') });
    } else if (/^\s*>/.test(line)) {
      flush();
      const quote = [line.replace(/^\s*>\s?/, '')];
      while (i + 1 < lines.length && /^\s*>/.test(lines[i + 1]!)) quote.push(lines[++i]!.replace(/^\s*>\s?/, ''));
      blocks.push({ kind: 'quote', text: joinLines(quote) });
    } else if (LIST_ITEM.test(line)) {
      flush();
      const kind = /^\s*\d/.test(line) ? 'ol' : 'ul';
      const items = [line.replace(LIST_ITEM, '')];
      // Following list lines, or indented continuation lines, belong to this list.
      while (i + 1 < lines.length && (LIST_ITEM.test(lines[i + 1]!) || /^\s{2,}\S/.test(lines[i + 1]!))) {
        const next = lines[++i]!;
        if (LIST_ITEM.test(next)) items.push(next.replace(LIST_ITEM, ''));
        else items[items.length - 1] += ` ${next.trim()}`;
      }
      blocks.push({ kind, items });
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

/** Soft line breaks: no space between CJK characters, one space otherwise. */
function joinLines(lines: string[]): string {
  return lines.reduce((out, line) => {
    const text = line.trim();
    if (!out) return text;
    const cjk = /[　-鿿＀-￯]$/.test(out) && /^[　-鿿＀-￯]/.test(text);
    return out + (cjk ? '' : ' ') + text;
  }, '');
}

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[\^[^\]]+\])|(\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text: string, renderCitation?: (label: string) => ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE)) {
    const [token] = match;
    const start = match.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    if (match[1]) out.push(<code key={key++}>{token.slice(1, -1)}</code>);
    else if (match[2]) out.push(<strong key={key++}>{renderInline(token.slice(2, -2), renderCitation)}</strong>);
    else if (match[3]) out.push(<em key={key++}>{renderInline(token.slice(1, -1), renderCitation)}</em>);
    else if (match[4]) {
      const label = token.slice(2, -1);
      out.push(<Fragment key={key++}>{renderCitation ? renderCitation(label) : `[${label}]`}</Fragment>);
    } else if (match[5]) {
      const [, label = '', href = ''] = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token) ?? [];
      // Only plain web links open; anything else stays text.
      out.push(
        /^https?:\/\//i.test(href) ? (
          <a key={key++} href={href} target="_blank" rel="noopener noreferrer" title={href}>
            {label}
          </a>
        ) : (
          label
        ),
      );
    }
    last = start + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** A small, safe Markdown subset for generated text: paragraphs, headings, lists, quotes, code, emphasis and links. */
export function Markdown({ text, renderCitation, className }: MarkdownProps) {
  const inline = (value: string) => renderInline(value, renderCitation);
  return (
    <div className={className ? `pp-md ${className}` : 'pp-md'}>
      {parseBlocks(text).map((block, index) => {
        switch (block.kind) {
          case 'p':
            return <p key={index}>{inline(block.text)}</p>;
          case 'h':
            return (
              <h4 key={index} className="pp-md__heading">
                {inline(block.text)}
              </h4>
            );
          case 'quote':
            return <blockquote key={index}>{inline(block.text)}</blockquote>;
          case 'code':
            return (
              <pre key={index}>
                <code>{block.text}</code>
              </pre>
            );
          default: {
            const List = block.kind;
            return (
              <List key={index}>
                {block.items.map((item, i) => (
                  <li key={i}>{inline(item)}</li>
                ))}
              </List>
            );
          }
        }
      })}
    </div>
  );
}
