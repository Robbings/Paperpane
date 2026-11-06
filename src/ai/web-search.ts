import type { Protocol } from '@/ui/settings/types';

/** A compatible chat endpoint alone does not imply support for server-side search. */
export function supportsWebSearch(protocol: Protocol, modelId: string): boolean {
  return protocol === 'openai-responses' || protocol === 'anthropic' ||
    (protocol === 'openai-chat' && modelId.split('/').at(-1) === 'gpt-5-search-api');
}
export function webSearchOptions(protocol: Protocol, modelId: string) {
  if (!supportsWebSearch(protocol, modelId)) throw new Error('当前模型接口尚未接入联网搜索，请关闭联网或选择支持搜索的模型。');
  if (protocol === 'openai-responses') return { tools: [{ type: 'web_search' }], tool_choice: 'required' };
  if (protocol === 'anthropic') return { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }] };
  return { web_search_options: {}, stream: false };
}
type Citation = { url: string; title: string; end: number };
/** Provider citations are data: accept web URLs only and escape Markdown labels. */
export class WebSearchCitations {
  private citations: Citation[] = [];
  searched = false;
  add(value: any, end: number) {
    if (!value || typeof value.url !== 'string') return;
    let url: URL; try { url = new URL(value.url); } catch { return; }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return;
    const title = String(value.title || url.hostname).replace(/[\r\n]+/g, ' ').replace(/[\\[\]<>]/g, '\\$&');
    const position = Number.isInteger(value.end_index) ? value.end_index : end;
    if (!this.citations.some(c => c.url === url.href && c.end === position)) this.citations.push({ url: url.href.replace(/[()<>]/g, c => encodeURIComponent(c)), title, end: position });
    this.searched = true;
  }
  responses(output: any[], end: number) {
    let offset = 0;
    for (const item of output ?? []) {
      if (item.type === 'web_search_call') {
        if (item.status === 'failed') throw new Error('联网搜索失败，请重试或关闭联网。');
        if (item.status === 'completed') this.searched = true;
      }
      for (const content of item.type === 'message' ? item.content ?? [] : []) {
        for (const annotation of content.annotations ?? []) if (annotation.type === 'url_citation') this.add({ ...annotation, end_index: offset + annotation.end_index }, end);
        offset += (content.text ?? '').length;
      }
    }
  }
  anthropic(block: any, end: number) {
    if (block?.type === 'web_search_tool_result') {
      if (block.content?.type === 'web_search_tool_result_error') throw new Error('联网搜索失败：' + String(block.content.error_code ?? '服务暂不可用'));
      if (Array.isArray(block.content)) this.searched = true;
    }
    for (const citation of block?.citations ?? []) if (citation.type === 'web_search_result_location') this.add(citation, end);
  }
  format(text: string): string {
    if (!this.searched) throw new Error('模型服务没有执行联网搜索。请检查服务是否支持，或关闭联网后重试。');
    const grouped = new Map<number, Citation[]>();
    for (const c of this.citations) {
      const position = Math.max(0, Math.min(text.length, c.end));
      grouped.set(position, [...grouped.get(position) ?? [], c]);
    }
    let result = text;
    for (const [end, citations] of [...grouped].sort((a, b) => b[0] - a[0])) {
      const links = citations.map(c => `[${c.title}](<${c.url}>)`).join('、');
      result = result.slice(0, end) + `（${links}）` + result.slice(end);
    }
    return result;
  }
}
