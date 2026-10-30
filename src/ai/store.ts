import { mergeRecords } from "./merge";
import { PaperDatabase } from "@/data/database";
import { emptyRecord, type ResearchRecord } from "./types";
/** One durable record per PDF version. CAS prevents other windows overwriting it. */
export class ResearchStore extends PaperDatabase {
  async read(key: string): Promise<ResearchRecord> {
    const db = await this.open(),
      tx = db.transaction("meta", "readonly");
    return new Promise((resolve, reject) => {
      const r = tx.objectStore("meta").get(key);
      r.onsuccess = () => resolve(r.result?.value ?? emptyRecord());
      r.onerror = () => reject(r.error);
    });
  }
  async save(
    key: string,
    value: ResearchRecord,
    expected: string,
    base: ResearchRecord,
  ): Promise<ResearchRecord> {
    const db = await this.open(),
      tx = db.transaction("meta", "readwrite", { durability: "strict" }),
      revision = crypto.randomUUID();
    let written: ResearchRecord;
    return new Promise((resolve, reject) => {
      const store = tx.objectStore("meta"),
        r = store.get(key);
      r.onsuccess = () => {
        const remote: ResearchRecord = r.result?.value ?? emptyRecord();
        written = {
          ...(remote.revision === expected
            ? structuredClone(value)
            : mergeRecords(base, value, remote)),
          revision,
        };
        store.put({ key, value: written });
      };
      tx.oncomplete = () => resolve(written);
      tx.onabort = () =>
        reject(new Error("AI 记录保存失败，请检查存储空间后重试。"));
    });
  }
}
