import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Toaster, toast } from '@/ui/components';
import { ComponentGallery } from '@/ui/gallery/ComponentGallery';
import { sampleFolders, samplePapers, sampleTags } from '@/ui/library/sample/libraryData';
import type { FolderView, PaperView, TagView } from '@/ui/library/types';
import type { LibraryEntryDraft } from '@/ui/reader/library/SaveToLibraryPopover';
import { LocateFlash, type PageRect } from '@/ui/reader/LocateFlash';
import { ReaderShell } from '@/ui/reader/ReaderShell';
import { findQuote } from '@/ui/reader/sample/findQuote';
import { pageToView } from '@/ui/reader/sample/pageFrame';
import { useSampleReader } from '@/ui/reader/sample/useSampleReader';
import { SampleChat } from '@/ui/reader/sample/SampleChat';
import { SampleOverview } from '@/ui/reader/sample/SampleOverview';
import { SamplePaper } from '@/ui/reader/sample/SamplePaper';
import { sampleAnnotations, sampleHeader, sampleOutline } from '@/ui/reader/sample/sampleData';
import { modelOptions, useSamplePreferences, useSampleSettings } from '@/ui/settings/sample/useSampleSettings';
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
  const reader = useSampleReader(sampleAnnotations);
  const preferences = useSamplePreferences();
  const settings = useSampleSettings();
  const { annotations } = reader;
  const [note, setNote] = useState('');
  // 示例：文献库里的论文与标签，当前论文是第一篇。
  const [papers, setPapers] = useState<PaperView[]>(samplePapers);
  const [tags, setTags] = useState<TagView[]>(sampleTags);
  const [folders, setFolders] = useState<FolderView[]>(sampleFolders);
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

  // Jumping to a quoted passage: scroll it into view and mark it briefly.
  const [flash, setFlash] = useState<{ page: HTMLElement; rects: PageRect[]; key: number } | null>(null);
  const locateQuote = (quote: string) => {
    const container = scroller();
    const found = container && findQuote(container, quote);
    if (!container || !found || found.rects.length === 0) {
      toast.show({ message: '没有在论文中找到这段引文', tone: 'warning' });
      return;
    }
    const first = pageToView(found.page, found.rects[0]!);
    const top = container.scrollTop + first.top - container.getBoundingClientRect().top - container.clientHeight * 0.35;
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    const key = Date.now();
    setFlash({ page: found.page, rects: found.rects, key });
    window.setTimeout(() => setFlash((current) => (current?.key === key ? null : current)), 2000);
  };

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
        document={<SamplePaper pageCount={sampleHeader.pageCount} zoomPercent={zoom} rotation={reader.interaction.rotation} highlights={reader.paperHighlights} />}
        onNavigate={navigate}
        onZoom={(direction) => {
          // From any value, typed ones included, go to the next step up or down.
          const next = direction === 'in' ? ZOOM_STEPS.find((step) => step > zoom) : [...ZOOM_STEPS].reverse().find((step) => step < zoom);
          if (next !== undefined) setZoom(next);
        }}
        onZoomTo={setZoom}
        interaction={reader.interaction}
        onLocateAnnotation={(id) => {
          const target = annotations.find((item) => item.id === id);
          if (target?.quote) locateQuote(target.quote);
          else if (target) navigate(target.pageIndex);
        }}
        onTool={() => undefined}
        settings={{
          preferences: preferences.state.preferences,
          onPreference: preferences.setPreference,
          models: modelOptions(settings.settings),
          defaultModelId: settings.settings.defaultModelId,
          onDefaultModel: settings.setDefaultModel,
          status: settings.status,
          onOpenSettings: (section) => window.open(`./options.html${section ? `#${section}` : ''}`, '_blank', 'noopener'),
        }}
        panels={{ discuss: <SampleChat onLocateQuote={locateQuote} />, overview: <SampleOverview onLocateQuote={locateQuote} /> }}
        library={{
          currentPaperId: current.id,
          folders,
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
          onCreateFolder: (parentId, name) => {
            const id = `f-${Date.now()}`;
            setFolders((all) => [...all, { id, name, parentId }]);
            return id;
          },
          onOpenPaper: (id, newTab) => toast.show({ message: `示例：${newTab ? '在新标签页' : ''}打开「${papers.find((p) => p.id === id)?.title ?? id}」` }),
          onImport: (files) => toast.show({ message: `示例：收到 ${files.length} 个文件，演示中不会真正导入。` }),
          onOpenLibrary: () => window.open('./library.html', '_blank'),
        }}
      />
      <Toaster />
      {reader.overlayLayer}
      {flash && createPortal(<LocateFlash key={flash.key} rects={flash.rects} />, flash.page)}
    </>
  );
}
