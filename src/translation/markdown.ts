/** Accept legacy delimiters; preserve code and render numbered equations in display mode. */
export function normalizeTranslationMarkdown(text: string): string {
  const display = (math: string) => `\n\n$$\n${math.trim()}\n$$\n\n`;
  const inline = (math: string) => /\\tag\*?\s*\{/.test(math) ? display(math) : `$${math}$`;
  // Hide legacy model annotations at display time; retain the stored output and provenance.
  const clean = text.replace(/\[公式待核对\]|【公式待核对】|[（(]公式(?:据|根据)上下文恢复[，,]\s*需核对[）)]/g, '');
  return clean.replace(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$|(?<!\\)\$(?!\$)((?:\\.|[^\\$\n])+?)(?<!\\)\$(?!\$)/g,
    (match, code: string | undefined, bracketDisplay: string | undefined, bracketInline: string | undefined, dollarDisplay: string | undefined, dollarInline: string | undefined) => {
      if (code) return code;
      if (bracketInline !== undefined) return inline(bracketInline);
      if (dollarInline !== undefined) return inline(dollarInline);
      const math = bracketDisplay ?? dollarDisplay;
      return math === undefined ? match : display(math);
    });
}
