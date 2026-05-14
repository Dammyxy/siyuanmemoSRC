import type { IBrowserApplicationService } from '@/application/interfaces/IBrowserApplicationService';
import {
  type BrowserCardTypeFilter,
  type IUnifiedDataSourceManagerFacade,
  QueueType,
} from '@/types/unified-data-source';
import { normalizeBrowserQueueId, resolveQueueTypeForBrowserQueueId } from '@/types/browser-queue-identity';
import type { QueueProjectionReadinessRequest } from '../../../packages/contracts/src/backend-rpc';
import {
  compareQueueProjectionLiveIdentity,
  type QueueProjectionIdentity,
  type QueueProjectionLiveIdentityEvent,
} from '@/types/queue-projection-live-identity';
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
      projectionIdentity: QueueProjectionIdentity | null;
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

export function resolveQueueTypeForBrowserQueueView(queueId: string | null, _currentQueueType: string) {
  return resolveQueueTypeForBrowserQueueId(queueId);
}

export type BrowserQueueLiveIdentityPlanRequest = {
  activeQueueId: string | null;
  currentQueueType: string;
  currentProjectionIdentity: QueueProjectionIdentity | null;
  event: QueueProjectionLiveIdentityEvent;
  visible: boolean;
};

export type BrowserQueueLiveIdentityPlan =
  | {
      action: 'ignore';
      reason:
        | 'hidden-browser-mode'
        | 'missing-event-identity'
        | 'missing-attached-identity'
        | 'queue-mismatch'
        | 'policy-mismatch'
        | 'not-newer';
    }
  | { action: 'recheck'; reason: 'identity-invalidated' }
  | { action: 'reattach'; identity: QueueProjectionIdentity };

export function planQueueProjectionLiveIdentityForBrowserQueueView(
  request: BrowserQueueLiveIdentityPlanRequest,
): BrowserQueueLiveIdentityPlan {
  const queueType = resolveQueueTypeForBrowserQueueView(request.activeQueueId, request.currentQueueType);
  if (!request.visible || !queueType || !normalizeBrowserQueueId(request.activeQueueId)) {
    return { action: 'ignore', reason: 'hidden-browser-mode' };
  }
  const decision = compareQueueProjectionLiveIdentity(request.event, request.currentProjectionIdentity);
  if (decision.action === 'ignore') {
    return decision;
  }
  if (decision.action === 'recheck') {
    return decision;
  }
  if (decision.identity.queueType !== queueType) {
    return { action: 'ignore', reason: 'queue-mismatch' };
  }
  return decision;
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
    const canonicalQueueId = normalizeBrowserQueueId(request.activeQueueId);
    const queueType = resolveQueueTypeForBrowserQueueView(request.activeQueueId, request.currentQueueType);
    let projectionIdentity: QueueProjectionIdentity | null = null;
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
      if (readiness.status === 'ready') {
        const generation = Number(readiness.generation);
        const policyId = String(readiness.policyId || '').trim();
        if (
          Object.values(QueueType).includes(queueType as QueueType)
          && policyId
          && Number.isFinite(generation)
          && generation > 0
        ) {
          projectionIdentity = {
            queueId: queueType,
            queueType: queueType as QueueType,
            policyId,
            generation: Math.floor(generation),
          };
        }
      }
    }

    const datasource = createQueueDataSource(
      canonicalQueueId ?? request.activeQueueId,
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
        queueId: canonicalQueueId ?? request.activeQueueId,
      };
    }

    return {
      status: 'ready',
      datasource,
      datasourceKind: 'queue',
      projectionIdentity,
    };
  }

  return {
    prepareQueueView,
  };
}
