import { mountPage } from '@/runtime/mount-page';
import { useLocalPreferences } from '@/runtime/use-local-preferences';
import { SettingsPage } from '@/ui/pages/SettingsPage';

// Preferences go to the same store the real reader reads, so changes here reach open papers.
function Settings() {
  return <SettingsPage preferences={useLocalPreferences()} />;
}

mountPage(<Settings />);
