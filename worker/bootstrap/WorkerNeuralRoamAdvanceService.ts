import type {
  BackendNeuralGraphQueryRequest,
  BackendNeuralGraphQueryResult,
  BackendNeuralRoamAdvanceRequest,
  BackendNeuralRoamAdvanceResult,
  BackendNeuralRoamAdvanceUnavailableReason,
  BackendNeuralRoamCommandRequest,
  BackendNeuralRoamCommandResult,
  BackendNeuralRoamItem,
  BackendNeuralRoamViewState,
  BackendNeuralRoamViewStateRequest,
  BackendNeuralRoamViewStateResult,
  BackendReviewFeedbackQueueImpact,
} from '../../packages/contracts/src/backend-rpc';
import { NeuralRoamQueue } from '@/core/queue/domain/NeuralRoamQueue';
import { NeuralRoamRouteCatalog } from '@/core/queue/neural/routes';
import type { QueuePersistencePort } from '@/core/queue/domain/ports';
import type { NeuralGraphQueryPort } from '@/core/queue/neural/NeuralGraphQueryPort';
import { type CardFilter } from '@/types/unified-data-source';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { StructuredCardQuery } from '@/types/card-query';
import { DEFAULT_SETTINGS } from '@/types/settings';
import { SqlNeuralRoamRouteRepository } from '@/infrastructure/persistence/sqlite/SqlNeuralRoamRouteRepository';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';
import { applyWorkerNeuralRoamCommand } from './neuralRoamCommandPolicy';
import {
  WorkerNeuralRoamAdvanceResultCache,
  buildWorkerNeuralRoamAdvanceResult,
  buildWorkerNeuralRoamUnavailableAdvanceResult,
  buildWorkerNeuralRoamUnavailableProjectionImpact,
  readWorkerNeuralRoamNextItem,
  resolveWorkerNeuralRoamProjectionMismatch,
} from './neuralRoamAdvancePolicy';
import {
  isWorkerNeuralRoamAdvanceMismatchReason,
  resolveWorkerNeuralRoamAdvanceRequestedRouteId,
  resolveWorkerNeuralRoamCommandRouteMismatch,
  resolveWorkerNeuralRoamRouteMismatch,
  resolveWorkerNeuralRoamViewStateRequestedRouteId,
} from './neuralRoamRoutePolicy';
import {
  buildWorkerNeuralRoamViewState,
} from './neuralRoamViewStateBuilder';

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
  private readonly idempotentResults = new WorkerNeuralRoamAdvanceResultCache();
  private readonly graphQuery: NeuralGraphQueryPort;
  private readonly queuePersistence: QueuePersistencePort;
  private readonly routeCatalog: NeuralRoamRouteCatalog;
  private readonly routeRepository: SqlNeuralRoamRouteRepository;

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
    this.routeRepository = new SqlNeuralRoamRouteRepository(this.deps.database as never);
    this.routeCatalog = new NeuralRoamRouteCatalog({
      repository: this.routeRepository,
    });
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
      const mismatch = await resolveWorkerNeuralRoamProjectionMismatch(this.deps.database, request);
      if (mismatch) {
        return this.unavailable(request, mismatch, `NeuralRoam advance request is stale: ${mismatch}`);
      }

      const queue = await this.getQueue(request.sessionId ?? null);
      await queue.syncActiveRouteState();
      await this.routeCatalog.getState();
      const routeMismatch = resolveWorkerNeuralRoamRouteMismatch({
        requestKind: 'advance',
        requestedRouteId: resolveWorkerNeuralRoamAdvanceRequestedRouteId(request),
        activeRouteId: queue.getActiveRouteId(),
      });
      if (routeMismatch) {
        return this.rememberIdempotentResult(idempotencyKey, await this.buildResult(request, queue, 'mismatch', {
          nextItem: null,
          projectionImpact: buildWorkerNeuralRoamUnavailableProjectionImpact(request, routeMismatch.reason),
          unavailableReason: routeMismatch.reason,
          message: routeMismatch.message,
        }));
      }
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
    return this.idempotentResults.remember(idempotencyKey, result);
  }

  private async getQueue(sessionId: string | null): Promise<NeuralRoamQueue> {
    await this.deps.database.init();
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
          routeCatalog: this.routeCatalog,
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

  async readViewState(request: BackendNeuralRoamViewStateRequest): Promise<BackendNeuralRoamViewStateResult> {
    if (!this.deps.resolveNeuralGraphQuery) {
      return {
        queueType: 'neural-roam',
        status: 'unavailable',
        viewState: null,
        unavailableReason: 'advance-contract-unavailable',
        message: 'NeuralRoam graph query host effect is unavailable',
      };
    }
    if (request.queueType !== 'neural-roam') {
      return {
        queueType: 'neural-roam',
        status: 'unavailable',
        viewState: null,
        unavailableReason: 'invalid-request',
        message: `Unsupported queueType: ${String(request.queueType || '')}`,
      };
    }
    try {
      const queue = await this.getQueue(request.sessionId ?? null);
      await queue.syncActiveRouteState();
      const routeMismatch = resolveWorkerNeuralRoamRouteMismatch({
        requestKind: 'view-state',
        requestedRouteId: resolveWorkerNeuralRoamViewStateRequestedRouteId(request),
        activeRouteId: queue.getActiveRouteId(),
      });
      if (routeMismatch) {
        return {
          queueType: 'neural-roam',
          status: 'mismatch',
          viewState: await buildWorkerNeuralRoamViewState(queue),
          unavailableReason: routeMismatch.reason,
          message: routeMismatch.message,
        };
      }
      return {
        queueType: 'neural-roam',
        status: 'ready',
        viewState: await buildWorkerNeuralRoamViewState(queue),
        unavailableReason: null,
        message: null,
      };
    } catch (error) {
      return {
        queueType: 'neural-roam',
        status: 'failed',
        viewState: null,
        unavailableReason: 'failed',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async executeCommand(request: BackendNeuralRoamCommandRequest): Promise<BackendNeuralRoamCommandResult> {
    if (!this.deps.resolveNeuralGraphQuery) {
      return this.commandUnavailable(null, 'advance-contract-unavailable', 'NeuralRoam graph query host effect is unavailable');
    }
    if (request.queueType !== 'neural-roam' || !isRecord(request.command)) {
      return this.commandUnavailable(null, 'invalid-request', 'neural-roam.command requires a command payload');
    }
    try {
      const queue = await this.getQueue(request.sessionId ?? null);
      await queue.syncActiveRouteState();
      const routeMismatch = resolveWorkerNeuralRoamCommandRouteMismatch(request.command, queue.getActiveRouteId());
      if (routeMismatch) {
        return {
          queueType: 'neural-roam',
          status: 'mismatch',
          viewState: await buildWorkerNeuralRoamViewState(queue),
          queueState: queue.exportPersistedState() as Record<string, unknown>,
          unavailableReason: routeMismatch.reason,
          message: routeMismatch.message,
        };
      }
      await applyWorkerNeuralRoamCommand(queue, request.command);
      await queue.syncActiveRouteState();
      return {
        queueType: 'neural-roam',
        status: 'ok',
        viewState: await buildWorkerNeuralRoamViewState(queue),
        queueState: queue.exportPersistedState() as Record<string, unknown>,
        unavailableReason: null,
        message: null,
      };
    } catch (error) {
      return this.commandUnavailable(null, 'failed', error instanceof Error ? error.message : String(error));
    }
  }

  private commandUnavailable(
    viewState: BackendNeuralRoamViewState | null,
    reason: BackendNeuralRoamAdvanceUnavailableReason,
    message: string,
  ): BackendNeuralRoamCommandResult {
    return {
      queueType: 'neural-roam',
      status: isWorkerNeuralRoamAdvanceMismatchReason(reason) ? 'mismatch' : reason === 'failed' ? 'failed' : 'unavailable',
      viewState,
      queueState: null,
      unavailableReason: reason,
      message,
    };
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
    await this.applyStartConceptSeed(queue, {
      conceptBlockId: request.startFromFocus?.conceptBlockId,
      seedBlockId: request.startFromFocus?.seedBlockId,
    });
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

  private async applyStartConceptSeed(
    queue: NeuralRoamQueue,
    input: {
      conceptBlockId: unknown;
      seedBlockId: unknown;
    },
  ): Promise<void> {
    const trustedConceptBlockId = normalizeString(input.conceptBlockId);
    const candidateSeedBlockId = trustedConceptBlockId || normalizeString(input.seedBlockId);
    const normalized = trustedConceptBlockId || await this.resolveConceptSeedCandidate(candidateSeedBlockId);
    if (!normalized) {
      return;
    }
    const now = Date.now();
    await queue.addCard({
      id: normalized,
      xiuyuanID: normalized,
      blockId: normalized,
      due: now,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      state: CardState.New,
      lastReview: now,
      elapsedDays: 0,
      scheduledDays: 0,
      priority: 50,
      type: CardType.Concept,
      tags: [],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: now,
      updatedAt: now,
      meta: { cardTypeMarker: 'concept' },
    } as FSRSCard, 'normal');
  }

  private async resolveConceptSeedCandidate(seedBlockId: string): Promise<string | null> {
    const normalized = normalizeString(seedBlockId);
    if (!normalized) {
      return null;
    }
    const result = await this.graphQuery.query<boolean>({
      operation: 'isConceptCard',
      blockId: normalized,
    });
    return result.status === 'found' && result.data === true ? normalized : null;
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
    return readWorkerNeuralRoamNextItem(queue, (card) => this.toAdvanceItem(card));
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
    return buildWorkerNeuralRoamAdvanceResult({
      request,
      queue,
      status,
      nextItem: input.nextItem,
      projectionImpact: input.projectionImpact,
      unavailableReason: input.unavailableReason,
      message: input.message,
    });
  }

  private async unavailable(
    request: BackendNeuralRoamAdvanceRequest,
    reason: BackendNeuralRoamAdvanceUnavailableReason,
    message: string,
  ): Promise<BackendNeuralRoamAdvanceResult> {
    const queue = this.queues.get(this.storageKeyForSession(request.sessionId ?? null)) ?? null;
    return buildWorkerNeuralRoamUnavailableAdvanceResult({
      request,
      queue,
      reason,
      message,
    });
  }
}
