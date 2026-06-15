import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType, type QueueCounterSnapshot } from '@/types/unified-data-source';
import { TabManager } from '../TabManager';

const mocks = vi.hoisted(() => ({
  createApp: vi.fn(),
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

function createCard(id: string, blockId: string): FSRSCard {
  const now = Date.UTC(2026, 5, 11);
  return {
    id,
    xiuyuanID: `xiuyuan-${id}`,
    blockId,
    due: now,
    stability: 1,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    state: CardState.New,
    lastReview: now,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
  };
}

function createCounterSnapshot(): QueueCounterSnapshot {
  return {
    version: 1,
    remaining: 2,
    due: 1,
    total: 3,
    buckets: {
      all: 3,
      item: 3,
      descriptor: 0,
      topic: 0,
      concept: 0,
    },
    source: 'hot',
  };
}

function createContext() {
  const sharedQueue = {
    getType: vi.fn(() => QueueType.RetrievalPractice),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };
  const manager = {
    getQueue: vi.fn(() => sharedQueue),
    notifyObservers: vi.fn(),
  };

  return {
    getI18n: vi.fn(() => ({})),
    getUnifiedDataSourceManager: vi.fn(() => manager),
    getEventBus: vi.fn(() => ({
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })),
    getSchedulerRouter: vi.fn(() => ({})),
    getSettingsService: vi.fn(() => ({
      getSettings: () => ({
        progressiveReading: {},
      }),
    })),
    getReviewService: vi.fn(() => ({
      refreshCdfLiveRelationOnOpen: vi.fn(async () => ({
        refreshed: false,
        reason: 'not-live-cdf',
      })),
    })),
  };
}

function createPlugin() {
  return {
    name: 'test-plugin',
    app: {},
    addTab: vi.fn(),
  };
}

function createRuntime(reviewState: Record<string, unknown>) {
  return {
    id: 'review-runtime-snapshot',
    element: document.createElement('div'),
    data: {
      providerId: 'retrieval',
      title: 'Review',
      queueType: QueueType.RetrievalPractice,
      headerVariant: 'retrieval-practice',
      reviewState,
    },
    tab: {
      id: 'review-runtime-snapshot',
      headElement: document.createElement('button'),
      parent: {
        switchTab: vi.fn(),
      },
    },
  };
}

describe('TabManager review queue snapshot DTO normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createApp.mockImplementation(() => ({
      mount: vi.fn(),
      unmount: vi.fn(),
    }));
  });

  it('preserves valid Review queue snapshot DTOs for queue restore', async () => {
    const cachedCard = createCard('card-cached', 'block-cached');
    const currentCard = createCard('card-current', 'block-current');
    const forwardCard = createCard('card-forward', 'block-forward');
    const counterSnapshot = createCounterSnapshot();
    const context = createContext();
    const plugin = createPlugin();
    const tabManager = new TabManager(context as never, plugin as never, {
      siyuanApi: {
        pushErrMsg: vi.fn(),
      },
    } as never);

    tabManager.registerAll();
    const reviewRegistration = plugin.addTab.mock.calls[1][0];
    await reviewRegistration.init.call(createRuntime({
      version: 1,
      showAnswer: false,
      queueSnapshot: {
        version: 1,
        queueType: QueueType.RetrievalPractice,
        cacheValid: true,
        currentIndex: 1,
        cachedCards: [cachedCard, currentCard],
        currentItem: currentCard,
        forwardBuffer: [forwardCard],
        pendingRotateCardId: null,
        lastCounterSnapshot: counterSnapshot,
      },
    }));

    const [, props] = mocks.createApp.mock.calls[0];
    const restoredSnapshot = props.queue.serializeSessionSnapshot();

    expect(restoredSnapshot.cachedCards.map((card: FSRSCard) => card.id)).toEqual([
      'card-cached',
      'card-current',
    ]);
    expect(restoredSnapshot.currentItem).toEqual(expect.objectContaining({
      id: 'card-current',
      blockId: 'block-current',
    }));
    expect(restoredSnapshot.forwardBuffer.map((card: FSRSCard) => card.id)).toEqual([
      'card-forward',
    ]);
    expect(restoredSnapshot.lastCounterSnapshot).toEqual(counterSnapshot);
  });

  it('rejects malformed Review queue snapshot card and counter DTOs during restore', async () => {
    const validCard = createCard('card-valid', 'block-valid');
    const validForwardCard = createCard('card-forward-valid', 'block-forward-valid');
    const context = createContext();
    const plugin = createPlugin();
    const tabManager = new TabManager(context as never, plugin as never, {
      siyuanApi: {
        pushErrMsg: vi.fn(),
      },
    } as never);

    tabManager.registerAll();
    const reviewRegistration = plugin.addTab.mock.calls[1][0];
    await reviewRegistration.init.call(createRuntime({
      version: 1,
      showAnswer: false,
      queueSnapshot: {
        version: 1,
        queueType: QueueType.RetrievalPractice,
        cacheValid: true,
        currentIndex: 0,
        cachedCards: [
          validCard,
          { blockId: 'missing-card-id' },
        ],
        currentItem: { blockId: 'missing-current-card-id' },
        forwardBuffer: [
          { id: 'missing-forward-block-id' },
          validForwardCard,
        ],
        pendingRotateCardId: null,
        lastCounterSnapshot: {
          version: 1,
          remaining: 2,
          due: 1,
          total: 3,
          source: 'hot',
        },
      },
    }));

    const [, props] = mocks.createApp.mock.calls[0];
    const restoredSnapshot = props.queue.serializeSessionSnapshot();

    expect(restoredSnapshot.cachedCards.map((card: FSRSCard) => card.id)).toEqual([
      'card-valid',
    ]);
    expect(restoredSnapshot.currentItem).toBeNull();
    expect(restoredSnapshot.forwardBuffer.map((card: FSRSCard) => card.id)).toEqual([
      'card-forward-valid',
    ]);
    expect(restoredSnapshot.lastCounterSnapshot).toBeNull();
  });
});
