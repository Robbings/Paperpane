import { SamplePopup } from '@/ui/popup/sample/SamplePopup';
import { LivePopupPage } from '@/runtime/popup-page';

export function PopupPage() {
  return new URLSearchParams(location.search).has('state') ? <SamplePopup /> : <LivePopupPage />;
}
