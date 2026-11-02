import { sentenceRanges } from '../extract';

// Only match identifiable spans. Keep punctuation outside URLs and ordinary words in the prose.
const span =
  /https?:\/\/[^\s<>\u3000，。；！？]+|10\.\d{4,9}\/[-._;()/:\w]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\[\s*\d+(?:\s*[-–—,，]\s*\d+)*\s*\]|\$[^$\n]+\$|\\\([^\n]*?\\\)|\\[a-zA-Z]+(?:\{[^{}\n]*\})*|\b[A-Za-z]\d*(?:\s*[+*/^-]\s*(?:[A-Za-z]\d*|\d+))+(?!\w)|(?:[\p{L}\d_]+[ \t]*)?[=≤≥≈≠∑∫√±×∈][ \t]*[\p{L}\d_+*/^().-]+|[α-ωΑ-Ω][\d_²³]*/gu;
export function protectText(text: string) {
  const fragments: { text: string; literal: boolean }[] = [];
  let cursor = 0;
  const spans: string[] = [];
  // Keep original bracketed numbers distinct from tokens, even in unusual input like "⟦0⟧".
  const prefix = text.includes('⟦') ? 'PP' + crypto.randomUUID().slice(0, 8) : '';
  const masked = text.replace(span, (match, offset: number) => {
    const value = /^https?:|^10\./.test(match) ? match.replace(/[.,;:!?]+$/, '') : match;
    fragments.push({ text: text.slice(cursor, offset), literal: false }, { text: value, literal: true });
    cursor = offset + value.length;
    const index = spans.push(value) - 1;
    return '⟦' + prefix + index + '⟧' + match.slice(value.length);
  });
  fragments.push({ text: text.slice(cursor), literal: false });
  return {
    masked,
    fragments,
    restore(translated: string) {
      if (!spans.length) return translated;
      const used = new Set<number>();
      let duplicate = false;
      const restored = translated.replace(
        new RegExp('[⟦\\[［【]\\s*' + prefix + '(\\d+)\\s*[⟧\\]］】]', 'g'),
        (token, n: string) => {
          const index = Number(n);
          if (spans[index] === undefined) return token;
          if (used.has(index)) duplicate = true;
          used.add(index);
          return spans[index]!;
        },
      );
      return !duplicate && used.size === spans.length ? restored : undefined;
    },
  };
}
export const escapeMarkdown = (text: string) => text.replace(/([\\\x60*_[\]<>#$~|])/g, '\\$1');
export const literalTranslation = (text: string) => text.replace(/\\([\\\x60*_[\]<>#$~|])/g, '$1');

/** Split by sentences, then words, then Unicode scalars. Never cut a surrogate pair. */
export function splitText(text: string, limit: number, measure: (s: string) => number): string[] {
  if (measure(text) <= limit) return [text];
  const chunks: string[] = [];
  let current = '',
    size = 0;
  function append(part: string, width: number) {
    if (size + width > limit && current) {
      chunks.push(current);
      current = '';
      size = 0;
    }
    current += part;
    size += width;
  }
  for (const range of sentenceRanges(text)) {
    const sentence = text.slice(range.start, range.end);
    if (measure(sentence) <= limit) {
      append(sentence, measure(sentence));
      continue;
    }
    for (const word of sentence.match(/\s+|[^\s]+/gu) ?? []) {
      if (measure(word) <= limit) append(word, measure(word));
      else for (const character of word) append(character, measure(character));
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
