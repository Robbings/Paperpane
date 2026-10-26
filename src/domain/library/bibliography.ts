import { Cite, plugins } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import '@citation-js/plugin-csl';
import type { Json } from '@/contracts/common';
import type { LibraryItem } from '@/contracts/library';

// The upstream ASCII default drops CJK characters with no LaTeX equivalent.
const bibtexConfig = plugins.config.get('@bibtex');
bibtexConfig.format.asciiOnly = false;
bibtexConfig.format.useIdAsLabel = true;

type CSL = Record<string, Json>;
const text = (v: unknown) => typeof v === 'string' ? v : undefined;
function authors(entry: CSL): string[] {
  return Array.isArray(entry.author) ? entry.author.map(author => {
    if (!author || typeof author !== 'object' || Array.isArray(author)) return '';
    return text(author.literal) ?? [text(author.given), text(author.family)].filter(Boolean).join(' ');
  }).filter(Boolean) : [];
}
function year(entry: CSL): number | undefined {
  const issued = entry.issued as { 'date-parts'?: number[][] } | undefined;
  const value = issued?.['date-parts']?.[0]?.[0];
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 9999 ? value : undefined;
}
function canonical(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k]!)}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function parseBibliography(source: string, kind: 'bibtex' | 'csl') {
  let data: unknown;
  if (kind === 'bibtex') data = new Cite(source, { forceType: '@bibtex/text', maxChainLength: 10, generateGraph: false, strict: true, target: '@csl/list+object' }).data;
  else data = JSON.parse(source.replace(/^\uFEFF/, ''));
  if (!Array.isArray(data) || !data.length || data.length > 5000) throw new Error('书目文件需要包含 1–5000 条记录');
  return Promise.all(data.map(async (value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`第 ${index + 1} 条书目格式无效`);
    const entry = JSON.parse(JSON.stringify(value)) as CSL;
    // Only plain bibliographic objects reach Cite; never resolve DOI/URL input plugins.
    const title = text(entry.title)?.trim();
    if (!title || typeof entry.type !== 'string') throw new Error(`第 ${index + 1} 条书目缺少标题或 CSL 类型`);
    const doi = text(entry.DOI)?.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').toLowerCase();
    const { id: _id, ...content } = entry;
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(content))));
    const bibliographyKey = doi ? `doi:${doi}` : `csl:${Array.from(hash, b => b.toString(16).padStart(2, '0')).join('')}`;
    return { title, authors: authors(entry), year: year(entry), venue: text(entry['container-title']), abstract: text(entry.abstract),
      doi, citation: entry, bibliographyKey, source: 'local' as const };
  }));
}
export function citationData(item: LibraryItem): CSL {
  const result: CSL = { ...(item.citation ?? {}), id: item.id, type: item.citation?.type ?? 'article', title: item.title };
  const edited = new Set(item.editedFields);
  if (!item.citation || edited.has('authors')) result.author = item.authors.map(literal => ({ literal }));
  if (!item.citation || edited.has('year')) { if (item.year) result.issued = { 'date-parts': [[item.year]] }; else delete result.issued; }
  if (!item.citation || edited.has('venue')) { if (item.venue) result['container-title'] = item.venue; else delete result['container-title']; }
  if (!item.citation || edited.has('abstract')) { if (item.abstract) result.abstract = item.abstract; else delete result.abstract; }
  if (item.doi) result.DOI = item.doi;
  return result;
}
/** Prevent spreadsheet formula execution while preserving proper CSV quoting. */
const cell = (v: unknown): string => {
  let s = String(v ?? ''); if (/^[\s]*[=+@-]/.test(s) || /^[\t\r\n]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
};
export function exportCitations(items: readonly LibraryItem[], format: 'bibtex' | 'apa' | 'csv'): string {
  if (format === 'csv') return '\uFEFF' + [['标题', '作者', '年份', '期刊/会议', 'DOI', '摘要', '短注释'],
    ...items.map(i => [i.title, i.authors.join('; '), i.year, i.venue, i.doi, i.abstract, i.shortNote])].map(r => r.map(cell).join(',')).join('\r\n');
  const cite = new Cite(items.map(citationData));
  // Distinct imports can carry the same original BibTeX key. Keep keys unique per export.
  const seen = new Set<string>();
  for (const entry of cite.data) {
    const key = String(entry['citation-key'] ?? entry.id);
    entry['citation-key'] = seen.has(key) ? String(entry.id) : key;
    seen.add(String(entry['citation-key']));
  }
  return String(format === 'bibtex' ? cite.format('bibtex') : cite.format('bibliography', { format: 'text', template: 'apa', lang: 'en-US' }));
}
