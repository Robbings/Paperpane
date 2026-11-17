import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, Icon, Tree, toast } from '@/ui/components';
import { LibraryDatabase } from '@/data/library-database';
import type { FolderOption } from '@/zotero/catalog';
import './FolderPicker.css';
const notifyFolders = () => { const channel = new BroadcastChannel('paperpane-documents'); channel.postMessage({ kind: 'invalidate' }); channel.close(); };

/** Creates a library folder and gives it a name; the library page picks it up on its next refresh. */
export const libraryFolders = {
  async create(parentId: string | null): Promise<string> {
    const db = new LibraryDatabase(), id = crypto.randomUUID();
    try {
      await db.folder('create', id, parentId);
      notifyFolders();
      return id;
    } finally {
      await db.close();
    }
  },
  async rename(id: string, name: string): Promise<void> {
    const db = new LibraryDatabase();
    try {
      await db.folder('rename', id, name);
      notifyFolders();
    } finally {
      await db.close();
    }
  },
};

/** The folder's path, e.g. "方法 / 检索". */
export function folderPath(folders: readonly FolderOption[], id: string | null): string {
  const parts: string[] = [];
  for (let at = id, guard = 0; at && guard < 64; guard++) {
    const folder = folders.find((f) => f.id === at);
    if (!folder) break;
    parts.unshift(folder.name);
    at = folder.parentId;
  }
  return parts.join(' / ') || '未分类';
}

export type FolderActions = typeof libraryFolders;

interface FolderPickerProps {
  actions?: FolderActions;
  open: boolean;
  folders: readonly FolderOption[];
  value: string | null;
  onClose: () => void;
  /** null = 未分类 (no folder). */
  onPick: (id: string | null, folders: readonly FolderOption[]) => void;
}

/** Choose a library folder, or make a new one (inside the selected folder) on the spot. */
export function FolderPicker({ open, folders, value, onClose, onPick, actions = libraryFolders }: FolderPickerProps) {
  const [list, setList] = useState<FolderOption[]>([...folders]);
  const [selected, setSelected] = useState<string | null>(value);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const pending = useRef<Promise<boolean>>(Promise.resolve(true));
  const [renaming, setRenaming] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setList([...folders]);
    setSelected(value);
    setRenaming(null);
    pending.current = Promise.resolve(true);
    // Show where the current choice sits.
    const open_ = new Set<string>();
    for (let at = folders.find((f) => f.id === value)?.parentId ?? null; at; at = folders.find((f) => f.id === at)?.parentId ?? null) open_.add(at);
    setExpanded(open_);
  }, [open]);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const id = await actions.create(selected);
      setList((old) => [...old, { id, name: '新建文件夹', parentId: selected }]);
      if (selected) setExpanded((old) => new Set(old).add(selected));
      setSelected(id);
      setRenaming(id);
    } catch (e) {
      toast.show({ tone: 'error', message: e instanceof Error ? e.message : '没能新建文件夹' });
    } finally { setBusy(false); }
  };
  const rename = (id: string, name: string) => {
    setRenaming(null);
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    pending.current = (async () => {
      try {
        await actions.rename(id, trimmed);
        setList(old => old.map(f => f.id === id ? { ...f, name: trimmed } : f));
        return true;
      } catch (e) {
        setRenaming(id);
        toast.show({ tone: 'error', message: e instanceof Error ? e.message : '没能重命名' });
        return false;
      } finally { setBusy(false); }
    })();
  };
  const pick = async (id: string | null) => { if (await pending.current) onPick(id, list); };


  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="选择文件夹"
      size="sm"
      footer={
        <>
          <Button variant="quiet" icon="folderPlus" className="pp-folder-picker__new" disabled={busy} onClick={() => void create()}>
            {selected ? '新建子文件夹' : '新建文件夹'}
          </Button>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={busy} onClick={() => void pick(selected)}>
            选择
          </Button>
        </>
      }
    >
      <div className="pp-folder-picker">
        <div
          className="pp-tree__row"
          role="button"
          tabIndex={0}
          aria-selected={selected === null}
          style={{ paddingLeft: 6 }}
          onClick={() => setSelected(null)}
          onDoubleClick={() => void pick(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setSelected(null);
            }
          }}
        >
          <span className="pp-tree__twisty" />
          <Icon name="inbox" size={16} className="pp-tree__icon" />
          <span className="pp-tree__label">未分类</span>
        </div>
        <Tree
          label="文件夹"
          nodes={list.map((f) => ({ id: f.id, parentId: f.parentId, label: f.name, icon: 'folder' as const }))}
          selectedId={selected}
          onSelect={setSelected}
          expandedIds={expanded}
          onToggle={(id, on) =>
            setExpanded((old) => {
              const next = new Set(old);
              if (on) next.add(id);
              else next.delete(id);
              return next;
            })
          }
          renamingId={renaming}
          onRenameStart={setRenaming}
          onRename={(id, name) => void rename(id, name)}
          onRenameCancel={() => setRenaming(null)}
        />
      </div>
    </Dialog>
  );
}
