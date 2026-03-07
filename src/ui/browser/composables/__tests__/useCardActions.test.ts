import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CardTypeMarkerStoragePort } from '@/core/storage/ports';
import { CardState, CardType, type FSRSCard } from '@/types/card';
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
  const setCardMock = vi.fn((card: FSRSCard) => {
    cards.set(card.id, cloneCard(card));
  });
  const saveCardsMock = vi.fn(async () => {});

  const storage: CardTypeMarkerStoragePort = {
    getCard: (cardId: string) => {
      const card = cards.get(cardId);
      return card ? cloneCard(card) : undefined;
    },
    getAllCards: () => Array.from(cards.values()).map(cloneCard),
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

  it('markCardsAsTopic updates only the selected card and syncs default render', async () => {
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

    const actions = useCardActions({
      loading: ref(false),
      loadData,
      refreshData: vi.fn(async () => {}),
      t: (_key, fallback) => fallback,
      pushMsg,
      pushErrMsg: vi.fn(async () => {}),
      storage,
    });

    await actions.markCardsAsTopic([buildBrowserCard({ fsrsCardId: 'card-target', blockId: 'block-shared' })]);

    expect(setCardMock).toHaveBeenCalledTimes(1);
    expect(saveCardsMock).toHaveBeenCalledTimes(1);
    expect(loadData).toHaveBeenCalledTimes(1);
    expect(pushMsg.mock.calls[0]?.[0]).toContain('Topic');
    expect(vi.mocked(invalidateCardCache)).toHaveBeenCalledTimes(1);
    expect(getCard('card-target')?.type).toBe(CardType.Topic);
    expect(getCard('card-target')?.meta).toMatchObject({ forceProtyleRender: true, existing: 'keep' });
    expect(getCard('card-target')?.meta).not.toHaveProperty('forceQuickRender');
    expect(getCard('card-sibling')?.type).toBe(CardType.Item);
  });

  it('markCardsAsItem keeps the current render metadata while removing semantic markers', async () => {
    const conceptCard = buildFsrsCard({
      id: 'card-concept',
      type: CardType.Concept,
      cardTypeMarker: 'concept',
      meta: {
        renderProfile: 'concept',
        typeMarker: 'C',
        templateID: 'builtin-concept-simple',
        cardTypeMarker: 'concept',
      },
    });
    const { storage, getCard } = createStorage([conceptCard]);

    const actions = useCardActions({
      loading: ref(false),
      loadData: vi.fn(async () => {}),
      refreshData: vi.fn(async () => {}),
      t: (_key, fallback) => fallback,
      pushMsg: vi.fn(async () => {}),
      pushErrMsg: vi.fn(async () => {}),
      storage,
    });

    await actions.markCardsAsItem([buildBrowserCard({ fsrsCardId: 'card-concept', blockId: 'block-concept' })]);

    expect(getCard('card-concept')?.type).toBe(CardType.Item);
    expect(getCard('card-concept')?.cardTypeMarker).toBeUndefined();
    expect(getCard('card-concept')?.meta).toMatchObject({
      renderProfile: 'concept',
      typeMarker: 'C',
      templateID: 'builtin-concept-simple',
    });
    expect(getCard('card-concept')?.meta).not.toHaveProperty('cardTypeMarker');
  });

  it('markCardsAsConcept applies concept render metadata via shared transition helper', async () => {
    const itemCard = buildFsrsCard({
      id: 'card-concept-target',
      type: CardType.Item,
      meta: { existing: 'keep', forceQuickRender: true },
    });
    const { storage, getCard } = createStorage([itemCard]);

    const actions = useCardActions({
      loading: ref(false),
      loadData: vi.fn(async () => {}),
      refreshData: vi.fn(async () => {}),
      t: (_key, fallback) => fallback,
      pushMsg: vi.fn(async () => {}),
      pushErrMsg: vi.fn(async () => {}),
      storage,
    });

    await actions.markCardsAsConcept([buildBrowserCard({ fsrsCardId: 'card-concept-target', blockId: 'block-concept-target' })]);

    expect(getCard('card-concept-target')?.type).toBe(CardType.Concept);
    expect(getCard('card-concept-target')?.meta).toMatchObject({
      existing: 'keep',
      renderProfile: 'concept',
      typeMarker: 'C',
      templateID: 'builtin-concept-simple',
      cardTypeMarker: 'concept',
    });
  });

  it('convertCardsRender updates render metadata without changing card type', async () => {
    const itemCard = buildFsrsCard({
      id: 'card-render-target',
      type: CardType.Item,
    });
    const { storage, getCard } = createStorage([itemCard]);
    const pushMsg = vi.fn(async () => {});

    const actions = useCardActions({
      loading: ref(false),
      loadData: vi.fn(async () => {}),
      refreshData: vi.fn(async () => {}),
      t: (_key, fallback) => fallback,
      pushMsg,
      pushErrMsg: vi.fn(async () => {}),
      storage,
    });

    await actions.convertCardsRender([buildBrowserCard({ fsrsCardId: 'card-render-target', blockId: 'block-render-target' })], 'descriptor-reverse');

    expect(getCard('card-render-target')?.type).toBe(CardType.Item);
    expect(getCard('card-render-target')?.meta).toMatchObject({
      renderProfile: 'descriptor',
      typeMarker: 'concept-descriptor-reverse',
      templateID: 'builtin-concept-descriptor-reverse',
    });
    expect(pushMsg.mock.calls[0]?.[0]).toContain('仅更新渲染元数据');
  });
});
