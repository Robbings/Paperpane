import type { DocumentRef } from '@/contracts/document';
import { browser } from 'wxt/browser';
import { allowTranslation } from './consent';
import { ImportTranslationJobs } from './import-jobs';
import { toast } from '@/ui/components';

export async function wakeImportedTranslation(documentId: string, fileVersion: string, password?: string) {
  if (
    !(await allowTranslation(
      undefined,
      '导入论文时会自动翻译全文，批量导入可能增加用量。',
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

export async function retryImportedTranslation(ref:DocumentRef) {
  const jobs=new ImportTranslationJobs();
  try {await jobs.retry(ref);} finally {await jobs.close();}
  await wakeImportedTranslation(ref.documentId,ref.fileVersion);
}
