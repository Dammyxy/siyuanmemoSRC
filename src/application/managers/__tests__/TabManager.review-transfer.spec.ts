import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TabManager } from '../TabManager';
import type { FSRSCard } from '@/types/card';

const mocks = vi.hoisted(() => ({
  createApp: vi.fn(() => ({
    mount: vi.fn(),
    unmount: vi.fn(),
  })),
}));

vi.mock('siyuan', () => ({
  openTab: vi.fn(),
  Constants: {
    SIYUAN_OPEN_WINDOW: 'siyuan-open-window',
    SIYUAN_VERSION: '3.1.0',
  },
}));

vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>();
  return {
    ...actual,
    createApp: mocks.createApp,
  };
});

vi.mock('@/ui/browser/SRSBrowser.vue', () => ({
  default: {},
}));

vi.mock('@/ui/review/v2', () => ({
  ReviewView: {},
}));

vi.mock('@/ui/ai/AiWorkbenchPane.vue', () => ({
  default: {},
}));

describe('TabManager filter-group review transfer restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createApp.mockImplementation(() => ({
      mount: vi.fn(),
      unmount: vi.fn(),
    }));
  });

  it('restores a detached filter-group session queue from transfer state instead of the shared queue', () => {
    const sharedFilterQueue = {
      getType: () => 'filter-group',
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
    const manager = {
      getQueue: vi.fn(() => sharedFilterQueue),
      notifyObservers: vi.fn(),
    };
    const context = {
      getI18n: vi.fn(() => ({})),
      getUnifiedDataSourceManager: vi.fn(() => manager),
      getEventBus: vi.fn(() => ({ subscribe: vi.fn(), unsubscribe: vi.fn() })),
      getSchedulerRouter: vi.fn(() => ({})),
      getSettingsService: vi.fn(() => ({
        getSettings: () => ({
          progressiveReading: {},
        }),
      })),
    } as any;
    const plugin = {
      name: 'test-plugin',
      app: {},
      addTab: vi.fn(),
    } as any;

    const tabManager = new TabManager(context, plugin);
    tabManager.registerAll();

    const reviewRegistration = plugin.addTab.mock.calls[1][0];
    reviewRegistration.init.call({
      element: document.createElement('div'),
      data: {
        providerId: 'filter-group',
        title: '提取练习',
        queueType: 'filter-group',
        headerVariant: 'retrieval-practice',
        transferState: {
          kind: 'filter-group-session',
          filterSession: {
            filter: {
              blockIds: ['block-1'],
              scopeDocIds: ['doc-1'],
              cardType: 'item',
              dueDate: {
                lte: '2026-04-06T00:00:00.000Z',
              },
            },
            rollbackSnapshot: {
              temporaryBlacklist: ['card-hidden'],
              customOrder: ['card-2', 'card-1'],
              manualCards: ['manual-1'],
            },
            visibleCardIds: ['card-2', 'card-1'],
          },
          session: {
            initialTotal: 5,
            answeredCount: 2,
            correctCount: 1,
          },
        },
      },
    });

    const [, props] = mocks.createApp.mock.calls[0];
    const queueStrategy = props.queue;
    const underlyingQueue = queueStrategy.getUnderlyingQueue();

    expect(props.initialSessionState).toEqual({
      initialTotal: 5,
      answeredCount: 2,
      correctCount: 1,
    });
    expect(underlyingQueue.getType()).toBe('filter-group');
    expect(underlyingQueue.getFilter()).toEqual(expect.objectContaining({
      blockIds: ['block-1'],
      scopeDocIds: ['doc-1'],
      cardType: 'item',
      dueDate: expect.objectContaining({
        lte: expect.any(Date),
      }),
    }));
    expect(underlyingQueue.serializeSessionSnapshot()).toEqual(expect.objectContaining({
      rollbackSnapshot: expect.objectContaining({
        temporaryBlacklist: ['card-hidden'],
        customOrder: ['card-2', 'card-1'],
        manualCards: ['manual-1'],
      }),
    }));
    expect(manager.getQueue).not.toHaveBeenCalledWith('filter-group');
  });

  it('restores review-tab runtime state for retrieval-practice tabs and keeps it writable on the runtime data', () => {
    const now = Date.now();
    const currentCard = {
      id: 'card-special',
      blockId: 'block-special',
      due: now,
      stability: 1,
      difficulty: 5,
      reps: 0,
      lapses: 0,
      state: 0,
      lastReview: now,
      elapsedDays: 0,
      scheduledDays: 0,
      priority: 50,
      type: 'item',
      tags: [],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: now,
      updatedAt: now,
      meta: {
        forceQuickRender: true,
      },
    } as FSRSCard;

    const sharedQueue = {
      getType: () => 'retrieval-practice',
      getCards: vi.fn(async () => [currentCard]),
      getCounterSnapshot: vi.fn(async () => ({
        version: 1,
        remaining: 1,
        due: 1,
        total: 1,
        buckets: {
          all: 1,
          item: 1,
          descriptor: 0,
          topic: 0,
          concept: 0,
        },
        source: 'hot' as const,
      })),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
    const manager = {
      getQueue: vi.fn(() => sharedQueue),
      notifyObservers: vi.fn(),
    };
    const context = {
      getI18n: vi.fn(() => ({})),
      getUnifiedDataSourceManager: vi.fn(() => manager),
      getEventBus: vi.fn(() => ({ subscribe: vi.fn(), unsubscribe: vi.fn() })),
      getSchedulerRouter: vi.fn(() => ({})),
      getSettingsService: vi.fn(() => ({
        getSettings: () => ({
          progressiveReading: {},
        }),
      })),
    } as any;
    const plugin = {
      name: 'test-plugin',
      app: {},
      addTab: vi.fn(),
    } as any;

    const tabManager = new TabManager(context, plugin);
    tabManager.registerAll();

    const runtime = {
      id: 'review-runtime-1',
      element: document.createElement('div'),
      data: {
        providerId: 'retrieval',
        title: '提取练习',
        queueType: 'retrieval-practice',
        headerVariant: 'retrieval-practice',
        reviewState: {
          version: 1,
          showAnswer: true,
          session: {
            initialTotal: 4,
            answeredCount: 1,
            correctCount: 1,
          },
          queueSnapshot: {
            version: 1,
            queueType: 'retrieval-practice',
            cacheValid: true,
            currentIndex: 1,
            cachedCards: [currentCard],
            currentItem: currentCard,
            forwardBuffer: [],
            pendingRotateCardId: null,
            lastCounterSnapshot: {
              version: 1,
              remaining: 1,
              due: 1,
              total: 1,
              buckets: {
                all: 1,
                item: 1,
                descriptor: 0,
                topic: 0,
                concept: 0,
              },
              source: 'hot' as const,
            },
          },
        },
      },
      tab: {
        id: 'review-runtime-1',
        headElement: document.createElement('button'),
        model: {
          data: null,
        },
        parent: {
          switchTab: vi.fn(),
        },
      },
    };

    const reviewRegistration = plugin.addTab.mock.calls[1][0];
    reviewRegistration.init.call(runtime);

    const [, props] = mocks.createApp.mock.calls[0];
    expect(props.initialCurrentItem).toMatchObject({
      id: 'card-special',
      meta: {
        forceQuickRender: true,
      },
    });
    expect(props.initialCurrentCardId).toBe('card-special');
    expect(props.initialShowAnswer).toBe(true);
    expect(props.initialSessionState).toEqual({
      initialTotal: 4,
      answeredCount: 1,
      correctCount: 1,
    });
    expect(props.queue.serializeSessionSnapshot()).toMatchObject({
      currentItem: {
        id: 'card-special',
      },
      currentIndex: 1,
    });

    props.onTabRuntimeStateChange({
      version: 1,
      showAnswer: false,
      currentCardId: 'card-special',
      currentBlockId: 'block-special',
      session: {
        initialTotal: 4,
        answeredCount: 2,
        correctCount: 1,
      },
      queueSnapshot: {
        version: 1,
        queueType: 'retrieval-practice',
        cacheValid: true,
        currentIndex: 1,
        cachedCards: [currentCard],
        currentItem: currentCard,
        forwardBuffer: [],
        pendingRotateCardId: null,
        lastCounterSnapshot: null,
      },
    });

    expect(runtime.data.reviewState).toMatchObject({
      showAnswer: false,
      currentCardId: 'card-special',
      currentBlockId: 'block-special',
      session: {
        answeredCount: 2,
      },
      queueSnapshot: {
        currentItem: {
          id: 'card-special',
        },
      },
    });
    expect(runtime.tab.model.data.reviewState).toMatchObject({
      currentCardId: 'card-special',
      currentBlockId: 'block-special',
    });
  });

  it('refreshes the active review tab surface on custom tab resize and update using the persisted current card id', async () => {
    vi.useFakeTimers();
    const refreshTabSurface = vi.fn(async () => true);
    const syncToNeuralQueueCurrentNode = vi.fn(async () => true);
    mocks.createApp.mockImplementation(() => ({
      mount: vi.fn(() => ({
        syncToNeuralQueueCurrentNode,
        refreshTabSurface,
      })),
      unmount: vi.fn(),
    }));

    const sharedQueue = {
      getType: () => 'retrieval-practice',
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
    const manager = {
      getQueue: vi.fn(() => sharedQueue),
      notifyObservers: vi.fn(),
    };
    const context = {
      getI18n: vi.fn(() => ({})),
      getUnifiedDataSourceManager: vi.fn(() => manager),
      getEventBus: vi.fn(() => ({ subscribe: vi.fn(), unsubscribe: vi.fn() })),
      getSchedulerRouter: vi.fn(() => ({})),
      getSettingsService: vi.fn(() => ({
        getSettings: () => ({
          progressiveReading: {},
        }),
      })),
    } as any;
    const plugin = {
      name: 'test-plugin',
      app: {},
      addTab: vi.fn(),
    } as any;

    const tabManager = new TabManager(context, plugin);
    tabManager.registerAll();

    const runtime = {
      id: 'review-runtime-resize',
      element: document.createElement('div'),
      data: {
        providerId: 'retrieval',
        title: '提取练习',
        queueType: 'retrieval-practice',
        headerVariant: 'retrieval-practice',
        reviewState: {
          version: 1,
          showAnswer: false,
          currentCardId: 'card-special',
          currentBlockId: 'block-special',
        },
      },
      tab: {
        id: 'review-runtime-resize',
        headElement: document.createElement('button'),
        model: {
          data: null,
        },
        parent: {
          switchTab: vi.fn(),
        },
      },
    };

    const reviewRegistration = plugin.addTab.mock.calls[1][0];
    reviewRegistration.init.call(runtime);
    reviewRegistration.resize.call(runtime);
    reviewRegistration.update.call(runtime);
    await vi.runAllTimersAsync();

    expect(refreshTabSurface).toHaveBeenCalledTimes(1);
    expect(refreshTabSurface).toHaveBeenCalledWith('card-special');
    vi.useRealTimers();
  });
});
