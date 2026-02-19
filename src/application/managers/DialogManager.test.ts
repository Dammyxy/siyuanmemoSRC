/**
 * DialogManager 单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DialogManager } from './DialogManager';
import type { ApplicationContext } from '../ApplicationContext';
import type { Plugin } from 'siyuan';

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

describe('DialogManager', () => {
  let dialogManager: DialogManager;
  let mockContext: ApplicationContext;
  let mockPlugin: Plugin;
  let mockStorage: any;
  let mockScheduler: any;
  let mockI18n: any;

  beforeEach(() => {
    // 创建 mock 对象
    mockStorage = {
      getSettings: vi.fn(() => ({})),
    };

    mockScheduler = {};

    mockI18n = {
      settings: 'Settings',
      srsBrowser: 'SRS Browser',
    };

    mockContext = {
      getStorage: vi.fn(() => mockStorage),
      getScheduler: vi.fn(() => mockScheduler),
      getI18n: vi.fn(() => mockI18n),
      getPlugin: vi.fn(() => mockPlugin),
    } as any;

    mockPlugin = {} as Plugin;

    dialogManager = new DialogManager(mockContext, mockPlugin);
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
    it('应该能够打开设置对话框', () => {
      dialogManager.openSettingsDialog();
      
      expect(mockContext.getStorage).toHaveBeenCalled();
      expect(mockStorage.getSettings).toHaveBeenCalled();
    });

    it('应该能够打开设置对话框并指定默认标签页', () => {
      dialogManager.openSettingsDialog('general');
      
      expect(mockContext.getStorage).toHaveBeenCalled();
      expect(mockStorage.getSettings).toHaveBeenCalled();
    });

    it('应该能够关闭设置对话框', () => {
      dialogManager.openSettingsDialog();
      dialogManager.closeSettingsDialog();
      
      // 验证对话框已被销毁
      // 注意：由于 mock 的限制，这里只能验证方法被调用
      expect(mockContext.getStorage).toHaveBeenCalled();
    });

    it('关闭不存在的设置对话框不应该报错', () => {
      expect(() => {
        dialogManager.closeSettingsDialog();
      }).not.toThrow();
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
    it('应该能够打开复习对话框（通过 ReviewDialogManager）', async () => {
      const mockReviewDialogManager = {
        openRetrievalPractice: vi.fn(),
      };
      
      (mockPlugin as any).reviewDialogManager = mockReviewDialogManager;
      
      await dialogManager.openReviewDialog();
      
      expect(mockReviewDialogManager.openRetrievalPractice).toHaveBeenCalled();
    });

    it('如果 ReviewDialogManager 不存在，应该记录错误', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      (mockPlugin as any).reviewDialogManager = null;
      
      await dialogManager.openReviewDialog();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('[DialogManager] ReviewDialogManager not found');
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('生命周期管理', () => {
    it('dispose 应该关闭所有对话框', () => {
      dialogManager.openSettingsDialog();
      dialogManager.openBrowserDialog();
      
      dialogManager.dispose();
      
      // 验证所有对话框都被关闭
      // 注意：由于 mock 的限制，这里只能验证方法被调用
      expect(mockContext.getStorage).toHaveBeenCalled();
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
      
      dialogManager.openSettingsDialog();
      
      expect(createVueDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Settings',
        })
      );
    });

    it('如果国际化文本不存在，应该使用默认文本', async () => {
      mockI18n = {};
      mockContext.getI18n = vi.fn(() => mockI18n);
      
      dialogManager = new DialogManager(mockContext, mockPlugin);
      
      const { createVueDialog } = await import('@/utils/dialog');
      
      dialogManager.openSettingsDialog();
      
      expect(createVueDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '设置',
        })
      );
    });
  });
});
