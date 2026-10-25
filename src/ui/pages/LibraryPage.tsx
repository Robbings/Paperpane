import { SampleLibrary } from '@/ui/library/sample/SampleLibrary';
import { applyTheme } from '@/ui/theme';

// ?theme=light|dark forces a theme for review; the saved preference comes from the logic layer.
const forcedTheme = new URLSearchParams(window.location.search).get('theme');
if (forcedTheme === 'light' || forcedTheme === 'dark') applyTheme(forcedTheme);

export function LibraryPage() {
  return <SampleLibrary />;
}
