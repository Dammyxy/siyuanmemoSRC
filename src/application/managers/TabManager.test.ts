/**
 * TabManager 单元测试
 * 
 * 测试 TabManager 的核心功能：
 * - Tab 注册
 * - Tab 打开
 * - 生命周期管理
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TabManager } from './TabManager';
import type { ApplicationContext } from '../ApplicationContext';
import type { Plugin } from 'siyuan';

// Mock siyuan module
vi.mock('siyuan', () => ({
  openTab: vi.fn(),
}));

// Mock vue module
vi.mock('vue', () => ({
  createApp: vi.fn(() => ({
    mount: vi.fn(),
    unmount: vi.fn(),
  })),
}));

// Mock Vue components
vi.mock('@/ui/browser/SRSBrowser.vue', () => ({
  default: {},
}));

vi.mock('@/ui/review/v2', () => ({
  ReviewView: {},
}));

describe('TabManager', () => {
  let tabManager: TabManager;
  let mockContext: ApplicationContext;
  let mockPlugin: Plugin;

  beforeEach(() => {
    // 创建 mock 对象
    mockContext = {
      getI18n: vi.fn(() => ({
        srsBrowser: 'SRS Browser',
      })),
    } as any;

    mockPlugin = {
      name: 'test-plugin',
      app: {} as any,
      addTab: vi.fn(),
    } as any;

    // 创建 TabManager 实例
    tabManager = new TabManager(mockContext, mockPlugin);
  });

  // ========================================================================
  // 构造函数测试
  // ========================================================================

  describe('constructor', () => {
    it('应该正确初始化', () => {
      expect(tabManager).toBeDefined();
      expect(tabManager).toBeInstanceOf(TabManager);
    });
  });

  // ========================================================================
  // registerAll 测试
  // ========================================================================

  describe('registerAll', () => {
    it('应该注册所有 Tab', () => {
      tabManager.registerAll();

      // 验证 addTab 被调用了 2 次（浏览器 Tab + 复习 Tab）
      expect(mockPlugin.addTab).toHaveBeenCalledTimes(2);
    });

    it('应该注册浏览器 Tab', () => {
      tabManager.registerAll();

      // 验证第一次调用是注册浏览器 Tab
      const firstCall = (mockPlugin.addTab as any).mock.calls[0][0];
      expect(firstCall.type).toBe('test-plugin-browser');
      expect(firstCall.init).toBeDefined();
      expect(firstCall.destroy).toBeDefined();
    });

    it('应该注册复习 Tab', () => {
      tabManager.registerAll();

      // 验证第二次调用是注册复习 Tab
      const secondCall = (mockPlugin.addTab as any).mock.calls[1][0];
      expect(secondCall.type).toBe('test-plugin-review');
      expect(secondCall.init).toBeDefined();
      expect(secondCall.destroy).toBeDefined();
    });
  });

  // ========================================================================
  // openBrowserTab 测试
  // ========================================================================

  describe('openBrowserTab', () => {
    it('应该打开浏览器 Tab', async () => {
      const { openTab } = await import('siyuan');
      vi.clearAllMocks(); // 清除之前的调用记录

      tabManager.openBrowserTab();

      // 验证 openTab 被调用
      expect(openTab).toHaveBeenCalledWith({
        app: mockPlugin.app,
        custom: {
          icon: 'iconCard',
          title: 'SRS Browser',
          id: 'test-plugintest-plugin-browser',
          data: {},
        },
        position: 'right',
      });
    });

    it('应该使用国际化标题', async () => {
      const { openTab } = await import('siyuan');
      vi.clearAllMocks(); // 清除之前的调用记录
      
      // 创建新的 TabManager 实例，使用新的 mock context
      const newMockContext = {
        getI18n: vi.fn(() => ({
          srsBrowser: '卡片浏览器',
        })),
      } as any;
      const newTabManager = new TabManager(newMockContext, mockPlugin);

      newTabManager.openBrowserTab();

      const callArgs = (openTab as any).mock.calls[0][0];
      expect(callArgs.custom.title).toBe('卡片浏览器');
    });

    it('应该使用默认标题（如果国际化不可用）', async () => {
      const { openTab } = await import('siyuan');
      vi.clearAllMocks(); // 清除之前的调用记录
      
      // 创建新的 TabManager 实例，使用新的 mock context
      const newMockContext = {
        getI18n: vi.fn(() => ({})),
      } as any;
      const newTabManager = new TabManager(newMockContext, mockPlugin);

      newTabManager.openBrowserTab();

      const callArgs = (openTab as any).mock.calls[0][0];
      expect(callArgs.custom.title).toBe('SRS 浏览器');
    });
  });

  // ========================================================================
  // openReviewTab 测试
  // ========================================================================

  describe('openReviewTab', () => {
    it('应该打开复习 Tab（provider 模式）', async () => {
      const { openTab } = await import('siyuan');
      const mockProvider = { id: 'test-provider' };
      const mockAdapter = {};

      tabManager.openReviewTab({
        provider: mockProvider,
        adapter: mockAdapter,
        title: 'Test Review',
      });

      // 验证 openTab 被调用
      expect(openTab).toHaveBeenCalledWith({
        app: mockPlugin.app,
        custom: {
          icon: 'iconSiyuanMemo',
          title: 'Test Review',
          id: 'test-plugintest-plugin-review',
          data: {
            providerId: 'test-provider',
            title: 'Test Review',
            queueType: null,
          },
        },
        position: 'right',
      });
    });

    it('应该打开复习 Tab（queue 模式）', async () => {
      const { openTab } = await import('siyuan');
      vi.clearAllMocks(); // 清除之前的调用记录
      
      const mockQueue = { getType: () => 'test-queue' };
      const mockAdapter = {};

      tabManager.openReviewTab({
        queue: mockQueue,
        adapter: mockAdapter,
        title: 'Queue Review',
      });

      // 验证 openTab 被调用
      const callArgs = (openTab as any).mock.calls[0][0];
      expect(callArgs.custom.data.providerId).toBe('queue-based');
      expect(callArgs.custom.data.queueType).toBe('test-queue');
    });

    it('应该使用默认 providerId（如果未提供）', async () => {
      const { openTab } = await import('siyuan');
      vi.clearAllMocks(); // 清除之前的调用记录
      
      const mockAdapter = {};

      tabManager.openReviewTab({
        adapter: mockAdapter,
        title: 'Default Review',
      });

      const callArgs = (openTab as any).mock.calls[0][0];
      expect(callArgs.custom.data.providerId).toBe('retrieval');
    });

    it('应该处理打开失败的情况', async () => {
      const { openTab } = await import('siyuan');
      (openTab as any).mockImplementationOnce(() => {
        throw new Error('Failed to open tab');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      tabManager.openReviewTab({
        adapter: {},
        title: 'Test',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[TabManager] Failed to open review tab:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  // ========================================================================
  // dispose 测试
  // ========================================================================

  describe('dispose', () => {
    it('应该可以调用 dispose', () => {
      expect(() => tabManager.dispose()).not.toThrow();
    });

    it('dispose 不应该抛出错误', () => {
      tabManager.dispose();
      // Tab 的生命周期由思源笔记管理，dispose 是空操作
      expect(true).toBe(true);
    });
  });
});
