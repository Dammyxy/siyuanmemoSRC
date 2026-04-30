import { describe, expect, it, vi } from 'vitest';
import {
  createReviewDataObserverRuntime,
  matchesFilterCardType,
  normalizeCardFilterIds,
  readCardRootId,
} from '../reviewDataObserverRuntime';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { IDataSourceObserver } from '@/types/unified-data-source';

function card(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id: 'card-1',
    xiuyuanID: 'xiuyuan-1',
    blockId: 'block-1',
    due: 0,
    stability: 1,
    difficulty: 1,
    reps: 0,
    lapses: 0,
    state: CardState.New,
    lastReview: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 0,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: 0,
    updatedAt: 0,
    meta: { rootId: 'doc-1' },
    ...overrides,
  };
}

describe('reviewDataObserverRuntime', () => {
  it('normalizes filter ids and matches scoped card type', () => {
    const current = card({ type: CardType.Concept, meta: { rootID: ' doc-1 ' } });

    expect(normalizeCardFilterIds([' doc-1 ', '', 'doc-2'])).toEqual(['doc-1', 'doc-2']);
    expect(readCardRootId(current)).toBe('doc-1');
    expect(matchesFilterCardType(current, { cardType: [CardType.Concept] })).toBe(true);
    expect(matchesFilterCardType(current, { cardType: [CardType.Item] })).toBe(false);
  });

  it('appends created doc-scope cards and keeps current review card fresh', async () => {
    const observerBox: { value?: IDataSourceObserver } = {};
    const currentCard = card({ id: 'current', blockId: 'current-block' });
    const created = card({ id: 'created', blockId: 'created-block', meta: { rootId: 'doc-1' } });
    const outOfScope = card({ id: 'outside', blockId: 'outside-block', meta: { rootId: 'doc-2' } });
    const setFilter = vi.fn();
    const appendCardsToTail = vi.fn(() => 1);
    const refreshCurrentItem = vi.fn();
    const session = { initialTotal: 2 };
    const manager = {
      getCard: vi.fn(async (cardId: string) => (cardId === 'created' ? created : outOfScope)),
      registerObserver: vi.fn((observer: IDataSourceObserver) => {
        observerBox.value = observer;
      }),
      unregisterObserver: vi.fn(),
    };

    const runtime = createReviewDataObserverRuntime({
      logger: {},
      getManager: () => manager as never,
      getFilterGroupQueue: () => ({
        getFilter: () => ({ scopeDocIds: ['doc-1'], blockIds: ['existing-block'], cardType: CardType.Item }),
        setFilter,
        rebuild: vi.fn(),
      }),
      getQueueStrategyWithTailAppend: () => ({ appendCardsToTail }),
      getActiveQueueStrategy: () => null,
      getCurrentReference: () => ({ cardId: 'current', blockId: 'current-block' }),
      getCurrentCard: () => currentCard,
      getSession: () => session,
      setAppliedFilter: vi.fn(),
      setShowAnswer: vi.fn(),
      isAdvancePending: () => false,
      buildExpectedRefreshOptions: (reference) => ({
        expectedCurrentCardId: String(reference?.cardId || ''),
        expectedCurrentBlockId: String(reference?.blockId || ''),
      }),
      refreshCurrentItem,
      refreshCurrentReviewCard: vi.fn(),
      advanceCurrentReviewCardByReference: vi.fn(),
      removeCardIdsFromActiveQueue: vi.fn(),
    });

    runtime.bind();
    await runtime.appendCreatedCardsToActiveScopeQueue(['created', 'outside', '']);

    expect(manager.registerObserver).toHaveBeenCalledTimes(1);
    expect(observerBox.value).toBe(runtime.observer);
    expect(setFilter).toHaveBeenCalledWith({
      scopeDocIds: ['doc-1'],
      blockIds: ['existing-block', 'created-block'],
      cardType: CardType.Item,
    });
    expect(appendCardsToTail).toHaveBeenCalledWith([created]);
    expect(session.initialTotal).toBe(3);
    expect(refreshCurrentItem).toHaveBeenCalledWith(currentCard, {
      expectedCurrentCardId: 'current',
      expectedCurrentBlockId: 'current-block',
    });
  });

  it('routes delete and pending update events through injected review actions', () => {
    const advance = vi.fn();
    const remove = vi.fn();
    const refresh = vi.fn();
    const runtime = createReviewDataObserverRuntime({
      logger: {},
      getManager: () => null,
      getFilterGroupQueue: () => null,
      getQueueStrategyWithTailAppend: () => null,
      getActiveQueueStrategy: () => null,
      getCurrentReference: () => ({ cardId: 'current', blockId: 'block-current' }),
      getCurrentCard: () => null,
      getSession: () => null,
      setAppliedFilter: vi.fn(),
      setShowAnswer: vi.fn(),
      isAdvancePending: () => true,
      buildExpectedRefreshOptions: () => ({ expectedCurrentCardId: '', expectedCurrentBlockId: '' }),
      refreshCurrentItem: vi.fn(),
      refreshCurrentReviewCard: refresh,
      advanceCurrentReviewCardByReference: advance,
      removeCardIdsFromActiveQueue: remove,
    });

    runtime.observer.onDataChanged({ type: 'card-deleted', cardIds: ['current'] } as never);
    runtime.observer.onDataChanged({ type: 'card-deleted', cardIds: ['other'] } as never);
    runtime.observer.onDataChanged({ type: 'card-updated', cardIds: ['current'] } as never);

    expect(advance).toHaveBeenCalledWith({ cardId: 'current', blockId: 'block-current' });
    expect(remove).toHaveBeenCalledWith(['other']);
    expect(refresh).not.toHaveBeenCalled();
  });
});
