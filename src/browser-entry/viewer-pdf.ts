import { isPdfLink, pdfSourceUrl } from './pdf';

/** Only explicit interstitials: article text mentioning verification is not a blocker. */
export function isVerificationPage(doc: Document): boolean {
  return /^(?:just a moment|security check|access denied|verify (?:you are human|your identity)|checking your browser|人机验证|安全验证|请稍候|请稍等|正在验证|正在进行安全验证)[.!…\s]*$/i.test(doc.title.trim())
    || !!doc.querySelector('#challenge-form, #cf-challenge-running, form[action*="/cdn-cgi/challenge"], #captcha-form');
}
export function pdfResourceHint(raw: string): boolean {
  try { return isPdfLink(raw) || /\/(?:pdfdirect|pdf|downloadpdf)\//i.test(new URL(raw).pathname); } catch { return false; }
}
function doi(raw: string): string | undefined {
  try { return decodeURIComponent(new URL(raw).pathname).match(/\b10\.\d{4,9}\/[^?#]+/)?.[0].replace(/\/$/, ''); } catch { return; }
}
export function samePdfArticle(a: string, b: string): boolean {
  try {
    const left = new URL(a), right = new URL(b);
    const samePath = left.pathname === right.pathname && (left.search === right.search
      || (isPdfLink(a) && !left.search) || (isPdfLink(b) && !right.search));
    const sameDoi = !!doi(a) && doi(a) === doi(b);
    return left.origin === right.origin && (samePath || sameDoi);
  } catch { return false; }
}

/** Resource timing also covers PDFs fetched before the content script started. */
export function observeViewerPdfs(doc: Document, changed: () => void) {
  const resources: string[] = [];
  const pageUrl = pdfSourceUrl(doc.location.href);
  const add = (raw: string, responseConfirmed = false) => {
    if (doc.location.href.split('#')[0] !== pageUrl || isVerificationPage(doc)) return;
    let url: string;
    try { url = pdfSourceUrl(raw); } catch { return; }
    if (!responseConfirmed && !pdfResourceHint(url)) return;
    if (resources.includes(url)) return;
    resources.push(url); if (resources.length > 16) resources.shift();
    changed();
  };
  let scanned = 0;
  const scan = () => {
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    if (entries.length < scanned) scanned = 0;
    const fresh = entries.slice(scanned); scanned = entries.length;
    for (const entry of fresh) {
      if (['fetch', 'xmlhttprequest', 'iframe', 'embed', 'object'].includes(entry.initiatorType)) add(entry.name);
    }
  };
  scan();
  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
      if (['fetch', 'xmlhttprequest', 'iframe', 'embed', 'object'].includes(entry.initiatorType)) add(entry.name);
    }
  });
  observer.observe({ type: 'resource', buffered: true });
  const list = () => doc.location.href.split('#')[0] === pageUrl && !isVerificationPage(doc) ? [...resources].reverse() : [];
  const resolve = (candidate?: string) => {
    const urls = list();
    if (candidate) return urls.find(url => url === candidate || samePdfArticle(url, candidate));
    return urls.find(url => samePdfArticle(url, pageUrl))
      ?? (urls.length === 1 && doc.querySelector('canvas, embed, object, iframe') ? urls[0] : undefined);
  };
  return { add, list, resolve, scan, dispose: () => observer.disconnect() };
}
