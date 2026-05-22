import type {
  BackendNeuralGraphQueryRequest,
  BackendNeuralGraphQueryResult,
  BackendNeuralRoamAdvanceRequest,
  BackendNeuralRoamAdvanceResult,
  BackendNeuralRoamAdvanceUnavailableReason,
  BackendNeuralRoamCommandRequest,
  BackendNeuralRoamCommandResult,
  BackendNeuralRoamCounters,
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
import { SqlNeuralRoamRouteMigrationService } from '@/infrastructure/persistence/sqlite/SqlNeuralRoamRouteMigrationService';
import { SqlQueueStateRepository } from '@/infrastructure/persistence/sqlite/SqlQueueStateRepository';
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
  private readonly routeCatalog: NeuralRoamRouteCatalog;
  private readonly routeRepository: SqlNeuralRoamRouteRepository;
  private routeMigrationPromise: Promise<void> | null = null;

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
      const mismatch = await this.resolveProjectionMismatch(request);
      if (mismatch) {
        return this.unavailable(request, mismatch, `NeuralRoam advance request is stale: ${mismatch}`);
      }

      const queue = await this.getQueue(request.sessionId ?? null);
      await queue.syncActiveRouteState();
      const routeMismatch = await this.resolveRouteMismatch(queue, request);
      if (routeMismatch) {
        return this.rememberIdempotentResult(idempotencyKey, await this.buildResult(request, queue, 'mismatch', {
          nextItem: null,
          projectionImpact: this.buildUnavailableProjectionImpact(request, routeMismatch),
          unavailableReason: routeMismatch,
          message: 'NeuralRoam advance request route is no longer active',
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
    await this.ensureRoutesMigrated();
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
      const activeRouteId = normalizeString(queue.getActiveRouteId());
      const requestedRouteId = normalizeString(request.routeId);
      if (requestedRouteId && activeRouteId && requestedRouteId !== activeRouteId) {
        return {
          queueType: 'neural-roam',
          status: 'mismatch',
          viewState: await this.buildViewState(queue),
          unavailableReason: 'route-mismatch',
          message: 'NeuralRoam view-state request route is no longer active',
        };
      }
      return {
        queueType: 'neural-roam',
        status: 'ready',
        viewState: await this.buildViewState(queue),
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
      const requestedRouteId = normalizeString((request.command as { routeId?: unknown }).routeId);
      const activeRouteId = normalizeString(queue.getActiveRouteId());
      if (requestedRouteId && activeRouteId && requestedRouteId !== activeRouteId && request.command.type !== 'switch-route') {
        return {
          queueType: 'neural-roam',
          status: 'mismatch',
          viewState: await this.buildViewState(queue),
          queueState: queue.exportPersistedState() as Record<string, unknown>,
          unavailableReason: 'route-mismatch',
          message: 'NeuralRoam command route is no longer active',
        };
      }
      await this.applyCommand(queue, request.command);
      await queue.syncActiveRouteState();
      return {
        queueType: 'neural-roam',
        status: 'ok',
        viewState: await this.buildViewState(queue),
        queueState: queue.exportPersistedState() as Record<string, unknown>,
        unavailableReason: null,
        message: null,
      };
    } catch (error) {
      return this.commandUnavailable(null, 'failed', error instanceof Error ? error.message : String(error));
    }
  }

  private async applyCommand(
    queue: NeuralRoamQueue,
    command: BackendNeuralRoamCommandRequest['command'],
  ): Promise<void> {
    switch (command.type) {
      case 'switch-engine-mode':
        await queue.setEngineMode(command.mode, { carryCurrentNode: command.carryCurrentNode !== false });
        return;
      case 'start-roaming-from-focus':
        await queue.startRoamingFromFocus(command.focusId, {
          includeFocusAsFirst: command.includeFocusAsFirst,
          resetHistory: command.resetHistory,
          startNewSession: command.startNewSession,
        });
        return;
      case 'switch-route':
        await queue.switchRoute(command.routeId);
        return;
      case 'create-route':
        await queue.createRoute({ name: command.name ?? undefined });
        return;
      case 'rename-route':
        await queue.renameRoute(command.routeId, command.name);
        return;
      case 'delete-route':
        await queue.deleteRoute(command.routeId);
        return;
      case 'jump-history-node':
        await queue.jumpToHistoryNode(command.nodeId);
        return;
      case 'set-navigation-mode':
        queue.setNavigationMode(command.mode);
        return;
      case 'return-to-bookmark':
        queue.returnToBookmark();
        return;
      case 'create-temporary-route':
        await queue.createTemporaryRoute({
          name: command.name ?? undefined,
          seedBlockId: command.seedBlockId,
          previousRouteId: command.previousRouteId ?? null,
        });
        return;
      case 'replace-active-temporary-route':
        await queue.replaceActiveTemporaryRoute({
          name: command.name ?? undefined,
          seedBlockId: command.seedBlockId,
        });
        return;
      case 'save-temporary-route':
        await queue.saveTemporaryRoute(command.routeId, command.name);
        return;
      case 'close-temporary-route':
        await queue.closeTemporaryRoute({
          action: command.action,
          routeId: command.routeId ?? null,
          name: command.name ?? null,
        });
        return;
      case 'set-source':
        await queue.setSourceEntry(command.nodeId, command.enabled !== false);
        return;
      case 'set-anchor':
        await queue.setAnchorEntry(command.nodeId, command.enabled !== false);
        return;
      case 'set-current-focus':
        await queue.setCurrentFocus(command.nodeId, {
          includeFocusAsFirst: command.includeFocusAsFirst,
          resetHistory: command.resetHistory,
          bookmarkCurrentPath: command.bookmarkCurrentPath,
        });
        return;
      case 'clear-history':
        await queue.clearHistory(command.scope ?? 'all');
        return;
      case 'clear-route-history':
        await queue.clearRouteHistory();
        return;
      default:
        throw new Error(`INVALID_REQUEST: unsupported neural-roam command: ${(command as { type?: unknown }).type}`);
    }
  }

  private commandUnavailable(
    viewState: BackendNeuralRoamViewState | null,
    reason: BackendNeuralRoamAdvanceUnavailableReason,
    message: string,
  ): BackendNeuralRoamCommandResult {
    return {
      queueType: 'neural-roam',
      status: this.isAdvanceMismatch(reason) ? 'mismatch' : reason === 'failed' ? 'failed' : 'unavailable',
      viewState,
      queueState: null,
      unavailableReason: reason,
      message,
    };
  }

  private async ensureRoutesMigrated(): Promise<void> {
    if (!this.routeMigrationPromise) {
      this.routeMigrationPromise = (async () => {
        await this.deps.database.init();
        const migration = new SqlNeuralRoamRouteMigrationService(
          new SqlQueueStateRepository(this.deps.database as never),
          this.routeRepository,
        );
        await migration.migrateIfNeeded();
      })();
    }
    await this.routeMigrationPromise;
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

  private async resolveRouteMismatch(
    queue: NeuralRoamQueue,
    request: BackendNeuralRoamAdvanceRequest,
  ): Promise<BackendNeuralRoamAdvanceUnavailableReason | null> {
    await this.routeCatalog.getState();
    const requestedRouteId = normalizeString(request.routeId ?? request.startFromFocus?.routeId);
    const activeRouteId = normalizeString(queue.getActiveRouteId());
    if (!requestedRouteId || !activeRouteId || requestedRouteId === activeRouteId) {
      return null;
    }
    return 'route-mismatch';
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
      routeId: queue.getActiveRouteId(),
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
    const routeId = queue.getActiveRouteId();
    const viewState = await this.buildViewState(queue, counters);
    return {
      queueType: 'neural-roam',
      routeId,
      sessionId,
      status,
      nextItem: input.nextItem,
      counters,
      sessionState: {
        sessionId,
        routeId,
        engineMode: navigation.engineMode ?? null,
        currentNodeId: navigation.currentNodeId ?? null,
        currentEventId: navigation.currentEventId ?? null,
        pathLength: Math.max(0, Math.floor(Number(navigation.pathLength || 0))),
        historyCount: queue.getHistoryCount(navigation.sessionId ?? null),
        exhausted: status === 'exhausted',
        projectionGeneration: request.projectionGeneration ?? null,
        policyHash: request.policyHash ?? null,
      },
      viewState,
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
      return this.buildResult(request, queue, this.isAdvanceMismatch(reason) ? 'mismatch' : 'unavailable', {
        nextItem: null,
        projectionImpact,
        unavailableReason: reason,
        message,
      });
    }
    return {
      queueType: 'neural-roam',
      sessionId: request.sessionId ?? null,
      status: this.isAdvanceMismatch(reason) ? 'mismatch' : 'unavailable',
      nextItem: null,
      counters: {
        routeId: request.routeId ?? null,
        remaining: 0,
        due: 0,
        total: 0,
        pendingAssociatedReview: 0,
        sourceNodes: 0,
      },
      sessionState: {
        sessionId: request.sessionId ?? null,
        routeId: request.routeId ?? null,
        engineMode: null,
        currentNodeId: null,
        currentEventId: null,
        pathLength: 0,
        historyCount: 0,
        exhausted: false,
        projectionGeneration: request.projectionGeneration ?? null,
        policyHash: request.policyHash ?? null,
      },
      viewState: null,
      routeId: request.routeId ?? null,
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
    if (reason !== 'generation-mismatch' && reason !== 'policy-mismatch' && reason !== 'route-mismatch') {
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

  private async buildViewState(
    queue: NeuralRoamQueue,
    counters?: BackendNeuralRoamCounters,
  ): Promise<BackendNeuralRoamViewState> {
    const navigation = queue.getNavigationState();
    const routeId = queue.getActiveRouteId();
    const routes = typeof queue.listRoutes === 'function'
      ? await queue.listRoutes()
      : [];
    const route = routes.find((candidate) => candidate.isActive)
      ?? routes.find((candidate) => candidate.id === routeId)
      ?? null;
    const historyRequest = { offset: 0, limit: 200 };
    const engineHistory = queue.getHistoryPage(historyRequest).entries;
    const routeHistory = typeof queue.getRouteHistoryPage === 'function'
      ? (await queue.getRouteHistoryPage(historyRequest)).entries
      : engineHistory;
    const batch = queue.getCurrentBatchSnapshot();
    const resolvedCounters = counters ?? await this.readCounters(queue);
    return {
      version: 1,
      queueType: 'neural-roam',
      route: {
        id: route?.id ?? routeId ?? null,
        name: route?.name ?? null,
        temporary: route?.temporary === true,
        previousRouteId: route?.previousRouteId ?? null,
      },
      engineMode: navigation.engineMode ?? queue.getEngineMode?.() ?? null,
      currentNodeId: navigation.currentNodeId ?? null,
      currentEventId: navigation.currentEventId ?? null,
      navigationState: { ...navigation },
      counters: { ...resolvedCounters },
      sources: queue.getSourceSnapshot().map((entry) => ({ ...entry })),
      anchors: queue.getAnchorSnapshot().map((entry) => ({ ...entry })),
      engineHistory: engineHistory.map((entry) => ({ ...entry })),
      routeHistory: routeHistory.map((entry) => ({ ...entry })),
      batchProgress: {
        kind: batch?.kind ?? 'none',
        viewedCount: Math.max(0, Math.floor(Number(batch?.viewedCount) || 0)),
        totalCount: Math.max(0, Math.floor(Number(batch?.roundSize) || 0)),
        remainingCount: Math.max(0, Math.floor(Number(batch?.remainingCount) || 0)),
        label: batch?.engineMode === 'hyperspace' ? 'depth' : batch ? 'orbit-round' : 'none',
      },
      updatedAt: Date.now(),
    };
  }

  private isAdvanceMismatch(reason: BackendNeuralRoamAdvanceUnavailableReason): boolean {
    return reason === 'generation-mismatch'
      || reason === 'policy-mismatch'
      || reason === 'route-mismatch';
  }
}
