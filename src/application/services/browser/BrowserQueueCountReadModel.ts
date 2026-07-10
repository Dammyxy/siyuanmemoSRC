import type {
  QueueType,
  IUnifiedDataSourceManagerFacade,
  QueueProjectionSnapshot,
} from '@/types/unified-data-source';
import {
  isNeuralBrowserQueue,
  resolveQueueTypeForBrowserQueueId,
  type BrowserQueueId,
} from '@/types/browser-queue-identity';
import { createLogger } from '@/utils/logger';

const logger = createLogger('BrowserQueueCountReadModel');

export interface BrowserQueueCountReadRequest {
  queueId: BrowserQueueId;
  forceRefresh?: boolean;
}

export interface BrowserQueueCountReadModel {
  readCount(request: BrowserQueueCountReadRequest): Promise<number>;
}

export class ProjectionBrowserQueueCountReadModel implements BrowserQueueCountReadModel {
  constructor(private readonly manager: IUnifiedDataSourceManagerFacade) {}

  async readCount(request: BrowserQueueCountReadRequest): Promise<number> {
    const queueType = resolveQueueTypeForBrowserQueueId(request.queueId);
    if (!queueType) {
      throw new Error(`QUEUE_UNAVAILABLE: ${request.queueId} queue identity unsupported`);
    }

    if (isNeuralBrowserQueue(request.queueId)) {
      return this.readNeuralQueueCount(queueType, request.queueId);
    }

    return this.readProjectionQueueCount(queueType, request.queueId, Boolean(request.forceRefresh));
  }

  private async readNeuralQueueCount(queueType: QueueType, queueId: BrowserQueueId): Promise<number> {
    const queue = this.manager.getQueue(queueType);
    try {
      return Math.max(0, await queue.getSize());
    } catch (error) {
      logger.error('QUEUE_COUNT_UNAVAILABLE: failed to read neural-roam queue size:', {
        queueId,
        error,
      });
      throw new Error(`QUEUE_COUNT_UNAVAILABLE: ${queueId} queue size unavailable`);
    }
  }

  private async readProjectionQueueCount(
    queueType: QueueType,
    queueId: BrowserQueueId,
    forceRefresh: boolean,
  ): Promise<number> {
    if (typeof this.manager.readQueueProjection !== 'function') {
      throw new Error(`QUEUE_COUNT_UNAVAILABLE: ${queueId} queue projection snapshot reader unavailable`);
    }

    try {
      const result = await this.manager.readQueueProjection({ type: 'snapshot', queueType });
      if (result.type !== 'snapshot' || result.status !== 'ready' || !result.snapshot) {
        const status = result.type === 'snapshot' ? result.status : 'unavailable';
        throw new Error(`QUEUE_PROJECTION_UNAVAILABLE: ${queueId} queue projection snapshot ${status}`);
      }
      return this.resolveProjectionVisibleCount(result.snapshot);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const unavailable = new Error(
        reason
          ? `QUEUE_COUNT_UNAVAILABLE: ${queueId} queue snapshot unavailable (${reason})`
          : `QUEUE_COUNT_UNAVAILABLE: ${queueId} queue snapshot unavailable`,
      );
      (unavailable as Error & { cause?: unknown }).cause = error;
      throw unavailable;
    }
  }

  private resolveProjectionVisibleCount(snapshot: QueueProjectionSnapshot): number {
    const visibleTotal = Math.max(0, Array.isArray(snapshot.rows) ? snapshot.rows.length : 0);
    const counterTotal = snapshot.counters?.total == null
      ? Number(snapshot.counters?.remaining)
      : Number(snapshot.counters.total);
    const normalizedCounterTotal = Math.max(0, Number.isFinite(counterTotal) ? counterTotal : 0);
    return normalizedCounterTotal === visibleTotal
      ? normalizedCounterTotal
      : visibleTotal;
  }
}
