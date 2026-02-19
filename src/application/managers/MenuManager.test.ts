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
}));

describe('MenuManager', () => {
  let menuManager: MenuManager;
  let mockContext: ApplicationContext;
  let mockPlugin: Plugin;
  let mockI18n: Record<string, any>;
  
  beforeEach(() => {
    // Mock ApplicationContext
    mockContext = {
      getStorage: vi.fn().mockReturnValue({
        getAllCards: vi.fn().mockReturnValue([
          { id: 'card1' },
          { id: 'card2' },
          { id: 'card3' },
        ]),
      }),
      getScheduler: vi.fn().mockReturnValue({
        getScheduleInfo: vi.fn().mockImplementation((cardId) => {
          if (cardId === 'card1') {
            return { due: new Date(Date.now() - 1000).toISOString() }; // 过期
          }
          return { due: new Date(Date.now() + 1000).toISOString() }; // 未过期
        }),
      }),
      getDialogManager: vi.fn().mockReturnValue({
        openBrowserDialog: vi.fn(),
        openSettingsDialog: vi.fn(),
      }),
    } as any;
    
    // Mock Plugin
    mockPlugin = {
      reviewDialogManager: {
        openRetrievalPractice: vi.fn(),
        openIncrementalLearning: vi.fn(),
        openFinalDrill: vi.fn(),
        openNeuralRoam: vi.fn(),
        openFilterGroupPractice: vi.fn(),
      },
    } as any;
    
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
    
    menuManager = new MenuManager(mockContext, mockPlugin, mockI18n);
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
    it('应该打开顶栏菜单', () => {
      const mockEvent = {
        currentTarget: {
          getBoundingClientRect: vi.fn().mockReturnValue({
            right: 100,
            bottom: 50,
          }),
        },
      } as any;
      
      // 不会抛出错误
      expect(() => menuManager.openTopBarMenu(mockEvent)).not.toThrow();
    });
    
    it('应该在没有 rect 时使用鼠标坐标', () => {
      const mockEvent = {
        clientX: 100,
        clientY: 50,
      } as any;
      
      // 不会抛出错误
      expect(() => menuManager.openTopBarMenu(mockEvent)).not.toThrow();
    });
  });
  
  describe('dispose', () => {
    it('应该成功销毁', () => {
      expect(() => menuManager.dispose()).not.toThrow();
    });
  });
});
