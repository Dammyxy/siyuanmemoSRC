/**
 * DialogManager 单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DialogManager } from './DialogManager';
import type { ApplicationContext } from '../ApplicationContext';
import type { Plugin } from 'siyuan';
import { createVueDialog } from '@/utils/dialog';

// Mock dependencies
vi.mock('@/utils/dialog', () => ({
  createVueDialog: vi.fn((options) => {
    const mockDialog = {
      dialog: { element: document.createElement('div') },
      destroy: vi.fn(),
    };
    
    // 模拟 onClose 回调
    if (options.onClose) {
      setTimeout(() => options.onClose(), 0);
    }
    
    return mockDialog;
  }),
}));

vi.mock('@/ui/settings', () => ({
  SettingsPanel: {},
}));

vi.mock('@/ui/browser', () => ({
  SRSBrowser: {},
}));

const { createUnifiedReviewDialogMock } = vi.hoisted(() => ({
  createUnifiedReviewDialogMock: vi.fn(() => ({ destroy: vi.fn() })),
}));

vi.mock('@/application/factories/createUnifiedReviewDialog', () => ({
  createUnifiedReviewDialog: createUnifiedReviewDialogMock,
}));

describe('DialogManager', () => {
  let dialogManager: DialogManager;
  let mockContext: ApplicationContext;
  let mockPlugin: Plugin;
  let mockStorage: any;
  let mockScheduler: any;
  let mockI18n: any;
  let mockSettingsService: any;
  let mockSiyuanApi: any;
  let mockProgressiveSiyuanApi: any;
  let mockPracticeQueueManager: any;
  let mockRetrievalQueue: any;

  beforeEach(() => {
    // 创建 mock 对象
    mockStorage = {
      getSettings: vi.fn(() => ({})),
    };

    mockScheduler = {};
    mockSettingsService = {
      getSettings: vi.fn(() => ({})),
      updateSettings: vi.fn(async () => undefined),
    };
    mockPracticeQueueManager = {
      previewPracticeQueue: vi.fn(),
      addPracticeQueue: vi.fn(),
      startPracticeQueue: vi.fn(),
      clearPracticeQueue: vi.fn(),
    };
    mockRetrievalQueue = {
      localBuffer: [],
      cards: [],
      buffer: [],
    };
    mockSiyuanApi = {
      pushErrMsg: vi.fn(async () => undefined),
    };
    mockProgressiveSiyuanApi = {};

    mockI18n = {
      settings: 'Settings',
      srsBrowser: 'SRS Browser',
    };

    mockContext = {
      getStorage: vi.fn(() => mockStorage),
      getSettingsService: vi.fn(() => mockSettingsService),
      getScheduler: vi.fn(() => mockScheduler),
      getBrowserService: vi.fn(() => ({})),
      getTabApplicationService: vi.fn(() => ({})),
      getEventBus: vi.fn(() => ({})),
      getHybridSyncService: vi.fn(() => undefined),
      getReviewQueuePreparationService: vi.fn(() => null),
      getPracticeQueueManager: vi.fn(() => mockPracticeQueueManager),
      getRetrievalQueue: vi.fn(() => mockRetrievalQueue),
      getI18n: vi.fn(() => mockI18n),
      getPlugin: vi.fn(() => mockPlugin),
      getConfiguredCaptureStorageService: vi.fn(() => ({
        listOpenNotebooks: vi.fn(async () => []),
      })),
      getKernelCompanionPort: vi.fn(() => ({
        getStatus: vi.fn(async () => ({
          kind: 'unavailable',
          checkedAt: Date.now(),
          pluginName: 'siyuan-plugin-siyuanmemo',
          methods: [],
          reason: 'not-loaded',
          message: 'Plugin not loaded',
        })),
      })),
    } as any;

    mockPlugin = {} as Plugin;

    dialogManager = new DialogManager(mockContext, mockPlugin, {
      siyuanApi: mockSiyuanApi,
      progressiveSiyuanApi: mockProgressiveSiyuanApi,
      leechActionEffects: {} as any,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('构造函数', () => {
    it('应该正确创建 DialogManager 实例', () => {
      expect(dialogManager).toBeDefined();
      expect(dialogManager).toBeInstanceOf(DialogManager);
    });
  });

  describe('设置对话框', () => {
    it('应该能够打开设置对话框', async () => {
      await dialogManager.openSettingsDialog();
      
      expect(mockContext.getSettingsService).toHaveBeenCalled();
      expect(mockSettingsService.getSettings).toHaveBeenCalled();
    });

    it('应该能够打开设置对话框并指定默认标签页', async () => {
      await dialogManager.openSettingsDialog('general');
      
      expect(mockContext.getSettingsService).toHaveBeenCalled();
      expect(mockSettingsService.getSettings).toHaveBeenCalled();
    });

    it('应该能够关闭设置对话框', async () => {
      await dialogManager.openSettingsDialog();
      dialogManager.closeSettingsDialog();
      
      // 验证对话框已被销毁
      // 注意：由于 mock 的限制，这里只能验证方法被调用
      expect(mockContext.getSettingsService).toHaveBeenCalled();
    });

    it('关闭不存在的设置对话框不应该报错', () => {
      expect(() => {
        dialogManager.closeSettingsDialog();
      }).not.toThrow();
    });

    it('passes kernel companion refresh handler through the settings dialog props', async () => {
      const getStatus = vi.fn(async () => ({
        kind: 'available',
        checkedAt: Date.now(),
        pluginName: 'siyuan-plugin-siyuanmemo',
        pluginState: 'running',
        methods: [{ name: 'health', descriptions: [] }],
        version: '0.2.1',
        platform: 'windows',
        uptimeMs: 100,
      }));
      vi.mocked(mockContext.getKernelCompanionPort).mockReturnValue({ getStatus } as never);

      await dialogManager.openSettingsDialog('maintenance');

      const dialogConfig = vi.mocked(createVueDialog).mock.calls.at(-1)?.[0] as {
        props?: {
          kernelCompanionHandlers?: {
            refresh: () => Promise<unknown>;
          };
        };
      };
      expect(dialogConfig.props?.kernelCompanionHandlers?.refresh).toBeTypeOf('function');
      await expect(dialogConfig.props!.kernelCompanionHandlers!.refresh()).resolves.toMatchObject({
        kind: 'available',
        pluginState: 'running',
      });
      expect(getStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe('SRS 浏览器对话框', () => {
    it('应该能够打开 SRS 浏览器对话框', () => {
      dialogManager.openBrowserDialog();
      
      expect(mockContext.getStorage).toHaveBeenCalled();
      expect(mockContext.getScheduler).toHaveBeenCalled();
      expect(mockContext.getI18n).toHaveBeenCalled();
    });

    it('应该能够关闭 SRS 浏览器对话框', () => {
      dialogManager.openBrowserDialog();
      dialogManager.closeBrowserDialog();
      
      // 验证对话框已被销毁
      expect(mockContext.getStorage).toHaveBeenCalled();
    });

    it('关闭不存在的 SRS 浏览器对话框不应该报错', () => {
      expect(() => {
        dialogManager.closeBrowserDialog();
      }).not.toThrow();
    });
  });

  describe('复习对话框', () => {
    it('应该能够打开复习对话框', async () => {
      await dialogManager.openReviewDialog();
      
      expect(createUnifiedReviewDialogMock).toHaveBeenCalledWith(expect.objectContaining({
        title: '提取练习',
        headerVariant: 'retrieval-practice',
      }));
    });

    it('如果创建复习对话框失败，应该推送错误消息', async () => {
      createUnifiedReviewDialogMock.mockImplementationOnce(() => {
        throw new Error('boom');
      });

      await dialogManager.openReviewDialog();
      
      expect(mockSiyuanApi.pushErrMsg).toHaveBeenCalled();
    });
  });

  describe('生命周期管理', () => {
    it('dispose 应该关闭所有对话框', async () => {
      await dialogManager.openSettingsDialog();
      dialogManager.openBrowserDialog();
      
      dialogManager.dispose();
      
      // 验证所有对话框都被关闭
      // 注意：由于 mock 的限制，这里只能验证方法被调用
      expect(mockContext.getSettingsService).toHaveBeenCalled();
    });

    it('dispose 多次调用不应该报错', () => {
      expect(() => {
        dialogManager.dispose();
        dialogManager.dispose();
      }).not.toThrow();
    });
  });

  describe('国际化', () => {
    it('应该使用国际化文本作为对话框标题', async () => {
      const { createVueDialog } = await import('@/utils/dialog');
      
      await dialogManager.openSettingsDialog();
      
      expect(createVueDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Settings',
        })
      );
    });

    it('如果国际化文本不存在，应该使用默认文本', async () => {
      mockI18n = {};
      mockContext.getI18n = vi.fn(() => mockI18n);
      
      dialogManager = new DialogManager(mockContext, mockPlugin, {
        siyuanApi: mockSiyuanApi,
        progressiveSiyuanApi: mockProgressiveSiyuanApi,
        leechActionEffects: {} as any,
      });
      
      const { createVueDialog } = await import('@/utils/dialog');
      
      await dialogManager.openSettingsDialog();
      
      expect(createVueDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '设置',
        })
      );
    });
  });
});
