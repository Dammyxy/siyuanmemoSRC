import type {
  QueueProjectionReadiness,
  QueueProjectionReadinessRequest,
} from '../../../../packages/contracts/src/backend-rpc';
import type {
  QueueType,
  QueueProjectionRolloutDiagnostic,
  QueueProjectionSnapshot,
} from '@/types/unified-data-source';
import type { QueueProjectionLiveIdentityListener } from '@/types/queue-projection-live-identity';
import type { FSRSCard } from '@/types/card';
import type { QueueProjectionRuntime } from './QueueProjectionRuntime';

export type QueueProjectionReadModuleDeps = {
  runtime: Pick<
    QueueProjectionRuntime,
    | 'readSnapshot'
    | 'ensureReady'
    | 'getCardsBySnapshotIds'
    | 'getRolloutDiagnostics'
    | 'subscribeLiveIdentityEvents'
  >;
};

export class QueueProjectionReadModule {
  constructor(private readonly deps: QueueProjectionReadModuleDeps) {}

  readSnapshot(
    queueType: QueueType,
    options: { forceRefresh?: boolean } = {},
  ): Promise<QueueProjectionSnapshot | null> {
    return this.deps.runtime.readSnapshot(queueType, options);
  }

  ensureReady(request: QueueProjectionReadinessRequest): Promise<QueueProjectionReadiness> {
    return this.deps.runtime.ensureReady(request);
  }

  subscribeLiveIdentityEvents(listener: QueueProjectionLiveIdentityListener): () => void {
    return this.deps.runtime.subscribeLiveIdentityEvents(listener);
  }

  getCardsBySnapshotIds(
    queueType: QueueType,
    ids: string[],
    options: { forceRefresh?: boolean } = {},
  ): Promise<FSRSCard[]> {
    return this.deps.runtime.getCardsBySnapshotIds(queueType, ids, options);
  }

  getRolloutDiagnostics(queueType?: QueueType): QueueProjectionRolloutDiagnostic[] {
    return this.deps.runtime.getRolloutDiagnostics(queueType);
  }
}
