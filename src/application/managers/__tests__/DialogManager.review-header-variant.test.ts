import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createVueDialog } from '@/utils/dialog';
import { createUnifiedReviewDialog } from '@/application/factories/createUnifiedReviewDialog';
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

function createDialogManager() {
  const filterGroupQueue = {
    getType: () => 'filter-group',
    setFilter: vi.fn().mockResolvedValue(undefined),
    clearTemporaryBlacklist: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };

  const manager = {
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
      getSettings: () => ({ leech: {} }),
    }),
    getReviewQueuePreparationService: vi.fn().mockReturnValue(preparationService),
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
    }),
    filterGroupQueue,
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

  it('passes explicit headerVariant through filter-backed review dialogs', async () => {
    const { dialogManager, filterGroupQueue } = createDialogManager();

    await dialogManager.openRetrievalPracticeWithFilter({
      blockIds: ['block-1'],
      dueOnly: false,
    });
    await dialogManager.openIncrementalLearningWithFilter({
      blockIds: ['block-2'],
      dueOnly: true,
    });

    expect(filterGroupQueue.setFilter).toHaveBeenCalledTimes(2);
    expect(unifiedQueueStrategyMock).toHaveBeenCalledTimes(2);
    expect(unifiedReviewAdapterMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      headerVariant: 'retrieval-practice',
    }));
    expect(unifiedReviewAdapterMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      headerVariant: 'incremental-learning',
    }));

    const propsList = vi.mocked(createVueDialog).mock.calls.map(([config]) => config.props);
    expect(propsList[0]?.headerVariant).toBe('retrieval-practice');
    expect(propsList[1]?.headerVariant).toBe('incremental-learning');
  });
});
