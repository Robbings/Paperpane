import { TranslationNoticeHost } from './translation-notices';
import { WelcomeHost } from './welcome-host';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/ui/styles/global.css';

/** welcome: greet on the first extension page opened after installing (the reader and the library). */
export function mountPage(page: ReactNode, options: { welcome?: boolean } = {}): void {
  const container = document.getElementById('root');
  if (!container) throw new Error('Paperpane page is missing its root element.');

  createRoot(container).render(<StrictMode>{page}<TranslationNoticeHost/>{options.welcome && <WelcomeHost />}</StrictMode>);
}
