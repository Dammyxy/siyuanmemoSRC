import type { IBrowserApplicationService } from '@/application/interfaces/IBrowserApplicationService';
import {
  type BrowserCardTypeFilter,
  type IUnifiedDataSourceManagerFacade,
} from '@/types/unified-data-source';
import { normalizeBrowserQueueId, resolveQueueTypeForBrowserQueueId } from '@/types/browser-queue-identity';
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

export type BrowserQueueViewModuleDeps = {
  logger: BrowserQueueViewModuleLogger;
};

export function createBrowserQueueViewModule(_deps: BrowserQueueViewModuleDeps) {
  async function prepareQueueView(
    manager: IUnifiedDataSourceManagerFacade,
    request: BrowserQueueViewPrepareRequest,
  ): Promise<BrowserQueueViewPrepareResult> {
    const canonicalQueueId = normalizeBrowserQueueId(request.activeQueueId);

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
      projectionIdentity: null,
    };
  }

  return {
    prepareQueueView,
  };
}
