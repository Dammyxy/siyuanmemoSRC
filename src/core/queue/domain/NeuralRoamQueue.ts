/**
 * Neural Roam Queue
 */

import { BaseReviewQueue } from './BaseReviewQueue';
import {
  type NeuralActivationTrace,
  type NeuralEngineMode,
  type NeuralRoamSourceEntry,
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
import {
  HyperspaceEngine,
  type QueueItem as HyperspaceQueueItem,
  type HyperspacePersistedEntry,
  type HyperspaceSessionState,
} from '../neural/hyperspace/HyperspaceEngine';
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

interface NeuralRoamQueueOptions {
  cardTypeResolver?: NeuralRoamCardTypeResolverPort;
  getHyperspaceSettings?: () => HyperspaceSettings;
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
  private readonly hyperspaceEngine: HyperspaceEngine;
  private readonly STORAGE_KEY = 'neuralRoamQueue';
  private readonly queuePersistence: QueuePersistencePort;
  private readonly cardTypeResolver: NeuralRoamCardTypeResolverPort;
  private readonly getHyperspaceSettings?: () => HyperspaceSettings;
  private readonly cardTypeCache = new Map<string, CachedCardType>();
  private readonly cardTypeCacheTtlMs = 60_000;
  private readonly maxCardTypeCacheSize = 256;
  private engineMode: NeuralEngineMode = 'orbit';

  constructor(
    manager: UnifiedDataSourceManager,
    queuePersistence: QueuePersistencePort,
    options: NeuralRoamQueueOptions = {}
  ) {
    super(manager, QueueType.NeuralRoam);
    this.queuePersistence = queuePersistence;
    this.cardTypeResolver = options.cardTypeResolver ?? DEFAULT_CARD_TYPE_RESOLVER;
    this.getHyperspaceSettings = options.getHyperspaceSettings;
    this.conceptQueue = new ConceptNeuralQueue({
      isConceptCard: async (blockId: string) => {
        const conceptStatus = await this.resolveConceptStatusFromLocalCards(blockId);
        if (conceptStatus === 'unknown') {
          throw new Error(`Local concept status unavailable for block ${blockId}`);
        }
        return conceptStatus === 'concept';
      },
    });
    this.hyperspaceEngine = new HyperspaceEngine(undefined, {
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
    const history = activeEngine.getHistorySnapshot();
    const sessionId = navState.sessionId;
    const path = history
      .filter((entry) => !sessionId || entry.sessionId === sessionId)
      .reduce<string[]>((result, entry) => {
        if (result[result.length - 1] !== entry.nodeId) {
          result.push(entry.nodeId);
        }
        return result;
      }, []);
    const safeLimit = Math.max(1, Math.min(Math.floor(limit), 500));
    return path.slice(Math.max(0, path.length - safeLimit));
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

    if (isNeuralRoamPersistedStateV7(rawState)) {
      this.engineMode = rawState.engineMode;
      this.conceptQueue.restoreSeedPoolState(rawState.orbit.seedPool);
      this.conceptQueue.restoreAnchorPoolState(rawState.orbit.anchorPool);
      this.conceptQueue.restoreSessionState(rawState.orbit.session);
      this.hyperspaceEngine.restoreSourcePoolState(rawState.hyperspace.sourcePool);
      this.hyperspaceEngine.restoreAnchorPoolState(rawState.hyperspace.anchorPool);
      this.hyperspaceEngine.restoreSessionState(rawState.hyperspace.session);
      if (fromStorage) {
        logger.info(`Loaded neural roam state (v7), engineMode=${this.engineMode}`);
      }
    } else if (isNeuralRoamPersistedStateV6(rawState)) {
      this.engineMode = 'orbit';
      this.conceptQueue.restoreSeedPoolState(rawState.seedPool);
      this.conceptQueue.restoreAnchorPoolState(rawState.anchorPool);
      this.conceptQueue.restoreSessionState(rawState.session);
      if (fromStorage) {
        logger.info(`Migrated neural roam state v6->v7, seedPool=${rawState.seedPool.length}, anchorPool=${rawState.anchorPool.length}`);
      }
      this.hyperspaceEngine.restoreSourcePoolState([]);
      this.hyperspaceEngine.restoreAnchorPoolState([]);
      this.hyperspaceEngine.restoreSessionState(null);
      persistRequired = true;
    } else if (isNeuralRoamPersistedStateV5(rawState)) {
      this.engineMode = 'orbit';
      this.conceptQueue.restoreSeedPoolState(rawState.seedPool);
      this.conceptQueue.restoreAnchorPoolState(rawState.anchorPool);
      this.conceptQueue.restoreSessionState(rawState.session);
      if (fromStorage) {
        logger.info(`Migrated neural roam state v5->v7, seedPool=${rawState.seedPool.length}, anchorPool=${rawState.anchorPool.length}`);
      }
      this.hyperspaceEngine.restoreSourcePoolState([]);
      this.hyperspaceEngine.restoreAnchorPoolState([]);
      this.hyperspaceEngine.restoreSessionState(null);
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
        logger.info(`Migrated neural roam state v4->v7, seedPool=${seedPool.length}, anchorPool=${anchorPool.length}`);
      }
      this.hyperspaceEngine.restoreSourcePoolState([]);
      this.hyperspaceEngine.restoreAnchorPoolState([]);
      this.hyperspaceEngine.restoreSessionState(null);
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
        logger.info(`Migrated neural roam state v3->v7, seedPool=${seedPool.length}, anchorPool=${anchorPool.length}`);
      }
      this.hyperspaceEngine.restoreSourcePoolState([]);
      this.hyperspaceEngine.restoreAnchorPoolState([]);
      this.hyperspaceEngine.restoreSessionState(null);
      persistRequired = true;
    } else {
      logger.info('Legacy neural roam state detected, reset to v7 schema');
      this.engineMode = 'orbit';
      this.conceptQueue.restoreSeedPoolState([]);
      this.conceptQueue.restoreAnchorPoolState([]);
      this.conceptQueue.restoreSessionState(null);
      this.conceptQueue.clearHistory('all');
      this.hyperspaceEngine.restoreSourcePoolState([]);
      this.hyperspaceEngine.restoreAnchorPoolState([]);
      this.hyperspaceEngine.restoreSessionState(null);
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
    const data: NeuralRoamPersistedStateV7 = {
      version: 7,
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

  public async getNextCard(): Promise<FSRSCard | null> {
    await this.ensureInitialLoad();
    const queueItem = await this.getActiveEngine().getNextCard();
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

    const history = this.hyperspaceEngine.getHistorySnapshot();
    const latest = history[history.length - 1];
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

    const history = this.conceptQueue.getHistorySnapshot();
    const latest = history[history.length - 1];
    return latest?.nodeId === normalized && latest.activationKind === 'focus-root';
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

  public async startRoamingFromFocus(
    focusId: string,
    options: {
      includeFocusAsFirst?: boolean;
      resetHistory?: boolean;
    } = {}
  ): Promise<void> {
    await this.ensureInitialLoad();
    await this.getActiveEngine().startRoamingFromFocus(focusId, options);
    await this.save();
  }

  public getHistorySnapshot(): NeuralRoamHistoryEntry[] {
    return this.getActiveEngine().getHistorySnapshot();
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
    return this.getSourceSnapshot().length;
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

  private async convertToFSRSCard(queueItem: ConceptQueueItem | HyperspaceQueueItem): Promise<FSRSCard> {
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
