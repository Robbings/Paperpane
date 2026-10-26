import { useEffect, useState } from 'react';
import { Toaster } from '@/ui/components';
import { useSamplePreferences, useSampleSettings } from '@/ui/settings/sample/useSampleSettings';
import { SettingsView } from '@/ui/settings/SettingsView';
import type { SettingsSection } from '@/ui/settings/types';

const sectionIds: readonly SettingsSection[] = ['general', 'models', 'features', 'sync', 'advanced', 'privacy'];
const fromHash = (): SettingsSection => {
  const hash = window.location.hash.slice(1) as SettingsSection;
  return sectionIds.includes(hash) ? hash : 'general';
};

/** 示例接线：设置页用示例偏好和配置，直到设置服务接入。地址中的 #models 等直达对应一节。 */
export function SettingsPage() {
  const [section, setSection] = useState<SettingsSection>(fromHash);
  const preferences = useSamplePreferences();
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
