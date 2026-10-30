/** Resolve only official arXiv paper URLs. Keep the requested version intact. */
export function arxivPdfUrl(raw: string): string {
  const url = new URL(raw);
  if (!['https:', 'http:'].includes(url.protocol) || url.hostname !== 'arxiv.org' || url.port || url.username || url.password) {
    throw new Error('仅支持 arXiv 官方论文链接。');
  }
  const match = /^\/(?:abs|pdf|html)\/((?:\d{4}\.\d{4,5}|[a-z][a-z0-9.-]*(?:\.[A-Z]{2})?\/\d{7})(?:v[1-9]\d*)?)(?:\.pdf)?\/?$/.exec(url.pathname);
  if (!match) throw new Error('无法识别这篇 arXiv 论文，请在论文详情页重试。');
  return `https://arxiv.org/pdf/${match[1]}`;
}

export function readerImportUrl(readerUrl: string, paperUrl: string): string {
  const url = new URL(readerUrl);
  url.searchParams.set('import', arxivPdfUrl(paperUrl));
  url.searchParams.set('source', 'arxiv');
  return url.href;
}
