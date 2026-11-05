import { useEffect, useMemo, useState } from 'react';
import { Toaster } from '@/ui/components';
import { useModelSettings } from '@/runtime/use-model-settings';
import { markOnboarding, useWelcome } from '@/runtime/onboarding';
import { GuideTour } from '@/ui/onboarding/GuideTour';
import { WelcomeDialog } from '@/ui/onboarding/WelcomeDialog';
import { setupGuide } from '@/ui/settings/setup-guide';
import { SettingsView } from '@/ui/settings/SettingsView';
import { sectionFromHash, type Preferences, type PreferencesState, type SettingsSection } from '@/ui/settings/types';

const fromHash = (): SettingsSection => sectionFromHash(window.location.hash);

interface SettingsPageProps {
  /** This device's preferences, from the real preference store (the same one the reader reads). */
  preferences: {
    state: PreferencesState;
    setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  };
}

/** 设置页：偏好接正式存储；模型配置接本机版本化存储。地址中的 #models 等直达对应一节。 */
export function SettingsPage({ preferences }: SettingsPageProps) {
  const [section, setSection] = useState<SettingsSection>(fromHash);
  const settings = useModelSettings();
  const welcome = useWelcome();
  // ?guide=1 (from the popup or another page's welcome) starts the guide on arrival.
  const [guide, setGuide] = useState(() => new URLSearchParams(location.search).has('guide'));
  const [addProvider, setAddProvider] = useState(0);
  const go = (next: SettingsSection) => {
    setSection(next);
    window.history.replaceState(null, '', `${location.pathname}#${next}`);
  };
  const steps = useMemo(() => setupGuide(go), []);

  useEffect(() => {
    const onHash = () => setSection(fromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <>
      <SettingsView
        section={section}
        onSection={go}
        preferences={preferences.state}
        onPreference={preferences.setPreference}
        settings={settings.settings}
        onSave={settings.save}
        status={settings.status}
        onGuide={() => setGuide(true)}
        addProviderRequest={addProvider}
        onAddProviderHandled={() => setAddProvider(0)}
      />
      <WelcomeDialog
        open={welcome.welcome}
        onClose={welcome.close}
        onStart={() => {
          welcome.close();
          setGuide(true);
        }}
      />
      {guide && (
        <GuideTour
          steps={steps}
          onClose={() => {
            setGuide(false);
            void markOnboarding({ guided: true }).catch(() => {});
          }}
          finalAction={
            settings.settings.models.length === 0
              ? {
                  label: '去添加模型服务',
                  onAction: () => {
                    go('models');
                    setAddProvider((n) => n + 1);
                  },
                }
              : undefined
          }
        />
      )}
      <Toaster />
    </>
  );
}
