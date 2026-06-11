import { describe, expect, it } from 'vitest';
import type { BrowserCard } from '../../types';
import type { QueueSnapshotRow } from '@/types/queue-browser';
import * as sharedRows from '@/application/queries/browser/shared/BrowserRowUtils';
import * as datasourceRows from '../DataSourceUtils';

type BrowserCardWithHeadline = BrowserCard & { headline?: string };

function buildCard(overrides: Partial<BrowserCardWithHeadline>): BrowserCardWithHeadline {
  return {
    id: overrides.id ?? 'card',
    fsrsCardId: overrides.fsrsCardId ?? overrides.id ?? 'card',
    blockId: overrides.blockId ?? overrides.id ?? 'block',
    deckId: overrides.deckId ?? 'deck-a',
    content: overrides.content ?? 'content',
    fullContent: overrides.fullContent ?? overrides.content ?? 'content',
    rootId: overrides.rootId ?? 'doc-a',
    state: overrides.state ?? 0,
    stateLabel: overrides.stateLabel ?? 'New',
    due: overrides.due ?? new Date('2026-01-01T00:00:00.000Z'),
    dueFormatted: overrides.dueFormatted ?? '',
    stability: overrides.stability ?? 1,
    difficulty: overrides.difficulty ?? 1,
    retrievability: overrides.retrievability ?? 0.9,
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
    note: overrides.note ?? '',
    cardType: overrides.cardType,
    aFactor: overrides.aFactor,
    meta: overrides.meta,
    headline: overrides.headline,
  };
}

function buildQueueRow(id: string, overrides: Partial<QueueSnapshotRow> = {}): QueueSnapshotRow {
  return {
    id,
    fsrsCardId: id,
    blockId: `block-${id}`,
    deckId: 'deck-a',
    rootId: 'doc-a',
    content: `${id} content`,
    fullContent: `${id} full content`,
    state: 0,
    due: new Date('2026-01-01T00:00:00.000Z').getTime(),
    stability: 1,
    difficulty: 2,
    retrievability: 0.5,
    reps: 0,
    lapses: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    lastReview: null,
    interval: 0,
    firstReview: null,
    priority: 50,
    suspended: false,
    cardType: 'item',
    tags: [],
    queueIndex: 0,
    blockType: null,
    ...overrides,
  };
}

describe('DataSourceUtils row helper facade parity', () => {
  it('keeps queue snapshot filters equal to shared Browser row helpers', () => {
    const yesterday = new Date('2026-01-10T00:00:00.000Z').getTime();
    const tomorrow = new Date('2027-01-12T00:00:00.000Z').getTime();
    const rows: QueueSnapshotRow[] = [
      buildQueueRow('item-due', {
        rootId: 'doc-a',
        content: 'alpha due item',
        fullContent: 'alpha due item',
        due: yesterday,
        cardType: 'item',
      }),
      buildQueueRow('topic-due-child', {
        rootId: 'doc-a-child',
        content: 'alpha due topic',
        fullContent: 'alpha due topic',
        due: yesterday,
        cardType: 'topic',
      }),
      buildQueueRow('topic-future-child', {
        rootId: 'doc-a-child',
        content: 'alpha future topic',
        fullContent: 'alpha future topic',
        due: tomorrow,
        cardType: 'topic',
      }),
      buildQueueRow('topic-missing-child', {
        rootId: 'doc-a-child',
        content: 'alpha missing topic',
        fullContent: 'alpha missing topic',
        due: yesterday,
        cardType: 'topic',
        blockType: 'missing',
      }),
    ];
    const options = {
      scopeDocIds: ['doc-a', 'doc-a-child'],
      docId: 'doc-a-child',
      preset: 'due',
      queryText: 'alpha',
      cardType: 'topic-only',
    };

    const datasourceResult = datasourceRows.applyQueueFiltersToSnapshotRows(rows, options, 'fullContent');
    const sharedResult = sharedRows.applyQueueFiltersToSnapshotRows(rows, options, 'fullContent');

    expect(datasourceResult.map((row) => row.id)).toEqual(['topic-due-child']);
    expect(datasourceResult.map((row) => row.id)).toEqual(sharedResult.map((row) => row.id));
  });

  it('keeps secondary-field simple-query behavior equal for headline and fullContent rows', () => {
    const headlineRows = [
      buildCard({ id: 'headline', blockId: 'block-headline', content: 'plain body', fullContent: 'plain body', headline: 'needle title' }),
      buildCard({ id: 'none', blockId: 'block-none', content: 'plain body', fullContent: 'plain body', headline: 'plain title' }),
    ];
    const fullContentRows = [
      buildCard({ id: 'full', blockId: 'block-full', content: 'plain body', fullContent: 'needle expanded body', headline: 'plain title' }),
      buildCard({ id: 'none', blockId: 'block-none', content: 'plain body', fullContent: 'plain body', headline: 'plain title' }),
    ];

    const datasourceHeadline = datasourceRows.applySimpleQueryFilter(headlineRows, 'needle', { secondaryField: 'headline' });
    const sharedHeadline = sharedRows.applySimpleQueryFilter(headlineRows, 'needle', { secondaryField: 'headline' });
    const datasourceFullContent = datasourceRows.applySimpleQueryFilter(fullContentRows, 'needle', { secondaryField: 'fullContent' });
    const sharedFullContent = sharedRows.applySimpleQueryFilter(fullContentRows, 'needle', { secondaryField: 'fullContent' });

    expect(datasourceHeadline.map((row) => row.id)).toEqual(['headline']);
    expect(datasourceHeadline.map((row) => row.id)).toEqual(sharedHeadline.map((row) => row.id));
    expect(datasourceFullContent.map((row) => row.id)).toEqual(['full']);
    expect(datasourceFullContent.map((row) => row.id)).toEqual(sharedFullContent.map((row) => row.id));
  });

  it('keeps row sorting equal across datasource and shared helper surfaces', () => {
    const browserRows = [
      buildCard({ id: 'c3', blockId: 'b3', priority: 50 }),
      buildCard({ id: 'c1', blockId: 'b1', priority: 10 }),
      buildCard({ id: 'c2', blockId: 'b2', priority: 30 }),
    ];
    const queueRows = [
      buildQueueRow('q3', { blockId: 'b3', priority: 10, queueIndex: 2 }),
      buildQueueRow('q1', { blockId: 'b1', priority: 10, queueIndex: 0 }),
      buildQueueRow('q2', { blockId: 'b2', priority: 10, queueIndex: 1 }),
    ];

    const datasourceBrowserSort = datasourceRows.sortBrowserRows(browserRows, [{ colId: 'priority', sort: 'asc' }]);
    const sharedBrowserSort = sharedRows.sortBrowserRows(browserRows, [{ colId: 'priority', sort: 'asc' }]);
    const datasourceQueueSort = datasourceRows.sortQueueSnapshotRows(queueRows, [{ colId: 'priority', sort: 'asc' }]);
    const sharedQueueSort = sharedRows.sortQueueSnapshotRows(queueRows, [{ colId: 'priority', sort: 'asc' }]);

    expect(datasourceBrowserSort.map((row) => row.id)).toEqual(['c1', 'c2', 'c3']);
    expect(datasourceBrowserSort.map((row) => row.id)).toEqual(sharedBrowserSort.map((row) => row.id));
    expect(datasourceQueueSort.map((row) => row.id)).toEqual(['q1', 'q2', 'q3']);
    expect(datasourceQueueSort.map((row) => row.id)).toEqual(sharedQueueSort.map((row) => row.id));
  });

  it('exports shared row helpers through the datasource facade', () => {
    expect(datasourceRows.applyCardTypeFilter).toBe(sharedRows.applyCardTypeFilter);
    expect(datasourceRows.applyQueueFilters).toBe(sharedRows.applyQueueFilters);
    expect(datasourceRows.applyQueueFiltersToSnapshotRows).toBe(sharedRows.applyQueueFiltersToSnapshotRows);
    expect(datasourceRows.applySimpleQueryFilter).toBe(sharedRows.applySimpleQueryFilter);
    expect(datasourceRows.isMissingBlockCard).toBe(sharedRows.isMissingBlockCard);
    expect(datasourceRows.sortBrowserRows).toBe(sharedRows.sortBrowserRows);
    expect(datasourceRows.sortQueueSnapshotRows).toBe(sharedRows.sortQueueSnapshotRows);
  });
});
