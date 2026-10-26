import { SaveStatus, type LocalSaveState, type SyncState } from '@/ui/components';
import { PanelHeader } from './PanelHeader';

interface NotesPanelProps {
  value: string;
  onChange: (value: string) => void;
  local: LocalSaveState;
  sync: SyncState;
  simulated?: boolean;
}

// Plain text for now; the formatting toolbar comes with the notes panel work.
export function NotesPanel({ value, onChange, local, sync, simulated }: NotesPanelProps) {
  return (
    <div className="pp-panel">
      <PanelHeader title="笔记" actions={<SaveStatus local={local} sync={sync} simulated={simulated} />} />
      <label className="pp-visually-hidden" htmlFor="pp-notes-editor">
        论文笔记
      </label>
      <textarea
        id="pp-notes-editor"
        className="pp-notes__editor"
        placeholder="写下这篇论文的笔记……"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
