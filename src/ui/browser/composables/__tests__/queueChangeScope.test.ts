import { describe, expect, it } from 'vitest';
import { QueueType } from '@/types/unified-data-source';
import { shouldRefreshQueueData } from '../queueChangeScope';

describe('shouldRefreshQueueData', () => {
  it('returns false when there is no active queue', () => {
    const shouldRefresh = shouldRefreshQueueData(
      null,
      QueueType.RetrievalPractice,
      [QueueType.RetrievalPractice],
    );

    expect(shouldRefresh).toBe(false);
  });

  it('returns true when affected queue types are unknown', () => {
    const shouldRefresh = shouldRefreshQueueData(
      'retrieval',
      QueueType.RetrievalPractice,
      null,
    );

    expect(shouldRefresh).toBe(true);
  });

  it('returns false when active queue is not affected', () => {
    const shouldRefresh = shouldRefreshQueueData(
      'retrieval',
      QueueType.RetrievalPractice,
      [QueueType.FinalDrill, QueueType.FilterGroup],
    );

    expect(shouldRefresh).toBe(false);
  });

  it('returns true when active queue is affected', () => {
    const shouldRefresh = shouldRefreshQueueData(
      'retrieval',
      QueueType.RetrievalPractice,
      [QueueType.FinalDrill, QueueType.RetrievalPractice],
    );

    expect(shouldRefresh).toBe(true);
  });
});
