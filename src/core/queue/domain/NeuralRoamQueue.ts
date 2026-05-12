/**
 * Neural Roam Queue
 */

import { BaseReviewQueue } from './BaseReviewQueue';
import {
  type HyperspaceExcerptInjectionContext,
  type NeuralActivationTrace,
  type NeuralEngineMode,
  type NeuralRoamSourceEntry,
  QueueAddSource,
  QueueType,
  type NeuralRoamAnchorEntry,
  type NeuralNavigationMode,
  type NeuralNavigationState,
  type NeuralRoamFocusEntry,
  type NeuralHistoryPageRequest,
  type NeuralHistoryPageResult,
  type NeuralRoamHistoryEntry,
  type QueueReviewResult,
  type NeuralRoamSeedEntry,
  type NeuralRoamBatchSnapshot,
  type QueueBulkAddInput,
  type QueueBulkFailure,
  type QueueBulkMutationResult,
} from '../../../types/unified-data-source';
import { FSRSCard } from '../../../types/card';
import type { QueueItem as ReviewQueueItem } from '../types';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';
import type {
  NeuralRoamNodeTypeResolverPort,
  QueuePersistencePort,
} from './ports';
import { loadQueueState, saveQueueState } from './queuePersistence';
import {
  ConceptNeuralQueue,
  type ConceptNeuralSessionState,
  type FocusPoolPersistedEntry,
  type QueueItem as ConceptQueueItem,
} from '../neural/ConceptNeuralQueue';
import { ConceptQueryEngine } from '../neural/ConceptQueryEngine';
import {
  HyperspaceEngine,
  type QueueItem as HyperspaceQueueItem,
  type HyperspacePersistedEntry,
  type HyperspaceSessionState,
} from '../neural/hyperspace/HyperspaceEngine';
import { NeuralGraphProvider } from '../neural/graph/NeuralGraphProvider';
import type { NeuralGraphQueryPort } from '../neural/NeuralGraphQueryPort';
import { createDependencyUnavailableError } from '../dependencyErrors';
import { resolveCardId } from '../../../diagnostics/type-guards';
import { createLogger } from '@/utils/logger';
import type { HyperspaceSettings } from '@/types/settings';

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

interface NeuralRoamPersistedStateV6 {
  version: 6;
  seedPool: FocusPoolPersistedEntry[];
  anchorPool: FocusPoolPersistedEntry[];
  session: ConceptNeuralSessionState;
}

interface NeuralRoamPersistedStateV7 {
  version: 7;
  engineMode: NeuralEngineMode;
  orbit: {
    seedPool: FocusPoolPersistedEntry[];
    anchorPool: FocusPoolPersistedEntry[];
    session: ConceptNeuralSessionState;
  };
  hyperspace: {
    sourcePool: HyperspacePersistedEntry[];
    anchorPool: HyperspacePersistedEntry[];
    session: HyperspaceSessionState;
  };
}

interface NeuralRoamPersistedStateV8 {
  version: 8;
  engineMode: NeuralEngineMode;
  orbit: {
    seedPool: FocusPoolPersistedEntry[];
    anchorPool: FocusPoolPersistedEntry[];
    session: ConceptNeuralSessionState;
  };
  hyperspace: {
    sourcePool: HyperspacePersistedEntry[];
    anchorPool: HyperspacePersistedEntry[];
    session: HyperspaceSessionState;
  };
  pendingAssociatedReviewCardIds: string[];
  seenAssociatedReviewCardIds: string[];
}

interface NeuralRoamQueueOptions {
  nodeTypeResolver?: NeuralRoamNodeTypeResolverPort;
  getHistoryLimit?: () => number;
  getHyperspaceSettings?: () => HyperspaceSettings;
  graphQuery?: NeuralGraphQueryPort;
  storageKey?: string;
}

type LocalConceptStatus = 'concept' | 'non-concept' | 'unknown';

type AssociatedReviewSource = {
  sourceVirtualNodeId?: string | null;
  sourceVirtualEventId?: string | null;
  sourceVirtualReason?: string | null;
};

type AssociatedReviewVisitRecorder = {
  recordAssociatedReviewVisit(input: {
    nodeId: string;
    nodePreview?: string | null;
    sourceNodeId?: string | null;
    sourceEventId?: string | null;
    reason?: string | null;
  }): NeuralRoamHistoryEntry | null;
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

function isNeuralRoamPersistedStateV6(value: unknown): value is NeuralRoamPersistedStateV6 {
  if (!isRecord(value)) {
    return false;
  }
  return Number(value.version) === 6
    && Array.isArray(value.seedPool)
    && Array.isArray(value.anchorPool)
    && isRecord(value.session);
}

function isNeuralRoamPersistedStateV7(value: unknown): value is NeuralRoamPersistedStateV7 {
  if (!isRecord(value)) {
    return false;
  }
  return Number(value.version) === 7
    && (value.engineMode === 'orbit' || value.engineMode === 'hyperspace')
    && isRecord(value.orbit)
    && Array.isArray((value.orbit as Record<string, unknown>).seedPool)
    && Array.isArray((value.orbit as Record<string, unknown>).anchorPool)
    && isRecord((value.orbit as Record<string, unknown>).session)
    && isRecord(value.hyperspace)
    && Array.isArray((value.hyperspace as Record<string, unknown>).sourcePool)
    && Array.isArray((value.hyperspace as Record<string, unknown>).anchorPool)
    && isRecord((value.hyperspace as Record<string, unknown>).session);
}

function isNeuralRoamPersistedStateV8(value: unknown): value is NeuralRoamPersistedStateV8 {
  if (!isRecord(value)) {
    return false;
  }
  return Number(value.version) === 8
    && (value.engineMode === 'orbit' || value.engineMode === 'hyperspace')
    && isRecord(value.orbit)
    && Array.isArray((value.orbit as Record<string, unknown>).seedPool)
    && Array.isArray((value.orbit as Record<string, unknown>).anchorPool)
    && isRecord((value.orbit as Record<string, unknown>).session)
    && isRecord(value.hyperspace)
    && Array.isArray((value.hyperspace as Record<string, unknown>).sourcePool)
    && Array.isArray((value.hyperspace as Record<string, unknown>).anchorPool)
    && isRecord((value.hyperspace as Record<string, unknown>).session)
    && Array.isArray((value as Record<string, unknown>).pendingAssociatedReviewCardIds)
    && Array.isArray((value as Record<string, unknown>).seenAssociatedReviewCardIds);
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

  private readonly queryEngine: ConceptQueryEngine;
  private readonly conceptQueue: ConceptNeuralQueue;
  private readonly hyperspaceEngine: HyperspaceEngine;
  private readonly storageKey: string;
  private readonly queuePersistence: QueuePersistencePort;
  private readonly nodeTypeResolver?: NeuralRoamNodeTypeResolverPort;
  private readonly getHistoryLimit?: () => number;
  private readonly getHyperspaceSettings?: () => HyperspaceSettings;
  private engineMode: NeuralEngineMode = 'orbit';
  private pendingAssociatedReviewCards: FSRSCard[] = [];
  private readonly seenAssociatedReviewCardIds = new Set<string>();

  constructor(
    manager: UnifiedDataSourceManager,
    queuePersistence: QueuePersistencePort,
    options: NeuralRoamQueueOptions = {}
  ) {
    super(manager, QueueType.NeuralRoam);
    this.queuePersistence = queuePersistence;
    this.storageKey = options.storageKey || 'neuralRoamQueue';
    this.nodeTypeResolver = options.nodeTypeResolver;
    this.getHistoryLimit = options.getHistoryLimit;
    this.getHyperspaceSettings = options.getHyperspaceSettings;
    this.queryEngine = new ConceptQueryEngine({
      nodeTypeResolver: this.nodeTypeResolver,
      graphQuery: options.graphQuery,
    });
    this.conceptQueue = new ConceptNeuralQueue({
      queryEngine: this.queryEngine,
      isConceptCard: async (blockId: string) => {
        const conceptStatus = await this.resolveConceptStatusFromLocalCards(blockId);
        if (conceptStatus === 'unknown') {
          throw new Error(`Local concept status unavailable for block ${blockId}`);
        }
        return conceptStatus === 'concept';
      },
      getHistoryLimit: this.getHistoryLimit,
    });
    this.hyperspaceEngine = new HyperspaceEngine(new NeuralGraphProvider(this.queryEngine, options.graphQuery), {
      getHistoryLimit: this.getHistoryLimit,
      getSettings: this.getHyperspaceSettings,
    });
  }

  private getActiveEngine(): ConceptNeuralQueue | HyperspaceEngine {
    return this.engineMode === 'hyperspace' ? this.hyperspaceEngine : this.conceptQueue;
  }

  private getCurrentNodeIdFromEngine(mode: NeuralEngineMode): string | null {
    const engine = mode === 'hyperspace' ? this.hyperspaceEngine : this.conceptQueue;
    return engine.getNavigationState().currentNodeId;
  }

  private toSourceEntriesFromSeeds(entries: NeuralRoamSeedEntry[]): NeuralRoamSourceEntry[] {
    return entries.map((entry) => ({
      nodeId: entry.nodeId,
      nodePreview: entry.nodePreview,
      nodeKind: 'concept',
      role: 'orbit-center',
      priority: entry.priority,
      addedAt: entry.addedAt,
      visitedAt: entry.visitedAt,
    }));
  }

  private getOrbitSourceSnapshot(): NeuralRoamSourceEntry[] {
    return this.toSourceEntriesFromSeeds(this.conceptQueue.getSeedSnapshot());
  }

  private async resolveOrbitCarryTarget(
    preferredNodeId: string | null,
  ): Promise<string | null> {
    const normalizedPreferred = String(preferredNodeId || '').trim();
    if (normalizedPreferred) {
      const conceptStatus = await this.resolveConceptStatusFromLocalCards(normalizedPreferred);
      if (conceptStatus === 'concept') {
        return normalizedPreferred;
      }
    }

    const hyperspaceConceptSource = this.hyperspaceEngine
      .getSourceSnapshot()
      .find((entry) => entry.nodeKind === 'concept');
    if (hyperspaceConceptSource) {
      return hyperspaceConceptSource.nodeId;
    }

    const orbitSeed = this.conceptQueue.getSeedSnapshot()[0];
    if (orbitSeed) {
      return orbitSeed.nodeId;
    }

    return normalizedPreferred || null;
  }

  private getSessionVisibleNodeIds(limit = 80): string[] {
    const activeEngine = this.getActiveEngine();
    const navState = activeEngine.getNavigationState();
    const sessionId = navState.sessionId;
    const safeLimit = Math.max(1, Math.min(Math.floor(limit), 500));
    const pageSize = Math.max(40, Math.min(200, safeLimit * 2));
    const dedupedNewestFirst: string[] = [];
    let lastNodeId: string | null = null;
    let offset = 0;

    while (dedupedNewestFirst.length < safeLimit) {
      const page = activeEngine.getHistoryPage({
        offset,
        limit: pageSize,
        sessionId,
      });
      if (page.entries.length === 0) {
        break;
      }

      for (const entry of page.entries) {
        if (entry.nodeId !== lastNodeId) {
          dedupedNewestFirst.push(entry.nodeId);
          lastNodeId = entry.nodeId;
          if (dedupedNewestFirst.length >= safeLimit) {
            break;
          }
        }
      }

      if (!page.hasMore) {
        break;
      }
      offset += page.entries.length;
    }

    return dedupedNewestFirst.reverse();
  }

  async load(): Promise<void> {
    const { value: rawState, fromStorage } = loadQueueState<unknown>({
      persistence: this.queuePersistence,
      key: this.storageKey,
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

    if (isNeuralRoamPersistedStateV8(rawState)) {
      this.engineMode = rawState.engineMode;
      this.conceptQueue.restoreSeedPoolState(rawState.orbit.seedPool);
      this.conceptQueue.restoreAnchorPoolState(rawState.orbit.anchorPool);
      this.conceptQueue.restoreSessionState(rawState.orbit.session);
      this.hyperspaceEngine.restoreSourcePoolState(rawState.hyperspace.sourcePool);
      this.hyperspaceEngine.restoreAnchorPoolState(rawState.hyperspace.anchorPool);
      this.hyperspaceEngine.restoreSessionState(rawState.hyperspace.session);
      const associatedChanged = await this.restoreAssociatedReviewState(
        rawState.pendingAssociatedReviewCardIds,
        rawState.seenAssociatedReviewCardIds,
      );
      persistRequired = associatedChanged;
      if (fromStorage) {
        logger.info(`Loaded neural roam state (v8), engineMode=${this.engineMode}`);
      }
    } else if (isNeuralRoamPersistedStateV7(rawState)) {
      this.engineMode = rawState.engineMode;
      this.conceptQueue.restoreSeedPoolState(rawState.orbit.seedPool);
      this.conceptQueue.restoreAnchorPoolState(rawState.orbit.anchorPool);
      this.conceptQueue.restoreSessionState(rawState.orbit.session);
      this.hyperspaceEngine.restoreSourcePoolState(rawState.hyperspace.sourcePool);
      this.hyperspaceEngine.restoreAnchorPoolState(rawState.hyperspace.anchorPool);
      this.hyperspaceEngine.restoreSessionState(rawState.hyperspace.session);
      this.resetAssociatedReviewState();
      persistRequired = true;
      if (fromStorage) {
        logger.info(`Migrated neural roam state v7->v8, engineMode=${this.engineMode}`);
      }
    } else if (isNeuralRoamPersistedStateV6(rawState)) {
      this.engineMode = 'orbit';
      this.conceptQueue.restoreSeedPoolState(rawState.seedPool);
      this.conceptQueue.restoreAnchorPoolState(rawState.anchorPool);
      this.conceptQueue.restoreSessionState(rawState.session);
      if (fromStorage) {
        logger.info(`Migrated neural roam state v6->v8, seedPool=${rawState.seedPool.length}, anchorPool=${rawState.anchorPool.length}`);
      }
      this.hyperspaceEngine.restoreSourcePoolState([]);
      this.hyperspaceEngine.restoreAnchorPoolState([]);
      this.hyperspaceEngine.restoreSessionState(null);
      this.resetAssociatedReviewState();
      persistRequired = true;
    } else if (isNeuralRoamPersistedStateV5(rawState)) {
      this.engineMode = 'orbit';
      this.conceptQueue.restoreSeedPoolState(rawState.seedPool);
      this.conceptQueue.restoreAnchorPoolState(rawState.anchorPool);
      this.conceptQueue.restoreSessionState(rawState.session);
      if (fromStorage) {
        logger.info(`Migrated neural roam state v5->v8, seedPool=${rawState.seedPool.length}, anchorPool=${rawState.anchorPool.length}`);
      }
      this.hyperspaceEngine.restoreSourcePoolState([]);
      this.hyperspaceEngine.restoreAnchorPoolState([]);
      this.hyperspaceEngine.restoreSessionState(null);
      this.resetAssociatedReviewState();
      persistRequired = true;
    } else if (isNeuralRoamPersistedStateV4(rawState)) {
      this.engineMode = 'orbit';
      const { seedPool, anchorPool } = splitFocusPoolToSeedAndAnchor(rawState.focusPool);
      this.conceptQueue.restoreSeedPoolState(seedPool);
      this.conceptQueue.restoreAnchorPoolState(anchorPool);
      this.conceptQueue.restoreSessionState({
        ...rawState.session,
        seedPool,
        anchorPool,
      });
      if (fromStorage) {
        logger.info(`Migrated neural roam state v4->v8, seedPool=${seedPool.length}, anchorPool=${anchorPool.length}`);
      }
      this.hyperspaceEngine.restoreSourcePoolState([]);
      this.hyperspaceEngine.restoreAnchorPoolState([]);
      this.hyperspaceEngine.restoreSessionState(null);
      this.resetAssociatedReviewState();
      persistRequired = true;
    } else if (isNeuralRoamPersistedStateV3(rawState)) {
      this.engineMode = 'orbit';
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
        logger.info(`Migrated neural roam state v3->v8, seedPool=${seedPool.length}, anchorPool=${anchorPool.length}`);
      }
      this.hyperspaceEngine.restoreSourcePoolState([]);
      this.hyperspaceEngine.restoreAnchorPoolState([]);
      this.hyperspaceEngine.restoreSessionState(null);
      this.resetAssociatedReviewState();
      persistRequired = true;
    } else {
      logger.info('Legacy neural roam state detected, reset to v8 schema');
      this.engineMode = 'orbit';
      this.conceptQueue.restoreSeedPoolState([]);
      this.conceptQueue.restoreAnchorPoolState([]);
      this.conceptQueue.restoreSessionState(null);
      this.conceptQueue.clearHistory('all');
      this.hyperspaceEngine.restoreSourcePoolState([]);
      this.hyperspaceEngine.restoreAnchorPoolState([]);
      this.hyperspaceEngine.restoreSessionState(null);
      this.resetAssociatedReviewState();
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
    const data: NeuralRoamPersistedStateV8 = {
      version: 8,
      engineMode: this.engineMode,
      orbit: {
        seedPool: this.conceptQueue.exportSeedPoolState(),
        anchorPool: this.conceptQueue.exportAnchorPoolState(),
        session: this.conceptQueue.exportSessionState(),
      },
      hyperspace: {
        sourcePool: this.hyperspaceEngine.exportSourcePoolState(),
        anchorPool: this.hyperspaceEngine.exportAnchorPoolState(),
        session: this.hyperspaceEngine.exportSessionState(),
      },
      pendingAssociatedReviewCardIds: this.pendingAssociatedReviewCards
        .map((card) => String(card.blockId || '').trim())
        .filter((blockId) => blockId.length > 0),
      seenAssociatedReviewCardIds: Array.from(this.seenAssociatedReviewCardIds.values()),
    };

    await saveQueueState({
      persistence: this.queuePersistence,
      key: this.storageKey,
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
    const nodeIds = this.getSessionVisibleNodeIds(80);
    if (nodeIds.length === 0) {
      return [];
    }

    const cards = await Promise.all(
      nodeIds.map(async (nodeId) => {
        const queueItem = await this.getActiveEngine().getPathItemByNodeId(nodeId, { focusPath: false });
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
    const priority = priorityOrSource === 'high'
      ? 'high'
      : 'normal';
    await this.addConceptBlockToSeed(card, priority);
    await this.save();
  }

  public override async addCards(
    cards: QueueBulkAddInput[],
    priorityOrSource: 'normal' | 'high' | QueueAddSource = 'normal',
  ): Promise<QueueBulkMutationResult> {
    await this.ensureInitialLoad();

    const priority = priorityOrSource === 'high' ? 'high' : 'normal';
    const items = this.dedupeBulkAddInputs(cards);
    let changedCount = 0;
    const failedIds: string[] = [...items.failedIds];
    const failedItems: QueueBulkFailure[] = [];

    for (const item of items.items) {
      try {
        await this.addConceptBlockToSeed(item.value, priority);
        changedCount++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failedIds.push(item.id);
        failedItems.push({ id: item.id, message });
        logger.warn('Failed to stage neural roam seed for bulk add:', { id: item.id, error });
      }
    }

    if (changedCount > 0) {
      await this.save();
    }

    return {
      attemptedCount: items.attemptedCount,
      changedCount,
      failedIds: this.uniqueNeuralBulkIds(failedIds),
      failedItems,
    };
  }

  public async removeCard(cardIdOrBlockId: string): Promise<void> {
    await this.ensureInitialLoad();
    this.conceptQueue.removeConceptBlock(cardIdOrBlockId);
    await this.save();
  }

  public override async removeCards(cardIdsOrBlockIds: string[]): Promise<QueueBulkMutationResult> {
    await this.ensureInitialLoad();

    const ids = this.uniqueNeuralBulkIds((cardIdsOrBlockIds || []).map((id) => String(id || '').trim()));
    let changedCount = 0;
    const failedIds: string[] = [];

    for (const id of ids) {
      try {
        this.conceptQueue.removeConceptBlock(id);
        changedCount++;
      } catch (error) {
        failedIds.push(id);
        logger.warn('Failed to stage neural roam seed for bulk remove:', { id, error });
      }
    }

    if (changedCount > 0) {
      await this.save();
    }

    return {
      attemptedCount: ids.length,
      changedCount,
      failedIds,
    };
  }

  public async handleReview(cardId: string, rating: number): Promise<QueueReviewResult> {
    try {
      const localCard = await this.manager.getCard(cardId, { silent: true });
      if (this.isLocalReviewCard(localCard)) {
        return this.handleReviewWithScheduler(cardId, rating);
      }
    } catch (error) {
      logger.debug('[NeuralRoamQueue] Reviewed node has no persisted flashcard backing, keeping practice-only semantics', {
        cardId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.debug(`Review handled by FSRS system: ${cardId}, rating: ${rating}`);
    const counterSnapshot = this.counterSnapshot && !this.counterSnapshotDirty
      ? this.cloneCounterSnapshot(this.counterSnapshot)
      : await this.getCounterSnapshot(false);
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

  protected override shouldRemoveFromQueue(_card: FSRSCard): boolean {
    return false;
  }

  public async getNextCard(): Promise<FSRSCard | null> {
    await this.ensureInitialLoad();
    const pendingAssociatedCard = this.dequeuePendingAssociatedReviewCard();
    if (pendingAssociatedCard) {
      void this.save().catch((error) => {
        logger.warn('Failed to persist neural roam session after draining associated review buffer:', error);
      });
      return pendingAssociatedCard;
    }

    const queueItem = await this.getActiveEngine().getNextCard();
    if (!queueItem) {
      return null;
    }
    await this.enqueueAssociatedReviewCards(queueItem.blockId, queueItem.reason);
    void this.save().catch((error) => {
      logger.warn('Failed to persist neural roam session after getNextCard:', error);
    });
    return this.convertToFSRSCard(queueItem);
  }

  public async lockCurrentAsFocus(cardId: string, priority: 'normal' | 'high' = 'high'): Promise<void> {
    await this.ensureInitialLoad();
    if (this.engineMode === 'hyperspace') {
      await this.hyperspaceEngine.setSourceEntry(cardId, true);
      await this.hyperspaceEngine.setAnchorEntry(cardId, true);
      await this.hyperspaceEngine.setCurrentFocus(cardId, {
        includeFocusAsFirst: true,
        resetHistory: false,
        bookmarkCurrentPath: true,
      });
      await this.save();
      return;
    }

    if (priority === 'high') {
      try {
        await this.conceptQueue.addConceptBlock(cardId, 'high');
      } catch {
        // Non-concept nodes can still become orbit anchors/focuses.
      }
    }
    await this.conceptQueue.setAnchorEntry(cardId, true);
    await this.conceptQueue.setCurrentFocus(cardId, {
      includeFocusAsFirst: true,
      resetHistory: false,
      bookmarkCurrentPath: true,
    });
    await this.save();
  }

  public clearHistory(scope: 'current' | 'all' = 'current'): void {
    this.getActiveEngine().clearHistory(scope);
    this.resetAssociatedReviewState();
    void this.save().catch((error) => {
      logger.warn('Failed to persist neural roam state after clearHistory:', error);
    });
  }

  public getConceptBlocks(): string[] {
    return this.engineMode === 'hyperspace'
      ? this.hyperspaceEngine.getConceptBlocks()
      : this.conceptQueue.getConceptBlocks();
  }

  public getEngineMode(): NeuralEngineMode {
    return this.engineMode;
  }

  public async setEngineMode(
    mode: NeuralEngineMode,
    options: {
      carryCurrentNode?: boolean;
    } = {},
  ): Promise<void> {
    await this.ensureInitialLoad();

    if (mode === this.engineMode) {
      return;
    }

    this.clearPendingAssociatedReviewCards();

    const carryCurrentNode = options.carryCurrentNode !== false;
    const previousMode = this.engineMode;
    const previousCurrentNodeId = carryCurrentNode ? this.getCurrentNodeIdFromEngine(previousMode) : null;

    if (mode === 'hyperspace') {
      const orbitCurrentNode = previousCurrentNodeId;
      const orbitCenter = this.conceptQueue.getNavigationState().currentNodeId
        ?? this.conceptQueue.getSeedSnapshot()[0]?.nodeId
        ?? null;
      const hyperspaceCarryTarget = orbitCurrentNode ?? orbitCenter;
      const shouldReuseHyperspaceFocus = hyperspaceCarryTarget
        ? this.shouldReuseHyperspaceCarryTarget(hyperspaceCarryTarget)
        : false;

      if (orbitCenter && orbitCenter !== hyperspaceCarryTarget) {
        await this.hyperspaceEngine.setSourceEntry(orbitCenter, true);
      }
      if (hyperspaceCarryTarget) {
        if (shouldReuseHyperspaceFocus) {
          await this.hyperspaceEngine.setSourceEntry(hyperspaceCarryTarget, true);
          await this.hyperspaceEngine.setAnchorEntry(hyperspaceCarryTarget, true);
        } else {
          await this.hyperspaceEngine.setCurrentFocus(hyperspaceCarryTarget, {
            includeFocusAsFirst: Boolean(orbitCurrentNode),
            resetHistory: false,
            bookmarkCurrentPath: Boolean(orbitCurrentNode),
          });
        }
      }
      this.engineMode = 'hyperspace';
      await this.save();
      return;
    }

    const orbitCarryTarget = await this.resolveOrbitCarryTarget(previousCurrentNodeId);
    const shouldReuseOrbitFocus = orbitCarryTarget
      ? this.shouldReuseOrbitCarryTarget(orbitCarryTarget)
      : false;
    if (previousCurrentNodeId) {
      await this.conceptQueue.setAnchorEntry(previousCurrentNodeId, true);
    }
    if (orbitCarryTarget) {
      const status = await this.resolveConceptStatusFromLocalCards(orbitCarryTarget);
      if (status === 'concept') {
        await this.conceptQueue.setSeedEntry(orbitCarryTarget, true);
      } else {
        await this.conceptQueue.setAnchorEntry(orbitCarryTarget, true);
      }
      if (!shouldReuseOrbitFocus) {
        await this.conceptQueue.setCurrentFocus(orbitCarryTarget, {
          includeFocusAsFirst: Boolean(previousCurrentNodeId && orbitCarryTarget === previousCurrentNodeId),
          resetHistory: false,
          bookmarkCurrentPath: Boolean(previousCurrentNodeId && orbitCarryTarget === previousCurrentNodeId),
        });
      }
    }
    this.engineMode = 'orbit';
    await this.save();
  }

  private shouldReuseHyperspaceCarryTarget(nodeId: string): boolean {
    const normalized = String(nodeId || '').trim();
    if (!normalized) {
      return false;
    }

    const hyperspaceState = this.hyperspaceEngine.getNavigationState();
    if (hyperspaceState.currentNodeId === normalized) {
      return true;
    }

    const latest = this.hyperspaceEngine.getHistoryPage({ offset: 0, limit: 1 }).entries[0];
    return latest?.nodeId === normalized && latest.activationKind === 'source-root';
  }

  private shouldReuseOrbitCarryTarget(nodeId: string): boolean {
    const normalized = String(nodeId || '').trim();
    if (!normalized) {
      return false;
    }

    const orbitState = this.conceptQueue.getNavigationState();
    if (orbitState.currentNodeId === normalized) {
      return true;
    }

    const latest = this.conceptQueue.getHistoryPage({ offset: 0, limit: 1 }).entries[0];
    return latest?.nodeId === normalized && latest.activationKind === 'focus-root';
  }

  private dequeuePendingAssociatedReviewCard(): FSRSCard | null {
    const card = this.pendingAssociatedReviewCards.shift() ?? null;
    if (card) {
      this.recordAssociatedReviewVisit(card);
      this.clearSizeCache();
    }
    return card;
  }

  private recordAssociatedReviewVisit(card: FSRSCard): void {
    const engine = this.getActiveEngine();
    const recorder = engine as unknown as Partial<AssociatedReviewVisitRecorder>;
    if (typeof recorder.recordAssociatedReviewVisit !== 'function') {
      return;
    }

    const neuralContext = this.readNeuralContext(card);
    const sourceNodeId = typeof neuralContext?.sourceVirtualNodeId === 'string'
      ? neuralContext.sourceVirtualNodeId
      : null;
    const sourceEventId = typeof neuralContext?.sourceVirtualEventId === 'string'
      ? neuralContext.sourceVirtualEventId
      : null;
    const sourceReason = typeof neuralContext?.sourceVirtualReason === 'string'
      ? neuralContext.sourceVirtualReason
      : null;

    recorder.recordAssociatedReviewVisit.call(engine, {
      nodeId: card.blockId,
      nodePreview: this.resolveAssociatedReviewPreview(card),
      sourceNodeId,
      sourceEventId,
      reason: sourceReason,
    });
  }

  private readNeuralContext(card: FSRSCard): Record<string, unknown> | null {
    if (!isRecord(card.meta)) {
      return null;
    }
    const neuralContext = card.meta.neuralContext;
    return isRecord(neuralContext) ? neuralContext : null;
  }

  private resolveAssociatedReviewPreview(card: FSRSCard): string {
    if (isRecord(card.meta)) {
      const content = card.meta.content;
      if (typeof content === 'string' && content.trim().length > 0) {
        return content;
      }
    }
    return card.blockId || card.id;
  }

  private clearPendingAssociatedReviewCards(): void {
    if (this.pendingAssociatedReviewCards.length === 0) {
      return;
    }
    this.pendingAssociatedReviewCards = [];
    this.clearSizeCache();
  }

  private resetAssociatedReviewState(): void {
    this.pendingAssociatedReviewCards = [];
    this.seenAssociatedReviewCardIds.clear();
    this.clearSizeCache();
  }

  private async enqueueAssociatedReviewCards(sourceBlockId: string, sourceReason: string): Promise<void> {
    const navigationState = this.getActiveEngine().getNavigationState();
    const sourceVirtualEventId = navigationState.currentNodeId === sourceBlockId
      ? navigationState.currentEventId
      : null;
    const associatedCards = await this.resolveAssociatedReviewCards(sourceBlockId, {
      sourceVirtualNodeId: sourceBlockId,
      sourceVirtualEventId,
      sourceVirtualReason: sourceReason,
    });

    if (associatedCards.length === 0) {
      return;
    }

    this.pendingAssociatedReviewCards.push(...associatedCards);
    this.clearSizeCache();
  }

  private async resolveAssociatedReviewCards(
    sourceBlockId: string,
    source: AssociatedReviewSource = {},
  ): Promise<FSRSCard[]> {
    const subtreeBlockIds = await this.queryEngine.fetchSubtreeBlockIds(sourceBlockId);
    if (subtreeBlockIds.length === 0) {
      return [];
    }

    try {
      const localCards = await this.manager.getCards({
        blockIds: subtreeBlockIds,
      });
      const localCardsByBlockId = new Map(
        localCards
          .map((card) => this.cloneLocalCard(card))
          .filter((card) => this.isLocalReviewCard(card))
          .map((card) => [card.blockId, card] as const),
      );

      const associatedCards: FSRSCard[] = [];
      for (const blockId of subtreeBlockIds) {
        const localCard = localCardsByBlockId.get(blockId);
        if (!localCard) {
          continue;
        }
        if (this.seenAssociatedReviewCardIds.has(localCard.blockId)) {
          continue;
        }
        this.seenAssociatedReviewCardIds.add(localCard.blockId);
        associatedCards.push(await this.buildAssociatedReviewCard(localCard, source));
      }

      return associatedCards;
    } catch (error) {
      logger.warn(`Failed to resolve associated review cards for virtual node ${sourceBlockId}:`, error);
      throw createDependencyUnavailableError(
        'NEURAL_ROAM_QUERY_UNAVAILABLE',
        `failed to resolve associated review cards for virtual node ${sourceBlockId}`,
        error,
      );
    }
  }

  private async restoreAssociatedReviewState(
    pendingAssociatedReviewCardIds: unknown,
    seenAssociatedReviewCardIds: unknown,
  ): Promise<boolean> {
    const pendingBlockIds = this.normalizeAssociatedReviewIds(pendingAssociatedReviewCardIds);
    const seenBlockIds = this.normalizeAssociatedReviewIds(seenAssociatedReviewCardIds);

    this.pendingAssociatedReviewCards = [];
    this.seenAssociatedReviewCardIds.clear();
    for (const blockId of seenBlockIds) {
      this.seenAssociatedReviewCardIds.add(blockId);
    }

    if (pendingBlockIds.length === 0) {
      return false;
    }

    try {
      const localCards = await this.manager.getCards({
        blockIds: pendingBlockIds,
      });
      const localCardsByBlockId = new Map(
        localCards
          .map((card) => this.cloneLocalCard(card))
          .filter((card) => this.isLocalReviewCard(card))
          .map((card) => [card.blockId, card] as const),
      );

      let changed = false;
      for (const blockId of pendingBlockIds) {
        const localCard = localCardsByBlockId.get(blockId);
        if (!localCard) {
          changed = true;
          continue;
        }
        this.pendingAssociatedReviewCards.push(await this.buildAssociatedReviewCard(localCard));
        this.seenAssociatedReviewCardIds.add(localCard.blockId);
      }

      this.clearSizeCache();
      return changed || this.pendingAssociatedReviewCards.length !== pendingBlockIds.length;
    } catch (error) {
      logger.warn('Failed to restore associated neural review cards from persisted state:', error);
      this.pendingAssociatedReviewCards = [];
      this.clearSizeCache();
      return pendingBlockIds.length > 0;
    }
  }

  private normalizeAssociatedReviewIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return Array.from(new Set(
      value
        .map((entry) => String(entry || '').trim())
        .filter((entry) => entry.length > 0),
    ));
  }

  public getSourceSnapshot(): NeuralRoamSourceEntry[] {
    return this.engineMode === 'hyperspace'
      ? this.hyperspaceEngine.getSourceSnapshot()
      : this.getOrbitSourceSnapshot();
  }

  public async setSourceEntry(nodeId: string, enabled = true): Promise<void> {
    await this.ensureInitialLoad();
    if (this.engineMode === 'hyperspace') {
      await this.hyperspaceEngine.setSourceEntry(nodeId, enabled);
      await this.save();
      return;
    }

    await this.conceptQueue.setSeedEntry(nodeId, enabled);
    await this.save();
  }

  public async injectExcerptIntoHyperspace(
    excerptNodeId: string,
    context: HyperspaceExcerptInjectionContext = {},
  ): Promise<boolean> {
    await this.ensureInitialLoad();
    if (this.engineMode !== 'hyperspace') {
      return false;
    }

    const injected = await this.hyperspaceEngine.injectExcerptIntoCurrentSession(excerptNodeId, context);
    if (injected) {
      await this.save();
    }
    return injected;
  }

  public getSeedSnapshot(): NeuralRoamSeedEntry[] {
    if (this.engineMode === 'hyperspace') {
      return this.hyperspaceEngine.getSourceSnapshot().map((entry) => ({
        nodeId: entry.nodeId,
        nodePreview: entry.nodePreview,
        priority: entry.priority,
        addedAt: entry.addedAt,
        visitedAt: entry.visitedAt,
      }));
    }
    return this.conceptQueue.getSeedSnapshot();
  }

  public async setSeedEntry(nodeId: string, enabled = true): Promise<void> {
    await this.ensureInitialLoad();
    if (this.engineMode === 'hyperspace') {
      await this.hyperspaceEngine.setSourceEntry(nodeId, enabled);
    } else {
      await this.conceptQueue.setSeedEntry(nodeId, enabled);
    }
    await this.save();
  }

  public async lockCurrentAsSeed(nodeId: string, priority: 'normal' | 'high' = 'high'): Promise<void> {
    await this.ensureInitialLoad();
    if (this.engineMode === 'hyperspace') {
      await this.hyperspaceEngine.setSourceEntry(nodeId, true);
      if (priority === 'high') {
        await this.hyperspaceEngine.setCurrentFocus(nodeId, {
          includeFocusAsFirst: true,
          resetHistory: false,
          bookmarkCurrentPath: true,
        });
      }
      await this.save();
      return;
    }

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
    return this.engineMode === 'hyperspace'
      ? this.hyperspaceEngine.getAnchorSnapshot()
      : this.conceptQueue.getAnchorSnapshot();
  }

  public async setAnchorEntry(nodeId: string, enabled = true): Promise<void> {
    await this.ensureInitialLoad();
    await this.getActiveEngine().setAnchorEntry(nodeId, enabled);
    await this.save();
  }

  public async clearAnchors(): Promise<void> {
    await this.ensureInitialLoad();
    await this.getActiveEngine().clearAnchors();
    await this.save();
  }

  public getCurrentBatchSnapshot(): NeuralRoamBatchSnapshot | null {
    const engine = this.getActiveEngine() as {
      getCurrentBatchSnapshot?: () => NeuralRoamBatchSnapshot | null;
    };
    if (typeof engine.getCurrentBatchSnapshot !== 'function') {
      return null;
    }
    return engine.getCurrentBatchSnapshot();
  }

  public async startRoamingFromFocus(
    focusId: string,
    options: {
      includeFocusAsFirst?: boolean;
      resetHistory?: boolean;
    } = {}
  ): Promise<void> {
    await this.ensureInitialLoad();
    if (options.resetHistory === true) {
      this.resetAssociatedReviewState();
    } else {
      this.clearPendingAssociatedReviewCards();
    }
    await this.getActiveEngine().startRoamingFromFocus(focusId, options);
    await this.save();
  }

  public getHistorySnapshot(): NeuralRoamHistoryEntry[] {
    return this.getActiveEngine().getHistorySnapshot();
  }

  public getHistoryCount(sessionId?: string | null): number {
    return this.getActiveEngine().getHistoryCount(sessionId);
  }

  public getHistoryPage(request: NeuralHistoryPageRequest): NeuralHistoryPageResult {
    return this.getActiveEngine().getHistoryPage(request);
  }

  public getHistoryEntryByEventId(eventId: string): NeuralRoamHistoryEntry | null {
    return this.getActiveEngine().getHistoryEntryByEventId(eventId);
  }

  public getHistoryEntriesByNodeId(nodeId: string): NeuralRoamHistoryEntry[] {
    return this.getActiveEngine().getHistoryEntriesByNodeId(nodeId);
  }

  public getHistoryHitCount(nodeId: string): number {
    return this.getActiveEngine().getHistoryHitCount(nodeId);
  }

  public getActivationTrace(eventId: string): NeuralActivationTrace | null {
    return this.getActiveEngine().getActivationTrace(eventId);
  }

  public getSessionFocusStack(): NeuralRoamHistoryEntry[] {
    return this.getActiveEngine().getSessionFocusStack();
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
    if (options.resetHistory === true) {
      this.resetAssociatedReviewState();
    } else {
      this.clearPendingAssociatedReviewCards();
    }
    await this.getActiveEngine().setCurrentFocus(focusId, options);
    await this.save();
  }

  /**
   * @deprecated Use getFocusPoolSnapshot instead.
   */
  public getPinnedFocusBlocks(): NeuralRoamHistoryEntry[] {
    return this.engineMode === 'hyperspace'
      ? this.hyperspaceEngine.getSessionFocusStack()
      : this.conceptQueue.getPinnedFocusBlocks();
  }

  /**
   * @deprecated Use setFocusPoolEntry instead.
   */
  public async setPinnedFocusBlock(blockId: string, pinned = true): Promise<void> {
    await this.setFocusPoolEntry(blockId, pinned);
  }

  public async jumpToHistoryNode(nodeId: string): Promise<boolean> {
    await this.ensureInitialLoad();
    const jumped = await this.getActiveEngine().jumpToHistoryNode(nodeId);
    if (jumped) {
      this.clearPendingAssociatedReviewCards();
      await this.save();
    }
    return jumped;
  }

  public async getPathItemByNodeId(blockId: string): Promise<FSRSCard | null> {
    await this.ensureInitialLoad();
    const queueItem = await this.getActiveEngine().getPathItemByNodeId(blockId);
    if (!queueItem) {
      return null;
    }
    void this.save().catch((error) => {
      logger.warn('Failed to persist neural roam state after getPathItemByNodeId:', error);
    });
    return this.convertToFSRSCard(queueItem);
  }

  public getNavigationState(): NeuralNavigationState {
    return this.getActiveEngine().getNavigationState();
  }

  public setNavigationMode(mode: NeuralNavigationMode): void {
    this.getActiveEngine().setNavigationMode(mode);
    void this.save().catch((error) => {
      logger.warn('Failed to persist neural roam state after setNavigationMode:', error);
    });
  }

  public returnToBookmark(): boolean {
    const moved = this.getActiveEngine().returnToBookmark();
    if (moved) {
      this.clearPendingAssociatedReviewCards();
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
    return this.getSourceSnapshot().length + this.pendingAssociatedReviewCards.length;
  }

  private async addConceptBlockToSeed(
    card: FSRSCard | ReviewQueueItem | string,
    priority: 'normal' | 'high',
  ): Promise<void> {
    const { blockId, conceptHint } = this.resolveAddTarget(card);
    if (!blockId) {
      throw new Error('Invalid card or block ID');
    }

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
      skipConceptValidation,
    });
  }

  private dedupeBulkAddInputs(cards: QueueBulkAddInput[]): {
    attemptedCount: number;
    failedIds: string[];
    items: Array<{ id: string; value: QueueBulkAddInput }>;
  } {
    const valuesById = new Map<string, QueueBulkAddInput>();
    const failedIds: string[] = [];

    for (const card of cards || []) {
      const id = this.safeResolveId(card);
      if (!id) {
        failedIds.push('');
        continue;
      }
      if (!valuesById.has(id)) {
        valuesById.set(id, card);
      }
    }

    return {
      attemptedCount: valuesById.size + failedIds.length,
      failedIds,
      items: Array.from(valuesById.entries()).map(([id, value]) => ({ id, value })),
    };
  }

  private safeResolveId(card: QueueBulkAddInput): string {
    try {
      return String(resolveCardId(card) || '').trim();
    } catch {
      return '';
    }
  }

  private uniqueNeuralBulkIds(ids: string[]): string[] {
    return Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));
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
      const localCard = this.findExactLocalCardByBlockId(cards, normalizedBlockId);
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

  private isLocalReviewCard(card: FSRSCard): boolean {
    if (this.isLocalConceptCard(card) || card.type === 'topic') {
      return false;
    }

    if (this.isNativeRiffManagedCard(card)) {
      return this.hasNativeRiffAnswerContract(card);
    }

    return true;
  }

  private isNativeRiffManagedCard(card: FSRSCard): boolean {
    const meta = this.readCardMeta(card);
    const riffCardId = typeof card.riffCardId === 'string' ? card.riffCardId.trim() : '';
    return this.readMetaString(meta, 'ownership') === 'riff-managed'
      || this.readMetaString(meta, 'source') === 'riff-sync'
      || this.readMetaString(meta, 'templateID') === 'builtin-riff-sync'
      || this.readMetaString(meta, 'schedulerType') === 'riff'
      || card.schedulerType === 'riff'
      || riffCardId.length > 0;
  }

  private hasNativeRiffAnswerContract(card: FSRSCard): boolean {
    const meta = this.readCardMeta(card);
    const templateId = this.readMetaString(meta, 'templateID');
    const cardTypeMarker = this.readMetaString(meta, 'cardTypeMarker');
    const renderProfile = this.readMetaString(meta, 'renderProfile');
    const clozeRenderMode = this.readMetaString(meta, 'clozeRenderMode');
    const source = this.readMetaString(meta, 'source');
    const cardSource = this.readMetaString(meta, 'cardSource');
    const symbolType = this.readMetaString(meta, 'symbolType');
    const quickDetectReason = this.readMetaString(meta, 'quickDetectReason');

    if (card.type === 'descriptor' || card.cardTypeMarker === 'descriptor' || cardTypeMarker === 'descriptor') {
      return true;
    }

    if (templateId && templateId !== 'builtin-riff-sync') {
      return true;
    }

    return renderProfile.length > 0
      || clozeRenderMode === 'inline-formula-cloze'
      || meta.forceQuickRender === true
      || meta.symbolDetected === true
      || source === 'symbol'
      || source === 'quick'
      || cardSource === 'quick-symbol'
      || symbolType.length > 0
      || quickDetectReason.length > 0
      || this.hasDistinctAnswerFace(meta);
  }

  private hasDistinctAnswerFace(meta: Record<string, unknown>): boolean {
    const faces = meta.faces;
    if (!Array.isArray(faces)) {
      return false;
    }

    return faces.some((face) => {
      if (!isRecord(face)) {
        return false;
      }
      const question = this.readMetaString(face, 'question');
      const answer = this.readMetaString(face, 'answer');
      return answer.length > 0 && answer !== question;
    });
  }

  private readCardMeta(card: FSRSCard): Record<string, unknown> {
    return isRecord(card.meta) ? card.meta : {};
  }

  private readMetaString(meta: Record<string, unknown>, key: string): string {
    const value = meta[key];
    return typeof value === 'string' ? value.trim() : '';
  }

  private async convertToFSRSCard(queueItem: ConceptQueueItem | HyperspaceQueueItem): Promise<FSRSCard> {
    const now = Date.now();
    const neuralContext = {
      associationType: queueItem.associationType,
      reason: queueItem.reason,
      blockType: queueItem.blockData.type,
      isFlashcard: false,
      nodeRole: 'virtual' as const,
    };
    return this.buildSyntheticNeuralCard(queueItem, now, neuralContext);
  }

  private async buildAssociatedReviewCard(
    localCard: FSRSCard,
    source: AssociatedReviewSource = {},
  ): Promise<FSRSCard> {
    const blockData = await this.queryEngine.fetchBlockData(localCard.blockId);
    const neuralContext = {
      associationType: 'associated-review',
      reason: source.sourceVirtualReason ?? 'associated-review',
      blockType: blockData?.type ?? '',
      isFlashcard: true,
      nodeRole: 'associated-review' as const,
      sourceVirtualNodeId: source.sourceVirtualNodeId ?? null,
      sourceVirtualEventId: source.sourceVirtualEventId ?? null,
      sourceVirtualReason: source.sourceVirtualReason ?? null,
    };

    return {
      ...this.cloneLocalCard(localCard),
      meta: isRecord(localCard.meta)
        ? {
            ...localCard.meta,
            neuralContext,
          }
        : {
            neuralContext,
          },
    };
  }

  private buildSyntheticNeuralCard(
    queueItem: ConceptQueueItem | HyperspaceQueueItem,
    now: number,
    neuralContext: {
      associationType: string;
      reason: string;
      blockType: string;
      isFlashcard: boolean;
      nodeRole: 'virtual' | 'associated-review';
      sourceVirtualNodeId?: string | null;
      sourceVirtualEventId?: string | null;
      sourceVirtualReason?: string | null;
    },
  ): FSRSCard {
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
      type: 'topic' as FSRSCard['type'],
      tags: [],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: now,
      updatedAt: now,
      meta: {
        neuralContext,
      },
    };
  }

  private cloneLocalCard(card: FSRSCard): FSRSCard {
    return JSON.parse(JSON.stringify(card)) as FSRSCard;
  }

  private findExactLocalCardByBlockId(cards: FSRSCard[], blockId: string): FSRSCard | null {
    return cards.find((card) => card.blockId === blockId) ?? null;
  }

}
