import { PaperDatabase } from "./database";
import type { DocumentRef } from "@/contracts/document";
import type { NoteVersion } from "@/contracts/notes";
export interface NoteRecord {
  version: NoteVersion;
  history: NoteVersion[];
}
export class NoteConflictFault extends Error {
  constructor(readonly remote: NoteRecord) {
    super("笔记已在另一窗口修改，两版内容均已保留。");
  }
}
export const noteKey = (ref: DocumentRef) =>
  `notes:v1:${ref.documentId}:${ref.fileVersion}`;
const empty = (): NoteRecord => ({
  version: {
    revision: "",
    content: { format: "paperpane-markdown", schemaVersion: 1, markdown: "" },
    updatedAt: new Date().toISOString(),
  },
  history: [],
});
export class NoteDatabase extends PaperDatabase {
  async readNote(ref: DocumentRef): Promise<NoteRecord> {
    const db = await this.open();
    return new Promise((ok, no) => {
      const tx = db.transaction("meta"),
        r = tx.objectStore("meta").get(noteKey(ref));
      r.onsuccess = () => ok(r.result?.value ?? empty());
      tx.onabort = () => no(tx.error);
      r.onerror = () => no(r.error);
    });
  }
  async writeNote(
    ref: DocumentRef,
    expected: string,
    content: NoteVersion["content"],
    keep: readonly NoteVersion[] = [],
  ): Promise<NoteRecord> {
    const db = await this.open();
    return new Promise((ok, no) => {
      const tx = db.transaction(["meta", "documents", "changes"], "readwrite", {
          durability: "strict",
        }),
        store = tx.objectStore("meta");
      let result: NoteRecord, error: Error | undefined;
      const doc = tx.objectStore("documents").get(ref.documentId);
      doc.onsuccess = () => {
        if (
          !doc.result ||
          doc.result.deletedAt ||
          doc.result.fileVersion !== ref.fileVersion
        ) {
          error = new Error("论文已不可用，笔记草稿仍保留。");
          tx.abort();
          return;
        }
        const r = store.get(noteKey(ref));
        r.onsuccess = () => {
          const previous: NoteRecord = r.result?.value ?? empty();
          if (previous.version.revision !== expected) {
            error = new NoteConflictFault(previous);
            tx.abort();
            return;
          }
          result = {
            version: {
              content: structuredClone(content),
              revision: crypto.randomUUID(),
              updatedAt: new Date().toISOString(),
            },
            history: [
              ...previous.history,
              ...keep.map((x) => structuredClone(x)),
            ],
          };
          store.put({ key: noteKey(ref), value: result });
          tx.objectStore("changes").add({
            entity: "notes",
            entityId: noteKey(ref),
            documentId: ref.documentId,
            fileVersion: ref.fileVersion,
            revision: result.version.revision,
            baseRevision: expected,
            operation: "upsert",
            at: result.version.updatedAt,
          });
        };
      };
      tx.oncomplete = () => ok(result!);
      tx.onabort = () => no(error ?? tx.error ?? new Error("笔记保存失败"));
      tx.onerror = () => {};
    });
  }
}
