/**
 * Concept neural roam queue (seed + anchor model).
 *
 * Responsibilities:
 * - Seed pool management (persistent, concept-only, for auto roaming)
 * - Anchor pool management (persistent, any node, for branch restarts)
 * - Session focus stack and roam history
 * - Navigation state (explore/follow + bookmark return)
 * - Session boundary tracking with sessionId
 */

import { ConceptQueryEngine, type Neighbor, type BlockData } from './ConceptQueryEngine';
import type {
  NeuralActivationKind,
  NeuralActivationTrace,
  NeuralActivationTraceStep,
  NeuralFocusNodeKind,
  NeuralPropagationOrigin,
  NeuralRoamAnchorEntry,
  NeuralRoamSeedEntry,
  NeuralNavigationMode,
  NeuralNavigationState,
  NeuralRoamFocusEntry,
  NeuralRoamHistoryEntry,
} from '@/types/unified-data-source';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ConceptNeuralQueue');

export interface QueueItem {
  id: string;
  blockId: string;
  deckId: string;
  blockData: BlockData;
  associationType: string;
  reason: string;
}

interface FocusState {
  blockId: string;
  nodeKind: NeuralFocusNodeKind;
  priority: number;
  neighborsViewed: number;
  addedAt: number;
  preview: string;
}

export interface FocusPoolPersistedEntry {
  nodeId: string;
  nodeKind: NeuralFocusNodeKind;
  priority: number;
  neighborsViewed: number;
  addedAt: number;
  nodePreview: string;
}

export interface ConceptNeuralSessionState {
  displayPath: string[];
  displayPathEventIds?: string[];
  currentPathIndex: number;
  navigationMode: NeuralNavigationMode;
  bookmarkPathIndex: number | null;
  history: NeuralRoamHistoryEntry[];
  currentFocus: string | null;
  currentFocusEventId?: string | null;
  branchRootNodeId?: string | null;
  currentSessionId: string | null;
  visitedBlocks: string[];
  exhaustedFocuses: string[];
  seedPool?: FocusPoolPersistedEntry[];
  anchorPool?: FocusPoolPersistedEntry[];
  focusPool?: FocusPoolPersistedEntry[];
  // Backward compatibility for old session payloads.
  pinnedFocusBlocks?: string[];
}

interface ActivateNodeMeta {
  associationType: string;
  reason: string;
  focusId: string | null;
  isVirtual: boolean;
  activationKind?: NeuralActivationKind;
  origin?: NeuralPropagationOrigin | null;
  sourceNodeId?: string | null;
  sourceEventId?: string | null;
  branchRootNodeId?: string | null;
}

interface PathItemOptions {
  focusPath?: boolean;
}

interface TraversalStateSnapshot {
  currentFocus: string | null;
  currentFocusEventId: string | null;
  branchRootNodeId: string | null;
  currentSessionId: string | null;
  visitedBlocks: Set<string>;
  exhaustedFocuses: Set<string>;
  displayPath: string[];
  displayPathEventIds: string[];
  seedPool: Map<string, FocusState>;
  anchorPool: Map<string, FocusState>;
  history: NeuralRoamHistoryEntry[];
  navigationMode: NeuralNavigationMode;
  currentPathIndex: number;
  bookmarkPathIndex: number | null;
  followCurrentNodeOnce: boolean;
}

interface TraversalResolution {
  item: QueueItem | null;
  nextState: TraversalStateSnapshot;
}

interface PreloadedNextState {
  baseVersion: number;
  item: QueueItem;
  nextState: TraversalStateSnapshot;
}

export type ConceptCardValidator = (blockId: string) => Promise<boolean>;

export interface ConceptNeuralQueueOptions {
  isConceptCard?: ConceptCardValidator;
}

export type SeedValidationErrorPolicy = 'remove' | 'keep';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createHistoryEventId(): string {
  return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function resolveOrbitOrigin(value: unknown): NeuralPropagationOrigin | null {
  switch (value) {
    case 'backlink':
      return 'backlink';
    case 'outgoing-direct':
      return 'direct-ref';
    case 'outgoing-indirect':
      return 'indirect-ref';
    case 'descriptor':
      return 'descriptor';
    case 'focus':
      return 'source';
    case 'follow-path':
      return 'follow-path';
    case 'manual-jump':
    case 'path':
      return 'manual-jump';
    default:
      return null;
  }
}

function normalizeNodeKind(value: unknown): NeuralFocusNodeKind {
  return value === 'virtual' ? 'virtual' : 'concept';
}

function normalizePriority(value: unknown, fallback = 0.6): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return clamp(parsed, 0.1, 1);
}

export class ConceptNeuralQueue {
  private currentFocus: string | null = null;
  private currentFocusEventId: string | null = null;
  private branchRootNodeId: string | null = null;
  private currentSessionId: string | null = null;
  private visitedBlocks: Set<string> = new Set();
  private exhaustedFocuses: Set<string> = new Set();
  private displayPath: string[] = [];
  private displayPathEventIds: string[] = [];
  private seedPool: Map<string, FocusState> = new Map();
  private anchorPool: Map<string, FocusState> = new Map();
  private history: NeuralRoamHistoryEntry[] = [];
  private navigationMode: NeuralNavigationMode = 'explore';
  private currentPathIndex = -1;
  private bookmarkPathIndex: number | null = null;
  private followCurrentNodeOnce = false;
  private preloadedNext: PreloadedNextState | null = null;
  private stateVersion = 0;
  private isPreloading = false;

  private neighborsPerRound = 5;
  private prefetchNeighborCount = 2;
  private prefetchingBlockIds = new Set<string>();
  private historyLimit = 300;
  private previewLength = 28;

  private queryEngine: ConceptQueryEngine;
  private readonly conceptCardValidator: ConceptCardValidator;

  constructor(options: ConceptNeuralQueueOptions = {}) {
    this.queryEngine = new ConceptQueryEngine();
    this.conceptCardValidator = options.isConceptCard ?? (async (blockId: string) => this.queryEngine.isConceptCard(blockId));
  }

  async getNextCard(): Promise<QueueItem | null> {
    try {
      const preloaded = this.preloadedNext;
      if (preloaded && preloaded.baseVersion === this.stateVersion) {
        this.preloadedNext = null;
        this.applyTraversalState(preloaded.nextState);
        this.stateVersion += 1;
        this.schedulePreload();
        return preloaded.item;
      }

      const resolved = await this.resolveNextCardFromState(this.cloneTraversalState());
      this.preloadedNext = null;
      this.applyTraversalState(resolved.nextState);
      this.stateVersion += 1;
      if (resolved.item) {
        this.schedulePreload();
      }
      return resolved.item;
    } catch (error) {
      logger.error('Error in getNextCard', error);
      return null;
    }
  }

  async addConceptBlock(
    blockId: string,
    priority: 'normal' | 'high' = 'normal',
    options: { skipConceptValidation?: boolean } = {}
  ): Promise<void> {
    this.invalidatePreload();
    const isConcept = options.skipConceptValidation
      ? true
      : await this.isConceptCard(blockId);
    if (!isConcept) {
      throw new Error(`Block ${blockId} is not a concept card`);
    }
    const priorityValue = priority === 'high' ? 0.9 : 0.65;
    await this.setSeedEntryInternal(blockId, true, {
      preferredKind: 'concept',
      priority: priorityValue,
    });
  }

  removeConceptBlock(blockId: string): void {
    this.invalidatePreload();
    this.seedPool.delete(blockId);
    this.exhaustedFocuses.delete(blockId);
    if (this.currentFocus === blockId) {
      this.currentFocus = null;
      this.currentFocusEventId = null;
      this.branchRootNodeId = null;
    }
  }

  getConceptBlocks(): string[] {
    return Array.from(this.seedPool.values()).map((entry) => entry.blockId);
  }

  restoreConceptBlocks(blockIds: string[]): void {
    this.seedPool.clear();
    this.exhaustedFocuses.clear();

    for (const blockId of blockIds) {
      this.seedPool.set(blockId, {
        blockId,
        nodeKind: 'concept',
        priority: 0.65,
        neighborsViewed: 0,
        addedAt: Date.now(),
        preview: this.compressText(blockId),
      });
    }
  }

  getSeedSnapshot(): NeuralRoamSeedEntry[] {
    return Array.from(this.seedPool.values())
      .map((entry) => {
        const latest = this.findLatestHistoryEntry(entry.blockId);
        return {
          nodeId: entry.blockId,
          nodePreview: entry.preview,
          priority: entry.priority,
          addedAt: entry.addedAt,
          visitedAt: latest?.visitedAt ?? entry.addedAt,
        } satisfies NeuralRoamSeedEntry;
      })
      .sort((a, b) => b.visitedAt - a.visitedAt);
  }

  async setSeedEntry(nodeId: string, enabled = true): Promise<void> {
    this.invalidatePreload();
    await this.setSeedEntryInternal(nodeId, enabled);
  }

  getAnchorSnapshot(): NeuralRoamAnchorEntry[] {
    return Array.from(this.anchorPool.values())
      .map((entry) => {
        const latest = this.findLatestHistoryEntry(entry.blockId);
        return {
          nodeId: entry.blockId,
          nodePreview: entry.preview,
          isVirtual: entry.nodeKind === 'virtual',
          nodeKind: entry.nodeKind,
          priority: entry.priority,
          addedAt: entry.addedAt,
          visitedAt: latest?.visitedAt ?? entry.addedAt,
        } satisfies NeuralRoamAnchorEntry;
      })
      .sort((a, b) => b.visitedAt - a.visitedAt);
  }

  async setAnchorEntry(nodeId: string, enabled = true): Promise<void> {
    this.invalidatePreload();
    await this.setAnchorEntryInternal(nodeId, enabled);
  }

  async clearAnchors(): Promise<void> {
    this.invalidatePreload();
    this.anchorPool.clear();
    if (this.currentFocus && !this.seedPool.has(this.currentFocus)) {
      this.currentFocus = null;
      this.currentFocusEventId = null;
      this.branchRootNodeId = null;
    }
  }

  getSessionFocusStack(): NeuralRoamHistoryEntry[] {
    if (!this.currentSessionId) {
      return [];
    }

    const sessionEntries = this.history
      .filter((entry) => entry.sessionId === this.currentSessionId)
      .sort((a, b) => b.visitedAt - a.visitedAt);

    const latestByNodeId = new Map<string, NeuralRoamHistoryEntry>();
    for (const entry of sessionEntries) {
      if (!latestByNodeId.has(entry.nodeId)) {
        latestByNodeId.set(entry.nodeId, entry);
      }
    }

    const seenFocusIds = new Set<string>();
    const focusEntries: NeuralRoamHistoryEntry[] = [];
    for (const entry of sessionEntries) {
      const focusNodeId = entry.associationType === 'focus'
        ? entry.nodeId
        : entry.focusId;
      if (!focusNodeId || seenFocusIds.has(focusNodeId)) {
        continue;
      }
      seenFocusIds.add(focusNodeId);
      focusEntries.push(this.buildFocusStackEntry(
        focusNodeId,
        entry,
        latestByNodeId.get(focusNodeId) ?? null
      ));
    }

    if (this.currentFocus && !seenFocusIds.has(this.currentFocus)) {
      focusEntries.unshift(this.buildFocusStackEntry(this.currentFocus, null, latestByNodeId.get(this.currentFocus) ?? null));
    } else if (this.currentFocus) {
      const currentIndex = focusEntries.findIndex((entry) => entry.nodeId === this.currentFocus);
      if (currentIndex > 0) {
        const [currentEntry] = focusEntries.splice(currentIndex, 1);
        focusEntries.unshift(currentEntry);
      }
    }

    return focusEntries.map((entry) => ({ ...entry }));
  }

  getFocusPoolSnapshot(): NeuralRoamFocusEntry[] {
    return this.getAnchorSnapshot()
      .map((entry) => {
        return {
          nodeId: entry.nodeId,
          nodePreview: entry.nodePreview,
          isVirtual: entry.isVirtual,
          nodeKind: entry.nodeKind,
          priority: entry.priority,
          addedAt: entry.addedAt,
          visitedAt: entry.visitedAt,
        } satisfies NeuralRoamFocusEntry;
      })
      .sort((a, b) => b.visitedAt - a.visitedAt);
  }

  /**
   * @deprecated Compatibility alias for old pin model.
   */
  getPinnedFocusBlocks(): NeuralRoamHistoryEntry[] {
    return this.getAnchorSnapshot()
      .map((entry) => {
        const latest = this.findLatestHistoryEntry(entry.nodeId);
        return {
          eventId: latest?.eventId ?? `focus-pool-${entry.nodeId}`,
          nodeId: entry.nodeId,
          focusId: entry.nodeId,
          sessionId: latest?.sessionId ?? this.currentSessionId ?? 'focus-pool',
          associationType: 'focus',
          reason: this.getReasonText('focus'),
          visitedAt: entry.visitedAt,
          isVirtual: entry.isVirtual,
          nodePreview: entry.nodePreview,
          traceQuality: latest?.traceQuality ?? 'legacy',
          engineMode: latest?.engineMode ?? 'orbit',
          sourceRole: latest?.sourceRole ?? 'orbit-center',
          sourceNodeId: latest?.sourceNodeId ?? null,
          sourceEventId: latest?.sourceEventId ?? null,
          branchRootNodeId: latest?.branchRootNodeId ?? entry.nodeId,
          activationKind: latest?.activationKind ?? 'focus-root',
          depth: latest?.depth ?? null,
          conductionScore: latest?.conductionScore ?? null,
        } satisfies NeuralRoamHistoryEntry;
      })
      .sort((a, b) => b.visitedAt - a.visitedAt);
  }

  async setFocusPoolEntry(nodeId: string, enabled = true): Promise<void> {
    await this.setAnchorEntry(nodeId, enabled);
  }

  /**
   * @deprecated Compatibility alias for old pin model.
   */
  async setPinnedFocusBlock(blockId: string, pinned = true): Promise<void> {
    await this.setFocusPoolEntry(blockId, pinned);
  }

  async clearFocusPool(): Promise<void> {
    await this.clearAnchors();
  }

  async setCurrentFocus(
    focusId: string,
    options: {
      includeFocusAsFirst?: boolean;
      resetHistory?: boolean;
      bookmarkCurrentPath?: boolean;
    } = {}
  ): Promise<void> {
    this.invalidatePreload();
    const previousPathIndex = this.currentPathIndex;
    await this.setAnchorEntryInternal(focusId, true);
    await this.startRoamingFromFocus(focusId, options);
    if (options.bookmarkCurrentPath && previousPathIndex >= 0) {
      this.bookmarkPathIndex = previousPathIndex;
    }
  }

  async startRoamingFromFocus(
    focusId: string,
    options: {
      includeFocusAsFirst?: boolean;
      resetHistory?: boolean;
    } = {}
  ): Promise<void> {
    this.invalidatePreload();
    const isConcept = await this.isConceptCard(focusId);
    if (isConcept && !this.seedPool.has(focusId)) {
      await this.addConceptBlock(focusId, 'normal');
    }

    if (options.resetHistory) {
      this.clearHistory('all');
    }

    if (!this.currentSessionId) {
      this.currentSessionId = createSessionId();
    }
    this.currentFocus = focusId;
    this.currentFocusEventId = this.findFocusEventIdForSession(focusId, this.currentSessionId);
    this.branchRootNodeId = focusId;
    this.navigationMode = 'explore';
    this.followCurrentNodeOnce = false;
    this.exhaustedFocuses.delete(focusId);

    if (options.includeFocusAsFirst) {
      const card = await this.activateNode(focusId, {
        associationType: 'focus',
        reason: this.getReasonText('focus'),
        focusId,
        isVirtual: !isConcept,
        activationKind: 'focus-root',
        sourceNodeId: null,
        sourceEventId: null,
        branchRootNodeId: focusId,
      });
      if (!card) {
        throw new Error(`Failed to start roaming from focus ${focusId}`);
      }
      return;
    }

    const latestIndex = this.findLatestPathIndex(focusId);
    if (latestIndex >= 0) {
      this.currentPathIndex = latestIndex;
    }
  }

  async jumpToHistoryNode(nodeId: string): Promise<boolean> {
    this.invalidatePreload();
    const target = this.findLatestHistoryEntry(nodeId);
    if (target) {
      const pathForSession = this.buildPathForSession(target.sessionId);
      const previousPathIndex = this.currentPathIndex;

      if (pathForSession.length > 0) {
        this.displayPath = pathForSession;
        this.displayPathEventIds = this.buildPathEventIdsForSession(target.sessionId);
        this.currentPathIndex = pathForSession.lastIndexOf(nodeId);
        this.currentSessionId = target.sessionId;
        this.currentFocus = target.focusId ?? this.currentFocus;
        this.currentFocusEventId = this.findFocusEventIdForSession(this.currentFocus, this.currentSessionId);
        this.branchRootNodeId = target.branchRootNodeId ?? this.currentFocus ?? target.nodeId;
        this.visitedBlocks = new Set(pathForSession);
      } else {
        const targetIndex = this.findLatestPathIndex(nodeId);
        if (targetIndex >= 0) {
          this.currentPathIndex = targetIndex;
          this.currentSessionId = target.sessionId;
          this.currentFocus = target.focusId ?? this.currentFocus;
          this.currentFocusEventId = this.findFocusEventIdForSession(this.currentFocus, this.currentSessionId);
          this.branchRootNodeId = target.branchRootNodeId ?? this.currentFocus ?? target.nodeId;
        }
      }

      if (previousPathIndex >= 0 && previousPathIndex !== this.currentPathIndex) {
        this.bookmarkPathIndex = previousPathIndex;
      }

      this.navigationMode = 'follow';
      this.followCurrentNodeOnce = this.currentPathIndex >= 0;
      return this.currentPathIndex >= 0;
    }

    const blockData = await this.queryEngine.fetchBlockData(nodeId);
    if (!blockData) {
      return false;
    }

    const previousPathIndex = this.currentPathIndex;
    const card = await this.activateNode(nodeId, {
      associationType: 'path',
      reason: this.getReasonText('path'),
      focusId: this.currentFocus,
      isVirtual: this.getNodeKind(nodeId) === 'virtual',
      activationKind: 'manual-jump',
      sourceNodeId: this.getCurrentPathNodeId(),
      sourceEventId: this.getCurrentPathEventId(),
      branchRootNodeId: this.branchRootNodeId ?? this.currentFocus ?? nodeId,
    });
    if (!card) {
      return false;
    }

    if (previousPathIndex >= 0 && previousPathIndex !== this.currentPathIndex) {
      this.bookmarkPathIndex = previousPathIndex;
    }
    this.navigationMode = 'follow';
    this.followCurrentNodeOnce = false;
    return true;
  }

  clearHistory(scope: 'current' | 'all' = 'current'): void {
    this.invalidatePreload();
    if (scope === 'all') {
      this.history = [];
    } else if (this.currentSessionId) {
      const sessionId = this.currentSessionId;
      this.history = this.history.filter((entry) => entry.sessionId !== sessionId);
    }

    this.resetNavigationState();
  }

  size(): number {
    return this.seedPool.size;
  }

  getHistorySnapshot(): NeuralRoamHistoryEntry[] {
    return this.history.map((entry) => ({ ...entry }));
  }

  getActivationTrace(eventId: string): NeuralActivationTrace | null {
    const target = this.findHistoryEntryByEventId(eventId);
    if (!target) {
      return null;
    }

    if (target.traceQuality === 'legacy') {
      return {
        targetEventId: target.eventId,
        targetNodeId: target.nodeId,
        branchRootNodeId: target.branchRootNodeId,
        isExact: false,
        degradedReason: 'legacy',
        steps: [this.toTraceStep(target)],
      };
    }

    const seen = new Set<string>();
    const reversedSteps: NeuralActivationTraceStep[] = [];
    let current: NeuralRoamHistoryEntry | null = target;
    let degradedReason: string | null = null;

    while (current) {
      if (seen.has(current.eventId)) {
        degradedReason = degradedReason ?? 'cycle-detected';
        break;
      }
      seen.add(current.eventId);
      reversedSteps.push(this.toTraceStep(current));

      if (!current.sourceEventId) {
        if (current.sourceNodeId && current.sourceNodeId !== current.nodeId) {
          reversedSteps.push(this.buildSyntheticRootStep(current));
        }
        break;
      }

      const sourceEntry = this.findHistoryEntryByEventId(current.sourceEventId);
      if (!sourceEntry) {
        degradedReason = degradedReason ?? 'missing-source-event';
        if (current.sourceNodeId && current.sourceNodeId !== current.nodeId) {
          reversedSteps.push(this.buildSyntheticRootStep(current));
        }
        break;
      }

      current = sourceEntry;
    }

    const steps = reversedSteps.reverse();
    const branchRootNodeId = target.branchRootNodeId;
    if (
      branchRootNodeId
      && steps.length > 0
      && !steps.some((step) => step.nodeId === branchRootNodeId)
    ) {
      steps.unshift(this.buildSyntheticRootStep(target, branchRootNodeId));
      degradedReason = degradedReason ?? 'branch-root-unresolved';
    }

    return {
      targetEventId: target.eventId,
      targetNodeId: target.nodeId,
      branchRootNodeId,
      isExact: degradedReason === null,
      degradedReason,
      steps,
    };
  }

  getDisplayPathSnapshot(): string[] {
    return [...this.displayPath];
  }

  getSessionVisibleNodeIds(limit = 50): string[] {
    if (this.displayPath.length === 0) {
      return [];
    }
    const safeLimit = clamp(Math.floor(limit), 1, 500);
    return this.displayPath.slice(Math.max(0, this.displayPath.length - safeLimit));
  }

  getNavigationState(): NeuralNavigationState {
    return {
      currentPathIndex: this.currentPathIndex,
      currentNodeId: this.getCurrentPathNodeId(),
      currentEventId: this.getCurrentPathEventId(),
      navigationMode: this.navigationMode,
      engineMode: 'orbit',
      engineSessionId: this.currentSessionId,
      hasBookmark: this.bookmarkPathIndex !== null,
      pathLength: this.displayPath.length,
      sessionId: this.currentSessionId,
    };
  }

  setNavigationMode(mode: NeuralNavigationMode): void {
    this.invalidatePreload();
    this.navigationMode = mode;
  }

  returnToBookmark(): boolean {
    this.invalidatePreload();
    if (this.bookmarkPathIndex === null) {
      return false;
    }
    if (this.bookmarkPathIndex < 0 || this.bookmarkPathIndex >= this.displayPath.length) {
      this.bookmarkPathIndex = null;
      return false;
    }

    this.currentPathIndex = this.bookmarkPathIndex;
    this.bookmarkPathIndex = null;
    this.navigationMode = 'follow';
    return true;
  }

  async getPathItemByNodeId(blockId: string, options: PathItemOptions = {}): Promise<QueueItem | null> {
    const blockData = await this.queryEngine.fetchBlockData(blockId);
    if (!blockData) {
      return null;
    }

    const latestHistory = this.findLatestHistoryEntry(blockId);
    const associationType = latestHistory?.associationType
      ?? (this.getNodeState(blockId) ? 'focus' : 'path');
    const reason = latestHistory?.reason
      ?? this.getReasonText(associationType);

    let navigationChanged = false;
    if (options.focusPath !== false) {
      const targetIndex = this.findLatestPathIndex(blockId);
      if (targetIndex >= 0) {
        if (this.currentPathIndex >= 0 && this.currentPathIndex !== targetIndex) {
          this.bookmarkPathIndex = this.currentPathIndex;
        }
        navigationChanged = this.currentPathIndex !== targetIndex || this.navigationMode !== 'follow';
        this.currentPathIndex = targetIndex;
        this.navigationMode = 'follow';
        this.followCurrentNodeOnce = false;
      }
    }

    if (navigationChanged) {
      this.invalidatePreload();
    }

    return this.buildQueueItem(blockData, associationType, reason);
  }

  exportSeedPoolState(): FocusPoolPersistedEntry[] {
    return Array.from(this.seedPool.values())
      .map((entry) => ({
        nodeId: entry.blockId,
        nodeKind: entry.nodeKind,
        priority: entry.priority,
        neighborsViewed: entry.neighborsViewed,
        addedAt: entry.addedAt,
        nodePreview: entry.preview,
      }))
      .sort((a, b) => b.addedAt - a.addedAt);
  }

  exportAnchorPoolState(): FocusPoolPersistedEntry[] {
    return Array.from(this.anchorPool.values())
      .map((entry) => ({
        nodeId: entry.blockId,
        nodeKind: entry.nodeKind,
        priority: entry.priority,
        neighborsViewed: entry.neighborsViewed,
        addedAt: entry.addedAt,
        nodePreview: entry.preview,
      }))
      .sort((a, b) => b.addedAt - a.addedAt);
  }

  exportFocusPoolState(): FocusPoolPersistedEntry[] {
    return this.exportAnchorPoolState();
  }

  restoreSeedPoolState(entries: unknown): void {
    if (!Array.isArray(entries)) {
      this.seedPool.clear();
      return;
    }

    this.seedPool.clear();
    for (const raw of entries) {
      if (!isRecord(raw)) {
        continue;
      }
      const nodeId = typeof raw.nodeId === 'string' ? raw.nodeId : '';
      if (!nodeId) {
        continue;
      }

      const nodeKind = normalizeNodeKind(raw.nodeKind);
      this.seedPool.set(nodeId, {
        blockId: nodeId,
        nodeKind: 'concept',
        priority: normalizePriority(raw.priority, nodeKind === 'concept' ? 0.65 : 0.55),
        neighborsViewed: clamp(Number(raw.neighborsViewed) || 0, 0, 999),
        addedAt: Number.isFinite(Number(raw.addedAt)) ? Number(raw.addedAt) : Date.now(),
        preview: this.compressText(typeof raw.nodePreview === 'string' ? raw.nodePreview : nodeId),
      });
    }
  }

  restoreAnchorPoolState(entries: unknown): void {
    if (!Array.isArray(entries)) {
      this.anchorPool.clear();
      return;
    }

    this.anchorPool.clear();
    for (const raw of entries) {
      if (!isRecord(raw)) {
        continue;
      }
      const nodeId = typeof raw.nodeId === 'string' ? raw.nodeId : '';
      if (!nodeId) {
        continue;
      }

      const nodeKind = normalizeNodeKind(raw.nodeKind);
      this.anchorPool.set(nodeId, {
        blockId: nodeId,
        nodeKind,
        priority: normalizePriority(raw.priority, nodeKind === 'concept' ? 0.65 : 0.55),
        neighborsViewed: clamp(Number(raw.neighborsViewed) || 0, 0, 999),
        addedAt: Number.isFinite(Number(raw.addedAt)) ? Number(raw.addedAt) : Date.now(),
        preview: this.compressText(typeof raw.nodePreview === 'string' ? raw.nodePreview : nodeId),
      });
    }
  }

  restoreFocusPoolState(entries: unknown): void {
    this.restoreAnchorPoolState(entries);
  }

  exportSessionState(): ConceptNeuralSessionState {
    return {
      displayPath: [...this.displayPath],
      displayPathEventIds: [...this.displayPathEventIds],
      currentPathIndex: this.currentPathIndex,
      navigationMode: this.navigationMode,
      bookmarkPathIndex: this.bookmarkPathIndex,
      history: this.getHistorySnapshot(),
      currentFocus: this.currentFocus,
      currentFocusEventId: this.currentFocusEventId,
      branchRootNodeId: this.branchRootNodeId,
      currentSessionId: this.currentSessionId,
      visitedBlocks: Array.from(this.visitedBlocks),
      exhaustedFocuses: Array.from(this.exhaustedFocuses),
    };
  }

  restoreSessionState(state: Partial<ConceptNeuralSessionState> | null | undefined): void {
    this.invalidatePreload();
    if (!isRecord(state)) {
      this.resetNavigationState();
      return;
    }

    const displayPath = Array.isArray(state.displayPath)
      ? state.displayPath.map((id) => String(id)).filter(Boolean)
      : [];
    const displayPathEventIds = Array.isArray(state.displayPathEventIds)
      ? state.displayPathEventIds.map((id) => String(id)).filter(Boolean)
      : [];

    const rawPathIndex = Number(state.currentPathIndex);
    const maxPathIndex = displayPath.length - 1;
    const currentPathIndex = displayPath.length > 0
      ? clamp(Number.isFinite(rawPathIndex) ? Math.floor(rawPathIndex) : maxPathIndex, 0, maxPathIndex)
      : -1;

    const navigationMode = state.navigationMode === 'follow' ? 'follow' : 'explore';

    const rawBookmark = state.bookmarkPathIndex;
    const bookmarkPathIndex = Number.isFinite(rawBookmark)
      ? clamp(Math.floor(Number(rawBookmark)), 0, Math.max(0, maxPathIndex))
      : null;

    const history = Array.isArray(state.history)
      ? state.history
          .map((entry, index) => this.normalizeHistoryEntry(entry, index))
          .filter((entry): entry is NeuralRoamHistoryEntry => Boolean(entry))
      : [];

    const visitedBlocks = Array.isArray(state.visitedBlocks)
      ? new Set(state.visitedBlocks.map((id) => String(id)).filter(Boolean))
      : new Set(displayPath);
    const exhaustedFocuses = Array.isArray(state.exhaustedFocuses)
      ? new Set(state.exhaustedFocuses.map((id) => String(id)).filter(Boolean))
      : new Set<string>();

    if (Array.isArray(state.seedPool)) {
      this.restoreSeedPoolState(state.seedPool);
    } else if (Array.isArray(state.focusPool)) {
      const legacyEntries = state.focusPool.map((entry) => ({
        ...(entry as unknown as Record<string, unknown>),
        nodeKind: normalizeNodeKind((entry as unknown as Record<string, unknown>).nodeKind) === 'concept'
          ? 'concept'
          : 'virtual',
      }));
      this.restoreSeedPoolState(
        legacyEntries.filter((entry) => normalizeNodeKind(entry.nodeKind) === 'concept')
      );
      this.restoreAnchorPoolState(legacyEntries);
    }

    if (Array.isArray(state.anchorPool)) {
      this.restoreAnchorPoolState(state.anchorPool);
    } else if (Array.isArray(state.pinnedFocusBlocks)) {
      // Legacy v3 compatibility: map old pinned blocks into concept focus entries.
      this.restoreAnchorPoolState(state.pinnedFocusBlocks.map((nodeId) => ({
        nodeId,
        nodeKind: 'concept',
      })));
    }

    const normalizedHistory = history.slice(-this.historyLimit);
    const resolvedSessionId = typeof state.currentSessionId === 'string' && state.currentSessionId
      ? state.currentSessionId
      : this.resolveLatestSessionId(normalizedHistory);
    const resolvedCurrentFocus = typeof state.currentFocus === 'string' && state.currentFocus ? state.currentFocus : null;

    this.displayPath = displayPath;
    this.displayPathEventIds = displayPathEventIds.length === displayPath.length
      ? displayPathEventIds
      : this.rebuildDisplayPathEventIds(displayPath, normalizedHistory);
    this.currentPathIndex = currentPathIndex;
    this.navigationMode = navigationMode;
    this.bookmarkPathIndex = bookmarkPathIndex;
    this.history = normalizedHistory;
    this.currentFocus = resolvedCurrentFocus;
    this.currentSessionId = resolvedSessionId;
    this.currentFocusEventId = typeof state.currentFocusEventId === 'string' && state.currentFocusEventId
      ? state.currentFocusEventId
      : this.findFocusEventIdForSession(this.currentFocus, this.currentSessionId);
    this.branchRootNodeId = typeof state.branchRootNodeId === 'string' && state.branchRootNodeId
      ? state.branchRootNodeId
      : this.resolveBranchRootNodeId(this.history, this.currentFocus);
    this.visitedBlocks = visitedBlocks;
    this.exhaustedFocuses = exhaustedFocuses;
    this.followCurrentNodeOnce = false;
  }

  async normalizeSeedPoolToConceptCards(
    options: { validationErrorPolicy?: SeedValidationErrorPolicy } = {}
  ): Promise<{ changed: boolean; removedNodeIds: string[] }> {
    const removedNodeIds: string[] = [];
    const validationErrorPolicy = options.validationErrorPolicy ?? 'remove';

    for (const nodeId of Array.from(this.seedPool.keys())) {
      let isConcept = false;
      try {
        isConcept = await this.isConceptCard(nodeId);
      } catch (error) {
        if (validationErrorPolicy === 'keep') {
          logger.warn('Failed to validate seed entry as concept card, preserving entry', {
            nodeId,
            error,
          });
          continue;
        }
        logger.warn('Failed to validate seed entry as concept card, removing entry defensively', {
          nodeId,
          error,
        });
      }

      if (isConcept) {
        continue;
      }

      this.seedPool.delete(nodeId);
      this.exhaustedFocuses.delete(nodeId);
      removedNodeIds.push(nodeId);
    }

    if (removedNodeIds.length === 0) {
      return { changed: false, removedNodeIds: [] };
    }

    const removedSet = new Set(removedNodeIds);
    if (this.currentFocus && removedSet.has(this.currentFocus) && !this.anchorPool.has(this.currentFocus)) {
      this.currentFocus = null;
      this.currentFocusEventId = null;
      this.branchRootNodeId = null;
      if (this.navigationMode === 'follow') {
        this.navigationMode = 'explore';
      }
      this.followCurrentNodeOnce = false;
    }

    return { changed: true, removedNodeIds };
  }

  private async setSeedEntryInternal(
    nodeId: string,
    enabled: boolean,
    options: {
      preferredKind?: NeuralFocusNodeKind;
      priority?: number;
    } = {}
  ): Promise<void> {
    if (!enabled) {
      this.seedPool.delete(nodeId);
      this.exhaustedFocuses.delete(nodeId);
      if (this.currentFocus === nodeId && !this.anchorPool.has(nodeId)) {
        this.currentFocus = null;
        this.currentFocusEventId = null;
        this.branchRootNodeId = null;
      }
      return;
    }

    const existing = this.seedPool.get(nodeId);
    const isConcept = options.preferredKind
      ? options.preferredKind === 'concept'
      : await this.isConceptCard(nodeId);
    if (!isConcept) {
      throw new Error(`Block ${nodeId} is not a concept card`);
    }
    const blockData = await this.queryEngine.fetchBlockData(nodeId);

    this.seedPool.set(nodeId, {
      blockId: nodeId,
      nodeKind: 'concept',
      priority: normalizePriority(
        options.priority ?? existing?.priority,
        0.65
      ),
      neighborsViewed: existing?.neighborsViewed ?? 0,
      addedAt: existing?.addedAt ?? Date.now(),
      preview: this.compressText(blockData?.content || existing?.preview || nodeId),
    });
    this.exhaustedFocuses.delete(nodeId);
  }

  private async setAnchorEntryInternal(
    nodeId: string,
    enabled: boolean,
    options: {
      preferredKind?: NeuralFocusNodeKind;
      priority?: number;
    } = {}
  ): Promise<void> {
    if (!enabled) {
      this.anchorPool.delete(nodeId);
      if (this.currentFocus === nodeId && !this.seedPool.has(nodeId)) {
        this.currentFocus = null;
        this.currentFocusEventId = null;
        this.branchRootNodeId = null;
      }
      return;
    }

    const existing = this.anchorPool.get(nodeId);
    const isConcept = options.preferredKind
      ? options.preferredKind === 'concept'
      : await this.isConceptCard(nodeId);
    const nodeKind: NeuralFocusNodeKind = isConcept ? 'concept' : 'virtual';
    const blockData = await this.queryEngine.fetchBlockData(nodeId);

    this.anchorPool.set(nodeId, {
      blockId: nodeId,
      nodeKind,
      priority: normalizePriority(
        options.priority ?? existing?.priority,
        nodeKind === 'concept' ? 0.65 : 0.55
      ),
      neighborsViewed: existing?.neighborsViewed ?? 0,
      addedAt: existing?.addedAt ?? Date.now(),
      preview: this.compressText(blockData?.content || existing?.preview || nodeId),
    });
  }

  private getNodeState(nodeId: string): FocusState | null {
    return this.seedPool.get(nodeId) ?? this.anchorPool.get(nodeId) ?? null;
  }

  private async isConceptCard(blockId: string): Promise<boolean> {
    return this.conceptCardValidator(blockId);
  }

  private getNodeKind(nodeId: string): NeuralFocusNodeKind {
    if (this.seedPool.has(nodeId)) {
      return 'concept';
    }
    return this.anchorPool.get(nodeId)?.nodeKind ?? 'virtual';
  }

  private async activateNode(nodeId: string, meta: ActivateNodeMeta): Promise<QueueItem | null> {
    const blockData = await this.queryEngine.fetchBlockData(nodeId);
    if (!blockData) {
      return null;
    }

    if (!this.currentSessionId) {
      this.currentSessionId = createSessionId();
    }

    if (this.currentPathIndex >= 0 && this.currentPathIndex < this.displayPath.length - 1) {
      this.displayPath = this.displayPath.slice(0, this.currentPathIndex + 1);
      this.displayPathEventIds = this.displayPathEventIds.slice(0, this.currentPathIndex + 1);
    }

    const historyEntry = this.createHistoryEntry(
      nodeId,
      this.currentSessionId,
      this.compressText(blockData.content || nodeId),
      meta,
    );
    this.displayPath.push(nodeId);
    this.displayPathEventIds.push(historyEntry.eventId);
    this.currentPathIndex = this.displayPath.length - 1;
    this.navigationMode = 'explore';
    this.bookmarkPathIndex = null;
    this.followCurrentNodeOnce = false;
    this.visitedBlocks.add(nodeId);

    this.history.push(historyEntry);
    if (historyEntry.activationKind === 'focus-root') {
      this.currentFocus = nodeId;
      this.currentFocusEventId = historyEntry.eventId;
      this.branchRootNodeId = historyEntry.branchRootNodeId ?? nodeId;
    }
    if (this.history.length > this.historyLimit) {
      this.history.splice(0, this.history.length - this.historyLimit);
    }

    return this.buildQueueItem(blockData, meta.associationType, meta.reason);
  }

  private weightedRandomSelectFocus(focuses: Array<FocusState & { id: string }>): string {
    const totalWeight = focuses.reduce((sum, focus) => {
      const kindBoost = focus.nodeKind === 'concept' ? 1.6 : 1;
      return sum + (focus.priority * kindBoost);
    }, 0);
    let random = Math.random() * totalWeight;

    for (const focus of focuses) {
      const weight = focus.priority * (focus.nodeKind === 'concept' ? 1.6 : 1);
      random -= weight;
      if (random <= 0) {
        return focus.id;
      }
    }

    return focuses[focuses.length - 1].id;
  }

  private weightedRandomSelect(neighbors: Neighbor[]): Neighbor {
    const totalWeight = neighbors.reduce((sum, neighbor) => sum + neighbor.weight, 0);
    let random = Math.random() * totalWeight;

    for (const neighbor of neighbors) {
      random -= neighbor.weight;
      if (random <= 0) {
        return neighbor;
      }
    }

    return neighbors[neighbors.length - 1];
  }

  private buildQueueItem(blockData: BlockData, associationType: string, reason: string): QueueItem {
    return {
      id: blockData.id,
      blockId: blockData.id,
      deckId: blockData.root_id || blockData.id,
      blockData,
      associationType,
      reason,
    };
  }

  private getReasonText(type: string): string {
    const reasonMap: Record<string, string> = {
      backlink: '反向链接',
      outgoing: '概念关联',
      'outgoing-direct': '直接引用',
      'outgoing-indirect': '间接引用',
      descriptor: '描述符卡',
      focus: '焦点节点',
      path: '路径节点',
    };
    return reasonMap[type] || '未知关联';
  }

  private prefetchLikelyNextNeighborBlocks(
    neighbors: Neighbor[],
    selectedId: string,
    visitedBlocks: Set<string> = this.visitedBlocks,
  ): void {
    const candidateIds = neighbors
      .filter((neighbor) => neighbor.id !== selectedId && !visitedBlocks.has(neighbor.id))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, this.prefetchNeighborCount)
      .map((neighbor) => neighbor.id);

    for (const blockId of candidateIds) {
      if (this.prefetchingBlockIds.has(blockId)) {
        continue;
      }

      this.prefetchingBlockIds.add(blockId);
      void this.queryEngine.fetchBlockData(blockId)
        .catch((error) => {
          logger.debug('Prefetch block data failed', { blockId, error });
        })
        .finally(() => {
          this.prefetchingBlockIds.delete(blockId);
        });
    }
  }

  private findLatestPathIndex(blockId: string): number {
    for (let index = this.displayPath.length - 1; index >= 0; index -= 1) {
      if (this.displayPath[index] === blockId) {
        return index;
      }
    }
    return -1;
  }

  private findLatestHistoryEntry(blockId: string): NeuralRoamHistoryEntry | null {
    for (let index = this.history.length - 1; index >= 0; index -= 1) {
      const entry = this.history[index];
      if (entry.nodeId === blockId) {
        return entry;
      }
    }
    return null;
  }

  private normalizeHistoryEntry(entry: unknown, index = 0): NeuralRoamHistoryEntry | null {
    if (!isRecord(entry)) {
      return null;
    }

    const nodeId = typeof entry.nodeId === 'string' ? entry.nodeId : '';
    if (!nodeId) {
      return null;
    }

    const focusId = typeof entry.focusId === 'string' && entry.focusId ? entry.focusId : null;
    const associationType = typeof entry.associationType === 'string' && entry.associationType
      ? entry.associationType
      : (focusId ? 'focus' : 'path');
    const reason = typeof entry.reason === 'string'
      ? entry.reason
      : this.getReasonText(associationType);
    const visitedAt = Number(entry.visitedAt);
    const sessionId = typeof entry.sessionId === 'string' && entry.sessionId
      ? entry.sessionId
      : this.currentSessionId || 'legacy';
    const isVirtual = Boolean(entry.isVirtual);
    const nodePreview = this.compressText(typeof entry.nodePreview === 'string' ? entry.nodePreview : nodeId);
    const eventId = typeof entry.eventId === 'string' && entry.eventId
      ? entry.eventId
      : `legacy-${sessionId}-${nodeId}-${Math.trunc(Number.isFinite(visitedAt) ? visitedAt : Date.now())}-${index}`;
    const traceQuality = entry.traceQuality === 'exact' ? 'exact' : 'legacy';
    const sourceNodeId = typeof entry.sourceNodeId === 'string' && entry.sourceNodeId ? entry.sourceNodeId : null;
    const sourceEventId = typeof entry.sourceEventId === 'string' && entry.sourceEventId ? entry.sourceEventId : null;
    const branchRootNodeId = typeof entry.branchRootNodeId === 'string' && entry.branchRootNodeId
      ? entry.branchRootNodeId
      : focusId ?? nodeId;
    const activationKind = entry.activationKind === 'focus-root'
      || entry.activationKind === 'source-root'
      || entry.activationKind === 'graph-edge'
      || entry.activationKind === 'tree-edge'
      || entry.activationKind === 'follow-path'
      || entry.activationKind === 'manual-jump'
      ? entry.activationKind
      : (associationType === 'focus' ? 'focus-root' : associationType === 'path' ? 'manual-jump' : 'graph-edge');
    const engineMode = entry.engineMode === 'hyperspace' ? 'hyperspace' : 'orbit';
    const sourceRole = entry.sourceRole === 'activation-source'
      ? 'activation-source'
      : entry.sourceRole === 'orbit-center'
        ? 'orbit-center'
        : (associationType === 'focus' ? 'orbit-center' : null);
    const origin = resolveOrbitOrigin(entry.origin ?? associationType);
    const depth = Number(entry.depth);
    const conductionScore = Number(entry.conductionScore);

    return {
      eventId,
      nodeId,
      focusId,
      sessionId,
      associationType,
      reason,
      visitedAt: Number.isFinite(visitedAt) ? visitedAt : Date.now(),
      isVirtual,
      nodePreview,
      traceQuality,
      engineMode,
      sourceRole,
      origin,
      sourceNodeId,
      sourceEventId,
      branchRootNodeId,
      activationKind,
      depth: Number.isFinite(depth) ? depth : null,
      conductionScore: Number.isFinite(conductionScore) ? conductionScore : null,
    };
  }

  private getCurrentPathNodeId(): string | null {
    if (this.currentPathIndex < 0 || this.currentPathIndex >= this.displayPath.length) {
      return null;
    }
    return this.displayPath[this.currentPathIndex];
  }

  private getCurrentPathEventId(): string | null {
    if (this.currentPathIndex < 0 || this.currentPathIndex >= this.displayPathEventIds.length) {
      return null;
    }
    return this.displayPathEventIds[this.currentPathIndex];
  }

  private buildFocusStackEntry(
    focusNodeId: string,
    sessionReference: NeuralRoamHistoryEntry | null,
    latestNodeEntry: NeuralRoamHistoryEntry | null
  ): NeuralRoamHistoryEntry {
    const focusState = this.getNodeState(focusNodeId);
    const visitedAt = latestNodeEntry?.visitedAt
      ?? sessionReference?.visitedAt
      ?? focusState?.addedAt
      ?? Date.now();
    const sessionId = latestNodeEntry?.sessionId
      ?? sessionReference?.sessionId
      ?? this.currentSessionId
      ?? 'focus-stack';
    const nodePreview = latestNodeEntry?.nodePreview
      ?? focusState?.preview
      ?? this.compressText(focusNodeId);

    return {
      eventId: latestNodeEntry?.eventId ?? sessionReference?.eventId ?? `focus-stack-${focusNodeId}`,
      nodeId: focusNodeId,
      focusId: focusNodeId,
      sessionId,
      associationType: 'focus',
      reason: this.getReasonText('focus'),
      visitedAt,
      isVirtual: focusState
        ? focusState.nodeKind === 'virtual'
        : Boolean(latestNodeEntry?.isVirtual ?? sessionReference?.isVirtual),
      nodePreview,
      traceQuality: latestNodeEntry?.traceQuality ?? sessionReference?.traceQuality ?? 'legacy',
      engineMode: latestNodeEntry?.engineMode ?? sessionReference?.engineMode ?? 'orbit',
      sourceRole: latestNodeEntry?.sourceRole ?? sessionReference?.sourceRole ?? 'orbit-center',
      sourceNodeId: latestNodeEntry?.sourceNodeId ?? sessionReference?.sourceNodeId ?? null,
      sourceEventId: latestNodeEntry?.sourceEventId ?? sessionReference?.sourceEventId ?? null,
      branchRootNodeId: latestNodeEntry?.branchRootNodeId ?? sessionReference?.branchRootNodeId ?? focusNodeId,
      activationKind: latestNodeEntry?.activationKind ?? sessionReference?.activationKind ?? 'focus-root',
      depth: latestNodeEntry?.depth ?? sessionReference?.depth ?? null,
      conductionScore: latestNodeEntry?.conductionScore ?? sessionReference?.conductionScore ?? null,
    };
  }

  private buildPathForSession(sessionId: string): string[] {
    return this.buildPathEntriesForSession(sessionId).map((entry) => entry.nodeId);
  }

  private buildPathEventIdsForSession(sessionId: string): string[] {
    return this.buildPathEntriesForSession(sessionId).map((entry) => entry.eventId);
  }

  private buildPathEntriesForSession(sessionId: string): NeuralRoamHistoryEntry[] {
    const path: NeuralRoamHistoryEntry[] = [];
    for (const entry of this.history) {
      if (entry.sessionId !== sessionId) {
        continue;
      }
      if (path[path.length - 1]?.nodeId !== entry.nodeId) {
        path.push(entry);
      }
    }
    return path;
  }

  private resolveLatestSessionId(history: NeuralRoamHistoryEntry[]): string | null {
    if (!history.length) {
      return null;
    }
    return history[history.length - 1].sessionId || null;
  }

  private compressText(text: string): string {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return '';
    }
    if (normalized.length <= this.previewLength) {
      return normalized;
    }
    return `${normalized.slice(0, this.previewLength)}...`;
  }

  private resetNavigationState(): void {
    this.invalidatePreload();
    this.visitedBlocks.clear();
    this.exhaustedFocuses.clear();
    this.displayPath = [];
    this.displayPathEventIds = [];
    this.currentFocus = null;
    this.currentFocusEventId = null;
    this.branchRootNodeId = null;
    this.currentPathIndex = -1;
    this.bookmarkPathIndex = null;
    this.currentSessionId = null;
    this.navigationMode = 'explore';
    this.followCurrentNodeOnce = false;

    for (const focus of this.seedPool.values()) {
      focus.neighborsViewed = 0;
    }
    for (const focus of this.anchorPool.values()) {
      focus.neighborsViewed = 0;
    }
  }

  private cloneTraversalState(): TraversalStateSnapshot {
    return {
      currentFocus: this.currentFocus,
      currentFocusEventId: this.currentFocusEventId,
      branchRootNodeId: this.branchRootNodeId,
      currentSessionId: this.currentSessionId,
      visitedBlocks: new Set(this.visitedBlocks),
      exhaustedFocuses: new Set(this.exhaustedFocuses),
      displayPath: [...this.displayPath],
      displayPathEventIds: [...this.displayPathEventIds],
      seedPool: this.cloneFocusPool(this.seedPool),
      anchorPool: this.cloneFocusPool(this.anchorPool),
      history: this.history.map((entry) => ({ ...entry })),
      navigationMode: this.navigationMode,
      currentPathIndex: this.currentPathIndex,
      bookmarkPathIndex: this.bookmarkPathIndex,
      followCurrentNodeOnce: this.followCurrentNodeOnce,
    };
  }

  private cloneFocusPool(pool: Map<string, FocusState>): Map<string, FocusState> {
    return new Map(
      Array.from(pool.entries()).map(([id, state]) => [id, { ...state }]),
    );
  }

  private applyTraversalState(snapshot: TraversalStateSnapshot): void {
    this.currentFocus = snapshot.currentFocus;
    this.currentFocusEventId = snapshot.currentFocusEventId;
    this.branchRootNodeId = snapshot.branchRootNodeId;
    this.currentSessionId = snapshot.currentSessionId;
    this.visitedBlocks = new Set(snapshot.visitedBlocks);
    this.exhaustedFocuses = new Set(snapshot.exhaustedFocuses);
    this.displayPath = [...snapshot.displayPath];
    this.displayPathEventIds = [...snapshot.displayPathEventIds];
    this.seedPool = this.cloneFocusPool(snapshot.seedPool);
    this.anchorPool = this.cloneFocusPool(snapshot.anchorPool);
    this.history = snapshot.history.map((entry) => ({ ...entry }));
    this.navigationMode = snapshot.navigationMode;
    this.currentPathIndex = snapshot.currentPathIndex;
    this.bookmarkPathIndex = snapshot.bookmarkPathIndex;
    this.followCurrentNodeOnce = snapshot.followCurrentNodeOnce;
  }

  private invalidatePreload(): void {
    this.preloadedNext = null;
    this.stateVersion += 1;
  }

  private schedulePreload(): void {
    if (this.isPreloading || this.preloadedNext) {
      return;
    }

    const baseVersion = this.stateVersion;
    const snapshot = this.cloneTraversalState();
    this.isPreloading = true;

    void this.resolveNextCardFromState(snapshot)
      .then((resolved) => {
        if (baseVersion !== this.stateVersion || !resolved.item) {
          return;
        }

        this.preloadedNext = {
          baseVersion,
          item: resolved.item,
          nextState: resolved.nextState,
        };
      })
      .catch((error) => {
        logger.debug('Preload next roam card failed', { error });
      })
      .finally(() => {
        this.isPreloading = false;
      });
  }

  private async resolveNextCardFromState(snapshot: TraversalStateSnapshot): Promise<TraversalResolution> {
    logger.debug('getNextCard called', {
      navigationMode: snapshot.navigationMode,
      pathLength: snapshot.displayPath.length,
      currentPathIndex: snapshot.currentPathIndex,
      currentSessionId: snapshot.currentSessionId,
      stateVersion: this.stateVersion,
    });

    if (snapshot.navigationMode === 'follow') {
      const followCard = await this.getNextCardFromPathState(snapshot);
      if (followCard) {
        return { item: followCard, nextState: snapshot };
      }
      snapshot.navigationMode = 'explore';
    }

    while (true) {
      if (!snapshot.currentFocus || this.shouldRotateFocusState(snapshot)) {
        snapshot.currentFocus = this.selectNextFocusState(snapshot);
        if (!snapshot.currentFocus) {
          logger.debug('No unvisited focus blocks available');
          return { item: null, nextState: snapshot };
        }
        snapshot.currentFocusEventId = this.findFocusEventIdInHistory(snapshot.history, snapshot.currentFocus, snapshot.currentSessionId);
        snapshot.branchRootNodeId = snapshot.currentFocus;
      }

      const neighborsResult = await this.queryEngine.fetchNeighbors(snapshot.currentFocus);
      const neighbors = Array.isArray(neighborsResult) ? neighborsResult : [];
      const unvisitedNeighbors = neighbors.filter((neighbor) => !snapshot.visitedBlocks.has(neighbor.id));

      if (unvisitedNeighbors.length > 0) {
        const selected = this.weightedRandomSelect(unvisitedNeighbors);
        const focusId = snapshot.currentFocus;
        const card = await this.activateNodeState(selected.id, {
          associationType: selected.type,
          reason: this.getReasonText(selected.type),
          focusId,
          isVirtual: this.getNodeKindFromState(snapshot, selected.id) === 'virtual',
          activationKind: 'graph-edge',
          sourceNodeId: focusId,
          sourceEventId: snapshot.currentFocusEventId,
          branchRootNodeId: snapshot.branchRootNodeId ?? focusId ?? selected.id,
        }, snapshot);

        if (!card) {
          snapshot.visitedBlocks.add(selected.id);
          continue;
        }

        const focusState = focusId ? snapshot.seedPool.get(focusId) : null;
        if (focusState) {
          focusState.neighborsViewed += 1;
        }

        this.prefetchLikelyNextNeighborBlocks(unvisitedNeighbors, selected.id, snapshot.visitedBlocks);
        return { item: card, nextState: snapshot };
      }

      if (snapshot.currentFocus && !snapshot.visitedBlocks.has(snapshot.currentFocus)) {
        const currentFocus = snapshot.currentFocus;
        const focusCard = await this.activateNodeState(currentFocus, {
          associationType: 'focus',
          reason: this.getReasonText('focus'),
          focusId: currentFocus,
          isVirtual: this.getNodeKindFromState(snapshot, currentFocus) === 'virtual',
          activationKind: 'graph-edge',
          sourceNodeId: currentFocus,
          sourceEventId: snapshot.currentFocusEventId,
          branchRootNodeId: snapshot.branchRootNodeId ?? currentFocus,
        }, snapshot);
        if (focusCard) {
          return { item: focusCard, nextState: snapshot };
        }
        snapshot.currentFocus = null;
        snapshot.currentFocusEventId = null;
        continue;
      }

      if (snapshot.currentFocus) {
        snapshot.exhaustedFocuses.add(snapshot.currentFocus);
      }
      this.rotateFocusState(snapshot);
    }
  }

  private async getNextCardFromPathState(snapshot: TraversalStateSnapshot): Promise<QueueItem | null> {
    if (snapshot.followCurrentNodeOnce) {
      snapshot.followCurrentNodeOnce = false;
      const currentNodeId = this.getCurrentPathNodeIdFromState(snapshot);
      if (currentNodeId) {
        const currentCard = await this.getPathItemByNodeIdFromState(currentNodeId, snapshot, { focusPath: false });
        if (currentCard) {
          return currentCard;
        }
      }
    }

    const nextIndex = snapshot.currentPathIndex + 1;
    if (nextIndex < 0 || nextIndex >= snapshot.displayPath.length) {
      return null;
    }

    const nodeId = snapshot.displayPath[nextIndex];
    const card = await this.getPathItemByNodeIdFromState(nodeId, snapshot, { focusPath: false });
    if (!card) {
      return null;
    }

    snapshot.currentPathIndex = nextIndex;
    return card;
  }

  private async activateNodeState(
    nodeId: string,
    meta: ActivateNodeMeta,
    snapshot: TraversalStateSnapshot,
  ): Promise<QueueItem | null> {
    const blockData = await this.queryEngine.fetchBlockData(nodeId);
    if (!blockData) {
      return null;
    }

    if (!snapshot.currentSessionId) {
      snapshot.currentSessionId = createSessionId();
    }

    if (snapshot.currentPathIndex >= 0 && snapshot.currentPathIndex < snapshot.displayPath.length - 1) {
      snapshot.displayPath = snapshot.displayPath.slice(0, snapshot.currentPathIndex + 1);
      snapshot.displayPathEventIds = snapshot.displayPathEventIds.slice(0, snapshot.currentPathIndex + 1);
    }

    const historyEntry = this.createHistoryEntry(
      nodeId,
      snapshot.currentSessionId,
      this.compressText(blockData.content || nodeId),
      meta,
    );
    snapshot.displayPath.push(nodeId);
    snapshot.displayPathEventIds.push(historyEntry.eventId);
    snapshot.currentPathIndex = snapshot.displayPath.length - 1;
    snapshot.navigationMode = 'explore';
    snapshot.bookmarkPathIndex = null;
    snapshot.followCurrentNodeOnce = false;
    snapshot.visitedBlocks.add(nodeId);

    snapshot.history.push(historyEntry);
    if (historyEntry.activationKind === 'focus-root') {
      snapshot.currentFocus = nodeId;
      snapshot.currentFocusEventId = historyEntry.eventId;
      snapshot.branchRootNodeId = historyEntry.branchRootNodeId ?? nodeId;
    }
    if (snapshot.history.length > this.historyLimit) {
      snapshot.history.splice(0, snapshot.history.length - this.historyLimit);
    }

    return this.buildQueueItem(blockData, meta.associationType, meta.reason);
  }

  private shouldRotateFocusState(snapshot: TraversalStateSnapshot): boolean {
    if (!snapshot.currentFocus) {
      return true;
    }

    const focusState = snapshot.seedPool.get(snapshot.currentFocus);
    if (!focusState) {
      return false;
    }

    return focusState.neighborsViewed >= this.neighborsPerRound;
  }

  private rotateFocusState(snapshot: TraversalStateSnapshot): void {
    if (snapshot.currentFocus) {
      const focusState = snapshot.seedPool.get(snapshot.currentFocus);
      if (focusState) {
        focusState.neighborsViewed = 0;
      }
    }
    snapshot.currentFocus = null;
    snapshot.currentFocusEventId = null;
  }

  private selectNextFocusState(snapshot: TraversalStateSnapshot): string | null {
    const candidateFocuses = Array.from(snapshot.seedPool.entries())
      .filter(([id]) => !snapshot.exhaustedFocuses.has(id))
      .map(([id, state]) => ({ id, ...state }));

    if (candidateFocuses.length === 0) {
      return null;
    }

    return this.weightedRandomSelectFocus(candidateFocuses);
  }

  private selectNextFocus(): string | null {
    return this.selectNextFocusState(this.cloneTraversalState());
  }

  private getNodeKindFromState(snapshot: TraversalStateSnapshot, nodeId: string): NeuralFocusNodeKind {
    if (snapshot.seedPool.has(nodeId)) {
      return 'concept';
    }
    return snapshot.anchorPool.get(nodeId)?.nodeKind ?? 'virtual';
  }

  private async getPathItemByNodeIdFromState(
    blockId: string,
    snapshot: TraversalStateSnapshot,
    options: PathItemOptions = {},
  ): Promise<QueueItem | null> {
    const blockData = await this.queryEngine.fetchBlockData(blockId);
    if (!blockData) {
      return null;
    }

    const latestHistory = this.findLatestHistoryEntryInHistory(snapshot.history, blockId);
    const associationType = latestHistory?.associationType
      ?? (this.getNodeStateFromState(snapshot, blockId) ? 'focus' : 'path');
    const reason = latestHistory?.reason
      ?? this.getReasonText(associationType);

    if (options.focusPath !== false) {
      const targetIndex = this.findLatestPathIndexInPath(snapshot.displayPath, blockId);
      if (targetIndex >= 0) {
        if (snapshot.currentPathIndex >= 0 && snapshot.currentPathIndex !== targetIndex) {
          snapshot.bookmarkPathIndex = snapshot.currentPathIndex;
        }
        snapshot.currentPathIndex = targetIndex;
        snapshot.navigationMode = 'follow';
        snapshot.followCurrentNodeOnce = false;
      }
    }

    return this.buildQueueItem(blockData, associationType, reason);
  }

  private getNodeStateFromState(snapshot: TraversalStateSnapshot, nodeId: string): FocusState | null {
    return snapshot.seedPool.get(nodeId) ?? snapshot.anchorPool.get(nodeId) ?? null;
  }

  private getCurrentPathNodeIdFromState(snapshot: TraversalStateSnapshot): string | null {
    if (snapshot.currentPathIndex < 0 || snapshot.currentPathIndex >= snapshot.displayPath.length) {
      return null;
    }
    return snapshot.displayPath[snapshot.currentPathIndex];
  }

  private findLatestPathIndexInPath(displayPath: string[], blockId: string): number {
    for (let index = displayPath.length - 1; index >= 0; index -= 1) {
      if (displayPath[index] === blockId) {
        return index;
      }
    }
    return -1;
  }

  private findLatestHistoryEntryInHistory(
    history: NeuralRoamHistoryEntry[],
    blockId: string,
  ): NeuralRoamHistoryEntry | null {
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const entry = history[index];
      if (entry.nodeId === blockId) {
        return entry;
      }
    }
    return null;
  }

  private findHistoryEntryByEventId(eventId: string): NeuralRoamHistoryEntry | null {
    for (let index = this.history.length - 1; index >= 0; index -= 1) {
      const entry = this.history[index];
      if (entry.eventId === eventId) {
        return entry;
      }
    }
    return null;
  }

  private findFocusEventIdForSession(focusId: string | null, sessionId: string | null): string | null {
    return this.findFocusEventIdInHistory(this.history, focusId, sessionId);
  }

  private findFocusEventIdInHistory(
    history: NeuralRoamHistoryEntry[],
    focusId: string | null,
    sessionId: string | null,
  ): string | null {
    if (!focusId || !sessionId) {
      return null;
    }

    for (let index = history.length - 1; index >= 0; index -= 1) {
      const entry = history[index];
      if (entry.sessionId !== sessionId || entry.nodeId !== focusId) {
        continue;
      }
      if (entry.activationKind === 'focus-root' || entry.activationKind === 'source-root' || entry.associationType === 'focus') {
        return entry.eventId;
      }
    }

    return null;
  }

  private rebuildDisplayPathEventIds(
    displayPath: string[],
    history: NeuralRoamHistoryEntry[],
  ): string[] {
    const remaining = history.map((entry) => entry.eventId);
    const result: string[] = [];

    for (const nodeId of displayPath) {
      const matchIndex = remaining.findIndex((eventId) => {
        const entry = history.find((candidate) => candidate.eventId === eventId);
        return entry?.nodeId === nodeId;
      });
      if (matchIndex >= 0) {
        result.push(remaining.splice(matchIndex, 1)[0]);
      }
    }

    return result;
  }

  private resolveBranchRootNodeId(
    history: NeuralRoamHistoryEntry[],
    currentFocus: string | null,
  ): string | null {
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const entry = history[index];
      if (entry.branchRootNodeId) {
        return entry.branchRootNodeId;
      }
    }
    return currentFocus;
  }

  private createHistoryEntry(
    nodeId: string,
    sessionId: string,
    nodePreview: string,
    meta: ActivateNodeMeta,
  ): NeuralRoamHistoryEntry {
    const eventId = createHistoryEventId();
    const activationKind = meta.activationKind ?? (meta.associationType === 'focus' ? 'focus-root' : 'graph-edge');
    const branchRootNodeId = meta.branchRootNodeId ?? this.branchRootNodeId ?? meta.focusId ?? nodeId;
    return {
      eventId,
      nodeId,
      focusId: meta.focusId,
      sessionId,
      associationType: meta.associationType,
      reason: meta.reason,
      visitedAt: Date.now(),
      isVirtual: meta.isVirtual,
      nodePreview,
      traceQuality: 'exact',
      engineMode: 'orbit',
      sourceRole: activationKind === 'focus-root' ? 'orbit-center' : null,
      origin: meta.origin ?? resolveOrbitOrigin(meta.associationType),
      sourceNodeId: meta.sourceNodeId ?? null,
      sourceEventId: meta.sourceEventId ?? null,
      branchRootNodeId,
      activationKind,
      depth: null,
      conductionScore: null,
    };
  }

  private toTraceStep(entry: NeuralRoamHistoryEntry): NeuralActivationTraceStep {
    return {
      eventId: entry.eventId,
      nodeId: entry.nodeId,
      nodePreview: entry.nodePreview,
      isVirtual: entry.isVirtual,
      associationType: entry.associationType,
      reason: entry.reason,
      activationKind: entry.activationKind,
      visitedAt: entry.visitedAt,
      focusId: entry.focusId,
      engineMode: entry.engineMode,
      sourceRole: entry.sourceRole,
      sourceNodeId: entry.sourceNodeId,
      sourceEventId: entry.sourceEventId,
      branchRootNodeId: entry.branchRootNodeId,
      traceQuality: entry.traceQuality,
      depth: entry.depth,
      conductionScore: entry.conductionScore,
      origin: entry.origin ?? null,
      isSyntheticRoot: false,
    };
  }

  private buildSyntheticRootStep(
    entry: NeuralRoamHistoryEntry,
    forcedNodeId?: string | null,
  ): NeuralActivationTraceStep {
    const nodeId = forcedNodeId ?? entry.sourceNodeId ?? entry.branchRootNodeId ?? entry.focusId ?? entry.nodeId;
    const latest = this.findLatestHistoryEntry(nodeId);
    const nodeState = this.getNodeState(nodeId);
    return {
      eventId: `synthetic-root-${entry.eventId}-${nodeId}`,
      nodeId,
      nodePreview: latest?.nodePreview ?? nodeState?.preview ?? this.compressText(nodeId),
      isVirtual: latest?.isVirtual ?? this.getNodeKind(nodeId) === 'virtual',
      associationType: 'focus',
      reason: this.getReasonText('focus'),
      activationKind: 'focus-root',
      visitedAt: latest?.visitedAt ?? entry.visitedAt,
      focusId: nodeId,
      engineMode: 'orbit',
      sourceRole: 'orbit-center',
      origin: 'source',
      sourceNodeId: null,
      sourceEventId: null,
      branchRootNodeId: nodeId,
      traceQuality: 'exact',
      depth: 0,
      conductionScore: latest?.conductionScore ?? 1,
      isSyntheticRoot: true,
    };
  }
}
