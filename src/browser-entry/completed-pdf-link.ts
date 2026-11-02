import type { browser } from 'wxt/browser';

/** Self-contained: Chrome serializes this function into the PDF document. */
export function mountCompletedPdfLink(expectedUrl: string) {
  if (document.contentType !== 'application/pdf' || location.href.split('#')[0] !== expectedUrl) return false;
  const id = 'paperpane-completed-pdf-link';
  if (document.getElementById(id)) return true;
  const host = document.createElement('div');
  host.id = id;
  host.style.cssText = 'position:fixed;left:20px;bottom:20px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `button{all:initial;box-sizing:border-box;text-decoration:none;display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border:1px solid #ffffff30;border-radius:12px;background:#303036e6;color:#f5f5f7;font:500 13px/1.5 system-ui,sans-serif;box-shadow:0 4px 18px #0003;backdrop-filter:blur(16px);cursor:pointer}button:hover{background:#404048}button:focus-visible{outline:2px solid #88aaff;outline-offset:3px}button:disabled{opacity:.65;cursor:wait}`;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '在纸窗中打开';
  button.title = '将当前 PDF 导入文献库并在纸窗阅读器中打开';
  button.addEventListener('click', async event => {
    if (!event.isTrusted || button.disabled) return;
    button.disabled = true;
    try {
      const api = (globalThis as unknown as { chrome: typeof browser }).chrome;
      const result = await api.runtime.sendMessage({ type: 'OPEN_CURRENT_PDF' });
      if (!result?.ok) throw new Error(result?.error ?? '无法打开纸窗');
      button.textContent = '已转交纸窗 · 再次打开';
      button.title = '将当前 PDF 导入文献库并在纸窗阅读器中打开';
    } catch (error) {
      button.textContent = '打开失败 · 点击重试';
      button.title = error instanceof Error ? error.message : '请通过纸窗扩展弹窗重试';
    } finally { button.disabled = false; }
  });
  root.append(style, button);
  document.documentElement.append(host);
  return true;
}
