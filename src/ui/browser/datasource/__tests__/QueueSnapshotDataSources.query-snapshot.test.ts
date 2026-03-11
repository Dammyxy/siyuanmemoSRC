import { describe, expect, it, vi } from 'vitest';
import { RetrievalDataSource } from '../RetrievalDataSource';
import { FinalDrillDataSource } from '../FinalDrillDataSource';
import { FilterGroupDataSource } from '../FilterGroupDataSource';
import { IncrementalLearningDataSource } from '../IncrementalLearningDataSource';
import type { BrowserCard } from '../../types';
import { CardState } from '../../types';

function buildBrowserCard(id: string): BrowserCard {
  return {
    id,
    fsrsCardId: id,
    blockId: `block-${id}`,
    deckId: 'deck-a',
    content: id,
    fullContent: id,
    rootId: 'doc-a',
    state: CardState.Review,
    stateLabel: 'Review',
    due: new Date(),
    dueFormatted: '',
    stability: 1,
    difficulty: 2,
    retrievability: 0.5,
    reps: 1,
    lapses: 0,
    elapsedDays: 1,
    scheduledDays: 1,
    lastReview: null,
    lastReviewFormatted: '',
    interval: 1,
    firstReview: null,
    firstReviewFormatted: '',
    priority: 50,
    suspended: false,
    tags: [],
  };
}

const DATA_SOURCE_CASES = [
  ['retrieval', RetrievalDataSource],
  ['final-drill', FinalDrillDataSource],
  ['filter-group', FilterGroupDataSource],
  ['incremental-learning', IncrementalLearningDataSource],
] as const;

describe('queue snapshot datasource path', () => {
  it.each(DATA_SOURCE_CASES)('%s fetchRows uses browserService snapshot path', async (_queueId, DataSourceCtor) => {
    const manager = {
      getQueue: vi.fn(() => {
        throw new Error('legacy queue.getCards path should not run when browserService is available');
      }),
    } as never;
    const browserService = {
      getQueueQuerySnapshot: vi.fn(async () => ({
        total: 3,
        rows: [
          { id: 'card-1', blockId: 'block-1', fsrsCardId: 'card-1' },
          { id: 'card-2', blockId: 'block-2', fsrsCardId: 'card-2' },
          { id: 'card-3', blockId: 'block-3', fsrsCardId: 'card-3' },
        ],
      })),
      getQueueRowsByIds: vi.fn(async (_queue: string, ids: string[]) => ids.map((id) => buildBrowserCard(id))),
    };

    const dataSource = new DataSourceCtor(
      manager,
      { preset: 'all', queryText: '', cardType: 'all' },
      undefined,
      { browserService },
    );

    const paged = await dataSource.fetchRows({
      sortModel: [{ colId: 'priority', sort: 'desc' }],
      filterModel: {},
      startRow: 1,
      endRow: 3,
    });

    expect(paged.totalCount).toBe(3);
    expect(paged.rows.map((row) => row.fsrsCardId)).toEqual(['card-2', 'card-3']);
    expect(browserService.getQueueQuerySnapshot).toHaveBeenCalledTimes(1);
    expect(browserService.getQueueRowsByIds).toHaveBeenCalledWith(expect.any(String), ['card-2', 'card-3']);

    const ids = await dataSource.getAllMatchedIds();
    expect(ids).toEqual(['card-1', 'card-2', 'card-3']);
    expect(browserService.getQueueRowsByIds).toHaveBeenCalledTimes(1);

    const hydrated = await dataSource.getRowsByIds(['card-3', 'card-1']);
    expect(hydrated.map((row) => row.fsrsCardId)).toEqual(['card-3', 'card-1']);
    expect(browserService.getQueueRowsByIds).toHaveBeenNthCalledWith(2, expect.any(String), ['card-1']);
  });

  it('falls back to legacy queue.getCards path when browserService is missing', async () => {
    const queue = {
      getCards: vi.fn(async () => []),
    };
    const manager = {
      getQueue: vi.fn(() => queue),
    } as never;

    const dataSource = new RetrievalDataSource(manager);
    await dataSource.fetchRows({ startRow: 0, endRow: 20, sortModel: [], filterModel: {} });

    expect(queue.getCards).toHaveBeenCalledOnce();
  });
});
