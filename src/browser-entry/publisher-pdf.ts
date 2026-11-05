/** Science's ePDF URL is an HTML reader; /doi/pdf is the corresponding PDF. */
export function publisherPdfUrl(raw: string): string | undefined {
  try {
    const url = new URL(raw.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
    if (!['science.org', 'www.science.org'].includes(url.hostname) || url.port) return;
    if (!/^\/doi\/(?:epdf|pdf|full|abs)\/10\.\d{4,9}\/.+/.test(url.pathname)) return;
    url.pathname = url.pathname.replace(/^\/doi\/(?:epdf|full|abs)\//, '/doi/pdf/');
    url.hash = '';
    return url.href;
  } catch { return; }
}
/** Scholar PDF Reader explicitly leaves PDFs with this fragment to the caller. */
export function paperpaneNavigationUrl(raw: string): string {
  const url = new URL(publisherPdfUrl(raw) ?? raw);
  const fragment = new URLSearchParams(url.hash.slice(1));
  fragment.set('gsr', '0');
  url.hash = fragment.toString();
  return url.href;
}
