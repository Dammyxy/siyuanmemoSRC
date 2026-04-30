import { describe, expect, it, vi } from 'vitest';
import { openReviewSrsEditorDialog } from '../reviewSrsEditorCommands';
import type { FSRSCard } from '@/types/card';

vi.mock('@/ui/srs/SrsEditorDialog.vue', () => ({
  default: {
    name: 'SrsEditorDialogStub',
  },
}));

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id: 'card-1',
    blockId: 'block-1',
    deckId: 'deck-1',
    due: Date.now(),
    stability: 1,
    difficulty: 1,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 0,
    type: 'item',
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    meta: {},
    ...overrides,
  } as FSRSCard;
}

function createInput(overrides: Partial<Parameters<typeof openReviewSrsEditorDialog>[0]> = {}) {
  const card = createCard();
  const reviewService = {
    getSiyuanApi: vi.fn(() => ({
      BUILTIN_DECK_ID: 'deck-main',
    })),
  };
  return {
    app: {} as never,
    blockId: card.blockId,
    cardId: card.id,
    context: {
      getReviewService: vi.fn(() => reviewService),
      getStorage: vi.fn(() => ({
        getCard: vi.fn(() => card),
        getCardByBlockId: vi.fn(() => card),
      })),
    },
    i18n: {
      editSrsData: '编辑 SRS 数据',
    },
    plugin: { id: 'plugin-1' },
    t: (_key: string, fallback: string) => fallback,
    logger: {
      debug: vi.fn(),
      error: vi.fn(),
    },
    createDialog: vi.fn(),
    resolveSchedulingContext: vi.fn(() => ({
      queueMode: 'filtered-preview',
      commitPolicy: 'preview-only',
      customStudy: true,
    })),
    advanceScheduledCard: vi.fn(async () => undefined),
    advanceDismissedCard: vi.fn(async () => undefined),
    ...overrides,
  } satisfies Parameters<typeof openReviewSrsEditorDialog>[0];
}

describe('reviewSrsEditorCommands', () => {
  it('opens SRS editor dialog with card, deck and scheduling context', () => {
    const input = createInput();

    openReviewSrsEditorDialog(input);

    expect(input.createDialog).toHaveBeenCalledTimes(1);
    const dialogOptions = vi.mocked(input.createDialog).mock.calls[0]?.[0];
    expect(dialogOptions).toEqual(expect.objectContaining({
      title: '编辑 SRS 数据',
      width: 'min(680px, 92vw)',
      height: 'min(640px, 66vh)',
      visualVariant: 'form',
      containerClass: 'siyuanmemo-srs-editor-dialog',
    }));
    expect(dialogOptions?.props).toEqual(expect.objectContaining({
      card: {
        id: 'card-1',
        blockId: 'block-1',
        deckId: 'deck-main',
      },
      deckId: 'deck-main',
      i18n: {
        editSrsData: '编辑 SRS 数据',
      },
      plugin: { id: 'plugin-1' },
      schedulingContext: {
        queueMode: 'filtered-preview',
        commitPolicy: 'preview-only',
        customStudy: true,
      },
    }));
    expect(input.resolveSchedulingContext).toHaveBeenCalledWith(expect.objectContaining({ id: 'card-1' }));
  });

  it('advances the current review card from scheduled and dismissed events', async () => {
    const input = createInput();
    openReviewSrsEditorDialog(input);

    const dialogOptions = vi.mocked(input.createDialog).mock.calls[0]?.[0];

    await dialogOptions?.events.scheduled?.({
      dueTimestamp: 1_777_777_777_000,
    });
    expect(input.advanceScheduledCard).toHaveBeenCalledWith({
      cardId: 'card-1',
      blockId: 'block-1',
      dueTimestamp: 1_777_777_777_000,
    });

    await dialogOptions?.events.dismissed?.({
      cardId: 'card-override',
      blockId: 'block-override',
      dismissed: true,
    });
    expect(input.advanceDismissedCard).toHaveBeenCalledWith({
      cardId: 'card-override',
      blockId: 'block-override',
      dismissed: true,
    });
  });

  it('skips dialog creation when required review dependencies are unavailable', () => {
    const noApp = createInput({ app: null });
    openReviewSrsEditorDialog(noApp);
    expect(noApp.createDialog).not.toHaveBeenCalled();
    expect(noApp.logger?.error).toHaveBeenCalledWith('[SiYuanMemo][ReviewView] ERROR: props.app is undefined!');

    const noApi = createInput({
      context: {
        getReviewService: () => ({
          getSiyuanApi: () => undefined,
        }),
        getStorage: () => ({
          getCard: () => createCard(),
          getCardByBlockId: () => createCard(),
        }),
      },
    });
    openReviewSrsEditorDialog(noApi);
    expect(noApi.createDialog).not.toHaveBeenCalled();
    expect(noApi.logger?.error).toHaveBeenCalledWith('[SiYuanMemo][ReviewView] ERROR: review siyuan api is unavailable');

    const noCard = createInput({
      context: {
        getReviewService: () => ({
          getSiyuanApi: () => ({
            BUILTIN_DECK_ID: 'deck-main',
          }),
        }),
        getStorage: () => ({
          getCard: () => undefined,
          getCardByBlockId: () => undefined,
        }),
      },
    });
    openReviewSrsEditorDialog(noCard);
    expect(noCard.createDialog).not.toHaveBeenCalled();
    expect(noCard.logger?.error).toHaveBeenCalledWith(
      '[SiYuanMemo][ReviewView] ERROR: Card not found for card reference:',
      {
        blockId: 'block-1',
        cardId: 'card-1',
      },
    );
  });
});
