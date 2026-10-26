import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImportJobView, LibraryImports } from '../types';

// 示例接线：模拟导入队列，文件依次经过读取、检查、保存。名称含 locked 的文件需要密码（示例密码 1234），
// 含 fail 的文件导入失败，用来演示各种状态。不会真正导入任何东西。

type Job = ImportJobView & { step: number };

export function useSampleImports(): LibraryImports & { addFiles: (files: File[]) => void } {
  const [jobs, setJobs] = useState<Job[]>([]);
  const counter = useRef(0);

  const add = useCallback((titles: string[]) => {
    setJobs((current) => [...current, ...titles.map((title) => ({ id: `job-${++counter.current}`, title, phase: 'queued' as const, step: 0 }))]);
  }, []);

  // One job at a time, a few steps a second.
  useEffect(() => {
    const running = jobs.find((job) => job.phase !== 'completed' && job.phase !== 'failed' && job.phase !== 'cancelled' && job.phase !== 'password-required');
    if (!running) return;
    const timer = window.setTimeout(() => {
      setJobs((current) =>
        current.map((job) => {
          if (job.id !== running.id) return job;
          const step = job.step + 1;
          if (step === 1) return { ...job, step, phase: 'reading', progress: { completed: 0, total: 10, unit: 'bytes' } };
          if (step < 6) return { ...job, step, phase: 'reading', progress: { completed: step * 2, total: 10, unit: 'bytes' } };
          if (step === 6) {
            if (/locked/i.test(job.title)) return { ...job, step, phase: 'password-required', progress: undefined, passwordRequest: { requestId: `pw-${job.id}`, incorrect: false } };
            return { ...job, step, phase: 'validating', progress: undefined };
          }
          if (step === 7) {
            if (/fail/i.test(job.title)) return { ...job, step, phase: 'failed', error: '这个文件不是有效的 PDF。' };
            return { ...job, step, phase: 'saving' };
          }
          return { ...job, step, phase: 'completed', added: job.title.includes('arxiv') ? 0 : 1, reused: job.title.includes('arxiv') ? 1 : 0 };
        }),
      );
    }, 350);
    return () => window.clearTimeout(timer);
  }, [jobs]);

  return {
    jobs,
    addFiles: (files) => add(files.map((file) => file.name)),
    onImportUrl: async (url) => {
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      add([decodeURIComponent(url.replace(/^https?:\/\//, '').split(/[?#]/)[0] ?? url)]);
      return null;
    },
    onCancel: (id) => setJobs((current) => current.map((job) => (job.id === id ? { ...job, phase: 'cancelled', progress: undefined, passwordRequest: undefined } : job))),
    onRetry: (id) => setJobs((current) => current.map((job) => (job.id === id ? { ...job, phase: 'queued', step: 0, error: undefined, title: job.title.replace(/fail/gi, '') } : job))),
    onPassword: (id, _requestId, password) =>
      setJobs((current) =>
        current.map((job) =>
          job.id === id
            ? password === '1234'
              ? { ...job, phase: 'validating', passwordRequest: undefined }
              : { ...job, passwordRequest: { requestId: job.passwordRequest!.requestId, incorrect: true } }
            : job,
        ),
      ),
  };
}
