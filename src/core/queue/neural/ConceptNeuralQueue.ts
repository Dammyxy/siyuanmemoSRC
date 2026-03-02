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
  NeuralFocusNodeKind,
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
  currentPathIndex: number;
  navigationMode: NeuralNavigationMode;
  bookmarkPathIndex: number | null;
  history: NeuralRoamHistoryEntry[];
  currentFocus: string | null;
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
}

interface PathItemOptions {
  focusPath?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
  private currentSessionId: string | null = null;
  private visitedBlocks: Set<string> = new Set();
  private exhaustedFocuses: Set<string> = new Set();
  private displayPath: string[] = [];
  private seedPool: Map<string, FocusState> = new Map();
  private anchorPool: Map<string, FocusState> = new Map();
  private history: NeuralRoamHistoryEntry[] = [];
  private navigationMode: NeuralNavigationMode = 'explore';
  private currentPathIndex = -1;
  private bookmarkPathIndex: number | null = null;
  private followCurrentNodeOnce = false;

  private neighborsPerRound = 5;
  private prefetchNeighborCount = 2;
  private prefetchingBlockIds = new Set<string>();
  private historyLimit = 300;
  private previewLength = 28;

  private queryEngine: ConceptQueryEngine;

  constructor() {
    this.queryEngine = new ConceptQueryEngine();
  }

  async getNextCard(): Promise<QueueItem | null> {
    try {
      logger.debug('getNextCard called', {
        navigationMode: this.navigationMode,
        pathLength: this.displayPath.length,
        currentPathIndex: this.currentPathIndex,
        currentSessionId: this.currentSessionId,
      });

      if (this.navigationMode === 'follow') {
        const followCard = await this.getNextCardFromPath();
        if (followCard) {
          return followCard;
        }
        this.navigationMode = 'explore';
      }

      while (true) {
        if (!this.currentFocus || this.shouldRotateFocus()) {
          this.currentFocus = this.selectNextFocus();
          if (!this.currentFocus) {
            logger.debug('No unvisited focus blocks available');
            return null;
          }
        }

        const neighbors = await this.queryEngine.fetchNeighbors(this.currentFocus);
        const unvisitedNeighbors = neighbors.filter((n) => !this.visitedBlocks.has(n.id));

        if (unvisitedNeighbors.length > 0) {
          const selected = this.weightedRandomSelect(unvisitedNeighbors);
          const card = await this.activateNode(selected.id, {
            associationType: selected.type,
            reason: this.getReasonText(selected.type),
            focusId: this.currentFocus,
            isVirtual: this.getNodeKind(selected.id) === 'virtual',
          });

          if (!card) {
            this.visitedBlocks.add(selected.id);
            continue;
          }

          const focusState = this.seedPool.get(this.currentFocus);
          if (focusState) {
            focusState.neighborsViewed += 1;
          }

          this.prefetchLikelyNextNeighborBlocks(unvisitedNeighbors, selected.id);
          return card;
        }

        if (!this.visitedBlocks.has(this.currentFocus)) {
          const currentFocusKind = this.getNodeKind(this.currentFocus);
          const focusCard = await this.activateNode(this.currentFocus, {
            associationType: 'focus',
            reason: this.getReasonText('focus'),
            focusId: this.currentFocus,
            isVirtual: currentFocusKind === 'virtual',
          });
          if (focusCard) {
            return focusCard;
          }
          this.currentFocus = null;
          continue;
        }

        this.exhaustedFocuses.add(this.currentFocus);
        this.rotateFocus();
      }
    } catch (error) {
      logger.error('Error in getNextCard', error);
      return null;
    }
  }

  async addConceptBlock(blockId: string, priority: 'normal' | 'high' = 'normal'): Promise<void> {
    const isConcept = await this.queryEngine.isConceptCard(blockId);
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
    this.seedPool.delete(blockId);
    this.exhaustedFocuses.delete(blockId);
    if (this.currentFocus === blockId) {
      this.currentFocus = null;
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
    await this.setAnchorEntryInternal(nodeId, enabled);
  }

  async clearAnchors(): Promise<void> {
    this.anchorPool.clear();
    if (this.currentFocus && !this.seedPool.has(this.currentFocus)) {
      this.currentFocus = null;
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
          nodeId: entry.nodeId,
          focusId: entry.nodeId,
          sessionId: latest?.sessionId ?? this.currentSessionId ?? 'focus-pool',
          associationType: 'focus',
          reason: this.getReasonText('focus'),
          visitedAt: entry.visitedAt,
          isVirtual: entry.isVirtual,
          nodePreview: entry.nodePreview,
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
    const isConcept = await this.queryEngine.isConceptCard(focusId);
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
    this.navigationMode = 'explore';
    this.followCurrentNodeOnce = false;
    this.exhaustedFocuses.delete(focusId);

    if (options.includeFocusAsFirst) {
      const card = await this.activateNode(focusId, {
        associationType: 'focus',
        reason: this.getReasonText('focus'),
        focusId,
        isVirtual: !isConcept,
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
    const target = this.findLatestHistoryEntry(nodeId);
    if (target) {
      const pathForSession = this.buildPathForSession(target.sessionId);
      const previousPathIndex = this.currentPathIndex;

      if (pathForSession.length > 0) {
        this.displayPath = pathForSession;
        this.currentPathIndex = pathForSession.lastIndexOf(nodeId);
        this.currentSessionId = target.sessionId;
        this.currentFocus = target.focusId ?? this.currentFocus;
        this.visitedBlocks = new Set(pathForSession);
      } else {
        const targetIndex = this.findLatestPathIndex(nodeId);
        if (targetIndex >= 0) {
          this.currentPathIndex = targetIndex;
          this.currentSessionId = target.sessionId;
          this.currentFocus = target.focusId ?? this.currentFocus;
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
      navigationMode: this.navigationMode,
      hasBookmark: this.bookmarkPathIndex !== null,
      pathLength: this.displayPath.length,
      sessionId: this.currentSessionId,
    };
  }

  setNavigationMode(mode: NeuralNavigationMode): void {
    this.navigationMode = mode;
  }

  returnToBookmark(): boolean {
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

    if (options.focusPath !== false) {
      const targetIndex = this.findLatestPathIndex(blockId);
      if (targetIndex >= 0) {
        if (this.currentPathIndex >= 0 && this.currentPathIndex !== targetIndex) {
          this.bookmarkPathIndex = this.currentPathIndex;
        }
        this.currentPathIndex = targetIndex;
        this.navigationMode = 'follow';
        this.followCurrentNodeOnce = false;
      }
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
      currentPathIndex: this.currentPathIndex,
      navigationMode: this.navigationMode,
      bookmarkPathIndex: this.bookmarkPathIndex,
      history: this.getHistorySnapshot(),
      currentFocus: this.currentFocus,
      currentSessionId: this.currentSessionId,
      visitedBlocks: Array.from(this.visitedBlocks),
      exhaustedFocuses: Array.from(this.exhaustedFocuses),
    };
  }

  restoreSessionState(state: Partial<ConceptNeuralSessionState> | null | undefined): void {
    if (!isRecord(state)) {
      this.resetNavigationState();
      return;
    }

    const displayPath = Array.isArray(state.displayPath)
      ? state.displayPath.map((id) => String(id)).filter(Boolean)
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
          .map((entry) => this.normalizeHistoryEntry(entry))
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
        ...(entry as Record<string, unknown>),
        nodeKind: normalizeNodeKind((entry as Record<string, unknown>).nodeKind) === 'concept'
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

    this.displayPath = displayPath;
    this.currentPathIndex = currentPathIndex;
    this.navigationMode = navigationMode;
    this.bookmarkPathIndex = bookmarkPathIndex;
    this.history = history.slice(-this.historyLimit);
    this.currentFocus = typeof state.currentFocus === 'string' && state.currentFocus ? state.currentFocus : null;
    this.currentSessionId = typeof state.currentSessionId === 'string' && state.currentSessionId
      ? state.currentSessionId
      : this.resolveLatestSessionId(this.history);
    this.visitedBlocks = visitedBlocks;
    this.exhaustedFocuses = exhaustedFocuses;
    this.followCurrentNodeOnce = false;
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
      }
      return;
    }

    const existing = this.seedPool.get(nodeId);
    const isConcept = options.preferredKind
      ? options.preferredKind === 'concept'
      : await this.queryEngine.isConceptCard(nodeId);
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
      }
      return;
    }

    const existing = this.anchorPool.get(nodeId);
    const isConcept = options.preferredKind
      ? options.preferredKind === 'concept'
      : await this.queryEngine.isConceptCard(nodeId);
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

  private getNodeKind(nodeId: string): NeuralFocusNodeKind {
    if (this.seedPool.has(nodeId)) {
      return 'concept';
    }
    return this.anchorPool.get(nodeId)?.nodeKind ?? 'virtual';
  }

  private async getNextCardFromPath(): Promise<QueueItem | null> {
    if (this.followCurrentNodeOnce) {
      this.followCurrentNodeOnce = false;
      const currentNodeId = this.getCurrentPathNodeId();
      if (currentNodeId) {
        const currentCard = await this.getPathItemByNodeId(currentNodeId, { focusPath: false });
        if (currentCard) {
          return currentCard;
        }
      }
    }

    const nextIndex = this.currentPathIndex + 1;
    if (nextIndex < 0 || nextIndex >= this.displayPath.length) {
      return null;
    }

    const nodeId = this.displayPath[nextIndex];
    const card = await this.getPathItemByNodeId(nodeId, { focusPath: false });
    if (!card) {
      return null;
    }

    this.currentPathIndex = nextIndex;
    return card;
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
    }

    this.displayPath.push(nodeId);
    this.currentPathIndex = this.displayPath.length - 1;
    this.navigationMode = 'explore';
    this.bookmarkPathIndex = null;
    this.followCurrentNodeOnce = false;
    this.visitedBlocks.add(nodeId);

    const nodePreview = this.compressText(blockData.content || nodeId);
    this.history.push({
      nodeId,
      focusId: meta.focusId,
      sessionId: this.currentSessionId,
      associationType: meta.associationType,
      reason: meta.reason,
      visitedAt: Date.now(),
      isVirtual: meta.isVirtual,
      nodePreview,
    });
    if (this.history.length > this.historyLimit) {
      this.history.splice(0, this.history.length - this.historyLimit);
    }

    return this.buildQueueItem(blockData, meta.associationType, meta.reason);
  }

  private shouldRotateFocus(): boolean {
    if (!this.currentFocus) return true;

    const focusState = this.seedPool.get(this.currentFocus);
    // Manually selected non-seed current focus can still do one-hop spreading activation.
    if (!focusState) return false;

    return focusState.neighborsViewed >= this.neighborsPerRound;
  }

  private rotateFocus(): void {
    if (this.currentFocus) {
      const focusState = this.seedPool.get(this.currentFocus);
      if (focusState) {
        focusState.neighborsViewed = 0;
      }
    }
    this.currentFocus = null;
  }

  private selectNextFocus(): string | null {
    const candidateFocuses = Array.from(this.seedPool.entries())
      .filter(([id]) => !this.exhaustedFocuses.has(id))
      .map(([id, state]) => ({ id, ...state }));

    if (candidateFocuses.length === 0) {
      return null;
    }

    return this.weightedRandomSelectFocus(candidateFocuses);
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

  private prefetchLikelyNextNeighborBlocks(neighbors: Neighbor[], selectedId: string): void {
    const candidateIds = neighbors
      .filter((neighbor) => neighbor.id !== selectedId && !this.visitedBlocks.has(neighbor.id))
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

  private normalizeHistoryEntry(entry: unknown): NeuralRoamHistoryEntry | null {
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

    return {
      nodeId,
      focusId,
      sessionId,
      associationType,
      reason,
      visitedAt: Number.isFinite(visitedAt) ? visitedAt : Date.now(),
      isVirtual,
      nodePreview,
    };
  }

  private getCurrentPathNodeId(): string | null {
    if (this.currentPathIndex < 0 || this.currentPathIndex >= this.displayPath.length) {
      return null;
    }
    return this.displayPath[this.currentPathIndex];
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
    };
  }

  private buildPathForSession(sessionId: string): string[] {
    const path: string[] = [];
    for (const entry of this.history) {
      if (entry.sessionId !== sessionId) {
        continue;
      }
      if (path[path.length - 1] !== entry.nodeId) {
        path.push(entry.nodeId);
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
    this.visitedBlocks.clear();
    this.exhaustedFocuses.clear();
    this.displayPath = [];
    this.currentFocus = null;
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
}
