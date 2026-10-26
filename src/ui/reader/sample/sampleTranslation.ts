import type { TranslationSentenceKind } from '../translation/types';

// 示例译文：与示例论文逐句对应。原句必须与论文中的文字一致（空白不计），演示时据此在论文中找到位置。
// 第 1 页已翻译；第 2 页演示"翻译这一页"时逐字出现。

export interface SampleSentence {
  id: string;
  pageIndex: number;
  kind: TranslationSentenceKind;
  source: string;
  text: string;
  paragraphStart?: boolean;
}

const s = (pageIndex: number, kind: TranslationSentenceKind, source: string, text: string, paragraphStart = false): Omit<SampleSentence, 'id'> => ({
  pageIndex,
  kind,
  source,
  text,
  paragraphStart,
});

const list: Omit<SampleSentence, 'id'>[] = [
  s(0, 'heading', 'Recovering Reading Order in Two-Column Scientific PDFs', '恢复双栏科技论文 PDF 的阅读顺序'),
  s(0, 'heading', 'Abstract', '摘要'),
  s(0, 'text', 'Scientific papers are distributed as PDF files whose text is stored in drawing order rather than reading order.', '科技论文以 PDF 文件分发，其中的文字按绘制顺序而非阅读顺序存储。', true),
  s(0, 'text', 'For two-column layouts, figures, footnotes and equations interleave with body text, so naive extraction produces sentences that jump between columns.', '在双栏版式中，图、脚注和公式与正文交错，简单提取得到的句子会在两栏之间来回跳。'),
  s(0, 'text', 'We describe a layout-aware procedure that groups glyphs into blocks, assigns each block to a column, and orders blocks with a small set of geometric rules.', '我们提出一种感知版面的方法：把字形归并为块，为每个块指定所属的栏，再用一小组几何规则给块排序。'),
  s(0, 'text', 'The procedure needs no training data and keeps every block linked to its position on the page, which lets downstream tools such as search, highlighting and translation point back to the exact source.', '该方法无需训练数据，并让每个块始终与它在页面上的位置相关联，使搜索、高亮、翻译等下游工具能准确指回原文。'),
  s(0, 'heading', '1 Introduction', '1 引言'),
  s(0, 'text', 'Readers increasingly rely on software that searches, annotates and translates papers.', '读者越来越依赖能检索、批注和翻译论文的软件。', true),
  s(0, 'text', 'All of these tasks depend on a text stream in the order a person would read it.', '这些任务都依赖一条按人的阅读顺序排列的文字流。'),
  s(0, 'text', 'PDF does not guarantee such an order: a file may draw the second column before the first, or place a caption between two halves of a paragraph.', 'PDF 并不保证这种顺序：文件可能先绘制第二栏再绘制第一栏，也可能把图注放在一段话的中间。'),
  s(0, 'text', 'A second requirement is traceability.', '第二个要求是可追溯。', true),
  s(0, 'text', 'When a tool shows a translated sentence or an extracted quote, the reader should be able to return to the place it came from.', '当工具展示一句译文或一段摘录时，读者应当能回到它在原文中的位置。'),
  s(0, 'text', 'This paper makes three contributions.', '本文有三点贡献。', true),
  s(0, 'text', 'We define a block model that keeps text, kind and geometry together.', '我们定义了一种块模型，把文字、类型和几何信息放在一起。'),
  s(0, 'text', 'We give ordering rules for the common two-column template and its variants.', '我们为常见的双栏模板及其变体给出排序规则。'),
  s(0, 'text', 'We describe how blocks are re-projected when the page is zoomed or rotated.', '我们说明页面缩放或旋转时，块如何重新投影。'),
  s(0, 'text', 'Coordinates must therefore survive extraction, zoom and rotation, and a block should keep a stable identifier when the same file is opened again.', '因此，坐标必须在提取、缩放和旋转之后保持有效；同一文件再次打开时，块也应保持稳定的标识。', true),
  s(0, 'text', 'Without this, a highlight made yesterday may land on the wrong line today.', '否则，昨天做的高亮今天可能落到错误的行上。'),
  s(0, 'heading', '2 Related Work', '2 相关工作'),
  s(0, 'text', 'Earlier approaches fall into rule-based segmentation and learned layout models.', '已有方法分为基于规则的切分和基于学习的版面模型两类。', true),
  s(0, 'text', 'Rule-based methods are transparent but fragile on unusual templates; learned models are robust but require labelled pages and can hide why a block was placed where it was.', '基于规则的方法透明，但遇到少见的模板容易出错；基于学习的模型更稳健，却需要标注页面，而且可能看不出一个块为什么被放在那里。'),
  s(0, 'text', 'Our procedure stays on the rule-based side and adds an explicit record of every decision, so a wrong order can be traced to the rule that produced it.', '我们的方法属于基于规则的一类，并为每个决定留下明确记录，因此错误的顺序可以追溯到产生它的那条规则。', true),

  s(1, 'heading', '3 Block Model', '3 块模型'),
  s(1, 'text', 'A block is a run of glyphs that share a baseline grid and a font.', '块是一串共享基线网格和字体的字形。', true),
  s(1, 'text', 'Each block records its text, its kind and its bounding box in page coordinates.', '每个块记录自己的文字、类型，以及以页面坐标表示的外接框。'),
  s(1, 'text', 'Kinds include body text, heading, caption, footnote and equation.', '类型包括正文、标题、图注、脚注和公式。'),
  s(1, 'text', 'Blocks are built bottom-up.', '块自下而上构建。', true),
  s(1, 'text', 'Glyphs are first joined into lines when their gaps are smaller than a fraction of the font size, and lines are joined into blocks when their left edges align.', '当字形间距小于字号的一定比例时，先把字形连成行；当各行左边缘对齐时，再把行合并成块。'),
  s(1, 'formula', 'd(a, b) = max(0, xb − xa − wa) / s', '公式 (1)'),
  s(1, 'text', 'Equation 1 gives the normalised horizontal gap between two glyphs, where s is the font size.', '公式 1 给出两个字形之间归一化的水平间距，其中 s 为字号。', true),
  s(1, 'text', 'A gap below 0.25 keeps the glyphs in the same word.', '间距小于 0.25 的字形视为同一个词。'),
  s(1, 'figure', 'Figure 1: Blocks found on a two-column page, coloured by kind.', '图 1：双栏页面上识别出的块，按类型着色。'),
  s(1, 'heading', '4 Ordering Rules', '4 排序规则'),
  s(1, 'text', 'Blocks are ordered column by column.', '块按栏依次排序。', true),
  s(1, 'text', 'A block belongs to the left column when its centre lies left of the gutter, and full-width blocks such as titles are placed before the columns they span.', '中心位于栏间空白左侧的块属于左栏；标题这类通栏的块排在它所跨越的各栏之前。'),
  s(1, 'text', 'Captions follow the figure they describe, and footnotes are moved to the end of the page so that they never split a sentence of body text.', '图注紧跟它所描述的图，脚注移到页末，避免把正文的句子截断。', true),
];

export const sampleSentences: SampleSentence[] = list.map((item, index) => ({ ...item, id: `s${index + 1}` }));
