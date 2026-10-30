import type { DocumentRef } from "@/contracts/document";
import {
  failure,
  success,
  type Result,
  type Snapshot,
} from "@/contracts/common";
import type {
  NoteContent,
  NoteService,
  NoteState,
  NoteVersion,
} from "@/contracts/notes";
import { NoteConflictFault, NoteDatabase } from "@/data/note-database";
import { noteToMarkdown, validateNote } from "./codec";
const markdown = (text = ""): NoteContent => ({
  format: "paperpane-markdown",
  schemaVersion: 1,
  markdown: text,
});
export class NoteSession implements NoteService {
  private state: NoteState;
  private snapshot: Snapshot<NoteState>;
  private listeners = new Set<() => void>();
  private queue = Promise.resolve();
  private pending = 0;
  private closed = false;
  private leaving = false;
  private ready = false;
  private epoch = 0;
  private channel = new BroadcastChannel("paperpane-notes");
  constructor(
    readonly db: NoteDatabase,
    readonly document: DocumentRef,
  ) {
    const committed = {
      revision: "",
      content: markdown(),
      updatedAt: new Date().toISOString(),
    };
    this.state = {
      documentId: document.documentId,
      committed,
      draft: committed.content,
      editVersion: 0,
      save: { local: "unmodified", sync: "unconfigured" },
      history: [],
    };
    this.snapshot = { mode: "live", state: "loading", data: this.state };
    this.channel.onmessage = (e) => {
      if (e.data?.key === this.key) void this.refresh();
    };
  }
  private get key() {
    return this.document.documentId + ":" + this.document.fileVersion;
  }
  get unsaved() {
    return (
      this.pending > 0 ||
      !!this.state.conflict ||
      (this.ready && this.state.save.local === "failed") ||
      JSON.stringify(this.state.draft) !==
        JSON.stringify(this.state.committed.content)
    );
  }
  getSnapshot = () => this.snapshot;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish() {
    this.snapshot = this.ready
      ? { mode: "live", state: this.leaving ? "loading" : "ready", data: { ...this.state } }
      : this.state.save.error
        ? {
            mode: "live",
            state: "failed",
            error: this.state.save.error,
            data: { ...this.state },
          }
        : { mode: "live", state: "loading", data: { ...this.state } };
    this.listeners.forEach((f) => f());
  }
  async refresh() {
    const epoch = ++this.epoch;
    try {
      const saved = await this.db.readNote(this.document);
      if (this.closed || epoch !== this.epoch) return;
      if (this.ready && this.unsaved) return;
      this.state = {
        ...this.state,
        committed: saved.version,
        draft: structuredClone(saved.version.content),
        history: saved.history,
        save: {
          local: saved.version.revision ? "saved" : "unmodified",
          sync: "unconfigured",
        },
      };
      this.ready = true;
      this.publish();
    } catch (e) {
      if (this.closed || epoch !== this.epoch) return;
      // Once loaded, a failed background read must not turn retry-save into
      // initial-load recovery, which would replace the local draft with old text.
      if (this.ready) return;
      this.state.save = {
        local: "failed",
        sync: "unconfigured",
        error: { code: "SAVE_FAILED", message: String(e), recovery: ["retry"] },
      };
      this.publish();
    }
  }
  edit(content: NoteContent): Result<void> {
    if (this.leaving) return failure("BUSY", "正在切换论文，请稍后编辑笔记。");
    if (!this.ready || this.closed) return failure("BUSY", "笔记仍在读取");
    const valid = validateNote(content);
    if (!valid.ok) return valid;
    this.epoch++;
    this.state = {
      ...this.state,
      draft: structuredClone(content),
      editVersion: this.state.editVersion + 1,
      save: { ...this.state.save, local: this.state.conflict ? "failed" : "saving" },
    };
    this.publish();
    if (!this.state.conflict) void this.commit(this.state.committed.revision);
    return success(undefined);
  }
  commit(expected: string): Promise<Result<NoteVersion>> {
    if (!this.ready)
      return this.refresh().then(() =>
        this.ready
          ? success(this.state.committed)
          : failure("SAVE_FAILED", "笔记尚未读入，请重试"),
      );
    if (expected !== this.state.committed.revision)
      return Promise.resolve(failure("CONFLICT", "笔记版本已变化，请重新保存"));
    this.pending++;
    const task = this.queue
      .then(async (): Promise<Result<NoteVersion>> => {
        if (this.state.conflict) return failure("CONFLICT", "请先处理笔记冲突");
        if (!this.ready) return failure("BUSY", "笔记仍在读取");
        if (
          JSON.stringify(this.state.draft) ===
            JSON.stringify(this.state.committed.content) &&
          this.state.save.local !== "failed"
        ) {
          this.state.save = { local: "saved", sync: "unconfigured" };
          return success(this.state.committed);
        }
        const content = structuredClone(this.state.draft),
          version = this.state.editVersion,
          base = this.state.committed.revision;
        try {
          const saved = await this.db.writeNote(this.document, base, content);
          this.state = {
            ...this.state,
            committed: saved.version,
            history: saved.history,
            save: {
              local: this.state.editVersion === version ? "saved" : "saving",
              sync: "unconfigured",
            },
          };
          this.channel.postMessage({ key: this.key });
          return success(saved.version);
        } catch (e) {
          const error = {
            code: "SAVE_FAILED" as const,
            message: e instanceof Error ? e.message : "保存失败，草稿仍保留。",
            recovery: ["retry"] as const,
          };
          this.state.save = { local: "failed", sync: "unconfigured", error };
          if (e instanceof NoteConflictFault)
            this.state = {
              ...this.state,
              conflict: {
                id: crypto.randomUUID(),
                baseRevision: base,
                local: {
                  revision: crypto.randomUUID(),
                  content: structuredClone(this.state.draft),
                  updatedAt: new Date().toISOString(),
                },
                remote: e.remote.version,
              },
              save: {
                local: "failed",
                sync: "conflict",
                error: {
                  code: "CONFLICT",
                  message: e.message,
                  recovery: ["resolve-conflict"],
                },
              },
            };
          return failure(
            e instanceof NoteConflictFault ? "CONFLICT" : "SAVE_FAILED",
            error.message,
            ["retry"],
          );
        }
      })
      .finally(() => {
        this.pending--;
        this.publish();
      });
    this.queue = task.then(() => {});
    return task;
  }
  async flush() {
    await this.queue;
    return !this.unsaved;
  }
  async prepareToLeave() {
    this.leaving = true;
    this.publish();
    return this.flush();
  }
  cancelLeave() {
    if (this.closed || !this.leaving) return;
    this.leaving = false;
    this.publish();
  }
  async resolve(
    id: string,
    resolution: Parameters<NoteService["resolve"]>[1],
  ): Promise<Result<NoteVersion>> {
    await this.queue;
    const issue = this.state.conflict;
    if (!issue || issue.id !== id) return failure("CONFLICT", "冲突版本已变化");
    let resave = false;
    const editVersion = this.state.editVersion;
    const local = {
        ...issue.local,
        content: structuredClone(this.state.draft),
      },
      content =
        resolution.kind === "merged"
          ? resolution.content
          : resolution.kind === "local"
            ? local.content
            : issue.remote.content;
    const valid = validateNote(content);
    if (!valid.ok) return valid;
    this.pending++;
    this.publish();
    const task = (async (): Promise<Result<NoteVersion>> => {
      try {
        const saved = await this.db.writeNote(
          this.document,
          issue.remote.revision,
          content,
          [local, issue.remote],
        );
        resave = this.state.editVersion !== editVersion;
        this.state = {
          ...this.state,
          committed: saved.version,
          draft: resave ? this.state.draft : structuredClone(content),
          history: saved.history,
          conflict: undefined,
          save: { local: resave ? "saving" : "saved", sync: "unconfigured" },
        };
        this.channel.postMessage({ key: this.key });
        return success(saved.version);
      } catch (e) {
        if (e instanceof NoteConflictFault)
          this.state.conflict = { ...issue, remote: e.remote.version };
        return failure(
          "SAVE_FAILED",
          e instanceof Error ? e.message : "保存失败",
          ["retry"],
        );
      } finally {
        this.pending--;
        this.publish();
      }
    })();
    this.queue = task.then(() => {});
    void task.then(() => {
      if (resave) void this.commit(this.state.committed.revision);
    });
    return task;
  }
  async exportMarkdown() {
    const result = noteToMarkdown(this.state.draft);
    if (!result.ok) return result;
    return success({
      filename: "notes.md",
      mimeType: "text/markdown;charset=utf-8",
      text: result.value,
      warnings: ["图片保留为本机附件引用，请连同附件备份。"],
    });
  }
  async dispose() {
    if (this.closed) return true;
    if (!(await this.prepareToLeave()) || this.unsaved) {
      this.cancelLeave();
      return false;
    }
    this.closed = true;
    this.channel.close();
    this.listeners.clear();
    await this.db.close();
    return true;
  }
}
