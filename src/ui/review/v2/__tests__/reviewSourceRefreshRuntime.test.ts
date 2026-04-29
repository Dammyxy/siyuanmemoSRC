import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectChangedBlockIdsFromReviewTransactions,
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
});
