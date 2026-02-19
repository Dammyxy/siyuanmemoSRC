/**
 * DeleteFSRSCardUseCase - 单元测试
 * 
 * @description
 * 测试 DeleteFSRSCardUseCase 的业务逻辑
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeleteFSRSCardUseCase } from '../DeleteFSRSCardUseCase';
import type { DeleteFSRSCardCommand } from '../../../commands/card/DeleteFSRSCardCommand';
import type { StorageManager } from '@/core/storage/manager';
import type { FSRSCard } from '@/types';
import { CardState } from '@/types/card';

// Mock removeRiffCards
vi.mock('@/core/siyuan/riff', () => ({
  removeRiffCards: vi.fn()
}));

import { removeRiffCards } from '@/core/siyuan/riff';

describe('DeleteFSRSCardUseCase', () => {
  let useCase: DeleteFSRSCardUseCase;
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
    useCase = new DeleteFSRSCardUseCase(mockStorage);

    // 重置 mock
    vi.clearAllMocks();
  });

  describe('execute', () => {
    it('应该成功删除存在的卡片', async () => {
      // Arrange
      const testCard = createTestCard();
      const command: DeleteFSRSCardCommand = {
        cardId: testCard.id,
        deleteFromRiff: false
      };

      vi.mocked(mockStorage.getCard).mockReturnValue(testCard);

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.deleted).toBe(true);
        expect(result.value.deletedFromRiff).toBeUndefined();
      }
      expect(mockStorage.getCard).toHaveBeenCalledWith(testCard.id);
      expect(mockStorage.deleteCard).toHaveBeenCalledWith(testCard.id);
      expect(mockStorage.saveCards).toHaveBeenCalledTimes(1);
      expect(removeRiffCards).not.toHaveBeenCalled();
    });

    it('应该返回 deleted=false 当卡片不存在', async () => {
      // Arrange
      const command: DeleteFSRSCardCommand = {
        cardId: 'non-existent-card-id',
        deleteFromRiff: false
      };

      vi.mocked(mockStorage.getCard).mockReturnValue(null);

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.deleted).toBe(false);
        expect(result.value.deletedFromRiff).toBeUndefined();
      }
      expect(mockStorage.getCard).toHaveBeenCalledWith('non-existent-card-id');
      expect(mockStorage.deleteCard).not.toHaveBeenCalled();
      expect(mockStorage.saveCards).not.toHaveBeenCalled();
      expect(removeRiffCards).not.toHaveBeenCalled();
    });

    it('应该同时删除 Riff 卡片当 deleteFromRiff=true', async () => {
      // Arrange
      const testCard = createTestCard();
      const command: DeleteFSRSCardCommand = {
        cardId: testCard.id,
        deleteFromRiff: true
      };

      vi.mocked(mockStorage.getCard).mockReturnValue(testCard);
      vi.mocked(removeRiffCards).mockResolvedValue(undefined);

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.deleted).toBe(true);
        expect(result.value.deletedFromRiff).toBe(true);
      }
      expect(mockStorage.deleteCard).toHaveBeenCalledWith(testCard.id);
      expect(mockStorage.saveCards).toHaveBeenCalledTimes(1);
      expect(removeRiffCards).toHaveBeenCalledWith([testCard.blockId]);
    });

    it('应该不删除 Riff 卡片当 deleteFromRiff=false', async () => {
      // Arrange
      const testCard = createTestCard();
      const command: DeleteFSRSCardCommand = {
        cardId: testCard.id,
        deleteFromRiff: false
      };

      vi.mocked(mockStorage.getCard).mockReturnValue(testCard);

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.deleted).toBe(true);
        expect(result.value.deletedFromRiff).toBeUndefined();
      }
      expect(removeRiffCards).not.toHaveBeenCalled();
    });

    it('应该不删除 Riff 卡片当 deleteFromRiff 未指定', async () => {
      // Arrange
      const testCard = createTestCard();
      const command: DeleteFSRSCardCommand = {
        cardId: testCard.id
        // deleteFromRiff 未指定
      };

      vi.mocked(mockStorage.getCard).mockReturnValue(testCard);

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.deleted).toBe(true);
        expect(result.value.deletedFromRiff).toBeUndefined();
      }
      expect(removeRiffCards).not.toHaveBeenCalled();
    });

    it('应该处理 Riff 删除失败但本地删除成功', async () => {
      // Arrange
      const testCard = createTestCard();
      const command: DeleteFSRSCardCommand = {
        cardId: testCard.id,
        deleteFromRiff: true
      };

      vi.mocked(mockStorage.getCard).mockReturnValue(testCard);
      const riffError = new Error('Riff API failed');
      vi.mocked(removeRiffCards).mockRejectedValue(riffError);

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.deleted).toBe(true);
        expect(result.value.deletedFromRiff).toBe(false);
      }
      expect(mockStorage.deleteCard).toHaveBeenCalledWith(testCard.id);
      expect(mockStorage.saveCards).toHaveBeenCalledTimes(1);
      expect(removeRiffCards).toHaveBeenCalledWith([testCard.blockId]);
    });

    it('应该不调用 removeRiffCards 当卡片没有 blockId', async () => {
      // Arrange
      const testCard = createTestCard();
      testCard.blockId = ''; // 空 blockId
      
      const command: DeleteFSRSCardCommand = {
        cardId: testCard.id,
        deleteFromRiff: true
      };

      vi.mocked(mockStorage.getCard).mockReturnValue(testCard);

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.deleted).toBe(true);
        expect(result.value.deletedFromRiff).toBeUndefined();
      }
      expect(removeRiffCards).not.toHaveBeenCalled();
    });

    it('应该处理 storage.saveCards 失败', async () => {
      // Arrange
      const testCard = createTestCard();
      const command: DeleteFSRSCardCommand = {
        cardId: testCard.id,
        deleteFromRiff: false
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
      expect(mockStorage.deleteCard).toHaveBeenCalledTimes(1);
      expect(mockStorage.saveCards).toHaveBeenCalledTimes(1);
    });

    it('应该处理 storage.deleteCard 抛出异常', async () => {
      // Arrange
      const testCard = createTestCard();
      const command: DeleteFSRSCardCommand = {
        cardId: testCard.id,
        deleteFromRiff: false
      };

      vi.mocked(mockStorage.getCard).mockReturnValue(testCard);
      const deleteError = new Error('Database error');
      vi.mocked(mockStorage.deleteCard).mockImplementation(() => {
        throw deleteError;
      });

      // Act
      const result = await useCase.execute(command);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeDefined();
        expect(result.error.message).toContain('Database error');
      }
      expect(mockStorage.saveCards).not.toHaveBeenCalled();
    });

    it('应该处理 storage.getCard 抛出异常', async () => {
      // Arrange
      const command: DeleteFSRSCardCommand = {
        cardId: 'test-card-id',
        deleteFromRiff: false
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
      expect(mockStorage.deleteCard).not.toHaveBeenCalled();
      expect(mockStorage.saveCards).not.toHaveBeenCalled();
    });

    it('应该按正确顺序调用方法', async () => {
      // Arrange
      const testCard = createTestCard();
      const command: DeleteFSRSCardCommand = {
        cardId: testCard.id,
        deleteFromRiff: true
      };

      const callOrder: string[] = [];

      vi.mocked(mockStorage.getCard).mockImplementation(() => {
        callOrder.push('getCard');
        return testCard;
      });

      vi.mocked(mockStorage.deleteCard).mockImplementation(() => {
        callOrder.push('deleteCard');
      });

      vi.mocked(mockStorage.saveCards).mockImplementation(async () => {
        callOrder.push('saveCards');
      });

      vi.mocked(removeRiffCards).mockImplementation(async () => {
        callOrder.push('removeRiffCards');
      });

      // Act
      await useCase.execute(command);

      // Assert
      expect(callOrder).toEqual([
        'getCard',
        'deleteCard',
        'saveCards',
        'removeRiffCards'
      ]);
    });

    it('应该正确传递 blockId 给 removeRiffCards', async () => {
      // Arrange
      const testCard = createTestCard();
      testCard.blockId = 'custom-block-id-123';
      
      const command: DeleteFSRSCardCommand = {
        cardId: testCard.id,
        deleteFromRiff: true
      };

      vi.mocked(mockStorage.getCard).mockReturnValue(testCard);
      vi.mocked(removeRiffCards).mockResolvedValue(undefined);

      // Act
      await useCase.execute(command);

      // Assert
      expect(removeRiffCards).toHaveBeenCalledWith(['custom-block-id-123']);
    });
  });
});
