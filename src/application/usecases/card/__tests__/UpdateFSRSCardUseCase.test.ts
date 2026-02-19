/**
 * UpdateFSRSCardUseCase - 单元测试
 * 
 * @description
 * 测试 UpdateFSRSCardUseCase 的业务逻辑
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UpdateFSRSCardUseCase } from '../UpdateFSRSCardUseCase';
import type { UpdateFSRSCardCommand } from '../../../commands/card/UpdateFSRSCardCommand';
import type { StorageManager } from '@/core/storage/manager';
import type { FSRSCard } from '@/types';
import { CardState } from '@/types/card';

describe('UpdateFSRSCardUseCase', () => {
  let useCase: UpdateFSRSCardUseCase;
  let mockStorage: StorageManager;

  // Helper function to create test card
  const createTestCard = (): FSRSCard => ({
    id: 'test-card-id',
    blockId: '20210808180117-6v0mkxr',
    type: 'basic',
    due: new Date('2024-01-01'),
    stability: 5,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 1,
    reps: 0,
    lapses: 0,
    state: CardState.New,
    last_review: new Date('2024-01-01'),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    priority: 5,
    tags: [],
    meta: {},
    learning_step: 0
  });

  beforeEach(() => {
    // 创建 mock storage
    mockStorage = {
      getCard: vi.fn(),
      setCard: vi.fn(),
      saveCards: vi.fn().mockResolvedValue(undefined),
      deleteCard: vi.fn(),
      getAllCards: vi.fn(),
      getSettings: vi.fn(),
    } as any;

    // 创建用例
    useCase = new UpdateFSRSCardUseCase(mockStorage);
  });

  describe('execute', () => {
    it('应该成功更新卡片的单个字段', async () => {
      // Arrange
      const testCard = createTestCard();
      const command: UpdateFSRSCardCommand = {
        cardId: testCard.id,
        updates: {
          stability: 10.5
        }
      };

      vi.mocked(mockStorage.getCard).mockReturnValue(testCard);

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.card.stability).toBe(10.5);
        expect(result.value.card.id).toBe(testCard.id);
        expect(result.value.card.blockId).toBe(testCard.blockId);
      }
      expect(mockStorage.getCard).toHaveBeenCalledWith(testCard.id);
      expect(mockStorage.setCard).toHaveBeenCalledTimes(1);
      expect(mockStorage.saveCards).toHaveBeenCalledTimes(1);
    });

    it('应该成功更新卡片的多个字段', async () => {
      // Arrange
      const testCard = createTestCard();
      const command: UpdateFSRSCardCommand = {
        cardId: testCard.id,
        updates: {
          due: new Date('2024-12-31'),
          stability: 10.5,
          difficulty: 7,
          reps: 3,
          state: CardState.Review
        }
      };

      vi.mocked(mockStorage.getCard).mockReturnValue(testCard);

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.card.due).toEqual(new Date('2024-12-31'));
        expect(result.value.card.stability).toBe(10.5);
        expect(result.value.card.difficulty).toBe(7);
        expect(result.value.card.reps).toBe(3);
        expect(result.value.card.state).toBe(CardState.Review);
      }
      expect(mockStorage.setCard).toHaveBeenCalledTimes(1);
      expect(mockStorage.saveCards).toHaveBeenCalledTimes(1);
    });

    it('应该成功更新卡片的 meta 字段', async () => {
      // Arrange
      const testCard = createTestCard();
      const command: UpdateFSRSCardCommand = {
        cardId: testCard.id,
        updates: {
          meta: {
            customField: 'customValue',
            rootId: 'root-123'
          }
        }
      };

      vi.mocked(mockStorage.getCard).mockReturnValue(testCard);

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.card.meta).toEqual({
          customField: 'customValue',
          rootId: 'root-123'
        });
      }
      expect(mockStorage.setCard).toHaveBeenCalledTimes(1);
      expect(mockStorage.saveCards).toHaveBeenCalledTimes(1);
    });

    it('应该成功更新卡片的 priority 字段', async () => {
      // Arrange
      const testCard = createTestCard();
      const command: UpdateFSRSCardCommand = {
        cardId: testCard.id,
        updates: {
          priority: 8
        }
      };

      vi.mocked(mockStorage.getCard).mockReturnValue(testCard);

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.card.priority).toBe(8);
      }
      expect(mockStorage.setCard).toHaveBeenCalledTimes(1);
      expect(mockStorage.saveCards).toHaveBeenCalledTimes(1);
    });

    it('应该保留未更新的字段', async () => {
      // Arrange
      const testCard = createTestCard();
      const command: UpdateFSRSCardCommand = {
        cardId: testCard.id,
        updates: {
          stability: 10.5
        }
      };

      vi.mocked(mockStorage.getCard).mockReturnValue(testCard);

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        // 更新的字段
        expect(result.value.card.stability).toBe(10.5);
        // 未更新的字段应保持不变
        expect(result.value.card.difficulty).toBe(testCard.difficulty);
        expect(result.value.card.reps).toBe(testCard.reps);
        expect(result.value.card.state).toBe(testCard.state);
        expect(result.value.card.blockId).toBe(testCard.blockId);
      }
    });

    it('应该处理卡片不存在的情况', async () => {
      // Arrange
      const command: UpdateFSRSCardCommand = {
        cardId: 'non-existent-card-id',
        updates: {
          stability: 10.5
        }
      };

      vi.mocked(mockStorage.getCard).mockReturnValue(null);

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeDefined();
        expect(result.error.message).toContain('Card not found');
        expect(result.error.message).toContain('non-existent-card-id');
      }
      expect(mockStorage.getCard).toHaveBeenCalledWith('non-existent-card-id');
      expect(mockStorage.setCard).not.toHaveBeenCalled();
      expect(mockStorage.saveCards).not.toHaveBeenCalled();
    });

    it('应该处理 storage.saveCards 失败', async () => {
      // Arrange
      const testCard = createTestCard();
      const command: UpdateFSRSCardCommand = {
        cardId: testCard.id,
        updates: {
          stability: 10.5
        }
      };

      vi.mocked(mockStorage.getCard).mockReturnValue(testCard);
      const saveError = new Error('Failed to save cards');
      vi.mocked(mockStorage.saveCards).mockRejectedValue(saveError);

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeDefined();
        expect(result.error.message).toContain('Failed to save cards');
      }
      expect(mockStorage.getCard).toHaveBeenCalledTimes(1);
      expect(mockStorage.setCard).toHaveBeenCalledTimes(1);
      expect(mockStorage.saveCards).toHaveBeenCalledTimes(1);
    });

    it('应该处理 storage.getCard 抛出异常', async () => {
      // Arrange
      const command: UpdateFSRSCardCommand = {
        cardId: 'test-card-id',
        updates: {
          stability: 10.5
        }
      };

      const getError = new Error('Database connection failed');
      vi.mocked(mockStorage.getCard).mockImplementation(() => {
        throw getError;
      });

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeDefined();
        expect(result.error.message).toContain('Database connection failed');
      }
      expect(mockStorage.setCard).not.toHaveBeenCalled();
      expect(mockStorage.saveCards).not.toHaveBeenCalled();
    });

    it('应该正确合并更新字段', async () => {
      // Arrange
      const testCard = createTestCard();
      testCard.meta = { existingField: 'existingValue' };
      
      const command: UpdateFSRSCardCommand = {
        cardId: testCard.id,
        updates: {
          stability: 10.5,
          meta: { newField: 'newValue' }
        }
      };

      vi.mocked(mockStorage.getCard).mockReturnValue(testCard);

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        // 新字段应该被添加
        expect(result.value.card.stability).toBe(10.5);
        expect(result.value.card.meta).toEqual({ newField: 'newValue' });
        // 注意：meta 是完全替换，不是合并
      }
    });

    it('应该允许更新为 0 值', async () => {
      // Arrange
      const testCard = createTestCard();
      testCard.reps = 5;
      testCard.lapses = 3;
      
      const command: UpdateFSRSCardCommand = {
        cardId: testCard.id,
        updates: {
          reps: 0,
          lapses: 0
        }
      };

      vi.mocked(mockStorage.getCard).mockReturnValue(testCard);

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.card.reps).toBe(0);
        expect(result.value.card.lapses).toBe(0);
      }
    });

    it('应该调用 setCard 并传递更新后的卡片', async () => {
      // Arrange
      const testCard = createTestCard();
      const command: UpdateFSRSCardCommand = {
        cardId: testCard.id,
        updates: {
          stability: 10.5,
          difficulty: 7
        }
      };

      vi.mocked(mockStorage.getCard).mockReturnValue(testCard);

      // Act
      await useCase.execute(command);

      // Assert
      expect(mockStorage.setCard).toHaveBeenCalledTimes(1);
      const savedCard = vi.mocked(mockStorage.setCard).mock.calls[0][0];
      expect(savedCard.id).toBe(testCard.id);
      expect(savedCard.stability).toBe(10.5);
      expect(savedCard.difficulty).toBe(7);
    });
  });
});
