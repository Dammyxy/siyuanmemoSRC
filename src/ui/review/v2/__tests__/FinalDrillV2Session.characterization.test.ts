import { describe, expect, it, vi } from 'vitest';
import { FinalDrillV2Session } from '../sessions/FinalDrillV2Session';

function createQueue(items: any[]) {
  const remove = vi.fn(async (removedItems: any[]) => {
    for (const removed of removedItems) {
      const index = items.findIndex((item) => item.id === removed.id);
      if (index >= 0) {
        items.splice(index, 1);
      }
    }
    return removedItems.length;
  });
  const insertAt = vi.fn(async (insertedItems: any[], index: number) => {
    items.splice(index, 0, ...insertedItems);
  });
  return {
    queue: {
      getAllCards: vi.fn(async () => items.slice()),
      getRemovableTrait: () => ({ remove }),
      getMutableTrait: () => ({ insertAt }),
    },
    remove,
    insertAt,
    items,
  };
}

function createSiyuanApi(overrides: Record<string, unknown> = {}) {
  return {
    pushErrMsg: vi.fn(async () => undefined),
    ...overrides,
  };
}

function createReviewService(overrides: Record<string, unknown> = {}) {
  const siyuanApi = createSiyuanApi();
  return {
    executeFinalDrillRiffFeedback: vi.fn(async () => ({
      status: 'completed',
      commandId: 'command-1',
      idempotencyKey: 'key-1',
      action: 'rate',
      updated: 1,
      skipped: 0,
      queueImpact: {
        refreshRequired: true,
        projectionChanged: true,
        removedFromQueue: true,
      },
      diagnostics: {
        diagnosticEventId: 'diag-1',
        family: 'review.riff-feedback',
        commandId: 'command-1',
      },
    })),
    getSiyuanApi: () => siyuanApi,
    siyuanApi,
    ...overrides,
  };
}

function createItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'card-1',
    cardID: 'card-1',
    deckID: 'deck-1',
    ...overrides,
  };
}

describe('FinalDrillV2Session backend Riff feedback path', () => {
  it('rates native Riff cards through the ReviewApplicationService backend command path', async () => {
    const item = createItem();
    const queue = createQueue([item]);
    const reviewService = createReviewService();
    const session = new FinalDrillV2Session({
      queue: queue.queue,
      reviewService: reviewService as any,
    });

    await session.init();
    await session.onFeedback(item as any, { action: 'rate', rating: 4 } as any);

    expect(reviewService.executeFinalDrillRiffFeedback).toHaveBeenCalledWith(expect.objectContaining({
      action: 'rate',
      deckId: 'deck-1',
      riffCardId: 'card-1',
      rating: 4,
    }));
    expect(queue.remove).toHaveBeenCalledWith([item]);
    expect(reviewService.siyuanApi.pushErrMsg).not.toHaveBeenCalled();
    expect(session.getProgress()).toMatchObject({
      answered: 1,
      correct: 1,
    });
  });

  it('pushes explicit error and does not advance when backend Riff rating fails', async () => {
    const item = createItem();
    const queue = createQueue([item]);
    const siyuanApi = createSiyuanApi({
      pushErrMsg: vi.fn(async () => undefined),
    });
    const reviewService = createReviewService({
      executeFinalDrillRiffFeedback: vi.fn(async () => ({
        status: 'unavailable',
        commandId: 'command-1',
        idempotencyKey: 'key-1',
        action: 'rate',
        updated: 0,
        skipped: 0,
        unavailableClass: 'BACKEND_UNAVAILABLE',
        reason: 'backend unavailable',
        queueImpact: {
          refreshRequired: false,
          projectionChanged: false,
          removedFromQueue: false,
        },
        diagnostics: {
          diagnosticEventId: 'diag-1',
          family: 'review.riff-feedback',
          commandId: 'command-1',
        },
      })),
      getSiyuanApi: () => siyuanApi,
      siyuanApi,
    });
    const session = new FinalDrillV2Session({
      queue: queue.queue,
      reviewService: reviewService as any,
      i18n: {
        drillFailed: 'Final drill operation failed',
      },
    });

    await session.init();
    await session.onFeedback(item as any, { action: 'rate', rating: 4 } as any);

    expect(reviewService.executeFinalDrillRiffFeedback).toHaveBeenCalled();
    expect(siyuanApi.pushErrMsg).toHaveBeenCalledWith('Final drill operation failed');
    expect(queue.remove).not.toHaveBeenCalled();
  });

  it('skips native Riff cards through the backend command path', async () => {
    const item = createItem();
    const queue = createQueue([item]);
    const reviewService = createReviewService({
      executeFinalDrillRiffFeedback: vi.fn(async () => ({
        status: 'completed',
        commandId: 'command-1',
        idempotencyKey: 'key-1',
        action: 'skip',
        updated: 0,
        skipped: 1,
        queueImpact: {
          refreshRequired: true,
          projectionChanged: true,
          removedFromQueue: false,
        },
        diagnostics: {
          diagnosticEventId: 'diag-1',
          family: 'review.riff-feedback',
          commandId: 'command-1',
        },
      })),
    });
    const session = new FinalDrillV2Session({
      queue: queue.queue,
      reviewService: reviewService as any,
    });

    await session.init();
    await session.onFeedback(item as any, { action: 'skip' } as any);

    expect(reviewService.executeFinalDrillRiffFeedback).toHaveBeenCalledWith(expect.objectContaining({
      action: 'skip',
      deckId: 'deck-1',
      riffCardId: 'card-1',
    }));
    expect(queue.remove).toHaveBeenCalledWith([item]);
    expect(queue.insertAt).toHaveBeenCalledWith([item], 0);
  });
});
