import type { IconName } from '@/ui/components/Icon';
import type { ResearchPanelId } from './types';

export const researchPanels: readonly { id: ResearchPanelId; label: string; icon: IconName }[] = [
  { id: 'overview', label: '概览', icon: 'overview' },
  { id: 'discuss', label: '讨论', icon: 'discuss' },
  { id: 'annotations', label: '批注', icon: 'marker' },
  { id: 'notes', label: '笔记', icon: 'notes' },
  { id: 'cite', label: '引用', icon: 'cite' },
];
