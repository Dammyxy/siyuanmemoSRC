/**
 * Concept neural roam queue (focus-first model).
 *
 * Responsibilities:
 * - Concept pool management (persistent)
 * - Session focus stack and roam history
 * - Navigation state (explore/follow + bookmark return)
 * - Session boundary tracking with sessionId
 */

import { ConceptQueryEngine, type Neighbor, type BlockData } from './ConceptQueryEngine';
import type {
  NeuralNavigationMode,
  NeuralNavigationState,
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
  priority: number;
  neighborsViewed: number;
  addedAt: number;
  preview: string;
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
  pinnedFocusBlocks: string[];
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

export class ConceptNeuralQueue {
  private currentFocus: string | null = null;
  private currentSessionId: string | null = null;
  private visitedBlocks: Set<string> = new Set();
  private exhaustedFocuses: Set<string> = new Set();
  private displayPath: string[] = [];
  private conceptPool: Map<string, FocusState> = new Map();
  private pinnedFocusBlocks: Set<string> = new Set();
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
            isVirtual: !this.conceptPool.has(selected.id),
          });

          if (!card) {
            this.visitedBlocks.add(selected.id);
            continue;
          }

          const focusState = this.conceptPool.get(this.currentFocus);
          if (focusState) {
            focusState.neighborsViewed += 1;
          }

          this.prefetchLikelyNextNeighborBlocks(unvisitedNeighbors, selected.id);
          return card;
        }

        if (!this.visitedBlocks.has(this.currentFocus)) {
          const focusCard = await this.activateNode(this.currentFocus, {
            associationType: 'focus',
            reason: this.getReasonText('focus'),
            focusId: this.currentFocus,
            isVirtual: false,
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

    const blockData = await this.queryEngine.fetchBlockData(blockId);
    const preview = this.compressText(blockData?.content || blockId);
    const priorityValue = priority === 'high' ? 0.9 : 0.5;

    this.conceptPool.set(blockId, {
      blockId,
      priority: priorityValue,
      neighborsViewed: 0,
      addedAt: Date.now(),
      preview,
    });
    this.exhaustedFocuses.delete(blockId);
  }

  removeConceptBlock(blockId: string): void {
    this.conceptPool.delete(blockId);
    this.pinnedFocusBlocks.delete(blockId);
    this.exhaustedFocuses.delete(blockId);
    if (this.currentFocus === blockId) {
      this.currentFocus = null;
    }
  }

  getConceptBlocks(): string[] {
    return Array.from(this.conceptPool.keys());
  }

  restoreConceptBlocks(blockIds: string[]): void {
    this.conceptPool.clear();
    this.pinnedFocusBlocks.clear();
    this.exhaustedFocuses.clear();

    for (const blockId of blockIds) {
      this.conceptPool.set(blockId, {
        blockId,
        priority: 0.5,
        neighborsViewed: 0,
        addedAt: Date.now(),
        preview: this.compressText(blockId),
      });
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

  getPinnedFocusBlocks(): NeuralRoamHistoryEntry[] {
    const entries = Array.from(this.pinnedFocusBlocks)
      .map((blockId) => {
        const latest = this.findLatestHistoryEntry(blockId);
        const focusState = this.conceptPool.get(blockId);
        const visitedAt = latest?.visitedAt ?? focusState?.addedAt ?? Date.now();
        return {
          nodeId: blockId,
          focusId: blockId,
          sessionId: latest?.sessionId ?? this.currentSessionId ?? 'pinned',
          associationType: latest?.associationType ?? 'focus',
          reason: latest?.reason ?? this.getReasonText('focus'),
          visitedAt,
          isVirtual: false,
          nodePreview: latest?.nodePreview ?? focusState?.preview ?? this.compressText(blockId),
        } satisfies NeuralRoamHistoryEntry;
      })
      .sort((a, b) => b.visitedAt - a.visitedAt);

    return entries;
  }

  async setPinnedFocusBlock(blockId: string, pinned = true): Promise<void> {
    if (!pinned) {
      this.pinnedFocusBlocks.delete(blockId);
      return;
    }

    const isConcept = await this.queryEngine.isConceptCard(blockId);
    if (!isConcept) {
      // Virtual focus cannot be persisted.
      return;
    }

    if (!this.conceptPool.has(blockId)) {
      await this.addConceptBlock(blockId, 'high');
    }
    this.pinnedFocusBlocks.add(blockId);
  }

  async startRoamingFromFocus(
    focusId: string,
    options: {
      includeFocusAsFirst?: boolean;
      resetHistory?: boolean;
    } = {}
  ): Promise<void> {
    const isConcept = await this.queryEngine.isConceptCard(focusId);
    if (isConcept && !this.conceptPool.has(focusId)) {
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
      isVirtual: !this.conceptPool.has(nodeId),
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
    return this.conceptPool.size;
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
      ?? (this.conceptPool.has(blockId) ? 'focus' : 'path');
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
      pinnedFocusBlocks: Array.from(this.pinnedFocusBlocks),
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
    const pinnedFocusBlocks = Array.isArray(state.pinnedFocusBlocks)
      ? new Set(state.pinnedFocusBlocks.map((id) => String(id)).filter(Boolean))
      : new Set<string>();

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
    this.pinnedFocusBlocks = pinnedFocusBlocks;
    this.followCurrentNodeOnce = false;
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

    const focusState = this.conceptPool.get(this.currentFocus);
    // Virtual focus nodes are session-only and should still support spreading activation.
    if (!focusState) return false;

    return focusState.neighborsViewed >= this.neighborsPerRound;
  }

  private rotateFocus(): void {
    if (this.currentFocus) {
      const focusState = this.conceptPool.get(this.currentFocus);
      if (focusState) {
        focusState.neighborsViewed = 0;
      }
    }
    this.currentFocus = null;
  }

  private selectNextFocus(): string | null {
    const candidateFocuses = Array.from(this.conceptPool.entries())
      .filter(([id]) => !this.exhaustedFocuses.has(id))
      .map(([id, state]) => ({ id, ...state }));

    if (candidateFocuses.length === 0) {
      return null;
    }

    return this.weightedRandomSelectFocus(candidateFocuses);
  }

  private weightedRandomSelectFocus(focuses: Array<FocusState & { id: string }>): string {
    const totalWeight = focuses.reduce((sum, focus) => sum + focus.priority, 0);
    let random = Math.random() * totalWeight;

    for (const focus of focuses) {
      random -= focus.priority;
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
    const focusState = this.conceptPool.get(focusNodeId);
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
      isVirtual: !this.conceptPool.has(focusNodeId),
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

    for (const focus of this.conceptPool.values()) {
      focus.neighborsViewed = 0;
    }
  }
}
