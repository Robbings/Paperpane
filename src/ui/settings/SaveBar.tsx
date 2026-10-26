import { Button, Spinner } from '@/ui/components';

export type SaveBarState =
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'invalid'; count: number; message?: string }
  | { kind: 'conflict' }
  | { kind: 'failed'; message: string };

interface SaveBarProps {
  state: SaveBarState;
  onSave: () => void;
  onDiscard: () => void;
  /** Conflict: drop this draft and take what the other window saved. */
  onReload: () => void;
  /** Conflict: save this page's changes over the newer settings, keeping what it did not touch. */
  onOverwrite: () => void;
}

/**
 * Floats at the bottom of the settings page while the draft differs from what
 * is saved. Models, features, sync and the request limits share one draft, so
 * switching sections keeps the changes.
 */
export function SaveBar({ state, onSave, onDiscard, onReload, onOverwrite }: SaveBarProps) {
  const tone = state.kind === 'invalid' || state.kind === 'failed' ? 'danger' : state.kind === 'conflict' ? 'warn' : state.kind === 'saved' ? 'ok' : undefined;
  return (
    <div className="pp-glass pp-set-savebar" data-tone="float" data-state={tone} role="region" aria-label="保存设置">
      <p className="pp-set-savebar__text" aria-live="polite">
        {state.kind === 'dirty' && '有未保存的更改'}
        {state.kind === 'saving' && (
          <>
            <Spinner size={14} /> 正在保存…
          </>
        )}
        {state.kind === 'saved' && '已保存'}
        {state.kind === 'invalid' && (state.message ?? `有 ${state.count} 处需要修改`)}
        {state.kind === 'conflict' && '设置已在其他窗口更新，你的更改还没保存。保存时只覆盖你改过的部分。'}
        {state.kind === 'failed' && `没能保存：${state.message}`}
      </p>
      {state.kind === 'conflict' ? (
        <>
          <Button size="sm" onClick={onReload}>
            放弃更改，载入最新
          </Button>
          <Button size="sm" variant="primary" onClick={onOverwrite}>
            保存我的更改
          </Button>
        </>
      ) : (
        state.kind !== 'saved' && (
          <>
            <Button size="sm" disabled={state.kind === 'saving'} onClick={onDiscard}>
              放弃
            </Button>
            <Button size="sm" variant="primary" disabled={state.kind === 'saving'} onClick={onSave}>
              {state.kind === 'failed' ? '重试' : '保存'}
            </Button>
          </>
        )
      )}
    </div>
  );
}
