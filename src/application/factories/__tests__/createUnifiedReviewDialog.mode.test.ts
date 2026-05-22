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
      disableClose: true,
      props: expect.objectContaining({
        mode: 'dialog',
        title: '提取练习',
        headerVariant: 'retrieval-practice',
        initialSessionState,
        transferState,
        nativeDialogTitlebar: true,
      }),
    }));
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
});
