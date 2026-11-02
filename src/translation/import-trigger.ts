import { browser } from 'wxt/browser';
import { allowTranslation } from './consent';
import { ImportTranslationJobs } from './import-jobs';
import { toast } from '@/ui/components';

export async function wakeImportedTranslation(documentId: string, fileVersion: string, password?: string) {
  if (
    !(await allowTranslation(
      undefined,
      '已开启导入时自动翻译。新论文将发送给所选翻译服务处理，可能产生费用。',
    ))
  ) {
    const jobs = new ImportTranslationJobs();
    try {
      await jobs.remove({ documentId, fileVersion });
    } finally {
      await jobs.close();
    }
    return;
  }
  try {
    const result = await browser.runtime.sendMessage({
      type: 'WAKE_IMPORT_TRANSLATOR',
      docId: documentId,
      password,
    });
    if (!result?.ok) throw new Error();
  } catch {
    toast.show({ tone: 'warning', message: '论文已导入，自动翻译暂未启动。可在阅读器中手动翻译。' });
  }
}
