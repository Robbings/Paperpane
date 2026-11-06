import { defaultCards } from "./defaults";
import { mergeRecords } from "./merge";
import { PaperDatabase } from "@/data/database";
import { emptyRecord, type ResearchRecord } from "./types";
export const OVERVIEW_TEMPLATE_KEY = 'overview-template-v1';
/** One durable record per PDF version. CAS prevents other windows overwriting it. */
export class ResearchStore extends PaperDatabase {
  async read(key: string): Promise<ResearchRecord> {
    const db = await this.open(),
      tx = db.transaction("meta", "readonly");
    const read = (id: string) => new Promise<any>((resolve, reject) => {
      const r = tx.objectStore('meta').get(id);
      r.onsuccess = () => resolve(r.result?.value);
      r.onerror = () => reject(r.error);
    });
    const [stored, template] = await Promise.all([read(key), read(OVERVIEW_TEMPLATE_KEY)]);
    const record: ResearchRecord = stored ?? emptyRecord();
    if (Array.isArray(template?.cards)) record.cards = structuredClone(template.cards);
    else if (!record.cards.length) record.cards = structuredClone(defaultCards);
    return record;
  }
  async saveOverviewTemplate(cards: ResearchRecord['cards']) {
    const db = await this.open(), tx = db.transaction('meta', 'readwrite', { durability: 'strict' });
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('概览设置保存失败，请重试。'));
    });
    tx.objectStore('meta').put({ key: OVERVIEW_TEMPLATE_KEY, value: { cards: structuredClone(cards) } });
    await done;
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
