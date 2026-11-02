import { browser } from 'wxt/browser';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { DocumentRef } from '@/contracts/document';
import { ImportTranslationJobs } from '@/translation/import-jobs';
import { extractPaper } from '@/translation/extract';
import { TranslationSession } from '@/translation/session';
import { PreferenceStore } from '@/data/preference-store';
import { translationCostAccepted } from '@/translation/consent';
import { isTranslationLanguage } from '@/translation/languages';

GlobalWorkerOptions.workerSrc = workerUrl;
const passwords = new Map<string, string>();
const updates = new BroadcastChannel('paperpane-import-translations');
let active: TranslationSession | undefined,
  draining = false,
  again = false;
const changes = new BroadcastChannel('paperpane-preferences');
changes.onmessage = async () => {
  const db = new PreferenceStore();
  try {
    if ((await db.read()).autoTranslate !== 'on-add') await active?.pauseAutomatic();
  } finally {
    await db.close();
  }
};
async function translate(ref: DocumentRef, db: ImportTranslationJobs) {
  const preferences = new PreferenceStore();
  const saved = await preferences.read().finally(() => preferences.close());
  if (saved.autoTranslate !== 'on-add' || !translationCostAccepted()) return;
  const session = new TranslationSession(
    ref,
    async (signal, progress) => {
      const bytes = new Uint8Array(await (await db.readFile(ref)).arrayBuffer());
      signal.throwIfAborted();
      const task = getDocument({ data: bytes, password: passwords.get(ref.documentId), enableXfa: false });
      const abort = () => {
        void task.destroy().catch(() => {});
      };
      signal.addEventListener('abort', abort, { once: true });
      try {
        return await extractPaper(await task.promise, ref, signal, progress);
      } finally {
        signal.removeEventListener('abort', abort);
        await task.destroy();
      }
    },
    () => {},
  );
  active = session;
  try {
    await session.load();
    const fresh = new PreferenceStore();
    const current = await fresh.read().finally(() => fresh.close());
    if (current.autoTranslate !== 'on-add') return;
    await session.startAutomatic(
      isTranslationLanguage(current.translationLanguage) ? current.translationLanguage : 'zh-CN',
    );
    if (session.error || session.run?.phase === 'failed')
      throw new Error(session.error || session.run?.error || '翻译失败。');
  } finally {
    await session.dispose();
    active = undefined;
  }
}
async function drain() {
  if (draining) {
    again = true;
    return;
  }
  draining = true;
  const db = new ImportTranslationJobs();
  try {
    do {
      again = false;
      for (const ref of await db.pending()) {
        try {
          await translate(ref, db);
        } catch (e) {
          updates.postMessage({
            type: 'error',
            ...ref,
            message: e instanceof Error ? e.message : '自动翻译失败。',
          });
        }
        passwords.delete(ref.documentId);
        await db.remove(ref);
      }
    } while (again);
  } finally {
    draining = false;
    await db.close();
    void browser.runtime.sendMessage({ type: 'IMPORT_TRANSLATOR_IDLE' }).catch(() => {});
  }
}
browser.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== browser.runtime.id || sender.tab || msg?.type !== 'TRANSLATE_IMPORT_QUEUE') return;
  if (typeof msg.password === 'string' && typeof msg.docId === 'string')
    passwords.set(msg.docId, msg.password);
  reply(true);
  void drain().catch(() => {});
});
