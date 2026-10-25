import { useRef, useState, type MouseEvent } from 'react';
import { Button, Icon, IconButton } from '@/ui/components';
import './readerLibrary.css';
import type { FolderView, PaperView } from '@/ui/library/types';

export interface ReaderLibraryData {
  /** The paper open in this reader. */
  currentPaperId: string;
  folders: readonly FolderView[];
  /** Papers in the library (the logic layer may page these). */
  papers: readonly PaperView[];
  /** Most recently read first. */
  recent: readonly PaperView[];
}

interface ReaderLibraryNavProps extends ReaderLibraryData {
  /** newTab: middle click, ⌘/Ctrl click, or the explicit button. */
  onOpenPaper: (id: string, newTab: boolean) => void;
  onImport: (files: File[]) => void;
  onOpenLibrary: () => void;
}

const PAGE = 20;
const RECENT = 5;

/** The library inside the reader sidebar: folders as a drill-down list, starting at the open paper's folder. */
export function ReaderLibraryNav({ currentPaperId, folders, papers, recent, onOpenPaper, onImport, onOpenLibrary }: ReaderLibraryNavProps) {
  const current = papers.find((p) => p.id === currentPaperId);
  const [folderId, setFolderId] = useState<string | null>(current?.folderId ?? null);
  const [shown, setShown] = useState(PAGE);
  const fileRef = useRef<HTMLInputElement>(null);

  const folder = folders.find((f) => f.id === folderId);
  const subfolders = folders.filter((f) => f.parentId === folderId).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  const items = papers.filter((p) => p.folderId === folderId).sort((a, b) => a.title.localeCompare(b.title));
  const go = (id: string | null) => {
    setFolderId(id);
    setShown(PAGE);
  };

  const open = (event: MouseEvent, id: string) => onOpenPaper(id, event.metaKey || event.ctrlKey || event.button === 1);

  const paperRow = (paper: PaperView) => (
    <li key={paper.id}>
      <button
        type="button"
        className="pp-rlib__paper"
        aria-current={paper.id === currentPaperId ? 'page' : undefined}
        onClick={(event) => open(event, paper.id)}
        onAuxClick={(event) => event.button === 1 && open(event, paper.id)}
      >
        <Icon name="file" size={15} />
        <span className="pp-rlib__paper-text">
          <span className="pp-rlib__paper-title">{paper.title}</span>
          <span className="pp-rlib__paper-meta">
            {paper.authors[0]}
            {paper.authors.length > 1 && ' 等'}
            {paper.year && ` · ${paper.year}`}
            {paper.id === currentPaperId && ' · 正在阅读'}
          </span>
        </span>
      </button>
    </li>
  );

  return (
    <div className="pp-rlib">
      <div className="pp-rlib__head">
        {folderId !== null ? (
          <IconButton icon="chevronRight" label="返回上一级" size="md" shape="pill" className="pp-rlib__back" onClick={() => go(folder?.parentId ?? null)} />
        ) : (
          <Icon name="library" size={15} className="pp-rlib__head-icon" />
        )}
        <span className="pp-rlib__title">{folder?.name ?? '文献库'}</span>
      </div>

      <div className="pp-sidebar__scroll">
        {folderId === null && recent.length > 0 && (
          <section aria-label="最近阅读" className="pp-rlib__section">
            <h3 className="pp-rlib__label">最近阅读</h3>
            <ul className="pp-rlib__list">{recent.slice(0, RECENT).map(paperRow)}</ul>
          </section>
        )}

        <section aria-label={folder ? `「${folder.name}」中的内容` : '文献库根目录'} className="pp-rlib__section">
          {folderId === null && <h3 className="pp-rlib__label">文件夹与未分类</h3>}
          <ul className="pp-rlib__list">
            {subfolders.map((sub) => (
              <li key={sub.id}>
                <button type="button" className="pp-rlib__folder" onClick={() => go(sub.id)}>
                  <Icon name="folder" size={15} />
                  <span>{sub.name}</span>
                  <Icon name="chevronRight" size={12} strokeWidth={2} />
                </button>
              </li>
            ))}
            {items.slice(0, shown).map(paperRow)}
          </ul>
          {subfolders.length === 0 && items.length === 0 && <p className="pp-sidebar__empty">这里还没有论文。</p>}
          {items.length > shown && (
            <Button size="sm" variant="quiet" className="pp-rlib__more" onClick={() => setShown(shown + PAGE)}>
              显示更多（还有 {items.length - shown} 篇）
            </Button>
          )}
        </section>
      </div>

      <div className="pp-rlib__foot">
        <Button size="sm" icon="upload" onClick={() => fileRef.current?.click()}>
          导入 PDF
        </Button>
        <Button size="sm" variant="quiet" icon="openExternal" onClick={onOpenLibrary}>
          打开文献库
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length) onImport(files);
            event.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
