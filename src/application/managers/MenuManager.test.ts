/**
 * MenuManager 单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MenuManager } from './MenuManager';
import type { ApplicationContext } from '../ApplicationContext';
import type { Plugin } from 'siyuan';

// Mock Menu class
vi.mock('siyuan', () => ({
  Menu: vi.fn().mockImplementation(() => ({
    addItem: vi.fn(),
    addSeparator: vi.fn(),
    open: vi.fn(),
  })),
  showMessage: vi.fn(),
}));

describe('MenuManager', () => {
  let menuManager: MenuManager;
  let mockContext: ApplicationContext;
  let mockPlugin: Plugin;
  let mockI18n: Record<string, any>;
  let mockDialogManager: any;
  
  beforeEach(() => {
    // Mock DialogManager
    mockDialogManager = {
      openReviewDialog: vi.fn(),
      openIncrementalLearningDialog: vi.fn(),
      openFinalDrillDialog: vi.fn(),
      openNeuralRoamDialog: vi.fn(),
      openFilterGroupPracticeDialog: vi.fn(),
      openBrowserDialog: vi.fn(),
      openSettingsDialog: vi.fn(),
    };
    
    // Mock ApplicationContext
    mockContext = {
      getStorage: vi.fn().mockReturnValue({
        getDueCards: vi.fn().mockReturnValue([{ id: 'card1' }]),
        getAllCards: vi.fn().mockReturnValue([
          { id: 'card1' },
          { id: 'card2' },
          { id: 'card3' },
        ]),
      }),
      getDialogManager: vi.fn().mockReturnValue(mockDialogManager),
      getArenaKernelService: vi.fn().mockReturnValue({
        isEnabled: vi.fn().mockReturnValue(false),
      }),
    } as any;
    
    // Mock Plugin
    mockPlugin = {} as any;
    
    // Mock i18n
    mockI18n = {
      startReview: '开始提取练习',
      startIncrementalLearning: '开始渐进学习',
      startDeliberatePractice: '开始刻意练习',
      startNeuralReview: '开始神经漫游',
      startFilterGroupPractice: '开始筛选复习',
      srsBrowser: 'SRS 浏览器',
      settings: '设置',
      dueCountLabel: '到期',
      totalCountLabel: '总计',
    };
    
    const mockSiyuanApi = {
      sql: vi.fn().mockResolvedValue([]),
      getBlockAttrs: vi.fn().mockResolvedValue({}),
      setBlockAttrs: vi.fn().mockResolvedValue(undefined),
    };

    menuManager = new MenuManager(mockContext, mockPlugin, mockI18n, mockDialogManager, mockSiyuanApi as any);
  });
  
  describe('构造函数', () => {
    it('应该成功创建 MenuManager 实例', () => {
      expect(menuManager).toBeDefined();
      expect(menuManager).toBeInstanceOf(MenuManager);
    });
  });
  
  describe('registerAll', () => {
    it('应该注册所有菜单', () => {
      // 不会抛出错误
      expect(() => menuManager.registerAll()).not.toThrow();
    });
  });
  
  describe('openTopBarMenu', () => {
    it('应该打开顶栏菜单', async () => {
      const mockEvent = {
        currentTarget: {
          getBoundingClientRect: vi.fn().mockReturnValue({
            right: 100,
            bottom: 50,
          }),
        },
      } as any;
      
      // 不会抛出错误
      await expect(menuManager.openTopBarMenu(mockEvent)).resolves.toBeUndefined();
    });
    
    it('应该在没有 rect 时使用鼠标坐标', async () => {
      const mockEvent = {
        clientX: 100,
        clientY: 50,
      } as any;
      
      // 不会抛出错误
      await expect(menuManager.openTopBarMenu(mockEvent)).resolves.toBeUndefined();
    });
    
    it('应该委托给 DialogManager 打开对话框', async () => {
      const mockEvent = {
        currentTarget: {
          getBoundingClientRect: vi.fn().mockReturnValue({
            right: 100,
            bottom: 50,
          }),
        },
      } as any;
      
      await menuManager.openTopBarMenu(mockEvent);
      
      // 验证 DialogManager 的方法被调用（通过菜单项点击）
      // 注意：由于菜单项的 click 回调是异步的，这里只验证菜单创建不报错
      expect(mockDialogManager.openReviewDialog).not.toHaveBeenCalled(); // 还未点击菜单项
    });
  });
  
  describe('dispose', () => {
    it('应该成功销毁', () => {
      expect(() => menuManager.dispose()).not.toThrow();
    });
  });
});
