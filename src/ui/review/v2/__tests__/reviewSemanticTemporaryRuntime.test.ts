import { describe, expect, it, vi } from 'vitest';
import type { FSRSCard } from '@/types/card';
import type { ReviewUIState } from '../types';
import {
  createReviewSemanticTemporaryRuntime,
  type ReviewSemanticTemporaryView,
} from '../reviewSemanticTemporaryRuntime';

const t = (_key: string, fallback: string) => fallback;

function card(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id: 'card-1',
    blockId: 'block-1',
    type: 'item',
    question: 'Question',
    answer: 'Answer',
    due: new Date(),
    reps: 0,
    lapses: 0,
    state: 0,
    difficulty: 0,
    stability: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    metadata: {},
    ...overrides,
  } as unknown as FSRSCard;
}

function uiState(inputCard: FSRSCard): ReviewUIState {
  return {
    content: {
      type: 'card',
      id: inputCard.id,
      card: inputCard,
    },
    header: {
      title: 'Temporary',
      queueType: 'retrieval-practice',
      stats: { current: 1, total: 1 },
      toolbar: [],
    },
    actions: {
      showAnswer: true,
      canReveal: true,
      canSkip: true,
      grades: [{ label: 'Good', rating: 3 }],
      menu: [],
    },
    meta: {
      emptyStateMode: null,
      canBack: false,
      hasHiddenContent: false,
      advancePending: null,
    },
  } as unknown as ReviewUIState;
}

function createHarness(options: {
  cardByBlockId?: FSRSCard | null;
  queue?: {
    onFeedback?: ReturnType<typeof vi.fn>;
    suppressReviewedCardForCurrentSession?: ReturnType<typeof vi.fn>;
    next?: ReturnType<typeof vi.fn>;
  };
} = {}) {
  let view: ReviewSemanticTemporaryView | null = null;
  const inputCard = options.cardByBlockId === undefined ? card() : options.cardByBlockId;
  const rendered = inputCard ? uiState(inputCard) : null;
  const queue = options.queue ?? {
    onFeedback: vi.fn(async () => undefined),
    suppressReviewedCardForCurrentSession: vi.fn(() => true),
    next: vi.fn(async () => null),
  };
  const showMessage = vi.fn();
  const renderItemPreview = vi.fn(async () => {
    if (!rendered) {
      throw new Error('no preview');
    }
    return rendered;
  });
  const runtime = createReviewSemanticTemporaryRuntime({
    t,
    getTemporaryView: () => view,
    setTemporaryView: (nextView) => {
      view = nextView;
    },
    getReviewQueue: () => queue,
    resolveCardByBlockId: () => inputCard,
    renderItemPreview,
    getSession: () => ({ id: 'session-1' }),
    showMessage,
  });

  return {
    queue,
    renderItemPreview,
    runtime,
    showMessage,
    view: () => view,
  };
}

describe('reviewSemanticTemporaryRuntime', () => {
  it('opens a temporary Semantic card view from source block and renders preview without advancing the original Review queue', async () => {
    const { queue, renderItemPreview, runtime, view } = createHarness();

    await runtime.viewNode('semantic-node-1', 'Semantic node', 'block-1');

    expect(renderItemPreview).toHaveBeenCalledWith(expect.objectContaining({ id: 'card-1' }), {
      showAnswer: false,
      session: { id: 'session-1' },
    });
    expect(queue.next).not.toHaveBeenCalled();
    expect(view()).toEqual(expect.objectContaining({
      nodeId: 'semantic-node-1',
      blockId: 'block-1',
      title: 'Semantic node',
      card: expect.objectContaining({ id: 'card-1' }),
      uiState: expect.objectContaining({ content: expect.objectContaining({ id: 'card-1' }) }),
      showAnswer: false,
      status: 'card',
    }));
  });

  it('grades only the temporary Semantic card and suppresses it for the current session', async () => {
    const { queue, runtime, view } = createHarness();
    await runtime.viewNode('semantic-node-1', 'Semantic node', 'block-1');

    await runtime.gradeTemporaryReview(9);

    expect(queue.onFeedback).toHaveBeenCalledWith(expect.objectContaining({ id: 'card-1' }), {
      action: 'rate',
      rating: 4,
    });
    expect(queue.suppressReviewedCardForCurrentSession).toHaveBeenCalledWith(expect.objectContaining({ id: 'card-1' }));
    expect(queue.next).not.toHaveBeenCalled();
    expect(view()).toBeNull();
  });

  it('keeps an explicit error state when temporary Semantic scoring is unavailable', async () => {
    const { runtime, showMessage, view } = createHarness({
      queue: {
        suppressReviewedCardForCurrentSession: vi.fn(),
        next: vi.fn(async () => null),
      },
    });
    await runtime.viewNode('semantic-node-1', 'Semantic node', 'block-1');

    await runtime.gradeTemporaryReview(3);

    expect(view()).toEqual(expect.objectContaining({
      status: 'error',
      error: 'SEMANTIC_TEMPORARY_REVIEW_UNAVAILABLE: review queue cannot score temporary card',
    }));
    expect(showMessage).toHaveBeenCalledWith(
      'Temporary Semantic review failed: SEMANTIC_TEMPORARY_REVIEW_UNAVAILABLE: review queue cannot score temporary card',
      5000,
      'error',
    );
  });
});
