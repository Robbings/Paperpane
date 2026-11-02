import { useState, type CSSProperties, type DragEvent, type PointerEvent } from 'react';
import { GlassSurface, Icon, IconButton, Menu, Tree, TREE_DRAG_TYPE, type IconName, type MenuEntry } from '@/ui/components';
import { PAPER_DRAG_TYPE } from './dragTypes';
import type { Collection, FolderView, TagView } from './types';

export interface CollectionCounts {
  all: number;
  recent: number;
  starred: number;
  unfiled: number;
  /** Papers in each folder, including its subfolders. */
  folders: Record<string, number>;
}

interface LibrarySidebarProps {
  collection: Collection;
  onCollection: (collection: Collection) => void;
  folders: readonly FolderView[];
  counts: CollectionCounts;
  tags: readonly TagView[];
  activeTagIds: readonly string[];
  onTags: (tagIds: string[]) => void;
  onCreateFolder: (parentId: string | null) => void;
  /** Set by the page right after creating a folder, so it opens for naming. */
  renamingId: string | null;
  onRenameStart: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onRenameCancel: () => void;
  onMoveFolder: (id: string, parentId: string | null) => void;
  onDeleteFolder: (id: string) => void;
  onMovePapers: (paperIds: string[], folderId: string | null) => void;
}

const fixed: { kind: 'all' | 'recent' | 'starred' | 'unfiled'; label: string; icon: IconName }[] = [
  { kind: 'all', label: '全部论文', icon: 'library' },
  { kind: 'recent', label: '最近阅读', icon: 'clock' },
  { kind: 'starred', label: '已标星', icon: 'star' },
  { kind: 'unfiled', label: '未分类', icon: 'inbox' },
];

export function LibrarySidebar(props: LibrarySidebarProps) {
  const { collection, folders, counts, tags, activeTagIds } = props;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(folders.filter((f) => f.parentId === null).map((f) => f.id)));
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [rootDrop, setRootDrop] = useState(false);
  // The tag area's height is the reader's; kept across visits.
  const [tagsHeight, setTagsHeight] = useState(() => {
    try {
      return Number(localStorage.getItem('pp-lib-tags-h')) || 140;
    } catch {
      return 140;
    }
  });
  const [resizingTags, setResizingTags] = useState(false);
  const resizeTags = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget,
      startY = event.clientY,
      start = tagsHeight;
    handle.setPointerCapture(event.pointerId);
    setResizingTags(true);
    let last = start;
    const move = (e: globalThis.PointerEvent) => {
      last = Math.round(Math.min(Math.max(start + startY - e.clientY, 56), window.innerHeight * 0.7));
      setTagsHeight(last);
    };
    const end = () => {
      setResizingTags(false);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      try {
        localStorage.setItem('pp-lib-tags-h', String(last));
      } catch {
        /* Only a convenience. */
      }
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  const isDescendant = (id: string, maybeChild: string | null): boolean => {
    let current = maybeChild;
    while (current) {
      if (current === id) return true;
      current = folders.find((f) => f.id === current)?.parentId ?? null;
    }
    return false;
  };
  const hasChildren = (id: string) => folders.some((f) => f.parentId === id);

  const menuEntries = (id: string): MenuEntry[] => {
    const empty = (counts.folders[id] ?? 0) === 0 && !hasChildren(id);
    return [
      { id: 'new-child', label: '新建子文件夹', icon: 'folderPlus' },
      { id: 'rename', label: '重命名' },
      { kind: 'separator', id: 'sep' },
      { id: 'delete', label: empty ? '删除文件夹' : '删除文件夹（需先清空）', icon: 'trash', disabled: !empty },
    ];
  };

  const dropOnRoot = (event: DragEvent) => {
    event.preventDefault();
    setRootDrop(false);
    const folderId = event.dataTransfer.getData(TREE_DRAG_TYPE);
    if (folderId) props.onMoveFolder(folderId, null);
    const papers = event.dataTransfer.getData(PAPER_DRAG_TYPE);
    if (papers) props.onMovePapers(JSON.parse(papers) as string[], null);
  };

  return (
    <GlassSurface as="aside" tone="panel" radius="panel" className="pp-lib-sidebar" aria-label="文献库导航">
      <nav aria-label="文献集合" className="pp-lib-sidebar__fixed">
        {fixed.map((item) => {
          const current = collection.kind === item.kind;
          return (
            <button
              key={item.kind}
              type="button"
              className="pp-lib-nav"
              aria-current={current ? 'page' : undefined}
              onClick={() => props.onCollection({ kind: item.kind })}
            >
              <Icon name={item.icon} size={16} />
              <span className="pp-lib-nav__label">{item.label}</span>
              <span className="pp-lib-nav__count">{counts[item.kind]}</span>
            </button>
          );
        })}
      </nav>

      <div
        className="pp-lib-sidebar__heading"
        data-drop={rootDrop ? 'true' : undefined}
        onDragOver={(event) => {
          const types = Array.from(event.dataTransfer.types);
          if (!types.includes(TREE_DRAG_TYPE) && !types.includes(PAPER_DRAG_TYPE)) return;
          event.preventDefault();
          setRootDrop(true);
        }}
        onDragLeave={() => setRootDrop(false)}
        onDrop={dropOnRoot}
      >
        <span>文件夹</span>
        <IconButton icon="folderPlus" label="新建文件夹" size="md" shape="pill" onClick={() => props.onCreateFolder(null)} />
      </div>

      <div className="pp-lib-sidebar__scroll">
        {folders.length === 0 ? (
          <p className="pp-lib-sidebar__hint">还没有文件夹。点右上角的按钮新建一个，或把论文拖到这里整理。</p>
        ) : (
          <Tree
            label="文件夹"
            nodes={folders.map((folder) => ({ id: folder.id, parentId: folder.parentId, label: folder.name, icon: 'folder', count: counts.folders[folder.id] ?? 0 }))}
            selectedId={collection.kind === 'folder' ? collection.folderId : null}
            onSelect={(id) => props.onCollection({ kind: 'folder', folderId: id })}
            expandedIds={expanded}
            onToggle={(id, open) =>
              setExpanded((current) => {
                const next = new Set(current);
                if (open) next.add(id);
                else next.delete(id);
                return next;
              })
            }
            renamingId={props.renamingId}
            onRenameStart={props.onRenameStart}
            onRename={props.onRename}
            onRenameCancel={props.onRenameCancel}
            onContextMenu={(id, point) => setMenu({ id, ...point })}
            onMove={props.onMoveFolder}
            // A folder cannot move into itself or one of its own subfolders.
            canMove={(id, parentId) => !isDescendant(id, parentId)}
            acceptsExternal={(types) => types.includes(PAPER_DRAG_TYPE)}
            onExternalDrop={(folderId, data) => {
              const papers = data.getData(PAPER_DRAG_TYPE);
              if (papers) props.onMovePapers(JSON.parse(papers) as string[], folderId);
            }}
          />
        )}
      </div>

      {tags.length > 0 && (
        <section className="pp-lib-tags" aria-label="按标签筛选" style={{ '--pp-tags-h': `${tagsHeight}px` } as CSSProperties}>
          <div
            className="pp-lib-tags__resize"
            role="separator"
            aria-orientation="horizontal"
            aria-label="拖动调整标签区高度"
            data-dragging={resizingTags || undefined}
            onPointerDown={resizeTags}
            onDoubleClick={() => setTagsHeight(140)}
          />
          <div className="pp-lib-sidebar__heading">
            <span>标签</span>
            {activeTagIds.length > 0 && (
              <button type="button" className="pp-lib-tags__clear" onClick={() => props.onTags([])}>
                清除
              </button>
            )}
          </div>
          <div className="pp-lib-tags__list">
            {[...tags]
              .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
              .map((tag) => {
                const on = activeTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    className="pp-lib-tag"
                    aria-pressed={on}
                    title={tag.label}
                    onClick={() => props.onTags(on ? activeTagIds.filter((id) => id !== tag.id) : [...activeTagIds, tag.id])}
                  >
                    {tag.label}
                  </button>
                );
              })}
          </div>
        </section>
      )}

      {menu && (
        <Menu
          label="文件夹操作"
          entries={menuEntries(menu.id)}
          anchor={{ x: menu.x, y: menu.y }}
          onSelect={(action) => {
            if (action === 'new-child') {
              setExpanded((current) => new Set(current).add(menu.id));
              props.onCreateFolder(menu.id);
            } else if (action === 'rename') props.onRenameStart(menu.id);
            else if (action === 'delete') props.onDeleteFolder(menu.id);
          }}
          onClose={() => setMenu(null)}
        />
      )}
    </GlassSurface>
  );
}
