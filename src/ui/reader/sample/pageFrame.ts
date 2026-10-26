import type { ViewRect } from '../types';

// 示例接线：示例页面可以旋转（CSS 旋转整页）。页面上的框以"未旋转时的页面左上角"为原点、
// CSS 像素为单位保存；这里在它和窗口坐标之间换算，相当于 PDF 视口的坐标变换。

const rotationOf = (page: HTMLElement) => Number(page.closest<HTMLElement>('[data-rotation]')?.dataset.rotation ?? 0) % 360;

/** Window point → the page's own unturned coordinates, and back. */
function frame(page: HTMLElement) {
  const w = page.offsetWidth;
  const h = page.offsetHeight;
  const box = page.getBoundingClientRect();
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const rotation = rotationOf(page);
  // Clockwise turns, with y pointing down.
  const turn = (x: number, y: number, by: number): [number, number] =>
    by === 90 ? [-y, x] : by === 180 ? [-x, -y] : by === 270 ? [y, -x] : [x, y];
  return {
    toView: (x: number, y: number) => {
      const [dx, dy] = turn(x - w / 2, y - h / 2, rotation);
      return [cx + dx, cy + dy] as const;
    },
    toPage: (x: number, y: number) => {
      const [dx, dy] = turn(x - cx, y - cy, (360 - rotation) % 360);
      return [w / 2 + dx, h / 2 + dy] as const;
    },
  };
}

const boxOf = (a: readonly [number, number], b: readonly [number, number]): ViewRect => ({
  left: Math.min(a[0], b[0]),
  top: Math.min(a[1], b[1]),
  width: Math.abs(a[0] - b[0]),
  height: Math.abs(a[1] - b[1]),
});

/** A box on the window (e.g. a line of a selection) in the page's unturned coordinates. */
export function viewToPage(page: HTMLElement, rect: ViewRect): ViewRect {
  const { toPage } = frame(page);
  return boxOf(toPage(rect.left, rect.top), toPage(rect.left + rect.width, rect.top + rect.height));
}

/** A box in the page's unturned coordinates where it now shows on the window. */
export function pageToView(page: HTMLElement, rect: ViewRect): ViewRect {
  const { toView } = frame(page);
  return boxOf(toView(rect.left, rect.top), toView(rect.left + rect.width, rect.top + rect.height));
}
