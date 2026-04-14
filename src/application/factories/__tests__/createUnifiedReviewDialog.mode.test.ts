import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUnifiedReviewDialog } from '@/application/factories/createUnifiedReviewDialog';
import { QueueType } from '@/types/unified-data-source';

const { createVueDialogMock, unifiedQueueStrategyMock, unifiedReviewAdapterMock, managerInstance } = vi.hoisted(() => ({
  createVueDialogMock: vi.fn(() => ({ destroy: vi.fn() })),
  unifiedQueueStrategyMock: vi.fn().mockImplementation(() => ({})),
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

  it('passes dialog mode into ReviewView props', () => {
    const initialSessionState = {
      initialTotal: 5,
      answeredCount: 2,
      correctCount: 1,
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
      eventBus: { subscribe: vi.fn() } as never,
    });

    expect(createVueDialogMock).toHaveBeenCalledWith(expect.objectContaining({
      isReview: true,
      props: expect.objectContaining({
        mode: 'dialog',
        title: '提取练习',
        headerVariant: 'retrieval-practice',
        initialSessionState,
      }),
    }));
  });
});
