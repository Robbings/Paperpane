import type { CSSProperties } from 'react';
import type { HighlightColor } from '@/ui/components';
import type { Rotation } from '../types';
import './sample.css';

// 示例内容：在 PDF 渲染接入之前占位的论文页面。文字为样稿自拟，不是真实论文。

const fill = (color: HighlightColor) => ({ background: `var(--pp-hl-${color}-fill)` }) as CSSProperties;

interface SamplePaperProps {
  pageCount: number;
  zoomPercent: number;
  rotation: Rotation;
  /** Current colour of each built-in highlight by annotation id; missing means deleted (plain text). */
  highlights: Readonly<Record<string, HighlightColor>>;
}

export function SamplePaper({ pageCount, zoomPercent, rotation, highlights }: SamplePaperProps) {
  // A built-in highlight: a <mark> the demo runtime can hit-test by id, or plain text once deleted.
  const mark = (id: string, text: string) => {
    const color = highlights[id];
    return color ? (
      <mark data-annotation-id={id} style={fill(color)}>
        {text}
      </mark>
    ) : (
      text
    );
  };
  const scale = zoomPercent / 100;
  const style = { '--pp-sample-scale': scale } as CSSProperties;

  return (
    <div className="pp-sample" style={style} data-rotation={rotation}>
      <article className="pp-sample__page" data-page-index={0} aria-label="第 1 页">
        <h1>Recovering Reading Order in Two-Column Scientific PDFs</h1>
        <p className="pp-sample__authors">A. Author · B. Author · C. Author</p>
        <p className="pp-sample__affil">Institute One · Institute Two</p>
        <p className="pp-sample__heading pp-sample__heading--center">Abstract</p>
        <p className="pp-sample__abstract">
          Scientific papers are distributed as PDF files whose{' '}
          {mark('a1', 'text is stored in drawing order rather than reading order')}. For two-column
          layouts, figures, footnotes and equations interleave with body text, so naive extraction produces sentences that
          jump between columns. We describe a layout-aware procedure that groups glyphs into blocks, assigns each block to a
          column, and orders blocks with a small set of geometric rules. The procedure needs no training data and{' '}
          {mark('a2', 'keeps every block linked to its position on the page')}, which lets downstream tools
          such as search, highlighting and translation point back to the exact source.
        </p>
        <div className="pp-sample__columns">
          <div>
            <p className="pp-sample__heading">1  Introduction</p>
            <p>
              Readers increasingly rely on software that searches, annotates and translates papers. All of these tasks
              depend on a text stream in the order a person would read it. PDF does not guarantee such an order: a file may
              draw the second column before the first, or place a caption between two halves of a paragraph.
            </p>
            <p className="pp-sample__indent">
              A second requirement is traceability. When a tool shows a translated sentence or an extracted quote, the
              reader should be able to return to the place it came from.
            </p>
            <p className="pp-sample__indent">
              This paper makes three contributions. We define a block model that keeps text, kind and geometry together. We
              give ordering rules for the common two-column template and its variants. We describe how blocks are
              re-projected when the page is zoomed or rotated.
            </p>
          </div>
          <div>
            <p>
              Coordinates must therefore survive extraction, zoom and rotation, and a block should keep a stable identifier
              when the same file is opened again. Without this, a highlight made yesterday may land on the wrong line today.
            </p>
            <p className="pp-sample__heading pp-sample__heading--spaced">2  Related Work</p>
            <p>
              Earlier approaches fall into rule-based segmentation and learned layout models.{' '}
              {mark('a3', 'Rule-based methods are transparent but fragile on unusual templates')};
              learned models are robust but require labelled pages and can hide why a block was placed where it was.
            </p>
            <p className="pp-sample__indent">
              Our procedure stays on the rule-based side and adds an explicit record of every decision, so a wrong order can
              be traced to the rule that produced it.
            </p>
          </div>
        </div>
      </article>

      {Array.from({ length: pageCount - 1 }, (_, offset) => (
        <article key={offset} className="pp-sample__page pp-sample__page--blank" data-page-index={offset + 1} aria-label={`第 ${offset + 2} 页`}>
          <div className="pp-sample__lines" aria-hidden="true">
            {Array.from({ length: 2 }, (_, column) => (
              <div key={column}>
                {Array.from({ length: 34 }, (_, line) => (
                  <span key={line} style={{ width: `${line % 9 === 8 ? 58 : 92 + ((line * 7) % 8)}%` }} />
                ))}
              </div>
            ))}
          </div>
          <span className="pp-sample__page-number">{offset + 2}</span>
        </article>
      ))}
    </div>
  );
}
