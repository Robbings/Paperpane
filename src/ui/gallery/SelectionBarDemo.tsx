import { SelectionMenu, type SelectionMenuAction, type SelectionMenuLook } from '@/ui/components';
import './SelectionBarDemo.css';

// 审阅用：选区浮动条的几种样式并排放在论文页上比较。reader.html?view=selbar 打开。

const actions: SelectionMenuAction[] = [
  { id: 'comment', label: '评论', icon: 'comment' },
  { id: 'translate', label: '翻译', icon: 'translate' },
  { id: 'explain', label: '解释', icon: 'explain' },
  { id: 'ask', label: '提问', icon: 'ask' },
  { id: 'copy', label: '复制', icon: 'copy' },
];

const looks: { look: SelectionMenuLook; name: string; note: string }[] = [
  { look: 'text', name: '方案一 · 文字', note: '文字缩小到 12px、常规字重。最紧凑，但五个词连在一起时不容易一眼找到。' },
  { look: 'icon', name: '方案二 · 图标', note: '只有图标，悬停显示名称。最小最整齐，但翻译、解释、提问的图标需要先认一认。' },
  { look: 'both', name: '方案三 · 图标加文字', note: '图标在左、文字在右。最直观，条也最宽。' },
  { look: 'stacked', name: '方案四 · 图标在上、文字在下', note: '像系统工具栏：图标做主体，下面一行小字说明。宽度接近方案一，高一些，扫一眼就能认出。' },
  { look: 'reveal', name: '方案五 · 图标，悬停展开文字', note: '平时只有图标，指针移上去时名称从图标旁滑出来。安静，但第一次用要靠悬停。' },
];

export function SelectionBarDemo() {
  return (
    <main className="pp-selbar-demo">
      <header>
        <h1>选区浮动条：五种样式</h1>
        <p>每种样式上面一行是新选中文字时的条，下面一行是点在已有高亮上的条（带当前颜色和删除）。可以把指针移上去看悬停效果；地址后加 ?theme=dark 看深色。</p>
      </header>
      {looks.map(({ look, name, note }) => (
        <section key={look} className="pp-selbar-demo__case">
          <div className="pp-selbar-demo__label">
            <h2>{name}</h2>
            <p>{note}</p>
          </div>
          <div className="pp-selbar-demo__paper">
            <div className="pp-selbar-demo__bars">
              <SelectionMenu label="选区操作" actions={actions} look={look} />
              <SelectionMenu label="高亮操作" actions={actions} look={look} currentColor="yellow" onDelete={() => undefined} />
            </div>
            <p>
              Scientific papers are distributed as PDF files whose <mark className="pp-selbar-demo__selection">text is stored in drawing order rather than reading order</mark>. For two-column layouts, figures, footnotes and equations interleave with body text.
            </p>
          </div>
        </section>
      ))}
    </main>
  );
}
