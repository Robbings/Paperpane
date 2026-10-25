import { useEffect, useState } from 'react';
import { Toaster, toast } from '@/ui/components';
import { ComponentGallery } from '@/ui/gallery/ComponentGallery';
import { sampleFolders, samplePapers, sampleTags } from '@/ui/library/sample/libraryData';
import type { PaperView, TagView } from '@/ui/library/types';
import type { LibraryEntryDraft } from '@/ui/reader/library/SaveToLibraryPopover';
import { ReaderShell } from '@/ui/reader/ReaderShell';
import { SamplePaper } from '@/ui/reader/sample/SamplePaper';
import { sampleAnnotations, sampleHeader, sampleOutline } from '@/ui/reader/sample/sampleData';
import type { AnnotationView } from '@/ui/reader/types';
import { applyTheme } from '@/ui/theme';

// Review switches: reader.html?view=gallery shows the component gallery,
// ?theme=light|dark forces a theme. The saved theme preference comes from the logic layer.
const params = new URLSearchParams(window.location.search);
const forcedTheme = params.get('theme');
if (forcedTheme === 'light' || forcedTheme === 'dark') applyTheme(forcedTheme);

const ZOOM_STEPS = [50, 67, 80, 90, 100, 110, 125, 150, 175, 200];

export function ReaderPage() {
  if (params.get('view') === 'gallery') return <ComponentGallery />;
  return <SampleReader />;
}

/** 示例接线：用示例数据驱动阅读器外壳，直到文档、标注与笔记逻辑接入。 */
function SampleReader() {
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [annotations, setAnnotations] = useState<AnnotationView[]>(sampleAnnotations);
  const [note, setNote] = useState('');
  // 示例：文献库里的论文与标签，当前论文是第一篇。
  const [papers, setPapers] = useState<PaperView[]>(samplePapers);
  const [tags, setTags] = useState<TagView[]>(sampleTags);
  const [saved, setSaved] = useState(true);
  const current = papers[0]!;
  const entry: LibraryEntryDraft = {
    title: current.title,
    authors: current.authors,
    venue: current.venue,
    year: current.year,
    folderId: saved ? current.folderId : null,
    tags: saved ? current.tagIds.map((id) => ({ id, label: tags.find((t) => t.id === id)?.label ?? id })) : [],
  };

  const scroller = () => document.querySelector<HTMLElement>('.pp-reader__paper');

  // Track the page nearest the top of the visible paper area.
  useEffect(() => {
    const container = scroller();
    if (!container) return;
    const onScroll = () => {
      const pages = Array.from(container.querySelectorAll<HTMLElement>('[data-page-index]'));
      const probe = container.scrollTop + container.clientHeight * 0.3;
      const current = pages.filter((page) => page.offsetTop <= probe).pop();
      setPageIndex(Number(current?.dataset.pageIndex ?? 0));
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  const navigate = (index: number) => {
    const container = scroller();
    const page = container?.querySelector<HTMLElement>(`[data-page-index="${index}"]`);
    if (container && page) container.scrollTo({ top: page.offsetTop - 70, behavior: 'smooth' });
    setPageIndex(index);
  };

  return (
    <>
      <ReaderShell
        header={sampleHeader}
        outline={sampleOutline}
        pageIndex={pageIndex}
        zoomPercent={zoom}
        annotations={annotations}
        // 示例数据不保存：状态行如实标为演示，而不是模拟"已保存"。
        annotationStatus={{ local: 'unmodified', sync: 'unconfigured', simulated: true }}
        notes={{ value: note, onChange: setNote, local: 'unmodified', sync: 'unconfigured', simulated: true }}
        document={<SamplePaper pageCount={sampleHeader.pageCount} zoomPercent={zoom} />}
        onNavigate={navigate}
        onZoom={(direction) => {
          const index = ZOOM_STEPS.indexOf(zoom);
          const next = ZOOM_STEPS[Math.min(Math.max(index + (direction === 'in' ? 1 : -1), 0), ZOOM_STEPS.length - 1)];
          if (next !== undefined) setZoom(next);
        }}
        onHighlight={(color, selection) =>
          setAnnotations((current) => [
            ...current,
            { id: `sample-${current.length + 1}`, kind: 'highlight', color, pageIndex, quote: selection.text },
          ])
        }
        onSelectionAction={(action, selection) => {
          if (action === 'copy') void navigator.clipboard?.writeText(selection.text);
        }}
        onLocateAnnotation={(id) => {
          const target = annotations.find((item) => item.id === id);
          if (target) navigate(target.pageIndex);
        }}
        onTool={() => undefined}
        library={{
          currentPaperId: current.id,
          folders: sampleFolders,
          papers: saved ? papers : papers.slice(1),
          recent: papers.filter((p) => p.lastReadAt).sort((a, b) => (b.lastReadAt ?? '').localeCompare(a.lastReadAt ?? '')),
          saved,
          entry,
          tags,
          onSave: (draft) => {
            const tagIds = draft.tags.map((tag) => {
              if (tag.id) return tag.id;
              const id = `t-${tag.label}`;
              setTags((all) => (all.some((t) => t.id === id) ? all : [...all, { id, label: tag.label }]));
              return id;
            });
            setPapers((all) => all.map((p, i) => (i === 0 ? { ...p, title: draft.title, authors: draft.authors, venue: draft.venue, year: draft.year, folderId: draft.folderId, tagIds } : p)));
            toast.show({ message: saved ? '已更新文献库条目' : '已收藏到文献库', tone: 'success' });
            setSaved(true);
          },
          onRemove: () => {
            setSaved(false);
            toast.show({ message: '已移出文献库，批注和笔记仍然保留', action: { label: '撤销', onAction: () => setSaved(true) } });
          },
          onOpenPaper: (id, newTab) => toast.show({ message: `示例：${newTab ? '在新标签页' : ''}打开「${papers.find((p) => p.id === id)?.title ?? id}」` }),
          onImport: (files) => toast.show({ message: `示例：收到 ${files.length} 个文件，演示中不会真正导入。` }),
          onOpenLibrary: () => window.open('./library.html', '_blank'),
        }}
      />
      <Toaster />
    </>
  );
}
