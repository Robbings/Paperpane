import { PaperDatabase } from './database';

const KEY = 'readerPreferences';

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Local non-secret preferences. Each field patch merges with the latest committed values. */
export class PreferenceStore extends PaperDatabase {
  async read(): Promise<Record<string, unknown>> {
    const db = await this.open();
    const tx = db.transaction('meta', 'readonly');
    return new Promise((resolve, reject) => {
      let value: Record<string, unknown> = {};
      const request = tx.objectStore('meta').get(KEY);
      request.onsuccess = () => {
        value = object(request.result?.value);
      };
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(tx.error ?? new Error('Preference read aborted'));
    });
  }

  async patch(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    const db = await this.open();
    const tx = db.transaction('meta', 'readwrite', { durability: 'strict' });
    return new Promise((resolve, reject) => {
      let value: Record<string, unknown> = {};
      const store = tx.objectStore('meta');
      const request = store.get(KEY);
      request.onsuccess = () => {
        value = { ...object(request.result?.value), ...patch };
        store.put({ key: KEY, value });
      };
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(tx.error ?? new Error('Preference save aborted'));
    });
  }
}
