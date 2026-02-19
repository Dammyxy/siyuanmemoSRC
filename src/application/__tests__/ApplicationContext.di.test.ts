/**
 * ApplicationContext 依赖注入测试
 * 
 * 验证依赖注入配置是否正确：
 * 1. 服务工厂注册正确
 * 2. 依赖链完整：ApplicationContext → CardApplicationService → UseCases → Domain Services → Repository
 * 3. 懒加载工作正常
 * 4. 服务可以通过 ApplicationContext 访问
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApplicationContext } from '../ApplicationContext';
import type { Plugin } from 'siyuan';

describe('ApplicationContext - 依赖注入配置', () => {
  let context: ApplicationContext;
  let mockPlugin: Plugin;

  beforeEach(async () => {
    // 创建 mock plugin
    mockPlugin = {
      name: 'test-plugin',
      data: {},
      app: {},
    } as any;

    // 创建 ApplicationContext
    context = await ApplicationContext.create({
      plugin: mockPlugin,
      i18n: {},
    });
  });

  afterEach(async () => {
    if (context && !context.isDisposed()) {
      await context.dispose();
    }
  });

  describe('服务工厂注册', () => {
    it('应该注册 cardService 工厂', () => {
      expect(context.hasService('cardService')).toBe(true);
    });

    it('应该注册 dialogManager 工厂', () => {
      expect(context.hasService('dialogManager')).toBe(true);
    });

    it('应该注册 menuManager 工厂', () => {
      expect(context.hasService('menuManager')).toBe(true);
    });

    it('应该注册 tabManager 工厂', () => {
      expect(context.hasService('tabManager')).toBe(true);
    });
  });

  describe('懒加载', () => {
    it('服务在首次访问前不应该被创建', () => {
      // cardService 还未被访问，不应该被创建
      expect(context.isServiceCreated('cardService')).toBe(false);
    });

    it('服务在首次访问时应该被创建', () => {
      // 访问 cardService
      const cardService = context.getCardService();
      
      // 现在应该被创建了
      expect(context.isServiceCreated('cardService')).toBe(true);
      expect(cardService).toBeDefined();
    });

    it('多次访问应该返回同一个实例', () => {
      const service1 = context.getCardService();
      const service2 = context.getCardService();
      
      expect(service1).toBe(service2);
    });
  });

  describe('依赖链完整性', () => {
    it('CardApplicationService 应该可以通过 ApplicationContext 访问', () => {
      const cardService = context.getCardService();
      
      expect(cardService).toBeDefined();
      expect(cardService.createCard).toBeDefined();
      expect(cardService.deleteCard).toBeDefined();
      expect(cardService.updateCard).toBeDefined();
    });

    it('CardApplicationService 应该包含所有必需的用例', () => {
      const cardService = context.getCardService();
      
      // 验证服务有正确的方法
      expect(typeof cardService.createCard).toBe('function');
      expect(typeof cardService.deleteCard).toBe('function');
      expect(typeof cardService.updateCard).toBe('function');
    });

    it('依赖链应该正确构建：ApplicationContext → CardApplicationService → UseCases', () => {
      // 获取 CardApplicationService
      const cardService = context.getCardService();
      expect(cardService).toBeDefined();

      // CardApplicationService 内部应该有用例（通过私有字段注入）
      // 我们通过调用方法来验证用例存在
      expect(cardService.createCard).toBeDefined();
      expect(cardService.deleteCard).toBeDefined();
      expect(cardService.updateCard).toBeDefined();
    });
  });

  describe('服务访问', () => {
    it('应该能够获取核心服务', () => {
      expect(context.getStorage()).toBeDefined();
      expect(context.getScheduler()).toBeDefined();
      expect(context.getUnifiedDataSourceManager()).toBeDefined();
    });

    it('应该能够获取 UI 管理器', () => {
      expect(context.getDialogManager()).toBeDefined();
      expect(context.getMenuManager()).toBeDefined();
      expect(context.getTabManager()).toBeDefined();
    });

    it('应该能够获取应用服务', () => {
      expect(context.getCardService()).toBeDefined();
    });

    it('应该能够获取配置', () => {
      expect(context.getPlugin()).toBe(mockPlugin);
      expect(context.getI18n()).toBeDefined();
    });
  });

  describe('错误处理', () => {
    it('访问未注册的服务应该抛出错误', () => {
      expect(() => {
        context.getService('nonExistentService');
      }).toThrow("Service 'nonExistentService' is not registered");
    });

    it('销毁后访问服务应该抛出错误', async () => {
      await context.dispose();
      
      expect(() => {
        context.getPlugin();
      }).toThrow('ApplicationContext has been disposed');
    });
  });

  describe('生命周期', () => {
    it('新创建的上下文不应该被标记为已销毁', () => {
      expect(context.isDisposed()).toBe(false);
    });

    it('dispose 后应该被标记为已销毁', async () => {
      await context.dispose();
      expect(context.isDisposed()).toBe(true);
    });

    it('dispose 应该是幂等的', async () => {
      await context.dispose();
      await context.dispose(); // 第二次调用不应该抛出错误
      expect(context.isDisposed()).toBe(true);
    });
  });
});
