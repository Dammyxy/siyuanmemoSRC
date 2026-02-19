/**
 * CardServiceFactory.test.ts - 测试卡片应用服务工厂
 * 
 * 验证服务工厂能够正确创建 CardApplicationService 及其依赖
 */

import { describe, it, expect, vi } from 'vitest';
import { XiuyuanRepository } from '@/core/xiuyuan/infrastructure/XiuyuanRepository';
import { CardCreationService } from '@/core/xiuyuan/domain/services/CardCreationService';
import { CardDeletionService } from '@/core/xiuyuan/domain/services/CardDeletionService';
import { CreateCardUseCase } from '@/application/usecases/card/CreateCardUseCase';
import { DeleteCardUseCase } from '@/application/usecases/card/DeleteCardUseCase';
import { UpdateCardUseCase } from '@/application/usecases/card/UpdateCardUseCase';
import { CardApplicationService } from '@/application/services/CardApplicationService';

describe('CardApplicationService Factory', () => {
  it('should create CardApplicationService with all dependencies', () => {
    // 模拟存储和插件
    const mockStorage = {
      getXiuyuan: vi.fn(),
      save: vi.fn().mockResolvedValue({ ok: true })
    };
    
    const mockPlugin = {
      setBlockAttrs: vi.fn().mockResolvedValue(undefined)
    };

    // 创建基础设施层：XiuyuanRepository
    const xiuyuanRepo = new XiuyuanRepository(mockStorage as any, mockPlugin as any);

    // 创建领域服务
    const cardCreationService = new CardCreationService();
    const cardDeletionService = new CardDeletionService();

    // 创建用例
    const createCardUseCase = new CreateCardUseCase(xiuyuanRepo, cardCreationService);
    const deleteCardUseCase = new DeleteCardUseCase(xiuyuanRepo, cardDeletionService);
    const updateCardUseCase = new UpdateCardUseCase(xiuyuanRepo);

    // 创建应用服务
    const cardService = new CardApplicationService(
      createCardUseCase,
      deleteCardUseCase,
      updateCardUseCase
    );

    // 验证服务创建成功
    expect(cardService).toBeDefined();
    expect(typeof cardService.createCard).toBe('function');
    expect(typeof cardService.deleteCard).toBe('function');
    expect(typeof cardService.updateCard).toBe('function');

    // 验证依赖注入正确
    expect((cardService as any).createCardUseCase).toBe(createCardUseCase);
    expect((cardService as any).deleteCardUseCase).toBe(deleteCardUseCase);
    expect((cardService as any).updateCardUseCase).toBe(updateCardUseCase);
  });

  it('should wire dependencies correctly', () => {
    // 模拟存储和插件
    const mockStorage = {
      getXiuyuan: vi.fn(),
      save: vi.fn().mockResolvedValue({ ok: true })
    };
    
    const mockPlugin = {
      setBlockAttrs: vi.fn().mockResolvedValue(undefined)
    };

    // 创建基础设施层
    const xiuyuanRepo = new XiuyuanRepository(mockStorage as any, mockPlugin as any);

    // 创建领域服务
    const cardCreationService = new CardCreationService();
    const cardDeletionService = new CardDeletionService();

    // 创建用例
    const createCardUseCase = new CreateCardUseCase(xiuyuanRepo, cardCreationService);
    const deleteCardUseCase = new DeleteCardUseCase(xiuyuanRepo, cardDeletionService);
    const updateCardUseCase = new UpdateCardUseCase(xiuyuanRepo);

    // 验证用例的依赖注入
    expect((createCardUseCase as any).xiuyuanRepo).toBe(xiuyuanRepo);
    expect((createCardUseCase as any).cardCreationService).toBe(cardCreationService);
    expect((deleteCardUseCase as any).xiuyuanRepo).toBe(xiuyuanRepo);
    expect((deleteCardUseCase as any).cardDeletionService).toBe(cardDeletionService);
    expect((updateCardUseCase as any).xiuyuanRepo).toBe(xiuyuanRepo);
  });
});
