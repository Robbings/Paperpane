import { useEffect, useRef, useState } from 'react';
import { useExternalStoreRuntime } from '@assistant-ui/react';
import type { ConversationService } from '../contracts/conversation';
import { useContract } from '../runtime/use-contract';
import { createConversationAdapter, type ConversationAdapterFailure } from './assistant-ui-adapter';

/** Mount one keyed provider per visible session; unmounting never stops service tasks. */
export function useConversationRuntime(service: ConversationService, sessionId: string) {
  const owner = useRef({ service, sessionId });
  if (owner.current.service !== service || owner.current.sessionId !== sessionId) throw new Error('Remount the conversation provider with key=sessionId when changing its owner');
  const snapshot = useContract(service);
  const [failure, setFailure] = useState<ConversationAdapterFailure | null>(null);
  const runtime = useExternalStoreRuntime(createConversationAdapter(service, sessionId, setFailure));
  const session = snapshot.data.sessions.find((item) => item.id === sessionId && !item.deletedAt);
  const draftText = session?.draft.text ?? '';
  useEffect(() => {
    const composer = runtime.thread.composer;
    if (composer.getState().text !== draftText) composer.setText(draftText, { origin: 'external' });
  }, [runtime, draftText]);
  useEffect(() => runtime.thread.composer.unstable_on('textChange', ({ text, origin }) => {
    // Sending clears the SDK composer before acceptance. Keep our draft until the
    // service accepts the message; MessageNotSentError restores a rejected send.
    if (origin === 'send' || origin === 'external') return;
    const current = service.getSnapshot().data.sessions.find((item) => item.id === sessionId && !item.deletedAt);
    if (!current || current.draft.text === text) return;
    void service.setDraft(sessionId, { ...current.draft, text }).then((result) => {
      if (!result.ok) setFailure({ error: result.error, operation: 'draft' });
    });
  }), [runtime, service, sessionId]);
  return { runtime, session, snapshot, failure, clearFailure: () => setFailure(null) };
}
