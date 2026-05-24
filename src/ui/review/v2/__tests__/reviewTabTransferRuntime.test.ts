import { describe, expect, it, vi } from 'vitest';
import { QueueType, type InitialReviewSessionState } from '@/types/unified-data-source';
import {
  createReviewTabTransferRuntime,
  type ReviewTabTransferRuntimeDeps,
} from '../reviewTabTransferRuntime';

const t = (_key: string, fallback: string) => fallback;

function controllerLike() {
  return {
    attachSurface: vi.fn(),
    detachSurface: vi.fn(),
    reveal: vi.fn(),
    grade: vi.fn(),
    skip: vi.fn(),
    back: vi.fn(),
    executeCommand: vi.fn(),
    reload: vi.fn(),
    refreshCurrentItem: vi.fn(),
    getQueueStrategy: vi.fn(),
    loadCardByBlockId: vi.fn(),
    isDisposed: vi.fn(() => false),
  };
}

function createDeps(overrides: Partial<ReviewTabTransferRuntimeDeps> = {}) {
  const session: InitialReviewSessionState = {
    initialTotal: 8,
    answeredCount: 3,
    correctCount: 2,
  };
  const deps: ReviewTabTransferRuntimeDeps = {
    mode: 'tab',
    queue: { queue: true },
    adapter: { adapter: true },
    title: 'Review',
    headerVariant: 'retrieval-practice',
    transferState: undefined,
    getSharedReviewSessionId: vi.fn(() => ''),
    setSharedReviewSessionId: vi.fn(),
    createSharedReviewSessionId: vi.fn(() => 'shared-review-new'),
    getInitialSessionState: vi.fn(() => session),
    getQueueSessionSource: vi.fn(() => ({
      serializeSessionSnapshot: vi.fn(() => ({ version: 1, queueType: 'retrieval-practice' }) as never),
    })),
    getFilterSessionSource: vi.fn(() => ({
      serializeSessionSnapshot: vi.fn(() => ({
        filter: { blockIds: ['block-1'] },
        visibleCardIds: ['card-1'],
      }) as never),
    })),
    getCurrentReference: vi.fn(() => ({ cardId: 'card-1', blockId: 'block-1' })),
    isShowingAnswer: vi.fn(() => true),
    getReviewSessionController: vi.fn(() => controllerLike()),
    isReviewSessionControllerLike: vi.fn((value: unknown) => Boolean(value && typeof value === 'object' && 'grade' in value)),
    getSharedReviewSessionRegistry: vi.fn(() => ({
      getSession: vi.fn(() => null),
      registerSession: vi.fn((_sessionId: string, sessionValue: unknown) => sessionValue),
    })),
    getTabManager: vi.fn(() => ({
      openReviewTab: vi.fn(),
    })),
    t,
    showMessage: vi.fn(),
    logger: {
      warn: vi.fn(),
    },
    ...overrides,
  };
  return deps;
}

describe('reviewTabTransferRuntime', () => {
  it('prefers provided static subset transfer state and preserves current session counters', () => {
    const deps = createDeps({
      transferState: {
        kind: 'static-subset-session',
        queueType: QueueType.FilterGroup,
        blockIds: ['block-1'],
        cardIds: ['card-1'],
        preferredCardId: 'card-1',
      },
    });
    const runtime = createReviewTabTransferRuntime(deps);

    expect(runtime.buildTransferState()).toEqual({
      kind: 'static-subset-session',
      queueType: QueueType.FilterGroup,
      blockIds: ['block-1'],
      cardIds: ['card-1'],
      preferredCardId: 'card-1',
      session: {
        initialTotal: 8,
        answeredCount: 3,
        correctCount: 2,
      },
    });
    expect(deps.getFilterSessionSource).not.toHaveBeenCalled();
  });

  it('builds filter-group transfer state from a runtime-owned snapshot source', () => {
    const serializeSessionSnapshot = vi.fn(() => ({
      filter: { blockIds: ['block-1'] },
      visibleCardIds: ['card-1'],
    }) as never);
    const deps = createDeps({
      getFilterSessionSource: vi.fn(() => ({ serializeSessionSnapshot })),
    });
    const runtime = createReviewTabTransferRuntime(deps);

    expect(runtime.buildTransferState()).toEqual({
      kind: 'filter-group-session',
      filterSession: {
        filter: { blockIds: ['block-1'] },
        visibleCardIds: ['card-1'],
      },
      session: {
        initialTotal: 8,
        answeredCount: 3,
        correctCount: 2,
      },
    });
    expect(deps.getFilterSessionSource).toHaveBeenCalledTimes(1);
    expect(serializeSessionSnapshot).toHaveBeenCalledTimes(1);
  });

  it('builds tab runtime state only for tab surfaces', () => {
    const serializeSessionSnapshot = vi.fn(() => ({ version: 1, queueType: 'retrieval-practice' }) as never);
    const tabRuntime = createReviewTabTransferRuntime(createDeps({
      getSharedReviewSessionId: vi.fn(() => 'shared-review-1'),
      getQueueSessionSource: vi.fn(() => ({ serializeSessionSnapshot })),
    }));

    expect(tabRuntime.buildRuntimeState()).toEqual({
      version: 1,
      showAnswer: true,
      sharedReviewSessionId: 'shared-review-1',
      currentCardId: 'card-1',
      currentBlockId: 'block-1',
      session: {
        initialTotal: 8,
        answeredCount: 3,
        correctCount: 2,
      },
      queueSnapshot: {
        version: 1,
        queueType: 'retrieval-practice',
      },
    });
    expect(serializeSessionSnapshot).toHaveBeenCalledTimes(1);

    expect(createReviewTabTransferRuntime(createDeps({ mode: 'dialog' })).buildRuntimeState()).toBeNull();
  });

  it('opens managed split through a promoted shared review session', () => {
    const tabManager = {
      openReviewTab: vi.fn(),
    };
    const registeredSession = controllerLike();
    const registry = {
      getSession: vi.fn(() => null),
      registerSession: vi.fn(() => registeredSession),
    };
    const deps = createDeps({
      getSharedReviewSessionRegistry: vi.fn(() => registry),
      getTabManager: vi.fn(() => tabManager),
    });
    const runtime = createReviewTabTransferRuntime(deps);

    expect(runtime.openManagedSplit('right')).toBe(true);

    expect(registry.registerSession).toHaveBeenCalledWith('shared-review-new', expect.any(Object));
    expect(deps.setSharedReviewSessionId).toHaveBeenCalledWith('shared-review-new');
    expect(tabManager.openReviewTab).toHaveBeenCalledWith(expect.objectContaining({
      position: 'right',
      sharedReviewSessionId: 'shared-review-new',
      reviewState: expect.objectContaining({
        sharedReviewSessionId: 'shared-review-new',
        currentCardId: 'card-1',
        currentBlockId: 'block-1',
      }),
    }));
  });

  it('reports explicit unavailable when split dependencies are missing', () => {
    const deps = createDeps({
      getTabManager: vi.fn(() => null),
    });
    const runtime = createReviewTabTransferRuntime(deps);

    expect(runtime.openManagedSplit('bottom')).toBe(false);
    expect(deps.showMessage).toHaveBeenCalledWith('Plugin not ready', 3000, 'error');
  });
});
