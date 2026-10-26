import { useState, type RefObject } from 'react';
import { Button, Dialog, Icon, Popover, ProgressBar, ScrollArea, TextField, type IconName } from '@/ui/components';
import type { ImportJobView } from './types';

const phaseText: Record<ImportJobView['phase'], string> = {
  queued: '等待中',
  reading: '读取文件',
  validating: '检查文件',
  'password-required': '需要密码',
  saving: '保存到本机',
  completed: '已完成',
  failed: '导入失败',
  cancelled: '已取消',
};

export const jobPending = (job: ImportJobView) => job.phase !== 'completed' && job.phase !== 'failed' && job.phase !== 'cancelled';

const jobIcon = (job: ImportJobView): IconName =>
  job.phase === 'completed' ? 'check' : job.phase === 'failed' ? 'alert' : job.phase === 'password-required' ? 'lock' : 'file';

function JobRow({ job, onCancel, onRetry, onPassword }: { job: ImportJobView } & Pick<ImportTasksProps, 'onCancel' | 'onRetry' | 'onPassword'>) {
  const [password, setPassword] = useState('');
  const busy = job.phase === 'reading' || job.phase === 'validating' || job.phase === 'saving';
  const detail =
    job.phase === 'completed'
      ? job.reused && !job.added
        ? '已在文献库中'
        : job.reused
          ? `新增 ${job.added ?? 0} 篇，已有 ${job.reused} 篇`
          : `新增 ${job.added ?? 0} 篇`
      : job.phase === 'failed' && job.error
        ? job.error
        : phaseText[job.phase];

  return (
    <li className="pp-imports__job" data-phase={job.phase}>
      <span className="pp-imports__icon" aria-hidden="true">
        <Icon name={jobIcon(job)} size={15} />
      </span>
      <div className="pp-imports__body">
        <p className="pp-imports__title" title={job.title}>
          {job.title}
        </p>
        <p className="pp-imports__detail">{detail}</p>
        {busy && (
          <ProgressBar label={phaseText[job.phase]} value={job.progress?.total ? job.progress.completed / job.progress.total : undefined} />
        )}
        {job.passwordRequest && (
          <form
            className="pp-imports__password"
            onSubmit={(event) => {
              event.preventDefault();
              if (!password) return;
              onPassword(job.id, job.passwordRequest!.requestId, password);
              setPassword('');
            }}
          >
            <TextField
              label="PDF 密码"
              hideLabel
              type="password"
              autoComplete="off"
              placeholder="输入 PDF 密码"
              value={password}
              onChange={setPassword}
              error={job.passwordRequest.incorrect ? '密码不正确，请重新输入' : undefined}
            />
            <Button size="sm" type="submit" disabled={!password}>
              解锁
            </Button>
          </form>
        )}
      </div>
      {jobPending(job) && job.phase !== 'saving' && (
        <Button size="sm" variant="quiet" onClick={() => onCancel(job.id)}>
          取消
        </Button>
      )}
      {(job.phase === 'failed' || job.phase === 'cancelled') && (
        <Button size="sm" variant="quiet" onClick={() => onRetry(job.id)}>
          重试
        </Button>
      )}
    </li>
  );
}

interface ImportTasksProps {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  jobs: readonly ImportJobView[];
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onPassword: (id: string, requestId: string, password: string) => void;
}

/** The import queue under the toolbar's tasks button: newest first, with cancel, retry and passwords. */
export function ImportTasks({ anchorRef, open, onClose, jobs, ...actions }: ImportTasksProps) {
  const active = jobs.filter(jobPending).length;
  return (
    <Popover anchorRef={anchorRef} open={open} onClose={onClose} label="导入任务" placement="bottom-end" width={360} className="pp-imports">
      <div className="pp-imports__head">
        <h2>导入任务</h2>
        <span>{active ? `${active} 项进行中` : '全部完成'}</span>
      </div>
      <ScrollArea className="pp-imports__scroll" viewportClassName="pp-imports__viewport">
        <ul className="pp-imports__list">
          {[...jobs].reverse().map((job) => (
            <JobRow key={job.id} job={job} {...actions} />
          ))}
        </ul>
      </ScrollArea>
      {active > 0 && <p className="pp-imports__foot">文件依次导入。完成前请不要关闭这个页面。</p>}
    </Popover>
  );
}

interface UrlImportDialogProps {
  open: boolean;
  onClose: () => void;
  /** Resolves with an error message, or null once the link is queued. */
  onSubmit: (url: string) => Promise<string | null>;
}

/** Import a PDF from a link: one field, checked by the queue before it is accepted. */
export function UrlImportDialog({ open, onClose, onSubmit }: UrlImportDialogProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const close = () => {
    setUrl('');
    setError(undefined);
    onClose();
  };
  const submit = async () => {
    const value = url.trim();
    if (!/^https?:\/\//i.test(value)) {
      setError('请填写以 http:// 或 https:// 开头的 PDF 网址');
      return;
    }
    setBusy(true);
    const problem = await onSubmit(value);
    setBusy(false);
    if (problem) setError(problem);
    else close();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title="从网址导入 PDF"
      description="填写 PDF 文件的直接链接。下载后会和本地文件一样保存到本机。"
      footer={
        <>
          <Button onClick={close}>取消</Button>
          <Button variant="primary" disabled={busy || !url.trim()} onClick={() => void submit()}>
            {busy ? '正在加入…' : '导入'}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <TextField
          label="PDF 网址"
          hideLabel
          icon="link"
          type="url"
          placeholder="https://…/paper.pdf"
          value={url}
          onChange={(value) => {
            setUrl(value);
            setError(undefined);
          }}
          error={error}
        />
      </form>
    </Dialog>
  );
}
