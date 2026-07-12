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
import {
  buildReviewEntryTargetIdentity,
  type ProjectionQueueEntryTarget,
  type ReviewEntryTarget,
  type ReviewProjectionQueueType,
} from '@/application/services/ReviewEntryTargetResolver';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ReviewAdmissionModule');

const REVIEW_ADMISSION_QUEUE_TYPES = new Set<QueueType>([
  QueueType.RetrievalPractice,
  QueueType.IncrementalLearning,
]);

type ReviewAdmissionQueueType = ReviewProjectionQueueType;

export interface ReviewAdmissionTicket {
  queueType: ReviewAdmissionQueueType;
  entrySurface: string;
  entryTargetIdentity: string;
  projectionPolicyHash: string | null;
  projectionGeneration: number | null;
  readinessRequest: QueueProjectionReadinessRequest;
  admittedAt: number;
  source: 'ready-projection' | 'materialized-projection' | 'read-only-recovery-queue-state';
}

export interface ReviewAdmissionRequest {
  target: ReviewEntryTarget;
  queueInstance?: Pick<IReviewQueue, 'getCards'> | null;
}

export interface ReviewAdmissionModuleOptions {
  isStartupWriteCapable?: () => boolean;
  now?: () => number;
}

export class ReviewAdmissionModule {
  private readonly isStartupWriteCapable: () => boolean;
  private readonly now: () => number;

  constructor(
    private readonly manager: UnifiedDataSourceManager,
    options: ReviewAdmissionModuleOptions = {},
  ) {
    this.isStartupWriteCapable = options.isStartupWriteCapable ?? (() => true);
    this.now = options.now ?? (() => Date.now());
  }

  async admitReviewSession(request: ReviewAdmissionRequest): Promise<ReviewAdmissionTicket | null> {
    if (request.target.kind !== 'projection-queue') {
      return null;
    }

    const target = request.target;
    const readinessRequest = buildReviewAdmissionReadinessRequest(target.queueType);
    const readinessResult = await this.manager.readQueueProjection({
      type: 'readiness',
      request: readinessRequest,
    });
    const ready = readinessResult.type === 'readiness'
      ? readinessResult.readiness
      : {
        status: 'unavailable' as const,
        queueId: target.queueType,
        policyId: '',
        cause: 'contract_mismatch' as const,
        reason: 'Review Admission received unexpected lifecycle read result',
        recoverable: false,
      };
    if (ready.status === 'ready') {
      return this.toTicket(target, readinessRequest, ready, 'ready-projection');
    }

    if (!isRecoverableReadiness(ready)) {
      throw new Error(`REVIEW_ADMISSION_UNAVAILABLE: ${target.queueType} projection is not readable: ${formatReadiness(ready)}`);
    }

    if (!this.isStartupWriteCapable()) {
      logger.warn('[SiYuanMemo][ReviewAdmission] admitted read-only recovery queue state without projection materialization', {
        queueType: target.queueType,
        entrySurface: target.entrySurface,
        readiness: formatReadiness(ready),
      });
      return {
        queueType: target.queueType,
        entrySurface: target.entrySurface,
        entryTargetIdentity: buildReviewEntryTargetIdentity(target),
        projectionPolicyHash: null,
        projectionGeneration: null,
        readinessRequest,
        admittedAt: this.now(),
        source: 'read-only-recovery-queue-state',
      };
    }

    const repaired = await this.manager.repairQueueProjection({
      type: 'materialize',
      queueType: target.queueType,
      queueOverride: request.queueInstance ?? this.manager.getQueue(target.queueType),
      readinessRequest,
      reason: 'review-admission',
    });
    if (repaired.status !== 'ready' || !isReadyMaterialization(repaired.result)) {
      throw new Error(`REVIEW_ADMISSION_UNAVAILABLE: ${target.queueType} projection materialization did not produce a ready identity`);
    }
    const materialized = repaired.result;

    logger.info('[SiYuanMemo][ReviewAdmission] admitted review session after projection materialization', {
      queueType: target.queueType,
      entrySurface: target.entrySurface,
      projectionPolicyHash: materialized.policyHash,
      projectionGeneration: materialized.generation,
      rows: materialized.rows,
    });
    return {
      queueType: target.queueType,
      entrySurface: target.entrySurface,
      entryTargetIdentity: buildReviewEntryTargetIdentity(target),
      projectionPolicyHash: materialized.policyHash,
      projectionGeneration: Number(materialized.generation),
      readinessRequest,
      admittedAt: this.now(),
      source: 'materialized-projection',
    };
  }

  private toTicket(
    target: ProjectionQueueEntryTarget,
    readinessRequest: QueueProjectionReadinessRequest,
    readiness: Extract<QueueProjectionReadiness, { status: 'ready' }>,
    source: ReviewAdmissionTicket['source'],
  ): ReviewAdmissionTicket {
    return {
      queueType: target.queueType,
      entrySurface: target.entrySurface,
      entryTargetIdentity: buildReviewEntryTargetIdentity(target),
      projectionPolicyHash: readiness.policyId,
      projectionGeneration: Number(readiness.generation),
      readinessRequest,
      admittedAt: this.now(),
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
  target: ReviewEntryTarget,
): value is ReviewAdmissionTicket {
  return Boolean(
    value
    && target.admission.kind === 'required'
    && value.queueType === target.queueType
    && value.entrySurface === target.entrySurface
    && value.entryTargetIdentity === buildReviewEntryTargetIdentity(target)
    && isReviewAdmissionQueueType(value.queueType)
    && (
      value.source === 'read-only-recovery-queue-state'
      || (isNonEmptyString(value.projectionPolicyHash) && isPositiveInteger(value.projectionGeneration))
    ),
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

function formatReadiness(readiness: QueueProjectionReadiness): string {
  if (readiness.status === 'ready') {
    return `ready policy=${readiness.policyId} generation=${readiness.generation}`;
  }
  if (readiness.status === 'refreshing') {
    return `refreshing cause=${readiness.cause} policy=${readiness.policyId}`;
  }
  return `unavailable cause=${readiness.cause} recoverable=${readiness.recoverable} reason=${readiness.reason}`;
}
