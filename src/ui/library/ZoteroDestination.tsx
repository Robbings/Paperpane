import { useState } from 'react';
import { HintLabel, Icon, Switch } from '@/ui/components';
import type { FolderOption } from '@/zotero/catalog';
import { FolderPicker, folderPath } from './FolderPicker';
import './ZoteroDestination.css';

interface ZoteroDestinationProps {
  mode: 'collections' | 'folder';
  onMode: (mode: 'collections' | 'folder') => void;
  /** 'root' = 未分类. */
  folder: string;
  onFolder: (folder: string) => void;
  folders: readonly FolderOption[];
  /** False when some items carry no Zotero collections (e.g. WebDAV-only attachments). */
  canPreserve?: boolean;
  disabled?: boolean;
}

/** Where imported papers go: Zotero's own collections, or one library folder picked (or made) here. */
export function ZoteroDestination({ mode, onMode, folder, onFolder, folders, canPreserve = true, disabled = false }: ZoteroDestinationProps) {
  const [picking, setPicking] = useState(false);
  // Folders made in the picker are not in `folders` until the library refreshes.
  const [known, setKnown] = useState<readonly FolderOption[]>(folders);
  const all = known.length >= folders.length ? known : folders;
  const preserve = mode === 'collections' && canPreserve;
  return (
    <div className="pp-zotero-destination">
      <span className="pp-zotero-destination__switch">
        <HintLabel hint={canPreserve ? '按 Zotero 的分类建立文件夹，一篇论文的多个分类都会保留' : '这些附件没有 Zotero 分类信息'}>保留 Zotero 分类</HintLabel>
        <Switch label="保留 Zotero 分类" hideLabel checked={preserve} disabled={disabled || !canPreserve} onChange={(on) => onMode(on ? 'collections' : 'folder')} />
      </span>
      {!preserve && (
        <button type="button" className="pp-zotero-destination__folder" disabled={disabled} onClick={() => setPicking(true)}>
          <span className="pp-zotero-destination__label">导入到</span>
          <Icon name={folder === 'root' ? 'inbox' : 'folder'} size={15} />
          <span className="pp-zotero-destination__path">{folderPath(all, folder === 'root' ? null : folder)}</span>
          <Icon name="chevronRight" size={14} />
        </button>
      )}
      <FolderPicker
        open={picking}
        folders={all}
        value={folder === 'root' ? null : folder}
        onClose={() => setPicking(false)}
        onPick={(id, list) => {
          setKnown(list);
          onFolder(id ?? 'root');
          setPicking(false);
        }}
      />
    </div>
  );
}
