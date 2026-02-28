import type { NeuralRoamHistoryEntry } from '@/types/unified-data-source';

export type NeuralSubview = 'concept-cards' | 'focus-blocks' | 'roam-history';

export type HistoryScope = 'current' | 'all';

export interface NeuralSubviewTab {
  id: NeuralSubview;
  label: string;
}

export interface NeuralListEntry extends NeuralRoamHistoryEntry {
  isCurrent?: boolean;
  pinned?: boolean;
}

