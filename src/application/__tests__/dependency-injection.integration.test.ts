/**
 * 依赖注入集成测试
 * 
 * 验证依赖链的完整性：
 * ApplicationContext → CardApplicationService → UseCases → Domain Services → Repository
 */

import { describe, it, expect, vi } from 'vitest';
import { CardApplicationService } from '../services/CardApplicationService';
import { CreateCardUseCase } from '../usecases/card/CreateCardUseCase';
import { DeleteCardUseCase } from '../usecases/card/DeleteCardUseCase';
import { UpdateCardUseCase } from '../usecases/card/UpdateCardUseCase';
import { CardCreationService } from '@/core/xiuyuan/domain/services/CardCreationService';
import { CardDeletionService } from '@/core/xiuyuan/domain/services/CardDeletionService';
import { XiuyuanRepository } from '@/core/xiuyuan/infrastructure/XiuyuanRepository';
import { XiuyuanStorage } from '@/core/xiuyuan';

describe('依赖注入集成测试', () => {
  describe('依赖链构建', () => {
    it('应该能够手动构建完整的依赖链', () => {
      // 1. 创建基础设施层：Repository
      const mockPlugin = {
        name: 'test-plugin',
        data: {},
      } as any;
      
      const xiuyuanStorage = new XiuyuanStorage(mockPlugin);
      const xiuyuanRepo = new XiuyuanRepository(xiuyuanStorage, mockPlugin);

      // 2. 创建领域服务
      const cardCreationService = new CardCreationService();
      const cardDeletionService = new CardDeletionService();

      // 3. 创建用例
      const createCardUseCase = new CreateCardUseCase(xiuyuanRepo, cardCreationService);
      const deleteCardUseCase = new DeleteCardUseCase(xiuyuanRepo, cardDeletionService);
      const updateCardUseCase = new UpdateCardUseCase(xiuyuanRepo);

      // 4. 创建应用服务
      const cardService = new CardApplicationService(
        createCardUseCase,
        deleteCardUseCase,
        updateCardUseCase
      );

      // 验证依赖链
      expect(cardService).toBeDefined();
      expect(cardService.createCard).toBeDefined();
      expect(cardService.deleteCard).toBeDefined();
      expect(cardService.updateCard).toBeDefined();
    });

    it('ApplicationContext 工厂函数应该能够创建相同的依赖链', () => {
      // 模拟 ApplicationContext 的工厂函数
      const mockContext = {
        getXiuyuanStorage: () => new XiuyuanStorage({ name: 'test', data: {} } as any),
        getPlugin: () => ({ name: 'test', data: {} } as any),
      };

      // 模拟 ApplicationContext 中的 cardService 工厂（使用 import 而不是 require）
      const cardServiceFactory = (context: typeof mockContext) => {
        // 直接使用已导入的类
        const xiuyuanRepo = new XiuyuanRepository(
          context.getXiuyuanStorage(),
          context.getPlugin()
        );

        const cardCreationService = new CardCreationService();
        const cardDeletionService = new CardDeletionService();

        const createCardUseCase = new CreateCardUseCase(xiuyuanRepo, cardCreationService);
        const deleteCardUseCase = new DeleteCardUseCase(xiuyuanRepo, cardDeletionService);
        const updateCardUseCase = new UpdateCardUseCase(xiuyuanRepo);

        return new CardApplicationService(
          createCardUseCase,
          deleteCardUseCase,
          updateCardUseCase
        );
      };

      // 使用工厂创建服务
      const cardService = cardServiceFactory(mockContext);

      // 验证服务创建成功
      expect(cardService).toBeDefined();
      expect(cardService.createCard).toBeDefined();
      expect(cardService.deleteCard).toBeDefined();
      expect(cardService.updateCard).toBeDefined();
    });
  });

  describe('依赖方向验证', () => {
    it('应用服务应该依赖用例', () => {
      const mockUseCase = {
        execute: vi.fn(),
      } as any;

      const cardService = new CardApplicationService(
        mockUseCase,
        mockUseCase,
        mockUseCase
      );

      expect(cardService).toBeDefined();
    });

    it('用例应该依赖仓储和领域服务', () => {
      const mockRepo = {} as any;
      const mockDomainService = {} as any;

      const createCardUseCase = new CreateCardUseCase(mockRepo, mockDomainService);
      const deleteCardUseCase = new DeleteCardUseCase(mockRepo, mockDomainService);
      const updateCardUseCase = new UpdateCardUseCase(mockRepo);

      expect(createCardUseCase).toBeDefined();
      expect(deleteCardUseCase).toBeDefined();
      expect(updateCardUseCase).toBeDefined();
    });

    it('仓储应该依赖存储和插件', () => {
      const mockStorage = {} as any;
      const mockPlugin = {} as any;

      const repo = new XiuyuanRepository(mockStorage, mockPlugin);

      expect(repo).toBeDefined();
    });

    it('领域服务不应该有外部依赖', () => {
      // 领域服务应该是纯函数，不依赖外部服务
      const cardCreationService = new CardCreationService();
      const cardDeletionService = new CardDeletionService();

      expect(cardCreationService).toBeDefined();
      expect(cardDeletionService).toBeDefined();
    });
  });

  describe('服务容器模式验证', () => {
    it('应该支持懒加载模式', () => {
      // 模拟服务容器
      const serviceContainer = new Map<string, any>();
      const serviceFactories = new Map<string, () => any>();

      // 注册工厂
      let creationCount = 0;
      serviceFactories.set('testService', () => {
        creationCount++;
        return { name: 'test' };
      });

      // 获取服务的函数
      const getService = (name: string) => {
        if (serviceContainer.has(name)) {
          return serviceContainer.get(name);
        }
        
        const factory = serviceFactories.get(name);
        if (factory) {
          const service = factory();
          serviceContainer.set(name, service);
          return service;
        }
        
        throw new Error(`Service '${name}' not found`);
      };

      // 验证懒加载
      expect(creationCount).toBe(0); // 还未创建

      const service1 = getService('testService');
      expect(creationCount).toBe(1); // 第一次访问时创建

      const service2 = getService('testService');
      expect(creationCount).toBe(1); // 第二次访问不再创建
      expect(service1).toBe(service2); // 返回同一个实例
    });

    it('应该支持工厂函数接收上下文参数', () => {
      const mockContext = {
        getConfig: () => ({ value: 'test' }),
      };

      const serviceFactory = (context: typeof mockContext) => {
        const config = context.getConfig();
        return { config };
      };

      const service = serviceFactory(mockContext);
      expect(service.config.value).toBe('test');
    });
  });
});
