import { mountPage } from '@/runtime/mount-page';
import { useLocalPreferences } from '@/runtime/use-local-preferences';
import { PopupPage } from '@/ui/pages/PopupPage';

// The popup follows the reader's real appearance preferences (theme, text size).
function Popup() {
  useLocalPreferences();
  return <PopupPage />;
}

mountPage(<Popup />);
