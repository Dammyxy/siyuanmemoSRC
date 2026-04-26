import { describe, expect, it, vi } from 'vitest';
import { BrowserApplicationService } from '../BrowserApplicationService';
import { CardFilterService } from '@/core/card/domain/services/CardFilterService';
import { CardScheduleService } from '@/core/card/domain/services/CardScheduleService';
import { CardSortService } from '@/core/card/domain/services/CardSortService';
import { CardState, CardType, type FSRSCard } from '@/types/card';

function buildCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = 1_700_000_000_000;
  return {
    id: overrides.id ?? 'card-1',
    xiuyuanID: overrides.xiuyuanID ?? 'xiuyuan-1',
    blockId: overrides.blockId ?? 'block-1',
    due: overrides.due ?? now + 86_400_000,
    stability: overrides.stability ?? 4,
    difficulty: overrides.difficulty ?? 5,
    reps: overrides.reps ?? 3,
    lapses: overrides.lapses ?? 1,
    state: overrides.state ?? CardState.Review,
    lastReview: overrides.lastReview ?? now,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 7,
    priority: overrides.priority ?? 19,
    type: overrides.type ?? CardType.Item,
    tags: overrides.tags ?? [],
    neuralRoamSeed: overrides.neuralRoamSeed ?? false,
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    meta: overrides.meta ?? {},
  };
}

function createQueryCardsMock(cards: FSRSCard[]) {
  return vi.fn((query?: {
    blockIds?: string[];
    states?: number[];
    cardTypes?: string[];
    dueDate?: { lte?: number };
  }) => {
    let result = cards;

    if (query?.blockIds) {
      const blockIds = new Set(query.blockIds);
      result = result.filter((card) => blockIds.has(card.blockId));
    }

    if (query?.states) {
      const states = new Set(query.states);
      result = result.filter((card) => states.has(card.state));
    }

    if (query?.cardTypes) {
      const cardTypes = new Set(query.cardTypes);
      result = result.filter((card) => cardTypes.has(card.type));
    }

    if (query?.dueDate?.lte !== undefined) {
      result = result.filter((card) => card.due <= query.dueDate!.lte!);
    }

    return result;
  });
}

describe('BrowserApplicationService deck query kernel', () => {
  it('builds sorted lite rows and hydrates requested ids in order', async () => {
    const now = Date.now();
    const cards = [
      buildCard({
        id: 'card-1',
        blockId: 'block-1',
        due: now - 1_000,
        priority: 10,
        meta: {},
      }),
      buildCard({
        id: 'card-2',
        blockId: 'block-2',
        due: now - 500,
        priority: 80,
        meta: {},
      }),
      buildCard({
        id: 'card-3',
        blockId: 'block-3',
        due: now + 50_000,
        priority: 40,
        meta: {},
      }),
    ];
    const queryCards = createQueryCardsMock(cards);
    const getCard = vi.fn((id: string) => cards.find((card) => card.id === id));
    const siyuanApi = {
      ATTR_CARD_ID: 'custom-fsrs-card-id',
      ATTR_PRIORITY: 'custom-fsrs-priority',
      ATTR_SUSPENDED: 'custom-fsrs-suspended',
      ATTR_CARD_TYPE: 'custom-fsrs-card-type',
      ATTR_A_FACTOR: 'custom-fsrs-a-factor',
      sql: vi.fn(async (stmt: string) => {
        if (stmt.includes('SELECT id') && stmt.includes('WHERE id IN') && !stmt.includes('GROUP_CONCAT')) {
          return [
            { id: 'block-1' },
            { id: 'block-2' },
            { id: 'block-3' },
          ];
        }
        if (stmt.includes('GROUP_CONCAT')) {
          return [
            { id: 'block-1', root_id: 'doc-a', content: 'Alpha card', attrs: '' },
            { id: 'block-2', root_id: 'doc-a', content: 'Beta card', attrs: '' },
          ];
        }
        if (stmt.includes('FROM attributes')) {
          return [];
        }
        return [];
      }),
      setBlockAttrs: vi.fn(),
      pushMsg: vi.fn(),
      pushErrMsg: vi.fn(),
    };

    const service = new BrowserApplicationService(
      {
        getCard,
        queryCards,
        getAllCards: () => cards,
      } as never,
      new CardScheduleService(),
      new CardFilterService(),
      new CardSortService(),
      null,
      siyuanApi as never,
    );

    const snapshot = await service.getDeckQuerySnapshot({
      preset: 'due',
      sortModel: [{ colId: 'priority', sort: 'desc' }],
    });
    expect(snapshot.total).toBe(2);
    expect(snapshot.rows.map((row) => row.id)).toEqual(['card-2', 'card-1']);

    const rows = await service.getDeckRowsByIds(['card-1', 'card-2']);
    expect(rows.map((row) => row.fsrsCardId)).toEqual(['card-1', 'card-2']);
    expect(rows.map((row) => row.content)).toEqual(['Alpha card', 'Beta card']);
    expect(rows.map((row) => row.rootId)).toEqual(['doc-a', 'doc-a']);

    const stats = await service.getStats();
    expect(stats.totalCards).toBe(3);
    expect(stats.dueCards).toBe(2);
    expect(queryCards).toHaveBeenCalled();
  });
});
