import { Icon, type IconName } from '@/ui/components';
import type { ResearchPanelId } from './types';

export const researchPanels: readonly { id: ResearchPanelId; label: string; icon: IconName }[] = [
  { id: 'overview', label: '概览', icon: 'overview' },
  { id: 'discuss', label: '讨论', icon: 'discuss' },
  { id: 'explain', label: '解释', icon: 'explain' },
  { id: 'annotations', label: '批注', icon: 'marker' },
  { id: 'notes', label: '笔记', icon: 'notes' },
  { id: 'cite', label: '引用', icon: 'cite' },
];

interface FunctionRailProps {
  active: ResearchPanelId;
  panelOpen: boolean;
  /** Clicking the open panel's button collapses it; any other opens that panel. */
  onSelect: (id: ResearchPanelId) => void;
}

/**
 * The research card's own edge: a column on the right when docked right,
 * a row along the bottom when docked at the bottom (with text labels).
 */
export function FunctionRail({ active, panelOpen, onSelect }: FunctionRailProps) {
  return (
    <nav className="pp-rail" aria-label="研究区功能">
      {researchPanels.map((panel) => {
        const isOpen = panelOpen && panel.id === active;
        const label = isOpen ? `收起${panel.label}` : panel.label;
        return (
          <button
            key={panel.id}
            type="button"
            className="pp-rail__item"
            aria-label={label}
            title={label}
            aria-pressed={isOpen}
            aria-controls="pp-research-body"
            onClick={() => onSelect(panel.id)}
          >
            <Icon name={panel.icon} size={18} />
            <span className="pp-rail__label" aria-hidden="true">
              {panel.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
