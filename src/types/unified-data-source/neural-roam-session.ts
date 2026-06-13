import type { BackendNeuralRoamViewState } from '../../../packages/contracts/src/backend-rpc';
import type { FSRSCard } from '@/types/card';
import type { IReviewQueue } from './queue-core';

export type NeuralNavigationMode = 'explore' | 'follow';
export type NeuralEngineMode = 'orbit' | 'hyperspace';
export type NeuralTraceQuality = 'exact' | 'legacy';
export type NeuralSourceRole = 'orbit-center' | 'activation-source';
export type NeuralSourceNodeKind = 'concept' | 'element' | 'virtual';
export type NeuralPropagationOrigin =
  | 'source'
  | 'backlink'
  | 'direct-ref'
  | 'indirect-ref'
  | 'descriptor'
  | 'block-tree'
  | 'document-tree'
  | 'follow-path'
  | 'manual-jump';
export type NeuralAssociationType =
  | 'backlink'
  | 'outgoing-direct'
  | 'outgoing-indirect'
  | 'descriptor'
  | 'associated-review'
  | 'same-block-card'
  | 'focus'
  | 'path'
  | 'source'
  | 'concept-link'
  | 'element-link'
  | 'tree-child'
  | 'tree-sibling'
  | 'tree-parent'
  | 'follow-path'
  | 'manual-jump';
export type NeuralActivationKind =
  | 'focus-root'
  | 'source-root'
  | 'graph-edge'
  | 'tree-edge'
  | 'follow-path'
  | 'manual-jump';

export interface NeuralNavigationState {
  currentPathIndex: number;
  currentNodeId: string | null;
  currentEventId: string | null;
  navigationMode: NeuralNavigationMode;
  engineMode: NeuralEngineMode;
  engineSessionId: string | null;
  hasBookmark: boolean;
  pathLength: number;
  sessionId: string | null;
}

export interface NeuralRoamHistoryEntry {
  eventId: string;
  nodeId: string;
  cardId?: string | null;
  focusId: string | null;
  sessionId: string;
  associationType: NeuralAssociationType;
  reason: string;
  visitedAt: number;
  isVirtual: boolean;
  nodePreview: string;
  traceQuality: NeuralTraceQuality;
  engineMode: NeuralEngineMode;
  sourceRole: NeuralSourceRole | null;
  origin?: NeuralPropagationOrigin | null;
  sourceNodeId: string | null;
  sourceEventId: string | null;
  branchRootNodeId: string | null;
  activationKind: NeuralActivationKind;
  depth: number | null;
  conductionScore: number | null;
}

export interface NeuralHistoryPageRequest {
  offset: number;
  limit: number;
  sessionId?: string | null;
}

export interface NeuralHistoryPageResult {
  entries: NeuralRoamHistoryEntry[];
  totalCount: number;
  hasMore: boolean;
}

export interface NeuralActivationTraceStep {
  eventId: string;
  nodeId: string;
  cardId?: string | null;
  nodePreview: string;
  isVirtual: boolean;
  associationType: NeuralAssociationType;
  reason: string;
  activationKind: NeuralActivationKind;
  visitedAt: number;
  focusId: string | null;
  engineMode: NeuralEngineMode;
  sourceRole: NeuralSourceRole | null;
  origin?: NeuralPropagationOrigin | null;
  sourceNodeId: string | null;
  sourceEventId: string | null;
  branchRootNodeId: string | null;
  traceQuality: NeuralTraceQuality;
  depth: number | null;
  conductionScore: number | null;
  isSyntheticRoot: boolean;
}

export interface NeuralActivationTrace {
  targetEventId: string;
  targetNodeId: string;
  branchRootNodeId: string | null;
  isExact: boolean;
  degradedReason: string | null;
  steps: NeuralActivationTraceStep[];
}

export type NeuralFocusNodeKind = 'concept' | 'virtual';

export interface NeuralRoamFocusEntry {
  nodeId: string;
  nodePreview: string;
  isVirtual: boolean;
  nodeKind: NeuralFocusNodeKind;
  priority: number;
  addedAt: number;
  visitedAt: number;
}

export interface NeuralRoamSeedEntry {
  nodeId: string;
  nodePreview: string;
  priority: number;
  addedAt: number;
  visitedAt: number;
}

export interface NeuralRoamAnchorEntry {
  nodeId: string;
  nodePreview: string;
  isVirtual: boolean;
  nodeKind: NeuralFocusNodeKind;
  priority: number;
  addedAt: number;
  visitedAt: number;
}

export interface NeuralRoamSourceEntry {
  nodeId: string;
  nodePreview: string;
  nodeKind: NeuralSourceNodeKind;
  role: NeuralSourceRole;
  priority: number;
  addedAt: number;
  visitedAt: number;
}

export type NeuralRoamBatchKind = 'orbit-round' | 'hyperspace-current-node';

export interface NeuralRoamBatchNode {
  eventId: string;
  nodeId: string;
  cardId?: string | null;
  nodePreview: string;
  isVirtual: boolean;
  associationType: NeuralAssociationType;
  reason: string;
  visitedAt: number;
  sourceNodeId: string | null;
  sourceEventId: string | null;
}

export interface NeuralRoamBatchSnapshot {
  kind: NeuralRoamBatchKind;
  engineMode: NeuralEngineMode;
  navigationState: NeuralNavigationState;
  focusNodeId: string | null;
  focusNodePreview: string | null;
  currentNodeId: string | null;
  roundSize: number;
  viewedCount: number;
  remainingCount: number;
  roundNodes: NeuralRoamBatchNode[];
  recentPath: NeuralRoamHistoryEntry[];
  sourceSnapshot: NeuralRoamSourceEntry[];
  seedSnapshot: NeuralRoamSeedEntry[];
  anchorSnapshot: NeuralRoamAnchorEntry[];
}

export interface HyperspaceExcerptInjectionContext {
  currentNodeId?: string | null;
  currentEventId?: string | null;
}

export interface NeuralRoamSessionQueue {
  listRoutes?(): Promise<import('@/core/queue/neural/routes').NeuralRoamRouteListItem[]>;
  switchRoute?(routeId: string): Promise<import('@/core/queue/neural/routes').NeuralRoamRouteSnapshot>;
  createRoute?(input?: { name?: string }): Promise<import('@/core/queue/neural/routes').NeuralRoamRouteSnapshot>;
  renameRoute?(routeId: string, name: string): Promise<import('@/core/queue/neural/routes').NeuralRoamRouteSnapshot>;
  deleteRoute?(routeId: string): Promise<void>;
  resolveTemporaryRouteCloseAction?(): Promise<
    | { kind: 'none' }
    | { kind: 'discard-clean'; routeId: string; previousRouteId: string | null }
    | { kind: 'prompt'; routeId: string; previousRouteId: string | null }
  >;
  closeTemporaryRoute?(input: {
    action: 'save' | 'discard' | 'cancel';
    routeId?: string | null;
    name?: string | null;
  }): Promise<import('@/core/queue/neural/routes').NeuralRoamRouteSnapshot | null>;
  replaceActiveTemporaryRoute?(input: { name?: string; seedBlockId: string }): Promise<import('@/core/queue/neural/routes').NeuralRoamRouteSnapshot>;
  createTemporaryRoute?(input: { name?: string; seedBlockId: string; previousRouteId?: string | null }): Promise<import('@/core/queue/neural/routes').NeuralRoamRouteSnapshot>;
  saveTemporaryRoute?(routeId?: string | null, name?: string | null): Promise<import('@/core/queue/neural/routes').NeuralRoamRouteSnapshot>;
  discardTemporaryRoute?(routeId?: string | null): Promise<void>;
  getEngineMode(): NeuralEngineMode;
  setEngineMode(mode: NeuralEngineMode, options?: { carryCurrentNode?: boolean }): Promise<void>;
  getSourceSnapshot(): NeuralRoamSourceEntry[];
  setSourceEntry(nodeId: string, enabled?: boolean): Promise<void>;
  injectExcerptIntoHyperspace?(excerptNodeId: string, context?: HyperspaceExcerptInjectionContext): Promise<boolean>;
  getSeedSnapshot(): NeuralRoamSeedEntry[];
  setSeedEntry(nodeId: string, enabled?: boolean): Promise<void>;
  getAnchorSnapshot(): NeuralRoamAnchorEntry[];
  setAnchorEntry(nodeId: string, enabled?: boolean): Promise<void>;
  clearAnchors(): Promise<void>;
  getCurrentBatchSnapshot(): NeuralRoamBatchSnapshot | null;
  getConceptBlocks(): string[];
  getFocusPoolSnapshot(): NeuralRoamFocusEntry[];
  setFocusPoolEntry(nodeId: string, enabled?: boolean): Promise<void>;
  clearFocusPool(): Promise<void>;
  setCurrentFocus(focusId: string, options?: { includeFocusAsFirst?: boolean; resetHistory?: boolean; bookmarkCurrentPath?: boolean }): Promise<void>;
  startRoamingFromFocus(focusId: string, options?: { includeFocusAsFirst?: boolean; resetHistory?: boolean; startNewSession?: boolean }): Promise<void>;
  getHistoryCount(sessionId?: string | null): number;
  getHistoryPage(request: NeuralHistoryPageRequest): NeuralHistoryPageResult;
  getRouteHistoryPage?(request: NeuralHistoryPageRequest): NeuralHistoryPageResult | Promise<NeuralHistoryPageResult>;
  getHistorySnapshot(): NeuralRoamHistoryEntry[];
  getHistoryEntryByEventId(eventId: string): NeuralRoamHistoryEntry | null;
  getHistoryEntriesByNodeId(nodeId: string): NeuralRoamHistoryEntry[];
  getHistoryHitCount(nodeId: string): number;
  getActivationTrace(eventId: string): NeuralActivationTrace | null;
  getSessionFocusStack(): NeuralRoamHistoryEntry[];
  getPinnedFocusBlocks(): NeuralRoamHistoryEntry[];
  setPinnedFocusBlock(blockId: string, pinned?: boolean): Promise<void>;
  jumpToHistoryNode(nodeId: string): Promise<boolean>;
  getPathItemByNodeId(blockId: string): Promise<FSRSCard | null>;
  getNavigationState(): NeuralNavigationState;
  setNavigationMode(mode: NeuralNavigationMode): void;
  returnToBookmark(): boolean;
  clearHistory(scope?: 'current' | 'all'): Promise<void>;
  clearRouteHistory?(): Promise<void>;
  setBackendViewState?(viewState: BackendNeuralRoamViewState | null): void;
  getBackendViewState?(): BackendNeuralRoamViewState | null;
}

export function isNeuralRoamSessionQueue(
  queue: unknown,
): queue is IReviewQueue & NeuralRoamSessionQueue {
  const candidate = queue as Partial<NeuralRoamSessionQueue>;
  return typeof candidate?.getEngineMode === 'function'
    && typeof candidate?.setEngineMode === 'function'
    && typeof candidate?.getSourceSnapshot === 'function'
    && typeof candidate?.setSourceEntry === 'function'
    && typeof candidate?.getSeedSnapshot === 'function'
    && typeof candidate?.setSeedEntry === 'function'
    && typeof candidate?.getAnchorSnapshot === 'function'
    && typeof candidate?.setAnchorEntry === 'function'
    && typeof candidate?.clearAnchors === 'function'
    && typeof candidate?.getCurrentBatchSnapshot === 'function'
    && typeof candidate?.getConceptBlocks === 'function'
    && typeof candidate?.getFocusPoolSnapshot === 'function'
    && typeof candidate?.setFocusPoolEntry === 'function'
    && typeof candidate?.clearFocusPool === 'function'
    && typeof candidate?.setCurrentFocus === 'function'
    && typeof candidate?.startRoamingFromFocus === 'function'
    && typeof candidate?.getHistoryCount === 'function'
    && typeof candidate?.getHistoryPage === 'function'
    && typeof candidate?.getHistorySnapshot === 'function'
    && typeof candidate?.getHistoryEntryByEventId === 'function'
    && typeof candidate?.getHistoryEntriesByNodeId === 'function'
    && typeof candidate?.getHistoryHitCount === 'function'
    && typeof candidate?.getActivationTrace === 'function'
    && typeof candidate?.getSessionFocusStack === 'function'
    && typeof candidate?.getPinnedFocusBlocks === 'function'
    && typeof candidate?.setPinnedFocusBlock === 'function'
    && typeof candidate?.jumpToHistoryNode === 'function'
    && typeof candidate?.getPathItemByNodeId === 'function'
    && typeof candidate?.getNavigationState === 'function'
    && typeof candidate?.setNavigationMode === 'function'
    && typeof candidate?.returnToBookmark === 'function'
    && typeof candidate?.clearHistory === 'function';
}
