import { describe, expect, it, vi } from 'vitest';
import { CardState } from '@/core/card/domain/services/CardScheduleService';
import type { FSRSCard } from '@/types/card';
import { BrowserDeckQueryKernel } from '../shared/BrowserDeckQueryKernel';
import { BrowserDeckBlockQuerySource } from '../shared/BrowserDeckBlockQuerySource';

function buildCard(
  id: string,
  blockId: string,
  rootId: string,
  due: number,
  content: string,
  overrides: Partial<FSRSCard> = {},
): FSRSCard {
  return {
    id,
    blockId,
    type: 'item',
    due,
    stability: 1,
    difficulty: 2,
    reps: 1,
    lapses: 0,
    state: CardState.Review,
    lastReview: due - 86_400_000,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    createdAt: due - 172_800_000,
    updatedAt: due - 43_200_000,
    ...overrides,
    meta: {
      rootId,
      content,
      ...(overrides.meta ?? {}),
    },
  } as FSRSCard;
}

describe('BrowserDeckQueryKernel scopeDocIds', () => {
  it('intersects scopeDocIds with docId, search text, and preset filters', async () => {
    const now = Date.now();
    const cards = [
      buildCard('card-1', 'block-1', 'doc-1', now - 1_000, 'alpha root'),
      buildCard('card-2', 'block-2', 'doc-1-child', now - 1_000, 'alpha child'),
      buildCard('card-3', 'block-3', 'doc-1-child', now + 86_400_000, 'alpha child future'),
      buildCard('card-4', 'block-4', 'doc-2', now - 1_000, 'alpha outside'),
    ];

    const storageManager = {
      queryCards: vi.fn((query?: { blockIds?: string[] }) => {
        if (!query?.blockIds?.length) {
          return cards;
        }
        const blockIdSet = new Set(query.blockIds);
        return cards.filter((card) => blockIdSet.has(card.blockId));
      }),
      getAllCards: vi.fn(() => cards),
    };

    const siyuanApi = {
      ATTR_CARD_TYPE: 'custom-card-type',
      sql: vi.fn(async (sql: string) => {
        if (sql.includes("WHERE root_id IN ('doc-1','doc-1-child')")) {
          return [{ id: 'block-1' }, { id: 'block-2' }, { id: 'block-3' }];
        }
        if (sql.includes("WHERE root_id = 'doc-1-child'")) {
          return [{ id: 'block-2' }, { id: 'block-3' }];
        }
        if (sql.includes("content LIKE '%alpha%'")) {
          return [{ id: 'block-1' }, { id: 'block-2' }, { id: 'block-3' }, { id: 'block-4' }];
        }
        return [];
      }),
    };

    const kernel = new BrowserDeckQueryKernel(
      storageManager as never,
      {} as never,
      {} as never,
      new BrowserDeckBlockQuerySource(siyuanApi as never),
    );

    const result = await kernel.buildSnapshot({
      scopeDocIds: ['doc-1', 'doc-1-child'],
      docId: 'doc-1-child',
      searchText: 'alpha',
      preset: 'due',
      cardTypes: ['item'],
    });

    expect(storageManager.queryCards).toHaveBeenCalledWith(expect.objectContaining({
      blockIds: ['block-2', 'block-3'],
    }));
    expect(result.rows.map((row) => row.blockId)).toEqual(['block-2']);
    expect(result.total).toBe(1);
  });

  it('excludes missing blocks from normal deck snapshots and exposes them via __lost__', async () => {
    const now = Date.now();
    const cards = [
      buildCard('card-existing', 'block-existing', 'doc-1', now - 1_000, 'existing'),
      buildCard('card-missing', 'block-missing', 'doc-1', now - 1_000, ''),
    ];
    const storageManager = {
      queryCards: vi.fn((query?: { blockIds?: string[] }) => {
        if (!query?.blockIds?.length) {
          return cards;
        }
        const blockIdSet = new Set(query.blockIds);
        return cards.filter((card) => blockIdSet.has(card.blockId));
      }),
      getAllCards: vi.fn(() => cards),
      getCard: vi.fn((id: string) => cards.find((card) => card.id === id)),
      getCardByBlockId: vi.fn((blockId: string) => cards.find((card) => card.blockId === blockId)),
    };
    const siyuanApi = {
      ATTR_CARD_TYPE: 'custom-card-type',
      sql: vi.fn(async (sql: string) => {
        if (sql.includes('FROM blocks') && sql.includes('WHERE id IN')) {
          return [{ id: 'block-existing' }];
        }
        return [];
      }),
    };
    const kernel = new BrowserDeckQueryKernel(
      storageManager as never,
      {} as never,
      {} as never,
      new BrowserDeckBlockQuerySource(siyuanApi as never),
    );

    const normal = await kernel.buildSnapshot({ preset: 'all' });
    expect(normal.rows.map((row) => row.blockId)).toEqual(['block-existing']);

    const lost = await kernel.buildSnapshot({ docId: '__lost__', preset: 'all' });
    expect(lost.rows.map((row) => row.blockId)).toEqual(['block-missing']);

    const hydrated = await kernel.getBrowserCardsByIds(['card-missing']);
    expect(hydrated[0]?.meta?.blockType).toBe('missing');
  });

  it('keeps live CDF relation cards visible in normal deck snapshots', async () => {
    const now = Date.now();
    const cards = [
      buildCard('card-active', 'block-active', 'doc-1', now - 1_000, 'active', {
        type: 'descriptor',
        meta: {
          relationAuthority: 'live-backlink',
          liveRelationKey: 'source:concept:descriptor-forward',
          liveRelationStatus: 'active-live',
          liveContentStatus: 'content-complete',
          liveRelationIssues: [],
        },
      }),
      buildCard('card-incomplete', 'block-incomplete', 'doc-1', now - 1_000, 'incomplete', {
        type: 'descriptor',
        meta: {
          relationAuthority: 'live-backlink',
          liveRelationKey: 'source:concept:descriptor-reverse',
          liveRelationStatus: 'active-live',
          liveContentStatus: 'content-incomplete',
          liveRelationIssues: [],
        },
      }),
      buildCard('card-orphaned', 'block-orphaned', 'doc-1', now - 1_000, 'orphaned', {
        type: 'descriptor',
        meta: {
          relationAuthority: 'live-backlink',
          liveRelationKey: 'source:concept:definition-forward',
          liveRelationStatus: 'orphaned-by-live-relation',
          liveContentStatus: 'content-complete',
          liveRelationIssues: [],
        },
      }),
      buildCard('card-duplicate', 'block-duplicate', 'doc-1', now - 1_000, 'duplicate', {
        type: 'descriptor',
        meta: {
          relationAuthority: 'live-backlink',
          liveRelationKey: 'source:concept:definition-forward',
          liveRelationStatus: 'duplicate-live-relation',
          liveContentStatus: 'content-complete',
          liveRelationIssues: [],
        },
      }),
      buildCard('card-legacy-unavailable', 'block-legacy-unavailable', 'doc-1', now - 1_000, 'legacy unavailable', {
        type: 'descriptor',
        meta: {
          relationAuthority: 'live-backlink',
          liveRelationStatus: 'legacy-relation-unavailable',
          liveContentStatus: 'content-complete',
          liveRelationIssues: [],
        },
      }),
      buildCard('card-blocking', 'block-blocking', 'doc-1', now - 1_000, 'blocking', {
        type: 'descriptor',
        meta: {
          relationAuthority: 'live-backlink',
          liveRelationKey: 'source:concept:descriptor-forward',
          liveRelationStatus: 'active-live',
          liveContentStatus: 'content-complete',
          liveRelationIssues: [{ code: 'invalid-source-grammar', severity: 'blocking' }],
        },
      }),
      buildCard('card-legacy', 'block-legacy', 'doc-1', now - 1_000, 'legacy', {
        type: 'descriptor',
        meta: {
          templateID: 'builtin-concept-descriptor',
          fieldMapping: { concept: 'concept', descriptor: 'source' },
        },
      }),
    ];
    const storageManager = {
      queryCards: vi.fn((query?: { blockIds?: string[] }) => {
        if (!query?.blockIds?.length) {
          return cards;
        }
        const blockIdSet = new Set(query.blockIds);
        return cards.filter((card) => blockIdSet.has(card.blockId));
      }),
      getAllCards: vi.fn(() => cards),
    };
    const siyuanApi = {
      ATTR_CARD_TYPE: 'custom-card-type',
      sql: vi.fn(async (sql: string) => {
        if (sql.includes('FROM blocks') && sql.includes('WHERE id IN')) {
          return cards.map((card) => ({ id: card.blockId }));
        }
        return [];
      }),
    };
    const kernel = new BrowserDeckQueryKernel(
      storageManager as never,
      {} as never,
      {} as never,
      new BrowserDeckBlockQuerySource(siyuanApi as never),
    );

    const normal = await kernel.buildSnapshot({ preset: 'all' });

    expect(normal.rows.map((row) => row.id)).toEqual([
      'card-active',
      'card-incomplete',
      'card-orphaned',
      'card-duplicate',
      'card-legacy-unavailable',
      'card-blocking',
      'card-legacy',
    ]);

    const unknownDiagnosticPreset = await kernel.buildSnapshot({ preset: 'cdf-content-incomplete' });
    expect(unknownDiagnosticPreset.rows.map((row) => row.id)).toEqual([
      'card-active',
      'card-incomplete',
      'card-orphaned',
      'card-duplicate',
      'card-legacy-unavailable',
      'card-blocking',
      'card-legacy',
    ]);
  });

  it('hydrates riff-managed cards from riffCardId content when the local block payload is blank', async () => {
    const card = {
      ...buildCard('card-riff', 'card-riff', '', Date.now(), ''),
      riffCardId: 'riff-source',
      meta: { rootId: '', deckId: 'deck-a', content: '' },
    } as FSRSCard;
    const storageManager = {
      queryCards: vi.fn(() => [card]),
      getAllCards: vi.fn(() => [card]),
      getCard: vi.fn(() => card),
      getCardByBlockId: vi.fn(() => card),
    };
    const siyuanApi = {
      ATTR_CARD_TYPE: 'custom-card-type',
      sql: vi.fn(async (sql: string) => {
        if (sql.includes("WHERE b.id IN ('card-riff','riff-source')")) {
          return [{ id: 'riff-source', root_id: 'doc-riff', content: 'riff source content', attrs: null }];
        }
        return [];
      }),
    };
    const kernel = new BrowserDeckQueryKernel(
      storageManager as never,
      {} as never,
      {} as never,
      new BrowserDeckBlockQuerySource(siyuanApi as never),
    );

    const rows = await kernel.getBrowserCardsFromCards([card], { markMissing: false });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.content).toBe('riff source content');
    expect(rows[0]?.fullContent).toBe('riff source content');
    expect(rows[0]?.rootId).toBe('doc-riff');
    expect(rows[0]?.meta?.content).toBe('riff source content');
  });
});
