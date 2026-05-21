import type {
  BackendNeuralGraphQueryRequest,
  BackendNeuralGraphQueryResult,
  BackendNeuralRoamAdvanceRequest,
  BackendNeuralRoamAdvanceResult,
  BackendNeuralRoamAdvanceUnavailableReason,
  BackendNeuralRoamCounters,
  BackendNeuralRoamItem,
  BackendReviewFeedbackQueueImpact,
} from '../../packages/contracts/src/backend-rpc';
import { NeuralRoamQueue } from '@/core/queue/domain/NeuralRoamQueue';
import type { QueuePersistencePort } from '@/core/queue/domain/ports';
import type { NeuralGraphQueryPort } from '@/core/queue/neural/NeuralGraphQueryPort';
import { type CardFilter } from '@/types/unified-data-source';
import { CardType, type FSRSCard } from '@/types/card';
import type { StructuredCardQuery } from '@/types/card-query';
import { DEFAULT_SETTINGS } from '@/types/settings';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';

interface WorkerNeuralRoamAdvanceServiceDeps {
  database: WorkerSqliteDatabaseService;
  resolveNeuralGraphQuery?: (
    request: BackendNeuralGraphQueryRequest,
  ) => Promise<BackendNeuralGraphQueryResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeRating(value: unknown): 1 | 2 | 3 | 4 | null {
  const rating = Math.floor(Number(value));
  return rating >= 1 && rating <= 4 ? rating as 1 | 2 | 3 | 4 : null;
}

function clonePlainCard(card: FSRSCard): FSRSCard {
  return JSON.parse(JSON.stringify(card)) as FSRSCard;
}

function isAssociatedReviewItem(item: BackendNeuralRoamItem | Record<string, unknown> | null | undefined): boolean {
  const meta = isRecord(item?.meta) ? item.meta : null;
  const neuralContext = isRecord(meta?.neuralContext) ? meta.neuralContext : null;
  return item?.sourceKind === 'associated-review'
    || neuralContext?.isFlashcard === true
    || neuralContext?.nodeRole === 'associated-review';
}

function mapCardFilterToStructuredQuery(filter?: CardFilter): StructuredCardQuery {
  const cardTypes = Array.isArray(filter?.cardType)
    ? filter.cardType
    : filter?.cardType
      ? [filter.cardType]
      : undefined;
  const query: StructuredCardQuery = {
    cardTypes: cardTypes as CardType[] | undefined,
    blockIds: Array.isArray(filter?.blockIds) ? filter.blockIds : undefined,
    tags: filter?.tags,
    priority: filter?.priority,
    sourceStatus: 'active',
  };
  return query;
}

export class WorkerNeuralRoamAdvanceService {
  private readonly queues = new Map<string, NeuralRoamQueue>();
  private readonly loadPromises = new Map<string, Promise<void>>();
  private readonly idempotentResults = new Map<string, BackendNeuralRoamAdvanceResult>();
  private readonly graphQuery: NeuralGraphQueryPort;
  private readonly queuePersistence: QueuePersistencePort;

  constructor(private readonly deps: WorkerNeuralRoamAdvanceServiceDeps) {
    this.graphQuery = {
      query: async <TData = unknown>(request: BackendNeuralGraphQueryRequest) => {
        if (!this.deps.resolveNeuralGraphQuery) {
          return {
            status: 'failed',
            blockId: request.blockId,
            data: null,
            error: 'SrsBackendWorker neural graph query host effect is unavailable',
          } as BackendNeuralGraphQueryResult<TData>;
        }
        return this.deps.resolveNeuralGraphQuery(request) as Promise<BackendNeuralGraphQueryResult<TData>>;
      },
    };
    this.queuePersistence = {
      get: <T>(key: string): T | null => {
        throw new Error(`Queue state ${key} must be loaded asynchronously through backend advance`);
      },
      set: async (key: string, value: unknown): Promise<void> => {
        await this.deps.database.setQueueStateValue(key, value);
      },
    };
  }

  async advance(request: BackendNeuralRoamAdvanceRequest): Promise<BackendNeuralRoamAdvanceResult> {
    const idempotencyKey = normalizeString(request.idempotencyKey);
    if (idempotencyKey) {
      const cached = this.idempotentResults.get(idempotencyKey);
      if (cached) {
        return cached;
      }
    }

    if (!this.deps.resolveNeuralGraphQuery) {
      return this.unavailable(request, 'advance-contract-unavailable', 'NeuralRoam graph query host effect is unavailable');
    }
    if (request.queueType !== 'neural-roam') {
      return this.unavailable(request, 'invalid-request', `Unsupported queueType: ${String(request.queueType || '')}`);
    }

    try {
      const mismatch = await this.resolveProjectionMismatch(request);
      if (mismatch) {
        return this.unavailable(request, mismatch, `NeuralRoam advance request is stale: ${mismatch}`);
      }

      const queue = await this.getQueue(request.sessionId ?? null);
      let projectionImpact: BackendReviewFeedbackQueueImpact | null = null;
      const focusStart = await this.applyStartFromFocusRequest(queue, request);
      if (focusStart.applied && focusStart.nextItem) {
        return this.rememberIdempotentResult(idempotencyKey, await this.buildResult(request, queue, 'advanced', {
          nextItem: focusStart.nextItem,
          projectionImpact,
          unavailableReason: null,
          message: null,
        }));
      }
      if (focusStart.applied && focusStart.unavailableReason) {
        return this.rememberIdempotentResult(idempotencyKey, await this.buildResult(request, queue, 'unavailable', {
          nextItem: null,
          projectionImpact,
          unavailableReason: focusStart.unavailableReason,
          message: focusStart.message,
        }));
      }
      const missingReason = await this.resolveKnownMissingCurrentItemReason(request.currentItem);
      if (missingReason) {
        const nextItem = await this.readNextItem(queue);
        return this.rememberIdempotentResult(idempotencyKey, await this.buildResult(request, queue, 'unavailable', {
          nextItem,
          projectionImpact,
          unavailableReason: missingReason,
          message: 'Current NeuralRoam item source is known missing',
        }));
      }

      if (request.feedback?.action === 'rate') {
        const rating = normalizeRating(request.feedback.rating);
        if (!rating) {
          return this.unavailable(request, 'invalid-request', 'NeuralRoam rate feedback requires rating 1-4');
        }
        if (isAssociatedReviewItem(request.currentItem)) {
          const currentId = this.resolveCurrentCardId(request.currentItem);
          if (currentId) {
            const reviewResult = await this.deps.database.reviewFeedback({
              cardId: currentId,
              rating,
              queueType: 'neural-roam',
              queueMode: 'formal',
              commitPolicy: 'write-schedule',
              sessionId: request.sessionId ?? undefined,
              reviewedAt: Number(request.reviewedAt || Date.now()),
              projectionGeneration: request.projectionGeneration ?? undefined,
              projectionPolicyHash: request.policyHash ?? undefined,
              scheduler: request.scheduler,
            });
            projectionImpact = reviewResult.queueImpact ?? null;
          }
        }
      }

      if (request.feedback?.action === 'rate' || request.feedback?.action === 'skip') {
        await this.ensureVirtualCurrentItemSession(queue, request.currentItem);
      }

      const nextItem = await this.readNextItem(queue);
      return this.rememberIdempotentResult(idempotencyKey, await this.buildResult(request, queue, nextItem ? 'advanced' : 'exhausted', {
        nextItem,
        projectionImpact,
        unavailableReason: null,
        message: null,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const reason: BackendNeuralRoamAdvanceUnavailableReason = message.includes('NEURAL_ROAM_QUERY_UNAVAILABLE')
        || message.includes('graph query')
        ? 'graph-query-unavailable'
        : 'failed';
      return this.unavailable(request, reason, message);
    }
  }

  private rememberIdempotentResult(
    idempotencyKey: string,
    result: BackendNeuralRoamAdvanceResult,
  ): BackendNeuralRoamAdvanceResult {
    if (!idempotencyKey) {
      return result;
    }
    this.idempotentResults.set(idempotencyKey, result);
    if (this.idempotentResults.size > 500) {
      const firstKey = this.idempotentResults.keys().next().value;
      if (firstKey) {
        this.idempotentResults.delete(firstKey);
      }
    }
    return result;
  }

  private async getQueue(sessionId: string | null): Promise<NeuralRoamQueue> {
    const storageKey = this.storageKeyForSession(sessionId);
    let queue = this.queues.get(storageKey) ?? null;
    if (!queue) {
      queue = new NeuralRoamQueue(
        this.createManagerFacade() as never,
        await this.createLoadedQueuePersistence(storageKey),
        {
          graphQuery: this.graphQuery,
          storageKey,
          getHistoryLimit: () => DEFAULT_SETTINGS.queues.neuralRoam?.history?.maxEntries ?? 3000,
          getHyperspaceSettings: () => DEFAULT_SETTINGS.queues.neuralRoam!.hyperspace,
        },
      );
      this.queues.set(storageKey, queue);
      this.loadPromises.set(storageKey, queue.load());
    }
    const loadPromise = this.loadPromises.get(storageKey);
    if (loadPromise) {
      await loadPromise;
      this.loadPromises.delete(storageKey);
    }
    return queue;
  }

  private async applyStartFromFocusRequest(
    queue: NeuralRoamQueue,
    request: BackendNeuralRoamAdvanceRequest,
  ): Promise<{
    applied: boolean;
    nextItem: BackendNeuralRoamItem | null;
    unavailableReason: BackendNeuralRoamAdvanceUnavailableReason | null;
    message: string | null;
  }> {
    const blockId = normalizeString(request.startFromFocus?.blockId);
    if (!blockId) {
      return { applied: false, nextItem: null, unavailableReason: null, message: null };
    }
    if (request.feedback || request.currentItem) {
      throw new Error('INVALID_REQUEST: neural-roam startFromFocus cannot be combined with current item feedback');
    }

    const includeFocusAsFirst = request.startFromFocus?.includeFocusAsFirst !== false;
    const sourceReviewCardId = normalizeString(request.startFromFocus?.sourceReviewCardId);
    await queue.startRoamingFromFocus(blockId, {
      includeFocusAsFirst,
      resetHistory: request.startFromFocus?.resetHistory === true,
      startNewSession: request.startFromFocus?.startNewSession === true,
    });

    if (!includeFocusAsFirst) {
      return { applied: true, nextItem: null, unavailableReason: null, message: null };
    }
    if (sourceReviewCardId) {
      const sourceReviewCard = await this.createManagerFacade().getCard(sourceReviewCardId, { silent: true });
      if (sourceReviewCard) {
        return {
          applied: true,
          nextItem: this.toAdvanceItem(sourceReviewCard),
          unavailableReason: null,
          message: null,
        };
      }
    }
    const focusItem = await queue.getPathItemByNodeId(blockId);
    return focusItem
      ? { applied: true, nextItem: this.toAdvanceItem(focusItem), unavailableReason: null, message: null }
      : {
        applied: true,
        nextItem: null,
        unavailableReason: 'source-block-missing',
        message: `NeuralRoam focus source is unavailable: ${blockId}`,
      };
  }

  private async createLoadedQueuePersistence(storageKey: string): Promise<QueuePersistencePort> {
    const cache = new Map<string, unknown>();
    const state = await this.deps.database.getQueueStateValue<unknown>(storageKey);
    if (state != null) {
      cache.set(storageKey, state);
    } else if (storageKey !== 'neuralRoamQueue') {
      const oldState = await this.deps.database.getQueueStateValue<unknown>('neuralRoamQueue');
      if (oldState != null) {
        cache.set(storageKey, oldState);
      }
    }
    return {
      get: <T>(key: string): T | null => (
        cache.has(key) ? cache.get(key) as T : null
      ),
      set: async (key: string, value: unknown): Promise<void> => {
        cache.set(key, value);
        await this.queuePersistence.set(key, value);
      },
    };
  }

  private storageKeyForSession(sessionId: string | null): string {
    const normalized = normalizeString(sessionId);
    return normalized ? `neuralRoamQueue:${normalized}` : 'neuralRoamQueue';
  }

  private async resolveProjectionMismatch(
    request: BackendNeuralRoamAdvanceRequest,
  ): Promise<BackendNeuralRoamAdvanceUnavailableReason | null> {
    const requestedGeneration = Number(request.projectionGeneration);
    const requestedPolicyHash = normalizeString(request.policyHash);
    if ((!Number.isFinite(requestedGeneration) || requestedGeneration <= 0) && !requestedPolicyHash) {
      return null;
    }

    const current = await this.deps.database.getQueueProjectionGeneration('neural-roam');
    if (!current || current.status !== 'ready') {
      return 'generation-mismatch';
    }
    if (Number.isFinite(requestedGeneration)
        && requestedGeneration > 0
        && current.generation !== Math.floor(requestedGeneration)) {
      return 'generation-mismatch';
    }
    if (requestedPolicyHash && current.policyHash !== requestedPolicyHash) {
      return 'policy-mismatch';
    }
    return null;
  }

  private createManagerFacade(): {
    getCards(filter?: CardFilter): Promise<FSRSCard[]>;
    getCard(cardId: string, options?: { silent?: boolean }): Promise<FSRSCard | null>;
    notifyObservers(): void;
  } {
    return {
      getCards: async (filter?: CardFilter): Promise<FSRSCard[]> => this.deps.database.queryCards(
        mapCardFilterToStructuredQuery(filter),
      ),
      getCard: async (cardId: string, options?: { silent?: boolean }): Promise<FSRSCard | null> => {
        const normalized = normalizeString(cardId);
        const byId = normalized ? await this.deps.database.getCard(normalized) : null;
        if (byId) {
          const status = await this.deps.database.getSourceExistenceByBlockIds([byId.blockId]);
          const sourceExists = status.find((row) => row.blockId === byId.blockId)?.exists;
          if (sourceExists !== false) {
            return byId;
          }
        }
        const [byBlockId] = normalized
          ? await this.deps.database.queryCards({ blockIds: [normalized], sourceStatus: 'active' })
          : [];
        if (byBlockId) {
          return byBlockId;
        }
        if (options?.silent) {
          return null;
        }
        throw new Error(`Card not found: ${cardId}`);
      },
      notifyObservers: () => undefined,
    };
  }

  private resolveCurrentCardId(item: BackendNeuralRoamItem | Record<string, unknown> | null | undefined): string | null {
    if (!item) {
      return null;
    }
    return normalizeString(item.cardId)
      || normalizeString(item.id)
      || normalizeString(item.blockId)
      || null;
  }

  private async resolveKnownMissingCurrentItemReason(
    item: BackendNeuralRoamItem | Record<string, unknown> | null | undefined,
  ): Promise<BackendNeuralRoamAdvanceUnavailableReason | null> {
    const blockId = normalizeString(item?.blockId);
    if (!blockId) {
      return null;
    }
    const status = await this.deps.database.getSourceExistenceByBlockIds([blockId]);
    const exists = status.find((row) => row.blockId === blockId)?.exists;
    return exists === false ? 'source-block-missing' : null;
  }

  private async readNextItem(queue: NeuralRoamQueue): Promise<BackendNeuralRoamItem | null> {
    const card = await queue.getNextCard();
    if (!card) {
      return null;
    }
    return this.toAdvanceItem(card);
  }

  private async ensureVirtualCurrentItemSession(
    queue: NeuralRoamQueue,
    item: BackendNeuralRoamItem | Record<string, unknown> | null | undefined,
  ): Promise<void> {
    if (!item || isAssociatedReviewItem(item)) {
      return;
    }

    const blockId = normalizeString(item.blockId)
      || normalizeString(item.cardId)
      || normalizeString(item.id);
    if (!blockId) {
      return;
    }

    if (queue.getSourceSnapshot().length === 0) {
      return;
    }

    const navigation = queue.getNavigationState();
    if (normalizeString(navigation.currentNodeId) === blockId) {
      return;
    }

    await queue.startRoamingFromFocus(blockId, {
      includeFocusAsFirst: true,
      resetHistory: false,
    });
  }

  private toAdvanceItem(card: FSRSCard): BackendNeuralRoamItem {
    const payload = clonePlainCard(card);
    const meta = isRecord(payload.meta) ? payload.meta : {};
    const neuralContext = isRecord(meta.neuralContext) ? meta.neuralContext : null;
    const sourceKind = neuralContext?.isFlashcard === true
      ? 'associated-review'
      : 'virtual';
    return {
      id: normalizeString(payload.id) || normalizeString(payload.blockId),
      cardId: normalizeString(payload.id) || normalizeString(payload.blockId),
      blockId: normalizeString(payload.blockId) || normalizeString(payload.id),
      deckId: normalizeString((payload as { deckId?: unknown }).deckId) || 'neural-roam',
      due: Number.isFinite(Number(payload.due)) ? Number(payload.due) : null,
      type: normalizeString(payload.type || CardType.Topic),
      meta,
      sourceKind,
      payload: payload as unknown as Record<string, unknown>,
    };
  }

  private async readCounters(queue: NeuralRoamQueue): Promise<BackendNeuralRoamCounters> {
    const total = await queue.getSize();
    const sourceNodes = queue.getSourceSnapshot().length;
    return {
      remaining: total,
      due: total,
      total,
      pendingAssociatedReview: Math.max(0, total - sourceNodes),
      sourceNodes,
    };
  }

  private async buildResult(
    request: BackendNeuralRoamAdvanceRequest,
    queue: NeuralRoamQueue,
    status: BackendNeuralRoamAdvanceResult['status'],
    input: {
      nextItem: BackendNeuralRoamItem | null;
      projectionImpact: BackendReviewFeedbackQueueImpact | null;
      unavailableReason: BackendNeuralRoamAdvanceUnavailableReason | null;
      message?: string | null;
    },
  ): Promise<BackendNeuralRoamAdvanceResult> {
    const navigation = queue.getNavigationState();
    const counters = await this.readCounters(queue);
    if (status === 'exhausted') {
      counters.remaining = 0;
      counters.due = 0;
      counters.total = 0;
      counters.pendingAssociatedReview = 0;
    }
    const sessionId = request.sessionId ?? navigation.sessionId ?? navigation.engineSessionId ?? null;
    return {
      queueType: 'neural-roam',
      sessionId,
      status,
      nextItem: input.nextItem,
      counters,
      sessionState: {
        sessionId,
        engineMode: navigation.engineMode ?? null,
        currentNodeId: navigation.currentNodeId ?? null,
        currentEventId: navigation.currentEventId ?? null,
        pathLength: Math.max(0, Math.floor(Number(navigation.pathLength || 0))),
        historyCount: queue.getHistoryCount(navigation.sessionId ?? null),
        exhausted: status === 'exhausted',
        projectionGeneration: request.projectionGeneration ?? null,
        policyHash: request.policyHash ?? null,
      },
      queueState: queue.exportPersistedState(),
      projectionImpact: input.projectionImpact,
      unavailableReason: input.unavailableReason,
      message: input.message ?? null,
    };
  }

  private async unavailable(
    request: BackendNeuralRoamAdvanceRequest,
    reason: BackendNeuralRoamAdvanceUnavailableReason,
    message: string,
  ): Promise<BackendNeuralRoamAdvanceResult> {
    const projectionImpact = this.buildUnavailableProjectionImpact(request, reason);
    const queue = this.queues.get(this.storageKeyForSession(request.sessionId ?? null)) ?? null;
    if (queue) {
      return this.buildResult(request, queue, reason === 'generation-mismatch' || reason === 'policy-mismatch' ? 'mismatch' : 'unavailable', {
        nextItem: null,
        projectionImpact,
        unavailableReason: reason,
        message,
      });
    }
    return {
      queueType: 'neural-roam',
      sessionId: request.sessionId ?? null,
      status: reason === 'generation-mismatch' || reason === 'policy-mismatch' ? 'mismatch' : 'unavailable',
      nextItem: null,
      counters: {
        remaining: 0,
        due: 0,
        total: 0,
        pendingAssociatedReview: 0,
        sourceNodes: 0,
      },
      sessionState: {
        sessionId: request.sessionId ?? null,
        engineMode: null,
        currentNodeId: null,
        currentEventId: null,
        pathLength: 0,
        historyCount: 0,
        exhausted: false,
        projectionGeneration: request.projectionGeneration ?? null,
        policyHash: request.policyHash ?? null,
      },
      queueState: null,
      projectionImpact,
      unavailableReason: reason,
      message,
    };
  }

  private buildUnavailableProjectionImpact(
    request: BackendNeuralRoamAdvanceRequest,
    reason: BackendNeuralRoamAdvanceUnavailableReason,
  ): BackendReviewFeedbackQueueImpact | null {
    if (reason !== 'generation-mismatch' && reason !== 'policy-mismatch') {
      return null;
    }
    return {
      hotPatchable: false,
      refreshRequired: true,
      affectedQueues: [{
        queueType: 'neural-roam',
        policyHash: request.policyHash ?? null,
        generation: null,
        currentGeneration: null,
        requestedGeneration: request.projectionGeneration ?? null,
        hotPatchable: false,
        refreshRequired: true,
        reason,
        removedRowIds: [],
        insertedRows: [],
        updatedRows: [],
        reorderHints: [],
        counterGeneration: null,
        counters: null,
      }],
    };
  }
}
