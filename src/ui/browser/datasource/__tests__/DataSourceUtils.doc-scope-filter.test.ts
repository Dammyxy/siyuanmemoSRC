import { describe, expect, it } from 'vitest';
import type { QueueSnapshotRow } from '@/types/queue-browser';
import { applyQueueFiltersToSnapshotRows } from '../DataSourceUtils';

function buildQueueRow(id: string, overrides: Partial<QueueSnapshotRow> = {}): QueueSnapshotRow {
  return {
    id,
    fsrsCardId: id,
    blockId: `block-${id}`,
    deckId: 'deck-a',
    rootId: 'doc-a',
    content: `${id} headline`,
    fullContent: `${id} full content`,
    state: 2,
    due: Date.now() - 1000,
    stability: 1,
    difficulty: 2,
    retrievability: 0.5,
    reps: 1,
    lapses: 0,
    elapsedDays: 1,
    scheduledDays: 1,
    lastReview: null,
    interval: 1,
    firstReview: null,
    priority: 50,
    suspended: false,
    cardType: 'item',
    tags: [],
    ...overrides,
  };
}

describe('applyQueueFiltersToSnapshotRows doc-tree scope support', () => {
  it('intersects scopeDocIds with docId, preset, search text, and card type', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const rows = [
      buildQueueRow('row-1', { rootId: 'doc-1', content: 'alpha root', fullContent: 'alpha root', due: yesterday.getTime(), cardType: 'item' }),
      buildQueueRow('row-2', { rootId: 'doc-1-child', content: 'alpha child', fullContent: 'alpha child', due: yesterday.getTime(), cardType: 'topic' }),
      buildQueueRow('row-3', { rootId: 'doc-1-child', content: 'alpha child future', fullContent: 'alpha child future', due: tomorrow.getTime(), cardType: 'topic' }),
      buildQueueRow('row-4', { rootId: 'doc-2', content: 'alpha outside', fullContent: 'alpha outside', due: yesterday.getTime(), cardType: 'topic' }),
    ];

    const filtered = applyQueueFiltersToSnapshotRows(
      rows,
      {
        scopeDocIds: ['doc-1', 'doc-1-child'],
        docId: 'doc-1-child',
        preset: 'due',
        queryText: 'alpha',
        cardType: 'topic-only',
      },
      'fullContent',
    );

    expect(filtered.map((row) => row.id)).toEqual(['row-2']);
  });
});
