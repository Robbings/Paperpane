import { useEffect, useState } from 'react';
import { ComponentGallery } from '@/ui/gallery/ComponentGallery';
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
    />
  );
}
