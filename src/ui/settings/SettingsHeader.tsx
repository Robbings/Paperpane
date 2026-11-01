import type { ReactNode } from 'react';
import { GlassSurface } from '@/ui/components';

interface SettingsHeaderProps {
  title: string;
  /** Before the title, e.g. a back button and a logo. */
  leading?: ReactNode;
  /** Page actions on the right, before the save controls. */
  actions?: ReactNode;
  /** The inline save bar on pages with a draft; pages that apply at once leave it out. */
  saveBar?: ReactNode;
}

/** The top of every settings page: a sticky glass bar with the title, and saving always in the same place. */
export function SettingsHeader({ title, leading, actions, saveBar }: SettingsHeaderProps) {
  return (
    <GlassSurface as="header" tone="bar" radius="float" className="pp-settings-bar">
      <div className="pp-settings-bar__title">
        {leading}
        <h1>{title}</h1>
      </div>
      {(actions || saveBar) && (
        <div className="pp-settings-bar__actions">
          {actions}
          {saveBar}
        </div>
      )}
    </GlassSurface>
  );
}
