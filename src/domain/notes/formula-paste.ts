// The OCR clipboard contains one formula. Leave prose, code samples and other Markdown alone.
export function formulaMarkdown(text: string): string | undefined {
  const value = text.trim();
  const display = value.startsWith('\\[');
  if (!display && !value.startsWith('\\(')) return;
  const end = display ? '\\]' : '\\)';
  if (!value.endsWith(end)) return;
  const latex = value.slice(2, -2).trim();
  if (!latex || latex.includes(end)) return;
  return display ? `$$\n${latex}\n$$` : `$${latex}$`;
}
