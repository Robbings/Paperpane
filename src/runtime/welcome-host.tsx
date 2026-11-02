import { browser } from 'wxt/browser';
import { WelcomeDialog } from '@/ui/onboarding/WelcomeDialog';
import { GUIDE_URL, useWelcome } from './onboarding';

/** The first-run welcome on the reader and the library; the guide itself runs on the settings page. */
export function WelcomeHost() {
  const { welcome, close } = useWelcome();
  return (
    <WelcomeDialog
      open={welcome}
      onClose={close}
      onStart={() => {
        close();
        void browser.tabs.create({ url: new URL(GUIDE_URL, browser.runtime.getURL('/')).href });
      }}
    />
  );
}
