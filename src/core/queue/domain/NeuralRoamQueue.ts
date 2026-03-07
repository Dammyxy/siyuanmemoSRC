/**
 * Neural Roam Queue
 */

import { BaseReviewQueue } from './BaseReviewQueue';
import {
  QueueAddSource,
  QueueType,
  type NeuralRoamAnchorEntry,
  type NeuralNavigationMode,
  type NeuralNavigationState,
  type NeuralRoamFocusEntry,
  type NeuralRoamHistoryEntry,
  type QueueReviewResult,
  type NeuralRoamSeedEntry,
} from '../../../types/unified-data-source';
import { FSRSCard } from '../../../types/card';
import type { QueueItem as ReviewQueueItem } from '../types';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';
import type { NeuralRoamCardTypeResolverPort, QueuePersistencePort } from './ports';
import { loadQueueState, saveQueueState } from './queuePersistence';
import {
  ConceptNeuralQueue,
  type ConceptNeuralSessionState,
  type FocusPoolPersistedEntry,
  type QueueItem as ConceptQueueItem,
} from '../neural/ConceptNeuralQueue';
import { resolveCardId } from '../../../diagnostics/type-guards';
import { createLogger } from '@/utils/logger';

const logger = createLogger('NeuralRoamQueue');

interface NeuralRoamPersistedStateV3 {
  version: 3;
  conceptBlocks: string[];
  session: ConceptNeuralSessionState;
}

interface NeuralRoamPersistedStateV4 {
  version: 4;
  focusPool: FocusPoolPersistedEntry[];
  session: ConceptNeuralSessionState;
}

interface NeuralRoamPersistedStateV5 {
  version: 5;
  seedPool: FocusPoolPersistedEntry[];
  anchorPool: FocusPoolPersistedEntry[];
  session: ConceptNeuralSessionState;
}

interface NeuralRoamQueueOptions {
  cardTypeResolver?: NeuralRoamCardTypeResolverPort;
}

type LocalConceptStatus = 'concept' | 'non-concept' | 'unknown';
type CachedCardType = {
  value: 'item' | 'topic';
  expiresAt: number;
};

const DEFAULT_CARD_TYPE_RESOLVER: NeuralRoamCardTypeResolverPort = {
  async resolveCardType(): Promise<'item' | 'topic'> {
    return 'topic';
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNeuralRoamPersistedStateV3(value: unknown): value is NeuralRoamPersistedStateV3 {
  if (!isRecord(value)) {
    return false;
  }
  return Number(value.version) === 3
    && Array.isArray(value.conceptBlocks)
    && isRecord(value.session);
}

function isNeuralRoamPersistedStateV4(value: unknown): value is NeuralRoamPersistedStateV4 {
  if (!isRecord(value)) {
    return false;
  }
  return Number(value.version) === 4
    && Array.isArray(value.focusPool)
    && isRecord(value.session);
}

function isNeuralRoamPersistedStateV5(value: unknown): value is NeuralRoamPersistedStateV5 {
  if (!isRecord(value)) {
    return false;
  }
  return Number(value.version) === 5
    && Array.isArray(value.seedPool)
    && Array.isArray(value.anchorPool)
    && isRecord(value.session);
}

function mergeLegacyFocusPool(
  conceptBlocks: string[],
  session: ConceptNeuralSessionState
): FocusPoolPersistedEntry[] {
  const map = new Map<string, FocusPoolPersistedEntry>();
  const now = Date.now();

  for (const blockId of conceptBlocks) {
    const id = String(blockId || '').trim();
    if (!id) continue;
    map.set(id, {
      nodeId: id,
      nodeKind: 'concept',
      priority: 0.65,
      neighborsViewed: 0,
      addedAt: now,
      nodePreview: id,
    });
  }

  const sessionFocusPool = Array.isArray(session.focusPool) ? session.focusPool : [];
  for (const entry of sessionFocusPool) {
    if (!entry || typeof entry.nodeId !== 'string') {
      continue;
    }
    const id = entry.nodeId.trim();
    if (!id) continue;
    map.set(id, {
      nodeId: id,
      nodeKind: entry.nodeKind === 'virtual' ? 'virtual' : 'concept',
      priority: Number.isFinite(entry.priority) ? entry.priority : 0.65,
      neighborsViewed: Number.isFinite(entry.neighborsViewed) ? entry.neighborsViewed : 0,
      addedAt: Number.isFinite(entry.addedAt) ? entry.addedAt : now,
      nodePreview: typeof entry.nodePreview === 'string' ? entry.nodePreview : id,
    });
  }

  const legacyPinned = Array.isArray(session.pinnedFocusBlocks) ? session.pinnedFocusBlocks : [];
  for (const blockId of legacyPinned) {
    const id = String(blockId || '').trim();
    if (!id) continue;
    const existing = map.get(id);
    map.set(id, {
      nodeId: id,
      nodeKind: existing?.nodeKind ?? 'concept',
      priority: existing?.priority ?? 0.9,
      neighborsViewed: existing?.neighborsViewed ?? 0,
      addedAt: existing?.addedAt ?? now,
      nodePreview: existing?.nodePreview ?? id,
    });
  }

  return Array.from(map.values());
}

function splitFocusPoolToSeedAndAnchor(
  entries: FocusPoolPersistedEntry[]
): { seedPool: FocusPoolPersistedEntry[]; anchorPool: FocusPoolPersistedEntry[] } {
  const seedPool = entries.filter((entry) => entry.nodeKind === 'concept');
  const anchorPool = entries.filter((entry) => entry.nodeKind !== 'concept');
  return { seedPool, anchorPool };
}

export class NeuralRoamQueue extends BaseReviewQueue {
  public name = 'NeuralRoamQueue';

  private readonly conceptQueue: ConceptNeuralQueue;
  private readonly STORAGE_KEY = 'neuralRoamQueue';
  private readonly queuePersistence: QueuePersistencePort;
  private readonly cardTypeResolver: NeuralRoamCardTypeResolverPort;
  private readonly cardTypeCache = new Map<string, CachedCardType>();
  private readonly cardTypeCacheTtlMs = 60_000;
  private readonly maxCardTypeCacheSize = 256;

  constructor(
    manager: UnifiedDataSourceManager,
    queuePersistence: QueuePersistencePort,
    options: NeuralRoamQueueOptions = {}
  ) {
    super(manager, QueueType.NeuralRoam);
    this.queuePersistence = queuePersistence;
    this.cardTypeResolver = options.cardTypeResolver ?? DEFAULT_CARD_TYPE_RESOLVER;
    this.conceptQueue = new ConceptNeuralQueue({
      isConceptCard: async (blockId: string) => {
        const conceptStatus = await this.resolveConceptStatusFromLocalCards(blockId);
        if (conceptStatus === 'unknown') {
          throw new Error(`Local concept status unavailable for block ${blockId}`);
        }
        return conceptStatus === 'concept';
      },
    });
  }

  async load(): Promise<void> {
    const { value: rawState, fromStorage } = loadQueueState<unknown>({
      persistence: this.queuePersistence,
      key: this.STORAGE_KEY,
      initialValue: null,
      validate: (_value: unknown): _value is unknown => true,
      logger,
      context: 'NeuralRoamQueue',
    });

    if (!rawState) {
      logger.info('No saved neural roam state found');
      return;
    }

    let persistRequired = false;

    if (isNeuralRoamPersistedStateV5(rawState)) {
      this.conceptQueue.restoreSeedPoolState(rawState.seedPool);
      this.conceptQueue.restoreAnchorPoolState(rawState.anchorPool);
      this.conceptQueue.restoreSessionState(rawState.session);
      if (fromStorage) {
        logger.info(`Loaded neural roam state (v5), seedPool=${rawState.seedPool.length}, anchorPool=${rawState.anchorPool.length}`);
      }
    } else if (isNeuralRoamPersistedStateV4(rawState)) {
      const { seedPool, anchorPool } = splitFocusPoolToSeedAndAnchor(rawState.focusPool);
      this.conceptQueue.restoreSeedPoolState(seedPool);
      this.conceptQueue.restoreAnchorPoolState(anchorPool);
      this.conceptQueue.restoreSessionState({
        ...rawState.session,
        seedPool,
        anchorPool,
      });
      if (fromStorage) {
        logger.info(`Migrated neural roam state v4->v5, seedPool=${seedPool.length}, anchorPool=${anchorPool.length}`);
      }
      persistRequired = true;
    } else if (isNeuralRoamPersistedStateV3(rawState)) {
      const mergedFocusPool = mergeLegacyFocusPool(rawState.conceptBlocks, rawState.session);
      const { seedPool, anchorPool } = splitFocusPoolToSeedAndAnchor(mergedFocusPool);
      this.conceptQueue.restoreSeedPoolState(seedPool);
      this.conceptQueue.restoreAnchorPoolState(anchorPool);
      this.conceptQueue.restoreSessionState({
        ...rawState.session,
        seedPool,
        anchorPool,
      });
      if (fromStorage) {
        logger.info(`Migrated neural roam state v3->v5, seedPool=${seedPool.length}, anchorPool=${anchorPool.length}`);
      }
      persistRequired = true;
    } else {
      // Hard-cut migration strategy: reset legacy/v2 state silently to v5 schema.
      logger.info('Legacy neural roam state detected, reset to v5 schema');
      this.conceptQueue.restoreSeedPoolState([]);
      this.conceptQueue.restoreAnchorPoolState([]);
      this.conceptQueue.restoreSessionState(null);
      this.conceptQueue.clearHistory('all');
      persistRequired = true;
    }

    const normalization = await this.conceptQueue.normalizeSeedPoolToConceptCards({
      validationErrorPolicy: 'keep',
    });
    if (normalization.changed) {
      persistRequired = true;
      logger.info(`Normalized neural roam seed pool after load, removed=${normalization.removedNodeIds.length}`, {
        removedNodeIds: normalization.removedNodeIds,
      });
    }

    if (persistRequired) {
      await this.save();
    }
  }

  async save(): Promise<void> {
    const data: NeuralRoamPersistedStateV5 = {
      version: 5,
      seedPool: this.conceptQueue.exportSeedPoolState(),
      anchorPool: this.conceptQueue.exportAnchorPoolState(),
      session: this.conceptQueue.exportSessionState(),
    };

    await saveQueueState({
      persistence: this.queuePersistence,
      key: this.STORAGE_KEY,
      value: data,
      logger,
      context: 'NeuralRoamQueue',
    });
  }

  public isDynamic(): boolean {
    return false;
  }

  public async getCards(): Promise<FSRSCard[]> {
    await this.ensureInitialLoad();
    const nodeIds = this.conceptQueue.getSessionVisibleNodeIds(80);
    if (nodeIds.length === 0) {
      return [];
    }

    const cards = await Promise.all(
      nodeIds.map(async (nodeId) => {
        const queueItem = await this.conceptQueue.getPathItemByNodeId(nodeId, { focusPath: false });
        if (!queueItem) {
          return null;
        }
        return this.convertToFSRSCard(queueItem);
      })
    );

    return this.cacheResolvedCards(cards.filter((card): card is FSRSCard => Boolean(card)), 'reconciled');
  }

  public async addCard(
    card: FSRSCard | ReviewQueueItem | string,
    priorityOrSource: 'normal' | 'high' | QueueAddSource = 'normal',
  ): Promise<void> {
    await this.ensureInitialLoad();
    const { blockId, conceptHint } = this.resolveAddTarget(card);
    if (!blockId) {
      throw new Error('Invalid card or block ID');
    }

    const priority = priorityOrSource === 'high'
      ? 'high'
      : 'normal';

    let skipConceptValidation = conceptHint;
    if (!skipConceptValidation) {
      const conceptStatus = await this.resolveConceptStatusFromLocalCards(blockId);
      if (conceptStatus === 'unknown') {
        throw new Error(`Failed to validate concept card ${blockId} from local storage`);
      }
      if (conceptStatus !== 'concept') {
        throw new Error(`Block ${blockId} is not a concept card`);
      }
      skipConceptValidation = true;
    }

    await this.conceptQueue.addConceptBlock(blockId, priority, {
      // Skip duplicate validation after local concept check.
      skipConceptValidation,
    });
    await this.save();
  }

  public async removeCard(cardIdOrBlockId: string): Promise<void> {
    await this.ensureInitialLoad();
    this.conceptQueue.removeConceptBlock(cardIdOrBlockId);
    await this.save();
  }

  public async handleReview(cardId: string, rating: number): Promise<QueueReviewResult> {
    logger.debug(`Review handled by FSRS system: ${cardId}, rating: ${rating}`);
    const counterSnapshot = await this.getCounterSnapshot(true);
    return {
      updatedCard: null,
      removedFromQueue: false,
      remainsInQueue: true,
      queueChanged: false,
      requiresCurrentViewReorder: false,
      counterSnapshot,
      version: counterSnapshot.version,
    };
  }

  public async getNextCard(): Promise<FSRSCard | null> {
    await this.ensureInitialLoad();
    const queueItem = await this.conceptQueue.getNextCard();
    if (!queueItem) {
      return null;
    }
    void this.save().catch((error) => {
      logger.warn('Failed to persist neural roam session after getNextCard:', error);
    });
    return this.convertToFSRSCard(queueItem);
  }

  public async lockCurrentAsFocus(cardId: string, priority: 'normal' | 'high' = 'high'): Promise<void> {
    await this.ensureInitialLoad();
    if (priority === 'high') {
      // High-priority lock keeps concept seed semantic when possible.
      try {
        await this.conceptQueue.addConceptBlock(cardId, 'high');
      } catch {
        // No-op for non-concept cards.
      }
    }
    await this.conceptQueue.setAnchorEntry(cardId, true);
    await this.conceptQueue.setCurrentFocus(cardId, {
      includeFocusAsFirst: false,
      resetHistory: false,
      bookmarkCurrentPath: true,
    });
    await this.save();
  }

  public clearHistory(scope: 'current' | 'all' = 'current'): void {
    this.conceptQueue.clearHistory(scope);
    void this.save().catch((error) => {
      logger.warn('Failed to persist neural roam state after clearHistory:', error);
    });
  }

  public getConceptBlocks(): string[] {
    return this.conceptQueue.getConceptBlocks();
  }

  public getSeedSnapshot(): NeuralRoamSeedEntry[] {
    return this.conceptQueue.getSeedSnapshot();
  }

  public async setSeedEntry(nodeId: string, enabled = true): Promise<void> {
    await this.ensureInitialLoad();
    await this.conceptQueue.setSeedEntry(nodeId, enabled);
    await this.save();
  }

  public async lockCurrentAsSeed(nodeId: string, priority: 'normal' | 'high' = 'high'): Promise<void> {
    await this.ensureInitialLoad();
    await this.conceptQueue.addConceptBlock(nodeId, priority);
    if (priority === 'high') {
      await this.conceptQueue.setCurrentFocus(nodeId, {
        includeFocusAsFirst: true,
        resetHistory: true,
        bookmarkCurrentPath: true,
      });
    }
    await this.save();
  }

  public getAnchorSnapshot(): NeuralRoamAnchorEntry[] {
    return this.conceptQueue.getAnchorSnapshot();
  }

  public async setAnchorEntry(nodeId: string, enabled = true): Promise<void> {
    await this.ensureInitialLoad();
    await this.conceptQueue.setAnchorEntry(nodeId, enabled);
    await this.save();
  }

  public async clearAnchors(): Promise<void> {
    await this.ensureInitialLoad();
    await this.conceptQueue.clearAnchors();
    await this.save();
  }

  public async startRoamingFromFocus(
    focusId: string,
    options: {
      includeFocusAsFirst?: boolean;
      resetHistory?: boolean;
    } = {}
  ): Promise<void> {
    await this.ensureInitialLoad();
    await this.conceptQueue.startRoamingFromFocus(focusId, options);
    await this.save();
  }

  public getHistorySnapshot(): NeuralRoamHistoryEntry[] {
    return this.conceptQueue.getHistorySnapshot();
  }

  public getSessionFocusStack(): NeuralRoamHistoryEntry[] {
    return this.conceptQueue.getSessionFocusStack();
  }

  public getFocusPoolSnapshot(): NeuralRoamFocusEntry[] {
    return this.getAnchorSnapshot().map((entry) => ({
      nodeId: entry.nodeId,
      nodePreview: entry.nodePreview,
      isVirtual: entry.isVirtual,
      nodeKind: entry.nodeKind,
      priority: entry.priority,
      addedAt: entry.addedAt,
      visitedAt: entry.visitedAt,
    }));
  }

  public async setFocusPoolEntry(nodeId: string, enabled = true): Promise<void> {
    await this.setAnchorEntry(nodeId, enabled);
  }

  public async clearFocusPool(): Promise<void> {
    await this.clearAnchors();
  }

  public async setCurrentFocus(
    focusId: string,
    options: {
      includeFocusAsFirst?: boolean;
      resetHistory?: boolean;
      bookmarkCurrentPath?: boolean;
    } = {}
  ): Promise<void> {
    await this.ensureInitialLoad();
    await this.conceptQueue.setCurrentFocus(focusId, options);
    await this.save();
  }

  /**
   * @deprecated Use getFocusPoolSnapshot instead.
   */
  public getPinnedFocusBlocks(): NeuralRoamHistoryEntry[] {
    return this.conceptQueue.getPinnedFocusBlocks();
  }

  /**
   * @deprecated Use setFocusPoolEntry instead.
   */
  public async setPinnedFocusBlock(blockId: string, pinned = true): Promise<void> {
    await this.setFocusPoolEntry(blockId, pinned);
  }

  public async jumpToHistoryNode(nodeId: string): Promise<boolean> {
    await this.ensureInitialLoad();
    const jumped = await this.conceptQueue.jumpToHistoryNode(nodeId);
    if (jumped) {
      await this.save();
    }
    return jumped;
  }

  public async getPathItemByNodeId(blockId: string): Promise<FSRSCard | null> {
    await this.ensureInitialLoad();
    const queueItem = await this.conceptQueue.getPathItemByNodeId(blockId);
    if (!queueItem) {
      return null;
    }
    void this.save().catch((error) => {
      logger.warn('Failed to persist neural roam state after getPathItemByNodeId:', error);
    });
    return this.convertToFSRSCard(queueItem);
  }

  public getNavigationState(): NeuralNavigationState {
    return this.conceptQueue.getNavigationState();
  }

  public setNavigationMode(mode: NeuralNavigationMode): void {
    this.conceptQueue.setNavigationMode(mode);
    void this.save().catch((error) => {
      logger.warn('Failed to persist neural roam state after setNavigationMode:', error);
    });
  }

  public returnToBookmark(): boolean {
    const moved = this.conceptQueue.returnToBookmark();
    if (moved) {
      void this.save().catch((error) => {
        logger.warn('Failed to persist neural roam state after returnToBookmark:', error);
      });
    }
    return moved;
  }

  public getFilterStats(): { listBlocks: number; deletedBlocks: number; total: number } {
    return {
      listBlocks: 0,
      deletedBlocks: 0,
      total: 0,
    };
  }

  public async reorder(_orderedCards: FSRSCard[] = []): Promise<boolean> {
    logger.warn('Reorder not supported');
    return false;
  }

  public async getSize(): Promise<number> {
    await this.ensureInitialLoad();
    return this.conceptQueue.getSeedSnapshot().length;
  }

  private resolveAddTarget(card: FSRSCard | ReviewQueueItem | string): { blockId: string; conceptHint: boolean } {
    if (typeof card === 'string') {
      return {
        blockId: card,
        conceptHint: false,
      };
    }

    const raw = card as unknown as Record<string, unknown>;
    const blockId = typeof raw.blockId === 'string' && raw.blockId.trim().length > 0
      ? raw.blockId
      : resolveCardId(card);

    return {
      blockId,
      conceptHint: this.hasConceptHint(raw),
    };
  }

  private hasConceptHint(raw: Record<string, unknown>): boolean {
    const type = typeof raw.type === 'string' ? raw.type : '';
    const cardType = typeof raw.cardType === 'string' ? raw.cardType : '';
    const cardTypeMarker = typeof raw.cardTypeMarker === 'string' ? raw.cardTypeMarker : '';
    const meta = isRecord(raw.meta) ? raw.meta : null;
    const metaCardTypeMarker = meta && typeof meta.cardTypeMarker === 'string'
      ? meta.cardTypeMarker
      : '';

    return type === 'concept'
      || cardType === 'concept'
      || cardTypeMarker === 'concept'
      || metaCardTypeMarker === 'concept';
  }

  private async resolveConceptStatusFromLocalCards(blockId: string): Promise<LocalConceptStatus> {
    const normalizedBlockId = String(blockId || '').trim();
    if (!normalizedBlockId) {
      return 'non-concept';
    }

    try {
      const cards = await this.manager.getCards({
        blockIds: [normalizedBlockId],
      });
      const localCard = cards.find((card) => card.blockId === normalizedBlockId) ?? cards[0] ?? null;
      if (!localCard) {
        return 'non-concept';
      }
      return this.isLocalConceptCard(localCard) ? 'concept' : 'non-concept';
    } catch (error) {
      logger.warn(`Failed to resolve local concept status for block ${normalizedBlockId}:`, error);
      return 'unknown';
    }
  }

  private isLocalConceptCard(card: FSRSCard): boolean {
    const marker = typeof card.cardTypeMarker === 'string' ? card.cardTypeMarker : '';
    const metaMarker = isRecord(card.meta) && typeof card.meta.cardTypeMarker === 'string'
      ? card.meta.cardTypeMarker
      : '';

    return card.type === 'concept' || marker === 'concept' || metaMarker === 'concept';
  }

  private async convertToFSRSCard(queueItem: ConceptQueueItem): Promise<FSRSCard> {
    const now = Date.now();

    const cardType = await this.resolveCachedCardType(queueItem.blockId);

    return {
      id: queueItem.blockId,
      xiuyuanID: queueItem.blockId,
      blockId: queueItem.blockId,
      due: now,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      lastReview: now,
      priority: 50,
      type: cardType as FSRSCard['type'],
      tags: [],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: now,
      updatedAt: now,
      meta: {
        neuralContext: {
          associationType: queueItem.associationType,
          reason: queueItem.reason,
          blockType: queueItem.blockData.type,
          isFlashcard: cardType === 'item',
        },
      },
    };
  }

  private async resolveCachedCardType(blockId: string): Promise<'item' | 'topic'> {
    const normalizedBlockId = String(blockId || '').trim();
    if (!normalizedBlockId) {
      return 'topic';
    }

    const cached = this.getCachedCardType(normalizedBlockId);
    if (cached) {
      return cached;
    }

    let resolved: 'item' | 'topic' = 'topic';
    try {
      resolved = await this.cardTypeResolver.resolveCardType(normalizedBlockId);
    } catch (error) {
      logger.warn('Failed to resolve neural roam card type, fallback to topic:', error);
    }

    this.setCachedCardType(normalizedBlockId, resolved);
    return resolved;
  }

  private getCachedCardType(blockId: string): 'item' | 'topic' | null {
    const cached = this.cardTypeCache.get(blockId);
    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= Date.now()) {
      this.cardTypeCache.delete(blockId);
      return null;
    }

    this.cardTypeCache.delete(blockId);
    this.cardTypeCache.set(blockId, cached);
    return cached.value;
  }

  private setCachedCardType(blockId: string, value: 'item' | 'topic'): void {
    this.evictExpiredCardTypes();
    if (this.cardTypeCache.has(blockId)) {
      this.cardTypeCache.delete(blockId);
    }

    this.cardTypeCache.set(blockId, {
      value,
      expiresAt: Date.now() + this.cardTypeCacheTtlMs,
    });

    while (this.cardTypeCache.size > this.maxCardTypeCacheSize) {
      const oldestKey = this.cardTypeCache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.cardTypeCache.delete(oldestKey);
    }
  }

  private evictExpiredCardTypes(): void {
    const now = Date.now();
    for (const [blockId, cached] of this.cardTypeCache.entries()) {
      if (cached.expiresAt <= now) {
        this.cardTypeCache.delete(blockId);
      }
    }
  }
}
