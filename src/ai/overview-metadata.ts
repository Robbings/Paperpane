import type { OverviewRun } from './types';

/** Tags are shared by the overview and library; source markers never form labels. */
export function cleanOverviewTags(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.map(value => value
    .replace(/\[(?:\^?s\d+[^\]]*|\d+)\]/gi, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*`#]/g, '').replace(/^\s*(?:[-•]|\d+[.)、])\s*/, '')
    .replace(/\s+/g, ' ').trim())
    .filter(value => {
      if (!value || value.length > 40 || /[\n:：;；。]/.test(value) || value.split(' ').length > 3) return false;
      const key = value.normalize('NFKC').toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).slice(0, 6);
}
export function overviewMetadata(run?: OverviewRun) {
  const gist = run?.results.gist, keywords = run?.results.keywords;
  const abstract = gist?.state === 'completed' && gist.content?.output === 'markdown'
    ? gist.content.markdown.replace(/\[\^[^\]]+\]/g, '').trim() : undefined;
  const tags = keywords?.state === 'completed' && keywords.content?.output === 'list'
    ? cleanOverviewTags(keywords.content.items.map(item => item.text)) : undefined;
  return { abstract, tags };
}
