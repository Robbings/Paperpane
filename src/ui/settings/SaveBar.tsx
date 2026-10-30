import { Button, IconButton, Spinner, Tooltip } from "@/ui/components";

export type SaveBarState =
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "invalid"; count: number; message?: string }
  /** fields: what both windows changed to different values; empty when the changes merge cleanly. */
  | { kind: "conflict"; fields: readonly string[] }
  | { kind: "failed"; message: string };

interface SaveBarProps {
  state: SaveBarState | null;
  /** The model detail toolbar reuses these controls and the same save state. */
  layout?: "floating" | "inline";
  onSave: () => void;
  onDiscard: () => void;
  /** Conflict: drop this draft and take what the other window saved. */
  onReload: () => void;
  /** Conflict: merge this page's changes into the newer settings and save. */
  onOverwrite: () => void;
}

/**
 * Floats at the bottom of the settings page while the draft differs from what
 * is saved. Models, features, sync and the request limits share one draft, so
 * switching sections keeps the changes.
 */
export function SaveBar({
  state: value,
  layout = "floating",
  onSave,
  onDiscard,
  onReload,
  onOverwrite,
}: SaveBarProps) {
  if (!value && layout === "floating") return null;
  const state = value ?? { kind: "clean" as const };
  const tone =
    state.kind === "invalid" || state.kind === "failed"
      ? "danger"
      : state.kind === "conflict"
        ? "warn"
        : state.kind === "saved"
          ? "ok"
          : undefined;
  return (
    <div
      className={`${layout === "floating" ? "pp-glass " : ""}pp-set-savebar`}
      data-layout={layout}
      data-tone="float"
      data-state={tone}
      role="region"
      aria-label="保存设置"
    >
      <p className="pp-set-savebar__text" aria-live="polite">
        {state.kind === "dirty" &&
          (layout === "inline" ? "未保存" : "有未保存的更改")}
        {state.kind === "saving" && (
          <>
            <Spinner size={14} /> 正在保存…
          </>
        )}
        {state.kind === "saved" && "已保存"}
        {state.kind === "invalid" &&
          (state.message ?? `有 ${state.count} 处需要修改`)}
        {state.kind === "conflict" &&
          (state.fields.length === 0
            ? "设置已在其他窗口更新。保存时会保留那边的改动，只写入你改过的项。"
            : `「${state.fields.join("」「")}」在其他窗口也改了。保存会用你的值。`)}
        {state.kind === "failed" && `没能保存：${state.message}`}
      </p>
      {state.kind === "conflict" ? (
        <>
          <Button size="sm" onClick={onReload}>
            放弃更改，载入最新
          </Button>
          <Button size="sm" variant="primary" onClick={onOverwrite}>
            {state.fields.length === 0 ? "合并后保存" : "用我的值保存"}
          </Button>
        </>
      ) : (
        (layout === "inline" || state.kind !== "saved") && (
          <>
            {layout === "inline" ? (
              <IconButton
                icon="rotate"
                label="放弃"
                size="md"
                disabled={
                  state.kind === "saving" ||
                  state.kind === "clean" ||
                  state.kind === "saved"
                }
                onClick={onDiscard}
              />
            ) : (
              <Button
                size="sm"
                disabled={state.kind === "saving"}
                onClick={onDiscard}
              >
                放弃
              </Button>
            )}
            <Tooltip
              label="保存设置页中全部未保存的更改"
              disabled={layout !== "inline"}
            >
              <Button
                size="sm"
                variant="primary"
                disabled={
                  state.kind === "saving" ||
                  state.kind === "clean" ||
                  state.kind === "saved"
                }
                onClick={onSave}
              >
                {state.kind === "failed" ? "重试" : "保存"}
              </Button>
            </Tooltip>
          </>
        )
      )}
    </div>
  );
}
