import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUnifiedReviewDialog } from '@/application/factories/createUnifiedReviewDialog';
import { QueueType } from '@/types/unified-data-source';

const { createVueDialogMock, unifiedQueueStrategyMock, unifiedReviewAdapterMock, managerInstance } = vi.hoisted(() => ({
  createVueDialogMock: vi.fn(() => ({ destroy: vi.fn() })),
  unifiedQueueStrategyMock: vi.fn().mockImplementation(() => ({
    startNeuralRoamFromFocusOnNextAdvance: vi.fn(),
  })),
  unifiedReviewAdapterMock: vi.fn().mockImplementation((options) => ({ options })),
  managerInstance: {},
}));

vi.mock('@/utils/dialog', () => ({
  createVueDialog: createVueDialogMock,
}));

vi.mock('@/application/adapters/UnifiedQueueStrategy', () => ({
  UnifiedQueueStrategy: unifiedQueueStrategyMock,
}));

vi.mock('@/application/adapters/UnifiedReviewAdapter', () => ({
  UnifiedReviewAdapter: unifiedReviewAdapterMock,
}));

vi.mock('@/application/services/UnifiedDataSourceManager', () => ({
  UnifiedDataSourceManager: {
    getInstance: vi.fn(() => managerInstance),
  },
}));

describe('createUnifiedReviewDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restores the native titlebar for desktop review dialogs', () => {
    const initialSessionState = {
      initialTotal: 5,
      answeredCount: 2,
      correctCount: 1,
    };
    const transferState = {
      kind: 'static-subset-session' as const,
      queueType: QueueType.FilterGroup,
      blockIds: ['block-1'],
      cardIds: ['card-1'],
      preferredCardId: 'card-1',
    };
    const plugin = {
      app: {},
      isMobile: false,
      i18n: {},
      getContext: () => ({
        getSchedulerRouter: () => ({}),
        getSettingsService: () => ({
          getSettings: () => ({
            progressiveReading: {},
          }),
        }),
      }),
    };

    createUnifiedReviewDialog({
      plugin,
      queueType: QueueType.RetrievalPractice,
      title: '提取练习',
      headerVariant: 'retrieval-practice',
      initialSessionState,
      transferState,
      eventBus: { subscribe: vi.fn() } as never,
    });

    expect(createVueDialogMock).toHaveBeenCalledWith(expect.objectContaining({
      hideTitle: false,
      isReview: true,
      disableClose: false,
      scrimVariant: 'review-focus',
      props: expect.objectContaining({
        mode: 'dialog',
        title: '提取练习',
        headerVariant: 'retrieval-practice',
        initialSessionState,
        transferState,
        nativeDialogTitlebar: true,
      }),
    }));
    expect(createVueDialogMock.mock.calls[0]?.[0]?.transparent).not.toBe(true);
  });

  it('keeps the native titlebar hidden on mobile review dialogs', () => {
    const plugin = {
      app: {},
      isMobile: true,
      i18n: {},
      getContext: () => ({
        getSchedulerRouter: () => ({}),
        getSettingsService: () => ({
          getSettings: () => ({
            progressiveReading: {},
          }),
        }),
      }),
    };

    createUnifiedReviewDialog({
      plugin,
      queueType: QueueType.RetrievalPractice,
      title: '提取练习',
      headerVariant: 'retrieval-practice',
      eventBus: { subscribe: vi.fn() } as never,
    });

    expect(createVueDialogMock).toHaveBeenCalledWith(expect.objectContaining({
      hideTitle: true,
      props: expect.objectContaining({
        nativeDialogTitlebar: false,
      }),
    }));
  });

  it('injects Review-open CDF live relation refresh into the queue strategy', async () => {
    const refreshCdfLiveRelationOnOpen = vi.fn(async () => ({
      attempted: true,
      card: null,
      updatedCard: null,
      actions: [],
      derivedRelationCount: 0,
      currentReviewDuplicateOutcome: null,
      reason: 'unchanged' as const,
    }));
    const plugin = {
      app: {},
      isMobile: false,
      i18n: {},
      getContext: () => ({
        getSchedulerRouter: () => ({}),
        getSettingsService: () => ({
          getSettings: () => ({
            progressiveReading: {},
          }),
        }),
        getReviewService: () => ({ refreshCdfLiveRelationOnOpen }),
      }),
    };

    createUnifiedReviewDialog({
      plugin,
      queueType: QueueType.RetrievalPractice,
      title: '提取练习',
      headerVariant: 'retrieval-practice',
      eventBus: { subscribe: vi.fn() } as never,
    });

    const refresher = unifiedQueueStrategyMock.mock.calls[0]?.[4];
    await expect(refresher.refreshCdfLiveRelationOnOpen('card-1')).resolves.toMatchObject({
      reason: 'unchanged',
    });

    expect(refreshCdfLiveRelationOnOpen).toHaveBeenCalledWith('card-1');
  });

  it('marks dialog onClose sync as persistent when review count exists', async () => {
    const incrementalSync = vi.fn(async () => ({ success: true }));
    const plugin = {
      app: {},
      isMobile: false,
      i18n: {},
      reviewSyncManager: { reviewCount: 1 },
      getContext: () => ({
        getSchedulerRouter: () => ({}),
        getSettingsService: () => ({
          getSettings: () => ({
            progressiveReading: {},
          }),
        }),
        getHybridSyncService: () => ({ incrementalSync }),
      }),
    };

    createUnifiedReviewDialog({
      plugin,
      queueType: QueueType.RetrievalPractice,
      title: '提取练习',
      headerVariant: 'retrieval-practice',
      eventBus: { subscribe: vi.fn() } as never,
    });

    const dialogOptions = createVueDialogMock.mock.calls[0]?.[0];
    await dialogOptions.onClose();

    expect(incrementalSync).toHaveBeenCalledWith(undefined, {
      source: 'review-dialog-close',
      persistIdleCheckpoint: true,
    });
  });

  it('awaits durable Review truth flush before close sync', async () => {
    const calls: string[] = [];
    const flushReviewTruthNow = vi.fn(async () => {
      calls.push('flush');
      return true;
    });
    const incrementalSync = vi.fn(async () => {
      calls.push('sync');
      return { success: true };
    });
    const plugin = {
      app: {},
      isMobile: false,
      i18n: {},
      reviewSyncManager: { reviewCount: 1 },
      getContext: () => ({
        getSchedulerRouter: () => ({}),
        getSettingsService: () => ({
          getSettings: () => ({
            progressiveReading: {},
          }),
        }),
        getSrsBackendClient: () => ({ flushReviewTruthNow }),
        getHybridSyncService: () => ({ incrementalSync }),
      }),
    };

    createUnifiedReviewDialog({
      plugin,
      queueType: QueueType.RetrievalPractice,
      title: '提取练习',
      headerVariant: 'retrieval-practice',
      eventBus: { subscribe: vi.fn() } as never,
    });

    const dialogOptions = createVueDialogMock.mock.calls[0]?.[0];
    await dialogOptions.onClose();

    expect(flushReviewTruthNow).toHaveBeenCalledWith('review-exit');
    expect(incrementalSync).toHaveBeenCalledWith(undefined, {
      source: 'review-dialog-close',
      persistIdleCheckpoint: true,
    });
    expect(calls).toEqual(['flush', 'sync']);
  });

  it('awaits durable Review truth flush before the ReviewView close event destroys the dialog', async () => {
    const calls: string[] = [];
    const flushReviewTruthNow = vi.fn(async () => {
      calls.push('flush');
      return true;
    });
    const destroy = vi.fn(() => {
      calls.push('destroy');
    });
    createVueDialogMock.mockImplementationOnce(() => ({ destroy }));
    const plugin = {
      app: {},
      isMobile: false,
      i18n: {},
      getContext: () => ({
        getSchedulerRouter: () => ({}),
        getSettingsService: () => ({
          getSettings: () => ({
            progressiveReading: {},
          }),
        }),
        getSrsBackendClient: () => ({ flushReviewTruthNow }),
      }),
    };

    createUnifiedReviewDialog({
      plugin,
      queueType: QueueType.RetrievalPractice,
      title: '提取练习',
      headerVariant: 'retrieval-practice',
      eventBus: { subscribe: vi.fn() } as never,
    });

    const dialogOptions = createVueDialogMock.mock.calls[0]?.[0];
    await dialogOptions.events.close();

    expect(flushReviewTruthNow).toHaveBeenCalledWith('review-exit');
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['flush', 'destroy']);
  });

  it('deduplicates close finalization when destroy also invokes dialog onClose', async () => {
    const requestReviewTruthFlush = vi.fn();
    const onClose = vi.fn();
    createVueDialogMock.mockImplementationOnce((dialogOptions) => ({
      destroy: vi.fn(() => {
        void dialogOptions.onClose();
      }),
    }));
    const plugin = {
      app: {},
      isMobile: false,
      i18n: {},
      getContext: () => ({
        getSchedulerRouter: () => ({}),
        getSettingsService: () => ({
          getSettings: () => ({
            progressiveReading: {},
          }),
        }),
        getSrsBackendClient: () => ({ requestReviewTruthFlush }),
      }),
    };

    createUnifiedReviewDialog({
      plugin,
      queueType: QueueType.RetrievalPractice,
      title: '提取练习',
      headerVariant: 'retrieval-practice',
      eventBus: { subscribe: vi.fn() } as never,
      onClose,
    });

    const dialogOptions = createVueDialogMock.mock.calls[0]?.[0];
    dialogOptions.events.close();
    await Promise.resolve();

    expect(requestReviewTruthFlush).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
