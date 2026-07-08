import type {
  BackendQueueProjectionReplaceResult,
  QueueProjectionReadiness,
  QueueProjectionReadinessRequest,
} from '../../../packages/contracts/src/backend-rpc';
import {
  QueueType,
  type IReviewQueue,
} from '@/types/unified-data-source';
import type { UnifiedDataSourceManager } from '@/application/services/UnifiedDataSourceManager';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ReviewAdmissionModule');

const REVIEW_ADMISSION_QUEUE_TYPES = new Set<QueueType>([
  QueueType.RetrievalPractice,
  QueueType.IncrementalLearning,
]);

type ReviewAdmissionQueueType =
  | QueueType.RetrievalPractice
  | QueueType.IncrementalLearning;

export interface ReviewAdmissionTicket {
  queueType: ReviewAdmissionQueueType;
  entrySurface: string | null;
  projectionPolicyHash: string;
  projectionGeneration: number;
  readinessRequest: QueueProjectionReadinessRequest;
  admittedAt: number;
  source: 'ready-projection' | 'materialized-projection';
}

export interface ReviewAdmissionRequest {
  queueType: QueueType;
  entrySurface?: string | null;
  queueInstance?: Pick<IReviewQueue, 'getCards'> | null;
}

export class ReviewAdmissionModule {
  constructor(private readonly manager: UnifiedDataSourceManager) {}

  async admitReviewSession(request: ReviewAdmissionRequest): Promise<ReviewAdmissionTicket | null> {
    if (!isReviewAdmissionQueueType(request.queueType)) {
      return null;
    }

    const readinessRequest = buildReviewAdmissionReadinessRequest(request.queueType);
    const entrySurface = normalizeOptionalString(request.entrySurface);
    const ready = await this.manager.ensureQueueProjectionReady(readinessRequest);
    if (ready.status === 'ready') {
      return this.toTicket(request.queueType, entrySurface, readinessRequest, ready, 'ready-projection');
    }

    if (!isRecoverableReadiness(ready)) {
      throw new Error(`REVIEW_ADMISSION_UNAVAILABLE: ${request.queueType} projection is not readable: ${formatReadiness(ready)}`);
    }

    const materialized = await this.manager.materializeQueueProjection(
      request.queueType,
      request.queueInstance ?? this.manager.getQueue(request.queueType),
      {
        readinessRequest,
        reason: 'review-admission',
      },
    );
    if (!isReadyMaterialization(materialized)) {
      throw new Error(`REVIEW_ADMISSION_UNAVAILABLE: ${request.queueType} projection materialization did not produce a ready identity`);
    }

    logger.info('[SiYuanMemo][ReviewAdmission] admitted review session after projection materialization', {
      queueType: request.queueType,
      entrySurface,
      projectionPolicyHash: materialized.policyHash,
      projectionGeneration: materialized.generation,
      rows: materialized.rows,
    });
    return {
      queueType: request.queueType,
      entrySurface,
      projectionPolicyHash: materialized.policyHash,
      projectionGeneration: Number(materialized.generation),
      readinessRequest,
      admittedAt: Date.now(),
      source: 'materialized-projection',
    };
  }

  private toTicket(
    queueType: ReviewAdmissionQueueType,
    entrySurface: string | null,
    readinessRequest: QueueProjectionReadinessRequest,
    readiness: Extract<QueueProjectionReadiness, { status: 'ready' }>,
    source: ReviewAdmissionTicket['source'],
  ): ReviewAdmissionTicket {
    return {
      queueType,
      entrySurface,
      projectionPolicyHash: readiness.policyId,
      projectionGeneration: Number(readiness.generation),
      readinessRequest,
      admittedAt: Date.now(),
      source,
    };
  }
}

export function isReviewAdmissionQueueType(queueType: QueueType | null | undefined): queueType is ReviewAdmissionQueueType {
  return Boolean(queueType && REVIEW_ADMISSION_QUEUE_TYPES.has(queueType));
}

export function buildReviewAdmissionReadinessRequest(queueType: ReviewAdmissionQueueType): QueueProjectionReadinessRequest {
  return {
    queueType,
    preset: 'all',
    searchText: null,
    docId: null,
    scopeDocIds: [],
    cardType: 'all',
    source: 'browser',
  };
}

export function isValidReviewAdmissionTicket(
  value: ReviewAdmissionTicket | null | undefined,
  queueType: QueueType | null | undefined,
): value is ReviewAdmissionTicket {
  return Boolean(
    value
    && value.queueType === queueType
    && isReviewAdmissionQueueType(value.queueType)
    && isNonEmptyString(value.projectionPolicyHash)
    && isPositiveInteger(value.projectionGeneration),
  );
}

function isRecoverableReadiness(readiness: QueueProjectionReadiness): boolean {
  return readiness.status === 'refreshing'
    || (readiness.status === 'unavailable' && readiness.recoverable === true);
}

function isReadyMaterialization(
  result: BackendQueueProjectionReplaceResult | null | undefined,
): result is BackendQueueProjectionReplaceResult {
  return Boolean(
    result
    && result.status === 'ready'
    && isNonEmptyString(result.policyHash)
    && isPositiveInteger(result.generation),
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && Math.floor(value) === value && value > 0;
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function formatReadiness(readiness: QueueProjectionReadiness): string {
  if (readiness.status === 'ready') {
    return `ready policy=${readiness.policyId} generation=${readiness.generation}`;
  }
  if (readiness.status === 'refreshing') {
    return `refreshing cause=${readiness.cause} policy=${readiness.policyId}`;
  }
  return `unavailable cause=${readiness.cause} recoverable=${readiness.recoverable} reason=${readiness.reason}`;
}
