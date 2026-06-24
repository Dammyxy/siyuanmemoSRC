import type {
  BrowserQueueCountsRequest,
  IBrowserApplicationService,
} from '@/application/interfaces/IBrowserApplicationService';
import type { ICardDataSource } from '@/application/interfaces/ICardDataSource';
import type { PresetFilter } from './GetBrowserCardsQuery';
import type {
  BrowserReadModelSnapshotMetadata,
  BrowserReadModelReadState,
} from './browser-read-model';
import {
  normalizeBrowserQueueId,
  resolveQueueTypeForBrowserQueueId,
  type BrowserQueueId,
} from '@/types/browser-queue-identity';
import { QueueType, type BrowserCardTypeFilter, type IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import {
  compareQueueProjectionLiveIdentity,
  type QueueProjectionIdentity,
  type QueueProjectionLiveIdentityEvent,
} from '@/types/queue-projection-live-identity';
import type {
  QueueProjectionReadiness,
} from '../../../../packages/contracts/src/backend-rpc';

export type BrowserQueueViewLifecycleLogger = {
  info: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
};

export type BrowserQueueViewDatasourceRequest = {
  activeDocId: string | null;
  activeQueueId: BrowserQueueId;
  activeScopeDocIds: string[] | null;
  browserAppService: IBrowserApplicationService | null;
  cardType: BrowserCardTypeFilter;
  currentPreset: PresetFilter;
  manager: IUnifiedDataSourceManagerFacade;
  plugin: unknown;
  searchText: string;
};

export type BrowserQueueViewDatasourceFactory = (
  request: BrowserQueueViewDatasourceRequest,
) => ICardDataSource | null | undefined;

export type BrowserQueueViewPrepareRequest = {
  activeDocId: string | null;
  activeQueueId: string;
  activeScopeDocIds: string[] | null;
  browserAppService: IBrowserApplicationService | null;
  cardType: BrowserCardTypeFilter;
  currentPreset: PresetFilter;
  currentQueueType: string;
  forceRefresh: boolean;
  manager: IUnifiedDataSourceManagerFacade;
  plugin: unknown;
  searchText: string;
};

export type BrowserQueueViewLifecycleReadState = Exclude<BrowserReadModelReadState, 'ready'>;

export type BrowserQueueViewPrepareReadyResult = {
  status: 'ready';
  datasource: ICardDataSource;
  datasourceKind: 'queue';
  projectionIdentity: QueueProjectionIdentity | null;
  queueId: BrowserQueueId;
  queueType: QueueType | null;
  readiness: QueueProjectionReadiness | null;
  readinessStatus: 'not-required' | 'not-checked' | 'ready';
  requestGeneration: number;
};

export type BrowserQueueViewPrepareNonReadyResult = {
  status: BrowserQueueViewLifecycleReadState;
  queueId: BrowserQueueId | string;
  queueType: QueueType | null;
  reason: string;
  requestGeneration: number;
  retryAfterMs?: number;
  readiness?: QueueProjectionReadiness;
};

export type BrowserQueueViewPrepareStaleResult = {
  status: 'stale';
  queueId: BrowserQueueId | string;
  queueType: QueueType | null;
  requestGeneration: number;
  currentGeneration: number;
};

export type BrowserQueueViewPrepareResult =
  | BrowserQueueViewPrepareReadyResult
  | BrowserQueueViewPrepareNonReadyResult
  | BrowserQueueViewPrepareStaleResult;

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

export type BrowserQueueViewAsyncReadToken = {
  datasourceVersion: number;
  prepareGeneration: number;
  readModelSnapshotMetadata: BrowserReadModelSnapshotMetadata | null;
};

export type BrowserQueueViewLifecycleDeps = {
  createDataSource: BrowserQueueViewDatasourceFactory;
  logger: BrowserQueueViewLifecycleLogger;
};

function stableMetadataString(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableMetadataString).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableMetadataString(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function isBrowserReadModelSnapshotMetadataEqual(
  left: BrowserReadModelSnapshotMetadata | null | undefined,
  right: BrowserReadModelSnapshotMetadata | null | undefined,
): boolean {
  if (!left || !right) {
    return left == null && right == null;
  }
  return left.queryFingerprint === right.queryFingerprint
    && (left.generation ?? null) === (right.generation ?? null)
    && stableMetadataString(left.readOwner ?? null) === stableMetadataString(right.readOwner ?? null);
}

export function resolveQueueTypeForBrowserQueueView(queueId: string | null, _currentQueueType: string) {
  return resolveQueueTypeForBrowserQueueId(queueId);
}

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

function shouldBypassProjectionReadiness(queueType: QueueType | null): boolean {
  return queueType === QueueType.NeuralRoam;
}

export function createBrowserQueueViewLifecycle(deps: BrowserQueueViewLifecycleDeps) {
  let datasourceVersion = 0;
  let prepareGeneration = 0;
  let currentProjectionIdentity: QueueProjectionIdentity | null = null;
  let currentReadModelSnapshotMetadata: BrowserReadModelSnapshotMetadata | null = null;

  function isCurrentPrepareGeneration(generation: number): boolean {
    return generation === prepareGeneration;
  }

  function captureAsyncReadToken(): BrowserQueueViewAsyncReadToken {
    return {
      datasourceVersion,
      prepareGeneration,
      readModelSnapshotMetadata: currentReadModelSnapshotMetadata,
    };
  }

  function isAsyncReadTokenCurrent(token: BrowserQueueViewAsyncReadToken): boolean {
    return token.datasourceVersion === datasourceVersion
      && token.prepareGeneration === prepareGeneration
      && isBrowserReadModelSnapshotMetadataEqual(
        token.readModelSnapshotMetadata,
        currentReadModelSnapshotMetadata,
      );
  }

  async function prepareQueueView(
    request: BrowserQueueViewPrepareRequest,
  ): Promise<BrowserQueueViewPrepareResult> {
    const requestGeneration = ++prepareGeneration;
    currentReadModelSnapshotMetadata = null;
    currentProjectionIdentity = null;

    const canonicalQueueId = normalizeBrowserQueueId(request.activeQueueId);
    const queueType = resolveQueueTypeForBrowserQueueView(canonicalQueueId, request.currentQueueType);
    if (!canonicalQueueId || !queueType) {
      return {
        status: 'unavailable',
        queueId: request.activeQueueId,
        queueType: null,
        reason: `Browser queue view does not support queueId=${request.activeQueueId}`,
        requestGeneration,
      };
    }

    if (!shouldBypassProjectionReadiness(queueType)) {
      const browserAppService = request.browserAppService;
      if (!browserAppService?.ensureQueueReadModelReady) {
        return {
          status: 'unavailable',
          queueId: canonicalQueueId,
          queueType,
          reason: `Browser queue read model readiness is unavailable for ${queueType}`,
          requestGeneration,
          retryAfterMs: 300,
        };
      }
    }

    const datasource = deps.createDataSource({
      activeDocId: request.activeDocId,
      activeQueueId: canonicalQueueId,
      activeScopeDocIds: request.activeScopeDocIds,
      browserAppService: request.browserAppService,
      cardType: request.cardType,
      currentPreset: request.currentPreset,
      manager: request.manager,
      plugin: request.plugin,
      searchText: request.searchText,
    });
    if (!isCurrentPrepareGeneration(requestGeneration)) {
      return {
        status: 'stale',
        queueId: canonicalQueueId,
        queueType,
        requestGeneration,
        currentGeneration: prepareGeneration,
      };
    }
    if (!datasource) {
      return {
        status: 'unavailable',
        queueId: canonicalQueueId,
        queueType,
        reason: `Browser queue datasource is unavailable for ${canonicalQueueId}`,
        requestGeneration,
      };
    }

    currentProjectionIdentity = null;

    return {
      status: 'ready',
      datasource,
      datasourceKind: 'queue',
      projectionIdentity: currentProjectionIdentity,
      queueId: canonicalQueueId,
      queueType,
      readiness: null,
      readinessStatus: shouldBypassProjectionReadiness(queueType) ? 'not-required' : 'not-checked',
      requestGeneration,
    };
  }

  function advanceDatasourceVersion(): number {
    datasourceVersion += 1;
    currentReadModelSnapshotMetadata = null;
    return datasourceVersion;
  }

  function resetQueueView(): void {
    prepareGeneration += 1;
    currentProjectionIdentity = null;
    currentReadModelSnapshotMetadata = null;
  }

  function planLiveIdentityEvent(input: Omit<BrowserQueueLiveIdentityPlanRequest, 'currentProjectionIdentity'>): BrowserQueueLiveIdentityPlan {
    return planQueueProjectionLiveIdentityForBrowserQueueView({
      ...input,
      currentProjectionIdentity,
    });
  }

  return {
    acceptReadModelSnapshotMetadata: (metadata: BrowserReadModelSnapshotMetadata) => {
      currentReadModelSnapshotMetadata = metadata;
    },
    advanceDatasourceVersion,
    captureAsyncReadToken,
    clearReadModelSnapshotMetadata: () => {
      currentReadModelSnapshotMetadata = null;
    },
    getDatasourceVersion: () => datasourceVersion,
    getProjectionIdentity: () => currentProjectionIdentity,
    getReadModelSnapshotMetadata: () => currentReadModelSnapshotMetadata,
    isAsyncReadTokenCurrent,
    planLiveIdentityEvent,
    prepareQueueView,
    resetQueueView,
    setProjectionIdentity: (identity: QueueProjectionIdentity | null) => {
      currentProjectionIdentity = identity;
    },
  };
}

export type BrowserQueueViewLifecycle = ReturnType<typeof createBrowserQueueViewLifecycle>;

export function mapQueueViewPrepareStatusToCountsRequest(
  result: BrowserQueueViewPrepareResult,
): BrowserQueueCountsRequest | null {
  if (result.status !== 'ready' || !result.queueType || !result.projectionIdentity) {
    return null;
  }
  return {
    forceRefresh: true,
    affectedQueueTypes: [result.queueType],
  };
}
