import { ref } from 'vue';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { CardTypeMarkerStoragePort } from '@/core/storage/ports';
import { CardType, CardState, type FSRSCard } from '@/types/card';
import type { BrowserCard } from '../../types';
import { useCardActions } from '../useCardActions';
import { invalidateCardCache } from '../../browserService';

vi.mock('../../browserService', () => ({
  invalidateCardCache: vi.fn(),
}));

vi.mock('@/scripts/migrateToTopicItem', () => ({
  migrateExistingCards: vi.fn(),
}));

function cloneCard(card: FSRSCard): FSRSCard {
  return {
    ...card,
    tags: [...card.tags],
    meta: card.meta ? { ...card.meta } : undefined,
  };
}

function buildFsrsCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = 1_700_000_000_000;
  return {
    id: overrides.id || 'card-1',
    xiuyuanID: overrides.xiuyuanID || 'xiuyuan-1',
    blockId: overrides.blockId || 'block-1',
    due: overrides.due ?? now,
    stability: overrides.stability ?? 1,
    difficulty: overrides.difficulty ?? 5,
    reps: overrides.reps ?? 0,
    lapses: overrides.lapses ?? 0,
    state: overrides.state ?? CardState.New,
    lastReview: overrides.lastReview ?? 0,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 0,
    priority: overrides.priority ?? 50,
    type: overrides.type ?? CardType.Item,
    tags: overrides.tags ?? [],
    cardTypeMarker: overrides.cardTypeMarker,
    neuralRoamSeed: overrides.neuralRoamSeed ?? false,
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    meta: overrides.meta ? { ...overrides.meta } : undefined,
    aFactor: overrides.aFactor,
    schedulerType: overrides.schedulerType,
    syncToRiff: overrides.syncToRiff,
    riffCardId: overrides.riffCardId,
    schedulerMeta: overrides.schedulerMeta,
    postponeCount: overrides.postponeCount,
    lastPostponeDate: overrides.lastPostponeDate,
    rescheduleHistory: overrides.rescheduleHistory,
    learning_step: overrides.learning_step,
    skipNote: overrides.skipNote,
    skipUntil: overrides.skipUntil,
    sourceUrl: overrides.sourceUrl,
    extractedFrom: overrides.extractedFrom,
  };
}

function buildBrowserCard(overrides: Partial<BrowserCard> = {}): BrowserCard {
  return {
    id: overrides.id || 'riff-card-1',
    fsrsCardId: overrides.fsrsCardId || 'card-1',
    blockId: overrides.blockId || 'block-1',
    deckId: overrides.deckId || 'deck-1',
    content: overrides.content || 'content',
    fullContent: overrides.fullContent || 'content',
    rootId: overrides.rootId || 'root-1',
    state: overrides.state ?? 0,
    stateLabel: overrides.stateLabel || 'New',
    due: overrides.due || new Date(),
    dueFormatted: overrides.dueFormatted || '',
    stability: overrides.stability ?? 1,
    difficulty: overrides.difficulty ?? 1,
    retrievability: overrides.retrievability ?? 0.9,
    reps: overrides.reps ?? 0,
    lapses: overrides.lapses ?? 0,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 0,
    lastReview: overrides.lastReview ?? null,
    lastReviewFormatted: overrides.lastReviewFormatted || '',
    interval: overrides.interval ?? 0,
    firstReview: overrides.firstReview ?? null,
    firstReviewFormatted: overrides.firstReviewFormatted || '',
    priority: overrides.priority ?? 50,
    suspended: overrides.suspended ?? false,
    tags: overrides.tags ?? [],
    note: overrides.note || '',
    queueIndex: overrides.queueIndex,
    cardType: overrides.cardType,
    aFactor: overrides.aFactor,
    meta: overrides.meta,
  };
}

function createStorage(initialCards: FSRSCard[]) {
  const cards = new Map(initialCards.map((card) => [card.id, cloneCard(card)]));
  const getCardMock = vi.fn((cardId: string) => {
    const card = cards.get(cardId);
    return card ? cloneCard(card) : undefined;
  });
  const getAllCardsMock = vi.fn(() => Array.from(cards.values()).map(cloneCard));
  const setCardMock = vi.fn((card: FSRSCard) => {
    cards.set(card.id, cloneCard(card));
  });
  const saveCardsMock = vi.fn(async () => {});

  const storage: CardTypeMarkerStoragePort = {
    getCard: getCardMock,
    getAllCards: getAllCardsMock,
    setCard: setCardMock,
    saveCards: saveCardsMock,
  };

  return {
    cards,
    storage,
    getCard: (cardId: string) => cards.get(cardId),
    setCardMock,
    saveCardsMock,
  };
}

describe('useCardActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('markCardsAsTopic updates only the selected local card and refreshes browser state', async () => {
    const targetCard = buildFsrsCard({
      id: 'card-target',
      blockId: 'block-shared',
      type: CardType.Item,
      meta: { forceQuickRender: true, existing: 'keep' },
    });
    const siblingCard = buildFsrsCard({
      id: 'card-sibling',
      blockId: 'block-shared',
      type: CardType.Item,
      meta: { existing: 'sibling' },
    });
    const { storage, getCard, setCardMock, saveCardsMock } = createStorage([targetCard, siblingCard]);
    const loadData = vi.fn(async () => {});
    const pushMsg = vi.fn(async () => {});
    const pushErrMsg = vi.fn(async () => {});

    const actions = useCardActions({
      loading: ref(false),
      loadData,
      refreshData: vi.fn(async () => {}),
      t: (_key, fallback) => fallback,
      pushMsg,
      pushErrMsg,
      storage,
    });

    await actions.markCardsAsTopic([
      buildBrowserCard({
        id: 'riff-target',
        fsrsCardId: 'card-target',
        blockId: 'block-shared',
      }),
    ]);

    expect(setCardMock).toHaveBeenCalledTimes(1);
    expect(saveCardsMock).toHaveBeenCalledTimes(1);
    expect(loadData).toHaveBeenCalledTimes(1);
    expect(pushErrMsg).not.toHaveBeenCalled();
    expect(pushMsg.mock.calls[0]?.[0]).toContain('Topic');
    expect(vi.mocked(invalidateCardCache)).toHaveBeenCalledTimes(1);

    const updatedCard = getCard('card-target');
    const untouchedSibling = getCard('card-sibling');

    expect(updatedCard?.type).toBe(CardType.Topic);
    expect(updatedCard?.meta).toMatchObject({
      forceProtyleRender: true,
      existing: 'keep',
    });
    expect(updatedCard?.meta).not.toHaveProperty('forceQuickRender');
    expect(untouchedSibling?.type).toBe(CardType.Item);
    expect(untouchedSibling?.meta).toMatchObject({ existing: 'sibling' });
  });

  it('markCardsAsItem clears concept markers and render metadata in local storage only', async () => {
    const conceptCard = buildFsrsCard({
      id: 'card-concept',
      blockId: 'block-concept',
      type: CardType.Concept,
      cardTypeMarker: 'concept',
      meta: {
        renderProfile: 'concept',
        typeMarker: 'C',
        cardTypeMarker: 'concept',
        forceQuickRender: true,
        existing: 'keep',
      },
    });
    const { storage, getCard, setCardMock, saveCardsMock } = createStorage([conceptCard]);
    const loadData = vi.fn(async () => {});
    const pushMsg = vi.fn(async () => {});
    const pushErrMsg = vi.fn(async () => {});

    const actions = useCardActions({
      loading: ref(false),
      loadData,
      refreshData: vi.fn(async () => {}),
      t: (_key, fallback) => fallback,
      pushMsg,
      pushErrMsg,
      storage,
    });

    await actions.markCardsAsItem([
      buildBrowserCard({
        id: 'riff-concept',
        fsrsCardId: 'card-concept',
        blockId: 'block-concept',
      }),
    ]);

    expect(setCardMock).toHaveBeenCalledTimes(1);
    expect(saveCardsMock).toHaveBeenCalledTimes(1);
    expect(loadData).toHaveBeenCalledTimes(1);
    expect(pushErrMsg).not.toHaveBeenCalled();
    expect(pushMsg.mock.calls[0]?.[0]).toContain('Item');
    expect(vi.mocked(invalidateCardCache)).toHaveBeenCalledTimes(1);

    const updatedCard = getCard('card-concept');
    expect(updatedCard?.type).toBe(CardType.Item);
    expect(updatedCard?.cardTypeMarker).toBeUndefined();
    expect(updatedCard?.meta).toMatchObject({
      existing: 'keep',
    });
    expect(updatedCard?.meta).not.toHaveProperty('renderProfile');
    expect(updatedCard?.meta).not.toHaveProperty('typeMarker');
    expect(updatedCard?.meta).not.toHaveProperty('cardTypeMarker');
    expect(updatedCard?.meta).not.toHaveProperty('forceQuickRender');
    expect(updatedCard?.meta).not.toHaveProperty('forceProtyleRender');
  });
});
