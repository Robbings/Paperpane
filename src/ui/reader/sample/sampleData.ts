import type { AnnotationView, DocumentHeaderView, OutlineItemView } from '../types';

// 示例数据：在文档与标注逻辑接入之前使用。

export const sampleHeader: DocumentHeaderView = {
  title: 'Recovering Reading Order in Two-Column Scientific PDFs',
  sourceLabel: '本地文件',
  pageCount: 6,
};

export const sampleOutline: OutlineItemView[] = [
  { id: 'abstract', label: 'Abstract', level: 0, pageIndex: 0 },
  { id: 's1', label: '1  Introduction', level: 0, pageIndex: 0 },
  { id: 's2', label: '2  Related Work', level: 0, pageIndex: 0 },
  { id: 's3', label: '3  Block Model', level: 0, pageIndex: 1 },
  { id: 's3-1', label: '3.1  Glyph grouping', level: 1, pageIndex: 1 },
  { id: 's3-2', label: '3.2  Column assignment', level: 1, pageIndex: 2 },
  { id: 's4', label: '4  Ordering Rules', level: 0, pageIndex: 3 },
  { id: 's5', label: '5  Re-projection', level: 0, pageIndex: 4 },
  { id: 'refs', label: 'References', level: 0, pageIndex: 5 },
];

export const sampleAnnotations: AnnotationView[] = [
  {
    id: 'a1',
    kind: 'highlight',
    color: 'yellow',
    pageIndex: 0,
    quote: 'text is stored in drawing order rather than reading order',
    note: '核心问题：PDF 里文字的存储顺序不是阅读顺序。',
  },
  { id: 'a2', kind: 'highlight', color: 'blue', pageIndex: 0, quote: 'keeps every block linked to its position on the page' },
  {
    id: 'a3',
    kind: 'highlight',
    color: 'green',
    pageIndex: 0,
    quote: 'Rule-based methods are transparent but fragile on unusual templates',
    note: '可以和我们组之前用的方法对比一下。',
  },
  {
    id: 'a4',
    kind: 'comment',
    color: 'pink',
    pageIndex: 3,
    note: '图 2 的坐标原点画在左下角，和正文说的左上角不一致，需要再确认。',
  },
];
