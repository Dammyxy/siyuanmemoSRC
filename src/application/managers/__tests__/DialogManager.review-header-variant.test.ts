import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createVueDialog } from '@/utils/dialog';
import { createUnifiedReviewDialog } from '@/application/factories/createUnifiedReviewDialog';
import { SubsetReviewQueue } from '@/core/queue/domain/SubsetReviewQueue';
import { TemporaryDrillQueue } from '@/core/queue/domain/TemporaryDrillQueue';
import { QueueType } from '@/types/unified-data-source';
import { DialogManager } from '../DialogManager';

const { unifiedQueueStrategyMock, unifiedReviewAdapterMock } = vi.hoisted(() => ({
  unifiedQueueStrategyMock: vi.fn().mockImplementation(() => ({})),
  unifiedReviewAdapterMock: vi.fn().mockImplementation((options) => ({ options })),
}));

vi.mock('@/utils/dialog', () => ({
  createVueDialog: vi.fn(() => ({ destroy: vi.fn() })),
}));

vi.mock('@/ui/settings', () => ({
  SettingsPanel: {},
}));

vi.mock('@/ui/browser/SRSBrowser.vue', () => ({
  default: {},
}));

vi.mock('@/ui/mobile/MobileReviewLauncher.vue', () => ({
  default: {},
}));

vi.mock('@/ui/xiuyuan', () => ({
  TemplateSelectDialog: {},
}));

vi.mock('@/application/factories/createUnifiedReviewDialog', () => ({
  createUnifiedReviewDialog: vi.fn(() => ({ destroy: vi.fn() })),
}));

vi.mock('@/ui/review/v2', () => ({
  ReviewView: {},
}));

vi.mock('@/application/adapters/UnifiedQueueStrategy', () => ({
  UnifiedQueueStrategy: unifiedQueueStrategyMock,
}));

vi.mock('@/application/adapters/UnifiedReviewAdapter', () => ({
  UnifiedReviewAdapter: unifiedReviewAdapterMock,
}));

vi.mock('@/core/queue/domain/LeechReviewQueue', () => ({
  LeechReviewQueue: vi.fn().mockImplementation(() => ({ getType: () => 'leech' })),
}));

vi.mock('@/core/queue/domain/SubsetReviewQueue', () => ({
  SubsetReviewQueue: vi.fn().mockImplementation(() => ({ getType: () => 'filter-group' })),
}));

vi.mock('@/core/queue/domain/TemporaryDrillQueue', () => ({
  TemporaryDrillQueue: vi.fn().mockImplementation(() => ({ getType: () => 'final-drill' })),
}));

function createDialogManager(options?: {
  reviewOpenInNewTabByDefault?: boolean;
  reviewOpenFullscreenByDefault?: boolean;
}) {
  const filterGroupQueue = {
    getType: () => 'filter-group',
    setFilter: vi.fn().mockResolvedValue(undefined),
    clearTemporaryBlacklist: vi.fn().mockResolvedValue(undefined),
    serializeSessionSnapshot: vi.fn(() => ({
      filter: { blockIds: ['block-1'] },
      visibleCardIds: ['card-1'],
      temporaryBlacklistCardIds: [],
      currentIndex: 0,
    })),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };

  const manager = {
    materializeQueueProjection: vi.fn().mockResolvedValue(undefined),
    getQueue: vi.fn((queueType: string) => {
      if (queueType === 'filter-group') {
        return filterGroupQueue;
      }
      return {
        getType: () => queueType,
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      };
    }),
  };

  const preparationService = {
    prepareBeforeReview: vi.fn().mockResolvedValue(undefined),
  };

  const tabManager = {
    openReviewTabInNewTab: vi.fn(),
  };

  const context = {
    getI18n: vi.fn().mockReturnValue({
      retrievalPractice: '提取练习',
      incrementalLearning: '渐进学习',
      finalDrill: '刻意练习',
      filterGroupPractice: '分组队列',
      neuralReviewTitle: '神经漫游',
      startLeechPractice: '难点攻坚',
      reviewSubsetTitleWithCount: '子集复习 ({n} 张)',
      temporaryDrill: '临时练习',
    }),
    getEventBus: vi.fn().mockReturnValue({ subscribe: vi.fn() }),
    getUnifiedDataSourceManager: vi.fn().mockReturnValue(manager),
    getSchedulerRouter: vi.fn().mockReturnValue({}),
    getSettingsService: vi.fn().mockReturnValue({
      getSettings: () => ({
        leech: {},
        ui: {
          reviewOpenInNewTabByDefault: options?.reviewOpenInNewTabByDefault ?? false,
          reviewOpenFullscreenByDefault: options?.reviewOpenFullscreenByDefault ?? false,
          enableDebugLogs: false,
        },
      }),
    }),
    getReviewQueuePreparationService: vi.fn().mockReturnValue(preparationService),
    getTabManager: vi.fn().mockReturnValue(tabManager),
  } as any;

  const plugin = {
    app: {},
    isMobile: false,
  } as any;

  return {
    dialogManager: new DialogManager(context, plugin, {
      siyuanApi: {
        pushMsg: vi.fn().mockResolvedValue(undefined),
        pushErrMsg: vi.fn().mockResolvedValue(undefined),
      } as any,
      progressiveSiyuanApi: {} as any,
      leechActionEffects: {} as any,
    }),
    filterGroupQueue,
    manager,
    tabManager,
  };
}

describe('DialogManager review header variants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes explicit headerVariant to unified review dialogs', async () => {
    const { dialogManager } = createDialogManager();

    await dialogManager.openReviewDialog();
    await dialogManager.openIncrementalLearningDialog();
    await dialogManager.openFinalDrillDialog();
    await dialogManager.openFilterGroupPracticeDialog();
    await dialogManager.openNeuralRoamDialog();
    await dialogManager.openLeechReviewDialog();
    await dialogManager.openSubsetReviewDialog(['block-1']);
    await dialogManager.openTemporaryDrill(['block-1']);

    expect(vi.mocked(createUnifiedReviewDialog).mock.calls.map(([options]) => options.headerVariant)).toEqual([
      'retrieval-practice',
      'incremental-learning',
      'final-drill',
      'filter-group',
      'neural-roam',
      'leech',
      'subset-review',
      'temporary-drill',
    ]);
  });

  it('passes exact cardIds to subset review queues and counts cards in the title', async () => {
    const { dialogManager } = createDialogManager();

    await dialogManager.openSubsetReviewDialog(['block-1'], {
      cardIds: ['card-2', 'card-3'],
      preferredCardId: 'card-3',
    });

    expect(vi.mocked(SubsetReviewQueue)).toHaveBeenCalledWith(
      expect.anything(),
      ['block-1'],
      {
        cardIds: ['card-2', 'card-3'],
        preferredCardId: 'card-3',
      },
    );
    expect(vi.mocked(createUnifiedReviewDialog)).toHaveBeenCalledWith(expect.objectContaining({
      title: '子集复习 (2 张)',
      headerVariant: 'subset-review',
      transferState: {
        kind: 'static-subset-session',
        queueType: QueueType.FilterGroup,
        blockIds: ['block-1'],
        cardIds: ['card-2', 'card-3'],
        preferredCardId: 'card-3',
      },
    }));
  });

  it('passes exact cardIds to temporary drill queues and counts cards in the title', async () => {
    const { dialogManager } = createDialogManager();

    await dialogManager.openTemporaryDrill(['block-1'], {
      cardIds: ['card-2', 'card-3'],
      preferredCardId: 'card-3',
    });

    expect(vi.mocked(TemporaryDrillQueue)).toHaveBeenCalledWith(
      expect.anything(),
      ['block-1'],
      {
        cardIds: ['card-2', 'card-3'],
        preferredCardId: 'card-3',
      },
    );
    expect(vi.mocked(createUnifiedReviewDialog)).toHaveBeenCalledWith(expect.objectContaining({
      title: '临时练习 (2 张)',
      headerVariant: 'temporary-drill',
      transferState: {
        kind: 'static-subset-session',
        queueType: QueueType.FinalDrill,
        blockIds: ['block-1'],
        cardIds: ['card-2', 'card-3'],
        preferredCardId: 'card-3',
      },
    }));
  });

  it('materializes leech projection from the dialog queue before opening leech review', async () => {
    const { dialogManager, manager } = createDialogManager();

    await dialogManager.openLeechReviewDialog();

    const leechQueue = vi.mocked(createUnifiedReviewDialog).mock.calls[0]?.[0].queueInstance;
    expect(manager.materializeQueueProjection).toHaveBeenCalledWith(QueueType.Leech, leechQueue);
  });

  it('opens standard desktop review entries in new tabs when configured', async () => {
    const { dialogManager, tabManager } = createDialogManager({
      reviewOpenInNewTabByDefault: true,
    });

    await dialogManager.openReviewDialog();

    expect(tabManager.openReviewTabInNewTab).toHaveBeenCalledWith(expect.objectContaining({
      title: '提取练习',
      headerVariant: 'retrieval-practice',
    }));
    expect(createUnifiedReviewDialog).not.toHaveBeenCalled();
  });

  it('forces standard review surface conversions to stay in dialog mode even when new-tab default is enabled', async () => {
    const { dialogManager, tabManager } = createDialogManager({
      reviewOpenInNewTabByDefault: true,
    });
    const queueInstance = {
      getType: () => 'retrieval-practice',
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
    const initialSessionState = {
      initialTotal: 7,
      answeredCount: 4,
      correctCount: 3,
    };

    await dialogManager.openStandardReviewDialog({
      queueType: 'retrieval-practice',
      title: '提取练习',
      headerVariant: 'retrieval-practice',
      queueInstance: queueInstance as never,
      initialSessionState,
    });

    expect(tabManager.openReviewTabInNewTab).not.toHaveBeenCalled();
    expect(createUnifiedReviewDialog).toHaveBeenCalledWith(expect.objectContaining({
      queueType: 'retrieval-practice',
      headerVariant: 'retrieval-practice',
      queueInstance,
      initialSessionState,
    }));
  });

  it('switches the current standard review dialog queue without escaping to a new tab', async () => {
    const { dialogManager, tabManager } = createDialogManager({
      reviewOpenInNewTabByDefault: true,
    });

    await dialogManager.switchStandardReviewDialogQueue(QueueType.IncrementalLearning);

    expect(tabManager.openReviewTabInNewTab).not.toHaveBeenCalled();
    expect(createUnifiedReviewDialog).toHaveBeenCalledWith(expect.objectContaining({
      queueType: 'incremental-learning',
      title: '渐进学习',
      headerVariant: 'incremental-learning',
    }));
  });

  it('keeps destroying the active dialog when a stale queue-switch onClose fires late', async () => {
    const { dialogManager } = createDialogManager();
    const dialogFactory = vi.mocked(createUnifiedReviewDialog);
    const previousImplementation = dialogFactory.getMockImplementation();
    const dialogRecords: Array<{
      destroy: ReturnType<typeof vi.fn>;
      onClose?: () => void;
    }> = [];

    dialogFactory.mockImplementation((options) => {
      const record = {
        destroy: vi.fn(),
        onClose: options.onClose,
      };
      dialogRecords.push(record);
      return {
        destroy: record.destroy,
      } as never;
    });

    try {
      await dialogManager.openReviewDialog();
      await dialogManager.switchStandardReviewDialogQueue(QueueType.IncrementalLearning);

      expect(dialogRecords[0]?.destroy).toHaveBeenCalledTimes(1);

      dialogRecords[0]?.onClose?.();

      await dialogManager.switchStandardReviewDialogQueue(QueueType.FinalDrill);

      expect(dialogRecords[1]?.destroy).toHaveBeenCalledTimes(1);
      expect(dialogFactory).toHaveBeenNthCalledWith(3, expect.objectContaining({
        queueType: 'final-drill',
        title: '刻意练习',
        headerVariant: 'final-drill',
      }));
    } finally {
      dialogFactory.mockImplementation(previousImplementation ?? (() => ({ destroy: vi.fn() } as never)));
    }
  });

  it('passes startFullscreen to dialog review entries when fullscreen-default is enabled', async () => {
    const { dialogManager } = createDialogManager({
      reviewOpenFullscreenByDefault: true,
    });

    await dialogManager.openReviewDialog();
    await dialogManager.openLeechReviewDialog();

    expect(vi.mocked(createUnifiedReviewDialog).mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      headerVariant: 'retrieval-practice',
      startFullscreen: true,
    }));
    expect(vi.mocked(createUnifiedReviewDialog).mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      headerVariant: 'leech',
      startFullscreen: true,
    }));
  });

  it('opens scoped retrieval and incremental entries without mutating the shared filter-group queue', async () => {
    const { dialogManager, filterGroupQueue } = createDialogManager();

    await dialogManager.openRetrievalPracticeWithFilter({
      blockIds: ['block-1'],
      cardIds: ['card-1'],
      preferredCardId: 'card-1',
      scopeDocIds: ['doc-1'],
      dueOnly: false,
    });
    await dialogManager.openIncrementalLearningWithFilter({
      blockIds: ['block-2'],
      cardIds: ['card-2'],
      preferredCardId: 'card-2',
      scopeDocIds: ['doc-2'],
      dueOnly: true,
    });

    expect(filterGroupQueue.setFilter).not.toHaveBeenCalled();
    expect(unifiedQueueStrategyMock).not.toHaveBeenCalled();
    expect(unifiedReviewAdapterMock).not.toHaveBeenCalled();
    expect(vi.mocked(SubsetReviewQueue)).toHaveBeenNthCalledWith(1, expect.anything(), ['block-1'], {
      cardIds: ['card-1'],
      preferredCardId: 'card-1',
    });
    expect(vi.mocked(SubsetReviewQueue)).toHaveBeenNthCalledWith(2, expect.anything(), ['block-2'], {
      cardIds: ['card-2'],
      preferredCardId: 'card-2',
    });
    expect(createUnifiedReviewDialog).toHaveBeenNthCalledWith(1, expect.objectContaining({
      headerVariant: 'retrieval-practice',
      queueType: QueueType.FilterGroup,
      transferState: {
        kind: 'static-subset-session',
        queueType: QueueType.FilterGroup,
        blockIds: ['block-1'],
        cardIds: ['card-1'],
        preferredCardId: 'card-1',
      },
    }));
    expect(createUnifiedReviewDialog).toHaveBeenNthCalledWith(2, expect.objectContaining({
      headerVariant: 'incremental-learning',
      queueType: QueueType.FilterGroup,
      transferState: {
        kind: 'static-subset-session',
        queueType: QueueType.FilterGroup,
        blockIds: ['block-2'],
        cardIds: ['card-2'],
        preferredCardId: 'card-2',
      },
    }));
    expect(createVueDialog).not.toHaveBeenCalled();
  });

  it('opens scoped retrieval and incremental sessions in new tabs with exact-card transfer state', async () => {
    const { dialogManager, tabManager, filterGroupQueue } = createDialogManager({
      reviewOpenInNewTabByDefault: true,
    });

    await dialogManager.openRetrievalPracticeWithFilter({
      blockIds: ['block-1'],
      cardIds: ['card-1'],
      preferredCardId: 'card-1',
      scopeDocIds: ['doc-1'],
      dueOnly: false,
    });
    await dialogManager.openIncrementalLearningWithFilter({
      blockIds: ['block-2'],
      cardIds: ['card-2'],
      preferredCardId: 'card-2',
      scopeDocIds: ['doc-2'],
      dueOnly: true,
    });

    expect(filterGroupQueue.setFilter).not.toHaveBeenCalled();
    expect(filterGroupQueue.serializeSessionSnapshot).not.toHaveBeenCalled();
    expect(tabManager.openReviewTabInNewTab).toHaveBeenNthCalledWith(1, expect.objectContaining({
      title: '提取练习',
      headerVariant: 'retrieval-practice',
      queue: expect.anything(),
      transferState: {
        kind: 'static-subset-session',
        queueType: QueueType.FilterGroup,
        blockIds: ['block-1'],
        cardIds: ['card-1'],
        preferredCardId: 'card-1',
      },
    }));
    expect(tabManager.openReviewTabInNewTab).toHaveBeenNthCalledWith(2, expect.objectContaining({
      title: '渐进学习',
      headerVariant: 'incremental-learning',
      queue: expect.anything(),
      transferState: {
        kind: 'static-subset-session',
        queueType: QueueType.FilterGroup,
        blockIds: ['block-2'],
        cardIds: ['card-2'],
        preferredCardId: 'card-2',
      },
    }));
    expect(createVueDialog).not.toHaveBeenCalled();
  });
});
