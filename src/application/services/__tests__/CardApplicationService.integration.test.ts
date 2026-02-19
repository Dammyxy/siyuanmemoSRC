/**
 * CardApplicationService 集成测试
 * 
 * @description
 * 测试 CardApplicationService 与用例、领域服务、仓储的完整集成。
 * 使用真实的用例和领域服务实现，仅 mock 基础设施层（XiuyuanRepository）。
 * 
 * **测试范围**：
 * - CardApplicationService → UseCase → Domain Service → Repository
 * - 端到端的业务流程验证
 * - 跨层错误传播
 * - 真实的领域对象交互
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CardApplicationService } from '../CardApplicationService';
import { CreateCardUseCase } from '../../usecases/card/CreateCardUseCase';
import { DeleteCardUseCase } from '../../usecases/card/DeleteCardUseCase';
import { UpdateCardUseCase } from '../../usecases/card/UpdateCardUseCase';
import { CardCreationService } from '@/core/xiuyuan/domain/services/CardCreationService';
import { CardDeletionService } from '@/core/xiuyuan/domain/services/CardDeletionService';
import { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import { CreateCardCommand } from '../../commands/card/CreateCardCommand';
import { DeleteCardCommand } from '../../commands/card/DeleteCardCommand';
import { UpdateCardCommand } from '../../commands/card/UpdateCardCommand';
import { ok, err } from '@/types/result';
import { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';
import { XiuyuanId } from '@/core/xiuyuan/domain/XiuyuanId';
import { CardId } from '@/core/xiuyuan/domain/CardId';
import { BlockId } from '@/core/xiuyuan/domain/BlockId';
import { TemplateId } from '@/core/xiuyuan/domain/TemplateId';
import { CardFace } from '@/core/xiuyuan/domain/CardFace';
import { ScheduleInfo } from '@/core/xiuyuan/domain/ScheduleInfo';

describe('CardApplicationService Integration Tests', () => {
  let service: CardApplicationService;
  let mockRepository: IXiuyuanRepository;
  let cardCreationService: CardCreationService;
  let cardDeletionService: CardDeletionService;
  let createCardUseCase: CreateCardUseCase;
  let deleteCardUseCase: DeleteCardUseCase;
  let updateCardUseCase: UpdateCardUseCase;

  beforeEach(() => {
    // 创建真实的领域服务
    cardCreationService = new CardCreationService();
    cardDeletionService = new CardDeletionService();

    // Mock 仓储层
    mockRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByBlockId: vi.fn(),
      findAll: vi.fn(),
      delete: vi.fn(),
      saveMany: vi.fn(),
      deleteMany: vi.fn()
    };

    // 创建真实的用例（使用 mock 仓储）
    createCardUseCase = new CreateCardUseCase(mockRepository, cardCreationService);
    deleteCardUseCase = new DeleteCardUseCase(mockRepository, cardDeletionService);
    updateCardUseCase = new UpdateCardUseCase(mockRepository);

    // 创建应用服务
    service = new CardApplicationService(
      createCardUseCase,
      deleteCardUseCase,
      updateCardUseCase
    );
    
    // 清除所有 mock 调用记录
    vi.clearAllMocks();
  });

  describe('createCard - 端到端流程', () => {
    it('应该成功创建卡片并通过所有层', async () => {
      // Arrange
      const command: CreateCardCommand = {
        blockId: '20240101120000-abc1234', // 正确的格式：14位数字-7位小写字母数字
        templateId: 'basic',
        faces: [
          { question: 'What is DDD?', answer: 'Domain-Driven Design' },
          { question: 'What is TDD?', answer: 'Test-Driven Development' }
        ],
        priority: 5
      };

      // Mock 仓储保存成功
      vi.mocked(mockRepository.save).mockResolvedValue(ok(undefined));

      // Act
      const result = await service.createCard(command);

      // Assert
      expect(result.ok).toBe(true);
      
      if (result.ok) {
        const card = result.value;
        
        // 验证卡片属性
        expect(card.getFaceIndex()).toBe(0); // 默认创建第一个面的卡片
        expect(card.getId()).toBeDefined();
        expect(card.getXiuyuanId()).toBeDefined();
        expect(card.getScheduleInfo()).toBeDefined();
        expect(card.getCreatedAt()).toBeInstanceOf(Date);
        expect(card.getUpdatedAt()).toBeInstanceOf(Date);
        
        // 验证仓储被调用
        expect(mockRepository.save).toHaveBeenCalledTimes(1);
        
        // 验证保存的 Xiuyuan
        const savedXiuyuan = vi.mocked(mockRepository.save).mock.calls[0][0];
        expect(savedXiuyuan).toBeInstanceOf(Xiuyuan);
        expect(savedXiuyuan.getFaces()).toHaveLength(2);
        expect(savedXiuyuan.getCards()).toHaveLength(1);
        expect(savedXiuyuan.getPriority().getValue()).toBe(5);
      }
    });

    it('应该在命令验证失败时返回错误', async () => {
      // Arrange
      const invalidCommand: CreateCardCommand = {
        blockId: '', // 无效的 blockId
        templateId: 'basic',
        faces: [
          { question: 'Q1', answer: 'A1' }
        ]
      };

      // Act
      const result = await service.createCard(invalidCommand);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Invalid command');
        expect(result.error.message).toContain('blockId');
      }
      
      // 验证仓储未被调用
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('应该在仓储保存失败时传播错误', async () => {
      // Arrange
      const command: CreateCardCommand = {
        blockId: '20240101120000-abc1234',
        templateId: 'basic',
        faces: [
          { question: 'Q1', answer: 'A1' }
        ]
      };

      const repositoryError = new Error('Database connection failed');
      vi.mocked(mockRepository.save).mockResolvedValue(err(repositoryError));

      // Act
      const result = await service.createCard(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(repositoryError);
      }
      
      // 验证仓储被调用
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });

    it('应该使用默认优先级创建卡片', async () => {
      // Arrange
      const command: CreateCardCommand = {
        blockId: '20240101120000-def5678',
        templateId: 'basic-default',
        faces: [
          { question: 'Default Q', answer: 'Default A' }
        ]
        // 不提供 priority
      };

      // 捕获保存的 Xiuyuan
      let capturedXiuyuan: any = null;
      vi.mocked(mockRepository.save).mockImplementation(async (xiuyuan) => {
        capturedXiuyuan = xiuyuan;
        return ok(undefined);
      });

      // Act
      const result = await service.createCard(command);

      // Assert
      expect(result.ok).toBe(true);
      expect(capturedXiuyuan).not.toBeNull();
      expect(capturedXiuyuan.getPriority().getValue()).toBe(5); // 默认优先级是 5
    });
  });

  describe('deleteCard - 端到端流程', () => {
    it('应该成功删除卡片并通过所有层', async () => {
      // Arrange
      // 创建必要的值对象
      const blockIdResult = BlockId.create('20240101120000-abc1234');
      const templateIdResult = TemplateId.create('basic');
      const faceResult = CardFace.create({ question: 'Q1', answer: 'A1' });
      
      expect(blockIdResult.ok && templateIdResult.ok && faceResult.ok).toBe(true);
      if (!blockIdResult.ok || !templateIdResult.ok || !faceResult.ok) return;
      
      // 创建 Xiuyuan 和 Card
      const xiuyuanResult = Xiuyuan.create({
        blockIDs: [blockIdResult.value],
        templateID: templateIdResult.value,
        faces: [faceResult.value],
        meta: {}
      });
      
      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;
      
      const xiuyuan = xiuyuanResult.value;
      const cardResult = xiuyuan.createCard(0);
      
      expect(cardResult.ok).toBe(true);
      if (!cardResult.ok) return;
      
      const card = cardResult.value;
      const cardId = card.getId().getValue();

      // Mock 仓储返回包含该卡片的 Xiuyuan
      vi.mocked(mockRepository.findAll).mockResolvedValue(ok([xiuyuan]));
      vi.mocked(mockRepository.save).mockResolvedValue(ok(undefined));

      const command: DeleteCardCommand = {
        cardId: cardId
      };

      // Act
      const result = await service.deleteCard(command);

      // Assert
      expect(result.ok).toBe(true);
      
      // 验证仓储方法被调用
      expect(mockRepository.findAll).toHaveBeenCalledTimes(1);
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
      
      // 验证卡片已从 Xiuyuan 中删除
      const savedXiuyuan = vi.mocked(mockRepository.save).mock.calls[0][0];
      expect(savedXiuyuan.getCards()).toHaveLength(0);
    });

    it('应该在卡片不存在时返回错误', async () => {
      // Arrange
      const command: DeleteCardCommand = {
        cardId: 'non-existent-card-id'
      };

      // Mock 仓储返回空列表
      vi.mocked(mockRepository.findAll).mockResolvedValue(ok([]));

      // Act
      const result = await service.deleteCard(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not found');
      }
      
      // 验证仓储查询被调用，但保存未被调用
      expect(mockRepository.findAll).toHaveBeenCalledTimes(1);
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('应该在命令验证失败时返回错误', async () => {
      // Arrange
      const invalidCommand: DeleteCardCommand = {
        cardId: '' // 无效的 cardId
      };

      // Act
      const result = await service.deleteCard(invalidCommand);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Invalid command');
      }
      
      // 验证仓储未被调用
      expect(mockRepository.findAll).not.toHaveBeenCalled();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('应该在仓储查询失败时传播错误', async () => {
      // Arrange
      const command: DeleteCardCommand = {
        cardId: 'card-123'
      };

      const repositoryError = new Error('Database query failed');
      vi.mocked(mockRepository.findAll).mockResolvedValue(err(repositoryError));

      // Act
      const result = await service.deleteCard(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(repositoryError);
      }
    });
  });

  describe('updateCard - 端到端流程', () => {
    it('应该成功更新卡片的 faceIndex', async () => {
      // Arrange
      // 创建必要的值对象
      const blockIdResult = BlockId.create('20240101120000-abc1234');
      const templateIdResult = TemplateId.create('basic');
      const face1Result = CardFace.create({ question: 'Q1', answer: 'A1' });
      const face2Result = CardFace.create({ question: 'Q2', answer: 'A2' });
      const face3Result = CardFace.create({ question: 'Q3', answer: 'A3' });
      
      expect(blockIdResult.ok && templateIdResult.ok && face1Result.ok && face2Result.ok && face3Result.ok).toBe(true);
      if (!blockIdResult.ok || !templateIdResult.ok || !face1Result.ok || !face2Result.ok || !face3Result.ok) return;
      
      // 创建一个包含多个面的 Xiuyuan 和 Card
      const xiuyuanResult = Xiuyuan.create({
        blockIDs: [blockIdResult.value],
        templateID: templateIdResult.value,
        faces: [face1Result.value, face2Result.value, face3Result.value],
        meta: {}
      });
      
      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;
      
      const xiuyuan = xiuyuanResult.value;
      const cardResult = xiuyuan.createCard(0);
      
      expect(cardResult.ok).toBe(true);
      if (!cardResult.ok) return;
      
      const card = cardResult.value;
      const xiuyuanId = xiuyuan.getId().getValue();
      const cardId = card.getId().getValue();

      // Mock 仓储返回 Xiuyuan
      vi.mocked(mockRepository.findById).mockResolvedValue(ok(xiuyuan));
      vi.mocked(mockRepository.save).mockResolvedValue(ok(undefined));

      const command: UpdateCardCommand = {
        cardId: cardId,
        xiuyuanId: xiuyuanId,
        faceIndex: 2 // 更新到第三个面
      };

      // Act
      const result = await service.updateCard(command);

      // Assert
      expect(result.ok).toBe(true);
      
      // 验证仓储方法被调用
      expect(mockRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
      
      // 验证卡片的 faceIndex 已更新
      const savedXiuyuan = vi.mocked(mockRepository.save).mock.calls[0][0];
      const updatedCard = savedXiuyuan.getCards()[0];
      expect(updatedCard.getFaceIndex()).toBe(2);
    });

    it('应该成功更新卡片的 scheduleInfo', async () => {
      // Arrange
      const blockIdResult = BlockId.create('20240101120000-abc1234');
      const templateIdResult = TemplateId.create('basic');
      const faceResult = CardFace.create({ question: 'Q1', answer: 'A1' });
      
      expect(blockIdResult.ok && templateIdResult.ok && faceResult.ok).toBe(true);
      if (!blockIdResult.ok || !templateIdResult.ok || !faceResult.ok) return;
      
      const xiuyuanResult = Xiuyuan.create({
        blockIDs: [blockIdResult.value],
        templateID: templateIdResult.value,
        faces: [faceResult.value],
        meta: {}
      });
      
      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;
      
      const xiuyuan = xiuyuanResult.value;
      const cardResult = xiuyuan.createCard(0);
      
      expect(cardResult.ok).toBe(true);
      if (!cardResult.ok) return;
      
      const card = cardResult.value;
      const xiuyuanId = xiuyuan.getId().getValue();
      const cardId = card.getId().getValue();

      // 创建新的 scheduleInfo
      const newScheduleInfo = ScheduleInfo.create({
        due: new Date('2024-12-31'),
        stability: 10,
        difficulty: 5,
        elapsedDays: 7,
        scheduledDays: 14,
        reps: 3,
        lapses: 1,
        state: 2,
        lastReview: new Date('2024-12-17')
      });

      expect(newScheduleInfo.ok).toBe(true);
      if (!newScheduleInfo.ok) return;

      // Mock 仓储
      vi.mocked(mockRepository.findById).mockResolvedValue(ok(xiuyuan));
      vi.mocked(mockRepository.save).mockResolvedValue(ok(undefined));

      const command: UpdateCardCommand = {
        cardId: cardId,
        xiuyuanId: xiuyuanId,
        scheduleInfo: newScheduleInfo.value
      };

      // Act
      const result = await service.updateCard(command);

      // Assert
      expect(result.ok).toBe(true);
      
      // 验证 scheduleInfo 已更新
      const savedXiuyuan = vi.mocked(mockRepository.save).mock.calls[0][0];
      const updatedCard = savedXiuyuan.getCards()[0];
      expect(updatedCard.getScheduleInfo().stability).toBe(10);
      expect(updatedCard.getScheduleInfo().reps).toBe(3);
    });

    it('应该在 Xiuyuan 不存在时返回错误', async () => {
      // Arrange
      const command: UpdateCardCommand = {
        cardId: 'card-123',
        xiuyuanId: 'non-existent-xiuyuan',
        faceIndex: 1
      };

      // Mock 仓储返回 null
      vi.mocked(mockRepository.findById).mockResolvedValue(ok(null));

      // Act
      const result = await service.updateCard(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not found');
      }
      
      // 验证保存未被调用
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('应该在 faceIndex 无效时返回错误', async () => {
      // Arrange
      const blockIdResult = BlockId.create('20240101120000-abc1234');
      const templateIdResult = TemplateId.create('basic');
      const faceResult = CardFace.create({ question: 'Q1', answer: 'A1' });
      
      expect(blockIdResult.ok && templateIdResult.ok && faceResult.ok).toBe(true);
      if (!blockIdResult.ok || !templateIdResult.ok || !faceResult.ok) return;
      
      const xiuyuanResult = Xiuyuan.create({
        blockIDs: [blockIdResult.value],
        templateID: templateIdResult.value,
        faces: [faceResult.value], // 只有一个面
        meta: {}
      });
      
      expect(xiuyuanResult.ok).toBe(true);
      if (!xiuyuanResult.ok) return;
      
      const xiuyuan = xiuyuanResult.value;
      const cardResult = xiuyuan.createCard(0);
      
      expect(cardResult.ok).toBe(true);
      if (!cardResult.ok) return;
      
      const card = cardResult.value;

      // Mock 仓储
      vi.mocked(mockRepository.findById).mockResolvedValue(ok(xiuyuan));

      const command: UpdateCardCommand = {
        cardId: card.getId().getValue(),
        xiuyuanId: xiuyuan.getId().getValue(),
        faceIndex: 5 // 无效的 faceIndex
      };

      // Act
      const result = await service.updateCard(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Invalid faceIndex');
      }
      
      // 验证保存未被调用
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('应该在命令验证失败时返回错误', async () => {
      // Arrange
      const invalidCommand: UpdateCardCommand = {
        cardId: '',
        xiuyuanId: 'xiuyuan-123',
        faceIndex: 1
      };

      // Act
      const result = await service.updateCard(invalidCommand);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Invalid command');
      }
      
      // 验证仓储未被调用
      expect(mockRepository.findById).not.toHaveBeenCalled();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('跨层错误传播', () => {
    it('应该正确传播领域层的验证错误', async () => {
      // Arrange
      const command: CreateCardCommand = {
        blockId: '20240101120000-abc123',
        templateId: 'basic',
        faces: [
          { question: 'Q1', answer: 'A1' }
        ],
        priority: -5 // 无效的优先级（领域层会拒绝）
      };

      vi.mocked(mockRepository.save).mockResolvedValue(ok(undefined));

      // Act
      const result = await service.createCard(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('priority');
      }
    });

    it('应该正确传播仓储层的错误', async () => {
      // Arrange
      const command: CreateCardCommand = {
        blockId: '20240101120000-abc1234',
        templateId: 'basic',
        faces: [
          { question: 'Q1', answer: 'A1' }
        ]
      };

      const storageError = new Error('Storage quota exceeded');
      vi.mocked(mockRepository.save).mockResolvedValue(err(storageError));

      // Act
      const result = await service.createCard(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(storageError);
        expect(result.error.message).toBe('Storage quota exceeded');
      }
    });
  });
});
