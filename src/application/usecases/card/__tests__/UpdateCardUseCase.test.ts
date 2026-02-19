/**
 * UpdateCardUseCase - 单元测试
 * 
 * @description
 * 测试 UpdateCardUseCase 的业务逻辑
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UpdateCardUseCase } from '../UpdateCardUseCase';
import { UpdateCardCommand } from '../../../commands/card/UpdateCardCommand';
import { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';
import { XiuyuanId } from '@/core/xiuyuan/domain/XiuyuanId';
import { BlockId } from '@/core/xiuyuan/domain/BlockId';
import { TemplateId } from '@/core/xiuyuan/domain/TemplateId';
import { CardFace } from '@/core/xiuyuan/domain/CardFace';
import { Priority } from '@/core/xiuyuan/domain/Priority';
import { ScheduleInfo } from '@/core/xiuyuan/domain/ScheduleInfo';
import { ok, err } from '@/types/result';
import { CardState } from '@/types/card';

describe('UpdateCardUseCase', () => {
  let useCase: UpdateCardUseCase;
  let mockRepo: IXiuyuanRepository;

  // Helper function to create test data
  const createTestData = () => {
    const xiuyuanIdResult = XiuyuanId.create('test-xiuyuan-id');
    const blockIdResult = BlockId.create('20210808180117-6v0mkxr');
    const templateIdResult = TemplateId.create('template-basic');
    const face1Result = CardFace.create({
      question: 'Question 1',
      answer: 'Answer 1'
    });
    const face2Result = CardFace.create({
      question: 'Question 2',
      answer: 'Answer 2'
    });

    if (!xiuyuanIdResult.ok || !blockIdResult.ok || !templateIdResult.ok || !face1Result.ok || !face2Result.ok) {
      throw new Error('Failed to create test data');
    }

    const xiuyuanResult = Xiuyuan.create({
      id: xiuyuanIdResult.value,
      blockIDs: [blockIdResult.value],
      templateID: templateIdResult.value,
      faces: [face1Result.value, face2Result.value],
      priority: Priority.createDefault(),
      meta: {}
    });

    if (!xiuyuanResult.ok) {
      throw new Error('Failed to create Xiuyuan');
    }

    const testXiuyuan = xiuyuanResult.value;

    // 创建一个卡片
    const cardResult = testXiuyuan.createCard(0);
    if (!cardResult.ok) {
      throw new Error('Failed to create card');
    }
    const testCard = cardResult.value;

    return { testXiuyuan, testCard };
  };

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

    // 创建用例
    useCase = new UpdateCardUseCase(mockRepo);
  });

  describe('execute', () => {
    it('应该成功更新卡片的 faceIndex', async () => {
      // Arrange
      const { testXiuyuan, testCard } = createTestData();
      
      const command: UpdateCardCommand = {
        cardId: testCard.getId().getValue(),
        xiuyuanId: testXiuyuan.getId().getValue(),
        faceIndex: 1
      };

      vi.mocked(mockRepo.findById).mockResolvedValue(ok(testXiuyuan));
      vi.mocked(mockRepo.save).mockResolvedValue(ok(undefined));

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(true);
      expect(mockRepo.findById).toHaveBeenCalledTimes(1);
      expect(mockRepo.save).toHaveBeenCalledTimes(1);

      // 验证更新后的卡片
      const savedXiuyuan = vi.mocked(mockRepo.save).mock.calls[0][0];
      const updatedCard = savedXiuyuan.getCard(testCard.getId());
      expect(updatedCard).not.toBeNull();
      expect(updatedCard!.getFaceIndex()).toBe(1);
    });

    it('应该成功更新卡片的 scheduleInfo', async () => {
      // Arrange
      const { testXiuyuan, testCard } = createTestData();
      
      const scheduleInfoResult = ScheduleInfo.create({
        due: new Date('2024-12-31'),
        stability: 10,
        difficulty: 5,
        reps: 3,
        lapses: 0,
        state: CardState.Review,
        lastReview: new Date('2024-12-01'),
        elapsedDays: 5,
        scheduledDays: 10,
        learning_step: 0
      });
      
      if (!scheduleInfoResult.ok) {
        throw new Error('Failed to create ScheduleInfo');
      }
      
      const newScheduleInfo = scheduleInfoResult.value;

      const command: UpdateCardCommand = {
        cardId: testCard.getId().getValue(),
        xiuyuanId: testXiuyuan.getId().getValue(),
        scheduleInfo: newScheduleInfo
      };

      vi.mocked(mockRepo.findById).mockResolvedValue(ok(testXiuyuan));
      vi.mocked(mockRepo.save).mockResolvedValue(ok(undefined));

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(true);
      expect(mockRepo.findById).toHaveBeenCalledTimes(1);
      expect(mockRepo.save).toHaveBeenCalledTimes(1);

      // 验证更新后的卡片
      const savedXiuyuan = vi.mocked(mockRepo.save).mock.calls[0][0];
      const updatedCard = savedXiuyuan.getCard(testCard.getId());
      expect(updatedCard).not.toBeNull();
      expect(updatedCard!.getScheduleInfo().reps).toBe(3);
      expect(updatedCard!.getScheduleInfo().stability).toBe(10);
    });

    it('应该同时更新 faceIndex 和 scheduleInfo', async () => {
      // Arrange
      const { testXiuyuan, testCard } = createTestData();
      
      const scheduleInfoResult = ScheduleInfo.create({
        due: new Date('2024-12-31'),
        stability: 10,
        difficulty: 5,
        reps: 3,
        lapses: 0,
        state: CardState.Review,
        lastReview: new Date('2024-12-01'),
        elapsedDays: 5,
        scheduledDays: 10,
        learning_step: 0
      });
      
      if (!scheduleInfoResult.ok) {
        throw new Error('Failed to create ScheduleInfo');
      }
      
      const newScheduleInfo = scheduleInfoResult.value;

      const command: UpdateCardCommand = {
        cardId: testCard.getId().getValue(),
        xiuyuanId: testXiuyuan.getId().getValue(),
        faceIndex: 1,
        scheduleInfo: newScheduleInfo
      };

      vi.mocked(mockRepo.findById).mockResolvedValue(ok(testXiuyuan));
      vi.mocked(mockRepo.save).mockResolvedValue(ok(undefined));

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(true);

      // 验证更新后的卡片
      const savedXiuyuan = vi.mocked(mockRepo.save).mock.calls[0][0];
      const updatedCard = savedXiuyuan.getCard(testCard.getId());
      expect(updatedCard).not.toBeNull();
      expect(updatedCard!.getFaceIndex()).toBe(1);
      expect(updatedCard!.getScheduleInfo().reps).toBe(3);
    });

    it('应该拒绝空的 cardId', async () => {
      // Arrange
      const { testXiuyuan } = createTestData();
      
      const command: UpdateCardCommand = {
        cardId: '',
        xiuyuanId: testXiuyuan.getId().getValue(),
        faceIndex: 1
      };

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeDefined();
        expect(result.error.message).toContain('cardId cannot be empty');
      }
      expect(mockRepo.findById).not.toHaveBeenCalled();
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('应该拒绝空的 xiuyuanId', async () => {
      // Arrange
      const { testCard } = createTestData();
      
      const command: UpdateCardCommand = {
        cardId: testCard.getId().getValue(),
        xiuyuanId: '',
        faceIndex: 1
      };

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeDefined();
        expect(result.error.message).toContain('xiuyuanId cannot be empty');
      }
      expect(mockRepo.findById).not.toHaveBeenCalled();
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('应该拒绝没有更新字段的命令', async () => {
      // Arrange
      const { testXiuyuan, testCard } = createTestData();
      
      const command: UpdateCardCommand = {
        cardId: testCard.getId().getValue(),
        xiuyuanId: testXiuyuan.getId().getValue()
        // 没有提供 faceIndex 或 scheduleInfo
      };

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeDefined();
        expect(result.error.message).toContain('At least one field must be provided for update');
      }
      expect(mockRepo.findById).not.toHaveBeenCalled();
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('应该拒绝负数的 faceIndex', async () => {
      // Arrange
      const { testXiuyuan, testCard } = createTestData();
      
      const command: UpdateCardCommand = {
        cardId: testCard.getId().getValue(),
        xiuyuanId: testXiuyuan.getId().getValue(),
        faceIndex: -1
      };

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeDefined();
        expect(result.error.message).toContain('faceIndex must be >= 0');
      }
      expect(mockRepo.findById).not.toHaveBeenCalled();
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('应该拒绝超出范围的 faceIndex', async () => {
      // Arrange
      const { testXiuyuan, testCard } = createTestData();
      
      const command: UpdateCardCommand = {
        cardId: testCard.getId().getValue(),
        xiuyuanId: testXiuyuan.getId().getValue(),
        faceIndex: 10 // testXiuyuan 只有 2 个 face
      };

      vi.mocked(mockRepo.findById).mockResolvedValue(ok(testXiuyuan));

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeDefined();
        expect(result.error.message).toContain('Invalid faceIndex');
      }
      expect(mockRepo.findById).toHaveBeenCalledTimes(1);
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('应该处理 Xiuyuan 不存在的情况', async () => {
      // Arrange
      const { testCard } = createTestData();
      
      const command: UpdateCardCommand = {
        cardId: testCard.getId().getValue(),
        xiuyuanId: 'non-existent-xiuyuan-id',
        faceIndex: 1
      };

      vi.mocked(mockRepo.findById).mockResolvedValue(ok(null));

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeDefined();
        expect(result.error.message).toContain('Xiuyuan not found');
      }
      expect(mockRepo.findById).toHaveBeenCalledTimes(1);
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('应该处理 Card 不存在的情况', async () => {
      // Arrange
      const { testXiuyuan } = createTestData();
      
      const command: UpdateCardCommand = {
        cardId: 'non-existent-card-id',
        xiuyuanId: testXiuyuan.getId().getValue(),
        faceIndex: 1
      };

      vi.mocked(mockRepo.findById).mockResolvedValue(ok(testXiuyuan));

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeDefined();
        expect(result.error.message).toContain('Card not found');
      }
      expect(mockRepo.findById).toHaveBeenCalledTimes(1);
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('应该处理 repository findById 失败', async () => {
      // Arrange
      const { testXiuyuan, testCard } = createTestData();
      
      const command: UpdateCardCommand = {
        cardId: testCard.getId().getValue(),
        xiuyuanId: testXiuyuan.getId().getValue(),
        faceIndex: 1
      };

      const findError = new Error('Database connection failed');
      vi.mocked(mockRepo.findById).mockResolvedValue(err(findError));

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeDefined();
        expect(result.error).toBe(findError);
      }
      expect(mockRepo.findById).toHaveBeenCalledTimes(1);
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('应该处理 repository save 失败', async () => {
      // Arrange
      const { testXiuyuan, testCard } = createTestData();
      
      const command: UpdateCardCommand = {
        cardId: testCard.getId().getValue(),
        xiuyuanId: testXiuyuan.getId().getValue(),
        faceIndex: 1
      };

      vi.mocked(mockRepo.findById).mockResolvedValue(ok(testXiuyuan));

      const saveError = new Error('Database write failed');
      vi.mocked(mockRepo.save).mockResolvedValue(err(saveError));

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeDefined();
        expect(result.error).toBe(saveError);
      }
      expect(mockRepo.findById).toHaveBeenCalledTimes(1);
      expect(mockRepo.save).toHaveBeenCalledTimes(1);
    });

    it('应该更新 Card 的 updatedAt 时间戳', async () => {
      // Arrange
      const { testXiuyuan, testCard } = createTestData();
      
      const command: UpdateCardCommand = {
        cardId: testCard.getId().getValue(),
        xiuyuanId: testXiuyuan.getId().getValue(),
        faceIndex: 1
      };

      const originalUpdatedAt = testCard.getUpdatedAt();

      // 等待一小段时间确保时间戳不同
      await new Promise(resolve => setTimeout(resolve, 10));

      vi.mocked(mockRepo.findById).mockResolvedValue(ok(testXiuyuan));
      vi.mocked(mockRepo.save).mockResolvedValue(ok(undefined));

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(true);

      const savedXiuyuan = vi.mocked(mockRepo.save).mock.calls[0][0];
      const updatedCard = savedXiuyuan.getCard(testCard.getId());
      expect(updatedCard).not.toBeNull();
      expect(updatedCard!.getUpdatedAt().getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });
});
