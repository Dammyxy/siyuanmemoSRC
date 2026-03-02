import type { NeuralFocusNodeKind, NeuralRoamHistoryEntry } from '@/types/unified-data-source';

export type NeuralSubview = 'concept-cards' | 'roam-history' | 'worldline-anchors';

export interface NeuralSubviewTab {
  id: NeuralSubview;
  label: string;
}

export interface NeuralListEntry extends NeuralRoamHistoryEntry {
  isCurrent?: boolean;
  inPool?: boolean;
  nodeKind?: NeuralFocusNodeKind;
  priority?: number;
  addedAt?: number;
  isAnchored?: boolean;
}

export interface NeuralAnchorListEntry {
  nodeId: string;
  nodePreview: string;
  isVirtual: boolean;
  nodeKind: NeuralFocusNodeKind;
  priority: number;
  addedAt: number;
  visitedAt: number;
  isCurrent?: boolean;
  inHistory?: boolean;
}
