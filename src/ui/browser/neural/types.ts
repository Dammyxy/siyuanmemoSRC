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
  repeatHitCount?: number;
}

export interface NeuralHistoryEventRef {
  eventId: string;
  nodeId: string;
}

export interface NeuralSourceListEntry extends NeuralRoamSourceEntry {
  isCurrent?: boolean;
}

export interface NeuralTraceBadge {
  key: string;
  label: string;
  tone?: 'default' | 'soft' | 'root' | 'current';
}

export interface NeuralTraceRouteVariantViewModel {
  representativeEventId: string;
  latestVisitedAt: number;
  hitCount: number;
  isPrimary: boolean;
  traceQuality: 'exact' | 'legacy';
  branchRootTitle: string | null;
  directActivatorTitle: string | null;
  directRelationLabel: string;
  directRelationBadges: NeuralTraceBadge[];
  inferred: boolean;
}

export interface NeuralTraceConvergenceViewModel {
  kind: 'repeat-hit' | 'multi-route';
  totalEventCount: number;
  distinctRouteCount: number;
  alternateRouteCount: number;
  variants: NeuralTraceRouteVariantViewModel[];
}

export interface NeuralActivationTraceStepViewModel extends NeuralActivationTraceStep {
  relationLabel: string;
  activationLabel: string;
  displayBadges: NeuralTraceBadge[];
  previewable?: boolean;
  jumpable?: boolean;
  isCurrent?: boolean;
  isTarget?: boolean;
  isRoot?: boolean;
  isSelected?: boolean;
  repeatHitCount?: number;
  convergenceStatus?: 'idle' | 'loading' | 'ready';
  convergence?: NeuralTraceConvergenceViewModel | null;
}

export interface NeuralActivationTraceViewModel extends NeuralActivationTrace {
  engineMode: NeuralEngineMode;
  targetTitle: string;
  directActivatorTitle: string | null;
  directActivatorEventId: string | null;
  directRelationLabel: string;
  directRelationBadges?: NeuralActivationTraceStepViewModel['displayBadges'];
  branchRootTitle: string | null;
  branchRootEventId: string | null;
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
