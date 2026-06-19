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

function cdfCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return card({
    id: 'cdf-card-1',
    blockId: 'cdf-source-1',
    due: 100,
    type: CardType.Concept,
    meta: {
      relationAuthority: 'live-backlink',
      liveRelationKey: 'cdf-source-1:concept-1:definition-forward',
      sourceBlockId: 'cdf-source-1',
      conceptBlockId: 'concept-1',
      relationKind: 'definition-forward',
      liveRelationStatus: 'active-live',
      liveContentStatus: 'content-complete',
    },
    ...overrides,
  });
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
    const setFilterGroupFilter = vi.fn(async () => true);
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
      }),
      getFilterCommandClient: () => ({ setFilterGroupFilter }),
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
    expect(setFilterGroupFilter).toHaveBeenCalledWith({
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

  it('does not append created live CDF cards through the generic doc-scope created path', async () => {
    const createdCdf = cdfCard({
      id: 'created-cdf',
      blockId: 'created-cdf-source',
      meta: {
        rootId: 'doc-1',
        relationAuthority: 'live-backlink',
        liveRelationKey: 'created-cdf-source:concept-1:definition-forward',
        sourceBlockId: 'created-cdf-source',
        conceptBlockId: 'concept-1',
        relationKind: 'definition-forward',
        liveRelationStatus: 'active-live',
        liveContentStatus: 'content-complete',
      },
    });
    const appendCardsToTail = vi.fn(() => 1);
    const manager = {
      getCard: vi.fn(async () => createdCdf),
      registerObserver: vi.fn(),
      unregisterObserver: vi.fn(),
    };
    const runtime = createReviewDataObserverRuntime({
      logger: {},
      getManager: () => manager as never,
      getFilterGroupQueue: () => ({
        getFilter: () => ({ scopeDocIds: ['doc-1'], blockIds: [], cardType: CardType.Concept }),
      }),
      getFilterCommandClient: () => ({ setFilterGroupFilter: vi.fn(async () => true) }),
      getQueueStrategyWithTailAppend: () => ({ appendCardsToTail }),
      getActiveQueueStrategy: () => null,
      getCurrentReference: () => ({ cardId: 'current', blockId: 'current-block' }),
      getCurrentCard: () => null,
      getSession: () => ({ initialTotal: 2 }),
      setAppliedFilter: vi.fn(),
      setShowAnswer: vi.fn(),
      isAdvancePending: () => false,
      buildExpectedRefreshOptions: () => ({ expectedCurrentCardId: '', expectedCurrentBlockId: '' }),
      refreshCurrentItem: vi.fn(),
      refreshCurrentReviewCard: vi.fn(),
      advanceCurrentReviewCardByReference: vi.fn(),
      removeCardIdsFromActiveQueue: vi.fn(),
    });

    runtime.bind();
    await runtime.appendCreatedCardsToActiveScopeQueue(['created-cdf']);

    expect(appendCardsToTail).not.toHaveBeenCalled();
  });

  it('routes delete and pending update events through injected review actions', () => {
    const advance = vi.fn();
    const remove = vi.fn();
    const refresh = vi.fn();
    const runtime = createReviewDataObserverRuntime({
      logger: {},
      getManager: () => null,
      getFilterGroupQueue: () => null,
      getFilterCommandClient: () => null,
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

  it('uses blockIds for current-card matching without loading them as cards', async () => {
    const refresh = vi.fn();
    const appendCardsToTail = vi.fn(() => 0);
    const restored = cdfCard({ id: 'restored-due', blockId: 'restored-source' });
    const manager = {
      getCard: vi.fn(async (cardId: string) => {
        if (cardId === 'restored-due') {
          return restored;
        }
        throw new Error(`Card not found: ${cardId}`);
      }),
      registerObserver: vi.fn(),
      unregisterObserver: vi.fn(),
    };
    const runtime = createReviewDataObserverRuntime({
      logger: {},
      now: () => 100,
      getManager: () => manager as never,
      getFilterGroupQueue: () => null,
      getFilterCommandClient: () => null,
      getQueueStrategyWithTailAppend: () => ({ appendCardsToTail }),
      getActiveQueueStrategy: () => null,
      getCurrentReference: () => ({ cardId: 'current-card', blockId: '20260619151059-9gsaxr7' }),
      getCurrentCard: () => null,
      getSession: () => null,
      setAppliedFilter: vi.fn(),
      setShowAnswer: vi.fn(),
      isAdvancePending: () => false,
      buildExpectedRefreshOptions: () => ({ expectedCurrentCardId: '', expectedCurrentBlockId: '' }),
      refreshCurrentItem: vi.fn(),
      refreshCurrentReviewCard: refresh,
      advanceCurrentReviewCardByReference: vi.fn(),
      removeCardIdsFromActiveQueue: vi.fn(),
    });

    runtime.bind();
    runtime.observer.onDataChanged({
      type: 'card-updated',
      cardIds: ['restored-due'],
      blockIds: ['20260619151059-9gsaxr7'],
      timestamp: 1,
    });
    await Promise.resolve();

    expect(manager.getCard).toHaveBeenCalledTimes(1);
    expect(manager.getCard).toHaveBeenCalledWith('restored-due', { silent: true });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('appends externally restored due CDF cards once without interrupting the current card', async () => {
    const currentCard = card({ id: 'current', blockId: 'current-block' });
    const restored = cdfCard({
      id: 'restored-due',
      blockId: 'restored-source',
      meta: {
        relationAuthority: 'live-backlink',
        liveRelationKey: 'restored-source:concept-1:definition-forward',
        sourceBlockId: 'restored-source',
        conceptBlockId: 'concept-1',
        relationKind: 'definition-forward',
        liveRelationStatus: 'active-live',
        liveContentStatus: 'content-complete',
      },
    });
    const notDue = cdfCard({
      id: 'restored-not-due',
      due: 200,
      meta: {
        relationAuthority: 'live-backlink',
        liveRelationKey: 'not-due-source:concept-1:definition-forward',
        sourceBlockId: 'not-due-source',
        conceptBlockId: 'concept-1',
        relationKind: 'definition-forward',
        liveRelationStatus: 'active-live',
        liveContentStatus: 'content-complete',
      },
    });
    const incomplete = cdfCard({
      id: 'restored-incomplete',
      meta: {
        relationAuthority: 'live-backlink',
        liveRelationKey: 'incomplete-source:concept-1:definition-forward',
        sourceBlockId: 'incomplete-source',
        conceptBlockId: 'concept-1',
        relationKind: 'definition-forward',
        liveRelationStatus: 'active-live',
        liveContentStatus: 'content-incomplete',
      },
    });
    const appendCardsToTail = vi.fn(() => 1);
    const refreshCurrentItem = vi.fn();
    const notifyMidSessionInserted = vi.fn();
    const session = {
      initialTotal: 2,
      reviewHistory: [],
    };
    const manager = {
      getCard: vi.fn(async (cardId: string) => {
        if (cardId === 'restored-due') return restored;
        if (cardId === 'restored-not-due') return notDue;
        if (cardId === 'restored-incomplete') return incomplete;
        return null;
      }),
      registerObserver: vi.fn(),
      unregisterObserver: vi.fn(),
    };

    const runtime = createReviewDataObserverRuntime({
      logger: {},
      now: () => 100,
      notifyMidSessionInserted,
      getManager: () => manager as never,
      getFilterGroupQueue: () => null,
      getFilterCommandClient: () => null,
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
    await runtime.appendDueCdfCardsByIds([
      'restored-due',
      'restored-not-due',
      'restored-incomplete',
      'restored-due',
    ], 'external-cdf-repair');

    expect(appendCardsToTail).toHaveBeenCalledWith([restored]);
    expect(session.initialTotal).toBe(3);
    expect(session.midSessionInsertedCount).toBe(1);
    expect(session.midSessionInsertedCards).toEqual([
      expect.objectContaining({
        origin: 'external-cdf-repair',
        cardId: 'restored-due',
        blockId: 'restored-source',
        sourceBlockId: 'restored-source',
      }),
    ]);
    expect(session.reviewHistory).toEqual([]);
    expect(notifyMidSessionInserted).toHaveBeenCalledWith({
      count: 1,
      origin: 'external-cdf-repair',
      cards: [restored],
    });
    expect(refreshCurrentItem).toHaveBeenCalledWith(currentCard, {
      expectedCurrentCardId: 'current',
      expectedCurrentBlockId: 'current-block',
    });
  });
});
