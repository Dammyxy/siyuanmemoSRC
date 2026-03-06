import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { QuerySiyuanPort } from '@/application/ports/QuerySiyuanPort';
import type { CardApplicationService } from '@/application/services/CardApplicationService';
import type { StorageManager } from '@/core/storage/manager';
import { DataAccessFacade } from '../DataAccessFacade';

function createCard(index: number): FSRSCard {
  const now = Date.now();
  return {
    id: `card-${index}`,
    xiuyuanID: `xiuyuan-${index}`,
    blockId: `block-${index}`,
    due: now,
    stability: 1,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    state: CardState.New,
    lastReview: now,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    meta: {
      rootId: `doc-${index}`,
      content: `content-${index}`,
    },
  };
}

type CardServiceLike = {
  getCards: ReturnType<typeof vi.fn>;
  getCard: ReturnType<typeof vi.fn>;
  updateFSRSCard: ReturnType<typeof vi.fn>;
  deleteFSRSCard: ReturnType<typeof vi.fn>;
};

describe('DataAccessFacade SQL 64-cap regression', () => {
  let cardService: CardServiceLike;
  let siyuanApi: {
    sql: ReturnType<typeof vi.fn>;
    batchSetRiffCardsDueTime: ReturnType<typeof vi.fn>;
  };
  let facade: DataAccessFacade;

  beforeEach(() => {
    cardService = {
      getCards: vi.fn().mockResolvedValue({ cards: [], total: 0 }),
      getCard: vi.fn().mockResolvedValue({ card: null }),
      updateFSRSCard: vi.fn(),
      deleteFSRSCard: vi.fn(),
    };
    siyuanApi = {
      sql: vi.fn().mockResolvedValue([]),
      batchSetRiffCardsDueTime: vi.fn(),
    };

    facade = new DataAccessFacade(
      cardService as unknown as CardApplicationService,
      { getSettings: () => ({}) } as unknown as StorageManager,
      undefined,
      undefined,
      siyuanApi as unknown as QuerySiyuanPort,
    );
  });

  it('keeps all cards when block existence SQL includes explicit LIMIT', async () => {
    const cards = Array.from({ length: 200 }, (_, index) => createCard(index + 1));
    cardService.getCards.mockResolvedValue({
      cards,
      total: cards.length,
    });

    const allRows = cards.map((card) => ({ id: card.blockId }));
    siyuanApi.sql.mockImplementation(async (stmt: string) => {
      const isBlockExistenceQuery =
        /SELECT\s+id/i.test(stmt)
        && /FROM\s+blocks/i.test(stmt)
        && /WHERE\s+id\s+IN/i.test(stmt);

      if (!isBlockExistenceQuery) {
        return [];
      }

      // Simulate Siyuan behavior: queries without LIMIT are truncated to 64.
      if (!/\bLIMIT\b/i.test(stmt)) {
        return allRows.slice(0, 64);
      }

      return allRows;
    });

    const result = await facade.getCards();

    expect(result).toHaveLength(200);

    const existenceQueries = siyuanApi.sql.mock.calls
      .map(([stmt]) => String(stmt))
      .filter((stmt) => /SELECT\s+id[\s\S]*FROM\s+blocks[\s\S]*WHERE\s+id\s+IN/i.test(stmt));

    expect(existenceQueries.length).toBeGreaterThan(0);
    expect(existenceQueries.every((stmt) => /\bLIMIT\s+\d+/i.test(stmt))).toBe(true);
  });
});

