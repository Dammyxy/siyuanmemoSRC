import { describe, expect, it, vi } from 'vitest';
import {
  createReviewCardActionRuntime,
  filterOutCurrentCardId,
  resolveCurrentAndPeerCardIds,
} from '../reviewCardActionCommands';
import { CardState, CardType, type FSRSCard } from '@/types/card';

const t = (_key: string, fallback: string) => fallback;

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
    meta: {},
    ...overrides,
  };
}

function createRuntime(overrides: Partial<Parameters<typeof createReviewCardActionRuntime>[0]> = {}) {
  const currentCard = card({ id: 'current', blockId: 'block-current', priority: 12 });
  return createReviewCardActionRuntime({
    t,
    showMessage: vi.fn(),
    logger: {},
    createDialog: vi.fn(() => ({ destroy: vi.fn() })),
    confirmDialog: vi.fn(async () => true),
    getCurrentCard: () => currentCard,
    getCurrentCardMeta: () => ({ cardID: 'current', blockID: 'block-current' }),
    getCurrentReviewCardId: () => 'current',
    getCurrentReviewBlockId: () => 'block-current',
    getCardEditorService: () => null,
    getCardService: () => null,
    buildExpectedRefreshOptions: (reference) => ({
      expectedCurrentCardId: String(reference?.cardId || ''),
      expectedCurrentBlockId: String(reference?.blockId || ''),
    }),
    refreshCurrentItem: vi.fn(),
    advanceDismissedCurrentCard: vi.fn(),
    advanceCurrentReviewCardByReference: vi.fn(),
    removeCardIdsFromActiveQueue: vi.fn(),
    ...overrides,
  });
}

describe('reviewCardActionCommands', () => {
  it('resolves peer ids without duplicating the current card', () => {
    expect(filterOutCurrentCardId(['current', 'peer-1'], 'current')).toEqual(['peer-1']);
    expect(resolveCurrentAndPeerCardIds({
      currentCardId: 'current',
      currentBlockId: 'block-current',
      peerCards: [
        card({ id: 'peer-1' }),
        card({ id: 'current' }),
        card({ id: '' }),
      ],
    })).toEqual(['current', 'peer-1']);
  });

  it('edits current priority through dialog result and refreshes current card', async () => {
    const destroy = vi.fn();
    let confirm: ((payload?: unknown) => void) | undefined;
    const updatedCard = card({ id: 'current', blockId: 'block-current', priority: 42 });
    const updatePriority = vi.fn(async () => ({ card: updatedCard }));
    const refreshCurrentItem = vi.fn();
    const showMessage = vi.fn();
    const runtime = createRuntime({
      showMessage,
      createDialog: vi.fn((options) => {
        confirm = options.events.confirm;
        return { destroy };
      }),
      getCardEditorService: () => ({ updatePriority } as never),
      refreshCurrentItem,
    });

    const pending = runtime.handleEditCurrentCardPriority();
    await Promise.resolve();
    confirm?.(42);
    await pending;

    expect(updatePriority).toHaveBeenCalledWith('current', 42);
    expect(refreshCurrentItem).toHaveBeenCalledWith(updatedCard, {
      expectedCurrentCardId: 'current',
      expectedCurrentBlockId: 'block-current',
    });
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(showMessage).toHaveBeenLastCalledWith('优先级已更新', 3000, 'info');
  });

  it('deletes current card only after confirmation and advances review', async () => {
    const deleteCard = vi.fn(async () => ({ ok: true }));
    const advance = vi.fn();
    const runtime = createRuntime({
      getCardService: () => ({ deleteCard } as never),
      advanceCurrentReviewCardByReference: advance,
    });

    await runtime.handleDeleteCurrentCard();

    expect(deleteCard).toHaveBeenCalledWith({ cardId: 'current' });
    expect(advance).toHaveBeenCalledWith({ cardId: 'current', blockId: 'block-current' });
  });
});
