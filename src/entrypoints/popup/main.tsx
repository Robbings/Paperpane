import { mountPage } from '@/runtime/mount-page';
import { PopupPage } from '@/ui/pages/PopupPage';

// The popup follows the reader's real appearance preferences (theme, text size).
function Popup() {
  return <PopupPage />;
}

mountPage(<Popup />);
