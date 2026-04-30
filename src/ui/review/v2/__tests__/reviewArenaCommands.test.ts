import { describe, expect, it, vi } from 'vitest';
import {
  createReviewArenaRuntime,
  resolveArenaTargetKindFromCard,
  resolveReviewArenaScenario,
} from '../reviewArenaCommands';
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

describe('reviewArenaCommands', () => {
  it('resolves target kinds and review AI arena scenarios', () => {
    expect(resolveArenaTargetKindFromCard(card({ type: CardType.Topic }))).toBe('topic');
    expect(resolveArenaTargetKindFromCard(card({ type: CardType.Concept }))).toBe('concept');
    expect(resolveArenaTargetKindFromCard(null)).toBe('note');

    expect(resolveReviewArenaScenario('general-chat', card({ type: CardType.Topic }))).toBe('topic-auto-card');
    expect(resolveReviewArenaScenario('general-chat', card({ type: CardType.Descriptor }))).toBe('descriptor-augmentation');
    expect(resolveReviewArenaScenario('general-chat', null)).toBe('note-refinement');
    expect(resolveReviewArenaScenario('explain', null)).toBe('candidate-card-generation');
  });

  it('opens highlighted conflict dialog and adopts direct schedule', async () => {
    const reviewCard = card();
    const rescheduleCard = vi.fn(async () => undefined);
    const showMessage = vi.fn();
    const dialog = { destroy: vi.fn() };
    let adopt: ((payload?: unknown) => Promise<void> | void) | undefined;
    const runtime = createReviewArenaRuntime({
      t,
      showMessage,
      logger: {},
      createDialog: vi.fn((options) => {
        adopt = options.events.adopt;
        return dialog;
      }),
      getCurrentCard: () => reviewCard,
      getArenaKernelService: () => ({
        buildSrsRecommendation: vi.fn(async () => ({
          shouldHighlight: true,
          summary: 'Arena suggests shorter interval',
        }) as never),
      }),
      getReviewService: () => ({ rescheduleCard }),
      getSchedulerTypeForCard: () => 'fsrs-v6',
      resolveSchedulingContext: () => null,
      now: () => 123,
    });

    await runtime.handleFeedback({ cardId: 'card-1', rating: 3, item: reviewCard });
    await adopt?.({ dueTimestamp: 456, scheduledDays: 7 });

    expect(runtime.hint.value).toBe('Arena suggests shorter interval');
    expect(rescheduleCard).toHaveBeenCalledWith('card-1', {
      mode: 'direct',
      dueTimestamp: 456,
      scheduledDays: 7,
    });
    expect(showMessage).toHaveBeenCalledWith('已采用 Arena 排期', 2000, 'info');
    expect(dialog.destroy).toHaveBeenCalledTimes(1);
  });
});
