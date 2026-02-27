/**
 * 概念卡神经漫游队列
 *
 * 负责神经漫游会话状态：
 * - 种子管理
 * - 路径与历史
 * - 导航模式（explore/follow）
 * - 书签返回
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

interface SeedState {
  blockId: string;
  priority: number;
  neighborsViewed: number;
  addedAt: number;
}

export interface ConceptNeuralSessionState {
  displayPath: string[];
  currentPathIndex: number;
  navigationMode: NeuralNavigationMode;
  bookmarkPathIndex: number | null;
  history: NeuralRoamHistoryEntry[];
  currentSeed: string | null;
  visitedBlocks: string[];
  exhaustedSeeds: string[];
}

interface ActivateNodeMeta {
  associationType: string;
  reason: string;
  seedId: string | null;
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

export class ConceptNeuralQueue {
  private currentSeed: string | null = null;
  private visitedBlocks: Set<string> = new Set();
  private exhaustedSeeds: Set<string> = new Set();
  private displayPath: string[] = [];
  private seeds: Map<string, SeedState> = new Map();
  private history: NeuralRoamHistoryEntry[] = [];
  private navigationMode: NeuralNavigationMode = 'explore';
  private currentPathIndex = -1;
  private bookmarkPathIndex: number | null = null;

  private neighborsPerRound = 5;
  private prefetchNeighborCount = 2;
  private prefetchingBlockIds = new Set<string>();
  private historyLimit = 300;

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
      });

      if (this.navigationMode === 'follow') {
        const followCard = await this.getNextCardFromPath();
        if (followCard) {
          return followCard;
        }
        this.navigationMode = 'explore';
      }

      while (true) {
        if (!this.currentSeed || this.shouldRotateSeed()) {
          this.currentSeed = this.selectNextSeed();
          if (!this.currentSeed) {
            logger.debug('No unvisited seeds available');
            return null;
          }
        }

        const neighbors = await this.queryEngine.fetchNeighbors(this.currentSeed);
        const unvisitedNeighbors = neighbors.filter((n) => !this.visitedBlocks.has(n.id));

        if (unvisitedNeighbors.length > 0) {
          const selected = this.weightedRandomSelect(unvisitedNeighbors);
          const card = await this.activateNode(selected.id, {
            associationType: selected.type,
            reason: this.getReasonText(selected.type),
            seedId: this.currentSeed,
          });

          if (!card) {
            this.visitedBlocks.add(selected.id);
            continue;
          }

          const seedState = this.seeds.get(this.currentSeed);
          if (seedState) {
            seedState.neighborsViewed += 1;
          }

          this.prefetchLikelyNextNeighborBlocks(unvisitedNeighbors, selected.id);
          return card;
        }

        if (!this.visitedBlocks.has(this.currentSeed)) {
          const seedCard = await this.activateNode(this.currentSeed, {
            associationType: 'seed',
            reason: '种子节点',
            seedId: this.currentSeed,
          });
          if (seedCard) {
            return seedCard;
          }
          this.currentSeed = null;
          continue;
        }

        this.exhaustedSeeds.add(this.currentSeed);
        this.rotateSeed();
      }
    } catch (error) {
      logger.error('Error in getNextCard', error);
      return null;
    }
  }

  async addSeed(blockId: string, priority: 'normal' | 'high' = 'normal'): Promise<void> {
    const isConcept = await this.queryEngine.isConceptCard(blockId);
    if (!isConcept) {
      throw new Error(`Block ${blockId} is not a concept card`);
    }

    const priorityValue = priority === 'high' ? 0.9 : 0.5;
    this.seeds.set(blockId, {
      blockId,
      priority: priorityValue,
      neighborsViewed: 0,
      addedAt: Date.now(),
    });
    this.exhaustedSeeds.delete(blockId);
  }

  removeSeed(blockId: string): void {
    this.seeds.delete(blockId);
    this.exhaustedSeeds.delete(blockId);
    if (this.currentSeed === blockId) {
      this.currentSeed = null;
    }
  }

  getSeeds(): string[] {
    return Array.from(this.seeds.keys());
  }

  restoreSeeds(seedIds: string[]): void {
    this.seeds.clear();
    this.exhaustedSeeds.clear();
    for (const seedId of seedIds) {
      this.seeds.set(seedId, {
        blockId: seedId,
        priority: 0.5,
        neighborsViewed: 0,
        addedAt: Date.now(),
      });
    }
  }

  async startRoamingFromSeed(
    seedId: string,
    options: {
      includeSeedAsFirst?: boolean;
      resetHistory?: boolean;
    } = {}
  ): Promise<void> {
    if (!this.seeds.has(seedId)) {
      await this.addSeed(seedId, 'normal');
    }

    if (options.resetHistory) {
      this.clearHistory();
    }

    this.currentSeed = seedId;
    this.navigationMode = 'explore';

    if (options.includeSeedAsFirst) {
      const card = await this.activateNode(seedId, {
        associationType: 'seed',
        reason: '种子节点',
        seedId,
      });
      if (!card) {
        throw new Error(`Failed to start roaming from seed ${seedId}`);
      }
      return;
    }

    const latestIndex = this.findLatestPathIndex(seedId);
    if (latestIndex >= 0) {
      this.currentPathIndex = latestIndex;
    }
  }

  clearHistory(): void {
    this.visitedBlocks.clear();
    this.exhaustedSeeds.clear();
    this.displayPath = [];
    this.history = [];
    this.currentSeed = null;
    this.currentPathIndex = -1;
    this.bookmarkPathIndex = null;
    this.navigationMode = 'explore';

    for (const seed of this.seeds.values()) {
      seed.neighborsViewed = 0;
    }
  }

  size(): number {
    const unvisitedSeeds = Array.from(this.seeds.keys()).filter(
      (id) => !this.visitedBlocks.has(id)
    );
    return unvisitedSeeds.length;
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
      ?? (this.seeds.has(blockId) ? 'seed' : 'path');
    const reason = latestHistory?.reason
      ?? (associationType === 'seed' ? '种子节点' : '路径节点');

    if (options.focusPath !== false) {
      const targetIndex = this.findLatestPathIndex(blockId);
      if (targetIndex >= 0) {
        if (this.currentPathIndex >= 0 && this.currentPathIndex !== targetIndex) {
          this.bookmarkPathIndex = this.currentPathIndex;
        }
        this.currentPathIndex = targetIndex;
        this.navigationMode = 'follow';
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
      currentSeed: this.currentSeed,
      visitedBlocks: Array.from(this.visitedBlocks),
      exhaustedSeeds: Array.from(this.exhaustedSeeds),
    };
  }

  restoreSessionState(state: Partial<ConceptNeuralSessionState> | null | undefined): void {
    if (!isRecord(state)) {
      this.clearHistory();
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
    const exhaustedSeeds = Array.isArray(state.exhaustedSeeds)
      ? new Set(state.exhaustedSeeds.map((id) => String(id)).filter(Boolean))
      : new Set<string>();

    this.displayPath = displayPath;
    this.currentPathIndex = currentPathIndex;
    this.navigationMode = navigationMode;
    this.bookmarkPathIndex = bookmarkPathIndex;
    this.history = history.slice(-this.historyLimit);
    this.currentSeed = typeof state.currentSeed === 'string' && state.currentSeed ? state.currentSeed : null;
    this.visitedBlocks = visitedBlocks;
    this.exhaustedSeeds = exhaustedSeeds;
  }

  private async getNextCardFromPath(): Promise<QueueItem | null> {
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

    if (this.currentPathIndex >= 0 && this.currentPathIndex < this.displayPath.length - 1) {
      this.displayPath = this.displayPath.slice(0, this.currentPathIndex + 1);
    }

    this.displayPath.push(nodeId);
    this.currentPathIndex = this.displayPath.length - 1;
    this.navigationMode = 'explore';
    this.bookmarkPathIndex = null;
    this.visitedBlocks.add(nodeId);

    this.history.push({
      nodeId,
      seedId: meta.seedId,
      associationType: meta.associationType,
      reason: meta.reason,
      visitedAt: Date.now(),
    });
    if (this.history.length > this.historyLimit) {
      this.history.splice(0, this.history.length - this.historyLimit);
    }

    return this.buildQueueItem(blockData, meta.associationType, meta.reason);
  }

  private shouldRotateSeed(): boolean {
    if (!this.currentSeed) return true;

    const seedState = this.seeds.get(this.currentSeed);
    if (!seedState) return true;

    return seedState.neighborsViewed >= this.neighborsPerRound;
  }

  private rotateSeed(): void {
    if (this.currentSeed) {
      const seedState = this.seeds.get(this.currentSeed);
      if (seedState) {
        seedState.neighborsViewed = 0;
      }
    }
    this.currentSeed = null;
  }

  private selectNextSeed(): string | null {
    const candidateSeeds = Array.from(this.seeds.entries())
      .filter(([id]) => !this.exhaustedSeeds.has(id))
      .map(([id, state]) => ({ id, ...state }));

    if (candidateSeeds.length === 0) {
      return null;
    }

    return this.weightedRandomSelectSeed(candidateSeeds);
  }

  private weightedRandomSelectSeed(seeds: Array<SeedState & { id: string }>): string {
    const totalWeight = seeds.reduce((sum, seed) => sum + seed.priority, 0);
    let random = Math.random() * totalWeight;

    for (const seed of seeds) {
      random -= seed.priority;
      if (random <= 0) {
        return seed.id;
      }
    }

    return seeds[seeds.length - 1].id;
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
      seed: '种子节点',
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

    const seedId = typeof entry.seedId === 'string' && entry.seedId ? entry.seedId : null;
    const associationType = typeof entry.associationType === 'string'
      ? entry.associationType
      : (seedId ? 'seed' : 'path');
    const reason = typeof entry.reason === 'string'
      ? entry.reason
      : this.getReasonText(associationType);
    const visitedAt = Number(entry.visitedAt);

    return {
      nodeId,
      seedId,
      associationType,
      reason,
      visitedAt: Number.isFinite(visitedAt) ? visitedAt : Date.now(),
    };
  }

  private getCurrentPathNodeId(): string | null {
    if (this.currentPathIndex < 0 || this.currentPathIndex >= this.displayPath.length) {
      return null;
    }
    return this.displayPath[this.currentPathIndex];
  }
}

