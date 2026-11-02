import { useEffect, useSyncExternalStore } from 'react';
import { browser } from 'wxt/browser';
import { TranslationConfirm } from '@/ui/reader/translation/TranslationConfirm';
import { toast } from '@/ui/components';
import { consentSnapshot, subscribeConsent } from '@/translation/consent';
import type { TranslationSession } from '@/translation/session';
import { translationProblem, removedEngine } from '@/translation/problems';

function openSettings(section: 'models' | 'translation') {
  if (location.pathname === '/options.html') {
    location.hash = section;
    return;
  }
  void browser.tabs.create({ url: browser.runtime.getURL('/options.html') + '#' + section });
}
export function TranslationNoticeHost() {
  const prompt = useSyncExternalStore(subscribeConsent, consentSnapshot);
  return (
    <TranslationConfirm
      open={!!prompt}
      detail={prompt?.detail}
      onConfirm={() => prompt?.finish(true)}
      onClose={() => prompt?.finish(false)}
      onSettings={() => {
        if (prompt) {
          prompt.finish(false);
          openSettings(prompt.section);
        }
      }}
    />
  );
}
export function showTranslationProblem(raw: string, engine?: string, retry?: () => void) {
  const { message, section } = translationProblem(raw, engine);
  return toast.show({
    tone: 'error',
    message,
    action: section
      ? { label: message === removedEngine ? '选择引擎' : '去设置', onAction: () => openSettings(section) }
      : retry
        ? { label: '重试', onAction: retry }
        : undefined,
  });
}
export function useTranslationProblem(session?: TranslationSession) {
  const failure = session?.failure;
  useEffect(() => {
    if (!failure || !session) return;
    const id = showTranslationProblem(failure.message, failure.engine, () => void session.retryLast());
    return () => toast.dismiss(id);
  }, [session, failure]);
}
