import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { normalizeTranslationMarkdown } from '@/translation/markdown';
import 'katex/dist/katex.min.css';

// Sentence containers are spans inside the existing reader's paragraphs. Keep the DOM valid.
const components: Components = {
  p: ({ children }) => <span>{children}</span>,
  div: ({ children, className }) => <span className={className} style={{ display: 'block', maxWidth: '100%', overflowX: 'auto' }}>{children}</span>,
  pre: ({ children }) => <span style={{ display: 'block', whiteSpace: 'pre-wrap' }}>{children}</span>,
  h1: ({ children }) => <strong>{children}</strong>, h2: ({ children }) => <strong>{children}</strong>,
  h3: ({ children }) => <strong>{children}</strong>, h4: ({ children }) => <strong>{children}</strong>,
  h5: ({ children }) => <strong>{children}</strong>, h6: ({ children }) => <strong>{children}</strong>,
  ul: ({ children }) => <span style={{ display: 'block' }}>{children}</span>,
  ol: ({ children }) => <span style={{ display: 'block' }}>{children}</span>,
  li: ({ children }) => <span style={{ display: 'block' }}>• {children}</span>,
  blockquote: ({ children }) => <span style={{ display: 'block' }}>{children}</span>,
  img: () => null,
  a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{children}</a>,
  span: ({ children, className, node: _node, style, ...props }) => <span {...props} className={className} style={className?.includes('katex-display') ? { ...style, display: 'block', maxWidth: '100%', overflowX: 'auto' } : style}>{children}</span>,
};
// Block mode keeps real paragraphs; defined once so the element type stays stable across renders.
const blockComponents: Components = { ...components, p: ({ children }) => <p>{children}</p> };
const remarkPlugins = [remarkMath];
const rehypePlugins: NonNullable<Parameters<typeof ReactMarkdown>[0]['rehypePlugins']> = [[rehypeKatex, { trust: false, strict: 'ignore', maxExpand: 500, maxSize: 20, throwOnError: false }]];
/** No raw HTML, remote images or trusted KaTeX commands. Unclosed streamed math stays literal. */
export const TranslationMarkdown = memo(function TranslationMarkdown({ text, block = false }: { text: string; inferredMath?: boolean; block?: boolean }) {
  return <>
    <ReactMarkdown skipHtml components={block ? blockComponents : components} remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
      {normalizeTranslationMarkdown(text)}
    </ReactMarkdown>
  </>;
});
