import {
  Button,
  Dialog,
  EmptyState,
  IconButton,
  SaveStatus,
} from "@/ui/components";
import { PanelHeader } from "@/ui/reader/panels/PanelHeader";
import { useState, useSyncExternalStore } from "react";
import type { NoteSession } from "@/domain/notes/session";
import { noteToMarkdown } from "@/domain/notes/codec";
import { MarkdownEditor } from "./MarkdownEditor";
export function NotesEditorPanel({ session }: { session: NoteSession }) {
  const [conflictOpen, setConflictOpen] = useState(false);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot),
    state = snapshot.data;
  const text = noteToMarkdown(state.draft),
    conflict = state.conflict;
  return (
    <div className="pp-panel">
      <PanelHeader
        title="笔记"
        actions={
          <>
            <SaveStatus local={state.save.local} sync={state.save.sync} />
            {conflict && (
              <IconButton icon="alert" label="处理笔记冲突" size="md"
                onClick={() => setConflictOpen(true)} />
            )}
            {state.save.local === "failed" && !conflict && (
              <IconButton
                icon="rotate"
                label="重试保存笔记"
                size="md"
                onClick={() => void session.commit(state.committed.revision)}
              />
            )}
          </>
        }
      />
      <div
        className="pp-panel__body"
        style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        {text.ok ? (
          <MarkdownEditor
            storageKey={
              "notes:" +
              session.document.documentId +
              ":" +
              session.document.fileVersion
            }
            label="论文笔记"
            value={text.value}
            disabled={snapshot.state !== "ready"}
            placeholder="写下这篇论文的笔记……"
            onChange={(value) =>
              session.edit({
                format: "paperpane-markdown",
                schemaVersion: 1,
                markdown: value,
              })
            }
          />
        ) : (
          <EmptyState
            icon="file"
            title="笔记暂不可编辑"
            description={text.error.message}
          />
        )}
        {state.save.error && !conflict && (
          <span role="status" className="pp-markdown-editor__error">
            {state.save.error.message}
          </span>
        )}
      </div>
      <Dialog
        open={!!conflict && conflictOpen}
        title="笔记在另一窗口有更新"
        description="两版内容都会保留。请选择继续使用的版本。"
        dismissible
        onClose={() => setConflictOpen(false)}
        footer={
          <>
            <Button
              variant="quiet"
              onClick={() => {
                setConflictOpen(false);
                if (conflict)
                  void session.resolve(conflict.id, { kind: "remote" });
              }}
            >
              使用另一窗口的版本
            </Button>
            <Button
              onClick={() => {
                setConflictOpen(false);
                if (conflict)
                  void session.resolve(conflict.id, { kind: "local" });
              }}
            >
              保留本地版本
            </Button>
          </>
        }
      >
        {conflict && (
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            {[
              ["本地草稿", state.draft],
              ["另一窗口", conflict.remote.content],
            ].map(([title, content]) => {
              const value = noteToMarkdown(content as typeof state.draft);
              return (
                <div key={String(title)}>
                  <strong>{String(title)}</strong>
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      maxHeight: 220,
                      overflow: "auto",
                      fontSize: 12,
                    }}
                  >
                    {value.ok ? value.value : "无法预览"}
                  </pre>
                </div>
              );
            })}
          </div>
        )}
      </Dialog>
    </div>
  );
}
