/**
 * 服务访问集成测试
 * 
 * 验证 CardApplicationService 可以通过 ApplicationContext 正确访问：
 * 1. 服务在首次访问时正确创建（懒加载）
 * 2. 后续访问返回同一个实例（单例模式）
 * 3. 服务方法可以正常工作
 * 4. 错误处理正确（访问不存在的服务）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ApplicationContext } from '../ApplicationContext';
import type { Plugin } from 'siyuan';
import { CardApplicationService } from '../services/CardApplicationService';

describe('服务访问集成测试', () => {
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

  describe('懒加载验证', () => {
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
      expect(cardService).toBeInstanceOf(CardApplicationService);
    });

    it('服务创建后应该有正确的方法', () => {
      const cardService = context.getCardService();
      
      // 验证服务有所有必需的方法
      expect(typeof cardService.createCard).toBe('function');
      expect(typeof cardService.deleteCard).toBe('function');
      expect(typeof cardService.updateCard).toBe('function');
    });
  });

  describe('单例模式验证', () => {
    it('多次访问应该返回同一个实例', () => {
      const service1 = context.getCardService();
      const service2 = context.getCardService();
      const service3 = context.getCardService();
      
      // 所有引用应该指向同一个对象
      expect(service1).toBe(service2);
      expect(service2).toBe(service3);
    });

    it('单例实例应该在整个应用生命周期中保持一致', () => {
      // 第一次访问
      const firstAccess = context.getCardService();
      
      // 模拟一些操作后再次访问
      const secondAccess = context.getCardService();
      
      // 应该是同一个实例
      expect(firstAccess).toBe(secondAccess);
    });
  });

  describe('服务方法验证', () => {
    it('createCard 方法应该存在且可调用', async () => {
      const cardService = context.getCardService();
      
      // 验证方法存在
      expect(cardService.createCard).toBeDefined();
      
      // 调用方法（预期会失败，因为没有提供有效数据）
      const result = await cardService.createCard({
        blockId: 'test-block',
        templateId: 'basic',
        faces: [
          { question: 'Q', answer: 'A' }
        ],
      });
      
      // 应该返回 Result 对象
      expect(result).toBeDefined();
      expect(result).toHaveProperty('ok');
    });

    it('deleteCard 方法应该存在且可调用', async () => {
      const cardService = context.getCardService();
      
      // 验证方法存在
      expect(cardService.deleteCard).toBeDefined();
      
      // 调用方法（预期会失败，因为卡片不存在）
      const result = await cardService.deleteCard({
        cardId: 'non-existent-card',
      });
      
      // 应该返回 Result 对象
      expect(result).toBeDefined();
      expect(result).toHaveProperty('ok');
    });

    it('updateCard 方法应该存在且可调用', async () => {
      const cardService = context.getCardService();
      
      // 验证方法存在
      expect(cardService.updateCard).toBeDefined();
      
      // 调用方法（预期会失败，因为卡片不存在）
      const result = await cardService.updateCard({
        cardId: 'non-existent-card',
        xiuyuanId: 'non-existent-xiuyuan',
        faceIndex: 0,
      });
      
      // 应该返回 Result 对象
      expect(result).toBeDefined();
      expect(result).toHaveProperty('ok');
    });
  });

  describe('完整流程验证', () => {
    it('应该能够通过 ApplicationContext 完成完整的服务访问流程', () => {
      // 1. 验证服务未创建
      expect(context.isServiceCreated('cardService')).toBe(false);
      
      // 2. 首次访问，触发懒加载
      const cardService = context.getCardService();
      expect(context.isServiceCreated('cardService')).toBe(true);
      
      // 3. 验证服务实例
      expect(cardService).toBeDefined();
      expect(cardService).toBeInstanceOf(CardApplicationService);
      
      // 4. 验证服务方法
      expect(cardService.createCard).toBeDefined();
      expect(cardService.deleteCard).toBeDefined();
      expect(cardService.updateCard).toBeDefined();
      
      // 5. 再次访问，应该返回同一个实例
      const sameService = context.getCardService();
      expect(sameService).toBe(cardService);
    });

    it('应该能够同时访问多个服务', () => {
      // 访问多个服务
      const cardService = context.getCardService();
      const dialogManager = context.getDialogManager();
      const menuManager = context.getMenuManager();
      const tabManager = context.getTabManager();
      
      // 所有服务都应该被创建
      expect(cardService).toBeDefined();
      expect(dialogManager).toBeDefined();
      expect(menuManager).toBeDefined();
      expect(tabManager).toBeDefined();
      
      // 验证服务创建状态
      expect(context.isServiceCreated('cardService')).toBe(true);
      expect(context.isServiceCreated('dialogManager')).toBe(true);
      expect(context.isServiceCreated('menuManager')).toBe(true);
      expect(context.isServiceCreated('tabManager')).toBe(true);
    });
  });

  describe('错误处理验证', () => {
    it('访问不存在的服务应该抛出错误', () => {
      expect(() => {
        context.getService('nonExistentService');
      }).toThrow("Service 'nonExistentService' is not registered in the service container");
    });

    it('销毁后访问服务应该抛出错误', async () => {
      // 先访问服务
      const cardService = context.getCardService();
      expect(cardService).toBeDefined();
      
      // 销毁上下文
      await context.dispose();
      
      // 再次访问应该抛出错误
      expect(() => {
        context.getCardService();
      }).toThrow('ApplicationContext has been disposed');
    });

    it('销毁后访问核心服务也应该抛出错误', async () => {
      await context.dispose();
      
      expect(() => {
        context.getStorage();
      }).toThrow('ApplicationContext has been disposed');
      
      expect(() => {
        context.getPlugin();
      }).toThrow('ApplicationContext has been disposed');
    });
  });

  describe('服务注册验证', () => {
    it('应该能够检查服务是否已注册', () => {
      // 已注册的服务
      expect(context.hasService('cardService')).toBe(true);
      expect(context.hasService('dialogManager')).toBe(true);
      expect(context.hasService('menuManager')).toBe(true);
      expect(context.hasService('tabManager')).toBe(true);
      
      // 未注册的服务
      expect(context.hasService('nonExistentService')).toBe(false);
    });

    it('应该能够区分已注册和已创建的服务', () => {
      // cardService 已注册但未创建
      expect(context.hasService('cardService')).toBe(true);
      expect(context.isServiceCreated('cardService')).toBe(false);
      
      // 访问后应该被创建
      context.getCardService();
      expect(context.hasService('cardService')).toBe(true);
      expect(context.isServiceCreated('cardService')).toBe(true);
    });
  });

  describe('依赖注入验证', () => {
    it('服务应该能够访问 ApplicationContext 提供的依赖', () => {
      const cardService = context.getCardService();
      
      // CardApplicationService 内部依赖的用例应该已经被正确注入
      // 我们通过调用方法来验证依赖注入是否成功
      expect(cardService.createCard).toBeDefined();
      expect(cardService.deleteCard).toBeDefined();
      expect(cardService.updateCard).toBeDefined();
    });

    it('服务工厂应该接收 ApplicationContext 作为参数', () => {
      // 注册一个测试服务工厂
      let receivedContext: ApplicationContext | null = null;
      
      context.registerServiceFactory('testService', (ctx) => {
        receivedContext = ctx;
        return { name: 'test' };
      });
      
      // 访问服务
      const testService = context.getService('testService');
      
      // 验证工厂函数接收到了正确的上下文
      expect(receivedContext).toBe(context);
      expect(testService).toBeDefined();
      expect(testService.name).toBe('test');
    });
  });

  describe('生命周期验证', () => {
    it('新创建的上下文应该可以正常访问服务', () => {
      expect(context.isDisposed()).toBe(false);
      
      const cardService = context.getCardService();
      expect(cardService).toBeDefined();
    });

    it('dispose 后服务容器应该被清空', async () => {
      // 先创建一些服务
      context.getCardService();
      context.getDialogManager();
      
      expect(context.isServiceCreated('cardService')).toBe(true);
      expect(context.isServiceCreated('dialogManager')).toBe(true);
      
      // 销毁上下文
      await context.dispose();
      
      // 销毁后不应该能够访问服务
      expect(() => context.getCardService()).toThrow();
      expect(() => context.getDialogManager()).toThrow();
    });

    it('dispose 应该是幂等的', async () => {
      const cardService = context.getCardService();
      expect(cardService).toBeDefined();
      
      // 多次调用 dispose 不应该抛出错误
      await context.dispose();
      await context.dispose();
      await context.dispose();
      
      expect(context.isDisposed()).toBe(true);
    });
  });
});
