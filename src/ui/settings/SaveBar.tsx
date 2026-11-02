import { Button, IconButton, Spinner } from "@/ui/components";

export type SaveBarState =
  | { kind: "clean" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "invalid"; count: number; message?: string }
  | { kind: "failed"; message: string };

const text = (state: SaveBarState, page: boolean) =>
  state.kind === "dirty"
    ? "未保存"
    : state.kind === "saving"
      ? "正在保存…"
      : state.kind === "saved"
        ? "已保存"
        : state.kind === "invalid"
          ? (state.message ?? (page ? `有 ${state.count} 处需要修改` : `有 ${state.count} 处需要修改，改好后自动保存`))
          : state.kind === "failed"
            ? `没能保存：${state.message}`
            : "";

const tone = (state: SaveBarState) =>
  state.kind === "invalid" || state.kind === "failed" ? "danger" : state.kind === "saved" ? "ok" : undefined;

/**
 * Saving on a service page (a model provider or a translation service): its
 * changes wait here until saved or discarded, in the page header.
 */
export function SaveBar({ state, onSave, onDiscard }: { state: SaveBarState; onSave: () => void; onDiscard: () => void }) {
  const idle = state.kind === "clean" || state.kind === "saved" || state.kind === "saving";
  return (
    <div className="pp-set-savebar" data-layout="inline" data-state={tone(state)} role="region" aria-label="保存此服务">
      <p className="pp-set-savebar__text" aria-live="polite">
        {state.kind === "saving" && <Spinner size={14} />}
        {text(state, true)}
      </p>
      <IconButton icon="rotate" label="放弃更改" size="md" disabled={idle} onClick={onDiscard} />
      <Button size="sm" variant="primary" disabled={idle} onClick={onSave}>
        {state.kind === "failed" ? "重试" : "保存"}
      </Button>
    </div>
  );
}

/**
 * Everything else saves as it changes. Nothing is said while that works; a
 * slow save, a value that cannot be saved, or a failure shows here.
 */
export function AutoSaveNote({ state, onRetry }: { state: SaveBarState | null; onRetry: () => void }) {
  if (!state || state.kind === "clean" || state.kind === "dirty" || state.kind === "saved") return null;
  return (
    <div className="pp-set-savebar" data-layout="inline" data-auto="true" data-state={tone(state)} role="status">
      <p className="pp-set-savebar__text" aria-live="polite">
        {state.kind === "saving" && <Spinner size={14} />}
        {text(state, false)}
      </p>
      {state.kind === "failed" && (
        <Button size="sm" onClick={onRetry}>
          重试
        </Button>
      )}
    </div>
  );
}
