import { browser } from 'wxt/browser';
import { ImportTranslationJobs } from './import-jobs';

export function installImportTranslation() {
  const workerUrl = browser.runtime.getURL('/auto-translation.html');
  const lock = 'paperpane-import-translator-lifecycle';
  const pending = async () => {
    const db = new ImportTranslationJobs();
    try {
      return (await db.pending()).length > 0;
    } finally {
      await db.close();
    }
  };
  const exists = async () => (await browser.runtime.getContexts({ documentUrls: [workerUrl] })).length > 0;
  const wake = (docId?: string, password?: string) =>
    navigator.locks.request(lock, async () => {
      if (!(await pending())) return;
      if (!(await exists()))
        await browser.offscreen.createDocument({
          url: workerUrl,
          reasons: ['WORKERS'],
          justification: '提取新导入 PDF 的文本并完成用户开启的自动翻译。',
        });
      await browser.runtime.sendMessage({ type: 'TRANSLATE_IMPORT_QUEUE', docId, password });
    });
  browser.runtime.onMessage.addListener((msg, sender, reply) => {
    if (sender.id !== browser.runtime.id || !sender.url?.startsWith(browser.runtime.getURL('/'))) return;
    if (msg?.type === 'WAKE_IMPORT_TRANSLATOR') {
      void wake(msg.docId, msg.password).then(
        () => reply({ ok: true }),
        () => reply({ ok: false }),
      );
      return true;
    }
    if (sender.url !== workerUrl) return;
    if (msg?.type === 'IMPORT_TRANSLATOR_IDLE') {
      void navigator.locks
        .request(lock, async () => {
          if (!(await pending()) && (await exists())) await browser.offscreen.closeDocument();
        })
        .catch(() => {});
      return;
    }
    if (msg?.type === 'CHECK_TRANSLATION_ORIGIN') {
      void (async () => {
        const u = new URL(msg.url);
        return (
          ['https:', 'http:'].includes(u.protocol) &&
          browser.permissions.contains({ origins: [u.protocol + '//' + u.hostname + '/*'] })
        );
      })().then(reply, () => reply(false));
      return true;
    }
  });
  browser.runtime.onStartup.addListener(() => {
    void wake().catch(() => {});
  });
}
