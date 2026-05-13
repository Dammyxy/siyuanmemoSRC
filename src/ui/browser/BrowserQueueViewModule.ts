import type { IBrowserApplicationService } from '@/application/interfaces/IBrowserApplicationService';
import {
  QueueType,
  type BrowserCardTypeFilter,
  type IUnifiedDataSourceManagerFacade,
} from '@/types/unified-data-source';
import type { QueueProjectionReadinessRequest } from '../../../packages/contracts/src/backend-rpc';
import type { ICardDataSource } from './datasource/types';
import type { PresetFilter } from '@/application/queries/browser/GetBrowserCardsQuery';
import { createQueueDataSource } from './utils/dataSourceFactory';

export type BrowserQueueViewModuleLogger = {
  info: (...args: unknown[]) => void;
};

export type BrowserQueueViewPrepareRequest = {
  activeDocId: string | null;
  activeQueueId: string;
  activeScopeDocIds: string[] | null;
  browserAppService: IBrowserApplicationService | null;
  cardType: BrowserCardTypeFilter;
  currentPreset: PresetFilter;
  currentQueueType: string;
  forceRefresh: boolean;
  plugin: unknown;
  searchText: string;
};

export type BrowserQueueViewPrepareResult =
  | {
      status: 'ready';
      datasource: ICardDataSource;
      datasourceKind: 'queue';
    }
  | {
      status: 'refreshing';
      retryDelayMs: number | null;
      keepLoading: boolean;
    }
  | {
      status: 'unavailable';
      message: string;
    }
  | {
      status: 'missing-datasource';
      queueId: string;
    };

const QUEUE_ID_TO_TYPE: Record<string, QueueType> = {
  retrieval: QueueType.RetrievalPractice,
  'final-drill': QueueType.FinalDrill,
  'incremental-learning': QueueType.IncrementalLearning,
  'filter-group': QueueType.FilterGroup,
  'neural-roam': QueueType.NeuralRoam,
  neural: QueueType.NeuralRoam,
};

export function resolveQueueTypeForBrowserQueueView(queueId: string | null, currentQueueType: string): QueueType | null {
  if (currentQueueType && Object.values(QueueType).includes(currentQueueType as QueueType)) {
    return currentQueueType as QueueType;
  }
  return queueId ? QUEUE_ID_TO_TYPE[queueId] ?? null : null;
}

function mapReadinessUnavailableMessage(cause: string): string {
  switch (cause) {
    case 'writer_unavailable':
      return 'Queue projection writer is unavailable';
    case 'backend_unavailable':
      return 'Queue projection backend is unavailable';
    case 'invalid_queue':
      return 'Queue projection is not available for this queue';
    case 'contract_mismatch':
      return 'Queue projection contract mismatch';
    default:
      return 'Queue projection is unavailable';
  }
}

function normalizeReadinessIdentity(request: QueueProjectionReadinessRequest): string {
  return JSON.stringify({
    cardType: request.cardType ?? null,
    docId: request.docId ?? null,
    preset: request.preset ?? null,
    queueType: request.queueType,
    scopeDocIds: request.scopeDocIds ?? null,
    searchText: request.searchText ?? '',
  });
}

export type BrowserQueueViewModuleDeps = {
  logger: BrowserQueueViewModuleLogger;
  maxReadinessRetries?: number;
};

export function createBrowserQueueViewModule(deps: BrowserQueueViewModuleDeps) {
  const maxReadinessRetries = deps.maxReadinessRetries ?? 4;
  const readinessRetryAttempts = new Map<string, number>();

  async function prepareQueueView(
    manager: IUnifiedDataSourceManagerFacade,
    request: BrowserQueueViewPrepareRequest,
  ): Promise<BrowserQueueViewPrepareResult> {
    const queueType = resolveQueueTypeForBrowserQueueView(request.activeQueueId, request.currentQueueType);
    const readinessRequest: QueueProjectionReadinessRequest | null = queueType
      ? {
          queueType,
          preset: request.currentPreset,
          searchText: request.searchText,
          docId: request.activeDocId,
          scopeDocIds: request.activeScopeDocIds,
          cardType: String(request.cardType),
          source: 'browser',
        }
      : null;

    if (readinessRequest && typeof manager.ensureQueueProjectionReady === 'function') {
      const retryIdentity = normalizeReadinessIdentity(readinessRequest);
      const readiness = await manager.ensureQueueProjectionReady(readinessRequest);
      if (readiness.status === 'refreshing') {
        const attempts = readinessRetryAttempts.get(retryIdentity) ?? 0;
        const keepLoading = attempts < maxReadinessRetries;
        if (keepLoading) {
          readinessRetryAttempts.set(retryIdentity, attempts + 1);
        }
        deps.logger.info('[SiYuanMemo][SRSBrowser] Queue projection is preparing', readiness);
        return {
          status: 'refreshing',
          retryDelayMs: keepLoading ? readiness.retryAfterMs ?? 300 : null,
          keepLoading,
        };
      }

      readinessRetryAttempts.delete(retryIdentity);
      if (readiness.status === 'unavailable') {
        return {
          status: 'unavailable',
          message: mapReadinessUnavailableMessage(readiness.cause),
        };
      }
    }

    const datasource = createQueueDataSource(
      request.activeQueueId,
      manager,
      {
        docId: request.activeDocId,
        scopeDocIds: request.activeScopeDocIds,
        preset: request.currentPreset,
        queryText: request.searchText,
        cardType: request.cardType,
      },
      request.plugin,
      request.browserAppService,
    );

    if (!datasource) {
      return {
        status: 'missing-datasource',
        queueId: request.activeQueueId,
      };
    }

    return {
      status: 'ready',
      datasource,
      datasourceKind: 'queue',
    };
  }

  return {
    prepareQueueView,
  };
}
