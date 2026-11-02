import { TranslationNoticeHost } from './translation-notices';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/ui/styles/global.css';

export function mountPage(page: ReactNode): void {
  const container = document.getElementById('root');
  if (!container) throw new Error('Paperpane page is missing its root element.');

  createRoot(container).render(<StrictMode>{page}<TranslationNoticeHost/></StrictMode>);
}
