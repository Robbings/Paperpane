import { useEffect, useState } from 'react';

/** For controls whose pointer geometry must convert CSS pixels to design units. */
export function useUiScale() {
  const read = () => (Number.parseFloat(document.documentElement.style.fontSize) || 16) / 16;
  const [scale, setScale] = useState(read);
  useEffect(() => {
    const update = () => setScale(read());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    update();
    return () => observer.disconnect();
  }, []);
  return scale;
}
