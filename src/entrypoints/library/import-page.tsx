import { useState } from 'react';
import { ScaffoldPage } from '@/ui/ScaffoldPage';
import { Button, SaveStatus } from '@/ui/components';
import { useContract } from '@/runtime/use-contract';
import { createDocumentService } from '@/document/service';
import { safeFilename } from '@/document/download';
import type { Result } from '@/contracts/common';
import type { DocumentRecord, ImportJob } from '@/contracts/document';

// Temporary integration surface using existing components; the designed library
// will replace this page without changing the import/storage service.
const owner = createDocumentService();
window.addEventListener('pagehide', (event) => { if (!event.persisted) owner.dispose(); });
const phases: Record<ImportJob['phase'], string> = {
  reading: '正在读取文件', validating: '正在检查并保存 PDF', extracting: '正在提取文字',
  'password-required': '需要 PDF 密码', readable: '原文件已保存', partial: '部分可用',
  'no-text': '没有文字层', failed: '导入失败', cancelled: '已取消',
};
export function ImportPage() {
  const snapshot = useContract(owner.service);
  const [url, setUrl] = useState('');
  const [notice, setNotice] = useState('');
  const [authorizing, setAuthorizing] = useState(false);
  const busy = authorizing || snapshot.data.jobs.some((job) => ['reading', 'validating', 'extracting', 'password-required'].includes(job.phase));
  const report = (result: Result<unknown>) => { if (!result.ok) setNotice(result.error.message); };
  const importFile = (file?: File) => {
    setNotice(''); if (file) void owner.service.importDocument({ kind: 'local', file }).then(report);
  };
  async function download(document: DocumentRecord) {
    const result = await owner.readFile(document);
    if (!result.ok) { report(result); return; }
    const href = URL.createObjectURL(result.value);
    const anchor = window.document.createElement('a');
    anchor.href = href; anchor.download = safeFilename(document.title); anchor.click();
    setTimeout(() => URL.revokeObjectURL(href), 30_000);
  }
  return <ScaffoldPage title="导入与已保存论文">
    <p>文件会保存在此扩展中。导入期间请保持此页打开；PDF 正文阅读将在下一步接入。</p>
    <section aria-label="导入论文" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
      event.preventDefault();
      if (busy) { setNotice('请先完成或取消当前导入'); return; }
      if (event.dataTransfer.files.length !== 1) { setNotice('请一次拖入一份 PDF'); return; }
      importFile(event.dataTransfer.files[0]);
    }}>
      <p><label>选择或拖入 PDF（最多 256 MiB） <input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(event) => { importFile(event.target.files?.[0]); event.target.value = ''; }} /></label></p>
      <form onSubmit={(event) => {
        event.preventDefault(); if (busy) return;
        setNotice(''); setAuthorizing(true);
        // The permissions request must start here, inside this user gesture.
        void owner.service.importDocument({ kind: 'url', url, intent: 'import' }).then(report).finally(() => setAuthorizing(false));
      }}>
        <label>直接 PDF 链接 <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} required placeholder="https://…/paper.pdf" disabled={busy} /></label>{' '}
        <Button type="submit" disabled={busy}>{authorizing ? '等待站点授权' : '从链接导入'}</Button>
      </form>
    </section>
    {notice && <p role="alert">{notice}</p>}
    {snapshot.state === 'loading' && <p role="status">正在读取已保存论文…</p>}
    {(snapshot.state === 'failed' || snapshot.state === 'partial') && <p role="alert">{snapshot.error.message} <Button onClick={() => void owner.refresh()}>重新读取</Button></p>}
    <section aria-label="导入任务">
      {snapshot.data.jobs.map((job) => <article key={job.id}>
        <p>{job.title} · <span role="status">{phases[job.phase]}</span>{owner.getImportReceipt(job.id)?.duplicate ? '（已复用相同文件的论文记录）' : ''}</p>
        {job.progress && <p><progress aria-label="读取文件进度" max={job.progress.total ?? 1} value={job.progress.total ? job.progress.completed : undefined} />{' '}{(job.progress.completed / 1024 / 1024).toFixed(1)} MiB</p>}
        {job.error && <p role="alert">{job.error.message}</p>}
        {job.passwordRequest && <PasswordForm key={job.passwordRequest.requestId} job={job} report={report} />}
        {['reading', 'validating', 'extracting', 'password-required'].includes(job.phase) && <Button onClick={() => void owner.service.cancel(job.id).then(report)}>取消导入</Button>}
        {['failed', 'cancelled'].includes(job.phase) && <Button disabled={busy} onClick={() => void owner.service.retry(job.id).then(report)}>重试</Button>}
      </article>)}
    </section>
    <section aria-label="已保存论文">
      <h2>已保存论文（{snapshot.data.documents.length}）</h2>
      {snapshot.state === 'ready' && snapshot.data.documents.length === 0 && <p>还没有导入论文。</p>}
      <ul>{snapshot.data.documents.map((doc) => <li key={doc.id}>
        <p>{doc.title} · {doc.pageCount} 页 <SaveStatus local={doc.save.local} sync={doc.save.sync} /></p>
        {doc.lastReadAt && <p>上次阅读：第 {(doc.position?.pageIndex ?? 0) + 1} 页</p>}
        <Button onClick={() => void download(doc)}>下载已保存的 PDF</Button>
      </li>)}</ul>
      <Button onClick={() => void owner.refresh()}>刷新列表</Button>{' '}
      <Button onClick={() => void owner.clearCache().then((result) => { if (result.ok) setNotice('渲染缓存已清理；论文原文件和记录保留。'); else report(result); })}>清理渲染缓存</Button>
      <p>当前仅保存在本机，WebDAV 与完整备份功能尚未接入。卸载扩展或删除浏览器配置会移除本机数据。</p>
    </section>
  </ScaffoldPage>;
}
function PasswordForm({ job, report }: { job: ImportJob; report: (result: Result<unknown>) => void }) {
  const [password, setPassword] = useState('');
  return <form onSubmit={(event) => {
    event.preventDefault();
    const value = password; setPassword('');
    if (job.passwordRequest) void owner.service.submitPassword(job.id, job.passwordRequest.requestId, value).then(report);
  }}>
    <label>PDF 密码 <input type="password" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{' '}
    <Button type="submit">解锁并继续</Button>
    <p>密码仅用于本次检查，不会保存。</p>
  </form>;
}
