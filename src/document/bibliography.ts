import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { PdfBibliography } from '@/contracts/library';
import { abortIfNeeded } from './errors';

export const PDF_BIBLIOGRAPHY_VERSION = 1;
const clean = (v: unknown): string => typeof v === 'string' ? v.normalize('NFKC').replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b]/g, '').replace(/\s+/g, ' ').trim() : '';
const letters = (s: string) => (s.match(/\p{L}/gu) ?? []).length;
const boilerplate = /^(?:(?:untitled|unknown|anonymous(?: submission)?|authors?|your (?:name|title)|user|administrator|template|research article|original article|open access|abstract|摘要|introduction|contents)\s*$|microsoft (?:word|office)|latex\b|arxiv[:\s])/i;
function validTitle(raw: unknown): string | undefined {
  const value = clean(raw);
  if (value.length > 1000 || letters(value) < (/\p{Script=Han}/u.test(value) ? 2 : 5) || boilerplate.test(value) || /\.(?:pdf|docx?|tex)$/i.test(value) || /^[a-f\d-]{20,}$/i.test(value)) return;
  return value;
}
const affiliation = /(?:@|https?:|\b(?:university|department|institute|laboratory|research|school|college|correspondence|copyright|proceedings|abstract|received|accepted|published)\b|大学|学院|研究所|实验室)/i;
function nameLike(value: string): boolean {
  if (!value || value.length > 100 || affiliation.test(value) || boilerplate.test(value) || /\d|[=()[\]{}:]/.test(value)) return false;
  if (/^[\p{Script=Han}·]{2,10}$/u.test(value)) return true;
  const words = value.split(/\s+/);
  return words.length >= 2 && words.length <= 7 && words.every(word => /^(?:\p{Lu}[\p{L}\p{M}.'’–-]*|(?:de|del|da|di|van|von|der|den|la|le))$/u.test(word));
}
function parseAuthors(raw: unknown, trusted: boolean): string[] | undefined {
  if (Array.isArray(raw)) {
    const names = raw.flatMap(value => parseAuthors(value, trusted) ?? []);
    return names.length ? [...new Set(names)].slice(0, 200) : undefined;
  }
  let value = clean(raw); if (!value || value.length > 5000 || boilerplate.test(value)) return;
  if (!trusted) value = value.replace(/\bID\b/g, '').replace(/[*†‡§⁎]+/g, '').replace(/\d+(?=\s|,|;|$)/g, ',').replace(/[,;]\s*[,;]/g, ',');
  const names = value.split(/\s*(?:;|，|、|\band\b|&)\s*/i).flatMap(part => {
    const pieces = part.split(/\s*,\s*/).filter(Boolean);
    // Keep "Family, Given" intact instead of silently turning it into two authors.
    return pieces.length > 1 && pieces.every(name => nameLike(name)) ? pieces : [part];
  }).map(s => s.trim().replace(/^[,\s]+|[,\s]+$/g, '')).filter(Boolean);
  if (!names.length || names.length > 200 || names.some(name => !trusted && !nameLike(name))) return;
  if (trusted && names.some(name => name.length > 150 || /(?:@|https?:|microsoft|adobe|pdftex|acrobat)/i.test(name))) return;
  return [...new Set(names)];
}
interface Run { text: string; x: number; y: number; width: number; size: number }
interface Line { text: string; y: number; size: number; runs: Run[] }
function makeLines(runs: Run[]): Line[] {
  const lines: Line[] = [];
  for (const run of [...runs].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let line = lines.findLast(l => Math.abs(l.y - run.y) <= Math.max(l.size, run.size) * .55);
    if (!line) { line = { text: '', y: run.y, size: run.size, runs: [] }; lines.push(line); }
    line.runs.push(run); line.size = Math.max(line.size, run.size);
  }
  for (const line of lines) {
    line.runs.sort((a, b) => a.x - b.x);
    line.text = joinRuns(line.runs);
  }
  return lines.sort((a, b) => a.y - b.y);
}
function joinRuns(runs: Run[], authorMode = false): string {
  let value = '', end = -Infinity;
  for (const run of runs) {
    if (authorMode && /^[\d*†‡§]+$/.test(run.text.trim())) { value += ', '; end = run.x + run.width; continue; }
    const gap = run.x - end;
    const separator = authorMode && gap > run.size * .8 ? ', ' : gap > run.size * .12 ? ' ' : '';
    value += (value ? separator : '') + run.text; end = run.x + run.width;
  }
  return clean(value);
}
function headerTitle(lines: Line[], height: number): { title: string; last: Line; first: Line } | undefined {
  // A title may contain words such as "Research" or "University"; don't apply author-affiliation rules.
  const pool = lines.filter(l => l.y < height * .5 && validTitle(l.text) && !/^(?:proceedings of|published|©|doi[: ]|https?:\/\/|www\.|issn)/i.test(l.text));
  if (!pool.length) return;
  const biggest = Math.max(...pool.map(l => l.size));
  const sizes = lines.filter(l => letters(l.text) > 20).map(l => l.size).sort((a, b) => a - b);
  const body = sizes[Math.floor(sizes.length / 2)] ?? biggest;
  if (biggest < body * 1.15) return;
  const first = pool.find(l => l.size >= biggest * .97)!;
  const block = [first];
  for (const line of lines.filter(l => l.y > first.y)) {
    const previous = block.at(-1)!;
    if (block.length >= 6 || line.y - previous.y > biggest * 2 || Math.abs(line.size - first.size) > biggest * .12 || !validTitle(line.text)) break;
    block.push(line);
  }
  const title = validTitle(block.map(l => l.text).join(' ').replace(/-\s+(?=[a-z])/g, '-'));
  return title ? { title, first, last: block.at(-1)! } : undefined;
}
function headerAuthors(lines: Line[], block: NonNullable<ReturnType<typeof headerTitle>>): string[] | undefined {
  const names: string[] = [];
  for (const line of lines.filter(l => l.y > block.last.y + 2 && l.y < block.last.y + 110)) {
    if (line.size >= block.first.size * .96 || affiliation.test(line.text)) break;
    const found = parseAuthors(joinRuns(line.runs, true), false);
    if (!found) break;
    names.push(...found);
    if (names.length > 100) break;
  }
  return names.length ? [...new Set(names)] : undefined;
}
function extractDoi(raw: unknown): string | undefined {
  const text = Array.isArray(raw) ? raw.map(clean).join(' ') : clean(raw);
  return text.match(/\b10\.\d{4,9}\/[\w.()/:;-]+/i)?.[0]?.replace(/[.,;]+$/, '').toLowerCase();
}
function publicationYear(raw: unknown): number | undefined {
  const match = clean(raw).match(/\b(?:18|19|20)\d{2}\b/);
  return match && Number(match[0]) <= new Date().getFullYear() + 1 ? Number(match[0]) : undefined;
}

/** Uses the already-open PDF worker. Failure never prevents saving the original PDF. */
export async function extractPdfBibliography(pdf: PDFDocumentProxy, signal: AbortSignal): Promise<PdfBibliography> {
  const result: PdfBibliography = { version: PDF_BIBLIOGRAPHY_VERSION, sources: {} };
  try {
    const { info, metadata } = await pdf.getMetadata(); abortIfNeeded(signal);
    const values = info as Record<string, unknown>;
    result.title = validTitle(metadata?.get('dc:title')) ?? validTitle(values.Title);
    result.authors = parseAuthors(metadata?.get('dc:creator'), true) ?? parseAuthors(values.Author, true);
    result.doi = extractDoi(metadata?.get('prism:doi')) ?? extractDoi(metadata?.get('dc:identifier')) ?? extractDoi(values.DOI);
    result.venue = clean(metadata?.get('prism:publicationname')) || undefined;
    // CreationDate/ModDate describe the PDF file, not publication. Never infer from them.
    result.year = publicationYear(metadata?.get('prism:publicationdate'));
    for (const field of ['title', 'authors', 'doi', 'venue', 'year'] as const) if (result[field]) result.sources[field] = 'pdf-metadata';
  } catch { abortIfNeeded(signal); }
  try {
    const page = await pdf.getPage(1); abortIfNeeded(signal);
    const content = await page.getTextContent(); abortIfNeeded(signal);
    const viewport = page.getViewport({ scale: 1 });
    const runs = content.items.filter((item): item is TextItem => 'str' in item && !!item.str.trim()).slice(0, 10000).map(item => {
      const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
      return { text: item.str, x: x!, y: y!, width: item.width, size: Math.hypot(item.transform[2], item.transform[3]) };
    }).filter(r => r.size > 0 && Number.isFinite(r.x) && Number.isFinite(r.y));
    const lines = makeLines(runs), block = headerTitle(lines, viewport.height);
    if (!result.title && block) { result.title = block.title; result.sources.title = 'first-page'; }
    if (!result.authors && block) { result.authors = headerAuthors(lines, block); if (result.authors) result.sources.authors = 'first-page'; }
    if (!result.doi) {
      const line = lines.find(l => /^doi\s*:/i.test(l.text));
      result.doi = extractDoi(line?.text); if (result.doi) result.sources.doi = 'first-page';
    }
    if (!result.year) {
      // Only explicit publishing/copyright labels, not arbitrary years in the abstract.
      const candidates = lines.flatMap(l => [...l.text.matchAll(/(?:Published\s*:|Copyright\s*(?:©)?|©\s*(?:Author\(s\))?)\s*[^\d]{0,40}(?:\d{1,2}\s*[^\d]{1,20})?((?:19|20)\d{2})/gi)].map(m => Number(m[1])));
      const unique = [...new Set(candidates)].filter(y => y <= new Date().getFullYear() + 1);
      if (unique.length === 1) { result.year = unique[0]; result.sources.year = 'first-page'; }
    }
    if (!result.venue) {
      const header = lines.find(l => l.y < viewport.height * .15 && /^.+?,\s*\d+(?:\([^)]*\))?,\s*\d+[–-]\d+,\s*(?:19|20)\d{2}\b/.test(l.text));
      if (header) { result.venue = header.text.split(',')[0]?.trim(); result.sources.venue = 'first-page'; }
    }
    page.cleanup();
  } catch { abortIfNeeded(signal); }
  return result;
}
