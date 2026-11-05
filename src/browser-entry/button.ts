const CSS = `
button[data-paperpane-button] { all:initial; box-sizing:border-box; display:inline-flex; align-items:center; justify-content:center; min-height:32px; padding:6px 12px; border:1px solid #3c4fcc; border-radius:7px; background:#4055ce; color:#fff; font:500 12px/1.5 system-ui,sans-serif; text-align:center; text-decoration:none; cursor:pointer; box-shadow:0 1px 3px #0002; }
button[data-paperpane-button]:hover { background:#3044b4; }
button[data-paperpane-button]:focus-visible { outline:3px solid #aabaff; outline-offset:3px; }
button[data-paperpane-button]:disabled { opacity:.65; cursor:wait; }
button[data-paperpane-button][data-look=link] { display:inline; min-height:0; padding:0; border:0; border-radius:0; background:none; box-shadow:none; color:LinkText; font:inherit; text-decoration:none; }
button[data-paperpane-button][data-look=link]:hover { background:none; text-decoration:underline; }
`;
/**
 * 'link' sits in a page's own list of links and reads like one of them (text in the link colour);
 * 'solid' floats over a PDF, where it has to stand out from the document.
 */
export function createPdfButton(doc: Document, open: () => Promise<void>, label = '在纸间中打开', look: 'solid' | 'link' = 'solid'): HTMLButtonElement {
  if (!doc.getElementById('paperpane-entry-style')) {
    const style = doc.createElement('style'); style.id = 'paperpane-entry-style'; style.textContent = CSS;
    (doc.head ?? doc.documentElement).append(style);
  }
  const button = doc.createElement('button');
  button.type = 'button'; button.dataset.paperpaneButton = ''; button.textContent = label;
  if (look === 'link') button.dataset.look = 'link';
  button.addEventListener('click', async event => {
    if (!event.isTrusted) return;
    event.preventDefault(); event.stopPropagation();
    if (button.disabled) return;
    button.disabled = true; button.textContent = '正在打开…';
    try { await open(); button.textContent = '已转交纸间 · 再次打开'; button.title = ''; }
    catch (error) { button.textContent = '打开失败 · 点击重试'; button.title = error instanceof Error ? error.message : '请刷新页面重试。'; }
    finally { button.disabled = false; }
  });
  return button;
}
