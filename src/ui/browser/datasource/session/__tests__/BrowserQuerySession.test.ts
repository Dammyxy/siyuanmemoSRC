import { describe, expect, it, vi } from 'vitest';
import type { BrowserCard } from '../../../types';
import { BrowserQuerySession, toLiteRowFromBrowserCard } from '../BrowserQuerySession';

function makeCard(blockId: string): BrowserCard {
  return {
    id: blockId,
    fsrsCardId: blockId,
    blockId,
    deckId: 'deck-a',
    content: blockId,
    fullContent: blockId,
    rootId: 'doc-a',
    state: 0,
    stateLabel: 'New',
    due: new Date(),
    dueFormatted: '',
    stability: 0,
    difficulty: 0,
    retrievability: 0,
    reps: 0,
    lapses: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    lastReview: null,
    lastReviewFormatted: '',
    interval: 0,
    firstReview: null,
    firstReviewFormatted: '',
    priority: 50,
    suspended: false,
    tags: [],
  };
}

describe('BrowserQuerySession', () => {
  it('reuses one session for repeated block fetch under same fingerprint', async () => {
    const rows = [makeCard('a'), makeCard('b'), makeCard('c'), makeCard('d')];
    const buildLiteRows = vi.fn().mockResolvedValue(rows.map(toLiteRowFromBrowserCard));
    const session = new BrowserQuerySession('test');

    const first = await session.fetchRows({
      queryFingerprint: 'fp-a',
      buildLiteRows,
      startRow: 0,
      endRow: 2,
    });
    const second = await session.fetchRows({
      queryFingerprint: 'fp-a',
      buildLiteRows,
      startRow: 2,
      endRow: 4,
    });

    expect(first.rows).toHaveLength(2);
    expect(second.rows).toHaveLength(2);
    expect(first.totalCount).toBe(4);
    expect(second.totalCount).toBe(4);
    expect(buildLiteRows).toHaveBeenCalledTimes(1);
  });

  it('rebuilds session after fingerprint change and does not leak old result', async () => {
    const firstRows = [makeCard('a'), makeCard('b')];
    const secondRows = [makeCard('x')];
    const buildLiteRows = vi
      .fn()
      .mockResolvedValueOnce(firstRows.map(toLiteRowFromBrowserCard))
      .mockResolvedValueOnce(secondRows.map(toLiteRowFromBrowserCard));
    const session = new BrowserQuerySession('test');

    const first = await session.fetchRows({
      queryFingerprint: 'fp-a',
      buildLiteRows,
      startRow: 0,
      endRow: 10,
    });
    const second = await session.fetchRows({
      queryFingerprint: 'fp-b',
      buildLiteRows,
      startRow: 0,
      endRow: 10,
    });

    expect(first.totalCount).toBe(2);
    expect(second.totalCount).toBe(1);
    expect(second.rows[0]?.blockId).toBe('x');
    expect(buildLiteRows).toHaveBeenCalledTimes(2);
  });

  it('keeps empty result cached for same fingerprint', async () => {
    const buildLiteRows = vi.fn().mockResolvedValue([]);
    const session = new BrowserQuerySession('test');

    await session.fetchRows({
      queryFingerprint: 'fp-empty',
      buildLiteRows,
      startRow: 0,
      endRow: 50,
    });

    await session.fetchRows({
      queryFingerprint: 'fp-empty',
      buildLiteRows,
      startRow: 50,
      endRow: 100,
    });

    expect(buildLiteRows).toHaveBeenCalledTimes(1);
    expect(session.getStats().totalRows).toBe(0);
  });
});
