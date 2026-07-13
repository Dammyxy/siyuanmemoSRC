import type {
  QueueType,
  IUnifiedDataSourceManagerFacade,
  QueueProjectionSnapshot,
  IReviewQueue,
} from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';
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

export interface BrowserQueueCountReadModelOptions {
  countVisibleProjectionRows?: (
    queueId: BrowserQueueId,
    snapshot: QueueProjectionSnapshot,
  ) => Promise<number>;
  countVisibleRecoveryCards?: (
    queueId: BrowserQueueId,
    cards: FSRSCard[],
  ) => Promise<number>;
  isReadOnlyRecoveryQueueStateAllowed?: () => boolean;
}

export class ProjectionBrowserQueueCountReadModel implements BrowserQueueCountReadModel {
  constructor(
    private readonly manager: IUnifiedDataSourceManagerFacade,
    private readonly options: BrowserQueueCountReadModelOptions = {},
  ) {}

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
        const projectionError = new Error(`QUEUE_PROJECTION_UNAVAILABLE: ${queueId} queue projection snapshot ${status}`);
        const recoveryCount = await this.tryReadOnlyRecoveryQueueCount(queueType, queueId, projectionError);
        if (recoveryCount !== null) {
          return recoveryCount;
        }
        throw projectionError;
      }
      return this.resolveProjectionVisibleCount(queueId, result.snapshot);
    } catch (error) {
      const recoveryCount = await this.tryReadOnlyRecoveryQueueCount(queueType, queueId, error);
      if (recoveryCount !== null) {
        return recoveryCount;
      }
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

  private async tryReadOnlyRecoveryQueueCount(
    queueType: QueueType,
    queueId: BrowserQueueId,
    error: unknown,
  ): Promise<number | null> {
    if (!this.options.isReadOnlyRecoveryQueueStateAllowed?.()) {
      return null;
    }
    if (!this.isProjectionRefreshOrRepairError(error)) {
      return null;
    }
    const queue = this.manager.getQueue(queueType) as IReviewQueue;
    if (typeof queue.getReadOnlyRecoveryCards !== 'function') {
      return null;
    }
    if (typeof this.options.countVisibleRecoveryCards !== 'function') {
      throw new Error(`QUEUE_COUNT_UNAVAILABLE: ${queueId} recovery visibility reader unavailable`);
    }
    const cards = await queue.getReadOnlyRecoveryCards();
    const count = await this.options.countVisibleRecoveryCards(queueId, cards);
    logger.debug('QUEUE_COUNT_READ_ONLY_RECOVERY: using explicit recovery queue state', {
      queueId,
      queueType,
      count,
    });
    return Math.max(0, Number(count) || 0);
  }

  private isProjectionRefreshOrRepairError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('QUEUE_PROJECTION_UNAVAILABLE')
      || message.includes('QUEUE_PROJECTION_NOT_READY')
      || message.includes('QUEUE_PROJECTION_REPAIR_REQUIRED');
  }

  private async resolveProjectionVisibleCount(
    queueId: BrowserQueueId,
    snapshot: QueueProjectionSnapshot,
  ): Promise<number> {
    if (typeof this.options.countVisibleProjectionRows !== 'function') {
      throw new Error(`QUEUE_COUNT_UNAVAILABLE: ${queueId} projection visibility reader unavailable`);
    }
    return Math.max(0, Number(await this.options.countVisibleProjectionRows(queueId, snapshot)) || 0);
  }
}
