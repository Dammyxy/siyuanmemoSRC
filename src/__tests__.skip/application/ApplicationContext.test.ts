/**
 * ApplicationContext 单元测试
 * 
 * 测试服务容器功能：
 * - 服务注册和获取
 * - 懒加载
 * - 生命周期管理
 */

import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest';
import { ApplicationContext } from './ApplicationContext';
import type { Plugin } from 'siyuan';

// Mock the SiYuan API module
vi.mock('@/core/siyuan/api', () => ({
  putFile: vi.fn().mockResolvedValue({ code: 0 }),
  getFile: vi.fn().mockResolvedValue({ code: 0, data: null }),
  getPluginDataPath: vi.fn().mockReturnValue('/mock/plugin/data/path'),
  readDir: vi.fn().mockResolvedValue({ code: 0, data: [] }),
}));

// Mock Plugin
const createMockPlugin = (): Plugin => {
  return {
    name: 'test-plugin',
    i18n: {},
    data: {},
    // Add other required Plugin properties as needed
  } as unknown as Plugin;
};

describe('ApplicationContext - 服务容器', () => {
  let context: ApplicationContext;
  let mockPlugin: Plugin;

  beforeEach(async () => {
    mockPlugin = createMockPlugin();
    context = await ApplicationContext.create({
      plugin: mockPlugin,
      i18n: { test: 'test' }
    });
  });

  describe('核心服务访问', () => {
    it('应该能够获取存储管理器', () => {
      const storage = context.getStorage();
      expect(storage).toBeDefined();
      expect(storage).toBe(context.getStorage()); // 应该返回同一个实例
    });

    it('应该能够获取调度器路由', () => {
      const scheduler = context.getScheduler();
      expect(scheduler).toBeDefined();
      expect(scheduler).toBe(context.getScheduler()); // 应该返回同一个实例
    });

    it('应该能够获取统一数据源管理器', () => {
      const dataSource = context.getUnifiedDataSourceManager();
      expect(dataSource).toBeDefined();
      expect(dataSource).toBe(context.getUnifiedDataSourceManager()); // 应该返回同一个实例
    });

    it('应该能够获取插件实例', () => {
      const plugin = context.getPlugin();
      expect(plugin).toBe(mockPlugin);
    });

    it('应该能够获取国际化资源', () => {
      const i18n = context.getI18n();
      expect(i18n).toEqual({ test: 'test' });
    });
  });

  describe('依赖注入', () => {
    // 模拟服务类
    class MockServiceA {
      constructor(public name: string) {}
    }

    class MockServiceB {
      constructor(
        public serviceA: MockServiceA,
        public storage: any
      ) {}
    }

    it('应该支持通过工厂函数注册服务', () => {
      context.registerServiceFactory('mockServiceA', () => {
        return new MockServiceA('Service A');
      });

      expect(context.hasService('mockServiceA')).toBe(true);
      expect(context.isServiceCreated('mockServiceA')).toBe(false);
    });

    it('应该支持懒加载创建服务', () => {
      context.registerServiceFactory('mockServiceA', () => {
        return new MockServiceA('Service A');
      });

      // 服务尚未创建
      expect(context.isServiceCreated('mockServiceA')).toBe(false);

      // 第一次访问时创建
      const service = context.getService<MockServiceA>('mockServiceA');
      expect(service).toBeInstanceOf(MockServiceA);
      expect(service.name).toBe('Service A');

      // 服务已创建
      expect(context.isServiceCreated('mockServiceA')).toBe(true);

      // 再次访问返回同一实例
      const service2 = context.getService<MockServiceA>('mockServiceA');
      expect(service2).toBe(service);
    });

    it('应该支持通过 context 注入依赖', () => {
      // 注册服务 A
      context.registerServiceFactory('mockServiceA', () => {
        return new MockServiceA('Service A');
      });

      // 注册服务 B，依赖服务 A 和 storage
      context.registerServiceFactory('mockServiceB', (ctx) => {
        const serviceA = ctx.getService<MockServiceA>('mockServiceA');
        const storage = ctx.getStorage();
        return new MockServiceB(serviceA, storage);
      });

      // 获取服务 B
      const serviceB = context.getService<MockServiceB>('mockServiceB');
      
      // 验证依赖注入
      expect(serviceB).toBeInstanceOf(MockServiceB);
      expect(serviceB.serviceA).toBeInstanceOf(MockServiceA);
      expect(serviceB.serviceA.name).toBe('Service A');
      expect(serviceB.storage).toBe(context.getStorage());
    });

    it('应该支持服务之间的依赖自动注入', () => {
      // 创建依赖链: C -> B -> A
      context.registerServiceFactory('mockServiceA', () => {
        return new MockServiceA('Service A');
      });

      context.registerServiceFactory('mockServiceB', (ctx) => {
        const serviceA = ctx.getService<MockServiceA>('mockServiceA');
        return new MockServiceB(serviceA, ctx.getStorage());
      });

      class MockServiceC {
        constructor(public serviceB: MockServiceB) {}
      }

      context.registerServiceFactory('mockServiceC', (ctx) => {
        const serviceB = ctx.getService<MockServiceB>('mockServiceB');
        return new MockServiceC(serviceB);
      });

      // 获取服务 C，应该自动创建 B 和 A
      const serviceC = context.getService<MockServiceC>('mockServiceC');
      
      expect(serviceC).toBeInstanceOf(MockServiceC);
      expect(serviceC.serviceB).toBeInstanceOf(MockServiceB);
      expect(serviceC.serviceB.serviceA).toBeInstanceOf(MockServiceA);
      
      // 验证所有服务都已创建
      expect(context.isServiceCreated('mockServiceA')).toBe(true);
      expect(context.isServiceCreated('mockServiceB')).toBe(true);
      expect(context.isServiceCreated('mockServiceC')).toBe(true);
    });

    it('应该在获取未注册的服务时抛出错误', () => {
      expect(() => {
        context.getService('nonexistent');
      }).toThrow("Service 'nonexistent' is not registered in the service container");
    });

    it('应该支持工厂函数访问 plugin 和 i18n', () => {
      class MockServiceWithConfig {
        constructor(
          public plugin: Plugin,
          public i18n: Record<string, any>
        ) {}
      }

      context.registerServiceFactory('mockServiceWithConfig', (ctx) => {
        return new MockServiceWithConfig(ctx.getPlugin(), ctx.getI18n());
      });

      const service = context.getService<MockServiceWithConfig>('mockServiceWithConfig');
      
      expect(service.plugin).toBe(mockPlugin);
      expect(service.i18n).toEqual({ test: 'test' });
    });
  });

  describe('服务容器功能', () => {
    it('应该检查服务是否已注册', () => {
      expect(context.hasService('storage')).toBe(true);
      expect(context.hasService('scheduler')).toBe(true);
      expect(context.hasService('unifiedDataSource')).toBe(true);
      expect(context.hasService('nonexistent')).toBe(false);
    });

    it('应该检查服务是否已创建', () => {
      // 核心服务在创建时就已经实例化
      expect(context.isServiceCreated('storage')).toBe(true);
      expect(context.isServiceCreated('scheduler')).toBe(true);
      expect(context.isServiceCreated('unifiedDataSource')).toBe(true);
    });

    it('应该在销毁后抛出错误', async () => {
      await context.dispose();
      
      expect(() => context.getStorage()).toThrow('ApplicationContext has been disposed');
      expect(() => context.getScheduler()).toThrow('ApplicationContext has been disposed');
      expect(() => context.getPlugin()).toThrow('ApplicationContext has been disposed');
    });
  });

  describe('生命周期管理', () => {
    it('应该正确标记销毁状态', async () => {
      expect(context.isDisposed()).toBe(false);
      
      await context.dispose();
      
      expect(context.isDisposed()).toBe(true);
    });

    it('应该允许多次调用 dispose', async () => {
      await context.dispose();
      await context.dispose(); // 不应该抛出错误
      
      expect(context.isDisposed()).toBe(true);
    });

    it('应该在销毁时调用服务的 dispose 方法', async () => {
      // 创建一个带有 dispose 方法的模拟服务
      let disposeCalled = false;
      class MockDisposableService {
        async dispose() {
          disposeCalled = true;
        }
      }

      // 注册并创建服务
      context.registerServiceFactory('disposableService', () => {
        return new MockDisposableService();
      });
      
      // 触发服务创建
      context.getService('disposableService');
      
      // 销毁上下文
      await context.dispose();
      
      // 验证 dispose 被调用
      expect(disposeCalled).toBe(true);
    });

    it('应该按逆序销毁服务', async () => {
      // 创建多个服务，记录销毁顺序
      const disposeOrder: string[] = [];
      
      class ServiceA {
        async dispose() {
          disposeOrder.push('A');
        }
      }
      
      class ServiceB {
        async dispose() {
          disposeOrder.push('B');
        }
      }
      
      class ServiceC {
        async dispose() {
          disposeOrder.push('C');
        }
      }

      // 注册服务
      context.registerServiceFactory('serviceA', () => new ServiceA());
      context.registerServiceFactory('serviceB', () => new ServiceB());
      context.registerServiceFactory('serviceC', () => new ServiceC());
      
      // 按顺序创建服务：A -> B -> C
      context.getService('serviceA');
      context.getService('serviceB');
      context.getService('serviceC');
      
      // 销毁上下文
      await context.dispose();
      
      // 验证销毁顺序是逆序：C -> B -> A（核心服务在前）
      // 注意：核心服务（storage, scheduler, unifiedDataSource）会先被销毁
      // 所以我们只检查自定义服务的相对顺序
      const customServiceOrder = disposeOrder.filter(s => ['A', 'B', 'C'].includes(s));
      expect(customServiceOrder).toEqual(['C', 'B', 'A']);
    });

    it('应该在单个服务销毁失败时继续销毁其他服务', async () => {
      const disposeOrder: string[] = [];
      
      class ServiceA {
        async dispose() {
          disposeOrder.push('A');
        }
      }
      
      class ServiceB {
        async dispose() {
          disposeOrder.push('B');
          throw new Error('Service B disposal failed');
        }
      }
      
      class ServiceC {
        async dispose() {
          disposeOrder.push('C');
        }
      }

      // 注册服务
      context.registerServiceFactory('serviceA', () => new ServiceA());
      context.registerServiceFactory('serviceB', () => new ServiceB());
      context.registerServiceFactory('serviceC', () => new ServiceC());
      
      // 创建服务
      context.getService('serviceA');
      context.getService('serviceB');
      context.getService('serviceC');
      
      // 销毁上下文（不应该抛出错误）
      await expect(context.dispose()).resolves.not.toThrow();
      
      // 验证所有服务的 dispose 都被调用了
      const customServiceOrder = disposeOrder.filter(s => ['A', 'B', 'C'].includes(s));
      expect(customServiceOrder).toEqual(['C', 'B', 'A']);
    });
  });

  describe('工厂方法', () => {
    it('应该通过工厂方法创建上下文', async () => {
      const newContext = await ApplicationContext.create({
        plugin: mockPlugin,
        i18n: {}
      });
      
      expect(newContext).toBeInstanceOf(ApplicationContext);
      expect(newContext.isDisposed()).toBe(false);
      
      await newContext.dispose();
    });

    it('应该初始化所有核心服务', async () => {
      const newContext = await ApplicationContext.create({
        plugin: mockPlugin,
        i18n: {}
      });
      
      expect(newContext.getStorage()).toBeDefined();
      expect(newContext.getScheduler()).toBeDefined();
      expect(newContext.getUnifiedDataSourceManager()).toBeDefined();
      
      await newContext.dispose();
    });
  });

  describe('UI 管理器集成', () => {
    it('应该能够获取 DialogManager', async () => {
      const dialogManager = context.getDialogManager();
      
      expect(dialogManager).toBeDefined();
      expect(dialogManager).toHaveProperty('openSettingsDialog');
      expect(dialogManager).toHaveProperty('openBrowserDialog');
      expect(dialogManager).toHaveProperty('openReviewDialog');
    });

    it('DialogManager 应该是懒加载的', async () => {
      const newContext = await ApplicationContext.create({
        plugin: mockPlugin,
        i18n: {}
      });
      
      // 服务应该已注册但未创建
      expect(newContext.hasService('dialogManager')).toBe(true);
      expect(newContext.isServiceCreated('dialogManager')).toBe(false);
      
      // 第一次访问时创建
      const dialogManager = newContext.getDialogManager();
      expect(dialogManager).toBeDefined();
      expect(newContext.isServiceCreated('dialogManager')).toBe(true);
      
      // 第二次访问返回同一实例
      const dialogManager2 = newContext.getDialogManager();
      expect(dialogManager2).toBe(dialogManager);
      
      await newContext.dispose();
    });

    it('应该能够获取 MenuManager', async () => {
      const menuManager = context.getMenuManager();
      
      expect(menuManager).toBeDefined();
      expect(menuManager).toHaveProperty('openTopBarMenu');
      expect(menuManager).toHaveProperty('registerAll');
    });

    it('MenuManager 应该是懒加载的', async () => {
      const newContext = await ApplicationContext.create({
        plugin: mockPlugin,
        i18n: {}
      });
      
      // 服务应该已注册但未创建
      expect(newContext.hasService('menuManager')).toBe(true);
      expect(newContext.isServiceCreated('menuManager')).toBe(false);
      
      // 第一次访问时创建
      const menuManager = newContext.getMenuManager();
      expect(menuManager).toBeDefined();
      expect(newContext.isServiceCreated('menuManager')).toBe(true);
      
      // 第二次访问返回同一实例
      const menuManager2 = newContext.getMenuManager();
      expect(menuManager2).toBe(menuManager);
      
      await newContext.dispose();
    });
  });

  describe('DDD 重构服务集成', () => {
    it('应该能够获取 FileService', () => {
      const fileService = context.getFileService();
      
      expect(fileService).toBeDefined();
      expect(fileService).toHaveProperty('readFile');
      expect(fileService).toHaveProperty('writeFile');
      expect(fileService).toHaveProperty('readJSON');
      expect(fileService).toHaveProperty('writeJSON');
      expect(fileService).toHaveProperty('readMsgpack');
      expect(fileService).toHaveProperty('writeMsgpack');
    });

    it('FileService 应该是懒加载的', async () => {
      const newContext = await ApplicationContext.create({
        plugin: mockPlugin,
        i18n: {}
      });
      
      // 服务应该已注册但未创建
      expect(newContext.hasService('fileService')).toBe(true);
      expect(newContext.isServiceCreated('fileService')).toBe(false);
      
      // 第一次访问时创建
      const fileService = newContext.getFileService();
      expect(fileService).toBeDefined();
      expect(newContext.isServiceCreated('fileService')).toBe(true);
      
      // 第二次访问返回同一实例
      const fileService2 = newContext.getFileService();
      expect(fileService2).toBe(fileService);
      
      await newContext.dispose();
    });

    it('应该能够获取 QueuePersistenceService', () => {
      const queuePersistence = context.getQueuePersistenceService();
      
      expect(queuePersistence).toBeDefined();
      expect(queuePersistence).toHaveProperty('init');
      expect(queuePersistence).toHaveProperty('get');
      expect(queuePersistence).toHaveProperty('set');
      expect(queuePersistence).toHaveProperty('delete');
      expect(queuePersistence).toHaveProperty('keys');
      expect(queuePersistence).toHaveProperty('flush');
    });

    it('QueuePersistenceService 应该是懒加载的', async () => {
      const newContext = await ApplicationContext.create({
        plugin: mockPlugin,
        i18n: {}
      });
      
      // 服务应该已注册但未创建
      expect(newContext.hasService('queuePersistenceService')).toBe(true);
      expect(newContext.isServiceCreated('queuePersistenceService')).toBe(false);
      
      // 第一次访问时创建
      const queuePersistence = newContext.getQueuePersistenceService();
      expect(queuePersistence).toBeDefined();
      expect(newContext.isServiceCreated('queuePersistenceService')).toBe(true);
      
      // 第二次访问返回同一实例
      const queuePersistence2 = newContext.getQueuePersistenceService();
      expect(queuePersistence2).toBe(queuePersistence);
      
      await newContext.dispose();
    });

    it('应该能够获取 SettingsService', () => {
      const settingsService = context.getSettingsService();
      
      expect(settingsService).toBeDefined();
      expect(settingsService).toHaveProperty('init');
      expect(settingsService).toHaveProperty('getSettings');
      expect(settingsService).toHaveProperty('updateSettings');
      expect(settingsService).toHaveProperty('getRiffIntegrationConfig');
      expect(settingsService).toHaveProperty('updateRiffIntegrationConfig');
    });

    it('SettingsService 应该是懒加载的', async () => {
      const newContext = await ApplicationContext.create({
        plugin: mockPlugin,
        i18n: {}
      });
      
      // 服务应该已注册但未创建
      expect(newContext.hasService('settingsService')).toBe(true);
      expect(newContext.isServiceCreated('settingsService')).toBe(false);
      
      // 第一次访问时创建
      const settingsService = newContext.getSettingsService();
      expect(settingsService).toBeDefined();
      expect(newContext.isServiceCreated('settingsService')).toBe(true);
      
      // 第二次访问返回同一实例
      const settingsService2 = newContext.getSettingsService();
      expect(settingsService2).toBe(settingsService);
      
      await newContext.dispose();
    });

    it('应该能够获取 ReviewLogService', () => {
      const reviewLogService = context.getReviewLogService();
      
      expect(reviewLogService).toBeDefined();
      expect(reviewLogService).toHaveProperty('addReviewLog');
      expect(reviewLogService).toHaveProperty('addRescheduleLog');
      expect(reviewLogService).toHaveProperty('getReviewLogs');
      expect(reviewLogService).toHaveProperty('getAllReviewLogs');
    });

    it('ReviewLogService 应该是懒加载的', async () => {
      const newContext = await ApplicationContext.create({
        plugin: mockPlugin,
        i18n: {}
      });
      
      // 服务应该已注册但未创建
      expect(newContext.hasService('reviewLogService')).toBe(true);
      expect(newContext.isServiceCreated('reviewLogService')).toBe(false);
      
      // 第一次访问时创建
      const reviewLogService = newContext.getReviewLogService();
      expect(reviewLogService).toBeDefined();
      expect(newContext.isServiceCreated('reviewLogService')).toBe(true);
      
      // 第二次访问返回同一实例
      const reviewLogService2 = newContext.getReviewLogService();
      expect(reviewLogService2).toBe(reviewLogService);
      
      await newContext.dispose();
    });

    it('应该能够获取 RiffBlacklistService', () => {
      const riffBlacklistService = context.getRiffBlacklistService();
      
      expect(riffBlacklistService).toBeDefined();
      expect(riffBlacklistService).toHaveProperty('init');
      expect(riffBlacklistService).toHaveProperty('addToBlacklist');
      expect(riffBlacklistService).toHaveProperty('removeFromBlacklist');
      expect(riffBlacklistService).toHaveProperty('isInBlacklist');
      expect(riffBlacklistService).toHaveProperty('getBlacklist');
      expect(riffBlacklistService).toHaveProperty('clearBlacklist');
    });

    it('RiffBlacklistService 应该是懒加载的', async () => {
      const newContext = await ApplicationContext.create({
        plugin: mockPlugin,
        i18n: {}
      });
      
      // 服务应该已注册但未创建
      expect(newContext.hasService('riffBlacklistService')).toBe(true);
      expect(newContext.isServiceCreated('riffBlacklistService')).toBe(false);
      
      // 第一次访问时创建
      const riffBlacklistService = newContext.getRiffBlacklistService();
      expect(riffBlacklistService).toBeDefined();
      expect(newContext.isServiceCreated('riffBlacklistService')).toBe(true);
      
      // 第二次访问返回同一实例
      const riffBlacklistService2 = newContext.getRiffBlacklistService();
      expect(riffBlacklistService2).toBe(riffBlacklistService);
      
      await newContext.dispose();
    });

    it('DDD 服务应该正确处理依赖注入', () => {
      // FileService 不依赖其他服务
      const fileService = context.getFileService();
      expect(fileService).toBeDefined();
      
      // QueuePersistenceService 依赖 FileService
      const queuePersistence = context.getQueuePersistenceService();
      expect(queuePersistence).toBeDefined();
      
      // SettingsService 依赖 FileService
      const settingsService = context.getSettingsService();
      expect(settingsService).toBeDefined();
      
      // ReviewLogService 依赖 FileService
      const reviewLogService = context.getReviewLogService();
      expect(reviewLogService).toBeDefined();
      
      // RiffBlacklistService 依赖 FileService
      const riffBlacklistService = context.getRiffBlacklistService();
      expect(riffBlacklistService).toBeDefined();
      
      // 验证所有服务都已创建
      expect(context.isServiceCreated('fileService')).toBe(true);
      expect(context.isServiceCreated('queuePersistenceService')).toBe(true);
      expect(context.isServiceCreated('settingsService')).toBe(true);
      expect(context.isServiceCreated('reviewLogService')).toBe(true);
      expect(context.isServiceCreated('riffBlacklistService')).toBe(true);
    });
  });
});
