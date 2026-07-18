import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TabManager } from '../TabManager';
import type { FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';
import { openTab } from 'siyuan';

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

function createSiyuanApiMock() {
  return {
    pushErrMsg: vi.fn().mockResolvedValue(undefined),
  };
}

function createReviewServiceContextSlice() {
  return {
    getReviewProjectionWorkCoordinator: vi.fn(() => ({
      activateSurface: vi.fn(() => ({
        markActive: vi.fn(),
        release: vi.fn(),
      })),
    })),
    getReviewService: vi.fn(() => ({
      refreshCdfLiveRelationOnOpen: vi.fn(async (card: FSRSCard | string) => ({
        attempted: false,
        card: typeof card === 'string' ? null : card,
        updatedCard: null,
        actions: [],
        derivedRelationCount: 0,
        currentReviewDuplicateOutcome: null,
        reason: 'non-cdf-card',
      })),
    })),
    getReviewAdmissionModule: vi.fn(() => ({
      admitReviewSession: vi.fn(async (request: {
        target: { kind: string; queueType: QueueType; entrySurface: string };
      }) => ({
        queueType: request.target.queueType,
        entrySurface: request.target.entrySurface,
        entryTargetIdentity: `${request.target.kind}:${request.target.queueType}:${request.target.entrySurface}`,
        projectionPolicyHash: `${request.target.queueType}:test-policy`,
        projectionGeneration: 1,
        readinessRequest: {
          queueType: request.target.queueType,
          preset: 'all',
          searchText: null,
          docId: null,
          scopeDocIds: [],
          cardType: 'all',
          source: 'browser',
        },
        admittedAt: 1,
        source: 'ready-projection',
      })),
    })),
  };
}

describe('TabManager filter-group review transfer restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createApp.mockImplementation(() => ({
      mount: vi.fn(),
      unmount: vi.fn(),
    }));
  });

  it('restores a detached filter-group session queue from transfer state instead of the shared queue', async () => {
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
      ...createReviewServiceContextSlice(),
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

    const tabManager = new TabManager(context, plugin, { siyuanApi: createSiyuanApiMock() } as never);
    tabManager.registerAll();

    const reviewRegistration = plugin.addTab.mock.calls[1][0];
    await reviewRegistration.init.call({
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

  it('restores a detached static subset queue from exact card transfer state', async () => {
    const sharedFilterQueue = {
      getType: () => 'filter-group',
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
    const cardsById: Record<string, FSRSCard> = {
      'card-a': { id: 'card-a', blockId: 'shared-block' } as FSRSCard,
      'card-b': { id: 'card-b', blockId: 'shared-block' } as FSRSCard,
    };
    const manager = {
      getQueue: vi.fn(() => sharedFilterQueue),
      getCard: vi.fn(async (cardId: string) => cardsById[cardId]),
      getCards: vi.fn(async () => Object.values(cardsById)),
      notifyObservers: vi.fn(),
    };
    const context = {
      getI18n: vi.fn(() => ({})),
      getUnifiedDataSourceManager: vi.fn(() => manager),
      getEventBus: vi.fn(() => ({ subscribe: vi.fn(), unsubscribe: vi.fn() })),
      getSchedulerRouter: vi.fn(() => ({})),
      ...createReviewServiceContextSlice(),
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

    const tabManager = new TabManager(context, plugin, { siyuanApi: createSiyuanApiMock() } as never);
    tabManager.registerAll();

    const reviewRegistration = plugin.addTab.mock.calls[1][0];
    await reviewRegistration.init.call({
      element: document.createElement('div'),
      data: {
        providerId: 'queue-based',
        title: '提取练习',
        queueType: 'filter-group',
        headerVariant: 'retrieval-practice',
        transferState: {
          kind: 'static-subset-session',
          queueType: 'filter-group',
          blockIds: ['shared-block'],
          cardIds: ['card-b', 'card-a'],
          preferredCardId: 'card-a',
          session: {
            initialTotal: 2,
          },
        },
      },
    });

    const [, props] = mocks.createApp.mock.calls[0];
    const queueStrategy = props.queue;
    const underlyingQueue = queueStrategy.getUnderlyingQueue();

    expect(props.initialSessionState).toEqual({
      initialTotal: 2,
    });
    expect(underlyingQueue.getType()).toBe('filter-group');
    await expect(underlyingQueue.getCards()).resolves.toEqual([
      expect.objectContaining({ id: 'card-a' }),
      expect.objectContaining({ id: 'card-b' }),
    ]);
    expect(manager.getQueue).not.toHaveBeenCalledWith('filter-group');
  });

  it('does not recover a previous static subset review state for a new scoped incremental tab', async () => {
    const now = Date.now();
    const previousCard = {
      id: 'card-previous',
      blockId: 'block-previous',
      due: now,
    } as FSRSCard;
    const nextCard = {
      id: 'card-next',
      blockId: 'block-next',
      due: now,
    } as FSRSCard;
    const cardsById: Record<string, FSRSCard> = {
      [previousCard.id]: previousCard,
      [nextCard.id]: nextCard,
    };
    const manager = {
      getCard: vi.fn(async (cardId: string) => cardsById[cardId]),
      getCards: vi.fn(async () => Object.values(cardsById)),
      notifyObservers: vi.fn(),
    };
    const context = {
      getI18n: vi.fn(() => ({})),
      getUnifiedDataSourceManager: vi.fn(() => manager),
      getEventBus: vi.fn(() => ({ subscribe: vi.fn(), unsubscribe: vi.fn() })),
      getSchedulerRouter: vi.fn(() => ({})),
      ...createReviewServiceContextSlice(),
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

    const tabManager = new TabManager(context, plugin, { siyuanApi: createSiyuanApiMock() } as never);
    tabManager.registerAll();

    const reviewRegistration = plugin.addTab.mock.calls[1][0];
    await reviewRegistration.init.call({
      id: 'previous-incremental-tab',
      element: document.createElement('div'),
      data: {
        providerId: 'queue-based',
        title: '渐进学习',
        queueType: 'filter-group',
        headerVariant: 'incremental-learning',
        transferState: {
          kind: 'static-subset-session',
          queueType: 'filter-group',
          blockIds: ['block-previous'],
          cardIds: ['card-previous'],
          preferredCardId: 'card-previous',
        },
      },
      tab: {
        id: 'previous-incremental-tab',
        headElement: document.createElement('button'),
        model: {
          data: null,
        },
        parent: {
          switchTab: vi.fn(),
        },
      },
    });

    const [, previousProps] = mocks.createApp.mock.calls[0];
    previousProps.onTabRuntimeStateChange({
      version: 1,
      showAnswer: false,
      currentCardId: 'card-previous',
      currentBlockId: 'block-previous',
      queueSnapshot: {
        version: 1,
        queueType: 'filter-group',
        cacheValid: true,
        currentIndex: 0,
        cachedCards: [previousCard],
        currentItem: previousCard,
        forwardBuffer: [],
        pendingRotateCardId: null,
        lastCounterSnapshot: null,
      },
    });

    await reviewRegistration.init.call({
      id: 'next-incremental-tab',
      element: document.createElement('div'),
      data: {
        providerId: 'queue-based',
        title: '渐进学习',
        queueType: 'filter-group',
        headerVariant: 'incremental-learning',
        transferState: {
          kind: 'static-subset-session',
          queueType: 'filter-group',
          blockIds: ['block-next'],
          cardIds: ['card-next'],
          preferredCardId: 'card-next',
        },
      },
      tab: {
        id: 'next-incremental-tab',
        headElement: document.createElement('button'),
        model: {
          data: null,
        },
        parent: {
          switchTab: vi.fn(),
        },
      },
    });

    const [, nextProps] = mocks.createApp.mock.calls[1];
    const nextUnderlyingQueue = nextProps.queue.getUnderlyingQueue();

    expect(nextProps.initialCurrentCardId).toBe('');
    expect(nextProps.initialCurrentItem).toBeNull();
    await expect(nextUnderlyingQueue.getCards()).resolves.toEqual([
      expect.objectContaining({ id: 'card-next' }),
    ]);
  });

  it('drops stale native review state when a new static subset incremental tab carries a different exact scope', async () => {
    const now = Date.now();
    const previousCard = {
      id: 'card-previous',
      blockId: 'block-previous',
      due: now,
    } as FSRSCard;
    const nextCard = {
      id: 'card-next',
      blockId: 'block-next',
      due: now,
    } as FSRSCard;
    const cardsById: Record<string, FSRSCard> = {
      [previousCard.id]: previousCard,
      [nextCard.id]: nextCard,
    };
    const manager = {
      getCard: vi.fn(async (cardId: string) => cardsById[cardId]),
      getCards: vi.fn(async () => Object.values(cardsById)),
      notifyObservers: vi.fn(),
    };
    const context = {
      getI18n: vi.fn(() => ({})),
      getUnifiedDataSourceManager: vi.fn(() => manager),
      getEventBus: vi.fn(() => ({ subscribe: vi.fn(), unsubscribe: vi.fn() })),
      getSchedulerRouter: vi.fn(() => ({})),
      ...createReviewServiceContextSlice(),
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

    const tabManager = new TabManager(context, plugin, { siyuanApi: createSiyuanApiMock() } as never);
    tabManager.registerAll();

    const reviewRegistration = plugin.addTab.mock.calls[1][0];
    await reviewRegistration.init.call({
      id: 'next-incremental-tab',
      element: document.createElement('div'),
      data: {
        providerId: 'queue-based',
        title: '渐进学习',
        queueType: 'filter-group',
        headerVariant: 'incremental-learning',
        transferState: {
          kind: 'static-subset-session',
          queueType: 'filter-group',
          blockIds: ['block-next'],
          cardIds: ['card-next'],
          preferredCardId: 'card-next',
        },
        reviewState: {
          version: 1,
          showAnswer: false,
          currentCardId: 'card-previous',
          currentBlockId: 'block-previous',
          queueSnapshot: {
            version: 1,
            queueType: 'filter-group',
            cacheValid: true,
            currentIndex: 0,
            cachedCards: [previousCard],
            currentItem: previousCard,
            forwardBuffer: [],
            pendingRotateCardId: null,
            lastCounterSnapshot: {
              version: 1,
              remaining: 2,
              due: 0,
              total: 2,
              buckets: {
                all: 2,
                item: 2,
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
        id: 'next-incremental-tab',
        headElement: document.createElement('button'),
        model: {
          data: null,
        },
        parent: {
          switchTab: vi.fn(),
        },
      },
    });

    const [, props] = mocks.createApp.mock.calls[0];
    const underlyingQueue = props.queue.getUnderlyingQueue();

    expect(props.initialCurrentCardId).toBe('');
    expect(props.initialCurrentItem).toBeNull();
    expect(props.reviewState).toBeNull();
    await expect(underlyingQueue.getCards()).resolves.toEqual([
      expect.objectContaining({ id: 'card-next' }),
    ]);
  });

  it('restores transfer state through the direct review runtime helper used by deferred bootstrap', async () => {
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
      ...createReviewServiceContextSlice(),
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
    const runtime = {
      id: 'bootstrap-review-runtime',
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
            },
            rollbackSnapshot: {
              temporaryBlacklist: ['card-hidden'],
              customOrder: ['card-2', 'card-1'],
              manualCards: ['manual-1'],
            },
          },
          session: {
            initialTotal: 5,
            answeredCount: 2,
            correctCount: 1,
          },
        },
      },
      tab: {
        id: 'bootstrap-review-runtime',
        headElement: document.createElement('button'),
        parent: {
          switchTab: vi.fn(),
        },
      },
    };

    const tabManager = new TabManager(context, plugin, { siyuanApi: createSiyuanApiMock() } as never);
    await tabManager.initReviewTab(runtime as never);

    const [, props] = mocks.createApp.mock.calls[0];
    const queueStrategy = props.queue;
    const underlyingQueue = queueStrategy.getUnderlyingQueue();

    expect(props.initialSessionState).toEqual({
      initialTotal: 5,
      answeredCount: 2,
      correctCount: 1,
    });
    expect(underlyingQueue.getType()).toBe('filter-group');
    expect(underlyingQueue.serializeSessionSnapshot()).toEqual(expect.objectContaining({
      rollbackSnapshot: expect.objectContaining({
        temporaryBlacklist: ['card-hidden'],
        customOrder: ['card-2', 'card-1'],
        manualCards: ['manual-1'],
      }),
    }));
  });

  it('restores review-tab runtime state for retrieval-practice tabs and keeps it writable on the runtime data', async () => {
    const now = Date.now();
    const currentCard = {
      id: 'card-special',
      xiuyuanID: 'xiuyuan-special',
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
      ...createReviewServiceContextSlice(),
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

    const tabManager = new TabManager(context, plugin, { siyuanApi: createSiyuanApiMock() } as never);
    tabManager.registerAll();

    const runtime = {
      id: 'review-runtime-1',
      element: document.createElement('div'),
      data: {
        providerId: 'retrieval',
        title: '提取练习',
        queueType: 'retrieval-practice',
        headerVariant: 'retrieval-practice',
        sharedReviewSessionId: 'shared-review-1',
        reviewState: {
          version: 1,
          showAnswer: true,
          sharedReviewSessionId: 'shared-review-1',
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
    await reviewRegistration.init.call(runtime);

    const [, props] = mocks.createApp.mock.calls[0];
    expect(props.initialCurrentItem).toMatchObject({
      id: 'card-special',
      meta: {
        forceQuickRender: true,
      },
    });
    expect(props.sharedReviewSessionId).toBe('shared-review-1');
    expect(props.reviewState).toEqual(expect.objectContaining({
      sharedReviewSessionId: 'shared-review-1',
      currentCardId: 'card-special',
    }));
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
      sharedReviewSessionId: 'shared-review-1',
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
      sharedReviewSessionId: 'shared-review-1',
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
      sharedReviewSessionId: 'shared-review-1',
      currentCardId: 'card-special',
      currentBlockId: 'block-special',
    });
    expect(runtime.data.sharedReviewSessionId).toBe('shared-review-1');
    expect(runtime.tab.model.data.sharedReviewSessionId).toBe('shared-review-1');
  });

  it('re-admits restored projection-backed review tabs instead of reusing persisted admission tickets', async () => {
    const staleTicket = {
      queueType: QueueType.IncrementalLearning,
      entrySurface: 'tab-manager:open-review-tab',
      entryTargetIdentity: 'projection-queue:incremental-learning:tab-manager:open-review-tab',
      projectionPolicyHash: 'stale-policy',
      projectionGeneration: 2,
      readinessRequest: {
        queueType: QueueType.IncrementalLearning,
        preset: 'all',
        searchText: null,
        docId: null,
        scopeDocIds: [],
        cardType: 'all',
        source: 'browser',
      },
      admittedAt: 1,
      source: 'ready-projection',
    };
    const freshTicket = {
      ...staleTicket,
      entrySurface: 'compatibility:tab-manager:serialized-review-tab',
      entryTargetIdentity: 'projection-queue:incremental-learning:compatibility:tab-manager:serialized-review-tab',
      projectionPolicyHash: 'fresh-policy',
      projectionGeneration: 9,
      admittedAt: 2,
    };
    const sharedQueue = {
      getType: () => 'incremental-learning',
      getCards: vi.fn(async () => []),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
    const manager = {
      getQueue: vi.fn(() => sharedQueue),
      notifyObservers: vi.fn(),
    };
    const admitReviewSession = vi.fn(async () => freshTicket);
    const context = {
      getI18n: vi.fn(() => ({})),
      getUnifiedDataSourceManager: vi.fn(() => manager),
      getEventBus: vi.fn(() => ({ subscribe: vi.fn(), unsubscribe: vi.fn() })),
      getSchedulerRouter: vi.fn(() => ({})),
      ...createReviewServiceContextSlice(),
      getReviewAdmissionModule: vi.fn(() => ({ admitReviewSession })),
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

    const tabManager = new TabManager(context, plugin, { siyuanApi: createSiyuanApiMock() } as never);
    tabManager.registerAll();

    const reviewRegistration = plugin.addTab.mock.calls[1][0];
    await reviewRegistration.init.call({
      id: 'restored-incremental-tab',
      element: document.createElement('div'),
      data: {
        providerId: 'queue-based',
        title: '渐进学习',
        queueType: 'incremental-learning',
        headerVariant: 'incremental-learning',
        reviewAdmissionTicket: staleTicket,
      },
      tab: {
        id: 'restored-incremental-tab',
        headElement: document.createElement('button'),
        model: {
          data: null,
        },
        parent: {
          switchTab: vi.fn(),
        },
      },
    });

    expect(admitReviewSession).toHaveBeenCalledWith(expect.objectContaining({
      target: expect.objectContaining({
        kind: 'projection-queue',
        queueType: QueueType.IncrementalLearning,
        entrySurface: 'compatibility:tab-manager:serialized-review-tab',
      }),
      queueInstance: sharedQueue,
    }));
    const [, props] = mocks.createApp.mock.calls[0];
    expect((props.queue as any).reviewAdmissionTicket).toMatchObject({
      projectionPolicyHash: 'fresh-policy',
      projectionGeneration: 9,
      entrySurface: 'compatibility:tab-manager:serialized-review-tab',
    });
  });

  it('opens plugin-managed review tabs on the requested split position with shared session metadata', async () => {
    vi.mocked(openTab).mockClear();

    const queue = {
      getType: () => 'retrieval-practice',
    };
    const context = {
      getI18n: vi.fn(() => ({})),
      getUnifiedDataSourceManager: vi.fn(() => ({
        getQueue: vi.fn(),
      })),
      getEventBus: vi.fn(() => ({ subscribe: vi.fn(), unsubscribe: vi.fn() })),
      getSchedulerRouter: vi.fn(() => ({})),
      ...createReviewServiceContextSlice(),
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

    const tabManager = new TabManager(context, plugin, { siyuanApi: createSiyuanApiMock() } as never);

    tabManager.openReviewTab({
      queue,
      title: '提取练习',
      position: 'bottom',
      sharedReviewSessionId: 'shared-review-open',
      reviewState: {
        version: 1,
        showAnswer: true,
        sharedReviewSessionId: 'shared-review-open',
        currentCardId: 'card-special',
        currentBlockId: 'block-special',
      },
    });
    await vi.waitFor(() => {
      expect(openTab).toHaveBeenCalledWith(expect.objectContaining({
        position: 'bottom',
        custom: expect.objectContaining({
          data: expect.objectContaining({
            title: '提取练习',
            sharedReviewSessionId: 'shared-review-open',
            reviewState: expect.objectContaining({
              sharedReviewSessionId: 'shared-review-open',
              currentCardId: 'card-special',
              currentBlockId: 'block-special',
            }),
          }),
        }),
      }));
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
      ...createReviewServiceContextSlice(),
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

    const tabManager = new TabManager(context, plugin, { siyuanApi: createSiyuanApiMock() } as never);
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
    await reviewRegistration.init.call(runtime);
    reviewRegistration.resize.call(runtime);
    reviewRegistration.update.call(runtime);
    await vi.runAllTimersAsync();

    expect(refreshTabSurface).toHaveBeenCalledTimes(1);
    expect(refreshTabSurface).toHaveBeenCalledWith('card-special');
    vi.useRealTimers();
  });

  it('rehydrates a newly split review tab from the latest sibling runtime snapshot when native tab data is stale', async () => {
    const now = Date.now();
    const currentCard = {
      id: 'card-special',
      xiuyuanID: 'xiuyuan-special',
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
      ...createReviewServiceContextSlice(),
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

    const tabManager = new TabManager(context, plugin, { siyuanApi: createSiyuanApiMock() } as never);
    tabManager.registerAll();

    const reviewRegistration = plugin.addTab.mock.calls[1][0];
    const sourceRuntime = {
      id: 'review-runtime-source',
      element: document.createElement('div'),
      data: {
        providerId: 'retrieval',
        title: '提取练习',
        queueType: 'retrieval-practice',
        headerVariant: 'retrieval-practice',
      },
      tab: {
        id: 'review-runtime-source',
        headElement: document.createElement('button'),
        model: {
          data: null,
        },
        parent: {
          switchTab: vi.fn(),
        },
      },
    };

    await reviewRegistration.init.call(sourceRuntime);
    const [, sourceProps] = mocks.createApp.mock.calls[0];
    sourceProps.onTabRuntimeStateChange({
      version: 1,
      showAnswer: false,
      currentCardId: 'card-special',
      currentBlockId: 'block-special',
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

    const splitRuntime = {
      id: 'review-runtime-split',
      element: document.createElement('div'),
      data: {
        providerId: 'retrieval',
        title: '提取练习',
        queueType: 'retrieval-practice',
        headerVariant: 'retrieval-practice',
        reviewState: null,
      },
      tab: {
        id: 'review-runtime-split',
        headElement: document.createElement('button'),
        model: {
          data: null,
        },
        parent: {
          switchTab: vi.fn(),
        },
      },
    };

    await reviewRegistration.init.call(splitRuntime);
    const [, splitProps] = mocks.createApp.mock.calls[1];

    expect(splitProps.initialCurrentCardId).toBe('card-special');
    expect(splitProps.initialCurrentItem).toMatchObject({
      id: 'card-special',
      blockId: 'block-special',
    });

    const freshNeuralRuntime = {
      id: 'review-runtime-fresh-neural',
      element: document.createElement('div'),
      data: {
        providerId: 'queue-based',
        title: '神经漫游',
        queueType: 'neural-roam',
        headerVariant: 'neural-roam',
        reviewState: null,
        suppressSnapshotRecovery: true,
      },
      tab: {
        id: 'review-runtime-fresh-neural',
        headElement: document.createElement('button'),
        model: {
          data: null,
        },
        parent: {
          switchTab: vi.fn(),
        },
      },
    };

    const neuralCurrentCard = {
      ...currentCard,
      id: 'old-neural-card',
      blockId: 'old-neural-block',
    } as FSRSCard;
    const neuralSourceRuntime = {
      id: 'review-runtime-neural-source',
      element: document.createElement('div'),
      data: {
        providerId: 'queue-based',
        title: '神经漫游',
        queueType: 'neural-roam',
        headerVariant: 'neural-roam',
      },
      tab: {
        id: 'review-runtime-neural-source',
        headElement: document.createElement('button'),
        model: {
          data: null,
        },
        parent: {
          switchTab: vi.fn(),
        },
      },
    };

    await reviewRegistration.init.call(neuralSourceRuntime);
    const [, neuralSourceProps] = mocks.createApp.mock.calls[2];
    neuralSourceProps.onTabRuntimeStateChange({
      version: 1,
      showAnswer: false,
      currentCardId: 'old-neural-card',
      currentBlockId: 'old-neural-block',
      queueSnapshot: {
        version: 1,
        queueType: 'neural-roam',
        cacheValid: true,
        currentIndex: 1,
        cachedCards: [neuralCurrentCard],
        currentItem: neuralCurrentCard,
        forwardBuffer: [],
        pendingRotateCardId: null,
        lastCounterSnapshot: null,
      },
    });

    await reviewRegistration.init.call(freshNeuralRuntime);
    const [, freshNeuralProps] = mocks.createApp.mock.calls[3];

    expect(freshNeuralProps.initialCurrentCardId).toBe('');
    expect(freshNeuralProps.initialCurrentItem).toBeNull();
  });

  it('replaces the current review tab when quick-switching to another standard queue', async () => {
    const manager = {
      getQueue: vi.fn((queueType: string) => ({
        getType: () => queueType,
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      })),
      notifyObservers: vi.fn(),
    };
    const context = {
      getI18n: vi.fn(() => ({})),
      getUnifiedDataSourceManager: vi.fn(() => manager),
      getEventBus: vi.fn(() => ({ subscribe: vi.fn(), unsubscribe: vi.fn() })),
      getSchedulerRouter: vi.fn(() => ({})),
      ...createReviewServiceContextSlice(),
      getSettingsService: vi.fn(() => ({
        getSettings: () => ({
          progressiveReading: {},
        }),
      })),
    } as any;
    const plugin = {
      name: 'test-plugin',
      app: {},
      i18n: {
        filterGroupPractice: '分组队列',
      },
      addTab: vi.fn(),
    } as any;

    const tabManager = new TabManager(context, plugin, { siyuanApi: createSiyuanApiMock() } as never);
    await tabManager.replaceCurrentReviewTabWithStandardQueue(QueueType.FilterGroup);

    expect(openTab).toHaveBeenCalledWith(expect.objectContaining({
      keepCursor: false,
      removeCurrentTab: true,
      custom: expect.objectContaining({
        title: '分组队列',
        data: expect.objectContaining({
          entryTarget: expect.objectContaining({
            kind: 'managed-queue',
            queueType: QueueType.FilterGroup,
            entrySurface: 'tab-manager:replace-standard-review-tab',
          }),
          headerVariant: 'filter-group',
        }),
      }),
    }));
  });
});
