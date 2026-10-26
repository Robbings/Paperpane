import { useEffect, useState } from 'react';
import { Toaster } from '@/ui/components';
import { useSampleSettings } from '@/ui/settings/sample/useSampleSettings';
import { SettingsView } from '@/ui/settings/SettingsView';
import type { Preferences, PreferencesState, SettingsSection } from '@/ui/settings/types';

const sectionIds: readonly SettingsSection[] = ['general', 'models', 'features', 'sync', 'advanced', 'privacy'];
const fromHash = (): SettingsSection => {
  const hash = window.location.hash.slice(1) as SettingsSection;
  return sectionIds.includes(hash) ? hash : 'general';
};

interface SettingsPageProps {
  /** This device's preferences, from the real preference store (the same one the reader reads). */
  preferences: {
    state: PreferencesState;
    setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  };
}

/** 设置页：偏好接正式存储；模型等配置仍是示例，直到设置服务接入。地址中的 #models 等直达对应一节。 */
export function SettingsPage({ preferences }: SettingsPageProps) {
  const [section, setSection] = useState<SettingsSection>(fromHash);
  const settings = useSampleSettings();

  useEffect(() => {
    const onHash = () => setSection(fromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <>
      <SettingsView
        section={section}
        onSection={(next) => {
          setSection(next);
          window.history.replaceState(null, '', `#${next}`);
        }}
        preferences={preferences.state}
        onPreference={preferences.setPreference}
        settings={settings.settings}
        onSave={settings.save}
        status={settings.status}
      />
      <Toaster />
    </>
  );
}
