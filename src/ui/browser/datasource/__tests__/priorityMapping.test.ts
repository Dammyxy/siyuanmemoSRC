import { describe, expect, it } from 'vitest';
import { DeckDataSource } from '../DeckDataSource';
import { mapQueueFsrsCardToBrowserCard } from '../QueueBrowserCardMapper';
import { CardState, CardType } from '@/types/card';
import type { BrowserCard } from '../../types';
import type { FSRSCard } from '@/types/card';
import type { IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';

function buildFsrsCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = Date.now();

  return {
    id: overrides.id ?? 'card-1',
    xiuyuanID: overrides.xiuyuanID ?? overrides.id ?? 'card-1',
    blockId: overrides.blockId ?? 'block-1',
    due: overrides.due ?? now,
    stability: overrides.stability ?? 1,
    difficulty: overrides.difficulty ?? 1,
    reps: overrides.reps ?? 0,
    lapses: overrides.lapses ?? 0,
    state: overrides.state ?? 0,
    lastReview: overrides.lastReview ?? now,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 0,
    priority: overrides.priority ?? 50,
    type: overrides.type ?? 'item',
    tags: overrides.tags ?? [],
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    meta: overrides.meta ?? {},
    aFactor: overrides.aFactor,
    riffCardId: overrides.riffCardId,
  };
}

function convertDeckCard(ds: DeckDataSource, card: FSRSCard): BrowserCard {
  return (ds as unknown as { convertToBrowserCard: (value: FSRSCard) => BrowserCard }).convertToBrowserCard(card);
}

describe('priority mapping consistency', () => {
  it('keeps priority=0 in QueueBrowserCardMapper', () => {
    const mapped = mapQueueFsrsCardToBrowserCard(buildFsrsCard({ priority: 0 }));
    expect(mapped.priority).toBe(0);
  });

  it('preserves queue browser metadata, queue index, and first-review policy', () => {
    const createdAt = 1_700_000_000_000 - 604_800_000;
    const lastReview = 1_700_000_000_000 - 86_400_000;
    const mapped = mapQueueFsrsCardToBrowserCard(
      buildFsrsCard({
        id: 'fsrs-1',
        riffCardId: 'riff-1',
        state: CardState.Review,
        reps: 1,
        createdAt,
        lastReview,
        type: CardType.Descriptor,
        tags: ['queue'],
        meta: {
          content: '<p>Browser source</p>',
          deckId: 'deck-1',
          rootId: 'root-1',
          note: 'browser note',
        },
      }),
      { firstReviewMode: 'created-or-last', queueIndex: 4 },
    );

    expect(mapped).toMatchObject({
      id: 'riff-1',
      fsrsCardId: 'fsrs-1',
      content: 'Browser source',
      fullContent: '<p>Browser source</p>',
      stateLabel: '复习',
      queueIndex: 4,
      note: 'browser note',
      cardType: CardType.Descriptor,
      tags: ['queue'],
    });
    expect(mapped.firstReview?.getTime()).toBe(createdAt);
  });

  it('preserves missing-source state in QueueBrowserCardMapper', () => {
    const mapped = mapQueueFsrsCardToBrowserCard(
      buildFsrsCard({ meta: { content: 'missing card' } }),
      { blockType: 'missing' },
    ) as BrowserCard & { blockType?: string };

    expect(mapped.blockType).toBe('missing');
    expect(mapped.meta).toMatchObject({ blockType: 'missing' });
  });

  it('keeps priority=0 in DeckDataSource mapper', () => {
    const ds = new DeckDataSource(
      {} as IUnifiedDataSourceManagerFacade,
      { preset: 'all' }
    );

    const mapped = convertDeckCard(ds, buildFsrsCard({ priority: 0 }));
    expect(mapped.priority).toBe(0);
  });

  it('falls back to 50 only when priority is nullish', () => {
    const ds = new DeckDataSource(
      {} as IUnifiedDataSourceManagerFacade,
      { preset: 'all' }
    );

    const mapped = convertDeckCard(
      ds,
      buildFsrsCard({ priority: undefined as unknown as number })
    );

    expect(mapped.priority).toBe(50);
  });
});
