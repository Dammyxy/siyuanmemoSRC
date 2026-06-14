import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectReviewSourceRefreshDependencyBlockIds,
  collectChangedBlockIdsFromReviewTransactions,
  createReviewSourceRefreshHostRuntime,
  createReviewSourceRefreshCoordinator,
  createReviewSourceRefreshRuntime,
} from '../reviewSourceRefreshRuntime';

describe('reviewSourceRefreshRuntime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('collects changed block ids from transaction operation links', () => {
    expect(collectChangedBlockIdsFromReviewTransactions([
      {
        doOperations: [
          { id: ' block-1 ', parentID: 'parent-1', previousID: '', nextID: 'next-1' },
          { id: 'block-1', parentID: 'parent-2' },
        ],
      },
      { doOperations: null },
    ])).toEqual(['block-1', 'parent-1', 'next-1', 'parent-2']);
  });

  it('debounces refresh and only refreshes matched dependency blocks', async () => {
    const refreshVisibleContent = vi.fn(async () => true);
    const runtime = createReviewSourceRefreshRuntime({
      debounceMs: 20,
      isEnabled: () => true,
      isAdvancePending: () => false,
      getCurrentReference: () => ({ cardId: 'card-1', blockId: 'block-1' }),
      getDependencyBlockIds: () => ['dep-1', 'dep-2'],
      isMainProtyleEditing: () => false,
      refreshVisibleContent,
    });

    runtime.transactionHandler.handle([{
      doOperations: [
        { id: 'unrelated' },
        { parentID: 'dep-1' },
      ],
    }]);

    await vi.advanceTimersByTimeAsync(19);
    expect(refreshVisibleContent).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(refreshVisibleContent).toHaveBeenCalledTimes(1);
    expect(refreshVisibleContent).toHaveBeenCalledWith('source-transaction');
  });

  it('drops pending refresh while advance is pending', async () => {
    const refreshVisibleContent = vi.fn(async () => true);
    let advancePending = true;
    const runtime = createReviewSourceRefreshRuntime({
      debounceMs: 20,
      isEnabled: () => true,
      isAdvancePending: () => advancePending,
      getCurrentReference: () => ({ cardId: 'card-1', blockId: 'block-1' }),
      getDependencyBlockIds: () => ['dep-1'],
      isMainProtyleEditing: () => false,
      refreshVisibleContent,
    });

    runtime.queue(['dep-1']);
    await vi.advanceTimersByTimeAsync(20);
    advancePending = false;
    await vi.advanceTimersByTimeAsync(40);

    expect(refreshVisibleContent).not.toHaveBeenCalled();
  });

  it('suppresses local edits and skips refresh while native Protyle editing is active', async () => {
    const refreshVisibleContent = vi.fn(async () => true);
    let editing = false;
    const runtime = createReviewSourceRefreshRuntime({
      debounceMs: 20,
      suppressionMs: 600,
      isEnabled: () => true,
      isAdvancePending: () => false,
      getCurrentReference: () => ({ cardId: 'card-1', blockId: 'block-1' }),
      getDependencyBlockIds: () => ['dep-1'],
      isMainProtyleEditing: () => editing,
      refreshVisibleContent,
    });

    runtime.suppressBlock('dep-1');
    runtime.queue(['dep-1']);
    await vi.advanceTimersByTimeAsync(20);
    expect(refreshVisibleContent).not.toHaveBeenCalled();

    runtime.clear();
    editing = true;
    runtime.queue(['dep-1']);
    await vi.advanceTimersByTimeAsync(20);
    expect(refreshVisibleContent).not.toHaveBeenCalled();
  });

  it('runs one dirty follow-up when matched changes arrive during an in-flight refresh', async () => {
    let resolveRefresh: (() => void) | null = null;
    const refreshVisibleContent = vi.fn(() => new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    }));
    const runtime = createReviewSourceRefreshRuntime({
      debounceMs: 20,
      maxWaitMs: 100,
      isEnabled: () => true,
      isAdvancePending: () => false,
      getCurrentReference: () => ({ cardId: 'card-1', blockId: 'block-1' }),
      getDependencyBlockIds: () => ['dep-1'],
      isMainProtyleEditing: () => false,
      refreshVisibleContent,
    });

    runtime.queue(['dep-1']);
    await vi.advanceTimersByTimeAsync(20);
    expect(refreshVisibleContent).toHaveBeenCalledTimes(1);

    runtime.queue(['dep-1']);
    await vi.advanceTimersByTimeAsync(20);
    expect(refreshVisibleContent).toHaveBeenCalledTimes(1);

    resolveRefresh?.();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(20);

    expect(refreshVisibleContent).toHaveBeenCalledTimes(2);
  });

  it('coordinator registers one shared handler and only queues matched surfaces', () => {
    const registerHandler = vi.fn();
    const unregisterHandler = vi.fn();
    const transactionService = { registerHandler, unregisterHandler };
    const coordinator = createReviewSourceRefreshCoordinator();
    const queueA = vi.fn();
    const queueB = vi.fn();

    coordinator.subscribe({
      surfaceId: 'surface-a',
      getDependencyBlockIds: () => ['dep-a'],
      queue: queueA,
    });
    coordinator.subscribe({
      surfaceId: 'surface-b',
      getDependencyBlockIds: () => ['dep-b'],
      queue: queueB,
    });
    coordinator.bindTransactionService(transactionService);
    coordinator.bindTransactionService(transactionService);

    expect(registerHandler).toHaveBeenCalledTimes(1);

    coordinator.handleClassification({
      changedBlockIds: ['dep-b'],
    });

    expect(queueA).not.toHaveBeenCalled();
    expect(queueB).toHaveBeenCalledWith(['dep-b']);

    coordinator.unsubscribe('surface-b');
    coordinator.handleClassification({
      changedBlockIds: ['dep-b'],
    });
    expect(queueB).toHaveBeenCalledTimes(1);

    coordinator.unsubscribe('surface-a');
    expect(unregisterHandler).toHaveBeenCalledTimes(1);
  });

  it('collects source refresh dependencies from rendered content and current card fallback ids', () => {
    expect(collectReviewSourceRefreshDependencyBlockIds({
      contentExpose: {
        getDependencyBlockIds: () => [' dep-1 ', '', 'dep-2', 'dep-1'],
      },
      content: {
        id: 'content-block',
        answerBlockID: 'answer-block',
        card: {
          id: 'card-1',
          blockId: 'dep-2',
        },
      },
    })).toEqual(['dep-1', 'dep-2', 'content-block', 'answer-block']);
  });

  it('host runtime owns source refresh subscription wiring and dependency refresh', () => {
    const runtime = {
      queue: vi.fn(),
      clearPending: vi.fn(),
      clear: vi.fn(),
    };
    const transactionService = {};
    const coordinator = {
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      refreshSubscription: vi.fn(),
      bindTransactionService: vi.fn(),
    };
    const onDependencyChanged = vi.fn();
    const hostRuntime = createReviewSourceRefreshHostRuntime({
      surfaceId: 'review-source:session-1',
      runtime,
      coordinator,
      isEnabled: () => true,
      getTransactionService: () => transactionService,
      getContentExpose: () => ({
        getDependencyBlockIds: () => ['dep-1'],
      }),
      getContentSnapshot: () => ({
        id: 'content-block',
        answerBlockID: 'answer-block',
        card: {
          id: 'card-1',
          blockId: 'card-block',
        },
      }),
      onDependencyChanged,
    });

    hostRuntime.bindTransactionService();

    expect(coordinator.subscribe).toHaveBeenCalledTimes(1);
    expect(coordinator.subscribe).toHaveBeenCalledWith({
      surfaceId: 'review-source:session-1',
      getDependencyBlockIds: expect.any(Function),
      queue: expect.any(Function),
    });
    const subscription = coordinator.subscribe.mock.calls[0][0];
    expect(subscription.getDependencyBlockIds()).toEqual(['dep-1', 'content-block', 'answer-block', 'card-block']);
    subscription.queue(['dep-1']);
    expect(runtime.queue).toHaveBeenCalledWith(['dep-1']);
    expect(coordinator.bindTransactionService).toHaveBeenCalledWith(transactionService);

    hostRuntime.handleDependencyChange();

    expect(runtime.clearPending).toHaveBeenCalledTimes(1);
    expect(coordinator.refreshSubscription).toHaveBeenCalledWith('review-source:session-1');
    expect(onDependencyChanged).toHaveBeenCalledTimes(1);

    hostRuntime.unbind();

    expect(runtime.clear).toHaveBeenCalledTimes(1);
    expect(coordinator.unsubscribe).toHaveBeenCalledWith('review-source:session-1');
  });
});
