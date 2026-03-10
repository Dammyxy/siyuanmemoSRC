import type {
  NeuralActivationTrace,
  NeuralActivationTraceStep,
  NeuralEngineMode,
  NeuralFocusNodeKind,
  NeuralRoamHistoryEntry,
  NeuralRoamSourceEntry,
} from '@/types/unified-data-source';

export type NeuralSubview = 'concept-cards' | 'roam-history' | 'worldline-anchors';

export interface NeuralSubviewTab {
  id: NeuralSubview;
  label: string;
}

export interface NeuralListEntry extends NeuralRoamHistoryEntry {
  isCurrent?: boolean;
  isSelected?: boolean;
  inPool?: boolean;
  nodeKind?: NeuralFocusNodeKind;
  priority?: number;
  addedAt?: number;
  isAnchored?: boolean;
}

export interface NeuralHistoryEventRef {
  eventId: string;
  nodeId: string;
}

export interface NeuralSourceListEntry extends NeuralRoamSourceEntry {
  isCurrent?: boolean;
}

export interface NeuralActivationTraceStepViewModel extends NeuralActivationTraceStep {
  relationLabel: string;
  activationLabel: string;
  displayBadges: Array<{
    key: string;
    label: string;
    tone?: 'default' | 'soft' | 'root' | 'current';
  }>;
  previewable?: boolean;
  jumpable?: boolean;
  isCurrent?: boolean;
  isTarget?: boolean;
  isRoot?: boolean;
  isSelected?: boolean;
}

export interface NeuralActivationTraceViewModel extends NeuralActivationTrace {
  engineMode: NeuralEngineMode;
  targetTitle: string;
  directActivatorTitle: string | null;
  directRelationLabel: string;
  directRelationBadges?: NeuralActivationTraceStepViewModel['displayBadges'];
  branchRootTitle: string | null;
  steps: NeuralActivationTraceStepViewModel[];
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
