import { describe, expect, it, vi } from 'vitest';
import type { FSRSCard } from '@/types/card';
import type { IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import type { BrowserCard } from '../../types';
import {
  reconcileBrowserCardTypes,
  type CardTypeConsistencyDependencies,
} from '../cardTypeConsistency';

function buildBrowserCard(overrides: Partial<BrowserCard>): BrowserCard {
  return {
    id: overrides.id ?? 'row-1',
    fsrsCardId: overrides.fsrsCardId ?? overrides.id ?? 'row-1',
    blockId: overrides.blockId ?? 'block-1',
    deckId: overrides.deckId ?? 'deck-1',
    content: overrides.content ?? 'content',
    fullContent: overrides.fullContent ?? 'content',
    rootId: overrides.rootId ?? 'doc-1',
    state: overrides.state ?? 0,
    stateLabel: overrides.stateLabel ?? 'New',
    due: overrides.due ?? new Date(),
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
  };
}

function buildFsrsCard(overrides: Partial<FSRSCard>): FSRSCard {
  return {
    id: overrides.id ?? 'card-1',
    xiuyuanID: overrides.xiuyuanID ?? overrides.id ?? 'card-1',
    blockId: overrides.blockId ?? 'block-1',
    due: overrides.due ?? Date.now(),
    stability: overrides.stability ?? 1,
    difficulty: overrides.difficulty ?? 1,
    reps: overrides.reps ?? 0,
    lapses: overrides.lapses ?? 0,
    state: overrides.state ?? 0,
    lastReview: overrides.lastReview ?? Date.now(),
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 0,
    priority: overrides.priority ?? 50,
    type: overrides.type ?? 'item',
    tags: overrides.tags ?? [],
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
    meta: overrides.meta ?? {},
  };
}

function createManagerMock(cards: FSRSCard[]) {
  const getCards = vi.fn(async () => cards);
  const updateCard = vi.fn(async () => undefined);
  const manager = {
    getCards,
    updateCard,
  } as unknown as IUnifiedDataSourceManagerFacade;
  return { manager, getCards, updateCard };
}

describe('cardTypeConsistency', () => {
  it('uses block attribute card type as source of truth and fixes local mismatch', async () => {
    const rows = [buildBrowserCard({ blockId: 'block-1', cardType: 'concept' })];
    const deps: CardTypeConsistencyDependencies = {
      runSql: vi.fn(async () => [{ block_id: 'block-1', value: 'item' }]),
      setBlockType: vi.fn(async () => undefined),
      detectTypes: vi.fn(async () => new Map()),
    };
    const { manager, updateCard } = createManagerMock([
      buildFsrsCard({ id: 'card-1', blockId: 'block-1', type: 'concept' }),
    ]);

    const result = await reconcileBrowserCardTypes(rows, {
      repair: true,
      manager,
      deps,
    });

    expect(result.rows[0]?.cardType).toBe('item');
    expect(result.conflictBlockIds).toEqual(['block-1']);
    expect(result.attributeBackfillBlockIds).toEqual([]);
    expect(deps.setBlockType).not.toHaveBeenCalled();
    expect(updateCard).toHaveBeenCalledTimes(1);
    expect(updateCard.mock.calls[0][0].type).toBe('item');
  });

  it('backfills block attribute from local card type when attribute is missing', async () => {
    const rows = [buildBrowserCard({ blockId: 'block-2', cardType: 'concept' })];
    const deps: CardTypeConsistencyDependencies = {
      runSql: vi.fn(async () => []),
      setBlockType: vi.fn(async () => undefined),
      detectTypes: vi.fn(async () => new Map()),
    };
    const { manager, updateCard } = createManagerMock([
      buildFsrsCard({ id: 'card-2', blockId: 'block-2', type: 'concept' }),
    ]);

    const result = await reconcileBrowserCardTypes(rows, {
      repair: true,
      manager,
      deps,
    });

    expect(result.rows[0]?.cardType).toBe('concept');
    expect(result.attributeBackfillBlockIds).toEqual(['block-2']);
    expect(result.detectedBlockIds).toEqual([]);
    expect(deps.setBlockType).toHaveBeenCalledWith('block-2', 'concept');
    expect(updateCard).not.toHaveBeenCalled();
  });

  it('detects missing card type and repairs both block attribute and local card type', async () => {
    const rows = [buildBrowserCard({ blockId: 'block-3', cardType: undefined })];
    const deps: CardTypeConsistencyDependencies = {
      runSql: vi.fn(async () => []),
      setBlockType: vi.fn(async () => undefined),
      detectTypes: vi.fn(async () => new Map<string, 'topic' | 'item'>([['block-3', 'topic']])),
    };
    const { manager, updateCard } = createManagerMock([
      buildFsrsCard({ id: 'card-3', blockId: 'block-3', type: 'item' }),
    ]);

    const result = await reconcileBrowserCardTypes(rows, {
      repair: true,
      manager,
      deps,
    });

    expect(result.rows[0]?.cardType).toBe('topic');
    expect(result.attributeBackfillBlockIds).toEqual(['block-3']);
    expect(result.detectedBlockIds).toEqual(['block-3']);
    expect(deps.setBlockType).toHaveBeenCalledWith('block-3', 'topic');
    expect(updateCard).toHaveBeenCalledTimes(1);
    expect(updateCard.mock.calls[0][0].type).toBe('topic');
  });

  it('does not write any repair changes when repair=false', async () => {
    const rows = [buildBrowserCard({ blockId: 'block-4', cardType: 'concept' })];
    const deps: CardTypeConsistencyDependencies = {
      runSql: vi.fn(async () => []),
      setBlockType: vi.fn(async () => undefined),
      detectTypes: vi.fn(async () => new Map<string, 'topic' | 'item'>([['block-4', 'item']])),
    };
    const { manager, updateCard, getCards } = createManagerMock([
      buildFsrsCard({ id: 'card-4', blockId: 'block-4', type: 'concept' }),
    ]);

    const result = await reconcileBrowserCardTypes(rows, {
      repair: false,
      manager,
      deps,
    });

    expect(result.rows[0]?.cardType).toBe('concept');
    expect(result.attributeBackfillBlockIds).toEqual(['block-4']);
    expect(deps.setBlockType).not.toHaveBeenCalled();
    expect(getCards).not.toHaveBeenCalled();
    expect(updateCard).not.toHaveBeenCalled();
  });
});
