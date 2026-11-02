import type { ReactNode } from 'react';
import type { SettingsDraft } from './types';

/**
 * A model provider or translation service page. Its changes (connection,
 * key, models) wait in a draft of their own until saved; the rest of the
 * settings save as they change.
 */
export interface ServicePage {
  /** The settings as this page shows them: its unsaved draft, or what is saved. */
  value: SettingsDraft;
  dirty: boolean;
  edit: (next: SettingsDraft) => void;
  /** Runs `then` once the page may close; asks first when it has unsaved changes. */
  leave: (then: () => void) => void;
  /** Drops the page draft without asking, e.g. after the service was removed. */
  discard: () => void;
  /** Save and discard controls for the page header. */
  bar: ReactNode;
}
