import { useId } from 'react';
import { Segmented, Stepper } from '@/ui/components';
import { SettingGroup, SettingRow } from '../SettingRow';
import type { RuntimeConfig } from '../types';

interface AdvancedSectionProps {
  runtime: RuntimeConfig;
  onChange: (runtime: RuntimeConfig) => void;
  /** Problems by path, e.g. "runtime.timeoutSec". */
  problems: ReadonlyMap<string, string>;
}

export const RUNTIME_LIMITS = { timeout: { min: 10, max: 900 }, concurrency: { min: 1, max: 12 } } as const;

/** Request limits. Part of the settings draft: saved together with models and features. */
export function AdvancedSection({ runtime, onChange, problems }: AdvancedSectionProps) {
  const timeoutId = useId();
  const outputId = useId();
  const set = (change: Partial<RuntimeConfig>) => onChange({ ...runtime, ...change });
  const customOutput = runtime.maxOutputTokens !== null;

  return (
    <SettingGroup title="请求" description="对所有 AI 功能生效。改动只影响之后开始的任务。">
      <SettingRow
        label="超时"
        htmlFor={timeoutId}
        description={`一次请求最长等多久，${RUNTIME_LIMITS.timeout.min}–${RUNTIME_LIMITS.timeout.max} 秒。排队的时间也算在内。`}
        error={problems.get('runtime.timeoutSec')}
      >
        <span className="pp-set-number">
          <input
            id={timeoutId}
            inputMode="numeric"
            value={Number.isNaN(runtime.timeoutSec) ? '' : String(runtime.timeoutSec)}
            onChange={(event) => set({ timeoutSec: event.target.value === '' ? Number.NaN : Number(event.target.value.replace(/\D/g, '')) })}
          />
          <span>秒</span>
        </span>
      </SettingRow>
      <SettingRow label="同时进行的请求" description="调低不会中断已经开始的请求。" error={problems.get('runtime.concurrency')}>
        <Stepper
          label="同时进行的请求"
          value={runtime.concurrency}
          min={RUNTIME_LIMITS.concurrency.min}
          max={RUNTIME_LIMITS.concurrency.max}
          onChange={(concurrency) => set({ concurrency })}
        />
      </SettingRow>
      <SettingRow
        label="输出长度上限"
        description="每次回答最多生成多少 token。各模型能接受的上限不同，保存时会逐个核对。"
        error={problems.get('runtime.maxOutputTokens')}
        stacked
      >
        <div className="pp-set-inline">
          <Segmented
            label="输出长度上限"
            size="sm"
            options={[
              { value: 'default', label: '模型默认' },
              { value: 'custom', label: '自定义' },
            ]}
            value={customOutput ? 'custom' : 'default'}
            onChange={(mode) => set({ maxOutputTokens: mode === 'default' ? null : 8192 })}
          />
          {customOutput && (
            <span className="pp-set-number">
              <input
                id={outputId}
                aria-label="输出长度上限（token）"
                inputMode="numeric"
                value={Number.isNaN(runtime.maxOutputTokens) ? '' : String(runtime.maxOutputTokens)}
                onChange={(event) => set({ maxOutputTokens: event.target.value === '' ? Number.NaN : Number(event.target.value.replace(/\D/g, '')) })}
              />
              <span>token</span>
            </span>
          )}
        </div>
      </SettingRow>
    </SettingGroup>
  );
}

/** Range checks the page can make before saving; the logic layer checks again. */
export function runtimeProblems(runtime: RuntimeConfig): { path: string; message: string }[] {
  const problems: { path: string; message: string }[] = [];
  const { timeout, concurrency } = RUNTIME_LIMITS;
  if (!Number.isInteger(runtime.timeoutSec) || runtime.timeoutSec < timeout.min || runtime.timeoutSec > timeout.max)
    problems.push({ path: 'runtime.timeoutSec', message: `请填 ${timeout.min} 到 ${timeout.max} 之间的整数。` });
  if (runtime.concurrency < concurrency.min || runtime.concurrency > concurrency.max)
    problems.push({ path: 'runtime.concurrency', message: `请在 ${concurrency.min} 到 ${concurrency.max} 之间。` });
  if (runtime.maxOutputTokens !== null && (!Number.isInteger(runtime.maxOutputTokens) || runtime.maxOutputTokens <= 0))
    problems.push({ path: 'runtime.maxOutputTokens', message: '请填一个正整数，或改回模型默认。' });
  return problems;
}
