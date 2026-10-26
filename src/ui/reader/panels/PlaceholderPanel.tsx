import { Icon, type IconName } from '@/ui/components';
import { PanelBody } from './PanelBody';
import { PanelHeader } from './PanelHeader';

interface PlaceholderPanelProps {
  title: string;
  icon: IconName;
  description: string;
}

export function PlaceholderPanel({ title, icon, description }: PlaceholderPanelProps) {
  return (
    <div className="pp-panel">
      <PanelHeader title={title} />
      <PanelBody>
        <div className="pp-panel__placeholder">
          <Icon name={icon} size={28} strokeWidth={1.4} />
          <p>{description}</p>
        </div>
      </PanelBody>
    </div>
  );
}
