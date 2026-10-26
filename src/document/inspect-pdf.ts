import { getDocument, GlobalWorkerOptions, PasswordResponses } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ImportFault, abortIfNeeded } from './errors';
import { extractPdfBibliography } from './bibliography';
import type { PdfBibliography } from '@/contracts/library';
GlobalWorkerOptions.workerSrc = workerUrl;

export async function inspectPdf(
  bytes: Uint8Array,
  signal: AbortSignal,
  askPassword: (submit: (password: string) => void, incorrect: boolean) => void,
  options: { metadataOnly?: boolean } = {},
): Promise<{ pageCount: number; bibliography: PdfBibliography }> {
  abortIfNeeded(signal);
  const header = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(1024, bytes.length)));
  if (!/%PDF-\d\.\d/.test(header)) throw new ImportFault({ code: 'UNSUPPORTED_FILE', message: '文件内容不是 PDF，请重新选择文件或检查下载链接', recovery: ['choose-file'] });
  // PDF.js transfers its buffer to the packaged worker. Preserve original bytes for hashing/storage.
  const task = getDocument({ data: bytes.slice(), stopAtErrors: true, useWorkerFetch: false, useSystemFonts: false, disableFontFace: true, enableXfa: false });
  task.onPassword = (submit: (password: string) => void, reason: number) => {
    if (!signal.aborted) askPassword(submit, reason === PasswordResponses.INCORRECT_PASSWORD);
  };
  const abort = () => { void task.destroy().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    abortIfNeeded(signal);
    const pdf = await task.promise;
    abortIfNeeded(signal);
    if (!Number.isInteger(pdf.numPages) || pdf.numPages <= 0) throw new ImportFault({ code: 'CORRUPT_FILE', message: 'PDF 没有可读取的页面', recovery: ['choose-file'] });
    // Existing stored PDFs have already passed page-tree validation.
    for (let index = 1; !options.metadataOnly && index <= pdf.numPages; index++) {
      abortIfNeeded(signal);
      const page = await pdf.getPage(index); page.cleanup();
    }
    const bibliography = await extractPdfBibliography(pdf, signal);
    return { pageCount: pdf.numPages, bibliography };
  } finally { signal.removeEventListener('abort', abort); await task.destroy().catch(() => {}); }
}
