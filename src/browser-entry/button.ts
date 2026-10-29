const CSS = `
button[data-paperpane-button] { all:initial; box-sizing:border-box; display:inline-flex; align-items:center; justify-content:center; min-height:32px; padding:6px 12px; border:1px solid #3c4fcc; border-radius:7px; background:#4055ce; color:#fff; font:500 12px/1.5 system-ui,sans-serif; text-align:center; text-decoration:none; cursor:pointer; box-shadow:0 1px 3px #0002; }
button[data-paperpane-button]:hover { background:#3044b4; }
button[data-paperpane-button]:focus-visible { outline:3px solid #aabaff; outline-offset:3px; }
button[data-paperpane-button]:disabled { opacity:.65; cursor:wait; }
`;
export function createPdfButton(doc: Document, open: () => Promise<void>, label = '在 Paperpane 中打开'): HTMLButtonElement {
  if (!doc.getElementById('paperpane-entry-style')) {
    const style = doc.createElement('style'); style.id = 'paperpane-entry-style'; style.textContent = CSS;
    (doc.head ?? doc.documentElement).append(style);
  }
  const button = doc.createElement('button');
  button.type = 'button'; button.dataset.paperpaneButton = ''; button.textContent = label;
  button.addEventListener('click', async event => {
    event.preventDefault(); event.stopPropagation();
    if (button.disabled) return;
    button.disabled = true; button.textContent = '正在打开…';
    try { await open(); button.textContent = '已打开 · 再次打开'; button.title = ''; }
    catch (error) { button.textContent = '打开失败 · 点击重试'; button.title = error instanceof Error ? error.message : '请刷新页面重试。'; }
    finally { button.disabled = false; }
  });
  return button;
}
