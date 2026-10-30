import { PageThumbnail, type ThumbnailRenderer } from './PageThumbnail';
import { useState, type ReactNode } from 'react';
import { GlassSurface, Segmented } from '@/ui/components';
import type { OutlineItemView } from './types';

interface ReaderSidebarProps {
  /** Stays mounted while hidden so it can slide and keeps its tab. */
  open: boolean;
  outline: readonly OutlineItemView[];
  navigationPending?: boolean;
  navigationMessage?: string;
  renderThumbnail?: ThumbnailRenderer;
  onOutlineNavigate?: (id:string)=>void;
  pageCount: number;
  /** 0-based. */
  pageIndex: number;
  /** Floating over the paper on narrow windows. */
  overlay: boolean;
  onNavigate: (pageIndex: number) => void;
  /** Library navigation for the third tab; the tab is hidden without it. */
  library?: ReactNode;
}

type SidebarTab = 'thumbs' | 'outline' | 'library';

export function ReaderSidebar({ open, outline, pageCount, pageIndex, overlay, onNavigate, library, navigationPending, navigationMessage, renderThumbnail, onOutlineNavigate }: ReaderSidebarProps) {
  const [tab, setTab] = useState<SidebarTab>('outline');
  const tabs: { value: SidebarTab; label: string }[] = [
    { value: 'thumbs', label: '缩略图' },
    { value: 'outline', label: '目录' },
    ...(library ? [{ value: 'library' as const, label: '文献' }] : []),
  ];
  // The current section is the last outline entry that starts at or before the current page.
  const currentId = [...outline].reverse().find((item) => item.pageIndex <= pageIndex)?.id;

  return (
    <GlassSurface
      as="aside"
      tone="panel"
      radius="panel"
      className="pp-sidebar"
      data-open={open ? 'true' : 'false'}
      data-overlay={overlay ? 'true' : undefined}
      aria-label="论文导航"
      inert={!open}
    >
      <Segmented label="侧栏内容" options={tabs} value={tab} onChange={setTab} stretch />

      {tab === 'library' && library ? (
        library
      ) : navigationPending && tab==='outline' ? (
        <p className="pp-sidebar__empty">{navigationMessage ?? '正在读取目录…'}</p>
      ) : tab === 'outline' ? (
        outline.length > 0 ? (
          <nav aria-label="目录" className="pp-sidebar__scroll pp-outline">
            {navigationMessage&&<p className="pp-sidebar__empty">{navigationMessage}</p>}
            {outline.map((item) => {
              const current = item.id === currentId;
              return (
                <button
                  key={item.id}
                  type="button"
                  className="pp-outline__item"
                  style={{ paddingLeft: 10 + item.level * 16 }}
                  aria-current={current ? 'location' : undefined}
                  onClick={() => onOutlineNavigate ? onOutlineNavigate(item.id) : onNavigate(item.pageIndex)}
                >
                  <span className="pp-outline__label">{item.label}</span>
                  <span className="pp-outline__page">{item.pageIndex + 1}</span>
                </button>
              );
            })}
          </nav>
        ) : (
          <p className="pp-sidebar__empty">{navigationMessage ?? '这篇论文没有可识别的目录。'}</p>
        )
      ) : (
        <nav className="pp-sidebar__scroll pp-thumbs" aria-label="页面缩略图">
          {Array.from({ length: pageCount }, (_, index) => (
            <button
              key={index}
              type="button"
              className="pp-thumb"
              aria-label={`第 ${index + 1} 页`}
              aria-current={index === pageIndex ? 'page' : undefined}
              onClick={() => onNavigate(index)}
            >
              {renderThumbnail ? <PageThumbnail index={index} render={renderThumbnail}/> : <span className="pp-thumb__page" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </span>}
              <span className="pp-thumb__label">{index + 1}</span>
            </button>
          ))}
        </nav>
      )}
    </GlassSurface>
  );
}
