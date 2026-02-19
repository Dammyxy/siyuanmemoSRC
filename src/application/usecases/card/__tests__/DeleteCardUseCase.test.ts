/**
 * DeleteCardUseCase - 单元测试
 * 
 * @description
 * 测试 DeleteCardUseCase 的业务逻辑
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeleteCardUseCase } from '../DeleteCardUseCase';
import { DeleteCardCommand } from '../../../commands/card/DeleteCardCommand';
import { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import { CardDeletionService } from '@/core/xiuyuan/domain/services/CardDeletionService';
import { CardCreationService } from '@/core/xiuyuan/domain/services/CardCreationService';
import { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';
import { BlockId } from '@/core/xiuyuan/domain/BlockId';
import { TemplateId } from '@/core/xiuyuan/domain/TemplateId';
import { CardFace } from '@/core/xiuyuan/domain/CardFace';
import { ok, err } from '@/types/result';

describe('DeleteCardUseCase', () => {
  let useCase: DeleteCardUseCase;
  let mockRepo: IXiuyuanRepository;
  let cardDeletionService: CardDeletionService;
  let cardCreationService: CardCreationService;

  beforeEach(() => {
    // 创建 mock repository
    mockRepo = {
      save: vi.fn(),
      findById: vi.fn(),
      findByBlockId: vi.fn(),
      findAll: vi.fn(),
      delete: vi.fn(),
      saveMany: vi.fn(),
      deleteMany: vi.fn()
    };

    // 创建真实的服务
    cardDeletionService = new CardDeletionService();
    cardCreationService = new CardCreationService();

    // 创建用例
    useCase = new DeleteCardUseCase(mockRepo, cardDeletionService);
  });

  // Helper function to create valid Xiuyuan with a card
  const createXiuyuanWithCard = (): Xiuyuan => {
    const blockIdResult = BlockId.create('20210808180117-6v0mkxr');
    const templateIdResult = TemplateId.create('template-basic');
    const cardFaceResult = CardFace.create({
      question: 'What is DDD?',
      answer: 'Domain-Driven Design'
    });

    if (!blockIdResult.ok || !templateIdResult.ok || !cardFaceResult.ok) {
      throw new Error('Failed to create test data');
    }

    const xiuyuanResult = Xiuyuan.create({
      blockIDs: [blockIdResult.value],
      templateID: templateIdResult.value,
      faces: [cardFaceResult.value]
    });

    if (!xiuyuanResult.ok) {
      throw new Error('Failed to create Xiuyuan');
    }

    const xiuyuan = xiuyuanResult.value;

    // 创建一个卡片
    const cardResult = cardCreationService.createCard(xiuyuan, 0);
    if (!cardResult.ok) {
      throw new Error('Failed to create card');
    }

    return xiuyuan;
  };

  describe('execute', () => {
    it('应该成功删除卡片', async () => {
      // Arrange
      const xiuyuan = createXiuyuanWithCard();
      const cards = xiuyuan.getCards();
      expect(cards).toHaveLength(1);
      
      const cardId = cards[0].getId().getValue();
      const command: DeleteCardCommand = {
        cardId: cardId
      };

      // Mock repository - 返回同一个 xiuyuan 实例
      // 使用 mockImplementation 而不是 mockResolvedValue 以确保每次调用都返回相同的值
      vi.mocked(mockRepo.findAll).mockImplementation(async () => ok([xiuyuan]));
      vi.mocked(mockRepo.save).mockResolvedValue(ok(undefined));

      // Act
      const result = await useCase.execute(command);

      // Assert
      if (!result.ok) {
        console.error('Error:', result.error.message);
      }
      expect(result.ok).toBe(true);
      expect(mockRepo.findAll).toHaveBeenCalled();
      expect(mockRepo.save).toHaveBeenCalled();
      
      // 验证卡片已被删除
      expect(xiuyuan.getCards()).toHaveLength(0);
    });

    it('应该在多个 Xiuyuan 中找到正确的卡片', async () => {
      // Arrange
      const xiuyuan1 = createXiuyuanWithCard();
      const xiuyuan2 = createXiuyuanWithCard();
      const xiuyuan3 = createXiuyuanWithCard();

      const targetCard = xiuyuan2.getCards()[0];
      const command: DeleteCardCommand = {
        cardId: targetCard.getId().getValue()
      };

      // Mock repository - 返回多个 Xiuyuan
      vi.mocked(mockRepo.findAll).mockImplementation(async () => ok([xiuyuan1, xiuyuan2, xiuyuan3]));
      vi.mocked(mockRepo.save).mockResolvedValue(ok(undefined));

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(true);
      expect(mockRepo.save).toHaveBeenCalledTimes(1);
      
      // 验证保存的是正确的 Xiuyuan 并且卡片已被删除
      expect(xiuyuan2.getId().getValue()).toBeDefined();
      expect(xiuyuan2.getCards()).toHaveLength(0);
    });

    it('应该拒绝空的 cardId', async () => {
      // Arrange
      const command: DeleteCardCommand = {
        cardId: ''
      };

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('cardId cannot be empty');
      }
      expect(mockRepo.findAll).not.toHaveBeenCalled();
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('应该拒绝过长的 cardId', async () => {
      // Arrange
      const command: DeleteCardCommand = {
        cardId: 'a'.repeat(101) // 超过 100 个字符
      };

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('cardId cannot exceed 100 characters');
      }
      expect(mockRepo.findAll).not.toHaveBeenCalled();
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('应该处理卡片不存在的情况', async () => {
      // Arrange
      const xiuyuan = createXiuyuanWithCard();
      const command: DeleteCardCommand = {
        cardId: 'non-existent-card-id'
      };

      // Mock repository - 返回 Xiuyuan 但不包含目标卡片
      vi.mocked(mockRepo.findAll).mockResolvedValue(ok([xiuyuan]));

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not found in any Xiuyuan');
      }
      expect(mockRepo.findAll).toHaveBeenCalledTimes(1);
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('应该处理没有 Xiuyuan 的情况', async () => {
      // Arrange
      const command: DeleteCardCommand = {
        cardId: 'some-card-id'
      };

      // Mock repository - 返回空数组
      vi.mocked(mockRepo.findAll).mockResolvedValue(ok([]));

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not found in any Xiuyuan');
      }
      expect(mockRepo.findAll).toHaveBeenCalledTimes(1);
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('应该处理 repository findAll 失败', async () => {
      // Arrange
      const command: DeleteCardCommand = {
        cardId: 'some-card-id'
      };

      const findError = new Error('Database connection failed');
      vi.mocked(mockRepo.findAll).mockResolvedValue(err(findError));

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(findError);
      }
      expect(mockRepo.findAll).toHaveBeenCalledTimes(1);
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('应该处理 repository save 失败', async () => {
      // Arrange
      const xiuyuan = createXiuyuanWithCard();
      const cardId = xiuyuan.getCards()[0].getId().getValue();
      const command: DeleteCardCommand = {
        cardId: cardId
      };

      const saveError = new Error('Failed to save');
      vi.mocked(mockRepo.findAll).mockImplementation(async () => ok([xiuyuan]));
      vi.mocked(mockRepo.save).mockResolvedValue(err(saveError));

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(saveError);
      }
      expect(mockRepo.findAll).toHaveBeenCalledTimes(1);
      expect(mockRepo.save).toHaveBeenCalledTimes(1);
    });

    it('应该处理无效的 cardId 格式', async () => {
      // Arrange
      const command: DeleteCardCommand = {
        cardId: 'invalid-card-id-format'
      };

      // Mock repository
      vi.mocked(mockRepo.findAll).mockResolvedValue(ok([]));

      // Act
      const result = await useCase.execute(command);

      // Assert
      // CardId.create 可能会接受任何非空字符串，所以这个测试可能会通过验证
      // 但会在查找时失败
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not found');
      }
    });

    it('应该从有多个卡片的 Xiuyuan 中删除一个卡片', async () => {
      // Arrange
      const blockIdResult = BlockId.create('20210808180117-6v0mkxr');
      const templateIdResult = TemplateId.create('template-multi');
      const face1Result = CardFace.create({ question: 'Q1', answer: 'A1' });
      const face2Result = CardFace.create({ question: 'Q2', answer: 'A2' });

      if (!blockIdResult.ok || !templateIdResult.ok || !face1Result.ok || !face2Result.ok) {
        throw new Error('Failed to create test data');
      }

      const xiuyuanResult = Xiuyuan.create({
        blockIDs: [blockIdResult.value],
        templateID: templateIdResult.value,
        faces: [face1Result.value, face2Result.value]
      });

      if (!xiuyuanResult.ok) {
        throw new Error('Failed to create Xiuyuan');
      }

      const xiuyuan = xiuyuanResult.value;

      // 创建两个卡片
      cardCreationService.createCard(xiuyuan, 0);
      cardCreationService.createCard(xiuyuan, 1);

      expect(xiuyuan.getCards()).toHaveLength(2);

      const firstCardId = xiuyuan.getCards()[0].getId().getValue();
      const command: DeleteCardCommand = {
        cardId: firstCardId
      };

      // Mock repository
      vi.mocked(mockRepo.findAll).mockImplementation(async () => ok([xiuyuan]));
      vi.mocked(mockRepo.save).mockResolvedValue(ok(undefined));

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(true);
      
      expect(xiuyuan.getCards()).toHaveLength(1);
      // 验证剩余的是第二个卡片
      expect(xiuyuan.getCards()[0].getFaceIndex()).toBe(1);
    });
  });
});
