export type MathDelimiter = 'brackets' | 'dollars' | 'none';
export function copyMath(latex: string, display: boolean, style: MathDelimiter): string {
  if (style === 'none') return latex;
  if (style === 'brackets') return display ? `\\[\n${latex.trim()}\n\\]` : `\\(${latex}\\)`;
  return display ? `$$\n${latex.trim()}\n$$` : `$${latex}$`;
}
/** Change math delimiters only, preserving code and the answer's Markdown. */
export function mathCopyMarkdown(text: string, style: MathDelimiter): string {
  return text.replace(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$|(?<!\\)\$(?!\$)((?:\\.|[^\\$\n])+?)(?<!\\)\$(?!\$)/g,
    (match, code, bracketDisplay, bracketInline, dollarDisplay, dollarInline) => {
      if (code) return match;
      const display = bracketDisplay ?? dollarDisplay;
      return copyMath(display ?? bracketInline ?? dollarInline, display !== undefined, style);
    });
}
/** Serialize the selected DOM, replacing KaTeX's visual and MathML copies with one LaTeX source. */
export function selectedMathMarkdown(root: HTMLElement, style: MathDelimiter): string | null {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0).cloneRange();
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const formula = (node: Node) => (node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement)?.closest('.katex-display, .katex');
  const start = formula(range.startContainer), end = formula(range.endContainer);
  // A partial visual selection is still one formula; its source cannot be split by glyph position.
  if (start && root.contains(start)) range.setStartBefore(start.closest('.katex-display') ?? start);
  if (end && root.contains(end)) range.setEndAfter(end.closest('.katex-display') ?? end);
  const fragment = range.cloneContents();
  if (!fragment.querySelector('.katex')) return null;
  const serialize = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof Element)) return [...node.childNodes].map(serialize).join('');
    if (node.matches('[data-copy-skip], script, style, button')) return '';
    if (node.matches('.katex-display, .katex')) {
      const latex = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
      return latex == null ? node.textContent ?? '' : copyMath(latex, node.matches('.katex-display'), style);
    }
    const text = [...node.childNodes].map(serialize).join('');
    switch (node.tagName.toLowerCase()) {
      case 'br': return '\n';
      case 'strong': case 'b': return `**${text}**`;
      case 'em': case 'i': return `*${text}*`;
      case 'code': return node.parentElement?.tagName === 'PRE' ? text : '`' + text + '`';
      case 'pre': return '\n\n```\n' + text + '\n```\n\n';
      case 'li': return '\n- ' + text.trim();
      case 'p': case 'div': case 'blockquote': case 'ul': case 'ol': return text + '\n\n';
      default: return text;
    }
  };
  return serialize(fragment).trim();
}
