import { describe, expect, it } from 'vitest';
import { createInMemoryReviewFeedbackJournalStore } from '../ReviewFeedbackJournalStore';

describe('ReviewFeedbackJournalStore', () => {
  it('lists journal entries by status in recorded-time batches', async () => {
    const store = createInMemoryReviewFeedbackJournalStore();
    await store.appendEntry({
      id: 'prepared-late',
      status: 'prepared',
      recordedAt: 30,
      cardId: 'card-late',
      request: { cardId: 'card-late' },
    });
    await store.appendEntry({
      id: 'projection-applied-early',
      status: 'projection-applied',
      recordedAt: 1,
      cardId: 'card-applied',
      request: { cardId: 'card-applied' },
    });
    await store.appendEntry({
      id: 'prepared-early',
      status: 'prepared',
      recordedAt: 10,
      cardId: 'card-early',
      request: { cardId: 'card-early' },
    });
    await store.appendEntry({
      id: 'prepared-middle',
      status: 'prepared',
      recordedAt: 20,
      cardId: 'card-middle',
      request: { cardId: 'card-middle' },
    });

    await expect(store.listEntriesByStatus('prepared', 2)).resolves.toMatchObject([
      { id: 'prepared-early' },
      { id: 'prepared-middle' },
    ]);
  });
});
