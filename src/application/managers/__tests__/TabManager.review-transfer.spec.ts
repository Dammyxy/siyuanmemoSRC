import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TabManager } from '../TabManager';

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

vi.mock('vue', () => ({
  createApp: mocks.createApp,
}));

vi.mock('@/ui/browser/SRSBrowser.vue', () => ({
  default: {},
}));

vi.mock('@/ui/review/v2', () => ({
  ReviewView: {},
}));

describe('TabManager filter-group review transfer restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
