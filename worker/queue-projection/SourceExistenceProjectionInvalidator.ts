import type { SqlQueueProjectionRepository } from '@/infrastructure/persistence/sqlite/SqlQueueProjectionRepository';
import { QueueType } from '@/types/unified-data-source';

export type SourceExistenceProjectionInvalidatorDeps = {
  queueProjection: Pick<SqlQueueProjectionRepository, 'invalidateQueues'> | null;
};

export class SourceExistenceProjectionInvalidator {
  constructor(private readonly deps: SourceExistenceProjectionInvalidatorDeps) {}

  invalidateForSourceChanges(blockIds: Iterable<unknown>, checkedAt: number): void {
    const affectedBlockIds = uniqueStrings(blockIds);
    if (!this.deps.queueProjection || affectedBlockIds.length === 0) {
      return;
    }
    this.deps.queueProjection.invalidateQueues({
      queueTypes: [
        QueueType.RetrievalPractice,
        QueueType.IncrementalLearning,
        QueueType.FilterGroup,
        QueueType.FinalDrill,
        QueueType.Leech,
        QueueType.NeuralRoam,
      ],
      reason: 'source-existence-changed',
      affectedBlockIds,
      generation: Math.max(1, Math.floor(Number(checkedAt) || Date.now())),
      createdAt: checkedAt,
      metadata: {
        source: 'source-existence-sweep',
      },
    });
  }
}

function uniqueStrings(values: Iterable<unknown>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
