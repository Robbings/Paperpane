import type { PageRect } from '../LocateFlash';
import { viewToPage } from './pageFrame';

// 示例接线：在示例论文的 DOM 里按引文查找位置。真实阅读器由逻辑层用锚点和
// 页面坐标完成，这里只为演示"跳回原文"的界面效果。

const normalize = (text: string) => text.replace(/\s+/g, ' ').toLowerCase();

/** Finds a quote on one of the pages under `root` and returns its page element and line boxes in the page's own (unturned) coordinates. */
export function findQuote(root: HTMLElement, quote: string): { page: HTMLElement; rects: PageRect[] } | null {
  const target = normalize(quote).trim();
  if (!target) return null;
  for (const page of Array.from(root.querySelectorAll<HTMLElement>('[data-page-index]'))) {
    // The page text with whitespace runs collapsed, and for each character the node and offset it came from.
    const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
    let text = '';
    const origin: { node: Text; offset: number }[] = [];
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      const value = node.data;
      for (let i = 0; i < value.length; i++) {
        const char = /\s/.test(value[i]!) ? ' ' : value[i]!.toLowerCase();
        if (char === ' ' && text.endsWith(' ')) continue;
        text += char;
        origin.push({ node, offset: i });
      }
    }
    const at = text.indexOf(target);
    if (at < 0) continue;
    const start = origin[at]!;
    const end = origin[at + target.length - 1]!;
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset + 1);
    const rects = Array.from(range.getClientRects())
      .filter((r) => r.width > 1 && r.height > 1)
      .map((r) => viewToPage(page, r));
    return { page, rects };
  }
  return null;
}
