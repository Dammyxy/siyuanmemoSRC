import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createVueDialog } from '@/utils/dialog';
import { ProgressiveSplitCancelledError } from '@/application/services/ProgressiveReadingService';
import { DialogManager } from '../DialogManager';

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
  createUnifiedReviewDialog: vi.fn(),
}));

vi.mock('@/ui/review/v2', () => ({
  ReviewView: {},
}));

vi.mock('@/ui/progressive/ProgressiveSplitDialog.vue', () => ({
  default: {},
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createDialogManager() {
  const splitDocument = vi.fn().mockResolvedValue({
    sessionId: 'session-1',
    pieceDocIds: ['piece-1', 'piece-2'],
  });
  const siyuanApi = {
    pushMsg: vi.fn().mockResolvedValue(undefined),
    pushErrMsg: vi.fn().mockResolvedValue(undefined),
  };
  const context = {
    getI18n: vi.fn().mockReturnValue({
      progressiveSplitLinearCreated: '已创建 {count} 个线性 piece 子文档',
      progressiveSplitNonlinearCreated: '已创建 {count} 个非线性 piece 子文档',
      progressiveSplitFailed: 'Split 失败：{message}',
      progressiveSplitCancelled: '已取消 Split',
      progressiveSplitCancelledCleanupPartial: '部分已创建内容可能保留',
      progressiveSplitCustomRequired: '请输入自定义切割字符串',
      progressiveSplitMarkerRequired: '至少选择一个切割标记',
    }),
    getProgressiveReadingService: vi.fn().mockReturnValue({
      splitDocument,
    }),
  } as any;

  return {
    dialogManager: new DialogManager(context, {} as any, { siyuanApi: siyuanApi as any }),
    splitDocument,
    siyuanApi,
  };
}

describe('DialogManager progressive split dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('switches the shared dialog into running mode and passes progress callbacks into splitDocument', async () => {
    const { dialogManager, splitDocument, siyuanApi } = createDialogManager();
    const deferred = createDeferred<{ sessionId: string; pieceDocIds: string[] }>();
    splitDocument.mockImplementation(async (...args: unknown[]) => {
      void args;
      return deferred.promise;
    });

    await dialogManager.openProgressiveSplitDialog('doc-1', 'linear');

    expect(createVueDialog).toHaveBeenCalledTimes(1);
    const dialogConfig = vi.mocked(createVueDialog).mock.calls[0]?.[0] as {
      disableClose?: boolean;
      props?: {
        progressState?: {
          status: 'config' | 'running' | 'cancelling';
          progress: unknown;
        };
      };
      events?: {
        confirm?: (config: unknown) => Promise<void>;
      };
    };

    const confirmPromise = dialogConfig.events?.confirm?.({
      horizontalRule: true,
      headingLevels: ['h1', 'h2'],
      customStringEnabled: true,
      customString: ' CUT ',
    });
    await Promise.resolve();

    expect(dialogConfig.disableClose).toBe(true);
    expect(dialogConfig.props?.progressState?.status).toBe('running');
    expect(splitDocument).toHaveBeenCalledWith(
      'doc-1',
      'linear',
      {
        horizontalRule: true,
        headingLevels: ['h1', 'h2'],
        customStringEnabled: true,
        customString: 'CUT',
      },
      expect.objectContaining({
        onProgress: expect.any(Function),
        isCancellationRequested: expect.any(Function),
      }),
    );

    const options = splitDocument.mock.calls[0]?.[3] as {
      onProgress: (progress: {
        phase: 'scan';
        current: number;
        total: number;
        percentage: number;
        message: string;
        createdDocCount: number;
        createdCardCount: number;
      }) => void;
    };
    options.onProgress({
      phase: 'scan',
      current: 1,
      total: 1,
      percentage: 15,
      message: 'Source blocks scanned',
      createdDocCount: 0,
      createdCardCount: 0,
    });
    expect(dialogConfig.props?.progressState?.progress).toMatchObject({
      phase: 'scan',
      percentage: 15,
    });

    deferred.resolve({
      sessionId: 'session-1',
      pieceDocIds: ['piece-1', 'piece-2'],
    });
    await confirmPromise;

    expect(siyuanApi.pushMsg).toHaveBeenCalledWith('已创建 2 个线性 piece 子文档');
  });

  it('passes nonlinear mode through the same dialog entrypoint', async () => {
    const { dialogManager, splitDocument, siyuanApi } = createDialogManager();

    await dialogManager.openProgressiveSplitDialog('doc-1', 'nonlinear');

    const dialogConfig = vi.mocked(createVueDialog).mock.calls[0]?.[0] as {
      events?: { confirm?: (config: unknown) => Promise<void> };
    };

    await dialogConfig.events?.confirm?.({
      horizontalRule: true,
      headingLevels: ['h3ToH6'],
      customStringEnabled: false,
      customString: '',
    });

    expect(splitDocument).toHaveBeenCalledWith(
      'doc-1',
      'nonlinear',
      {
        horizontalRule: true,
        headingLevels: ['h3ToH6'],
        customStringEnabled: false,
        customString: '',
      },
      expect.objectContaining({
        onProgress: expect.any(Function),
        isCancellationRequested: expect.any(Function),
      }),
    );
    expect(siyuanApi.pushMsg).toHaveBeenCalledWith('已创建 2 个非线性 piece 子文档');
  });

  it('turns running cancel into a cancellation request and reports cancellation cleanup warnings', async () => {
    const { dialogManager, splitDocument, siyuanApi } = createDialogManager();
    const deferred = createDeferred<never>();
    splitDocument.mockImplementation(async (...args: unknown[]) => {
      void args;
      return deferred.promise;
    });

    await dialogManager.openProgressiveSplitDialog('doc-1', 'linear');

    const dialogConfig = vi.mocked(createVueDialog).mock.calls[0]?.[0] as {
      props?: {
        progressState?: {
          status: 'config' | 'running' | 'cancelling';
        };
      };
      events?: {
        confirm?: (config: unknown) => Promise<void>;
        cancel?: () => Promise<void>;
      };
    };

    const confirmPromise = dialogConfig.events?.confirm?.({
      horizontalRule: true,
      headingLevels: ['h1'],
      customStringEnabled: false,
      customString: '',
    });
    await Promise.resolve();

    const options = splitDocument.mock.calls[0]?.[3] as {
      isCancellationRequested: () => boolean;
    };
    expect(options.isCancellationRequested()).toBe(false);

    await dialogConfig.events?.cancel?.();

    expect(options.isCancellationRequested()).toBe(true);
    expect(dialogConfig.props?.progressState?.status).toBe('cancelling');
    expect(siyuanApi.pushMsg).not.toHaveBeenCalled();

    deferred.reject(new ProgressiveSplitCancelledError('Split cancelled', true));
    await confirmPromise;

    expect(siyuanApi.pushMsg).toHaveBeenCalledWith('已取消 Split\n部分已创建内容可能保留');
  });

  it('blocks confirmation when custom string is enabled but blank', async () => {
    const { dialogManager, splitDocument, siyuanApi } = createDialogManager();

    await dialogManager.openProgressiveSplitDialog('doc-1', 'linear');

    const dialogConfig = vi.mocked(createVueDialog).mock.calls[0]?.[0] as {
      events?: { confirm?: (config: unknown) => Promise<void> };
    };

    await dialogConfig.events?.confirm?.({
      horizontalRule: false,
      headingLevels: [],
      customStringEnabled: true,
      customString: '   ',
    });

    expect(splitDocument).not.toHaveBeenCalled();
    expect(siyuanApi.pushErrMsg).toHaveBeenCalledWith('请输入自定义切割字符串');
  });

  it('routes non-cancel split errors to the failure toast', async () => {
    const { dialogManager, splitDocument, siyuanApi } = createDialogManager();
    splitDocument.mockRejectedValueOnce(new Error('boom'));

    await dialogManager.openProgressiveSplitDialog('doc-1', 'linear');

    const dialogConfig = vi.mocked(createVueDialog).mock.calls[0]?.[0] as {
      events?: { confirm?: (config: unknown) => Promise<void> };
    };

    await dialogConfig.events?.confirm?.({
      horizontalRule: true,
      headingLevels: ['h1'],
      customStringEnabled: false,
      customString: '',
    });

    expect(siyuanApi.pushErrMsg).toHaveBeenCalledWith('Split 失败：boom');
  });

  it('cancels from config mode without calling the progressive reading service', async () => {
    const { dialogManager, splitDocument, siyuanApi } = createDialogManager();

    await dialogManager.openProgressiveSplitDialog('doc-1', 'linear');

    const dialogConfig = vi.mocked(createVueDialog).mock.calls[0]?.[0] as {
      events?: { cancel?: () => Promise<void> };
    };

    await dialogConfig.events?.cancel?.();

    expect(splitDocument).not.toHaveBeenCalled();
    expect(siyuanApi.pushMsg).toHaveBeenCalledWith('已取消 Split');
  });
});
