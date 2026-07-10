import type {
  QueueProjectionLifecycleInterface,
  QueueProjectionReadRequest,
  QueueProjectionReadResult,
  QueueProjectionRepairCommand,
  QueueProjectionRepairReceipt,
} from '@/types/unified-data-source';
import type { QueueProjectionLiveIdentityListener } from '@/types/queue-projection-live-identity';
import type { QueueProjectionRuntime } from './QueueProjectionRuntime';

export type QueueProjectionLifecycleDeps = {
  runtime: Pick<
    QueueProjectionRuntime,
    | 'readSnapshot'
    | 'ensureReady'
    | 'getCardsBySnapshotIds'
    | 'getRolloutDiagnostics'
    | 'subscribeLiveIdentityEvents'
    | 'materialize'
    | 'clearMaterializedProjectionEcho'
  >;
};

export class QueueProjectionLifecycle implements QueueProjectionLifecycleInterface {
  constructor(private readonly deps: QueueProjectionLifecycleDeps) {}

  async read(request: QueueProjectionReadRequest): Promise<QueueProjectionReadResult> {
    if (request.type === 'diagnostics') {
      return {
        type: 'diagnostics',
        diagnostics: this.deps.runtime.getRolloutDiagnostics(request.queueType),
      };
    }
    if (request.type === 'readiness') {
      return {
        type: 'readiness',
        readiness: await this.deps.runtime.ensureReady(request.request),
      };
    }

    const readiness = await this.deps.runtime.ensureReady({ queueType: request.queueType });
    if (readiness.status !== 'ready') {
      return request.type === 'snapshot'
        ? { type: 'snapshot', status: readiness.status, readiness, snapshot: null }
        : { type: 'rows-by-id', status: readiness.status, readiness, cards: [] };
    }

    if (request.type === 'snapshot') {
      return {
        type: 'snapshot',
        status: 'ready',
        readiness,
        snapshot: await this.deps.runtime.readSnapshot(request.queueType),
      };
    }
    return {
      type: 'rows-by-id',
      status: 'ready',
      readiness,
      cards: await this.deps.runtime.getCardsBySnapshotIds(request.queueType, request.ids),
    };
  }

  async repair(command: QueueProjectionRepairCommand): Promise<QueueProjectionRepairReceipt> {
    if (command.type === 'invalidate') {
      this.deps.runtime.clearMaterializedProjectionEcho(command.queueType);
      return {
        status: 'invalidated',
        queueType: command.queueType,
        reason: command.reason?.trim() || 'explicit-invalidation',
      };
    }
    const result = await this.deps.runtime.materialize(
      command.queueType,
      command.queueOverride,
      {
        readinessRequest: command.readinessRequest,
        reason: command.reason ?? command.type,
      },
    );
    if (
      !result
      || result.status !== 'ready'
      || !result.policyHash
      || !Number.isInteger(result.generation)
      || Number(result.generation) <= 0
    ) {
      return {
        status: 'unavailable',
        queueType: command.queueType,
        reason: 'projection repair did not produce committed ready identity',
      };
    }
    return {
      status: 'ready',
      queueType: command.queueType,
      policyHash: result.policyHash,
      generation: Number(result.generation),
      result,
    };
  }

  observe(listener: QueueProjectionLiveIdentityListener): () => void {
    return this.deps.runtime.subscribeLiveIdentityEvents(listener);
  }
}
