import type { FolderView, LibraryQuery, PaperView, TagView } from '../types';

// 示例数据：在文献库逻辑接入之前驱动界面。题名、作者均为样稿自拟。

export const sampleFolders: FolderView[] = [
  { id: 'f-thesis', name: '毕业论文', parentId: null },
  { id: 'f-thesis-related', name: '相关工作', parentId: 'f-thesis' },
  { id: 'f-thesis-method', name: '方法参考', parentId: 'f-thesis' },
  { id: 'f-reading', name: '组会精读', parentId: null },
  { id: 'f-reading-2026', name: '2026 秋季', parentId: 'f-reading' },
  { id: 'f-later', name: '稍后再读', parentId: null },
];

export const sampleTags: TagView[] = [
  { id: 't-method', label: '方法' },
  { id: 't-survey', label: '综述' },
  { id: 't-dataset', label: '数据集' },
  { id: 't-baseline', label: '基线' },
  { id: 't-layout', label: '版面分析' },
  { id: 't-retrieval', label: '检索' },
  { id: 't-todo', label: '待复现' },
];

const titles: [string, string[], number, string][] = [
  ['Recovering Reading Order in Two-Column Scientific PDFs', ['A. Author', 'B. Author', 'C. Author'], 2025, 'Document Analysis Workshop'],
  ['Layout-Aware Block Segmentation without Training Data', ['L. Moreau', 'K. Tanaka'], 2024, 'Journal of Document Engineering'],
  ['A Survey of Scientific Document Understanding', ['R. Ibrahim', 'S. Lindqvist', 'M. Okafor'], 2026, 'Computing Surveys'],
  ['Stable Anchors for Annotations across Document Versions', ['J. Novak', 'P. Haddad'], 2023, 'Hypertext Conference'],
  ['Caption Detection in Figure-Heavy Papers', ['H. Mendes'], 2022, 'Pattern Recognition Letters'],
  ['Equation Regions as First-Class Blocks', ['T. Ishikawa', 'E. Varga'], 2025, 'Document Analysis Workshop'],
  ['Retrieval over Long Technical Documents', ['N. Patel', 'G. Rossi', 'D. Kim'], 2026, 'Information Retrieval Journal'],
  ['Citation Linking with Partial Metadata', ['F. Adeyemi', 'C. Brandt'], 2024, 'Digital Libraries Conference'],
  ['Measuring Reading Behaviour in PDF Readers', ['I. Sato', 'W. Nkosi'], 2023, 'Human Factors in Computing'],
  ['A Dataset of Annotated Two-Column Papers', ['Y. Chen', 'O. Petrov', 'A. Dubois'], 2025, 'Data Track'],
  ['Robust Table Structure Recognition', ['M. Kowalski', 'S. Ahmed'], 2022, 'Pattern Recognition'],
  ['Re-projecting Highlights under Zoom and Rotation', ['B. Fischer'], 2024, 'Interactive Systems'],
  ['Footnote and Sidebar Handling in Scholarly Layouts', ['E. Laurent', 'Q. Zhang'], 2021, 'Document Engineering Symposium'],
  ['Translation that Keeps Paragraph Anchors', ['K. Müller', 'J. Silva'], 2026, 'Machine Translation Summit'],
  ['Explaining Figures from Their Captions and Context', ['V. Romero', 'H. Ito', 'L. Andersen'], 2025, 'Vision and Language'],
  ['Offline-First Sync for Personal Research Libraries', ['C. Walsh', 'R. Banerjee'], 2024, 'Distributed Systems Letters'],
  ['Conflict Copies in Collaborative Note Taking', ['S. Novak'], 2023, 'Collaboration Conference'],
  ['Evaluating Summaries of Long Scientific Articles', ['D. Herrera', 'A. Lindgren'], 2025, 'Natural Language Workshop'],
  ['Fast Text Layers for Large PDFs', ['P. Okoro', 'T. Weber'], 2022, 'Web Performance Journal'],
  ['Keyword Extraction for Unfamiliar Fields', ['G. Costa', 'M. Ito'], 2024, 'Knowledge Discovery'],
  ['Bibliography Parsing at Scale', ['J. Park', 'U. Bianchi', 'R. Hall'], 2021, 'Digital Libraries Conference'],
  ['Visual Hierarchy in Reading Interfaces', ['A. Yilmaz'], 2023, 'Design Research'],
  ['Scanned Papers without a Text Layer', ['I. Kovac', 'E. Nakamura'], 2022, 'Document Analysis Workshop'],
  ['Comparing Citation Styles for Export', ['L. Ortiz'], 2020, 'Library Technology'],
  ['Grounded Answers with Page-Level Evidence', ['W. Lee', 'F. Morin', 'S. Gupta'], 2026, 'Question Answering Track'],
  ['Long-Context Models Read Papers Differently', ['N. Ivanova', 'C. Torres'], 2026, 'Language Modeling Workshop'],
];

const abstract =
  'We study how readers move through technical papers and what an interface needs to keep their place: stable positions for highlights, an outline that matches the document, and search that respects reading order. Experiments on a set of two-column papers show where current tools lose context and how small layout signals recover it.';

const day = (offset: number) => new Date(Date.UTC(2026, 9, 25) - offset * 86_400_000).toISOString();

export const samplePapers: PaperView[] = titles.map(([title, authors, year, venue], index) => {
  const folderIds = ['f-thesis-related', 'f-thesis-method', 'f-reading-2026', 'f-later', null, 'f-thesis'];
  const tagSets = [['t-layout', 't-method'], ['t-survey'], ['t-dataset', 't-baseline'], [], ['t-retrieval'], ['t-method', 't-todo'], ['t-layout']];
  return {
    id: `p-${index + 1}`,
    title,
    authors,
    year,
    venue,
    abstract,
    addedAt: day(index * 3 + 1),
    lastReadAt: index % 3 === 0 ? day(index) : undefined,
    starred: index % 4 === 0 || index === 9,
    tagIds: tagSets[index % tagSets.length] ?? [],
    folderId: folderIds[index % folderIds.length] ?? null,
    pageCount: 8 + ((index * 7) % 30),
    annotationCount: (index * 5) % 13,
    progress: index % 3 === 0 ? ((index * 17) % 100) / 100 : undefined,
    shortNote: index % 5 === 0 ? '和第三章的方法可以对比。' : undefined,
    source: index % 2 === 0 ? 'local' : 'web',
    hasPdf: index % 9 !== 4,
  };
});

/**
 * 示例：在界面里筛选、排序、分页。真实查询由逻辑层完成（含正文与 AI 摘要的索引）；
 * 这里"正文"和"AI 摘要"范围仅按摘要演示。
 */
export function querySample(papers: PaperView[], folders: FolderView[], query: LibraryQuery) {
  const descendants = (id: string): string[] => [id, ...folders.filter((f) => f.parentId === id).flatMap((f) => descendants(f.id))];
  const inCollection = (paper: PaperView) => {
    switch (query.collection.kind) {
      case 'all':
        return true;
      case 'recent':
        return Boolean(paper.lastReadAt);
      case 'unfiled':
        return paper.folderId === null;
      case 'folder':
        return paper.folderId !== null && descendants(query.collection.folderId).includes(paper.folderId);
    }
  };
  const text = query.text.trim().toLowerCase();
  const matchesText = (paper: PaperView) => {
    if (!text) return true;
    const haystacks: Record<string, string | undefined> = {
      title: paper.title,
      authors: paper.authors.join(' '),
      abstract: paper.abstract,
      venue: paper.venue,
      note: paper.shortNote,
      body: paper.abstract,
      summary: paper.abstract,
    };
    return query.fields.some((field) => haystacks[field]?.toLowerCase().includes(text));
  };
  const matchesStar = (paper: PaperView) => !query.starredOnly || paper.starred;
  const matchesTags = (paper: PaperView) => query.tagIds.length === 0 || paper.tagIds.some((id) => query.tagIds.includes(id));

  const filtered = papers.filter((p) => inCollection(p) && matchesText(p) && matchesStar(p) && matchesTags(p));
  const sortKey = (paper: PaperView): string | number => {
    switch (query.sort.column) {
      case 'title':
        return paper.title.toLowerCase();
      case 'authors':
        return (paper.authors[0] ?? '').toLowerCase();
      case 'year':
        return paper.year ?? 0;
      case 'venue':
        return (paper.venue ?? '').toLowerCase();
      case 'addedAt':
        return paper.addedAt;
      case 'lastReadAt':
        return paper.lastReadAt ?? '';
      case 'starred':
        return paper.starred ? 1 : 0;
      case 'tags':
        return paper.tagIds.length;
      case 'pages':
        return paper.pageCount ?? 0;
    }
  };
  const sorted = [...filtered].sort((a, b) => {
    const x = sortKey(a);
    const y = sortKey(b);
    const order = x < y ? -1 : x > y ? 1 : 0;
    return query.sort.direction === 'asc' ? order : -order;
  });
  const start = (query.page - 1) * query.pageSize;
  return { total: sorted.length, items: sorted.slice(start, start + query.pageSize) };
}
