import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { Button, Icon, Menu, Popover, TagInput, TextField, type MenuEntry, type TagOption } from '@/ui/components';
import './readerLibrary.css';
import { folderEntries, folderPath } from '@/ui/library/PaperDetail';
import type { FolderView, TagView } from '@/ui/library/types';

export interface LibraryEntryDraft {
  title: string;
  authors: string[];
  venue?: string;
  year?: number;
  folderId: string | null;
  /** Existing tags by id, new ones by label only. */
  tags: { id?: string; label: string }[];
}

interface SaveToLibraryPopoverProps {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  /** Already in the library: the popover edits the entry instead of adding it. */
  saved: boolean;
  /** Prefilled from the paper (extracted metadata) or the saved entry. */
  initial: LibraryEntryDraft;
  folders: readonly FolderView[];
  tags: readonly TagView[];
  onSave: (draft: LibraryEntryDraft) => void;
  onRemove: () => void;
  /** Creates a folder (null parent = top level) and returns its id. */
  onCreateFolder: (parentId: string | null, name: string) => string;
}

/** Add the open paper to the library, or edit / remove its entry. */
export function SaveToLibraryPopover({ anchorRef, open, onClose, saved, initial, folders, tags, onSave, onRemove, onCreateFolder }: SaveToLibraryPopoverProps) {
  const [draft, setDraft] = useState(initial);
  const [authorsText, setAuthorsText] = useState(initial.authors.join(', '));
  const [folderMenu, setFolderMenu] = useState(false);
  const folderRef = useRef<HTMLButtonElement>(null);
  // Naming a new folder inside the chosen one; null when not creating.
  const [newFolder, setNewFolder] = useState<string | null>(null);

  // Start from the latest data each time the popover opens; cancelling keeps the saved values.
  useEffect(() => {
    if (!open) return;
    setDraft(initial);
    setAuthorsText(initial.authors.join(', '));
    setNewFolder(null);
  }, [open]); // only when it opens, not on every parent render

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim()) return;
    onSave({ ...draft, title: draft.title.trim(), authors: authorsText.split(/[,，]/).map((a) => a.trim()).filter(Boolean) });
    onClose();
  };

  const createFolder = () => {
    const name = newFolder?.trim();
    if (!name) return;
    setDraft({ ...draft, folderId: onCreateFolder(draft.folderId, name) });
    setNewFolder(null);
  };
  const folderMenuEntries: MenuEntry[] = [
    ...folderEntries(folders, draft.folderId),
    { kind: 'separator', id: 'sep' },
    { id: '__new', label: draft.folderId ? `在「${folders.find((f) => f.id === draft.folderId)?.name}」中新建文件夹…` : '新建文件夹…', icon: 'folderPlus' },
  ];

  const selectedTags: TagOption[] = draft.tags.map((tag, index) => ({ id: tag.id ?? `new-${index}-${tag.label}`, label: tag.label }));

  return (
    <Popover anchorRef={anchorRef} open={open} onClose={() => !folderMenu && onClose()} label={saved ? '编辑文献库条目' : '收藏到文献库'} width={360} placement="bottom-start">
      <form className="pp-save" onSubmit={submit}>
        <header className="pp-save__head">
          <strong>{saved ? '已在文献库中' : '收藏到文献库'}</strong>
          <span>{saved ? '修改会同步到文献库。' : '书目信息由论文自动识别，请核对后保存。'}</span>
        </header>

        <TextField label="标题" value={draft.title} onChange={(title) => setDraft({ ...draft, title })} error={draft.title.trim() ? undefined : '标题不能为空。'} />
        <TextField label="作者" value={authorsText} onChange={setAuthorsText} description="多位作者用逗号分隔。" />
        <div className="pp-save__pair">
          <TextField label="期刊 / 会议" value={draft.venue ?? ''} onChange={(venue) => setDraft({ ...draft, venue: venue || undefined })} />
          <TextField
            label="年份"
            inputMode="numeric"
            value={draft.year ? String(draft.year) : ''}
            onChange={(year) => setDraft({ ...draft, year: /^\d{1,4}$/.test(year) ? Number(year) : undefined })}
          />
        </div>

        <div className="pp-save__field">
          <span className="pp-field__label">文件夹</span>
          <button
            ref={folderRef}
            type="button"
            className="pp-save__folder"
            aria-haspopup="menu"
            aria-expanded={folderMenu}
            onClick={() => setFolderMenu((value) => !value)}
          >
            <Icon name="folder" size={15} />
            <span>{folderPath(folders, draft.folderId)}</span>
            <Icon name="chevronDown" size={12} strokeWidth={2} />
          </button>
          {newFolder !== null && (
            <div className="pp-save__new-folder">
              <Icon name="folderPlus" size={15} />
              <input
                autoFocus
                aria-label={`新文件夹名称，建在「${folderPath(folders, draft.folderId)}」中`}
                placeholder={draft.folderId ? `在「${folders.find((f) => f.id === draft.folderId)?.name}」中新建` : '新文件夹名称'}
                value={newFolder}
                onChange={(event) => setNewFolder(event.target.value)}
                onKeyDown={(event) => {
                  // Enter creates the folder here instead of submitting the whole form.
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    createFolder();
                  } else if (event.key === 'Escape') {
                    event.stopPropagation();
                    setNewFolder(null);
                  }
                }}
              />
              <Button size="sm" variant="quiet" onClick={() => setNewFolder(null)}>
                取消
              </Button>
              <Button size="sm" disabled={!newFolder.trim()} onClick={createFolder}>
                新建
              </Button>
            </div>
          )}
        </div>

        <div className="pp-save__field">
          <span className="pp-field__label">标签</span>
          <TagInput
            label="标签"
            selected={selectedTags}
            options={tags}
            onAdd={(tag) => !draft.tags.some((t) => t.label === tag.label) && setDraft({ ...draft, tags: [...draft.tags, tag] })}
            onRemove={(id) => setDraft({ ...draft, tags: draft.tags.filter((tag, index) => (tag.id ?? `new-${index}-${tag.label}`) !== id) })}
          />
        </div>

        <footer className="pp-save__foot">
          {saved && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                onRemove();
                onClose();
              }}
            >
              移出文献库
            </Button>
          )}
          <span className="pp-save__spacer" />
          <Button size="sm" onClick={onClose}>
            取消
          </Button>
          <Button size="sm" variant="primary" type="submit" disabled={!draft.title.trim()}>
            {saved ? '保存修改' : '收藏'}
          </Button>
        </footer>
      </form>

      {folderMenu && (
        <Menu
          label="选择文件夹"
          entries={folderMenuEntries}
          anchor={(() => {
            const box = folderRef.current?.getBoundingClientRect();
            return box ? { x: box.left, y: box.bottom + 6 } : { x: 0, y: 0 };
          })()}
          triggerRef={folderRef}
          onSelect={(id) => {
            if (id === '__new') setNewFolder('');
            else setDraft({ ...draft, folderId: id === '__root' ? null : id });
          }}
          onClose={() => setFolderMenu(false)}
        />
      )}
    </Popover>
  );
}
