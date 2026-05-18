import { describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';
import type { QueueFeedback } from '@/core/queue/abstraction/Strategy';
import type {
  BackendNeuralRoamAdvanceRequest,
  BackendNeuralRoamAdvanceResult,
  BackendNeuralRoamItem,
} from '../../../../../packages/contracts/src/backend-rpc';
import {
  NeuralRoamAdvanceCoordinator,
  NeuralRoamAdvanceOutcomePolicy,
  ReviewCurrentItemCommand,
  ReviewSessionCursor,
} from '..';

function card(id: string, overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = new Date('2026-05-18T08:00:00+08:00').getTime();
  return {
    id,
    xiuyuanID: id,
    blockId: overrides.blockId ?? id,
    due: now,
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    state: CardState.New,
    lastReview: now,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 50,
    type: CardType.Topic,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function advanceItem(item: FSRSCard): BackendNeuralRoamItem {
  return {
    id: item.id,
    cardId: item.id,
    blockId: item.blockId,
    deckId: null,
    due: item.due,
    type: item.type,
    meta: item.meta as Record<string, unknown> | undefined,
    sourceKind: 'virtual',
    payload: item as unknown as Record<string, unknown>,
  };
}

function advanceResult(nextItem: BackendNeuralRoamItem | null): BackendNeuralRoamAdvanceResult {
  return {
    queueType: 'neural-roam',
    sessionId: null,
    status: nextItem ? 'advanced' : 'exhausted',
    nextItem,
    counters: {
      remaining: nextItem ? 1 : 0,
      due: nextItem ? 1 : 0,
      total: nextItem ? 1 : 0,
      pendingAssociatedReview: 0,
      sourceNodes: nextItem ? 1 : 0,
    },
    sessionState: {
      sessionId: null,
      engineMode: 'hyperspace',
      currentNodeId: nextItem?.blockId ?? null,
      currentEventId: null,
      pathLength: nextItem ? 1 : 0,
      historyCount: nextItem ? 1 : 0,
      exhausted: !nextItem,
      projectionGeneration: null,
      policyHash: null,
    },
    queueState: { version: 8 },
    projectionImpact: null,
    unavailableReason: null,
    message: null,
  };
}

function createCoordinator() {
  const cursor = new ReviewSessionCursor(QueueType.NeuralRoam);
  const currentItem = new ReviewCurrentItemCommand();
  const submitAdvance = vi.fn<[(BackendNeuralRoamAdvanceRequest)], Promise<BackendNeuralRoamAdvanceResult>>(
    async () => advanceResult(null),
  );
  const syncFromBackendState = vi.fn(async () => {});
  const applyUnavailableItem = vi.fn();
  const pushHistory = vi.fn();
  const addNextDues = vi.fn(async (item: FSRSCard) => item);
  const coordinator = new NeuralRoamAdvanceCoordinator({
    cursor,
    currentItem,
    outcomePolicy: new NeuralRoamAdvanceOutcomePolicy(),
    submitAdvance,
    syncFromBackendState,
    applyUnavailableItem,
    pushHistory,
    addNextDues,
  });

  return {
    coordinator,
    cursor,
    currentItem,
    submitAdvance,
    syncFromBackendState,
    applyUnavailableItem,
    pushHistory,
    addNextDues,
  };
}

describe('NeuralRoamAdvanceCoordinator', () => {
  it('sends focus-start intent through backend advance and applies the returned current item', async () => {
    const next = card('focus-node');
    const { coordinator, currentItem, submitAdvance, syncFromBackendState } = createCoordinator();
    submitAdvance.mockResolvedValueOnce(advanceResult(advanceItem(next)));

    coordinator.startFromFocusOnNextAdvance({
      blockId: 'focus-node',
      includeFocusAsFirst: true,
      startNewSession: true,
    });

    const result = await coordinator.next();

    expect(result?.card.id).toBe('focus-node');
    expect(currentItem.current?.id).toBe('focus-node');
    expect(syncFromBackendState).toHaveBeenCalledOnce();
    expect(submitAdvance).toHaveBeenCalledWith(expect.objectContaining({
      queueType: 'neural-roam',
      currentItem: null,
      feedback: null,
      startFromFocus: {
        blockId: 'focus-node',
        includeFocusAsFirst: true,
        resetHistory: false,
        startNewSession: true,
      },
    }));
  });

  it('stores feedback advance result as pending next without locally selecting it', async () => {
    const active = card('active-node');
    const next = card('next-node');
    const { coordinator, currentItem, submitAdvance, pushHistory } = createCoordinator();
    currentItem.select(active);
    submitAdvance.mockResolvedValueOnce(advanceResult(advanceItem(next)));

    const outcome = await coordinator.handleFeedback(active, { action: 'rate', rating: 3 });

    expect(outcome.kind).toBe('advanced');
    expect(pushHistory).toHaveBeenCalledWith(active, null);
    expect(currentItem.current).toBeNull();
    expect(submitAdvance).toHaveBeenCalledWith(expect.objectContaining({
      currentItem: expect.objectContaining({ id: active.id, blockId: active.blockId }),
      feedback: { action: 'rate', rating: 3, customActionId: null },
    }));

    const pending = await coordinator.next();
    expect(pending?.card.id).toBe('next-node');
    expect(submitAdvance).toHaveBeenCalledTimes(1);
    expect(currentItem.current?.id).toBe('next-node');
  });

  it('handles custom feedback as session-only without backend advance', async () => {
    const active = card('active-node');
    const { coordinator, currentItem, submitAdvance, pushHistory } = createCoordinator();
    currentItem.select(active);

    const outcome = await coordinator.handleFeedback(active, { action: 'custom', customActionId: 'noop' } as QueueFeedback);

    expect(outcome.kind).toBe('session-only');
    expect(pushHistory).toHaveBeenCalledWith(active, null);
    expect(currentItem.current).toBeNull();
    expect(submitAdvance).not.toHaveBeenCalled();
  });
});
