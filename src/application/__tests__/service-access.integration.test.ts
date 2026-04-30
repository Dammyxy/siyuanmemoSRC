/**
 * 服务访问集成测试
 * 
 * 验证 CardApplicationService 可以通过 ApplicationContext 正确访问：
 * 1. 服务可在启动预接或首次访问时正确创建
 * 2. 后续访问返回同一个实例（单例模式）
 * 3. 服务方法可以正常工作
 * 4. 错误处理正确（访问不存在的服务）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApplicationContext } from '../ApplicationContext';
import type { Plugin } from 'siyuan';
import { CardApplicationService } from '../services/CardApplicationService';
import { ReviewLogService } from '../services/ReviewLogService';
import { ReviewCommitUseCase } from '../usecases/review/ReviewCommitUseCase';

describe('服务访问集成测试', () => {
  let context: ApplicationContext;
  let mockPlugin: Plugin;

  beforeEach(async () => {
    // 创建 mock plugin
    mockPlugin = {
      name: 'test-plugin',
      data: {},
      app: {},
      loadData: vi.fn(async (fileName: string) => fileName === 'settings.json'
        ? {
          riffIntegration: {
            mode: 'advanced',
            useLocalScheduler: true,
            storageConflictResolution: 'merge',
            incrementalSync: {
              enabled: false,
              triggers: [],
              useBlacklist: true,
            },
            fullSync: {
              enabled: false,
              interval: 86_400_000,
              cleanupBlacklist: false,
            },
            deleteSync: {
              enabled: false,
              useBlacklistFallback: false,
            },
          },
        }
        : null),
      saveData: vi.fn(async () => {}),
      removeData: vi.fn(async () => {}),
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

  describe('服务创建验证', () => {
    it('启动期应该预接当前主链路需要的卡片服务', () => {
      // SRS v2 提交链路和复习范围同步会在启动期预接 cardService。
      expect(context.isServiceCreated('cardService')).toBe(true);
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
      // 1. 验证启动期主链路服务已预接
      expect(context.isServiceCreated('cardService')).toBe(true);
      
      // 2. 访问已注册服务
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

    it('应该在启动期预接好复习日志服务并懒加载复习提交用例', () => {
      const reviewLogService = context.getReviewLogService();
      const reviewCommitUseCase = context.getReviewCommitUseCase();

      expect(reviewLogService).toBeInstanceOf(ReviewLogService);
      expect(reviewCommitUseCase).toBeInstanceOf(ReviewCommitUseCase);
      expect(context.isServiceCreated('reviewLogService')).toBe(true);
      expect(context.isServiceCreated('reviewCommitUseCase')).toBe(true);
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

    it('销毁后访问受保护核心服务应该抛出错误', async () => {
      await context.dispose();
      
      // storage 是构造期注入的底层对象，当前保持可读取以兼容旧调用方。
      expect(context.getStorage()).toBeDefined();
      
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
      // browserService 已注册但未创建
      expect(context.hasService('browserService')).toBe(true);
      expect(context.isServiceCreated('browserService')).toBe(false);
      
      // 访问后应该被创建
      context.getBrowserService();
      expect(context.hasService('browserService')).toBe(true);
      expect(context.isServiceCreated('browserService')).toBe(true);
    });

    it('开启 worker backend feature flag 时应注入 SrsBackendClient 到 browser service', async () => {
      const flagKey = 'VITE_SIYUANMEMO_ENABLE_SRS_BACKEND_WORKER';
      const previous = process.env[flagKey];
      process.env[flagKey] = 'true';

      let flaggedContext: ApplicationContext | null = null;
      try {
        flaggedContext = await ApplicationContext.create({
          plugin: mockPlugin,
          i18n: {},
        });
        const browserService = flaggedContext.getBrowserService() as unknown as { srsBackendClient?: unknown };
        expect(browserService.srsBackendClient).toBeTruthy();
      } finally {
        if (flaggedContext && !flaggedContext.isDisposed()) {
          await flaggedContext.dispose();
        }
        if (previous === undefined) {
          delete process.env[flagKey];
        } else {
          process.env[flagKey] = previous;
        }
      }
    });

    it('开启 writer lease guard flag 时应把 guard 注入 ReviewCommitUseCase', async () => {
      const workerFlagKey = 'VITE_SIYUANMEMO_ENABLE_SRS_BACKEND_WORKER';
      const leaseFlagKey = 'VITE_SIYUANMEMO_ENABLE_KERNEL_WRITER_LEASE_GUARD';
      const previousWorker = process.env[workerFlagKey];
      const previousLease = process.env[leaseFlagKey];
      process.env[workerFlagKey] = 'true';
      process.env[leaseFlagKey] = 'true';

      let flaggedContext: ApplicationContext | null = null;
      try {
        flaggedContext = await ApplicationContext.create({
          plugin: mockPlugin,
          i18n: {},
        });
        const useCase = flaggedContext.getReviewCommitUseCase() as unknown as {
          deps?: { writerLeaseGuard?: unknown };
        };
        expect(useCase.deps?.writerLeaseGuard).toBeTruthy();
      } finally {
        if (flaggedContext && !flaggedContext.isDisposed()) {
          await flaggedContext.dispose();
        }
        if (previousWorker === undefined) {
          delete process.env[workerFlagKey];
        } else {
          process.env[workerFlagKey] = previousWorker;
        }
        if (previousLease === undefined) {
          delete process.env[leaseFlagKey];
        } else {
          process.env[leaseFlagKey] = previousLease;
        }
      }
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
