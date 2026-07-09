import { describe, expect, it, vi } from 'vitest';
import { NativeRiffImportSourceAdapter } from '../NativeRiffImportSourceAdapter';

describe('NativeRiffImportSourceAdapter', () => {
  it('maps Native Riff cards through a read-only interface', async () => {
    const readRiffCards = vi.fn(async () => [{
      id: '20260610140511-bb340gl',
      content: '反思>>反思',
      riffCardID: 'legacy-card-id',
      riffCard: {
        id: '20260610192850-rzrmc29',
        blockID: '20260610140511-bb340gl',
        deckID: 'deck-1',
        due: '2026-07-15T00:00:00.000Z',
        reps: 9,
        lapses: 1,
        state: 2,
        lastReview: '2026-07-10T00:00:00.000Z',
        stability: 4.5,
        difficulty: 6.2,
        elapsedDays: 5,
        scheduledDays: 10,
      },
    }]);
    const adapter = new NativeRiffImportSourceAdapter({
      deckId: 'deck-1',
      readRiffCards,
    });

    await expect(adapter.listImportCandidates()).resolves.toEqual([{
      nativeCardId: '20260610192850-rzrmc29',
      deckId: 'deck-1',
      blockId: '20260610140511-bb340gl',
      sourceMarkdown: '反思>>反思',
      schedule: {
        due: '2026-07-15T00:00:00.000Z',
        reps: 9,
        lapses: 1,
        state: 2,
        lastReview: '2026-07-10T00:00:00.000Z',
        stability: 4.5,
        difficulty: 6.2,
      },
    }]);
    expect(readRiffCards).toHaveBeenCalledWith('deck-1', {
      includeNew: true,
    });
    expect(adapter).not.toHaveProperty('addRiffCards');
    expect(adapter).not.toHaveProperty('removeRiffCards');
    expect(adapter).not.toHaveProperty('reviewRiffCard');
  });
});
