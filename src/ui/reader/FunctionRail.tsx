import { Icon, Tooltip } from '@/ui/components';
import type { DockPlacement, ResearchPanelId } from './types';
import { researchPanels } from './research-panels';
export { researchPanels } from './research-panels';

interface FunctionRailProps {
  placement: DockPlacement;
  active: ResearchPanelId;
  panelOpen: boolean;
  /** Clicking the open panel's button collapses it; any other opens that panel. */
  onSelect: (id: ResearchPanelId) => void;
}

/**
 * The research card's own edge: a column on the right when docked right,
 * a row along the bottom when docked at the bottom (with text labels).
 */
export function FunctionRail({ placement, active, panelOpen, onSelect }: FunctionRailProps) {
  return (
    <nav className="pp-rail" aria-label="研究区功能">
      {researchPanels.map((panel) => {
        const isOpen = panelOpen && panel.id === active;
        const label = isOpen ? `收起${panel.label}` : panel.label;
        return (
          // Docked at the bottom the buttons carry their own labels, so no tooltip.
          <Tooltip key={panel.id} label={label} placement="left" labelsChild disabled={placement === 'bottom'}>
            <button
              type="button"
              className="pp-rail__item"
              aria-label={label}
              aria-pressed={isOpen}
              aria-controls="pp-research-body"
              onClick={() => onSelect(panel.id)}
            >
              <Icon name={panel.icon} size={18} />
              <span className="pp-rail__label" aria-hidden="true">
                {panel.label}
              </span>
            </button>
          </Tooltip>
        );
      })}
    </nav>
  );
}
