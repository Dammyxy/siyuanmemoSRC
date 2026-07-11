import type {
  BackendCardScheduleBatchUpdateRequest,
  BackendCardScheduleBatchUpdateResult,
} from '../../../packages/contracts/src/backend-rpc';
import type { ReviewLogV2 } from '@/types/review';
import type { FSRSCard } from '@/types/card';
import type { CardUpdatePort } from '@/core/scheduler/ports';
import {
  canonicalizeSchedulingState,
  type SchedulingWriteSource,
} from '@/core/scheduler/schedulingStateCleanliness';

export interface WorkerCardScheduleMutationExecutor {
  execute(
    request: BackendCardScheduleBatchUpdateRequest,
  ): Promise<BackendCardScheduleBatchUpdateResult>;
}

export class WorkerCardScheduleUpdateAdapter implements CardUpdatePort {
  constructor(
    private readonly executor: WorkerCardScheduleMutationExecutor,
    private readonly reviewLogWriter?: { addReviewLogV2(log: ReviewLogV2): Promise<void> },
    private readonly createMutationId: () => string = createCardScheduleMutationId,
  ) {}

  async batchUpdateCardsWithoutEvents(
    cards: FSRSCard[],
    options: {
      preferIncomingScheduling?: boolean;
      schedulingWriteSource?: SchedulingWriteSource;
      suppressAutosave?: boolean;
      suppressDueIndexSort?: boolean;
    } = {},
  ): Promise<void> {
    if (!cards || cards.length === 0) {
      return;
    }

    const source = options.schedulingWriteSource ?? 'review-commit';
    const deduped = new Map<string, FSRSCard>();
    for (const candidate of cards) {
      const cardId = String(candidate?.id || '').trim();
      if (!cardId) {
        throw new Error('INVALID_REQUEST: Card/Schedule Worker update requires card id');
      }
      deduped.set(cardId, canonicalizeSchedulingState(candidate, {
        source,
        mode: 'assert-internal',
      }).card);
    }
    const cardsToPersist = Array.from(deduped.values());
    const request: BackendCardScheduleBatchUpdateRequest = {
      mutationId: this.createMutationId(),
      schedulingWriteSource: source,
      cards: cardsToPersist,
    };
    const result = await this.executor.execute(request);
    const receipt = result.durabilityReceipt;
    if (
      receipt.family !== 'card-schedule'
      || (receipt.stage !== 'journaled' && receipt.stage !== 'truth-committed')
      || receipt.mutationId !== request.mutationId
    ) {
      throw new Error('STORAGE_JOURNAL_FAILED: Card/Schedule Worker update returned invalid durability receipt');
    }
  }

  async addReviewLogV2(log: ReviewLogV2): Promise<void> {
    await this.reviewLogWriter?.addReviewLogV2(log);
  }
}

let fallbackMutationSequence = 0;

function createCardScheduleMutationId(): string {
  const randomUUID = globalThis.crypto?.randomUUID?.();
  if (randomUUID) {
    return `card-schedule:${randomUUID}`;
  }
  fallbackMutationSequence += 1;
  return `card-schedule:${Date.now()}:${fallbackMutationSequence}`;
}
