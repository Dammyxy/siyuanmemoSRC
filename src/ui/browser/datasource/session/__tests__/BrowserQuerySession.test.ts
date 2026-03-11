import { describe, expect, it, vi } from 'vitest';
import type { BrowserCard } from '../../../types';
import { BrowserQuerySession, toLiteRowFromBrowserCard } from '../BrowserQuerySession';

function makeCard(blockId: string, overrides: Partial<BrowserCard> = {}): BrowserCard {
  return {
    id: overrides.id ?? blockId,
    fsrsCardId: overrides.fsrsCardId ?? blockId,
    blockId,
    deckId: overrides.deckId ?? 'deck-a',
    content: overrides.content ?? blockId,
    fullContent: overrides.fullContent ?? blockId,
    rootId: overrides.rootId ?? 'doc-a',
    state: overrides.state ?? 0,
    stateLabel: overrides.stateLabel ?? 'New',
    due: overrides.due ?? new Date(),
    dueFormatted: overrides.dueFormatted ?? '',
    stability: overrides.stability ?? 0,
    difficulty: overrides.difficulty ?? 0,
    retrievability: overrides.retrievability ?? 0,
    reps: overrides.reps ?? 0,
    lapses: overrides.lapses ?? 0,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 0,
    lastReview: overrides.lastReview ?? null,
    lastReviewFormatted: overrides.lastReviewFormatted ?? '',
    interval: overrides.interval ?? 0,
    firstReview: overrides.firstReview ?? null,
    firstReviewFormatted: overrides.firstReviewFormatted ?? '',
    priority: overrides.priority ?? 50,
    suspended: overrides.suspended ?? false,
    tags: overrides.tags ?? [],
    note: overrides.note,
    cardType: overrides.cardType,
    aFactor: overrides.aFactor,
    meta: overrides.meta,
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

  it('keeps all rows when multiple cards share the same blockId', async () => {
    const rows = [
      makeCard('same-block', { id: 'riff-1', fsrsCardId: 'fsrs-1', priority: 98 }),
      makeCard('same-block', { id: 'riff-2', fsrsCardId: 'fsrs-2', priority: 50 }),
      makeCard('same-block', { id: 'riff-3', fsrsCardId: 'fsrs-3', priority: 48 }),
    ];
    const buildLiteRows = vi.fn().mockResolvedValue(rows.map(toLiteRowFromBrowserCard));
    const session = new BrowserQuerySession('test');

    const result = await session.fetchRows({
      queryFingerprint: 'fp-same-block',
      buildLiteRows,
      startRow: 0,
      endRow: 10,
    });

    expect(result.totalCount).toBe(3);
    expect(result.rows).toHaveLength(3);
    expect(result.rows.map((row) => row.fsrsCardId)).toEqual(['fsrs-1', 'fsrs-2', 'fsrs-3']);

    const matchedIds = await session.getAllMatchedIds({
      queryFingerprint: 'fp-same-block',
      buildLiteRows,
    });
    expect(matchedIds).toEqual(['fsrs-1', 'fsrs-2', 'fsrs-3']);
  });

  it('hydrates lite rows on demand without row snapshots and preserves requested order', async () => {
    const buildLiteRows = vi.fn().mockResolvedValue([
      { id: 'card-a', blockId: 'block-a' },
      { id: 'card-b', blockId: 'block-b' },
      { id: 'card-c', blockId: 'block-c' },
    ]);
    const hydrateRows = vi.fn(async (ids: string[]) => ids.map((id) => makeCard(`block-${id}`, {
      id,
      fsrsCardId: id,
      content: id,
    })));
    const session = new BrowserQuerySession('test');

    const matchedIds = await session.getAllMatchedIds({
      queryFingerprint: 'fp-lite-only',
      buildLiteRows,
      hydrateRows,
    });
    expect(matchedIds).toEqual(['card-a', 'card-b', 'card-c']);
    expect(hydrateRows).not.toHaveBeenCalled();

    const rows = await session.getRowsByIds(['card-c', 'card-a'], {
      queryFingerprint: 'fp-lite-only',
      buildLiteRows,
      hydrateRows,
    });
    expect(rows.map((row) => row.fsrsCardId)).toEqual(['card-c', 'card-a']);
    expect(hydrateRows).toHaveBeenCalledTimes(1);
    expect(hydrateRows).toHaveBeenCalledWith(['card-c', 'card-a']);

    await session.getRowsByIds(['card-c'], {
      queryFingerprint: 'fp-lite-only',
      buildLiteRows,
      hydrateRows,
    });
    expect(hydrateRows).toHaveBeenCalledTimes(1);
  });

  it('returns action targets from lite rows without hydrating browser cards', async () => {
    const buildLiteRows = vi.fn().mockResolvedValue([
      {
        id: 'card-a',
        blockId: 'block-a',
        actionTarget: { id: 'row-a', blockId: 'block-a', fsrsCardId: 'card-a', priority: 10 },
      },
      {
        id: 'card-b',
        blockId: 'block-b',
        actionTarget: { id: 'row-b', blockId: 'block-b', fsrsCardId: 'card-b', priority: 20 },
      },
    ]);
    const hydrateRows = vi.fn();
    const session = new BrowserQuerySession('test');

    const targets = await session.getActionTargetsByIds(['card-b', 'card-a'], {
      queryFingerprint: 'fp-action-targets',
      buildLiteRows,
      hydrateRows,
    });

    expect(targets).toEqual([
      { id: 'row-b', blockId: 'block-b', fsrsCardId: 'card-b', priority: 20 },
      { id: 'row-a', blockId: 'block-a', fsrsCardId: 'card-a', priority: 10 },
    ]);
    expect(hydrateRows).not.toHaveBeenCalled();
  });
});
